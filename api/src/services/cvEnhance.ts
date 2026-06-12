import pdfParse from 'pdf-parse';
import { chatJson, chatText } from './openai.js';
import { scoreCv, type AtsScoreResult } from './atsScoring.js';

function validateCvDocument(cvText: string): [boolean, string, string] {
  const text = cvText.trim();
  if (text.length < 120) return [false, 'OTHER', 'Document is too short to be a resume.'];

  const lower = text.toLowerCase();
  for (const hint of ['invoice', 'receipt', 'purchase order', 'terms and conditions', 'privacy policy']) {
    if (lower.includes(hint)) return [false, 'OTHER', 'This document does not appear to be a resume.'];
  }

  const signals = [
    /[\w.+-]+@[\w.-]+\.\w+/.test(text) || /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/.test(text),
    /(?:work experience|professional experience|employment history|experience)/i.test(text),
    /(?:education|bachelor|master|phd|university|college|degree)/i.test(text),
    /\bskills?\b/i.test(text),
  ];

  if (signals.filter(Boolean).length < 2) {
    return [false, 'OTHER', 'Not enough resume content detected.'];
  }

  return [true, 'CV', ''];
}

function extractContacts(cvText: string) {
  const email = cvText.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? '';
  const phone = cvText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)?.[0] ?? '';
  const linkedin = cvText.match(/linkedin\.com\/[\w/-]+/i)?.[0] ?? '';
  const name = cvText.split(/\r?\n/).find((l) => {
    const s = l.trim();
    return s.length > 2 && s.length < 60 && /^[A-Za-z]/.test(s) && !/@|http|linkedin/i.test(s);
  }) ?? '';
  return { name: name.trim(), email, phone, linkedin };
}

function nonCvResult(documentType: string, reason: string) {
  const scored = scoreCv('');
  return {
    success: true,
    result: {
      name: '',
      email: '',
      phone: '',
      summary: '',
      skills: [],
      experience: [],
      education: [],
      strengths: [],
      improvements: ['Upload a resume/CV with work experience, skills, and education sections.'],
      weaknesses: [reason],
      atsScore: 0,
      overallScore: 0,
      scoreBreakdown: scored.breakdown,
      missingSections: scored.missingSections,
      suggestions: scored.suggestions,
      isValidCV: false,
      documentType,
      whyThisScore: reason,
    },
  };
}

function parseDocxText(buffer: Buffer): string {
  const raw = buffer.toString('utf8');
  const tags = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  if (tags?.length) {
    return tags.map((t) => t.replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
  }
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildWhyThisScore(scored: AtsScoreResult): string {
  const weak = scored.breakdown.filter((b) => b.score < b.max * 0.5).map((b) => b.label);
  let msg = `Score ${scored.score}/100 from a fixed rubric (contact, sections, dates, metrics, verbs, skills, education, length).`;
  if (weak.length) msg += ` Weakest: ${weak.slice(0, 3).join(', ')}.`;
  return msg;
}

function deriveStrengths(scored: AtsScoreResult): string[] {
  return scored.breakdown
    .filter((b) => b.score >= b.max * 0.8)
    .map((b) => b.tip)
    .filter((t) => !t.toLowerCase().startsWith('add '));
}

function normalizeSectionHeaders(text: string): string {
  let out = text;
  const replacements: [RegExp, string][] = [
    [/^(profile|about me|objective)\s*$/gim, 'PROFESSIONAL SUMMARY'],
    [/^(employment history|experience)\s*$/gim, 'WORK EXPERIENCE'],
    [/^(technical skills|core competencies)\s*$/gim, 'SKILLS'],
    [/^(academic background|qualifications)\s*$/gim, 'EDUCATION'],
  ];
  for (const [pattern, header] of replacements) {
    out = out.replace(pattern, header);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function ensureContactBlock(text: string, contacts: ReturnType<typeof extractContacts>): string {
  const lines = text.split(/\r?\n/);
  const top = lines.slice(0, 8).join('\n');
  const block: string[] = [];
  if (contacts.email && !top.includes(contacts.email)) block.push(contacts.email);
  if (contacts.phone && !top.includes(contacts.phone)) block.push(contacts.phone);
  if (contacts.linkedin && !top.toLowerCase().includes('linkedin')) block.push(contacts.linkedin);
  if (!block.length) return text;
  const nameIdx = lines.findIndex((l) => l.trim().length > 0);
  const insertAt = nameIdx >= 0 ? nameIdx + 1 : 0;
  const merged = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
  return merged.join('\n');
}

function buildChanges(before: AtsScoreResult, after: AtsScoreResult): string[] {
  const changes: string[] = [];
  for (const item of after.breakdown) {
    const prev = before.breakdown.find((b) => b.id === item.id);
    if (!prev) continue;
    if (item.score > prev.score) {
      changes.push(`${item.label}: +${item.score - prev.score} pts (${prev.score} → ${item.score})`);
    }
  }
  if (!changes.length && after.score === before.score) {
    changes.push('Reformatted for ATS parsing; score unchanged on current rubric.');
  }
  if (after.score < before.score) {
    changes.push('Optimized layout did not raise the rubric score — review suggestions and edit manually.');
  }
  return changes;
}

export const cvEnhanceService = {
  score(cvText: string) {
    const scored = scoreCv(cvText.trim());
    return { success: true, ...scored, whyThisScore: buildWhyThisScore(scored) };
  },

  async parseUpload(filename: string, mimetype: string, buffer: Buffer) {
    try {
      const ext = filename.split('.').pop()?.toLowerCase() ?? '';
      let text = '';

      if (ext === 'pdf' || mimetype === 'application/pdf') {
        const parsed = await pdfParse(buffer);
        text = parsed.text ?? '';
      } else if (ext === 'docx' || mimetype.includes('wordprocessingml')) {
        text = parseDocxText(buffer);
      } else if (ext === 'txt' || mimetype === 'text/plain') {
        text = buffer.toString('utf8');
      } else if (ext === 'doc') {
        text = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        return { success: false, error: 'Unsupported file type. Upload PDF, DOCX, or TXT.' };
      }

      if (!text.trim()) {
        return { success: false, error: 'Could not extract text from the file.' };
      }

      return { success: true, text, filename, wordCount: text.split(/\s+/).length };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Parse failed' };
    }
  },

  async analyze(
    cvText: string,
    jobDescription?: string | null,
    _structured?: Record<string, unknown> | null,
    altText?: string | null,
  ) {
    const source = (cvText || altText || '').trim();
    const [isCv, docType, reason] = validateCvDocument(source);
    if (!isCv) return nonCvResult(docType, reason);

    const scored = scoreCv(source);
    const contacts = extractContacts(source);

    let extracted: Record<string, unknown> = {};
    try {
      extracted = await chatJson(
        [
          {
            role: 'system',
            content: 'Extract resume fields. Output JSON only: name, email, phone, linkedin, summary, skills[], education[], experienceEntries[{company,title,period,bullets[]}].',
          },
          {
            role: 'user',
            content: `Extract from CV:\n${source.slice(0, 12000)}\n\nJob context:\n${jobDescription ?? 'General'}`,
          },
        ],
        0.1,
      );
    } catch {
      extracted = {};
    }

    const strengths = deriveStrengths(scored);
    const improvements = scored.suggestions.length
      ? scored.suggestions
      : ['Add quantified achievements and standard section headers.'];

    const result = {
      ...extracted,
      name: extracted.name || contacts.name,
      email: extracted.email || contacts.email,
      phone: extracted.phone || contacts.phone,
      linkedin: extracted.linkedin || contacts.linkedin,
      strengths,
      improvements,
      missingSections: scored.missingSections,
      suggestions: scored.suggestions,
      atsScore: scored.score,
      overallScore: scored.score,
      scoreBreakdown: scored.breakdown,
      isValidCV: true,
      documentType: 'CV',
      sourceText: source,
      whyThisScore: buildWhyThisScore(scored),
    };

    return { success: true, result };
  },

  async optimize(cvText: string, jobDescription?: string | null) {
    const source = cvText.trim();
    const [isCv, docType, reason] = validateCvDocument(source);
    if (!isCv) {
      return { success: false, error: reason, documentType: docType };
    }

    const before = scoreCv(source);
    const contacts = extractContacts(source);

    let optimizedRaw = '';
    try {
      optimizedRaw = await chatText(
        [
          {
            role: 'system',
            content: `You are an ATS resume formatter. Output ONLY plain-text resume content.

Rules:
- Use these exact section headers on their own line: PROFESSIONAL SUMMARY, WORK EXPERIENCE, SKILLS, EDUCATION
- Name on first line, then email | phone | linkedin on one line if available
- Work entries: Job Title at Company | Date range, then bullet lines starting with "- "
- Use strong action verbs; quantify ONLY with numbers already implied in the source
- NEVER invent employers, job titles, dates, degrees, certifications, or skills not supported by the original
- No markdown, no tables, no columns, no decorative symbols
- Keep every fact from the original; improve wording and structure only`,
          },
          {
            role: 'user',
            content: `Optimize this CV for ATS systems.

${jobDescription?.trim() ? `Target role context:\n${jobDescription.slice(0, 4000)}\n\n` : ''}Original CV:
${source.slice(0, 14000)}`,
          },
        ],
        0.25,
      );
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Optimization failed' };
    }

    let optimizedText = normalizeSectionHeaders(optimizedRaw.replace(/^```[\w]*\n?|\n?```$/g, '').trim());
    optimizedText = ensureContactBlock(optimizedText, contacts);

    const after = scoreCv(optimizedText);
    const improved = after.score > before.score;
    const finalText = improved || after.score === before.score ? optimizedText : source;
    const finalScored = improved || after.score === before.score ? after : before;

    return {
      success: true,
      originalText: source,
      optimizedText: finalText,
      beforeScore: before.score,
      afterScore: finalScored.score,
      beforeBreakdown: before.breakdown,
      afterBreakdown: finalScored.breakdown,
      missingSections: finalScored.missingSections,
      suggestions: finalScored.suggestions,
      improved,
      scoreDelta: finalScored.score - before.score,
      changes: buildChanges(before, finalScored),
      whyThisScore: buildWhyThisScore(finalScored),
      revertedToOriginal: !improved && after.score < before.score,
    };
  },

  async generatePdfFromText(cvText: string) {
    return cvText.trim();
  },

  templates() {
    return {
      templates: [{ id: 'ats_plain', name: 'ATS Plain Text', colors: ['#000000'], fonts: ['Helvetica'] }],
    };
  },
};
