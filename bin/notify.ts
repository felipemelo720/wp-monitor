#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Lee el reporte JSON de Playwright y avisa: push a Uptime Kuma, correo si falla.
// Se llama desde bin/check.sh, después de la corrida — nunca importa nada de
// sites/ ni toca red del sitio, solo lee un archivo y hace dos llamadas HTTP.
//
// El motivo de existir: en v1 la alerta era `tail -c 300` del log crudo de
// `playwright test --reporter=list`. Con 4 workers en paralelo esas 300 bytes
// eran casi siempre la salida de OTRO test que terminó al mismo tiempo — el
// correo casi nunca decía cuál ruta se rompió. Acá se arma a mano con el nombre
// del test y el primer renglón del error de cada falla.

interface JsonReportError {
  message?: string;
}
interface JsonReportResult {
  status: 'passed' | 'failed' | 'timedOut' | 'interrupted' | 'skipped';
  error?: JsonReportError;
  errors?: JsonReportError[];
}
interface JsonReportTest {
  results: JsonReportResult[];
}
interface JsonReportSpec {
  title: string;
  tests: JsonReportTest[];
}
interface JsonReportSuite {
  title: string;
  suites?: JsonReportSuite[];
  specs?: JsonReportSpec[];
}
interface JsonReport {
  suites: JsonReportSuite[];
  stats: { expected: number; unexpected: number; skipped: number; flaky: number };
}

interface Failure {
  path: string; // "clandent › smoke.spec.ts › /tienda/ responde y renderiza"
  message: string; // primer renglón del error
}

function collectFailures(report: JsonReport): Failure[] {
  const failures: Failure[] = [];

  const walk = (suite: JsonReportSuite, trail: string[]) => {
    const here = [...trail, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        // El último resultado es el que cuenta: con retries=1, un fallo seguido
        // de un passed es flaky (no se reporta), no una rotura.
        const last = test.results.at(-1);
        if (!last || last.status === 'passed' || last.status === 'skipped') continue;

        const rawError = last.error?.message ?? last.errors?.[0]?.message ?? last.status;
        const message = rawError.split('\n')[0]?.trim() ?? last.status;
        failures.push({ path: [...here, spec.title].join(' › '), message });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };

  for (const suite of report.suites) walk(suite, []);
  return failures;
}

function formatMessage(failures: Failure[]): string {
  if (failures.length === 0) return 'OK';
  const lines = failures.slice(0, 8).map((f) => `${f.path}: ${f.message}`);
  const rest = failures.length > 8 ? `\n… y ${failures.length - 8} más` : '';
  return lines.join('\n') + rest;
}

function formatHtml(failures: Failure[], site: string): string {
  const rows = failures
    .map(
      (f) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd"><code>${escapeHtml(f.path)}</code></td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #ddd;color:#b00">${escapeHtml(f.message)}</td></tr>`
    )
    .join('\n');
  return `<p>El monitor E2E de WordPress encontró ${failures.length} fallo(s)${site ? ` (${site})` : ''}:</p>
<table style="border-collapse:collapse;font-family:monospace;font-size:13px">${rows}</table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function main(): void {
  const reportPath = process.env.REPORT_PATH ?? 'reports/last.json';
  const site = process.env.SITE ?? '';
  const kumaPush = process.env.KUMA_PUSH;
  const mailTo = process.env.MAIL_TO;
  const mailFrom =
    process.env.MAIL_FROM ?? 'Claude Code (Mariano) <claudecode-mmelo@updates.tecnologicachile.cl>';

  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as JsonReport;
  const failures = collectFailures(report);
  const ok = failures.length === 0;
  const msg = formatMessage(failures);

  console.log(ok ? `OK (${report.stats.expected} tests)` : `FALLÓ:\n${msg}`);

  if (kumaPush) {
    const url = ok
      ? `${kumaPush}?status=up&msg=OK`
      : `${kumaPush}?status=down&${new URLSearchParams({ msg: msg.slice(0, 500) })}`;
    try {
      execFileSync('curl', ['-fsS', url, '-o', '/dev/null']);
    } catch (error) {
      console.error(`notify: push a Kuma falló: ${(error as Error).message}`);
    }
  }

  if (!ok && mailTo) {
    const subject = `WP monitor: fallaron tests E2E${site ? ` (${site})` : ''}`;
    try {
      execFileSync('resend', [
        'emails',
        'send',
        '--from',
        mailFrom,
        '--to',
        mailTo,
        '--subject',
        subject,
        '--html',
        formatHtml(failures, site),
      ]);
    } catch (error) {
      console.error(`notify: envío de correo falló: ${(error as Error).message}`);
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
