// Cliente de IA con formato compatible con OpenAI (Groq por defecto). / OpenAI-compatible client (Groq by default).
import { sleep } from './util.mjs';

export class LlmError extends Error {
  constructor(status, detail) {
    super(`LLM ${status}: ${String(detail).slice(0, 300)}`);
    this.status = status;
  }
}

export const llmSettings = () => ({
  baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
  dailyLimit: Number(process.env.LLM_DAILY_LIMIT || 800),
});

export const llmEnabled = () => !!process.env.LLM_API_KEY;

export async function chatCompletion({ messages, tools, signal }) {
  const { baseUrl, apiKey, model } = llmSettings();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.3, max_tokens: 700 }),
      signal,
    });
    if (res.status === 429 && attempt === 0) {
      const wait = Number(res.headers.get('retry-after')) || 1.5;
      await sleep(Math.min(wait, 4) * 1000);
      continue;
    }
    if (!res.ok) throw new LlmError(res.status, await res.text());
    return res.json();
  }
  throw new LlmError(429, 'rate limited');
}
