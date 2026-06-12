import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { registerRoutes } from './routes/register.js';
import { startRealtimeServer } from './realtime/wsServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function main() {
  await fs.mkdir(config.storagePath, { recursive: true });

  const app = Fastify({
    logger: true,
    bodyLimit: 52 * 1024 * 1024,
    http: {
      maxHeaderSize: 131072,
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  const storageRoot = path.resolve(rootDir, config.storagePath);
  await app.register(fastifyStatic, {
    root: storageRoot,
    prefix: '/storage/',
    decorateReply: false,
  });

  await registerRoutes(app);

  const apiBase = `http://127.0.0.1:${config.port}`;
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`🚀 API listening on ${apiBase}`);

  await startRealtimeServer(apiBase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
