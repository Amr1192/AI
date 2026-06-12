/** Transparent, deterministic ATS scoring — same rubric for audit and post-optimize. */

export interface AtsBreakdownItem {
  id: string;
  label: string;
  score: number;
  max: number;
  tip: string;
}

export interface AtsScoreResult {
  score: number;
  breakdown: AtsBreakdownItem[];
  missingSections: string[];
  suggestions: string[];
}

const ACTION_VERBS =
  /\b(led|managed|developed|implemented|designed|built|created|improved|increased|reduced|achieved|delivered|coordinated|optimized|automated|launched|spearheaded|streamlined)\b/gi;

const QUANT_PATTERN = /\b\d+%|\b\d+\+|\$\d|(?:\d{1,3}(?:,\d{3})+)|\b\d+\s*(?:years?|months?|users?|clients?|projects?|team members?)\b/i;

function hasSection(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function scoreCv(cvText: string): AtsScoreResult {
  const text = cvText.trim();
  const lower = text.toLowerCase();

  const breakdown: AtsBreakdownItem[] = [];

  const emailScore = /[\w.+-]+@[\w.-]+\.\w+/.test(text) ? 10 : 0;
  breakdown.push({
    id: 'email',
    label: 'Email address',
    score: emailScore,
    max: 10,
    tip: emailScore ? 'Email found' : 'Add a professional email at the top',
  });

  const phoneScore = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/.test(text) ? 8 : 0;
  breakdown.push({
    id: 'phone',
    label: 'Phone number',
    score: phoneScore,
    max: 8,
    tip: phoneScore ? 'Phone found' : 'Add a phone number recruiters can reach',
  });

  const linkedinScore = /linkedin\.com/i.test(text) ? 5 : 0;
  breakdown.push({
    id: 'linkedin',
    label: 'LinkedIn URL',
    score: linkedinScore,
    max: 5,
    tip: linkedinScore ? 'LinkedIn listed' : 'Add your LinkedIn profile URL',
  });

  const headersOk =
    hasSection(lower, [/professional summary|summary|profile/]) &&
    hasSection(lower, [/work experience|professional experience|employment/]) &&
    hasSection(lower, [/\bskills\b/]) &&
    hasSection(lower, [/education|degree|university/]);
  const headerScore = headersOk ? 18 : hasSection(lower, [/experience|skills|education/]) ? 10 : 0;
  breakdown.push({
    id: 'sections',
    label: 'Standard section headers',
    score: headerScore,
    max: 18,
    tip: headersOk
      ? 'Clear ATS-friendly sections'
      : 'Use headers: PROFESSIONAL SUMMARY, WORK EXPERIENCE, SKILLS, EDUCATION',
  });

  const dateScore = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/|\d{4})\s*[-–—to]+\s*(?:present|current|\d{4}|\d{1,2}\/)/i.test(text)
    ? 12
    : /\d{4}/.test(text)
      ? 6
      : 0;
  breakdown.push({
    id: 'dates',
    label: 'Dates on experience',
    score: dateScore,
    max: 12,
    tip: dateScore >= 12 ? 'Employment dates detected' : 'Add date ranges (e.g. Jan 2020 – Present)',
  });

  const quantMatches = text.match(QUANT_PATTERN) ?? [];
  const quantScore = clamp(quantMatches.length * 4, 0, 16);
  breakdown.push({
    id: 'metrics',
    label: 'Quantified achievements',
    score: quantScore,
    max: 16,
    tip: quantScore >= 12 ? 'Strong use of numbers and metrics' : 'Add metrics (% growth, team size, revenue, etc.)',
  });

  const verbMatches = text.match(ACTION_VERBS) ?? [];
  const verbScore = clamp(verbMatches.length * 2, 0, 12);
  breakdown.push({
    id: 'verbs',
    label: 'Action verbs',
    score: verbScore,
    max: 12,
    tip: verbScore >= 8 ? 'Good action-oriented language' : 'Start bullets with verbs: Led, Built, Improved…',
  });

  const skillsScore = hasSection(lower, [/\bskills\b|\btechnical skills\b|\bcore competencies\b/]) ? 10 : 0;
  breakdown.push({
    id: 'skills',
    label: 'Skills section',
    score: skillsScore,
    max: 10,
    tip: skillsScore ? 'Skills section present' : 'Add a dedicated SKILLS section',
  });

  const eduScore = hasSection(lower, [/education|bachelor|master|degree|university|college/]) ? 9 : 0;
  breakdown.push({
    id: 'education',
    label: 'Education',
    score: eduScore,
    max: 9,
    tip: eduScore ? 'Education documented' : 'Add degree, institution, and graduation year',
  });

  const len = text.length;
  const lengthScore = len >= 600 && len <= 6000 ? 10 : len >= 300 ? 5 : 0;
  breakdown.push({
    id: 'length',
    label: 'Content depth',
    score: lengthScore,
    max: 10,
    tip: lengthScore >= 10 ? 'Good length for ATS parsing' : 'Expand with role details and achievements',
  });

  const score = clamp(breakdown.reduce((sum, b) => sum + b.score, 0), 0, 100);

  const missingSections: string[] = [];
  if (!emailScore) missingSections.push('Email address');
  if (!phoneScore) missingSections.push('Phone number');
  if (!linkedinScore) missingSections.push('LinkedIn URL');
  if (!hasSection(lower, [/professional summary|summary|profile/])) missingSections.push('Professional summary');
  if (!hasSection(lower, [/work experience|professional experience|employment/])) missingSections.push('Work experience');
  if (!skillsScore) missingSections.push('Skills section');
  if (!eduScore) missingSections.push('Education');
  if (quantScore < 8) missingSections.push('Quantified achievements (numbers, %)');
  if (verbScore < 6) missingSections.push('Strong action verbs in bullets');
  if (dateScore < 6) missingSections.push('Employment dates');

  const suggestions: string[] = [];
  for (const item of breakdown) {
    if (item.score < item.max * 0.6) suggestions.push(item.tip);
  }

  return { score, breakdown, missingSections, suggestions };
}
