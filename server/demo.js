// MODO DEMO: genera informes SIMULADOS para recorrer la oficina sin clave de API.
// Ningún número de este archivo es real: los activos son ejemplos y las cifras son ilustrativas.
import { SECTORS } from './agents.js';

const DEMO_ASSETS = {
  crypto: [['Bitcoin', 'BTC'], ['Ethereum', 'ETH'], ['Solana', 'SOL'], ['Chainlink', 'LINK']],
  tech: [['NVIDIA', 'NVDA'], ['Microsoft', 'MSFT'], ['Taiwan Semiconductor', 'TSM'], ['CrowdStrike', 'CRWD']],
  consumer: [['Procter & Gamble', 'PG'], ['Coca-Cola', 'KO'], ['Costco', 'COST'], ['Mondelez', 'MDLZ']],
  commodities: [['Oro (SPDR Gold)', 'GLD'], ['Cobre (Freeport-McMoRan)', 'FCX'], ['Uranio (Cameco)', 'CCJ'], ['Petróleo (Exxon Mobil)', 'XOM']],
  health: [['Eli Lilly', 'LLY'], ['UnitedHealth', 'UNH'], ['Intuitive Surgical', 'ISRG'], ['Vertex Pharmaceuticals', 'VRTX']],
  financial: [['JPMorgan Chase', 'JPM'], ['Visa', 'V'], ['Goldman Sachs', 'GS'], ['Interactive Brokers', 'IBKR']],
};

const DEMO_QUERIES = {
  fundamental: ['resultados último trimestre', 'valuación múltiplos sector', 'guía anual compañía', 'revisiones estimaciones analistas', 'noticias regulatorias'],
  technical: ['gráfico diario tendencia', 'RSI MACD semanal', 'soportes resistencias clave', 'fuerza relativa vs S&P 500', 'volumen acumulación'],
};

const BANNER = '> ⚠️ **MODO DEMO — INFORME SIMULADO.** Cifras ilustrativas, no son datos de mercado reales. Configurá `ANTHROPIC_API_KEY` para análisis en vivo con búsqueda web.\n';

function seeded(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const sleep = (ms, signal) =>
  new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      rej(new Error('aborted'));
    });
  });

async function fakeWork(onEvent, signal, queries, rnd) {
  for (const q of queries) {
    await sleep(700 + rnd() * 1400, signal);
    onEvent({ kind: 'search', query: q });
  }
  await sleep(900 + rnd() * 1500, signal);
}

const conv = (r) => (r > 0.66 ? 'Alta' : r > 0.33 ? 'Media' : 'Baja');

export async function demoAnalyst(sector, kind, profile, onEvent, signal) {
  const rnd = seeded(sector.id + kind);
  const assets = DEMO_ASSETS[sector.id];
  await fakeWork(onEvent, signal, DEMO_QUERIES[kind].map((q) => `${sector.name}: ${q}`), rnd);
  const role = kind === 'fundamental' ? 'Analista Fundamental Senior' : 'Analista Técnico Senior (CMT)';
  const ideas = assets
    .slice(0, 3)
    .map(([name, tk], i) => {
      const price = Math.round(50 + rnd() * 400);
      if (kind === 'fundamental') {
        const up = Math.round(12 + rnd() * 30);
        return `### ${i + 1}. ${name} (${tk})
- **Tesis de inversión:** calidad de negocio superior al promedio del rubro con valuación por debajo de su media histórica (ejemplo ilustrativo).
- **Métricas clave (simuladas):**

| Métrica | Valor | Media 5 años |
|---|---|---|
| P/E forward | ${(14 + rnd() * 20).toFixed(1)}x | ${(18 + rnd() * 15).toFixed(1)}x |
| Crec. ingresos YoY | ${(4 + rnd() * 25).toFixed(1)}% | ${(5 + rnd() * 12).toFixed(1)}% |
| Margen FCF | ${(10 + rnd() * 25).toFixed(1)}% | — |

- **Catalizadores:** próximos resultados trimestrales, expansión de márgenes.
- **Precio objetivo:** $${Math.round(price * (1 + up / 100))} (DCF + múltiplos) — upside ~${up}%.
- **Riesgos:** desaceleración macro, compresión de múltiplos.
- **Convicción:** ${conv(rnd())}`;
      }
      const stop = Math.round(price * (0.9 - rnd() * 0.05));
      const t1 = Math.round(price * (1.1 + rnd() * 0.08));
      return `### ${i + 1}. ${name} (${tk})
- **Precio (simulado):** $${price} — tendencia diaria alcista, semanal lateral-alcista.
- **Señales:** precio sobre SMA 50 y SMA 200, RSI(14) en ${Math.round(48 + rnd() * 15)}, MACD cruzando al alza.
- **Entrada:** $${Math.round(price * 0.97)}–$${price} · **Stop:** $${stop} · **Objetivos:** $${t1} / $${Math.round(t1 * 1.08)} · **R/B:** ${(1.8 + rnd() * 1.5).toFixed(1)}
- **Invalidación:** cierre diario debajo de $${stop}.
- **Convicción:** ${conv(rnd())}`;
    })
    .join('\n\n');

  const markdown = `${BANNER}
# ${role} — ${sector.name}
## Resumen ejecutivo
- Lectura ${kind === 'fundamental' ? 'fundamental' : 'técnica'} del rubro: constructiva con selectividad (simulado).
- Se identifican 3 oportunidades con asimetría favorable.
- Perfil aplicado: riesgo ${profile.risk || 'moderado'}, horizonte ${profile.horizon || 'mediano plazo'}.
## Oportunidades de compra
${ideas}
## Activos a vigilar
- ${assets[3][0]} (${assets[3][1]}): esperar mejor punto de entrada.
## Riesgos del rubro
- Volatilidad macro, cambios regulatorios, sorpresas en resultados.
## Fuentes consultadas
- (Modo demo: sin fuentes reales)`;
  return { markdown, usage: null };
}

export async function demoManager(sector, profile, onEvent, signal) {
  const rnd = seeded(sector.id + 'mgr');
  await fakeWork(onEvent, signal, [`${sector.name}: verificación de datos críticos`], rnd);
  const c = 4 + Math.floor(rnd() * 6);
  const rec = c >= 7 ? 'SOBREPONDERAR' : c >= 5 ? 'NEUTRAL' : 'SUBPONDERAR';
  const assets = DEMO_ASSETS[sector.id];
  const markdown = `${BANNER}
# Informe Gerencial — ${sector.name}
## Visión del rubro
**Recomendación sectorial:** ${rec}
**Convicción del rubro:** ${c}/10

Fundamentales y técnicos coinciden parcialmente; se priorizan los activos con convergencia (simulado).
## Matriz de convergencia
| Activo | Ticker | Visión fundamental | Visión técnica | Convergencia | Convicción |
|---|---|---|---|---|---|
${assets
  .slice(0, 3)
  .map(([n, t]) => `| ${n} | ${t} | Alcista | ${rnd() > 0.4 ? 'Alcista' : 'Neutral'} | ${rnd() > 0.4 ? 'Alta' : 'Media'} | ${conv(rnd())} |`)
  .join('\n')}
## Oportunidades priorizadas (top 3)
${assets
  .slice(0, 3)
  .map(([n, t], i) => `${i + 1}. **${n} (${t})** — entrada escalonada en 2 tramos; tamaño sugerido ${Math.round(20 + rnd() * 20)}% del capital del rubro.`)
  .join('\n')}
## Divergencias y alertas
- ${assets[3][0]}: fundamental positivo pero técnico débil → esperar confirmación.
## Escenarios
| Escenario | Prob. | Impacto |
|---|---|---|
| Base | 55% | Retornos moderados |
| Alcista | 25% | Expansión de múltiplos |
| Bajista | 20% | Corrección del rubro |`;
  return { markdown, usage: null };
}

export async function demoDirector(profile, managerReports, onEvent, signal) {
  const rnd = seeded('director');
  await fakeWork(onEvent, signal, ['contexto macro: tasas Fed', 'inflación y dólar', 'liquidez global'], rnd);
  const rows = [];
  let i = 1;
  for (const s of SECTORS) {
    for (const [n, t] of DEMO_ASSETS[s.id].slice(0, 2)) {
      if (rows.length >= 10) break;
      rows.push(`| ${i++} | ${n} | ${t} | ${s.name} | Convergente | Escalonada | -8% | +${Math.round(15 + rnd() * 25)}% | +${Math.round(15 + rnd() * 25)}% | ${(1.8 + rnd() * 1.4).toFixed(1)} | 6-12m | ${conv(rnd())} |`);
    }
  }
  const sectorRows = SECTORS.map((s) => {
    const md = managerReports[s.id] || '';
    const c = md.match(/Convicci[oó]n del rubro:\**\s*(\d+)/i)?.[1] ?? '—';
    const r = md.match(/Recomendaci[oó]n sectorial:\**\s*(\w+)/i)?.[1] ?? '—';
    return `| ${s.name} | ${r} | ${c} | Tesis simulada del rubro | Riesgo simulado |`;
  }).join('\n');
  const markdown = `${BANNER}
# Informe del Director de Inversiones — Oportunidades de Compra
**Fecha:** ${new Date().toLocaleDateString('es-AR')} | **Perfil:** ${profile.risk || 'moderado'} | **Horizonte:** ${profile.horizon || 'mediano plazo'}
## 1. Resumen ejecutivo
- Postura general: **neutral con sesgo constructivo** (simulado).
- Se priorizan activos con convergencia técnico-fundamental.
- Diversificación entre rubros defensivos y de crecimiento.
## 2. Contexto macro y de mercado
Escenario ilustrativo: inflación en descenso gradual, tasas estables, dólar lateral.
## 3. Mapa sectorial
| Rubro | Recomendación | Convicción (1-10) | Tesis en una línea | Principal riesgo |
|---|---|---|---|---|
${sectorRows}
## 4. Top 10 oportunidades de compra de la firma
| # | Activo | Ticker | Rubro | Tipo de tesis | Zona de entrada | Stop | Objetivo | Upside | R/B | Horizonte | Convicción |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
## 5. Cartera modelo sugerida
| Rubro | Peso |
|---|---|
| Tecnología | 22% |
| Salud | 16% |
| Financiero | 15% |
| Consumo Masivo | 14% |
| Commodities | 13% |
| Criptomonedas | 5% |
| Liquidez / coberturas | 15% |
## 6. Plan de ejecución
Entradas en 3 tramos, rebalanceo mensual.
## 7. Gestión de riesgos
Stops por ATR, límite de 6% por posición individual.
## Aviso legal
Informe SIMULADO generado en modo demo. No constituye asesoramiento financiero.`;
  return { markdown, usage: null };
}
