"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Award,
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  MessageSquare,
  Video,
  CheckCircle,
  AlertCircle,
  Star,
  BookOpen,
  Lightbulb,
  Loader2,
  Download,
  Share2,
  Eye,
  Smile,
  Frown,
  Meh,
  X
} from "lucide-react";
import Header from "@/components/header";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface Analysis {
  overall_score: number;
  readiness_level: string;
  technical_assessment: {
    score: number;
    depth: string;
    accuracy: string;
    problem_solving: string;
  };
  communication_assessment: {
    score: number;
    clarity: string;
    structure: string;
    examples: string;
  };
  soft_skills: {
    score: number;
    confidence: string;
    engagement: string;
    presence: string;
  };
  strengths: string[];
  weaknesses: string[];
  question_by_question?: Array<{
    question_summary: string;
    answer_quality: number;
    feedback: string;
  }>;
  improvement_roadmap: Array<{
    area: string;
    priority: string;
    actions: string[];
  }>;
  interview_tips: string[];
  recommended_resources: string[];
  practice_questions: string[];
  final_verdict: string;
  video_analysis?: {
    eye_contact: { score: number; assessment: string };
    confidence_level: { score: number; assessment: string };
    body_language: { score: number; assessment: string };
    professional_presence: { score: number; assessment: string };
    engagement: { score: number; assessment: string };
    strengths: string[];
    areas_for_improvement: string[];
    overall_impression: string;
    recommendations: string[];
  };
}

export default function InterviewReportPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params?.id as string;

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!interviewId) return;

    const loadAnalysis = async () => {
      try {
        setIsLoading(true);

        // Check if analysis exists
        const interviewRes = await fetch(`${API_BASE}/api/interviews/${interviewId}`);
        
        if (!interviewRes.ok) {
          throw new Error('Failed to load interview');
        }

        const interviewData = await interviewRes.json();

        // Check if comprehensive analysis exists
        if (interviewData.comprehensive_analysis) {
          const parsed = typeof interviewData.comprehensive_analysis === 'string' 
            ? JSON.parse(interviewData.comprehensive_analysis)
            : interviewData.comprehensive_analysis;
          
          setAnalysis(parsed);
          setIsLoading(false);
          return;
        }

        // No analysis yet - trigger it
        setIsAnalyzing(true);
        console.log('🔍 No analysis found, triggering GPT-5 analysis...');

        const analysisRes = await fetch(`${API_BASE}/api/interviews/${interviewId}/analyze`, {
          method: 'POST'
        });

        if (!analysisRes.ok) {
          throw new Error('Analysis failed');
        }

        const analysisData = await analysisRes.json();
        
        setAnalysis(analysisData.analysis);
        setIsAnalyzing(false);
        setIsLoading(false);

      } catch (e: any) {
        console.error('❌ Error loading analysis:', e);
        setError(e.message);
        setIsLoading(false);
        setIsAnalyzing(false);
      }
    };

    loadAnalysis();
  }, [interviewId]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-300';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-300';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <Smile className="h-5 w-5" />;
    if (score >= 60) return <Meh className="h-5 w-5" />;
    return <Frown className="h-5 w-5" />;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-500/20 text-red-300 border-red-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
      case 'low': return 'bg-green-500/20 text-green-300 border-green-500/50';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
    }
  };

  // Loading state
  if (isLoading || isAnalyzing) {
    return (
      <div className="flex h-screen w-full flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="p-8 max-w-md w-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-center text-lg mb-2 font-semibold">
              {isAnalyzing ? 'analyzing your interview...' : 'Loading your report...'}
            </p>
            <p className="text-muted-foreground text-center text-sm">
              This may take up to 30 seconds
            </p>
            <div className="mt-6">
              <Progress value={33} className="h-2 animate-pulse" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !analysis) {
    return (
      <div className="flex h-screen w-full flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="p-8 max-w-md w-full">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-center mb-2">Error Loading Report</h2>
            <p className="text-muted-foreground text-center mb-6">{error || 'No analysis data available'}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="flex-1"
              >
                Retry
              </Button>
              <Button
                onClick={() => router.push('/interview-setup')}
                variant="outline"
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Setup
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Safe analysis with defaults
  const safeAnalysis = {
    overall_score: analysis?.overall_score || 0,
    readiness_level: analysis?.readiness_level || 'Intermediate',
    final_verdict: analysis?.final_verdict || 'Analysis in progress...',
    strengths: analysis?.strengths || [],
    weaknesses: analysis?.weaknesses || [],
    improvement_roadmap: analysis?.improvement_roadmap || [],
    interview_tips: analysis?.interview_tips || [],
    recommended_resources: analysis?.recommended_resources || [],
    practice_questions: analysis?.practice_questions || [],
    technical_assessment: analysis?.technical_assessment || { score: 0, depth: '', accuracy: '', problem_solving: '' },
    communication_assessment: analysis?.communication_assessment || { score: 0, clarity: '', structure: '', examples: '' },
    soft_skills: analysis?.soft_skills || { score: 0, confidence: '', engagement: '', presence: '' },
    question_by_question: analysis?.question_by_question || [],
    video_analysis: analysis?.video_analysis || null
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-y-auto">
      <Header />

      <div className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto p-6 pb-16">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Button
                onClick={() => router.push('/interview-setup')}
                variant="ghost"
                className="mb-4"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Setup
              </Button>
              <h1 className="text-4xl font-bold mb-2">Interview Report</h1>
              <p className="text-muted-foreground">Comprehensive AI-powered analysis by GPT-5</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
              <Button variant="outline">
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>

          {/* Overall Score Card */}
          <Card className="p-8 mb-8 bg-card border-border">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="md:col-span-1 flex flex-col items-center justify-center">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-full bg-background flex items-center justify-center">
                      <span className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                        {safeAnalysis.overall_score}
                      </span>
                    </div>
                  </div>
                  <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground font-semibold">
                      {safeAnalysis.readiness_level.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="md:col-span-3 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Overall Performance</h2>
                  <p className="text-muted-foreground text-lg">{safeAnalysis.final_verdict}</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-5 w-5 text-blue-500" />
                      <span className="text-muted-foreground text-sm">Technical</span>
                    </div>
                    <div className="text-2xl font-bold">{safeAnalysis.technical_assessment.score}</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-5 w-5 text-green-500" />
                      <span className="text-muted-foreground text-sm">Communication</span>
                    </div>
                    <div className="text-2xl font-bold">{safeAnalysis.communication_assessment.score}</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="h-5 w-5 text-purple-500" />
                      <span className="text-muted-foreground text-sm">Soft Skills</span>
                    </div>
                    <div className="text-2xl font-bold">{safeAnalysis.soft_skills.score}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            
            {/* Strengths */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <h3 className="text-xl font-bold">Key Strengths</h3>
              </div>

              <div className="space-y-3">
                {safeAnalysis.strengths.length > 0 ? (
                  safeAnalysis.strengths.map((strength, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-muted p-3 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{strength}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-sm">Strengths analysis in progress...</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Weaknesses */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-orange-500/20">
                  <TrendingDown className="h-5 w-5 text-orange-500" />
                </div>
                <h3 className="text-xl font-bold">Areas for Improvement</h3>
              </div>

              <div className="space-y-3">
                {safeAnalysis.weaknesses.length > 0 ? (
                  safeAnalysis.weaknesses.map((weakness, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-muted p-3 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{weakness}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-sm">Areas for improvement being analyzed...</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Video Analysis (if available) */}
          {safeAnalysis.video_analysis && (
            <Card className="p-6 bg-card border-border mb-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Video className="h-5 w-5 text-purple-500" />
                </div>
                <h3 className="text-xl font-bold">Video & Body Language Analysis</h3>
                <Badge className="ml-auto bg-purple-500/20 text-purple-300 border-purple-500/50">AI Vision Analysis</Badge>
              </div>

              <div className="mb-6 p-4 bg-muted rounded-lg">
                <p>{safeAnalysis.video_analysis.overall_impression}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { label: 'Eye Contact', data: safeAnalysis.video_analysis.eye_contact, icon: Eye },
                  { label: 'Confidence', data: safeAnalysis.video_analysis.confidence_level, icon: Star },
                  { label: 'Body Language', data: safeAnalysis.video_analysis.body_language, icon: Target },
                  { label: 'Presence', data: safeAnalysis.video_analysis.professional_presence, icon: Award },
                  { label: 'Engagement', data: safeAnalysis.video_analysis.engagement, icon: Brain }
                ].map((item, idx) => (
                  <div key={idx} className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <item.icon className="h-4 w-4 text-purple-500" />
                      <span className="text-muted-foreground text-xs">{item.label}</span>
                    </div>
                    <div className={`text-xl font-bold mb-2 ${getScoreColor(item.data.score)} rounded px-2 py-1 inline-flex items-center gap-1`}>
                      {getScoreIcon(item.data.score)}
                      {item.data.score}
                    </div>
                    <p className="text-muted-foreground text-xs line-clamp-2">{item.data.assessment}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Visual Strengths
                  </h4>
                  <ul className="space-y-1">
                    {safeAnalysis.video_analysis.strengths.map((s, i) => (
                      <li key={i} className="text-muted-foreground text-sm ml-6">• {s}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    Visual Recommendations
                  </h4>
                  <ul className="space-y-1">
                    {safeAnalysis.video_analysis.recommendations.map((r, i) => (
                      <li key={i} className="text-muted-foreground text-sm ml-6">• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* Detailed Assessments */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            {/* Technical Assessment */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-blue-500" />
                <h3 className="text-lg font-bold">Technical Skills</h3>
              </div>

              <div className="mb-4">
                <Progress value={safeAnalysis.technical_assessment.score} className="h-2" />
                <div className="text-right text-muted-foreground text-sm mt-1">{safeAnalysis.technical_assessment.score}/100</div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Depth</div>
                  <p className="text-sm">{safeAnalysis.technical_assessment.depth || 'Not assessed'}</p>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Accuracy</div>
                  <p className="text-sm">{safeAnalysis.technical_assessment.accuracy || 'Not assessed'}</p>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Problem Solving</div>
                  <p className="text-sm">{safeAnalysis.technical_assessment.problem_solving || 'Not assessed'}</p>
                </div>
              </div>
            </Card>

            {/* Communication Assessment */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-bold">Communication</h3>
              </div>

              <div className="mb-4">
                <Progress value={safeAnalysis.communication_assessment.score} className="h-2" />
                <div className="text-right text-muted-foreground text-sm mt-1">{safeAnalysis.communication_assessment.score}/100</div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Clarity</div>
                  <p className="text-sm">{safeAnalysis.communication_assessment.clarity || 'Not assessed'}</p>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Structure</div>
                  <p className="text-sm">{safeAnalysis.communication_assessment.structure || 'Not assessed'}</p>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Examples</div>
                  <p className="text-sm">{safeAnalysis.communication_assessment.examples || 'Not assessed'}</p>
                </div>
              </div>
            </Card>

            {/* Soft Skills Assessment */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <Award className="h-5 w-5 text-purple-500" />
                <h3 className="text-lg font-bold">Soft Skills</h3>
              </div>

              <div className="mb-4">
                <Progress value={safeAnalysis.soft_skills.score} className="h-2" />
                <div className="text-right text-muted-foreground text-sm mt-1">{safeAnalysis.soft_skills.score}/100</div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Confidence</div>
                  <p className="text-sm">{safeAnalysis.soft_skills.confidence || 'Not assessed'}</p>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Engagement</div>
                  <p className="text-sm">{safeAnalysis.soft_skills.engagement || 'Not assessed'}</p>
                </div>
                <div>
                  <div className="text-muted-foreground text-sm font-medium mb-1">Presence</div>
                  <p className="text-sm">{safeAnalysis.soft_skills.presence || 'Not assessed'}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Question by Question (if available) */}
          {safeAnalysis.question_by_question && safeAnalysis.question_by_question.length > 0 && (
            <Card className="p-6 bg-card border-border mb-8">
              <div className="flex items-center gap-2 mb-6">
                <Target className="h-5 w-5 text-blue-500" />
                <h3 className="text-xl font-bold">Question-by-Question Breakdown</h3>
              </div>

              <div className="space-y-4">
                {safeAnalysis.question_by_question.map((q, idx) => (
                  <div key={idx} className="bg-muted rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium">Question {idx + 1}: {q.question_summary}</h4>
                      <Badge className={getScoreColor(q.answer_quality)}>
                        {q.answer_quality}/100
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">{q.feedback}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Improvement Roadmap */}
          <Card className="p-6 bg-card border-border mb-8">
            <div className="flex items-center gap-2 mb-6">
              <Target className="h-5 w-5 text-orange-500" />
              <h3 className="text-xl font-bold">Personalized Improvement Roadmap</h3>
            </div>

            <div className="space-y-4">
              {safeAnalysis.improvement_roadmap && Array.isArray(safeAnalysis.improvement_roadmap) && safeAnalysis.improvement_roadmap.length > 0 ? (
                safeAnalysis.improvement_roadmap.map((item, idx) => (
                  <div key={idx} className="bg-muted rounded-lg p-4 border border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={getPriorityColor(item.priority)}>
                        {(item.priority || 'MEDIUM').toUpperCase()} PRIORITY
                      </Badge>
                      <h4 className="font-semibold">{item.area || 'Improvement Area'}</h4>
                    </div>
                    {item.actions && Array.isArray(item.actions) && item.actions.length > 0 ? (
                      <ul className="space-y-2">
                        {item.actions.map((action, aidx) => (
                          <li key={aidx} className="flex items-start gap-2 text-muted-foreground text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-sm">Action steps being generated...</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="bg-muted rounded-lg p-8 text-center border border-border">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <AlertCircle className="h-8 w-8 text-yellow-500" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold mb-2">
                        Roadmap Not Available
                      </h4>
                      <p className="text-muted-foreground text-sm max-w-md">
                        The improvement roadmap is still being generated. Please refresh the page in a few moments.
                      </p>
                    </div>
                    <Button
                      onClick={() => window.location.reload()}
                      className="mt-4"
                    >
                      Refresh Page
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Interview Tips */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <h3 className="text-xl font-bold">Interview Tips</h3>
              </div>

              {safeAnalysis.interview_tips.length > 0 ? (
                <ul className="space-y-2">
                  {safeAnalysis.interview_tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-muted-foreground text-sm">
                      <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">Tips being generated...</p>
                </div>
              )}
            </Card>

            {/* Recommended Resources */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-blue-500" />
                <h3 className="text-xl font-bold">Recommended Resources</h3>
              </div>

              {safeAnalysis.recommended_resources.length > 0 ? (
                <ul className="space-y-2">
                  {safeAnalysis.recommended_resources.map((resource, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-muted-foreground text-sm">
                      <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span>{resource}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">Resources being curated...</p>
                </div>
              )}
            </Card>
          </div>

          {/* Practice Questions */}
          {safeAnalysis.practice_questions.length > 0 && (
            <Card className="p-6 bg-card border-border mt-6">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-purple-500" />
                <h3 className="text-xl font-bold">Practice Questions to Work On</h3>
              </div>

              <div className="space-y-3">
                {safeAnalysis.practice_questions.map((question, idx) => (
                  <div key={idx} className="bg-muted rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5">{idx + 1}</Badge>
                      <p className="text-sm">{question}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* CTA */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              onClick={() => router.push('/interview-setup')}
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8"
            >
              Start Another Practice Interview
            </Button>
            
            <Button
              onClick={() => router.push('/dashboard')}
              size="lg"
              variant="outline"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}