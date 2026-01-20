"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { authService } from "@/lib/authService";

interface Candidate {
  user_id: number;
  name: string;
  email: string;
  professional_bio: string | null;
  match_percentage: number;
  similarity_score: number;
  explanation: string;
}

export default function RelevantCandidatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const jobId = searchParams.get("job_id");

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [jobInfo, setJobInfo] = useState<any>(null);

  const fetchCandidates = async () => {
    if (!jobId) return;

    try {
      const res = await authService.getCandidatesForJob(Number(jobId), 10);
      setCandidates(res.candidates || []);
      setJobInfo(res.job || null);
      setMessage(res.message || "");
    } catch (err: any) {
      console.error(err);
      setMessage("Failed to load candidate recommendations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={authService.getUser()} />

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="bg-white p-8 rounded-lg shadow">
          {/* Header */}
          {jobInfo && (
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-primary mb-2">
                Candidates for: {jobInfo.title}
              </h1>
              <p className="text-muted-foreground">{jobInfo.company}</p>
            </div>
          )}

          {message && (
            <div className="flex items-start bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5 mr-3 text-blue-700 mt-1" />
              <p className="text-blue-800">{message}</p>
            </div>
          )}

          {/* Candidate List */}
          {candidates.length > 0 ? (
            <div className="space-y-6">
              {candidates.map((c) => (
                <div
                  key={c.user_id}
                  className="border border-border rounded-lg p-6 hover:shadow transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-semibold">{c.name}</h2>
                      <p className="text-muted-foreground">{c.email}</p>
                    </div>

                    <div className="bg-accent text-white px-3 py-1 rounded-full font-bold">
                      {c.match_percentage.toFixed(0)}% Match
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="mt-4">
                    <p className="font-medium">Professional Bio:</p>
                    <p className="text-muted-foreground">
                      {c.professional_bio || "No bio available"}
                    </p>
                  </div>

                  {/* Explanation */}
                  <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg mt-4">
                    <p className="font-medium text-purple-900">
                      🤖 AI Match Explanation:
                    </p>
                    <p className="text-purple-800 text-sm">{c.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-10">
              No relevant candidates found.
            </p>
          )}

          {/* Back Button */}
          <div className="mt-8">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="w-full"
            >
              Back
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
