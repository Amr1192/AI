export interface CVAnalysisResult {
  extractedInfo: {
    name?: string;
    email?: string;
    phone?: string;
    skills: string[];
    experience: string[];
    education: string[];
    companies: string[];
    jobTitles: string[];
  };
  analysis: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    atsScore: number;
    overallScore: number;
  };
  summary: string;
  jobMatches: {
    role: string;
    matchScore: number;
    reason: string;
    linkedinUrl?: string;
    googleJobsUrl?: string;
  }[];
  sections?: {
    contact?: {
      emails: string[];
      phones: string[];
      links: string[];
    };
    summary?: string;
    skills?: {
      technical: string[];
      soft: string[];
      tools: string[];
    };
    experience?: Array<{
      company?: string | null;
      title?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      details?: string;
      bullets?: string[];
    }>;
    education?: Array<{
      institution?: string | null;
      degree?: string | null;
      details?: string;
    }>;
    projects?: string[];
    certifications?: string[];
    languages?: string[];
  };
  ats?: {
    score: number;
    reasons: string[];
    keywordMatches?: {
      skillsFound: string[];
      count: number;
    };
  };
  isValidCV?: boolean;
  documentType?: string;
}

export interface UploadedFile {
  file: File;
  id: string;
  name: string;
  size: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";

class CVAnalysisService {
  /**
   * Uploads the CV file to the backend and gets AI analysis (using Crew AI via your Laravel backend).
   */
  async analyzeCV(file: File): Promise<CVAnalysisResult> {
    const formData = new FormData();
    formData.append("cv", file);

    const response = await fetch(`${API_BASE}/cv/analyze`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      let errorMessage = "Server error";
      try {
        const errorRes = await response.json();
        errorMessage = errorRes.error || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }
    const res = await response.json();
    let result: unknown = res?.result ?? res;
    // If backend returned a JSON string, parse it
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        // If parsing fails, throw a clearer error for the UI
        throw new Error("Analysis result was not valid JSON. Please try a different CV or check the backend parser.");
      }
    }
    return result as CVAnalysisResult;
  }
}

export const cvAnalysisService = new CVAnalysisService();
