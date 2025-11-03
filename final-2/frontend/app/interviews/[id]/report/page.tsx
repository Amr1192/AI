"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export default function InterviewReportPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/interviews/${id}`);
        const j = await res.json();
        setData(j);
      } catch (e) {
        console.error("Failed to load interview:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-8">Loading report...</div>;
  if (!data) return <div className="p-8 text-red-500">Error loading report.</div>;

  const overall = data.overall;
  const answers = data.answers || [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interview Report #{data.id}</h1>
        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      {/* Overall Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-3">Overall Summary</h3>
        {overall ? (
          <div className="space-y-3">
            <div className="flex gap-8 text-sm">
              <div>
                <b>Clarity:</b> {overall.clarity ?? "—"}
              </div>
              <div>
                <b>Confidence:</b> {overall.confidence ?? "—"}
              </div>
              <div>
                <b>Structure:</b> {overall.structure ?? "—"}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{overall.summary}</p>
            {overall.tips && overall.tips.length > 0 && (
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                {overall.tips.map((t: string, i: number) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No final summary yet.</div>
        )}
      </Card>

      {/* Per-Question Answers */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-3">Per-Question Analysis</h3>
        {answers.length > 0 ? (
          <div className="space-y-5">
            {answers.map((a: any, i: number) => {
              const feedback = a.feedback ? JSON.parse(a.feedback) : {};
              return (
                <div key={i} className="border rounded-lg p-4 bg-card/50">
                  <h4 className="font-semibold mb-2">
                    Q{i + 1}: {a.question_text}
                  </h4>

                  <div className="text-sm text-muted-foreground mb-2">
                    <b>Your Answer:</b>
                    <p className="mt-1 whitespace-pre-wrap">{a.answer_text}</p>
                  </div>

                  <div className="mt-3">
                    <b>AI Feedback:</b>
                    <pre className="mt-1 bg-muted p-2 rounded text-xs overflow-auto">
                      {JSON.stringify(feedback, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No answers recorded.</div>
        )}
      </Card>
    </div>
  );
}
