// Orquestación jerárquica: analistas (12) -> gerentes (6) -> director (1).
// Cada gerente arranca apenas terminan sus dos analistas; el director cuando terminan los 6 gerentes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  SECTORS,
  analystSystemPrompt,
  analystUserPrompt,
  managerSystemPrompt,
  managerUserPrompt,
  directorSystemPrompt,
  directorUserPrompt,
} from './agents.js';
import { runAgent } from './llm.js';
import { demoAnalyst, demoManager, demoDirector } from './demo.js';

const env = (k, d) => process.env[k] || d;

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

export function parseManagerSummary(md) {
  const conv = md.match(/Convicci[oó]n del rubro:\**\s*(\d{1,2})\s*\/\s*10/i);
  const rec = md.match(/Recomendaci[oó]n sectorial:\**\s*(SOBREPONDERAR|NEUTRAL|SUBPONDERAR)/i);
  return {
    conviction: conv ? Math.min(10, Number(conv[1])) : null,
    recommendation: rec ? rec[1].toUpperCase() : null,
  };
}

/**
 * @param {object} opts
 * @param {object} opts.profile
 * @param {boolean} opts.demo
 * @param {(evt:object)=>void} opts.emit
 * @param {AbortSignal} opts.signal
 */
export async function runOffice({ profile, demo, emit, signal }) {
  const startedAt = new Date();
  const reports = {};
  const status = (agentId, state, message = '') => emit({ type: 'status', agentId, state, message });

  const cfg = {
    analyst: { model: env('MODEL_ANALYST', 'claude-opus-5-5'), effort: env('EFFORT_ANALYST', 'high'), searches: Number(env('MAX_SEARCHES_PER_ANALYST', 8)) },
    manager: { model: env('MODEL_MANAGER', 'claude-opus-5-5'), effort: env('EFFORT_MANAGER', 'high'), searches: 3 },
    director: { model: env('MODEL_DIRECTOR', 'claude-opus-5-5'), effort: env('EFFORT_DIRECTOR', 'xhigh'), searches: 4 },
  };
  const limit = limiter(Number(env('CONCURRENCY', 4)));

  async function execute(agentId, level, system, user, demoFn) {
    status(agentId, 'working', 'Analizando…');
    let lastText = 0;
    try {
      let result;
      if (demo) {
        result = await demoFn((e) => emit({ type: 'activity', agentId, ...e }), signal);
      } else {
        result = await runAgent({
          model: cfg[level].model,
          effort: cfg[level].effort,
          maxSearches: cfg[level].searches,
          system,
          user,
          signal,
          onEvent: (e) => {
            if (e.kind === 'text') {
              if (Date.now() - lastText < 1500) return;
              lastText = Date.now();
            }
            emit({ type: 'activity', agentId, ...e });
          },
        });
      }
      reports[agentId] = result.markdown;
      emit({ type: 'report', agentId, markdown: result.markdown, usage: result.usage ?? null });
      status(agentId, 'done', 'Informe entregado');
      return result.markdown;
    } catch (err) {
      if (signal?.aborted) throw err;
      const message = err?.message || String(err);
      status(agentId, 'error', message);
      const fallback = `# Informe no disponible\n\nEl agente \`${agentId}\` falló: ${message}`;
      reports[agentId] = fallback;
      return fallback;
    }
  }

  const managerReports = {};

  await Promise.all(
    SECTORS.map(async (sector) => {
      const kinds = ['fundamental', 'technical'];
      const [fund, tech] = await Promise.all(
        kinds.map((kind) => {
          const id = `${sector.id}-${kind}`;
          status(id, 'queued', 'En espera');
          return limit(() =>
            execute(
              id,
              'analyst',
              analystSystemPrompt(sector, kind),
              analystUserPrompt(sector, kind, profile),
              (onEv, sig) => demoAnalyst(sector, kind, profile, onEv, sig),
            ),
          );
        }),
      );
      emit({ type: 'handoff', from: [`${sector.id}-fundamental`, `${sector.id}-technical`], to: `${sector.id}-manager` });
      const mid = `${sector.id}-manager`;
      const md = await limit(() =>
        execute(
          mid,
          'manager',
          managerSystemPrompt(sector),
          managerUserPrompt(sector, profile, fund, tech),
          (onEv, sig) => demoManager(sector, profile, onEv, sig),
        ),
      );
      managerReports[sector.id] = md;
      emit({ type: 'sector-summary', sector: sector.id, ...parseManagerSummary(md) });
    }),
  );

  emit({ type: 'handoff', from: SECTORS.map((s) => `${s.id}-manager`), to: 'director' });
  const final = await execute(
    'director',
    'director',
    directorSystemPrompt(),
    directorUserPrompt(profile, managerReports),
    (onEv, sig) => demoDirector(profile, managerReports, onEv, sig),
  );

  // Persistimos la corrida
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve('reports');
  await fs.mkdir(dir, { recursive: true });
  const finalFile = path.join(dir, `informe-director-${stamp}.md`);
  await fs.writeFile(finalFile, final, 'utf8');
  await fs.writeFile(
    path.join(dir, `corrida-${stamp}.json`),
    JSON.stringify({ startedAt, finishedAt: new Date(), demo, profile, reports }, null, 2),
    'utf8',
  );
  emit({ type: 'complete', file: path.basename(finalFile), demo });
  return { reports, final };
}

