import { chatJson } from './openai.js';

const defaultCv = {
  personalInfo: {
    fullName: '',
    jobTitle: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    website: '',
  },
  summary: '',
  experience: [] as Record<string, unknown>[],
  education: [] as Record<string, unknown>[],
  skills: [] as string[],
  projects: [] as Record<string, unknown>[],
  achievements: [] as string[],
  languages: [] as string[],
  certifications: [] as string[],
};

type CvData = typeof defaultCv;

const FIELD_STEPS: Array<{
  key: keyof ReturnType<typeof buildStatus>;
  label: string;
  prompt: string;
  optional?: boolean;
}> = [
  { key: 'hasName', label: 'name', prompt: "**What's your full name?**" },
  { key: 'hasEmail', label: 'email', prompt: "**What's your email address?**" },
  { key: 'hasPhone', label: 'phone', prompt: "**What's your phone number?**" },
  { key: 'hasJobTitle', label: 'job title', prompt: "**What job title or role are you targeting?** (e.g. Front-End Developer)" },
  { key: 'hasSummary', label: 'summary', prompt: "**Tell me a short professional summary** — or say *\"write one for me\"* and I'll draft it." },
  {
    key: 'hasExperience',
    label: 'work experience',
    prompt: "**Tell me about your work experience** — company, role, dates. You can add more later.",
  },
  {
    key: 'hasEducation',
    label: 'education',
    prompt: "**What's your education?** (degree, school, years)",
  },
  {
    key: 'hasSkills',
    label: 'skills',
    prompt: "**What skills should we list?** (comma-separated, or say *\"suggest skills\"*)",
  },
  { key: 'hasProjects', label: 'projects', prompt: "**Any projects to highlight?** (optional — say *skip* to move on)", optional: true },
  { key: 'hasAchievements', label: 'achievements', prompt: "**Any achievements or awards?** (optional — say *skip* to finish)", optional: true },
];

function buildStatus(cv: CvData) {
  return {
    hasName: Boolean(cv.personalInfo.fullName?.trim()),
    hasEmail: Boolean(cv.personalInfo.email?.trim()),
    hasPhone: Boolean(cv.personalInfo.phone?.trim()),
    hasJobTitle: Boolean(cv.personalInfo.jobTitle?.trim()),
    hasSummary: Boolean(cv.summary?.trim()),
    hasExperience: (cv.experience?.length ?? 0) > 0,
    hasEducation: (cv.education?.length ?? 0) > 0,
    hasSkills: (cv.skills?.length ?? 0) > 0,
    hasProjects: (cv.projects?.length ?? 0) > 0,
    hasAchievements: (cv.achievements?.length ?? 0) > 0,
  };
}

export function completionStatus(cv: CvData) {
  const status = buildStatus(cv);
  const coreKeys = FIELD_STEPS.filter((s) => !s.optional).map((s) => s.key);
  const allKeys = FIELD_STEPS.map((s) => s.key);
  const coreDone = coreKeys.filter((k) => status[k]).length;
  const allDone = allKeys.filter((k) => status[k]).length;
  const percentage = Math.round((allDone / allKeys.length) * 100);
  const next = getNextStep(status);

  return {
    status,
    completed: allDone,
    total: allKeys.length,
    percentage,
    ready: coreDone >= coreKeys.length,
    next_field: next?.label ?? null,
    next_prompt: next?.prompt ?? null,
  };
}

function getNextStep(status: ReturnType<typeof buildStatus>) {
  for (const step of FIELD_STEPS) {
    if (!status[step.key]) return step;
  }
  return null;
}

function normalizeExtracted(data: Record<string, unknown>): CvData {
  const merged = {
    ...defaultCv,
    ...data,
    personalInfo: { ...defaultCv.personalInfo, ...(data.personalInfo as object) },
  };
  merged.experience = (merged.experience ?? []).map((exp, i) => ({
    ...exp,
    id: exp.id ?? `exp_${i + 1}`,
    position: exp.position ?? exp.title,
  }));
  merged.education = (merged.education ?? []).map((edu, i) => ({
    ...edu,
    id: edu.id ?? `edu_${i + 1}`,
    university: edu.university ?? edu.institution,
  }));
  return merged;
}

function fallbackExtract(message: string, data: CvData): CvData {
  const out = structuredClone(data);
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'skip' || lower === 'next') {
    return out;
  }

  const nameMatch = trimmed.match(/(?:my name is|i'm|i am|name is|name:)\s+([A-Za-z\s.'-]{2,40})/i);
  if (nameMatch && !out.personalInfo.fullName) {
    out.personalInfo.fullName = nameMatch[1].trim();
  } else if (!out.personalInfo.fullName && /^[A-Za-z\s.'-]{2,40}$/.test(trimmed) && !trimmed.includes('@')) {
    out.personalInfo.fullName = trimmed;
  }

  const emailMatch = trimmed.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) out.personalInfo.email = emailMatch[0];

  const phoneMatch = trimmed.match(/[\+]?[\d\s\-()]{7,}/);
  if (phoneMatch && !trimmed.includes('@')) out.personalInfo.phone = phoneMatch[0].trim();

  if (!out.personalInfo.jobTitle && /developer|engineer|designer|manager|analyst|consultant/i.test(trimmed)) {
    out.personalInfo.jobTitle = trimmed.replace(/^(i am a|i'm a)\s+/i, '').trim();
  }

  if (!out.summary && (lower.includes('summary') || lower.includes('write one for me'))) {
    out.summary = `Motivated ${out.personalInfo.jobTitle || 'professional'} with a strong track record of delivering results.`;
  }

  const skillsMatch = trimmed.match(/skills?[:\s]*(.+)/i);
  if (skillsMatch) {
    const skills = skillsMatch[1].split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    out.skills = [...new Set([...out.skills, ...skills])];
  } else if (!out.skills.length && trimmed.includes(',')) {
    out.skills = trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }

  const expMatch = trimmed.match(/(?:worked at|at)\s+([^,]+?)(?:\s+as\s+([^,]+))?(?:\s+from\s+(\d{4}))?/i);
  if (expMatch) {
    out.experience.push({
      id: `exp_${out.experience.length + 1}`,
      company: expMatch[1].trim(),
      position: expMatch[2]?.trim() || out.personalInfo.jobTitle || 'Role',
      startDate: expMatch[3] || '',
      endDate: 'Present',
      description: '',
      responsibilities: [],
    });
  }

  const eduMatch = trimmed.match(/(?:bachelor|degree|studied)\s+(.+?)\s+(?:at|from)\s+(.+)/i);
  if (eduMatch) {
    out.education.push({
      id: `edu_${out.education.length + 1}`,
      degree: eduMatch[1].trim(),
      university: eduMatch[2].trim(),
      startDate: '',
      endDate: '',
    });
  }

  if (lower.includes('achievement') || lower.includes('award')) {
    out.achievements.push(trimmed);
  }

  return out;
}

function describeChanges(old: CvData, updated: CvData): string[] {
  const changes: string[] = [];
  if (updated.personalInfo.fullName && !old.personalInfo.fullName) {
    changes.push(`name (${updated.personalInfo.fullName})`);
  }
  if (updated.personalInfo.email && !old.personalInfo.email) changes.push('email');
  if (updated.personalInfo.phone && !old.personalInfo.phone) changes.push('phone');
  if (updated.personalInfo.jobTitle && !old.personalInfo.jobTitle) {
    changes.push(`job title (${updated.personalInfo.jobTitle})`);
  }
  if (updated.summary && !old.summary) changes.push('summary');
  if (updated.skills.length > old.skills.length) {
    changes.push(`${updated.skills.length - old.skills.length} skill(s)`);
  }
  if (updated.experience.length > old.experience.length) changes.push('work experience');
  if (updated.education.length > old.education.length) changes.push('education');
  if (updated.projects.length > old.projects.length) changes.push('project');
  if (updated.achievements.length > old.achievements.length) changes.push('achievement');
  return changes;
}

function buildResponseMessage(old: CvData, updated: CvData, userMessage: string): string {
  const completion = completionStatus(updated);
  const changes = describeChanges(old, updated);
  const skipped = /^(skip|next)$/i.test(userMessage.trim());

  let ack = '';
  if (changes.length) {
    ack = `✅ Great! Added: **${changes.join(', ')}**`;
  } else if (skipped) {
    ack = '👍 Skipped — we can come back to that later.';
  } else if (JSON.stringify(old) !== JSON.stringify(updated)) {
    ack = '✅ Updated your CV.';
  } else {
    ack = "I didn't catch new details — try again or rephrase.";
  }

  if (completion.ready && !getNextStep(completion.status)) {
    return `${ack}\n\n🎉 **Your core CV is complete!** Click **Generate CV** or keep adding projects/achievements.`;
  }

  const next = getNextStep(completion.status);
  if (next) {
    return `${ack}\n\n**Next:** ${next.prompt}\n\n_(You can also paste several details at once, or say **skip** for optional sections.)_`;
  }

  return `${ack}\n\n🎉 **All sections filled!** Click **Generate CV** when you're ready.`;
}

export const cvGeneratorService = {
  start() {
    const cv = structuredClone(defaultCv);
    const completion = completionStatus(cv);
    return {
      success: true,
      message: `👋 **Hello! I'm your Smart AI CV Builder!**

I'll guide you step by step. Answer one question at a time — or paste several details together.

**Next:** ${FIELD_STEPS[0].prompt}`,
      cv_data: cv,
      completion,
    };
  },

  async message(userMessage: string, currentCvData: Record<string, unknown> = {}) {
    const old = normalizeExtracted(currentCvData as Record<string, unknown>);
    const trimmed = userMessage.trim();

    let updated = old;

    if (/^(skip|next)$/i.test(trimmed)) {
      updated = old;
    } else {
      const prompt = `Extract CV data from the user message and merge with existing JSON. Return ONLY valid JSON with the same structure as CURRENT. Preserve existing fields unless the user updates them.

CURRENT:
${JSON.stringify(old)}

USER MESSAGE:
"${trimmed}"`;

      try {
        const extracted = await chatJson(
          [
            {
              role: 'system',
              content:
                'CV data extraction expert. Return ONLY valid JSON matching personalInfo, summary, experience[], education[], skills[], projects[], achievements[]. Add IDs on array items.',
            },
            { role: 'user', content: prompt },
          ],
          0.1,
          2500,
        );
        updated = normalizeExtracted(extracted);
      } catch {
        updated = fallbackExtract(trimmed, old);
      }

      // Merge AI result with fallback for any fields still empty
      const fallback = fallbackExtract(trimmed, old);
      if (!updated.personalInfo.fullName && fallback.personalInfo.fullName) {
        updated.personalInfo.fullName = fallback.personalInfo.fullName;
      }
      if (!updated.personalInfo.email && fallback.personalInfo.email) {
        updated.personalInfo.email = fallback.personalInfo.email;
      }
      if (!updated.personalInfo.phone && fallback.personalInfo.phone) {
        updated.personalInfo.phone = fallback.personalInfo.phone;
      }
    }

    return {
      success: true,
      message: buildResponseMessage(old, updated, trimmed),
      cv_data: updated,
      completion: completionStatus(updated),
    };
  },

  async generate(cvData: Record<string, unknown>) {
    const prompt = `Create a complete ATS-optimized CV JSON from this data. Preserve personalInfo exactly.\n\n${JSON.stringify(cvData)}`;
    try {
      const result = await chatJson(
        [
          { role: 'system', content: 'You are an expert CV writer. Return ONLY valid JSON.' },
          { role: 'user', content: prompt },
        ],
        0.7,
        4500,
      );
      const pi = (cvData.personalInfo ?? {}) as Record<string, string>;
      const cv = normalizeExtracted(result);
      cv.personalInfo.fullName = pi.fullName ?? cv.personalInfo.fullName;
      cv.personalInfo.jobTitle = pi.jobTitle ?? cv.personalInfo.jobTitle;
      cv.personalInfo.email = pi.email ?? cv.personalInfo.email;
      cv.personalInfo.phone = pi.phone ?? cv.personalInfo.phone;
      return { success: true, cv: { ...result, personalInfo: cv.personalInfo, atsScore: result.atsScore ?? 95 } };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Generate failed', cv: cvData };
    }
  },

  reset() {
    return { success: true, message: 'Reset complete' };
  },
};
