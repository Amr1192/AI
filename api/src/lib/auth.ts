import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';
import type { User } from '@prisma/client';

const TOKENABLE_TYPE = 'App\\Models\\User';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Laravel stores bcrypt hashes as $2y$ — bcryptjs expects $2a$
  const normalized = hash.startsWith('$2y$') ? `$2a$${hash.slice(4)}` : hash;
  return bcrypt.compare(password, normalized);
}

/** Laravel Sanctum-compatible token: `{id}|{plain}` */
export async function createAccessToken(userId: bigint, name = 'auth_token'): Promise<string> {
  const plain = crypto.randomBytes(20).toString('hex');
  const hash = crypto.createHash('sha256').update(plain).digest('hex');

  const record = await prisma.personalAccessToken.create({
    data: {
      tokenableType: TOKENABLE_TYPE,
      tokenableId: userId,
      name,
      token: hash,
    },
  });

  return `${record.id}|${plain}`;
}

export async function revokeAccessToken(tokenHeader: string | undefined): Promise<void> {
  const parsed = parseTokenHeader(tokenHeader);
  if (!parsed) return;

  await prisma.personalAccessToken.deleteMany({
    where: { id: parsed.id, token: parsed.hash },
  });
}

function parseTokenHeader(header?: string): { id: bigint; hash: string; plain: string } | null {
  if (!header?.startsWith('Bearer ')) return null;
  const raw = header.slice(7).trim();
  const pipe = raw.indexOf('|');
  if (pipe === -1) return null;

  const idStr = raw.slice(0, pipe);
  const plain = raw.slice(pipe + 1);
  if (!idStr || !plain) return null;

  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  return { id: BigInt(idStr), hash, plain };
}

export async function getUserFromRequest(request: FastifyRequest): Promise<User | null> {
  const parsed = parseTokenHeader(request.headers.authorization);
  if (!parsed) return null;

  const token = await prisma.personalAccessToken.findFirst({
    where: {
      id: parsed.id,
      token: parsed.hash,
      tokenableType: TOKENABLE_TYPE,
    },
  });

  if (!token) return null;

  return prisma.user.findUnique({ where: { id: token.tokenableId } });
}

export function sanitizeUser(user: User) {
  const { password, rememberToken, ...safe } = user;
  return safe;
}
