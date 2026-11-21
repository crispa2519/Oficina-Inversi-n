import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildRoster } from './agents.js';
import { runOffice } from './orchestrator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(here, '..', 'public')));
// Librerías del frontend servidas localmente (sin depender de CDNs)
const nm = path.join(here, '..', 'node_modules');
app.use('/vendor/three', express.static(path.join(nm, 'three')));
app.use('/vendor/marked', express.static(path.join(nm, 'marked')));
app.use('/vendor/dompurify', express.static(path.join(nm, 'dompurify', 'dist')));

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// Estado de la corrida actual (una a la vez); los eventos se re-envían a clientes que se conectan tarde.
let run = null; // { id, running, demo, profile, history: [], controller }
const clients = new Set();

function broadcast(evt) {
  const payload = { ...evt, t: Date.now() };
  if (run) run.history.push(payload);
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(line);
}

app.get('/api/roster', (_req, res) => {
  res.json({ ...buildRoster(), live: hasKey });
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'hello', running: Boolean(run?.running), runId: run?.id ?? null })}\n\n`);
  if (run) for (const e of run.history) res.write(`data: ${JSON.stringify({ ...e, replay: true })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

app.post('/api/run', (req, res) => {
  if (run?.running) return res.status(409).json({ error: 'Ya hay un análisis en curso.' });
  const profile = {
    risk: String(req.body?.profile?.risk || 'moderado').slice(0, 40),
    horizon: String(req.body?.profile?.horizon || 'mediano plazo (6-18 meses)').slice(0, 60),
    notes: String(req.body?.profile?.notes || '').slice(0, 500),
  };
  const demo = !hasKey || Boolean(req.body?.demo);
  const controller = new AbortController();
  run = { id: Date.now().toString(36), running: true, demo, profile, history: [], controller };
  broadcast({ type: 'start', runId: run.id, demo, profile });

  runOffice({ profile, demo, emit: broadcast, signal: controller.signal })
    .catch((err) => broadcast({ type: 'fatal', message: controller.signal.aborted ? 'Análisis detenido.' : err?.message || String(err) }))
    .finally(() => {
      if (run) run.running = false;
    });

  res.json({ ok: true, runId: run.id, demo });
});

app.post('/api/stop', (_req, res) => {
  if (run?.running) run.controller.abort();
  res.json({ ok: true });
});

app.get('/api/reports', async (_req, res) => {
  const dir = path.join(here, '..', 'reports');
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.startsWith('informe-director-')).sort().reverse();
  res.json(files);
});

app.get('/api/reports/:file', async (req, res) => {
  const file = path.basename(req.params.file);
  if (!/^informe-director-[\w-]+\.md$/.test(file)) return res.status(400).end();
  res.download(path.join(here, '..', 'reports', file));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`🏢 Oficina de Inversiones en http://localhost:${port}`);
  console.log(hasKey ? '✅ Modo EN VIVO (Claude + búsqueda web)' : '⚠️  Sin ANTHROPIC_API_KEY: modo DEMO con datos simulados');
});
