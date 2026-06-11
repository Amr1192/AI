"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Users, ArrowLeft } from "lucide-react";
import { authService } from "@/lib/authService";

interface Candidate {
  user_id: number;
  name: string;
  email: string;
  professional_bio: string | null;
  match_percentage: number;
  similarity_score: number;
  explanation: string;
  matched_skills?: string[];
  missing_skills?: string[];
}

function RelevantCandidatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jobInfo, setJobInfo] = useState<{
    id: number;
    title: string;
    company: string;
  } | null>(null);

  const fetchCandidates = async () => {
    if (!jobId) {
      setError("No job was selected. Open this page from a job card.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await authService.getCandidatesForJob(Number(jobId), 10);
      setCandidates(res.candidates || []);
      setJobInfo(res.job || null);
      setMessage(res.message || "");
    } catch (err: any) {
      console.error(err);
      const detail =
        typeof err === "string"
          ? err
          : err?.message || "Failed to load candidate recommendations.";
      setError(detail);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="bg-white/90 backdrop-blur-lg border border-purple-200 rounded-3xl shadow-xl p-8">
        {jobInfo && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-2 rounded-xl">
                <Users className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-slate-800">
                Relevant candidates
              </h1>
            </div>
            <p className="text-slate-600 ml-12">
              <span className="font-semibold text-slate-800">{jobInfo.title}</span>
              {" · "}
              {jobInfo.company}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start bg-red-50 border border-red-200 p-4 rounded-xl mb-6">
            <AlertCircle className="w-5 h-5 mr-3 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-800 font-medium">Could not load candidates</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-red-200"
                onClick={fetchCandidates}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {message && !error && (
          <div className="flex items-start bg-blue-50 border border-blue-200 p-4 rounded-xl mb-6">
            <AlertCircle className="w-5 h-5 mr-3 text-blue-700 mt-1 shrink-0" />
            <p className="text-blue-800 text-sm">{message}</p>
          </div>
        )}

        {candidates.length > 0 ? (
          <div className="space-y-4">
            {candidates.map((c) => (
              <div
                key={c.user_id}
                className="border border-purple-100 rounded-2xl p-6 bg-purple-50/30 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800">{c.name}</h2>
                    <p className="text-slate-500 text-sm">{c.email}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white px-3 py-1 rounded-full font-bold text-sm shrink-0">
                    {Number(c.match_percentage).toFixed(0)}% match
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700">Professional bio</p>
                  <p className="text-slate-600 text-sm mt-1">
                    {c.professional_bio || "No bio available"}
                  </p>
                </div>

                {(c.matched_skills?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.matched_skills!.map((skill) => (
                      <span
                        key={skill}
                        className="text-xs font-medium bg-green-100 text-green-800 px-2 py-1 rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                <div className="bg-white border border-purple-100 p-4 rounded-xl mt-4">
                  <p className="font-medium text-purple-900 text-sm">Match explanation</p>
                  <p className="text-purple-800 text-sm mt-1">{c.explanation}</p>
                  {(c.missing_skills?.length ?? 0) > 0 && (
                    <p className="text-slate-500 text-xs mt-2">
                      Missing: {c.missing_skills!.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !error && (
            <div className="text-center text-slate-500 py-10 space-y-3">
              <p>No relevant candidates found for this job yet.</p>
              <p className="text-sm">
                Ensure users have skills/bio on their profiles, then index embeddings from the backend:
              </p>
              <code className="text-xs bg-slate-100 px-3 py-2 rounded-lg inline-block">
                php artisan embeddings:generate profiles
              </code>
            </div>
          )
        )}

        <div className="mt-8 flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/admin/jobs")}
            className="flex-1 border-purple-200 rounded-xl"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to jobs
          </Button>
          <Button
            onClick={fetchCandidates}
            className="flex-1 bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-xl border-0"
          >
            Refresh matches
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function RelevantCandidatesPage() {
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
          </div>
        }
      >
        <RelevantCandidatesContent />
      </Suspense>
    </div>
  );
}
