"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { X } from "lucide-react"

interface AnalysisResult {
  atsScore?: number
  overallScore?: number
  strengths?: string[]
  weaknesses?: string[]
  suggestions?: string[]
}

export default function AnalysisPanel({
  show,
  onClose,
  jobTitle,
  setJobTitle,
  jobDescription,
  setJobDescription,
  analyzing,
  onAnalyze,
  analysisResult,
}: {
  show: boolean
  onClose: () => void
  jobTitle: string
  setJobTitle: (v: string) => void
  jobDescription: string
  setJobDescription: (v: string) => void
  analyzing: boolean
  onAnalyze: () => void
  analysisResult: AnalysisResult | null
}) {
  return (
    <div className={`fixed top-0 right-0 h-full bg-card border-l border-border w-[400px] lg:w-[500px] z-40 transition-transform duration-300 ${show ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold">AI Analysis</h2>
          <Button variant="ghost" onClick={onClose} className="hover:bg-muted rounded-full" aria-label="Close analysis panel">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <Input placeholder="Job Title (e.g., Senior Software Engineer)" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          <Textarea rows={5} placeholder="Paste job description here..." value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
          <Button className="w-full" onClick={onAnalyze} disabled={analyzing || !jobTitle.trim() || !jobDescription.trim()}>
            {analyzing ? 'Analyzing...' : 'Analyze Now'}
          </Button>
          {analysisResult && (
            <div className="space-y-4 pt-2">
              {(analysisResult.atsScore !== undefined || analysisResult.overallScore !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  {analysisResult.atsScore !== undefined && (
                    <div className="p-3 rounded-md border">
                      <div className="text-sm text-muted-foreground">ATS Score</div>
                      <div className="text-2xl font-bold">{analysisResult.atsScore}</div>
                    </div>
                  )}
                  {analysisResult.overallScore !== undefined && (
                    <div className="p-3 rounded-md border">
                      <div className="text-sm text-muted-foreground">Overall</div>
                      <div className="text-2xl font-bold">{analysisResult.overallScore}</div>
                    </div>
                  )}
                </div>
              )}
              {!!(analysisResult.strengths && analysisResult.strengths.length) && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Strengths</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {analysisResult.strengths!.map((s, i) => (
                      <li key={`st-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!(analysisResult.weaknesses && analysisResult.weaknesses.length) && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Weaknesses</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {analysisResult.weaknesses!.map((s, i) => (
                      <li key={`wk-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!!(analysisResult.suggestions && analysisResult.suggestions.length) && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Suggestions</h3>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {analysisResult.suggestions!.map((s, i) => (
                      <li key={`sg-${i}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}