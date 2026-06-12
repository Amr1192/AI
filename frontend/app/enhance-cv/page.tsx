"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  ArrowRight,
  ArrowLeft,
  Download,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileText,
} from "lucide-react";
import {
  auditCv,
  downloadOptimizedPdf,
  optimizeCv,
  uploadCvFile,
  type AuditResult,
  type AtsBreakdownItem,
  type OptimizeResult,
} from "@/lib/cv-enhance-api";

type Phase = "audit" | "optimize" | "done";

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={`text-5xl font-bold tabular-nums ${scoreColor(score)}`}>
        {score}
        <span className="text-lg text-muted-foreground font-normal">/100</span>
      </p>
    </div>
  );
}

function BreakdownList({ items }: { items: AtsBreakdownItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id}>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">{item.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {item.score}/{item.max}
            </span>
          </div>
          <Progress value={(item.score / item.max) * 100} className="h-2" />
          {item.score < item.max * 0.7 && (
            <p className="text-xs text-muted-foreground mt-1">{item.tip}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function EnhanceCVPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("audit");
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [optimize, setOptimize] = useState<OptimizeResult | null>(null);

  useEffect(() => {
    const user = localStorage.getItem("cvmaster_user");
    if (!user) {
      router.push("/login");
      return;
    }
    setLoading(false);
  }, [router]);

  const runAudit = async (text: string) => {
    if (!text.trim()) {
      toast.error("Add or upload your CV first");
      return;
    }
    setAuditing(true);
    try {
      const result = await auditCv(text, jobDescription);
      setAudit(result);
      setCvText(text);
      setOptimize(null);
      setPhase("audit");
      toast.success(`ATS audit complete — ${result.atsScore}/100`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setAuditing(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const text = await uploadCvFile(file);
      setCvText(text);
      await runAudit(text);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleOptimize = async (textOverride?: string) => {
    const text = (textOverride ?? cvText).trim();
    if (!text) return;
    setPhase("optimize");
    setOptimizing(true);
    try {
      const result = await optimizeCv(text, jobDescription);
      setOptimize(result);
      setCvText(text);
      setPhase("done");
      if (result.improved) {
        toast.success(`Score improved: ${result.beforeScore} → ${result.afterScore}`);
      } else if (result.revertedToOriginal) {
        toast.message("Kept your original — optimization did not raise the rubric score");
      } else {
        toast.success(`Optimized — score ${result.afterScore}/100`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Optimization failed");
      setPhase("audit");
    } finally {
      setOptimizing(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    const fromAnalysis = localStorage.getItem("cv_from_analysis");
    const autoOptimize = localStorage.getItem("cv_auto_enhance") === "true";
    if (!fromAnalysis?.trim() || localStorage.getItem("cv_enhance_intent") !== "true") return;

    localStorage.removeItem("cv_enhance_intent");
    localStorage.removeItem("cv_from_analysis");
    localStorage.removeItem("cv_auto_enhance");
    localStorage.removeItem("cv_file_name");
    localStorage.removeItem("cv_file_type");

    setCvText(fromAnalysis);
    void (async () => {
      await runAudit(fromAnalysis);
      if (autoOptimize) await handleOptimize(fromAnalysis);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time handoff from CV Analysis
  }, [loading]);

  const handleDownloadPdf = async () => {
    const text = optimize?.optimizedText || cvText;
    if (!text.trim()) return;
    setDownloading(true);
    try {
      const blob = await downloadOptimizedPdf(text);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cv-ats-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadTxt = () => {
    const text = optimize?.optimizedText || cvText;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cv-ats-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary">ATS CV Optimizer</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Upload your CV for an honest ATS audit, then optimize it with the same scoring rubric —
            no inflated scores, only measurable improvements.
          </p>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          {(["audit", "optimize", "done"] as Phase[]).map((step, i) => {
            const labels = { audit: "1. Audit", optimize: "2. Optimize", done: "3. Download" };
            const active =
              phase === step ||
              (step === "audit" && audit) ||
              (step === "optimize" && optimizing) ||
              (step === "done" && optimize);
            return (
              <div key={step} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px bg-border" />}
                <span
                  className={`px-3 py-1 rounded-full ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {labels[step]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Phase 1: Audit */}
        {phase === "audit" && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Your CV
              </h2>

              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {uploading ? "Extracting text…" : "Upload PDF, DOCX, or TXT"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  disabled={uploading || auditing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>

              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Target role (optional — tailors keyword focus)
                </label>
                <Input
                  placeholder="e.g. Senior React Developer"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="mt-1"
                />
              </div>

              <Textarea
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                placeholder="Or paste your CV text here…"
                className="min-h-[280px] font-mono text-sm"
              />

              <Button
                className="w-full"
                onClick={() => runAudit(cvText)}
                disabled={auditing || !cvText.trim()}
              >
                {auditing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Auditing…
                  </>
                ) : (
                  "Run ATS audit"
                )}
              </Button>
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Audit results</h2>
              <div className="border rounded-xl p-6 bg-card min-h-[400px]">
                {!audit && !auditing && (
                  <p className="text-muted-foreground text-center py-16">
                    Upload or paste your CV, then run the audit to see your real ATS score.
                  </p>
                )}
                {auditing && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Scoring against ATS rubric…</p>
                  </div>
                )}
                {audit && !auditing && (
                  <div className="space-y-6">
                    <ScoreRing score={audit.atsScore} label="Current ATS score" />
                    {audit.whyThisScore && (
                      <p className="text-xs text-muted-foreground text-center">{audit.whyThisScore}</p>
                    )}

                    {audit.missingSections.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-red-700 flex items-center gap-1 mb-2">
                          <AlertTriangle className="h-4 w-4" />
                          Missing or weak
                        </h3>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {audit.missingSections.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {audit.strengths.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-green-800 flex items-center gap-1 mb-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Strengths
                        </h3>
                        <ul className="list-disc pl-5 text-sm space-y-1">
                          {audit.strengths.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <h3 className="font-semibold mb-3">Score breakdown</h3>
                      <BreakdownList items={audit.scoreBreakdown} />
                    </div>
                  </div>
                )}
              </div>

              {audit && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => handleOptimize()}
                  disabled={optimizing}
                >
                  {optimizing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Optimizing for ATS…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Optimize for ATS
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Phase 2/3: Results */}
        {(phase === "optimize" || phase === "done") && (
          <div className="space-y-6">
            {optimizing && (
              <div className="flex flex-col items-center py-20 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-lg font-medium">Restructuring your CV for ATS systems…</p>
                <p className="text-sm text-muted-foreground max-w-md text-center">
                  Reformatting sections, strengthening bullets, and re-scoring with the same rubric.
                  No facts are invented.
                </p>
              </div>
            )}

            {optimize && !optimizing && (
              <>
                {/* Score comparison */}
                <div className="grid sm:grid-cols-3 gap-4 p-6 border rounded-xl bg-card">
                  <ScoreRing score={optimize.beforeScore} label="Before" />
                  <div className="flex flex-col items-center justify-center">
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        optimize.scoreDelta > 0
                          ? "text-green-600"
                          : optimize.scoreDelta < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                      }`}
                    >
                      {optimize.scoreDelta > 0 ? "+" : ""}
                      {optimize.scoreDelta}
                    </p>
                    <p className="text-xs text-muted-foreground">point change</p>
                  </div>
                  <ScoreRing score={optimize.afterScore} label="After" />
                </div>

                {optimize.revertedToOriginal && (
                  <div className="flex gap-2 items-start p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    The AI rewrite scored lower on our rubric, so we kept your original text.
                    Review the suggestions below and edit manually, or try again with a target role.
                  </div>
                )}

                {optimize.changes.length > 0 && (
                  <div className="p-4 border rounded-xl">
                    <h3 className="font-semibold mb-2">What changed</h3>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {optimize.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Side by side */}
                <div className="grid lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-2 text-muted-foreground">Original</h3>
                    <pre className="text-xs font-mono bg-muted/50 border rounded-xl p-4 max-h-[480px] overflow-auto whitespace-pre-wrap">
                      {optimize.originalText}
                    </pre>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-primary">ATS-optimized</h3>
                    <Textarea
                      className="font-mono text-xs min-h-[480px]"
                      value={optimize.optimizedText}
                      onChange={(e) =>
                        setOptimize({ ...optimize, optimizedText: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      You can edit the optimized version. Re-run audit from step 1 to verify your score.
                    </p>
                  </div>
                </div>

                {optimize.afterBreakdown.length > 0 && (
                  <div className="p-4 border rounded-xl">
                    <h3 className="font-semibold mb-3">After — score breakdown</h3>
                    <BreakdownList items={optimize.afterBreakdown} />
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleDownloadPdf} disabled={downloading}>
                    {downloading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                  <Button variant="outline" onClick={handleDownloadTxt}>
                    Download TXT
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPhase("audit");
                      setOptimize(null);
                    }}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to audit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCvText(optimize.optimizedText);
                      setOptimize(null);
                      setPhase("audit");
                      runAudit(optimize.optimizedText);
                    }}
                  >
                    Re-score optimized CV
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
