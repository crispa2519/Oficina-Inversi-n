// Llamada a Claude con búsqueda web, streaming, reanudación de pause_turn y fallback ante rechazos.
import Anthropic from '@anthropic-ai/sdk';

let client = null;
export function getClient() {
  if (!client) client = new Anthropic({ maxRetries: 4 });
  return client;
}

export const WEB_SEARCH_TOOL = process.env.WEB_SEARCH_TOOL || 'web_search_20260209';
const MAX_CONTINUATIONS = 6;

/**
 * Ejecuta un agente y devuelve su informe en Markdown.
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.effort
 * @param {string} opts.system
 * @param {string} opts.user
 * @param {number} opts.maxSearches   0 desactiva la búsqueda web
 * @param {(e:object)=>void} opts.onEvent  eventos de progreso: {kind:'search'|'text'|'info', ...}
 * @param {AbortSignal} [opts.signal]
 */
export async function runAgent({ model, effort, system, user, maxSearches, onEvent = () => {}, signal }) {
  const anthropic = getClient();
  const tools = maxSearches > 0 ? [{ type: WEB_SEARCH_TOOL, name: 'web_search', max_uses: maxSearches }] : [];

  const messages = [{ role: 'user', content: user }];
  const allBlocks = [];
  let usage = { input_tokens: 0, output_tokens: 0, searches: 0 };

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = anthropic.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        // Si el modelo rechaza la solicitud, el servidor reintenta con un modelo de respaldo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      },
      { signal },
    );

    let chars = 0;
    stream.on('text', (delta) => {
      chars += delta.length;
      onEvent({ kind: 'text', chars });
    });
    stream.on('contentBlock', (block) => {
      if (block.type === 'server_tool_use' && block.name === 'web_search') {
        usage.searches++;
        onEvent({ kind: 'search', query: block.input?.query ?? '' });
      }
    });

    const msg = await stream.finalMessage();
    usage.input_tokens += msg.usage?.input_tokens ?? 0;
    usage.output_tokens += msg.usage?.output_tokens ?? 0;

    if (msg.stop_reason === 'refusal') {
      throw new Error('El modelo rechazó la solicitud (refusal).');
    }

    allBlocks.push(...msg.content);

    if (msg.stop_reason === 'pause_turn') {
      // El bucle de herramientas del servidor se pausó: reenviamos para que continúe.
      onEvent({ kind: 'info', message: 'Continuando búsqueda…' });
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }
    if (msg.stop_reason === 'max_tokens') {
      onEvent({ kind: 'info', message: 'Informe truncado por límite de tokens.' });
    }
    break;
  }

  // El informe es el texto posterior a la última búsqueda (descarta comentarios previos como "voy a buscar…").
  // Las respuestas con citas vienen divididas en varios bloques de texto: se concatenan.
  const lastTool = allBlocks.findLastIndex((b) => b.type === 'server_tool_use' || b.type === 'web_search_tool_result');
  let finalText = allBlocks.slice(lastTool + 1).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (finalText.trim().length < 200) {
    finalText = allBlocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  if (!finalText.trim()) throw new Error('El agente no devolvió texto.');
  return { markdown: finalText.trim(), usage };
}
