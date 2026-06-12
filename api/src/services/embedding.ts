import { config } from '../config.js';
import { openai } from './openai.js';

export function normalizeEmbedding(embedding: unknown): number[] | null {
  if (Array.isArray(embedding)) return embedding as number[];
  if (typeof embedding === 'string' && embedding) {
    try {
      const parsed = JSON.parse(embedding);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: config.embeddingModel,
    input: text,
  });
  return res.data[0].embedding;
}

export function findSimilar(
  queryEmbedding: number[],
  items: Array<{ embedding?: unknown; [key: string]: unknown }>,
  topK: number,
  minSimilarity?: number,
): Array<{ similarity: number; [key: string]: unknown }> {
  const results: Array<{ similarity: number; [key: string]: unknown }> = [];

  for (const item of items) {
    const vector = normalizeEmbedding(item.embedding);
    if (!vector) continue;
    const similarity = cosineSimilarity(queryEmbedding, vector);
    if (minSimilarity !== undefined && similarity < minSimilarity) continue;
    results.push({ ...item, similarity });
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}
