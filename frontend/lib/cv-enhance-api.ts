import { ENHANCE_API } from './api';

export interface AtsBreakdownItem {
  id: string;
  label: string;
  score: number;
  max: number;
  tip: string;
}

export interface AuditResult {
  atsScore: number;
  scoreBreakdown: AtsBreakdownItem[];
  missingSections: string[];
  suggestions: string[];
  strengths: string[];
  improvements: string[];
  whyThisScore?: string;
  isValidCV?: boolean;
  name?: string;
}

export interface OptimizeResult {
  originalText: string;
  optimizedText: string;
  beforeScore: number;
  afterScore: number;
  beforeBreakdown: AtsBreakdownItem[];
  afterBreakdown: AtsBreakdownItem[];
  scoreDelta: number;
  improved: boolean;
  revertedToOriginal?: boolean;
  changes: string[];
  missingSections: string[];
  suggestions: string[];
  whyThisScore?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ENHANCE_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function uploadCvFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${ENHANCE_API}/upload`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data.text as string;
}

export async function auditCv(cvText: string, jobDescription?: string): Promise<AuditResult> {
  const data = await postJson<{ result: Record<string, unknown> }>('/analyze', {
    cv_text: cvText,
    job_description: jobDescription || undefined,
  });
  const r = data.result;
  return {
    atsScore: Number(r.atsScore ?? 0),
    scoreBreakdown: (r.scoreBreakdown as AtsBreakdownItem[]) ?? [],
    missingSections: (r.missingSections as string[]) ?? [],
    suggestions: (r.suggestions as string[]) ?? [],
    strengths: (r.strengths as string[]) ?? [],
    improvements: (r.improvements as string[]) ?? [],
    whyThisScore: r.whyThisScore as string | undefined,
    isValidCV: r.isValidCV as boolean | undefined,
    name: r.name as string | undefined,
  };
}

export async function optimizeCv(cvText: string, jobDescription?: string): Promise<OptimizeResult> {
  return postJson<OptimizeResult>('/optimize', {
    cv_text: cvText,
    job_description: jobDescription || undefined,
  });
}

export async function downloadOptimizedPdf(cvText: string): Promise<Blob> {
  const res = await fetch(`${ENHANCE_API}/generate-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv_text: cvText }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'PDF generation failed');
  }
  return res.blob();
}
