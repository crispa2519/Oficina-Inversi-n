#!/usr/bin/env python3
"""Arma artifact/oficina-3d.html: la oficina 3D como página única para publicar en claude.ai.

Reutiliza el código de la versión con servidor (server/agents.js, server/demo.js,
public/app.js, public/style.css) y reemplaza el backend por llamadas a Claude
hechas desde la página con la cuenta de quien la abre (capacidad `sample`).

Uso:  python3 artifact/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "artifact"


def sub(text: str, old: str, new: str, count_min: int = 1) -> str:
    n = text.count(old)
    if n < count_min:
        raise SystemExit(f"No se encontró el fragmento a reemplazar:\n{old[:120]}")
    return text.replace(old, new)


def strip_exports(js: str) -> str:
    return js.replace("export function ", "function ").replace("export const ", "const ").replace("export async function ", "async function ")


# ---------- agentes (prompts) ----------
agents = strip_exports((ROOT / "server/agents.js").read_text())
WEB_RULE = "- Usá la herramienta de búsqueda web para obtener datos ACTUALES (precios, resultados, métricas, noticias). No inventes cifras: todo número relevante debe provenir de tus búsquedas e indicar su fuente (nombre del medio/sitio) y fecha.\n- Si un dato no se pudo verificar, decilo explícitamente (\"no verificado\")."
agents = sub(agents, WEB_RULE, "${NET.rule}")
agents = sub(agents, "const COMMON_RULES = `", "const commonRules = () => `")
agents = sub(agents, "${COMMON_RULES}", "${commonRules()}")
agents = sub(
    agents,
    "- Podés usar la búsqueda web de forma puntual para verificar un dato crítico o una noticia de último momento.",
    "${NET.manager}",
)
agents = sub(
    agents,
    "; podés usar la búsqueda web de forma puntual para verificar el contexto macro actual.",
    "${NET.director}",
)
agents = sub(agents, "(lista de fuentes con fecha)", "${NET.sources}")
agents = """// Reglas según haya o no acceso a internet (se elige al iniciar cada corrida)
const NET_MODES = {
  web: {
    rule: "- Usá las herramientas de búsqueda web (web_search) y lectura de páginas (web_fetch) para obtener datos ACTUALES: precios, resultados, métricas y noticias. Tenés pocas rondas de herramientas: en cada ronda pedí VARIAS búsquedas a la vez (en paralelo), priorizá fuentes confiables (sitios de las compañías, reguladores, Reuters, Bloomberg, CNBC, Yahoo Finance, CoinGecko, TradingView, etc.) y después escribí el informe completo.\\n- No inventes cifras: todo número relevante debe provenir de tus búsquedas e indicar su fuente (nombre del medio/sitio) y fecha. Si un dato no se pudo verificar, decilo explícitamente (\\"no verificado\\").\\n- Tu respuesta final debe ser solo el informe, empezando por su título con \\"# \\".",
    manager: "- Podés usar la búsqueda web de forma puntual (una sola ronda) para verificar un dato crítico o una noticia de último momento.",
    director: "; podés usar la búsqueda web de forma puntual (una sola ronda) para verificar el contexto macro actual.",
    sources: "(lista de fuentes con fecha)",
  },
  offline: {
    rule: "- No tenés acceso a internet ni a cotizaciones en tiempo real: trabajá con tu conocimiento más reciente. Indicá hasta qué fecha llega tu información y aclará que precios y niveles deben verificarse antes de operar. No inventes cifras: si no estás seguro de un dato, dalo como rango aproximado o marcalo \\"a verificar\\".\\n- Expresá los niveles técnicos (entrada, stop, objetivos) también en términos relativos (% desde el precio de referencia, distancia a la SMA 200, etc.) para que sigan siendo útiles si el precio cambió.",
    manager: "- Marcá qué datos críticos conviene verificar con información en tiempo real antes de ejecutar.",
    director: "; indicá qué indicadores macro deben confirmarse con datos actuales.",
    sources: "(fuentes de referencia y hasta qué fecha llega la información)",
  },
};
let NET = NET_MODES.web;

""" + agents

# ---------- modo simulación ----------
demo = (ROOT / "server/demo.js").read_text()
demo = sub(demo, "import { SECTORS } from './agents.js';\n", "")
demo = strip_exports(demo)
demo = sub(
    demo,
    "Configurá `ANTHROPIC_API_KEY` para análisis en vivo con búsqueda web.",
    "Elegí el modo «Claude» para un análisis real.",
)

orchestrator = (ART / "browser-orchestrator.js").read_text()

# ---------- oficina 3D ----------
app = (ROOT / "public/app.js").read_text()

app = sub(
    app,
    """function download(name, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}""",
    """let downloadsApi = null;
let sampleApi = null;
let mcpApi = null;
let permsApi = null;
let runCtl = null;
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Informe copiado al portapapeles.');
  } catch {
    toast('No se pudo copiar automáticamente: seleccioná el texto del informe y copialo.');
  }
}
async function download(name, text) {
  if (!downloadsApi) return copyText(text);
  try {
    await downloadsApi.save({ filename: name, data: text });
  } catch (e) {
    if (e?.code !== 'declined') toast('No se pudo descargar el archivo. Usá el botón Copiar.');
  }
}""",
)
app = sub(
    app,
    "$('#mPrint').onclick = () => window.print();",
    """$('#mCopy').onclick = () => state.finalReport && copyText(state.finalReport);
$('#pCopy').onclick = () => { const a = state.agents.get(state.selected); if (a?.report) copyText(a.report); };""",
)
app = sub(app, "  $('#pDownload').disabled = !a.report;\n", "  $('#pDownload').disabled = !a.report;\n  $('#pCopy').disabled = !a.report;\n")
app = sub(
    app,
    "toast(e.demo ? 'Análisis iniciado en MODO DEMO (datos simulados).' : 'Análisis en vivo iniciado: los agentes están investigando el mercado.');",
    "toast(e.demo ? 'Simulación iniciada (informes de ejemplo).' : 'Análisis iniciado. Si Claude te pide permiso, aceptalo para que los agentes puedan trabajar.', 7000);",
)
app = sub(
    app,
    """      if (!e.replay) { toast('✅ El Director entregó el informe centralizado.', 6000); openFinal(); }""",
    """      if (!e.replay) { toast('✅ El Director entregó el informe centralizado.', 6000); openFinal(); saveLastRun(); }""",
)

# Reemplaza el servidor (SSE + fetch) por la orquestación local
start = app.index("function connect() {")
end = app.index("// =====================================================================\n//  Bucle de animación")
app = app[:start] + """const STORE_KEY = 'oficina-inversiones:ultima-corrida';
function saveLastRun() {
  try {
    const reports = {};
    for (const [id, a] of state.agents) if (a.report) reports[id] = { report: a.report, state: a.state };
    localStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), demo: state.demo, reports, finalReport: state.finalReport, finalFile: state.finalFile }));
  } catch { /* sin almacenamiento: no pasa nada */ }
}
function restoreLastRun() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { saved = null; }
  if (!saved?.reports) return;
  for (const [id, r] of Object.entries(saved.reports)) {
    const a = state.agents.get(id);
    if (!a) continue;
    a.report = r.report;
    setAgentState(id, r.state === 'error' ? 'error' : 'done');
  }
  for (const s of SECTORS) {
    const md = saved.reports[`${s.id}-manager`]?.report;
    if (md) handleEvent({ type: 'sector-summary', sector: s.id, ...parseManagerSummary(md) });
  }
  if (saved.finalReport) {
    state.finalReport = saved.finalReport;
    state.finalFile = saved.finalFile;
    $('#finalBtn').disabled = false;
  }
  const when = new Date(saved.at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  toast(`Se cargó tu última corrida (${when}${saved.demo ? ', simulación' : ''}).`, 5000);
}

const MODE_NOTES = {
  web: 'Los agentes trabajan con tu cuenta de Claude y buscan datos actualizados en internet con el conector Parallel Search (conectalo una vez en claude.ai → Configuración → Conectores). La primera vez la página te pide permiso. Una corrida completa tarda entre 15 y 30 minutos.',
  offline: 'Los agentes trabajan con tu cuenta de Claude, pero sin internet: razonan con lo que Claude ya sabe. Verificá precios y datos actuales antes de operar.',
  demo: 'Simulación: informes de ejemplo con cifras ficticias, para recorrer la oficina sin consumir uso de Claude.',
};
function updateModeNote() {
  const mode = $('#fMode').value;
  $('#fTier').disabled = mode === 'demo';
  $('#modeNote').textContent = MODE_NOTES[mode];
}
$('#fMode').onchange = updateModeNote;

async function setupCapabilities() {
  const use = (name) => (window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
  [sampleApi, downloadsApi, mcpApi, permsApi] = await Promise.all([use('sample'), use('downloads'), use('mcp'), use('permissions')]);
  const badge = $('#mode');
  if (sampleApi) {
    badge.textContent = 'CLAUDE · TU CUENTA';
    badge.className = 'badge live';
  } else {
    badge.textContent = 'SOLO SIMULACIÓN';
    badge.className = 'badge demo';
    $('#fMode').value = 'demo';
    $('#fMode').querySelectorAll('option:not([value="demo"])').forEach((o) => { o.disabled = true; });
  }
  updateModeNote();
}

$('#runForm').onsubmit = async (ev) => {
  ev.preventDefault();
  if (state.running) return;
  const mode = sampleApi ? $('#fMode').value : 'demo';
  const demo = mode === 'demo';
  const profile = { risk: $('#fRisk').value, horizon: $('#fHorizon').value, notes: $('#fNotes').value.slice(0, 500) };
  let web = null;
  if (mode === 'web') {
    $('#runBtn').disabled = true;
    toast('Conectando con la búsqueda web…', 20000);
    const prep = await prepareWeb({ mcp: mcpApi, perms: permsApi, sample: sampleApi });
    $('#runBtn').disabled = false;
    if (prep.error) { toast(`⚠ ${prep.error}`, 12000); return; }
    web = { mcp: mcpApi, schemas: prep.schemas };
  }
  NET = mode === 'web' ? NET_MODES.web : NET_MODES.offline;
  runCtl = new AbortController();
  handleEvent({ type: 'start', demo, profile });
  try {
    await runOfficeInBrowser({ profile, demo, tier: $('#fTier').value, sample: sampleApi, web, emit: handleEvent, signal: runCtl.signal });
  } catch (e) {
    handleEvent({ type: 'fatal', message: e?.message || String(e) });
    saveLastRun();
  }
};
$('#stopBtn').onclick = () => runCtl?.abort();

""" + app[end:]

app = sub(
    app,
    """  const roster = await (await fetch('/api/roster')).json();""",
    """  const roster = buildRoster();""",
)
app = sub(
    app,
    """  const badge = $('#mode');
  badge.textContent = roster.live ? 'EN VIVO · CLAUDE + WEB' : 'MODO DEMO';
  badge.className = `badge ${roster.live ? 'live' : 'demo'}`;
  if (!roster.live) $('#demoWrap').style.display = 'none';
""",
    "  updateModeNote();\n",
)
app = sub(app, "  connect();\n  animate();", "  animate();\n  restoreLastRun();\n  setupCapabilities();")

# ---------- estilos ----------
style = (ROOT / "public/style.css").read_text()
style = sub(style, ":root {\n", ":root {\n  color-scheme: dark;\n")
style = sub(style, "#topbar {\n  position: fixed; top: 12px;", "#topbar {\n  position: fixed; top: calc(12px + env(safe-area-inset-top, 0px));")
style = sub(style, "top: 170px;", "top: calc(200px + env(safe-area-inset-top, 0px));", count_min=2)
style += """
.note { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4; }
select:disabled { opacity: .5; }
@media (max-width: 900px) {
  #topbar { max-height: 55vh; overflow: auto; }
  .note { display: none; }
}
"""

script = "\n\n".join([agents, demo, orchestrator, app])
shell = (ART / "shell.html").read_text()
html = shell.replace("/*{{STYLE}}*/", style).replace("/*{{SCRIPT}}*/", script)
out = ART / "oficina-3d.html"
out.write_text(html)
print(f"OK -> {out.relative_to(ROOT)} ({len(html)//1024} KB)")
