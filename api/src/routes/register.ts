import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import pdfParse from 'pdf-parse';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { serialize } from '../lib/serialize.js';
import {
  getUserFromRequest,
  createAccessToken,
  revokeAccessToken,
  verifyPassword,
  hashPassword,
  sanitizeUser,
} from '../lib/auth.js';
import { config } from '../config.js';
import { openai, chatJson, chatText } from '../services/openai.js';
import { cvEnhanceService } from '../services/cvEnhance.js';
import { cvGeneratorService } from '../services/cvGenerator.js';
import {
  findMatchingJobs,
  findCandidates,
  searchJobs,
  validateProfileCompleteness,
  generateProfileEmbedding,
  generateJobEmbedding,
  generateAllJobEmbeddings,
  generateAllProfileEmbeddings,
} from '../services/rag.js';
import {
  extractQaPairs,
  isReportEligible,
  reportEligibilityPayload,
  type ConversationTurn,
} from '../services/interviewReport.js';
import {
  generateComprehensiveAnalysis,
  normalizeComprehensiveAnalysis,
} from '../services/interviewAnalysis.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuthUser = Awaited<ReturnType<typeof getUserFromRequest>> & object;
type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  parts(): AsyncIterableIterator<Multipart | MultipartFile>;
};

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<NonNullable<AuthUser> | null> {
  const user = await getUserFromRequest(request);
  if (!user) {
    reply.code(401).send({ message: 'Unauthenticated' });
    return null;
  }
  return user;
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<NonNullable<AuthUser> | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (user.role !== 'admin') {
    reply.code(403).send({ message: 'Forbidden' });
    return null;
  }
  return user;
}

function parsePage(query: Record<string, unknown>, perPage = 10) {
  const page = Math.max(1, Number(query.page ?? 1));
  return { page, perPage, skip: (page - 1) * perPage };
}

async function laravelPaginate<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, lastPage);
  const offset = (currentPage - 1) * perPage;
  return serialize({
    current_page: currentPage,
    data,
    per_page: perPage,
    total,
    last_page: lastPage,
    from: total ? offset + 1 : 0,
    to: offset + data.length,
    first_page_url: null,
    last_page_url: null,
    next_page_url: currentPage < lastPage ? String(currentPage + 1) : null,
    prev_page_url: currentPage > 1 ? String(currentPage - 1) : null,
    path: null,
    links: [],
  });
}

async function readMultipart(request: FastifyRequest) {
  const req = request as MultipartRequest;
  const fields: Record<string, string> = {};
  const files: Record<string, { buffer: Buffer; filename: string; mimetype: string }> = {};
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      files[part.fieldname] = {
        buffer: await part.toBuffer(),
        filename: part.filename,
        mimetype: part.mimetype,
      };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, files };
}

async function ensureStorageDir(subdir: string) {
  const dir = path.join(config.storagePath, subdir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function saveUploadedFile(
  subdir: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = await ensureStorageDir(subdir);
  const full = path.join(dir, filename);
  await fs.writeFile(full, buffer);
  return path.join('storage', subdir, filename).replace(/\\/g, '/');
}

async function parseCompanyPayload(request: FastifyRequest) {
  const isMultipart = (request as MultipartRequest).isMultipart();
  if (isMultipart) {
    const { fields, files } = await readMultipart(request);
    let logoPath: string | undefined;
    const logoFile = files.logo;
    if (logoFile) {
      const ext = path.extname(logoFile.filename) || '.png';
      const fname = `company_${Date.now()}${ext}`;
      logoPath = await saveUploadedFile('company-logos', fname, logoFile.buffer);
    }
    return {
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.location !== undefined ? { location: fields.location } : {}),
      ...(fields.description !== undefined ? { description: fields.description || null } : {}),
      ...(fields.website !== undefined ? { website: fields.website || null } : {}),
      ...(logoPath ? { logo: logoPath } : {}),
    };
  }

  const body = (request.body ?? {}) as Record<string, string>;
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.location !== undefined ? { location: body.location } : {}),
    ...(body.description !== undefined ? { description: body.description ?? null } : {}),
    ...(body.website !== undefined ? { website: body.website ?? null } : {}),
    ...(body.logo !== undefined ? { logo: body.logo ?? null } : {}),
  };
}

function generatePdfBuffer(title: string, body: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text(title, { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(body, { align: 'left' });
    doc.end();
  });
}

function cvDataToText(cvData: Record<string, unknown>): string {
  const pi = (cvData.personalInfo ?? {}) as Record<string, string>;
  const lines = [
    pi.fullName ?? '',
    pi.jobTitle ?? '',
    [pi.email, pi.phone, pi.location].filter(Boolean).join(' | '),
    '',
    String(cvData.summary ?? ''),
    '',
    'Skills: ' + ((cvData.skills as string[] | undefined) ?? []).join(', '),
    '',
    JSON.stringify(cvData.experience ?? [], null, 2),
    '',
    JSON.stringify(cvData.education ?? [], null, 2),
  ];
  return lines.join('\n');
}

async function extractCvText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') {
    const parsed = await pdfParse(buffer);
    return parsed.text ?? '';
  }
  if (ext === 'docx') {
    const raw = buffer.toString('utf8');
    const tags = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (tags?.length) {
      return tags.map((t) => t.replace(/<[^>]+>/g, '')).join(' ');
    }
  }
  return buffer.toString('utf8');
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (api) => {
    // ----- check-key -----
    api.get('/check-key', async (_request, reply) => {
      if (!config.openaiApiKey) {
        return reply.code(500).send({ ok: false, error: 'OPENAI_API_KEY not set' });
      }
      try {
        const models = await openai.models.list();
        const available = new Set(models.data.map((m) => m.id));
        const required = {
          chat: config.chatModel,
          analysis: config.analysisModel,
          embedding: config.embeddingModel,
          rag: config.ragModel,
          realtime: config.realtimeModel,
          transcription: config.transcriptionModel,
        };
        const status: Record<string, { model: string; available: boolean }> = {};
        for (const [role, model] of Object.entries(required)) {
          status[role] = { model, available: available.has(model) };
        }
        const allOk = Object.values(status).every((s) => s.available);
        return {
          ok: allOk,
          models_configured: status,
          total_models: models.data.length,
        };
      } catch (e) {
        return reply.code(502).send({
          ok: false,
          error: e instanceof Error ? e.message : 'OpenAI check failed',
        });
      }
    });

    // ----- auth (public) -----
    api.post('/login', async (request, reply) => {
      const body = request.body as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return reply.code(422).send({ email: ['Email and password required'] });
      }
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user || !(await verifyPassword(body.password, user.password))) {
        return reply.code(401).send({ message: 'Invalid login credentials' });
      }
      const token = await createAccessToken(user.id);
      return serialize({
        message: 'Logged in successfully',
        user: sanitizeUser(user),
        access_token: token,
        token_type: 'Bearer',
      });
    });

    // ----- jobs (public index) -----
    api.get('/jobs', async (request) => {
      const q = request.query as Record<string, string>;
      const { page, perPage, skip } = parsePage(q);
      const where: Record<string, unknown> = { isActive: true };
      if (q.search) {
        where.OR = [
          { title: { contains: q.search } },
          { description: { contains: q.search } },
          { location: { contains: q.search } },
        ];
      }
      if (q.location) where.location = { contains: q.location };
      if (q.type) where.type = q.type;
      if (q.salary_from) where.salaryFrom = { gte: Number(q.salary_from) };
      if (q.salary_to) where.salaryTo = { lte: Number(q.salary_to) };

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          include: { company: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: perPage,
        }),
        prisma.job.count({ where }),
      ]);

      if (total === 0) {
        return { message: 'No jobs yet', data: [] };
      }
      return laravelPaginate(jobs, total, page, perPage);
    });

    // ----- admin generate description (public) -----
    api.post('/admin/jobs/generate-description', async (request, reply) => {
      const body = request.body as { title?: string; requirements?: string; type?: string; location?: string };
      if (!body.title) return reply.code(422).send({ title: ['Title is required'] });
      try {
        const prompt = `Generate a professional job description for: ${body.title}. Only 5 short sentences about role/responsibilities. No company, benefits, salary, or requirements.`;
        const description = await chatText(
          [
            { role: 'system', content: 'You are an HR assistant' },
            { role: 'user', content: prompt },
          ],
          0.7,
        );
        return { description };
      } catch (e) {
        return reply.code(500).send({
          message: 'AI generation failed',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    });

    // ----- CV analyze (public multipart) -----
    api.post('/cv/analyze', async (request, reply) => {
      const { files } = await readMultipart(request);
      const file = files.cv;
      if (!file) return reply.code(422).send({ cv: ['CV file is required'] });
      try {
        const text = await extractCvText(file.buffer, file.filename);
        if (!text.trim()) {
          return reply.code(400).send({ success: false, error: 'Could not extract text from file.' });
        }
        const result = await chatJson(
          [
            { role: 'system', content: 'Analyze CV and return JSON with skills, experience, education, summary, strengths, improvements.' },
            { role: 'user', content: `Analyze this CV:\n${text.slice(0, 8000)}` },
          ],
          0.3,
        );
        return { success: true, result };
      } catch (e) {
        return reply.code(500).send({ success: false, error: e instanceof Error ? e.message : 'Analysis failed' });
      }
    });

    // ----- CV enhance -----
    api.register(async (cvEnhance) => {
      cvEnhance.post('/upload', async (request, reply) => {
        const { files } = await readMultipart(request);
        const file = files.file;
        if (!file) return reply.code(422).send({ file: ['File is required'] });
        const result = await cvEnhanceService.parseUpload(file.filename, file.mimetype, file.buffer);
        const status = result.success ? 200 : result.error ? 422 : 500;
        return reply.code(status).send(result);
      });

      cvEnhance.post('/analyze', async (request) => {
        const body = request.body as {
          cv_text: string;
          job_description?: string;
          structured_data?: Record<string, unknown>;
          alt_text?: string;
        };
        return cvEnhanceService.analyze(body.cv_text, body.job_description, body.structured_data, body.alt_text);
      });

      cvEnhance.post('/score', async (request) => {
        const body = request.body as { cv_text: string };
        return cvEnhanceService.score(body.cv_text);
      });

      cvEnhance.post('/optimize', async (request) => {
        const body = request.body as { cv_text: string; job_description?: string };
        return cvEnhanceService.optimize(body.cv_text, body.job_description);
      });

      /** @deprecated use /optimize */
      cvEnhance.post('/enhance', async (request) => {
        const body = request.body as { cv_text: string; job_description?: string };
        return cvEnhanceService.optimize(body.cv_text, body.job_description);
      });

      cvEnhance.get('/templates', async () => cvEnhanceService.templates());

      cvEnhance.post('/generate-pdf', async (request, reply) => {
        const body = request.body as { cv_data?: Record<string, unknown>; cv_text?: string };
        const text = body.cv_text?.trim() || cvDataToText(body.cv_data ?? {});
        const pdf = await generatePdfBuffer('CV - ATS Optimized', text);
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', 'attachment; filename="cv-ats-optimized.pdf"')
          .send(pdf);
      });
    }, { prefix: '/cv/enhance' });

    // ----- CV builder -----
    api.register(async (builder) => {
      builder.post('/start', async () => cvGeneratorService.start());
      builder.post('/message', async (request) => {
        const body = request.body as { message: string; cv_data?: Record<string, unknown> };
        return cvGeneratorService.message(body.message, body.cv_data ?? {});
      });
      builder.post('/generate', async (request) => {
        const body = request.body as { cv_data: Record<string, unknown> };
        return cvGeneratorService.generate(body.cv_data);
      });
      builder.post('/generate-pdf', async (request, reply) => {
        const body = request.body as { cv_data: Record<string, unknown> };
        const pi = (body.cv_data.personalInfo ?? {}) as Record<string, string>;
        const name = pi.fullName || 'MyCV';
        const pdf = await generatePdfBuffer(`CV - ${name}`, cvDataToText(body.cv_data));
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="CV-${name.replace(/\s+/g, '-')}.pdf"`)
          .send(pdf);
      });
      builder.post('/reset', async () => cvGeneratorService.reset());
    }, { prefix: '/cv/builder' });

    // ----- CV generate (legacy) -----
    api.post('/cv/generate', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const personal = (body.personalInfo ?? {}) as Record<string, string>;
      const skills = body.skills;
      const skillText = Array.isArray(skills) ? skills.join(', ') : String(skills ?? '');
      const prompt = `Generate a polished one-page CV JSON with keys: title, contact, summary, experience, education, skills.
Name: ${personal.fullName ?? personal.name ?? ''}
Email: ${personal.email ?? ''}
Skills: ${skillText}
Summary: ${body.summary ?? ''}
Return ONLY valid JSON.`;
      try {
        const cv = await chatJson(
          [{ role: 'system', content: 'Resume writer. JSON only.' }, { role: 'user', content: prompt }],
          0.2,
          1500,
        );
        return { cv };
      } catch (e) {
        return reply.code(500).send({ error: e instanceof Error ? e.message : 'Generation failed' });
      }
    });

    // ----- RAG (auth) — before other routes that could conflict -----
    api.register(async (rag) => {
      rag.addHook('preHandler', async (request, reply) => {
        const user = await requireAuth(request, reply);
        if (!user) return reply;
        (request as FastifyRequest & { user: NonNullable<AuthUser> }).user = user;
      });

      rag.get('/recommendations', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const full = await prisma.user.findUnique({
          where: { id: user.id },
          include: { profile: true, skills: true },
        });
        if (!full?.profile) {
          return reply.code(400).send({
            message: 'Please complete your profile first to get personalized recommendations.',
            has_profile: false,
          });
        }
        const validation = validateProfileCompleteness(full);
        if (!validation.valid) {
          return reply.code(400).send({
            message: 'Your profile needs more information for accurate AI recommendations.',
            profile_completion: `${validation.score}%`,
            missing_fields: {
              professional_bio: validation.missing.includes('professional_bio')
                ? 'Add a professional bio (at least 50 characters)'
                : null,
              skills: validation.missing.includes('skills') ? 'Add at least one skill' : null,
            },
            has_profile: true,
            needs_completion: true,
          });
        }
        if (!full.profile.embedding) {
          const ok = await generateProfileEmbedding(user.id);
          if (!ok) {
            return reply.code(500).send({
              message: 'Failed to generate AI profile. Please try again or contact support.',
              error: 'embedding_generation_failed',
            });
          }
        }
        const q = request.query as { limit?: string; explain?: string };
        const topK = Number(q.limit ?? 10);
        const result = await findMatchingJobs(user.id, topK);
        if (result.error) {
          return reply.code(404).send({
            message: result.error,
            recommendations: [],
            threshold: result.threshold ?? null,
          });
        }
        return {
          message: 'AI-powered job recommendations generated successfully',
          count: result.jobs?.length ?? 0,
          profile_completion: `${validation.score}%`,
          threshold: result.threshold_applied ?? null,
          recommendations: serialize(result.jobs),
        };
      });

      rag.post('/search-jobs', async (request, reply) => {
        const body = request.body as { query?: string; limit?: number };
        if (!body.query || body.query.length < 3) {
          return reply.code(422).send({ query: ['Query must be at least 3 characters'] });
        }
        const result = await searchJobs(body.query, body.limit ?? 10);
        return serialize(result);
      });

      rag.get('/profile/embedding-status', async (request) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
        if (!profile) {
          return { has_profile: false, has_embedding: false, message: 'Please create your profile first' };
        }
        const needsUpdate = profile.embeddingGeneratedAt
          ? Date.now() - profile.embeddingGeneratedAt.getTime() > 30 * 86400000
          : true;
        return serialize({
          has_profile: true,
          has_embedding: profile.embedding !== null,
          embedding_generated_at: profile.embeddingGeneratedAt,
          needs_update: needsUpdate,
        });
      });

      rag.post('/profile/generate-embedding', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
        if (!profile) return reply.code(400).send({ message: 'Please create a profile first' });
        const ok = await generateProfileEmbedding(user.id, true);
        if (!ok) return reply.code(500).send({ message: 'Failed to generate profile embedding. Please try again.' });
        const fresh = await prisma.profile.findUnique({ where: { userId: user.id } });
        return {
          message: 'Profile embedding generated successfully',
          embedding_generated_at: fresh?.embeddingGeneratedAt,
        };
      });

      rag.post('/jobs/:jobId/generate-embedding', async (request, reply) => {
        const { jobId } = request.params as { jobId: string };
        const job = await prisma.job.findUnique({ where: { id: BigInt(jobId) } });
        if (!job) return reply.code(404).send({ message: 'Job not found' });
        const ok = await generateJobEmbedding(job.id);
        if (!ok) return reply.code(500).send({ message: 'Failed to generate job embedding. Please try again.' });
        const fresh = await prisma.job.findUnique({ where: { id: job.id } });
        return {
          message: 'Job embedding generated successfully',
          embedding_generated_at: fresh?.embeddingGeneratedAt,
        };
      });

      rag.get('/jobs/:jobId/candidates', async (request, reply) => {
        const { jobId } = request.params as { jobId: string };
        const q = request.query as { limit?: string };
        const job = await prisma.job.findUnique({
          where: { id: BigInt(jobId) },
          include: { company: true },
        });
        if (!job) return reply.code(404).send({ message: 'Job not found' });
        if (!job.embedding) {
          const ok = await generateJobEmbedding(job.id);
          if (!ok) {
            return reply.code(500).send({
              message: 'Failed to generate job embedding. Check OPENAI_API_KEY and try again.',
              candidates: [],
            });
          }
        }
        const result = await findCandidates(job.id, Number(q.limit ?? 10));
        const candidates = result.candidates ?? [];
        return {
          message: result.message ?? result.error ?? 'Candidate recommendations generated successfully via semantic search.',
          job: serialize({ id: job.id, title: job.title, company: job.company.name }),
          count: candidates.length,
          threshold: result.threshold_applied ?? null,
          used_fallback: false,
          candidates: serialize(candidates),
        };
      });

      rag.post('/jobs/generate-all-embeddings', async () => {
        const count = await generateAllJobEmbeddings();
        return { message: `Successfully generated embeddings for ${count} jobs`, count };
      });

      rag.post('/profiles/generate-all-embeddings', async (request) => {
        const body = request.body as { force?: boolean };
        const count = await generateAllProfileEmbeddings(Boolean(body?.force));
        return {
          message: `Successfully generated embeddings for ${count} profiles`,
          count,
          force: Boolean(body?.force),
        };
      });
    }, { prefix: '/rag' });

    // ----- user skills (mixed auth — match Laravel) -----
    api.get('/users/:userId/skills', async (request) => {
      const { userId } = request.params as { userId: string };
      const skills = await prisma.userSkill.findMany({
        where: { userId: BigInt(userId) },
        orderBy: [{ proficiencyLevel: 'desc' }, { yearsOfExperience: 'desc' }],
      });
      return serialize({ skills });
    });

    api.put('/profile/skills/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        title?: string;
        years_of_experience?: number;
        proficiency_level?: string;
      };
      const skill = await prisma.userSkill.findUnique({ where: { id: BigInt(id) } });
      if (!skill) return reply.code(404).send({ error: 'Skill not found' });
      const updated = await prisma.userSkill.update({
        where: { id: skill.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.years_of_experience !== undefined ? { yearsOfExperience: body.years_of_experience } : {}),
          ...(body.proficiency_level !== undefined ? { proficiencyLevel: body.proficiency_level } : {}),
        },
      });
      await generateProfileEmbedding(skill.userId, true).catch(() => undefined);
      return { message: 'Skill updated successfully', skill: serialize(updated) };
    });

    api.delete('/profile/skills/:id', async (request, reply) => {
      const user = await getUserFromRequest(request);
      const { id } = request.params as { id: string };
      const skill = await prisma.userSkill.findUnique({ where: { id: BigInt(id) } });
      if (!skill) {
        return reply.code(404).send(user ? { message: 'Skill not found' } : { error: 'Skill not found' });
      }
      if (user && skill.userId !== user.id) {
        return reply.code(404).send({ message: 'Skill not found' });
      }
      await prisma.userSkill.delete({ where: { id: skill.id } });
      await generateProfileEmbedding(skill.userId, true).catch(() => undefined);
      return { message: 'Skill deleted successfully' };
    });

    // ----- interviews (public) -----
    api.post('/interviews/start', async (request, reply) => {
      const body = request.body as { user_id?: number | string; skill_ids?: number[] };
      if (!body.user_id) return reply.code(422).send({ user_id: ['Required'] });
      const userId = BigInt(body.user_id);
      const skillFilter = body.skill_ids?.length
        ? { id: { in: body.skill_ids.map(BigInt) }, userId }
        : { userId };
      const skills = await prisma.userSkill.findMany({ where: skillFilter });
      if (!skills.length) return reply.code(400).send({ error: 'No skills found for this user' });

      const skillContext = skills
        .map((s: { title: string; proficiencyLevel: string; yearsOfExperience: number }) =>
          `- ${s.title} (${s.proficiencyLevel}, ${s.yearsOfExperience} yrs)`,
        )
        .join('\n');
      let firstQuestion: string;
      try {
        firstQuestion = await chatText(
          [
            { role: 'system', content: 'Expert technical interviewer. Output only the question text.' },
            {
              role: 'user',
              content: `Generate ONE opening interview question for skills:\n${skillContext}`,
            },
          ],
          0.5,
        );
      } catch {
        const titles = skills.slice(0, 3).map((s: { title: string }) => s.title).join(', ');
        firstQuestion = `To start, can you briefly describe your experience with ${titles}?`;
      }

      const interview = await prisma.interview.create({
        data: {
          userId,
          selectedSkillIds: body.skill_ids ?? Prisma.JsonNull,
          questionSet: [firstQuestion],
          currentQuestion: 0,
          status: 'active',
        },
      });
      return serialize({
        id: interview.id,
        status: 'active',
        first_question: firstQuestion,
        skills_used: skills,
      });
    });

    api.get('/interviews/:id/next-question', async (request, reply) => {
      const { id } = request.params as { id: string };
      const interview = await prisma.interview.findUnique({ where: { id: BigInt(id) } });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });
      const questions = (interview.questionSet as string[]) ?? [];
      const nextIdx = interview.currentQuestion + 1;
      if (nextIdx >= questions.length) {
        const skills = await prisma.userSkill.findMany({ where: { userId: interview.userId } });
        const skillContext = skills.map((s: { title: string }) => s.title).join(', ');
        const q = await chatText(
          [
            { role: 'system', content: 'Generate one follow-up technical interview question.' },
            { role: 'user', content: `Skills: ${skillContext}. Previous questions: ${questions.join('; ')}` },
          ],
          0.5,
        );
        questions.push(q);
        await prisma.interview.update({
          where: { id: interview.id },
          data: { questionSet: questions, currentQuestion: nextIdx },
        });
        return { question: q, index: nextIdx };
      }
      await prisma.interview.update({
        where: { id: interview.id },
        data: { currentQuestion: nextIdx },
      });
      return { question: questions[nextIdx], index: nextIdx };
    });

    api.post('/interviews/:id/finalize', async (request, reply) => {
      const { id } = request.params as { id: string };
      const interview = await prisma.interview.findUnique({ where: { id: BigInt(id) } });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });
      await prisma.interview.update({
        where: { id: interview.id },
        data: { status: 'completed' },
      });
      return { message: 'Interview finalized', status: 'completed' };
    });

    api.get('/interviews/:id/report', async (request, reply) => {
      const { id } = request.params as { id: string };
      const interview = await prisma.interview.findUnique({
        where: { id: BigInt(id) },
        include: { answers: { orderBy: { questionIndex: 'asc' } } },
      });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });
      return serialize({
        id: interview.id,
        status: interview.status,
        comprehensive_analysis: interview.comprehensiveAnalysis,
        analyzed_at: interview.analyzedAt,
        answers: interview.answers,
        overall: interview.overall,
      });
    });

    api.post('/interviews/:id/rt/start', async (request, reply) => {
      const { id } = request.params as { id: string };
      const interview = await prisma.interview.findUnique({ where: { id: BigInt(id) } });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });
      const sid = crypto.randomUUID();
      const wsUrl = `ws://127.0.0.1:${config.wsPort}`;
      return { sessionId: sid, node_ws_url: wsUrl, ws_url: wsUrl, interview_id: id };
    });

    api.post('/interviews/:id/rt/submit-answer', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        sessionId: string;
        transcript: string;
        question_index: number;
      };
      const interviewId = BigInt(id);
      const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });

      const existing = await prisma.interviewAnswer.findUnique({
        where: {
          interviewId_questionIndex: {
            interviewId,
            questionIndex: body.question_index,
          },
        },
      });
      if (existing) {
        return {
          status: 'success',
          model_used: existing.modelUsed ?? 'unknown',
          analysis_source: existing.analysisSource ?? 'unknown',
          verification_token: existing.verificationToken,
          feedback: existing.feedback,
          message: 'Answer already submitted',
        };
      }

      const questions = (interview.questionSet as string[]) ?? [];
      const questionText = questions[body.question_index] ?? 'Unknown Question';
      const modelUsed = config.analysisModel;
      let analysisSource = 'ai';
      let feedback: Record<string, unknown>;

      try {
        feedback = await chatJson(
          [
            {
              role: 'system',
              content: 'Interview evaluator. Return JSON with evaluation_criteria, overall_score, strengths, weaknesses, actionable_tips, next_recommendations.',
            },
            {
              role: 'user',
              content: `QUESTION:\n${questionText}\n\nANSWER:\n${body.transcript}\n\nReturn JSON only.`,
            },
          ],
          0.3,
          2000,
        );
      } catch {
        analysisSource = 'fallback';
        const wordCount = body.transcript.split(/\s+/).length;
        const score = Math.min(100, Math.max(30, wordCount * 1.5));
        feedback = {
          evaluation_criteria: [{ name: 'Response Length', score, reasoning: `Word count: ${wordCount}` }],
          overall_score: score,
          strengths: ['Provided a response'],
          weaknesses: ['Detailed analysis unavailable'],
          actionable_tips: ['Provide more detailed explanations'],
          next_recommendations: {
            suggested_level: 'mid',
            recommended_next_difficulty: 'medium',
            skills_to_focus: ['communication'],
            suggested_interview_type: 'technical',
            practice_questions: [],
          },
        };
      }

      const verificationToken = crypto
        .createHash('sha256')
        .update(JSON.stringify(feedback) + modelUsed)
        .digest('hex');

      await prisma.interviewAnswer.create({
        data: {
          interviewId,
          questionIndex: body.question_index,
          questionText,
          answerText: body.transcript.trim(),
          feedback: feedback as object,
          modelUsed,
          analysisSource,
          verificationToken,
        },
      });

      return {
        status: 'success',
        model_used: modelUsed,
        analysis_source: analysisSource,
        verification_token: verificationToken,
        feedback,
      };
    });

    api.post('/interviews/:id/save-conversation', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { sessionId: string; conversation: unknown[]; stats: Record<string, unknown> };
      const interview = await prisma.interview.findUnique({ where: { id: BigInt(id) } });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });

      const conversation = (body.conversation ?? []) as ConversationTurn[];
      const qaPairs = extractQaPairs(conversation);

      for (let i = 0; i < qaPairs.length; i++) {
        const pair = qaPairs[i];
        await prisma.interviewAnswer.upsert({
          where: {
            interviewId_questionIndex: {
              interviewId: interview.id,
              questionIndex: i,
            },
          },
          create: {
            interviewId: interview.id,
            questionIndex: i,
            questionText: pair.questionText,
            answerText: pair.answerText,
            analysisSource: 'realtime',
          },
          update: {
            questionText: pair.questionText,
            answerText: pair.answerText,
          },
        });
      }

      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          conversationHistory: body.conversation as object,
          stats: body.stats as object,
          status: 'completed',
        },
      });
      return {
        message: 'Conversation saved successfully',
        answers_saved: qaPairs.length,
      };
    });

    api.post('/interviews/:id/save-video-frames', async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { frames: string[]; frameCount: number };
      const interview = await prisma.interview.findUnique({ where: { id: BigInt(id) } });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });

      const sampled = body.frames.filter((_, i) => i % 3 === 0);
      const frameDir = path.join(config.storagePath, 'interviews', id);
      await fs.mkdir(frameDir, { recursive: true });

      const storedPaths: string[] = [];
      for (let i = 0; i < sampled.length; i++) {
        const raw = sampled[i].replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(raw, 'base64');
        const filename = `frame-${i}.jpg`;
        await fs.writeFile(path.join(frameDir, filename), buffer);
        storedPaths.push(`interviews/${id}/${filename}`);
      }

      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          videoFrames: storedPaths as unknown as object,
          videoFrameCount: storedPaths.length,
        },
      });
      return { message: 'Video frames saved successfully', frame_count: storedPaths.length };
    });

    api.post('/interviews/:id/analyze', async (request, reply) => {
      const { id } = request.params as { id: string };
      const interview = await prisma.interview.findUnique({
        where: { id: BigInt(id) },
        include: { answers: true },
      });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });

      const conversation = (interview.conversationHistory as ConversationTurn[]) ?? [];
      const stats = (interview.stats as Record<string, unknown> | null) ?? null;

      if (!isReportEligible(interview.answers.length, conversation, stats)) {
        const eligibility = reportEligibilityPayload(interview.answers.length, conversation, stats);
        return reply.code(422).send({
          error: 'report_not_available',
          message: eligibility.report_eligibility.message,
          questions_asked: eligibility.report_eligibility.questions_asked,
          minimum_required: eligibility.report_eligibility.minimum_required,
        });
      }

      if (interview.comprehensiveAnalysis) {
        const existing = interview.comprehensiveAnalysis as Record<string, unknown>;
        const qaPairs = extractQaPairs(conversation);
        const normalized = normalizeComprehensiveAnalysis(existing, qaPairs);
        if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
          await prisma.interview.update({
            where: { id: interview.id },
            data: { comprehensiveAnalysis: normalized as object },
          });
        }
        return {
          status: 'success',
          analysis: normalized,
          model: normalized.model_used ?? config.analysisModel,
          cached: true,
        };
      }

      const qaFromDb = interview.answers.map((a) => ({
        questionText: a.questionText,
        answerText: a.answerText,
      }));

      try {
        const analysis = await generateComprehensiveAnalysis(conversation, qaFromDb);
        await prisma.interview.update({
          where: { id: interview.id },
          data: {
            comprehensiveAnalysis: analysis as object,
            analyzedAt: new Date(),
          },
        });
        return { status: 'success', analysis, model: config.analysisModel };
      } catch (e) {
        const fallback = normalizeComprehensiveAnalysis({}, extractQaPairs(conversation));
        await prisma.interview.update({
          where: { id: interview.id },
          data: {
            comprehensiveAnalysis: fallback as object,
            analyzedAt: new Date(),
          },
        });
        return { status: 'success', analysis: fallback, model: config.analysisModel, fallback: true };
      }
    });

    // MUST be after specific /interviews/:id/* routes
    api.get('/interviews/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const interview = await prisma.interview.findUnique({
        where: { id: BigInt(id) },
        include: { answers: { orderBy: { questionIndex: 'asc' } } },
      });
      if (!interview) return reply.code(404).send({ error: 'Interview not found' });

      const conversation = (interview.conversationHistory as ConversationTurn[]) ?? [];
      const stats = (interview.stats as Record<string, unknown> | null) ?? null;
      const eligibility = reportEligibilityPayload(interview.answers.length, conversation, stats);

      return serialize({
        id: interview.id,
        user_id: interview.userId,
        selected_skill_ids: interview.selectedSkillIds ?? [],
        status: interview.status,
        question_set: interview.questionSet,
        current_question: interview.currentQuestion,
        overall: interview.overall,
        answers: interview.answers.map((a: {
          id: bigint;
          questionText: string;
          answerText: string;
          feedback: unknown;
          createdAt: Date;
        }) => ({
          id: a.id,
          question_text: a.questionText,
          answer_text: a.answerText,
          feedback: a.feedback,
          created_at: a.createdAt,
        })),
        stats: interview.stats ?? {},
        comprehensive_analysis: interview.comprehensiveAnalysis,
        analyzed_at: interview.analyzedAt,
        report_eligible: eligibility.report_eligible,
        report_eligibility: eligibility.report_eligibility,
      });
    });

    // ----- authenticated routes -----
    api.register(async (authRoutes) => {
      authRoutes.addHook('preHandler', async (request, reply) => {
        const user = await requireAuth(request, reply);
        if (!user) return reply;
        (request as FastifyRequest & { user: NonNullable<AuthUser> }).user = user;
      });

      authRoutes.post('/logout', async (request) => {
        await revokeAccessToken(request.headers.authorization);
        return { message: 'Successfully logged out' };
      });

      authRoutes.get('/user', async (request) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const full = await prisma.user.findUnique({
          where: { id: user.id },
          include: { profile: true },
        });
        return serialize({ user: full ? sanitizeUser(full) : sanitizeUser(user) });
      });

      // Profile
      authRoutes.get('/profile', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        let full = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            profile: true,
            education: true,
            workExperiences: true,
            skills: true,
            jobApplications: true,
          },
        });
        if (!full) return reply.code(404).send({ message: 'User not found' });
        if (!full.profile) {
          await prisma.profile.create({ data: { userId: user.id } });
          full = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
              profile: true,
              education: true,
              workExperiences: true,
              skills: true,
              jobApplications: true,
            },
          });
        }
        const p = full!.profile!;
        return serialize({
          profile: {
            id: full!.id,
            name: full!.name,
            email: full!.email,
            role: full!.role,
            phone_number: p.phoneNumber,
            location: p.location,
            professional_bio: p.professionalBio,
            years_of_experience: p.yearsOfExperience,
            profile_picture: p.profilePicture,
            education: full!.education,
            work_experiences: full!.workExperiences,
            skills: full!.skills,
            job_applications: full!.jobApplications,
          },
        });
      });

      authRoutes.put('/profile', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const isMultipart = (request as MultipartRequest).isMultipart();
        let body: Record<string, string> = {};
        let profilePicturePath: string | undefined;

        if (isMultipart) {
          const { fields, files } = await readMultipart(request);
          body = fields;
          const pic = files.profile_picture;
          if (pic) {
            const fname = `${Date.now()}_${user.id}${path.extname(pic.filename)}`;
            profilePicturePath = await saveUploadedFile('profile-pictures', fname, pic.buffer);
          }
        } else {
          body = (request.body ?? {}) as Record<string, string>;
        }

        let profile = await prisma.profile.findUnique({ where: { userId: user.id } });
        if (!profile) {
          profile = await prisma.profile.create({ data: { userId: user.id } });
        }
        profile = await prisma.profile.update({
          where: { id: profile.id },
          data: {
            ...(body.phone_number !== undefined ? { phoneNumber: body.phone_number } : {}),
            ...(body.location !== undefined ? { location: body.location } : {}),
            ...(body.professional_bio !== undefined ? { professionalBio: body.professional_bio } : {}),
            ...(body.years_of_experience !== undefined
              ? { yearsOfExperience: Number(body.years_of_experience) }
              : {}),
            ...(profilePicturePath ? { profilePicture: profilePicturePath } : {}),
          },
        });
        await generateProfileEmbedding(user.id, true).catch(() => undefined);
        return {
          message: 'Profile updated successfully',
          profile: serialize(profile),
        };
      });

      authRoutes.post('/profile/education', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const body = request.body as Record<string, string>;
        if (!body.institution || !body.degree || !body.field_of_study || !body.start_date) {
          return reply.code(422).send({ institution: ['Required fields missing'] });
        }
        const education = await prisma.education.create({
          data: {
            userId: user.id,
            institution: body.institution,
            degree: body.degree,
            fieldOfStudy: body.field_of_study,
            startDate: new Date(body.start_date),
            endDate: body.end_date ? new Date(body.end_date) : null,
            grade: body.grade ? Number(body.grade) : null,
            description: body.description ?? null,
          },
        });
        await generateProfileEmbedding(user.id, true).catch(() => undefined);
        return reply.code(201).send({
          message: 'Education added successfully',
          education: serialize(education),
        });
      });

      authRoutes.post('/profile/work-experience', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const body = request.body as Record<string, string | boolean>;
        if (!body.company_name || !body.position || !body.start_date) {
          return reply.code(422).send({ company_name: ['Required fields missing'] });
        }
        const work = await prisma.workExperience.create({
          data: {
            userId: user.id,
            companyName: String(body.company_name),
            position: String(body.position),
            startDate: new Date(String(body.start_date)),
            endDate: body.end_date ? new Date(String(body.end_date)) : null,
            isCurrent: Boolean(body.is_current),
            location: body.location ? String(body.location) : null,
            description: body.description ? String(body.description) : null,
            achievements: body.achievements ? String(body.achievements) : null,
          },
        });
        await generateProfileEmbedding(user.id, true).catch(() => undefined);
        return reply.code(201).send({
          message: 'Work experience added successfully',
          work_experience: serialize(work),
        });
      });

      authRoutes.post('/profile/skills', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const body = request.body as {
          skills?: Array<{ title: string; years_of_experience: number; proficiency_level: string }>;
        };
        if (!body.skills?.length) return reply.code(422).send({ skills: ['Skills array required'] });
        const added = [];
        for (const s of body.skills) {
          added.push(
            await prisma.userSkill.create({
              data: {
                userId: user.id,
                title: s.title,
                yearsOfExperience: s.years_of_experience,
                proficiencyLevel: s.proficiency_level,
              },
            }),
          );
        }
        await generateProfileEmbedding(user.id, true).catch(() => undefined);
        return { message: 'Skills added successfully', skills: serialize(added) };
      });

      authRoutes.post('/profile/cv', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const body = request.body as { cv_json?: unknown };
        if (!body.cv_json) return reply.code(422).send({ cv_json: ['Required'] });
        let profile = await prisma.profile.findUnique({ where: { userId: user.id } });
        if (!profile) profile = await prisma.profile.create({ data: { userId: user.id } });
        profile = await prisma.profile.update({
          where: { id: profile.id },
          data: { cvJson: body.cv_json as object },
        });
        return { message: 'CV saved to profile', profile: serialize(profile) };
      });

      // Jobs (auth)
      authRoutes.get('/jobs/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const job = await prisma.job.findUnique({
          where: { id: BigInt(id) },
          include: { company: true },
        });
        if (!job) return reply.code(404).send({ message: 'Job not found' });
        return serialize({ job });
      });

      authRoutes.post('/jobs/:id/apply', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const { id } = request.params as { id: string };
        const jobId = BigInt(id);
        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return reply.code(404).send({ message: 'Job not found' });

        const { fields, files } = await readMultipart(request);
        const cvFile = files.cv;
        if (!cvFile) return reply.code(422).send({ cv: ['CV file is required.'] });

        const existing = await prisma.jobApplication.findUnique({
          where: { userId_jobId: { userId: user.id, jobId } },
        });
        if (existing) {
          return reply.code(422).send({ message: 'You have already applied for this job.' });
        }

        const ext = path.extname(cvFile.filename) || '.pdf';
        const fname = `${Date.now()}_${user.id}${ext}`;
        const cvPath = await saveUploadedFile('cvs', fname, cvFile.buffer);

        const application = await prisma.jobApplication.create({
          data: {
            userId: user.id,
            jobId,
            coverLetter: fields.cover_letter ?? '',
            cvVersion: cvPath,
            status: 'pending',
          },
        });
        return reply.code(201).send({
          message: 'Application submitted successfully.',
          application: serialize(application),
        });
      });

      authRoutes.get('/jobs/applications/my', async (request) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const q = request.query as Record<string, string>;
        const { page, perPage, skip } = parsePage(q);
        const [apps, total] = await Promise.all([
          prisma.jobApplication.findMany({
            where: { userId: user.id },
            include: { job: { include: { company: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: perPage,
          }),
          prisma.jobApplication.count({ where: { userId: user.id } }),
        ]);
        return laravelPaginate(apps, total, page, perPage);
      });

      authRoutes.get('/jobs/recommended', async (request) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const skills = await prisma.userSkill.findMany({ where: { userId: user.id } });
        const q = request.query as Record<string, string>;
        const { page, perPage, skip } = parsePage(q);

        const orFilters = skills.flatMap((s: { title: string }) => [
          { requirements: { contains: s.title } },
          { description: { contains: s.title } },
        ]);

        const where = {
          isActive: true,
          ...(orFilters.length ? { OR: orFilters } : {}),
          applications: { none: { userId: user.id } },
        };

        const [jobs, total] = await Promise.all([
          prisma.job.findMany({
            where,
            include: { company: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take: perPage,
          }),
          prisma.job.count({ where }),
        ]);
        return laravelPaginate(jobs, total, page, perPage);
      });

      authRoutes.post('/user-cvs', async (request, reply) => {
        const user = (request as FastifyRequest & { user: NonNullable<AuthUser> }).user;
        const body = request.body as { cv_json?: unknown; title?: string };
        if (!body.cv_json) return reply.code(422).send({ cv_json: ['Required'] });
        const cv = await prisma.userCv.create({
          data: {
            userId: user.id,
            cvJson: body.cv_json as object,
            title: body.title ?? `My CV - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          },
        });
        return reply.code(201).send({
          message: 'CV saved successfully',
          cv: serialize(cv),
        });
      });

      // Admin
      authRoutes.register(async (admin) => {
        admin.addHook('preHandler', async (request, reply) => {
          const user = await requireAdmin(request, reply);
          if (!user) return reply;
          (request as FastifyRequest & { user: NonNullable<AuthUser> }).user = user;
        });

        admin.get('/users', async (request) => {
          const q = request.query as Record<string, string>;
          const { page, perPage, skip } = parsePage(q);
          const [users, total] = await Promise.all([
            prisma.user.findMany({
              include: { profile: true },
              skip,
              take: perPage,
            }),
            prisma.user.count(),
          ]);
          return laravelPaginate(users.map(sanitizeUser), total, page, perPage);
        });

        admin.post('/users', async (request, reply) => {
          const body = request.body as {
            name: string;
            email: string;
            password: string;
            password_confirmation?: string;
            role: string;
          };
          const user = await prisma.user.create({
            data: {
              name: body.name,
              email: body.email,
              password: await hashPassword(body.password),
              role: body.role,
            },
          });
          return reply.code(201).send({
            message: 'User added successfully',
            user: serialize(sanitizeUser(user)),
          });
        });

        admin.put('/users/:user', async (request, reply) => {
          const { user: userId } = request.params as { user: string };
          const body = request.body as Partial<{ name: string; email: string; password: string; role: string }>;
          const data: Record<string, unknown> = {};
          if (body.name) data.name = body.name;
          if (body.email) data.email = body.email;
          if (body.role) data.role = body.role;
          if (body.password) data.password = await hashPassword(body.password);
          const user = await prisma.user.update({ where: { id: BigInt(userId) }, data });
          return { message: 'User updated successfully', user: serialize(sanitizeUser(user)) };
        });

        admin.delete('/users/:userID', async (request, reply) => {
          const { userID } = request.params as { userID: string };
          try {
            await prisma.user.delete({ where: { id: BigInt(userID) } });
            return { message: 'user deleted successfully' };
          } catch (e) {
            return reply.code(500).send({
              message: 'Failed to delete user',
              error: e instanceof Error ? e.message : 'Unknown',
            });
          }
        });

        admin.get('/companies', async (request) => {
          const q = request.query as Record<string, string>;
          const { page, perPage, skip } = parsePage(q);
          const [companies, total] = await Promise.all([
            prisma.company.findMany({ skip, take: perPage }),
            prisma.company.count(),
          ]);
          return laravelPaginate(companies, total, page, perPage);
        });

        admin.post('/companies', async (request, reply) => {
          const data = await parseCompanyPayload(request);
          if (!data.name || !data.location) {
            return reply.code(422).send({ message: 'Name and location are required' });
          }
          const company = await prisma.company.create({
            data: {
              name: data.name,
              location: data.location,
              description: data.description ?? null,
              website: data.website ?? null,
              logo: data.logo ?? null,
            },
          });
          return reply.code(201).send({
            message: 'Company created successfully',
            company: serialize(company),
          });
        });

        admin.put('/companies/:company', async (request, reply) => {
          const { company: companyId } = request.params as { company: string };
          const data = await parseCompanyPayload(request);
          if (Object.keys(data).length === 0) {
            return reply.code(422).send({ message: 'No fields to update' });
          }
          const company = await prisma.company.update({
            where: { id: BigInt(companyId) },
            data,
          });
          return { message: 'Company updated successfully', company: serialize(company) };
        });

        admin.delete('/companies/:companyID', async (request, reply) => {
          const { companyID } = request.params as { companyID: string };
          const id = BigInt(companyID);
          try {
            await prisma.jobApplication.deleteMany({ where: { job: { companyId: id } } });
            await prisma.job.deleteMany({ where: { companyId: id } });
            await prisma.company.delete({ where: { id } });
            return { message: 'Company deleted successfully' };
          } catch (e) {
            return reply.code(500).send({
              message: 'Failed to delete company',
              error: e instanceof Error ? e.message : 'Unknown',
            });
          }
        });

        admin.get('/jobs', async (request) => {
          const q = request.query as Record<string, string>;
          const { page, perPage, skip } = parsePage(q);
          const [jobs, total] = await Promise.all([
            prisma.job.findMany({
              include: { company: true, applications: true },
              orderBy: { createdAt: 'desc' },
              skip,
              take: perPage,
            }),
            prisma.job.count(),
          ]);
          return laravelPaginate(jobs, total, page, perPage);
        });

        admin.post('/jobs', async (request, reply) => {
          const body = request.body as Record<string, unknown>;
          const type = String(body.type ?? '').toLowerCase();
          const job = await prisma.job.create({
            data: {
              companyId: BigInt(String(body.company_id)),
              title: String(body.title),
              description: String(body.description),
              requirements: String(body.requirements),
              location: String(body.location),
              type,
              salaryFrom: body.salary_from != null ? Number(body.salary_from) : null,
              salaryTo: body.salary_to != null ? Number(body.salary_to) : null,
              deadline: body.deadline ? new Date(String(body.deadline)) : null,
              isActive: body.is_active !== false,
            },
            include: { company: true },
          });
          return reply.code(201).send({
            message: 'Job created successfully',
            job: serialize(job),
          });
        });

        admin.put('/jobs/:job', async (request) => {
          const { job: jobId } = request.params as { job: string };
          const body = request.body as Record<string, unknown>;
          const job = await prisma.job.update({
            where: { id: BigInt(jobId) },
            data: {
              ...(body.title !== undefined ? { title: String(body.title) } : {}),
              ...(body.description !== undefined ? { description: String(body.description) } : {}),
              ...(body.requirements !== undefined ? { requirements: String(body.requirements) } : {}),
              ...(body.location !== undefined ? { location: String(body.location) } : {}),
              ...(body.type !== undefined ? { type: String(body.type).toLowerCase() } : {}),
              ...(body.is_active !== undefined ? { isActive: Boolean(body.is_active) } : {}),
              ...(body.deadline !== undefined ? { deadline: new Date(String(body.deadline)) } : {}),
            },
          });
          return { message: 'Job updated successfully', job: serialize(job) };
        });

        admin.delete('/jobs/:jobID', async (request, reply) => {
          const { jobID } = request.params as { jobID: string };
          try {
            await prisma.job.delete({ where: { id: BigInt(jobID) } });
            return { message: 'Job deleted successfully' };
          } catch (e) {
            return reply.code(500).send({
              message: 'Failed to delete job',
              error: e instanceof Error ? e.message : 'Unknown',
            });
          }
        });

        admin.put('/jobs/:job/status', async (request) => {
          const { job: jobId } = request.params as { job: string };
          const body = request.body as { is_active: boolean };
          const job = await prisma.job.update({
            where: { id: BigInt(jobId) },
            data: { isActive: body.is_active },
          });
          return { message: 'Job status updated successfully', job: serialize(job) };
        });

        admin.put('/applications/:application/status', async (request, reply) => {
          const { application: appId } = request.params as { application: string };
          const body = request.body as { status: string };
          const application = await prisma.jobApplication.update({
            where: { id: BigInt(appId) },
            data: { status: body.status },
            include: { user: true, job: true },
          });
          return {
            message: 'Application status updated successfully',
            application: serialize(application),
          };
        });
      }, { prefix: '/admin' });
    });
  }, { prefix: '/api' });
}
