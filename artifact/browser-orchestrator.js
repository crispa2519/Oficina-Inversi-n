// =====================================================================
//  Orquestación en el navegador (versión web publicada en claude.ai)
//  Cada agente es una llamada a Claude con la cuenta de quien abre la página.
// =====================================================================
const CONCURRENCY = 2; // la plataforma atiende pocas llamadas a la vez por persona

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

function parseManagerSummary(md) {
  const conv = md.match(/Convicci[oó]n del rubro:\**\s*(\d{1,2})\s*\/\s*10/i);
  const rec = md.match(/Recomendaci[oó]n sectorial:\**\s*(SOBREPONDERAR|NEUTRAL|SUBPONDERAR)/i);
  return { conviction: conv ? Math.min(10, Number(conv[1])) : null, recommendation: rec ? rec[1].toUpperCase() : null };
}

const SAMPLE_ERRORS = {
  rate_limited: 'Claude está recibiendo demasiados pedidos o llegaste a tu límite de uso. Probá de nuevo en un rato.',
  refused: 'Claude no quiso responder este pedido.',
  empty_completion: 'Claude no devolvió texto.',
  prompt_too_large: 'El pedido es demasiado largo.',
  session_expired: 'Tu sesión expiró: volvé a iniciar sesión en claude.ai.',
  upstream_error: 'Falló la conexión con Claude. Probá de nuevo.',
};

class FatalError extends Error {}

// ---------------------------------------------------------------------
//  Internet: búsqueda web a través del conector "Parallel Search" del usuario
// ---------------------------------------------------------------------
const WEB_SERVER = 'Parallel Search';
const WEB_TOOLS = ['web_search', 'web_fetch'];
const TOOL_RESULT_MAX = 12000;

function shrinkSchema(schema) {
  // Las herramientas de la página admiten esquemas de hasta 4 KB: quitamos descripciones si hace falta.
  if (JSON.stringify(schema).length <= 4000) return schema;
  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (k !== 'description' && k !== 'examples') o[k] = strip(x);
      return o;
    }
    return v;
  };
  const s = strip(schema);
  return JSON.stringify(s).length <= 4000 ? s : null;
}

/** Prepara el acceso a internet. Devuelve {schemas} o {error} con un mensaje para la persona. */
async function prepareWeb({ mcp, perms, sample }) {
  if (!mcp) return { error: 'Esta vista no puede usar conectores. Abrí la oficina en claude.ai desde el navegador.' };
  const limits = await sample.limits().catch(() => null);
  if (!limits?.tools) return { error: 'Esta vista de Claude no permite que los agentes usen herramientas. Abrí la oficina en claude.ai desde el navegador.' };
  const listed = await mcp.listTools(WEB_SERVER).catch(() => null);
  if (!listed?.servers?.length) {
    return { error: `Falta conectar "${WEB_SERVER}". Agregalo en claude.ai → Configuración → Conectores (es gratis) y volvé a intentar.` };
  }
  if (perms) {
    const st = await perms.request([`mcp:${WEB_SERVER}`]).catch(() => ({}));
    if (st[`mcp:${WEB_SERVER}`] === 'denied') return { error: `No se dio permiso para usar "${WEB_SERVER}" desde esta página.` };
  }
  const schemas = [];
  for (const name of WEB_TOOLS) {
    const d = await mcp.describeTool(WEB_SERVER, name).catch(() => null);
    const inputSchema = d && shrinkSchema(d.inputSchema);
    if (d && inputSchema) schemas.push({ name, description: String(d.description || name).slice(0, 1000), inputSchema });
  }
  if (!schemas.some((t) => t.name === 'web_search')) {
    return { error: `No se pudo usar la búsqueda de "${WEB_SERVER}". Revisá que el conector esté activo y que hayas dado permiso a la página.` };
  }
  return { schemas };
}

function describeInput(input) {
  const v = Object.values(input || {}).find((x) => typeof x === 'string' || Array.isArray(x));
  return (Array.isArray(v) ? v.join(' · ') : String(v ?? JSON.stringify(input))).slice(0, 140);
}

function buildWebTools(web, onEvent) {
  return web.schemas.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    async execute(input, ctx) {
      onEvent({ kind: 'search', query: (t.name === 'web_fetch' ? '📄 ' : '') + describeInput(input) });
      try {
        const r = await web.mcp.callTool(WEB_SERVER, t.name, input, { signal: ctx.signal, cache: false });
        const out = typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload ?? r.content);
        return out.length > TOOL_RESULT_MAX ? out.slice(0, TOOL_RESULT_MAX) + '\n[resultado recortado]' : out;
      } catch (e) {
        throw new Error(e?.message || e?.code || 'falló la búsqueda');
      }
    },
  }));
}

async function callClaude(sample, prompt, { tier, signal, onEvent, web }) {
  let last = 0;
  try {
    const { text, truncated } = await sample(prompt, {
      modelTier: tier,
      signal,
      cache: false,
      ...(web ? { tools: buildWebTools(web, onEvent) } : {}),
      onText: ({ text }) => {
        if (Date.now() - last < 1500) return;
        last = Date.now();
        onEvent({ kind: 'text', chars: text.length });
      },
    });
    if (truncated) onEvent({ kind: 'info', message: 'El informe se cortó por límite de extensión.' });
    // Con herramientas, la respuesta trae el texto de cada ronda: el informe es la última parte.
    const parts = text.split(/\n\n(?=#\s)/);
    const idx = parts.findIndex((p) => /^#\s/.test(p));
    const markdown = (idx > 0 ? parts.slice(idx).join('\n\n') : text).trim();
    return { markdown, usage: null };
  } catch (e) {
    const code = e?.code;
    if (code === 'cancelled') throw new FatalError('Análisis detenido.');
    if (code === 'tools_unavailable') throw new FatalError('Esta vista de Claude no permite búsquedas web. Elegí el modo "Claude (sin internet)".');
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
      throw new FatalError('No se dio permiso para usar Claude desde esta página. Podés usar el modo Simulación.');
    }
    throw new Error(SAMPLE_ERRORS[code] || SAMPLE_ERRORS.upstream_error);
  }
}

async function runOfficeInBrowser({ profile, demo, tier, sample, web, emit, signal }) {
  const status = (agentId, st, message = '') => emit({ type: 'status', agentId, state: st, message });
  const limit = limiter(demo ? 4 : CONCURRENCY);

  async function execute(agentId, prompt, demoFn, agentTier) {
    if (signal.aborted) throw new FatalError('Análisis detenido.');
    status(agentId, 'working', 'Analizando…');
    try {
      const onEvent = (e) => emit({ type: 'activity', agentId, ...e });
      const result = demo ? await demoFn(onEvent, signal) : await callClaude(sample, prompt, { tier: agentTier, signal, onEvent, web });
      emit({ type: 'report', agentId, markdown: result.markdown, usage: null });
      status(agentId, 'done', 'Informe entregado');
      return result.markdown;
    } catch (err) {
      if (err instanceof FatalError || signal.aborted) {
        status(agentId, 'error', err.message);
        throw err instanceof FatalError ? err : new FatalError('Análisis detenido.');
      }
      status(agentId, 'error', err.message);
      const fallback = `# Informe no disponible\n\nEl agente \`${agentId}\` falló: ${err.message}`;
      emit({ type: 'report', agentId, markdown: fallback, usage: null });
      return fallback;
    }
  }

  const managerReports = {};
  await Promise.all(
    SECTORS.map(async (sector) => {
      const [fund, tech] = await Promise.all(
        ['fundamental', 'technical'].map((kind) => {
          const id = `${sector.id}-${kind}`;
          status(id, 'queued', 'En espera');
          return limit(() =>
            execute(
              id,
              analystSystemPrompt(sector, kind) + '\n\n---\n\n' + analystUserPrompt(sector, kind, profile),
              (onEv, sig) => demoAnalyst(sector, kind, profile, onEv, sig),
              tier,
            ),
          );
        }),
      );
      emit({ type: 'handoff', from: [`${sector.id}-fundamental`, `${sector.id}-technical`], to: `${sector.id}-manager` });
      status(`${sector.id}-manager`, 'queued', 'Esperando turno');
      const md = await limit(() =>
        execute(
          `${sector.id}-manager`,
          managerSystemPrompt(sector) + '\n\n---\n\n' + managerUserPrompt(sector, profile, fund, tech),
          (onEv, sig) => demoManager(sector, profile, onEv, sig),
          tier,
        ),
      );
      managerReports[sector.id] = md;
      emit({ type: 'sector-summary', sector: sector.id, ...parseManagerSummary(md) });
    }),
  );

  emit({ type: 'handoff', from: SECTORS.map((s) => `${s.id}-manager`), to: 'director' });
  await execute(
    'director',
    directorSystemPrompt() + '\n\n---\n\n' + directorUserPrompt(profile, managerReports),
    (onEv, sig) => demoDirector(profile, managerReports, onEv, sig),
    'complex',
  );
  emit({ type: 'complete', file: `informe-director-${new Date().toISOString().slice(0, 10)}.md`, demo });
}
