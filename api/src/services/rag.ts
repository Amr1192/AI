import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { generateEmbedding, findSimilar, normalizeEmbedding } from './embedding.js';
import type { Job, UserSkill } from '@prisma/client';

const TECH_SKILLS = [
  'php', 'laravel', 'symfony', 'javascript', 'typescript', 'react', 'vue', 'angular', 'node', 'express',
  'python', 'django', 'java', 'spring', 'go', 'rust', 'ruby', 'mysql', 'postgresql', 'mongodb', 'redis', 'sql',
  'html', 'css', 'docker', 'kubernetes', 'aws', 'azure', 'git', 'graphql', 'machine learning', 'devops',
];

const ALIASES: Record<string, string> = {
  'vue.js': 'vue',
  'react.js': 'react',
  'node.js': 'node',
  'next.js': 'next',
  golang: 'go',
  postgresql: 'postgres',
};

function normalizeSkill(skill: string): string {
  const s = skill.toLowerCase().trim().replace(/\s+/g, ' ');
  return ALIASES[s] ?? s;
}

function extractFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const skill of TECH_SKILLS) {
    const re = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) found.push(ALIASES[skill] ?? skill);
  }
  return [...new Set(found)];
}

function extractJobSkillSets(job: { title?: string; requirements?: string; description?: string }) {
  const titleSkills = extractFromText(String(job.title ?? ''));
  const bodySkills = extractFromText(`${job.requirements ?? ''}\n${job.description ?? ''}`);
  const all = [...new Set([...titleSkills, ...bodySkills])];
  return { core: titleSkills, all };
}

function computeHybridScore(
  userSkills: string[],
  skillSets: { core: string[]; all: string[] },
  semanticScore: number,
): {
  eligible: boolean;
  final_score: number;
  semantic_score: number;
  skill_score: number | null;
  skill_overlap_ratio: number | null;
  matched_skills: string[];
  missing_skills: string[];
} {
  const { core: coreSkills, all: jobSkills } = skillSets;

  if (jobSkills.length === 0) {
    const threshold = config.ragSemanticOnlyThreshold;
    return {
      eligible: semanticScore >= threshold,
      final_score: semanticScore,
      semantic_score: semanticScore,
      skill_score: null,
      skill_overlap_ratio: null,
      matched_skills: [],
      missing_skills: [],
    };
  }

  const matched = jobSkills.filter((s) => userSkills.includes(s));
  const missing = jobSkills.filter((s) => !userSkills.includes(s));

  if (coreSkills.length > 0 && !coreSkills.some((s) => userSkills.includes(s))) {
    return {
      eligible: false,
      final_score: 0,
      semantic_score: semanticScore,
      skill_score: 0,
      skill_overlap_ratio: 0,
      matched_skills: [],
      missing_skills: missing,
    };
  }

  if (matched.length === 0) {
    return {
      eligible: false,
      final_score: 0,
      semantic_score: semanticScore,
      skill_score: 0,
      skill_overlap_ratio: 0,
      matched_skills: [],
      missing_skills: missing,
    };
  }

  const allOverlap = matched.length / jobSkills.length;
  const coreOverlap = coreSkills.length
    ? coreSkills.filter((s) => userSkills.includes(s)).length / coreSkills.length
    : allOverlap;
  const skillScore = 0.6 * coreOverlap + 0.4 * allOverlap;

  if (allOverlap < config.ragMinSkillOverlap && coreOverlap < 0.5) {
    return {
      eligible: false,
      final_score: skillScore * 0.5,
      semantic_score: semanticScore,
      skill_score: skillScore,
      skill_overlap_ratio: allOverlap,
      matched_skills: matched,
      missing_skills: missing,
    };
  }

  const finalScore =
    semanticScore * config.ragSemanticWeight + skillScore * config.ragSkillWeight;

  return {
    eligible: finalScore >= config.ragSimilarityThreshold,
    final_score: finalScore,
    semantic_score: semanticScore,
    skill_score: skillScore,
    skill_overlap_ratio: allOverlap,
    matched_skills: matched,
    missing_skills: missing,
  };
}

function mapJob(job: {
  id: bigint;
  title: string;
  description: string;
  requirements: string;
  location: string;
  type: string;
  salaryFrom: unknown;
  salaryTo: unknown;
  embedding: unknown;
  company?: { name: string } | null;
}) {
  return {
    id: job.id,
    job_id: job.id,
    title: job.title,
    company: job.company?.name ?? 'Unknown',
    location: job.location,
    type: job.type,
    description: job.description,
    requirements: job.requirements,
    salary_from: job.salaryFrom,
    salary_to: job.salaryTo,
    embedding: job.embedding,
  };
}

function poolSize(topK: number) {
  return Math.max(topK * 5, 30);
}

export async function findMatchingJobs(userId: bigint, topK = 10) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, skills: true },
  });

  if (!user?.profile) {
    return { error: 'User profile not found. Please complete your profile.', jobs: [] };
  }

  const profileEmbedding = normalizeEmbedding(user.profile.embedding);
  if (!profileEmbedding) {
    return { error: 'User profile embedding not found. Please update your profile.', jobs: [] };
  }

  const jobs = await prisma.job.findMany({
    where: { isActive: true, NOT: { embedding: { equals: Prisma.DbNull } } },
    include: { company: true },
  });

  if (!jobs.length) {
    return { error: 'No jobs with AI embeddings available yet. Ask an admin to index jobs.', jobs: [] };
  }

  const jobsArray = jobs.map((j: Job & { company?: { name: string } | null }) => mapJob(j));
  const userSkillTitles = user.skills.map((s: UserSkill) => normalizeSkill(s.title));
  const normalizedSkills = [...new Set(userSkillTitles)];

  const semanticMatches = findSimilar(profileEmbedding, jobsArray, poolSize(topK));
  const scored: Array<Record<string, unknown>> = [];

  for (const job of semanticMatches) {
    const semantic = Number(job.similarity ?? 0);
    const hybrid = computeHybridScore(normalizedSkills, extractJobSkillSets(job as { title?: string; requirements?: string; description?: string }), semantic);
    if (!hybrid.eligible) continue;
    scored.push({
      ...job,
      job_id: job.id,
      similarity_score: hybrid.final_score,
      semantic_score: hybrid.semantic_score,
      skill_score: hybrid.skill_score,
      skill_overlap_ratio: hybrid.skill_overlap_ratio,
      matched_skills: hybrid.matched_skills,
      missing_skills: hybrid.missing_skills,
      match_percentage: Math.round(hybrid.final_score * 10000) / 100,
      explanation:
        hybrid.matched_skills.length > 0
          ? `Strong skill overlap: ${hybrid.matched_skills.join(', ')}.`
          : `Profile similarity match (${Math.round(semantic * 100)}% semantic fit).`,
    });
  }

  scored.sort((a, b) => Number(b.similarity_score) - Number(a.similarity_score));
  const results = scored.slice(0, topK);

  if (!results.length) {
    return {
      error: 'No jobs found that match your skills and profile.',
      jobs: [],
      threshold: config.ragSimilarityThreshold,
    };
  }

  return {
    profile_text: user.profile.embeddingText,
    jobs: results,
    threshold_applied: config.ragSimilarityThreshold,
    scoring: 'hybrid',
    total_matches: results.length,
  };
}

export async function findCandidates(jobId: bigint, topK = 10) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) return { error: 'Job not found', candidates: [] };

  const jobEmbedding = normalizeEmbedding(job.embedding);
  if (!jobEmbedding) return { error: 'Job embedding not found.', candidates: [] };

  const profiles = await prisma.profile.findMany({
    where: { NOT: { embedding: { equals: Prisma.DbNull } } },
    include: { user: { include: { skills: true, workExperiences: true, education: true } } },
  });

  if (!profiles.length) {
    return { message: 'No candidate profile embeddings available.', candidates: [] };
  }

  const jobData = mapJob(job);
  const profilesArray = profiles.map((p) => ({
    id: p.id,
    user_id: p.userId,
    embedding: p.embedding,
    name: p.user.name,
    skills: p.user.skills.map((s: UserSkill) => s.title),
    user: p.user,
  }));

  const semanticMatches = findSimilar(jobEmbedding, profilesArray, poolSize(topK));
  const jobSkillSets = extractJobSkillSets(jobData);
  const scored: Array<Record<string, unknown>> = [];

  for (const candidate of semanticMatches) {
    const userSkills = ((candidate.skills as string[]) ?? []).map(normalizeSkill);
    const hybrid = computeHybridScore(userSkills, jobSkillSets, Number(candidate.similarity ?? 0));
    if (!hybrid.eligible) continue;
    scored.push({
      ...candidate,
      similarity_score: hybrid.final_score,
      semantic_score: hybrid.semantic_score,
      skill_score: hybrid.skill_score,
      matched_skills: hybrid.matched_skills,
      missing_skills: hybrid.missing_skills,
      match_percentage: Math.round(hybrid.final_score * 10000) / 100,
    });
  }

  scored.sort((a, b) => Number(b.similarity_score) - Number(a.similarity_score));
  const results = scored.slice(0, topK);

  if (!results.length) {
    return {
      message: 'No candidates matched the required skills for this job.',
      candidates: [],
      threshold: config.ragSimilarityThreshold,
    };
  }

  return {
    job_text: job.embeddingText,
    candidates: results,
    threshold_applied: config.ragSimilarityThreshold,
    scoring: 'hybrid',
    total_matches: results.length,
  };
}

export async function searchJobs(query: string, limit = 10) {
  const queryEmbedding = await generateEmbedding(query);

  const jobs = await prisma.job.findMany({
    where: { isActive: true, NOT: { embedding: { equals: Prisma.DbNull } } },
    include: { company: true },
  });

  if (!jobs.length) return { message: 'No jobs available', jobs: [] as unknown[] };

  const jobsArray = jobs.map((j: Job & { company?: { name: string } | null }) => mapJob(j));
  const similar = findSimilar(queryEmbedding, jobsArray, limit, config.ragSimilarityThreshold);

  const results = similar.map((job) => ({
    job_id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    type: job.type,
    salary_from: job.salary_from,
    salary_to: job.salary_to,
    similarity_score: Math.round(Number(job.similarity ?? 0) * 10000) / 10000,
    match_percentage: Math.round(Number(job.similarity ?? 0) * 10000) / 100,
    description: String(job.description ?? '').slice(0, 200) + '...',
    requirements: String(job.requirements ?? '').slice(0, 200) + '...',
  }));

  return { query, count: results.length, jobs: results };
}

export function validateProfileCompleteness(user: {
  profile: { professionalBio: string | null } | null;
  skills: unknown[];
}) {
  const missing: string[] = [];
  let score = 0;

  if (user.profile?.professionalBio && user.profile.professionalBio.length >= 50) {
    score += 50;
  } else {
    missing.push('professional_bio');
  }

  if (user.skills.length > 0) {
    score += 50;
  } else {
    missing.push('skills');
  }

  return { valid: score >= 50, score, missing };
}

export async function generateProfileEmbedding(userId: bigint, force = false): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, skills: true, workExperiences: true, education: true },
  });
  if (!user?.profile) return false;

  if (!force) {
    const v = validateProfileCompleteness(user);
    if (!v.valid) return false;
  }

  const parts: string[] = [];
  const p = user.profile;
  if (p.professionalBio) parts.push(`Professional Bio: ${p.professionalBio}`);
  if (p.yearsOfExperience) parts.push(`Years of Experience: ${p.yearsOfExperience}`);
  if (p.location) parts.push(`Location: ${p.location}`);
  if (user.skills.length) {
    parts.push('\nSkills:');
    for (const s of user.skills) {
      parts.push(`- ${s.title} (${s.proficiencyLevel}, ${s.yearsOfExperience} years)`);
    }
  }
  if (user.workExperiences.length) {
    parts.push('\nWork Experience:');
    for (const w of user.workExperiences) {
      parts.push(`- ${w.position} at ${w.companyName}`);
    }
  }
  if (user.education.length) {
    parts.push('\nEducation:');
    for (const e of user.education) {
      parts.push(`- ${e.degree} in ${e.fieldOfStudy} from ${e.institution}`);
    }
  }

  const text = parts.join('\n').trim();
  if (!text) return false;

  const embedding = await generateEmbedding(text);
  await prisma.profile.update({
    where: { id: p.id },
    data: {
      embedding: embedding as unknown as object,
      embeddingText: text,
      embeddingGeneratedAt: new Date(),
    },
  });
  return true;
}

export async function generateJobEmbedding(jobId: bigint): Promise<boolean> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) return false;

  const text = [
    `Title: ${job.title}`,
    `Company: ${job.company.name}`,
    `Location: ${job.location}`,
    `Type: ${job.type}`,
    `Description: ${job.description}`,
    `Requirements: ${job.requirements}`,
  ].join('\n');

  const embedding = await generateEmbedding(text);
  await prisma.job.update({
    where: { id: jobId },
    data: {
      embedding: embedding as unknown as object,
      embeddingText: text,
      embeddingGeneratedAt: new Date(),
    },
  });
  return true;
}

export async function generateAllJobEmbeddings(): Promise<number> {
  const jobs = await prisma.job.findMany({
    where: { OR: [{ embedding: { equals: Prisma.DbNull } }, { embeddingGeneratedAt: null }] },
  });
  let count = 0;
  for (const job of jobs) {
    if (await generateJobEmbedding(job.id)) count++;
  }
  return count;
}

export async function generateAllProfileEmbeddings(force = false): Promise<number> {
  const profiles = await prisma.profile.findMany({
    where: force
      ? {}
      : {
          OR: [
            { embedding: { equals: Prisma.DbNull } },
            { embeddingGeneratedAt: { lt: new Date(Date.now() - 30 * 86400000) } },
          ],
        },
    select: { userId: true },
  });
  let count = 0;
  for (const p of profiles) {
    if (await generateProfileEmbedding(p.userId, force)) count++;
  }
  return count;
}
