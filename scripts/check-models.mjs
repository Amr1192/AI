import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadKey() {
  for (const envPath of [
    resolve(root, 'backend/.env'),
    resolve(root, 'node/.env'),
  ]) {
    try {
      const content = readFileSync(envPath, 'utf8');
      const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
      if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, '');
    } catch {}
  }
  return process.env.OPENAI_API_KEY;
}

const key = loadKey();
if (!key) {
  console.error('NO_OPENAI_API_KEY');
  process.exit(1);
}

const res = await fetch('https://api.openai.com/v1/models', {
  headers: { Authorization: `Bearer ${key}` },
});
const body = await res.json();
const models = (body.data ?? []).map((m) => m.id).sort();

console.log(`HTTP ${res.status} | ${models.length} models`);
const check = [
  'gpt-5-mini',
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-realtime-mini',
  'gpt-realtime',
  'gpt-realtime-2',
  'whisper-1',
  'text-embedding-ada-002',
  'text-embedding-3-small',
  'gpt-3.5-turbo',
];
for (const m of check) {
  console.log(`${m}: ${models.includes(m) ? 'OK' : 'MISSING'}`);
}
console.log('realtime:', models.filter((m) => m.includes('realtime')).join(', '));
