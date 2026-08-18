import tls from 'node:tls';
import { expect } from '@playwright/test';

/**
 * Días que le quedan al certificado.
 *
 * El hueco que tapa: con `ignoreHTTPSErrors: false` el monitor detecta un
 * certificado vencido… el día que vence, cuando el sitio ya está mostrando la
 * pantalla roja del navegador y no vende. Un Let's Encrypt que dejó de renovarse
 * no da ninguna señal hasta ese momento. Avisar con dos semanas convierte una
 * urgencia de domingo en un ticket de lunes.
 *
 * Se usa node:tls y no el navegador porque el dato está en el handshake, es
 * barato, y no depende de que la página cargue.
 */
export function certDaysRemaining(host: string, timeoutMs = 10_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, timeout: timeoutMs },
      () => {
        // true: sigue la cadena hasta la raíz. El certificado del sitio es el
        // primero, y es el único que caduca solo.
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          reject(new Error(`${host}: el servidor no entregó certificado`));
          return;
        }
        const remaining = (Date.parse(cert.valid_to) - Date.now()) / 86_400_000;
        resolve(Math.floor(remaining));
      }
    );

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`${host}: timeout en el handshake TLS (${timeoutMs}ms)`));
    });
    socket.on('error', reject);
  });
}

/**
 * 14 días de umbral: cubre un fin de semana largo y deja margen para que el cron
 * de renovación reintente varias veces antes de que alguien tenga que mirarlo.
 */
export async function expectCertNotExpiringSoon(baseURL: string, minDays = 14): Promise<void> {
  const host = new URL(baseURL).hostname;
  const days = await certDaysRemaining(host);

  expect(days, `${host}: el certificado TLS vence en ${days} días`).toBeGreaterThan(minDays);
}
