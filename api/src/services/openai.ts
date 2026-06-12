import OpenAI from 'openai';
import { config } from '../config.js';

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

export async function chatJson(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  temperature = 0.4,
  maxTokens?: number,
): Promise<Record<string, unknown>> {
  const res = await openai.chat.completions.create({
    model: config.chatModel,
    messages,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  });

  let raw = (res.choices[0]?.message?.content || '').trim();
  raw = raw.replace(/^```(?:json)?\s*|\s*```$/g, '');

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
  }
}

export async function chatText(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  temperature = 0.4,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: config.chatModel,
    messages,
    temperature,
  });
  return (res.choices[0]?.message?.content || '').trim();
}
