import { clandent } from './clandent.js';
import { surdent } from './surdent.js';
import { parseSites } from './schema.js';
import type { Site } from './schema.js';

// Punto de entrada único de la configuración. La validación corre ACÁ, en el
// import: cualquier suite, el generador de projects de playwright.config.ts y el
// script de alertas pasan por esta línea. Config rota = todo explota de inmediato
// con el campo exacto, en vez de un monitor que corre a medias y reporta verde.
export const sites: Site[] = parseSites([clandent, surdent]);

export function getSite(name: string): Site {
  const site = sites.find((s) => s.name === name);
  if (!site) {
    throw new Error(
      `sitio "${name}" no configurado. Disponibles: ${sites.map((s) => s.name).join(', ')}`
    );
  }
  return site;
}

export * from './schema.js';
