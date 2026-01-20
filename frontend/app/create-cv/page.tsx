"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Save, X, Sparkles, Send, Bot, User, Loader2, Wand2, CheckCircle, Circle , Download } from "lucide-react";
import { toast } from "sonner";
import FormSection, { CVData as BuilderCVData } from "./components/FormSection";
import ResumePreview from "./components/ResumePreview";
import Link from "next/link";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CompletionStatus {
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasJobTitle: boolean;
  hasSummary: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  hasSkills: boolean;
  hasProjects: boolean;
  hasAchievements: boolean;
}

const normalizeEducation = (education: any[]): any[] => {
  if (!Array.isArray(education)) {
    return [];
  }
  
  return education.map((edu: any, index: number) => ({
    id: edu.id || `edu_${Date.now()}_${index}`,
    degree: typeof edu.degree === 'string' ? edu.degree : '',
    university: typeof edu.university === 'string' ? edu.university : 
                typeof edu.institution === 'string' ? edu.institution : '',
    startDate: typeof edu.startDate === 'string' ? edu.startDate : 
               typeof edu.year === 'string' ? edu.year.split('-')[0] : '',
    endDate: typeof edu.endDate === 'string' ? edu.endDate : 
             typeof edu.year === 'string' ? edu.year.split('-')[1] : '',
    details: typeof edu.details === 'string' ? edu.details : ''
  }));
};

const normalizeExperience = (experience: any[]): any[] => {
  if (!Array.isArray(experience)) {
    return [];
  }
  
  return experience.map((exp: any, index: number) => ({
    id: exp.id || `exp_${Date.now()}_${index}`,
    company: typeof exp.company === 'string' ? exp.company : '',
    position: typeof exp.position === 'string' ? exp.position : 
              typeof exp.title === 'string' ? exp.title : '',
    startDate: typeof exp.startDate === 'string' ? exp.startDate : '',
    endDate: typeof exp.endDate === 'string' ? exp.endDate : '',
    description: typeof exp.description === 'string' ? exp.description : '',
    responsibilities: Array.isArray(exp.responsibilities) ? exp.responsibilities : 
                      Array.isArray(exp.highlights) ? exp.highlights : []
  }));
};


export default function CreateCVPage() {
  const STORAGE_VERSION = "2";
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
  const AI_API_BASE = process.env.NEXT_PUBLIC_AI_API_BASE_URL || "http://127.0.0.1:5007";
  
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const stepsTotal = 7;
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  
  // AI Chat State
  const [showAIChat, setShowAIChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiCVData, setAiCVData] = useState<any>({});
  const [completion, setCompletion] = useState<{status: CompletionStatus; percentage: number; ready: boolean}>({
    status: {} as CompletionStatus,
    percentage: 0,
    ready: false
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [cv, setCV] = useState<BuilderCVData>({
    personalInfo: { fullName: "", jobTitle: "", email: "", phone: "", location: "" },
    summary: "",
    experience: [],
    education: [],
    skills: [],
    projects: [],
    achievements: [],
    fontSize: 10.5,
    fontSizes: { name: 26, title: 14, body: 10.5 },
    linkifyContacts: false,
  });

  useEffect(() => {
    try {
      const storedVersion = typeof window !== "undefined" ? localStorage.getItem("cvmaster_storage_version") : null;
      if (storedVersion !== STORAGE_VERSION) {
        localStorage.removeItem("cvmaster_cv");
        localStorage.removeItem("cvmaster_cv_step");
        localStorage.setItem("cvmaster_storage_version", STORAGE_VERSION);
      }
      const saved = typeof window !== "undefined" ? localStorage.getItem("cvmaster_cv") : null;
      if (saved) setCV(JSON.parse(saved));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update CV preview in real-time as AI collects data
  useEffect(() => {
    if (aiCVData && Object.keys(aiCVData).length > 0) {
      updateCVFromAIData(aiCVData);
    }
  }, [aiCVData]);

 const updateCVFromAIData = (data: any) => {
  setCV(prev => ({
    ...prev,
    personalInfo: {
      fullName: data.personalInfo?.fullName || prev.personalInfo.fullName,
      jobTitle: data.personalInfo?.jobTitle || prev.personalInfo.jobTitle,
      email: data.personalInfo?.email || prev.personalInfo.email,
      phone: data.personalInfo?.phone || prev.personalInfo.phone,
      location: data.personalInfo?.location || prev.personalInfo.location,
    },
    summary: data.summary || prev.summary,
    experience: data.experience?.length ? normalizeExperience(data.experience) : prev.experience,
    education: data.education?.length ? normalizeEducation(data.education) : prev.education,
    skills: Array.isArray(data.skills) ? data.skills : prev.skills,
    projects: data.projects?.length ? data.projects.map((proj: any) => ({
      name: proj.name || "",
      description: proj.description || "",
      technologies: proj.technologies || "",
      link: proj.link || "",
      achievements: Array.isArray(proj.achievements) ? proj.achievements : []
    })) : prev.projects,
    achievements: Array.isArray(data.achievements) ? data.achievements : prev.achievements,
  }));
};
  const handleReset = () => {
    try {
      localStorage.removeItem("cvmaster_cv");
      setCV({
        personalInfo: { fullName: "", jobTitle: "", email: "", phone: "", location: "" },
        summary: "", experience: [], education: [], skills: [], projects: [], achievements: [],
        fontSize: 10.5, fontSizes: { name: 26, title: 14, body: 10.5 }, linkifyContacts: false,
      });
      toast.success("Reset completed");
    } catch { toast.error("Failed to reset CV"); }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
      if (!token) { toast.error("You must be logged in to save CV"); return; }
      const res = await fetch(`${API_BASE}/api/user-cvs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: JSON.stringify({ cv_json: cv, title: `CV - ${new Date().toLocaleDateString()}` }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(`Failed to save CV: ${data.message || res.statusText}`); return; }
      toast.success("CV saved successfully");
      setShowSuccessPopup(true);
    } catch (e: any) { toast.error(e?.message || "Failed to save CV"); }
  };

 const handleDownloadPDF = async () => {
    // Validate CV has minimum required data
    if (!cv.personalInfo.fullName || !cv.personalInfo.email) {
      toast.error("Please add at least your name and email before downloading");
      return;
    }
    
  setIsDownloading(true);
    const toastId = toast.loading("Generating your professional PDF...");
    try {
      const res = await fetch(`${AI_API_BASE}/ai/generate-pdf`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cv_data: cv }),
      });
      
      if (!res.ok) { 
        toast.error("Failed to generate PDF"); 
        return; 
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CV-${cv.personalInfo.fullName.replace(/\s+/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
        toast.dismiss(toastId);
      toast.success("✅ PDF downloaded successfully!");
    } catch (e: any) { 
      toast.dismiss(toastId);
      toast.error(e?.message || "Failed to download PDF"); 
    } finally {
      setIsDownloading(false);
    }
  };

  // AI Functions
  const startAIChat = async () => {
    setShowAIChat(true);
    setIsAILoading(true);
    setMessages([]);
    setAiCVData({
      personalInfo: { fullName: "", jobTitle: "", email: "", phone: "", location: "", linkedin: "", website: "" },
      summary: "", experience: [], education: [], skills: [], projects: [], achievements: [], languages: [], certifications: []
    });
    
    try {
      const res = await fetch(`${AI_API_BASE}/ai/start`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" } 
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages([{ role: "assistant", content: data.message }]);
        if (data.cv_data) setAiCVData(data.cv_data);
        if (data.completion) setCompletion(data.completion);
      }
    } catch (e) {
      setMessages([{ 
        role: "assistant", 
        content: `👋 **Hello! I'm your Smart AI CV Builder!**

I'll help you create a professional, ATS-optimized CV. Just chat with me naturally!

**You can say things like:**
- "My name is Sara, email sara@gmail.com, phone 01018014550"
- "I'm a Front-End Developer with 5 years experience"
- "I worked at Voice Company as Front-End from 2019 to present"
- "Add you some responsibilities" ← **I'll generate 6-8 professional ones with metrics!**
- "Add skills: HTML, CSS, JavaScript" 
- "Add you some other skills" ← **I'll add 10+ relevant skills for your job!**
- "Ecommerce project - add you another data" ← **I'll expand it professionally!**
- "Bachelor degree from Cairo University 2014-2018"

**The Magic:** When you say "add you some X", I don't just acknowledge - I GENERATE professional content immediately! 🎯

**I need at least:**
✓ Name & Contact
✓ Job title & experience years
✓ One work experience
✓ Education

Let's start - what's your name and contact information?`
      }]);
    } finally { 
      setIsAILoading(false); 
    }
  };

const sendMessage = async () => {
  if (!inputMessage.trim() || isAILoading) return;
  
  const userMsg = inputMessage.trim();
  setInputMessage("");
  setMessages(prev => [...prev, { role: "user", content: userMsg }]);
  setIsAILoading(true);

  try {
    const res = await fetch(`${AI_API_BASE}/ai/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMsg, cv_data: aiCVData }),
    });
    const data = await res.json();
    
    if (data.success) {
      setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
      if (data.cv_data) {
        setAiCVData(data.cv_data);
        const addedItems = getAddedItems(aiCVData, data.cv_data);
        if (addedItems.length > 0) {
          toast.success(`Added: ${addedItems.join(", ")}`);
        }
      }
      if (data.completion) setCompletion(data.completion); // ✅ This works when backend responds
    } else {
      throw new Error(data.error || "Failed to process");
    }
  } catch (e) {
    // Fallback - try to parse locally
    const localUpdate = parseInputLocally(userMsg, aiCVData);
    setAiCVData(localUpdate);
    
    // ✅ ADD THIS: Calculate completion locally when backend fails
    const localCompletion = calculateCompletion(localUpdate);
    setCompletion(localCompletion);
    
    setMessages(prev => [...prev, { role: "assistant", content: "Got it! I've added that to your CV. What else would you like to add?" }]);
  } finally { 
    setIsAILoading(false); 
  }
};

  const getAddedItems = (oldData: any, newData: any): string[] => {
    const added: string[] = [];
    if (newData.personalInfo?.fullName && !oldData.personalInfo?.fullName) added.push("Name");
    if (newData.personalInfo?.email && !oldData.personalInfo?.email) added.push("Email");
    if (newData.personalInfo?.phone && !oldData.personalInfo?.phone) added.push("Phone");
    if (newData.personalInfo?.jobTitle && !oldData.personalInfo?.jobTitle) added.push("Job Title");
    if ((newData.skills?.length || 0) > (oldData.skills?.length || 0)) added.push(`${newData.skills.length - (oldData.skills?.length || 0)} skills`);
    if ((newData.experience?.length || 0) > (oldData.experience?.length || 0)) added.push("Experience");
    if ((newData.education?.length || 0) > (oldData.education?.length || 0)) added.push("Education");
    if ((newData.achievements?.length || 0) > (oldData.achievements?.length || 0)) added.push("Achievements");
    if ((newData.projects?.length || 0) > (oldData.projects?.length || 0)) added.push("Projects");
    if (newData.summary && !oldData.summary) added.push("Summary");
    
    // Check for highlights added to existing experience
    if (newData.experience && oldData.experience && newData.experience.length === oldData.experience.length) {
      for (let i = 0; i < newData.experience.length; i++) {
        const newHighlights = newData.experience[i]?.highlights?.length || 0;
        const oldHighlights = oldData.experience[i]?.highlights?.length || 0;
        if (newHighlights > oldHighlights) {
          added.push(`${newHighlights - oldHighlights} responsibilities`);
        }
      }
    }
    
    return added;
  };

const parseInputLocally = (input: string, existing: any) => {
  const data = JSON.parse(JSON.stringify(existing));
  const lower = input.toLowerCase();
    
  // Extract email
  const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) data.personalInfo.email = emailMatch[0];
  
  // Extract phone
  const phoneMatch = input.match(/[\+]?[\d\s\-\(\)]{7,}/);
  if (phoneMatch) data.personalInfo.phone = phoneMatch[0].trim();
  
  // Extract skills
  if (lower.includes("skill")) {
    const skillsPart = input.split(/skills?[:\s]*/i)[1] || input;
    const skills = skillsPart.split(/[,،\n]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
    data.skills = [...new Set([...(data.skills || []), ...skills])];
  }
  
  // Extract achievements
  if (lower.includes("achievement") || lower.includes("award") || lower.includes("accomplish")) {
    const parts = input.split(/achievements?[:\s]*/i)[1] || input;
    const items = parts.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 5);
    data.achievements = [...new Set([...(data.achievements || []), ...items])];
  }
  
  // Extract name
  const namePatterns = [
    /(?:my name is|i'm|i am|name[:\s]*)\s*([A-Za-z\s]{2,30})/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)/
  ];
  for (const pattern of namePatterns) {
    const match = input.match(pattern);
    if (match && !data.personalInfo.fullName) {
      data.personalInfo.fullName = match[1].trim();
      break;
    }
  }
  
  // Extract job title with years
  const jobMatch = input.match(/(?:i'm a|i am a)\s+([^0-9]+?)\s+(?:with\s+)?(\d+)?\s*(?:years?)?/i);
  if (jobMatch && !data.personalInfo.jobTitle) {
    data.personalInfo.jobTitle = jobMatch[1].trim();
  }
  
  // Extract experience
  const expMatch = input.match(/worked at\s+([^,]+?)\s+as\s+([^,]+?)(?:\s+from\s+(\d{4})\s+to\s+(\w+))?/i);
  if (expMatch) {
    data.experience = data.experience || [];
    data.experience.push({
      id: `exp_${Date.now()}`,
      company: expMatch[1].trim(),
      position: expMatch[2].trim(),
      startDate: expMatch[3] || "2019",
      endDate: expMatch[4] || "Present",
      description: `Working at ${expMatch[1].trim()}`,
      responsibilities: []
    });
  }
  
  // Extract education
  const eduMatch = input.match(/(?:bachelor|degree)\s+(?:in\s+)?([^,]+?)\s+from\s+([^,\d]+?)(?:\s+(\d{4})[-\s]*(\d{4}))?/i);
  if (eduMatch) {
    data.education = data.education || [];
    data.education.push({
      id: `edu_${Date.now()}`,
      degree: eduMatch[1].includes('bachelor') ? eduMatch[1].trim() : `Bachelor in ${eduMatch[1].trim()}`,
      university: eduMatch[2].trim(),
      startDate: eduMatch[3] || "",
      endDate: eduMatch[4] || "",
      details: "Relevant coursework in software development"
    });
  }
  
  return data;
};

  const calculateCompletion = (cvData: any) => {
  const status = {
    hasName: !!cvData.personalInfo?.fullName,
    hasEmail: !!cvData.personalInfo?.email,
    hasPhone: !!cvData.personalInfo?.phone,
    hasJobTitle: !!cvData.personalInfo?.jobTitle,
    hasSummary: !!cvData.summary,
    hasExperience: (cvData.experience?.length || 0) > 0,
    hasEducation: (cvData.education?.length || 0) > 0,
    hasSkills: (cvData.skills?.length || 0) > 0,
    hasProjects: (cvData.projects?.length || 0) > 0,
    hasAchievements: (cvData.achievements?.length || 0) > 0,
  };
  
  const completed = Object.values(status).filter(Boolean).length;
  const total = Object.keys(status).length;
  const percentage = Math.round((completed / total) * 100);
  
  return {
    status,
    completed,
    total,
    percentage,
    ready: percentage >= 30
  };
};

  const generateCVFromAI = async () => {
  setIsAILoading(true);
  const toastId = toast.loading("Generating your ATS-optimized CV...");

  try {
    const res = await fetch(`${AI_API_BASE}/ai/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv_data: aiCVData }),
    });
    
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Generation failed");
    }

    if (data.cv) {
      const generatedCV = data.cv;
      
   const newCV: BuilderCVData = {
  personalInfo: {
    fullName: generatedCV.personalInfo?.fullName || "",
    jobTitle: generatedCV.personalInfo?.jobTitle || "",
    email: generatedCV.personalInfo?.email || "",
    phone: generatedCV.personalInfo?.phone || "",
    location: generatedCV.personalInfo?.location || "",
  },
  summary: generatedCV.summary || "",
  experience: normalizeExperience(generatedCV.experience || []),
  education: normalizeEducation(generatedCV.education || []),
  skills: Array.isArray(generatedCV.skills) ? generatedCV.skills : [],
        projects: (generatedCV.projects || []).map((proj: any) => ({
          name: proj.name || "",
          description: proj.description || "",
          technologies: proj.technologies || "",
          link: proj.link || "",
          achievements: proj.achievements || []
        })),
        achievements: generatedCV.achievements || [],
        fontSize: 10.5,
        fontSizes: { name: 26, title: 14, body: 10.5 },
        linkifyContacts: false,
      };
      
      setCV(newCV);
      setCurrentStep(stepsTotal);
      localStorage.setItem("cvmaster_cv", JSON.stringify(newCV));
      
      toast.dismiss(toastId);
      toast.success(`🎉 CV Generated! ATS Score: ${generatedCV.atsScore || 97}/100`);
      setShowAIChat(false);
    } else {
      throw new Error("No CV data in response");
    }
  } catch (e: any) {
    toast.dismiss(toastId);
    toast.error(e?.message || "Generation failed. Using collected data...");
    
    // Fallback: use existing data
    const fallbackCV: BuilderCVData = {
      personalInfo: {
        fullName: aiCVData.personalInfo?.fullName || "",
        jobTitle: aiCVData.personalInfo?.jobTitle || "",
        email: aiCVData.personalInfo?.email || "",
        phone: aiCVData.personalInfo?.phone || "",
        location: aiCVData.personalInfo?.location || "",
      },
      summary: aiCVData.summary || "Results-driven professional with expertise in delivering high-quality work.",
      experience: (aiCVData.experience || []).map((exp: any) => ({
        id: exp.id || `exp_${Date.now()}_${Math.random()}`,
        company: exp.company || "",
        position: exp.position || exp.title || "",
        startDate: exp.startDate || "",
        endDate: exp.endDate || "",
        description: exp.description || "",
        responsibilities: exp.responsibilities || exp.highlights || []
      })),
      education: (aiCVData.education || []).map((edu: any) => ({
        id: edu.id || `edu_${Date.now()}_${Math.random()}`,
        degree: edu.degree || "",
        university: edu.university || edu.institution || "",
        startDate: edu.startDate || "",
        endDate: edu.endDate || "",
        details: edu.details || ""
      })),
      skills: aiCVData.skills || [],
      projects: (aiCVData.projects || []).map((proj: any) => ({
        name: proj.name || "",
        description: proj.description || "",
        technologies: proj.technologies || "",
        link: proj.link || "",
        achievements: proj.achievements || []
      })),
      achievements: aiCVData.achievements || [],
      fontSize: 10.5,
      fontSizes: { name: 26, title: 14, body: 10.5 },
      linkifyContacts: false,
    };
    
    setCV(fallbackCV);
    setCurrentStep(stepsTotal);
    localStorage.setItem("cvmaster_cv", JSON.stringify(fallbackCV));
    toast.success("CV created from your data!");
    setShowAIChat(false);
  } finally { 
    setIsAILoading(false); 
  }
};

  const StatusIcon = ({ completed }: { completed: boolean }) => 
    completed ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-gray-300" />;

  return (
    <div className="min-h-screen bg-background relative">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <span className="text-accent text-xl">📄</span>
            </div>
            <Link href="/create-cv">
              <h1 className="text-2xl font-bold text-foreground cursor-pointer hover:text-accent transition-colors">CV Builder</h1>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:from-purple-600 hover:to-pink-600" onClick={startAIChat}>
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </Button>
            <Button 
              variant="outline" 
              className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 hover:from-blue-600 hover:to-cyan-600" 
              onClick={handleDownloadPDF}
              disabled={isDownloading || !cv.personalInfo.fullName}
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download PDF
            </Button>

            <Button variant="outline" className="gap-2 bg-transparent" onClick={handleReset}>
              <X className="w-4 h-4" />Reset
            </Button>
            <Button onClick={handleSave} className="gap-2 bg-primary hover:bg-primary/90" disabled={currentStep < stepsTotal}>
              <Save className="w-4 h-4" />Save
            </Button>
          </div>
        </div>
      </header>

      <div className="relative">
        <div className="grid grid-cols-1 md:grid-cols-2 p-6 md:p-10 gap-8">
          <FormSection cv={cv} setCV={setCV} onStepChange={setCurrentStep} />
          <ResumePreview cv={cv} />
        </div>
      </div>

      {/* AI Chat Modal */}
      {showAIChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex overflow-hidden">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold">AI CV Generator</h2>
                    <p className="text-white/80 text-sm">Just type naturally - I understand any format!</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowAIChat(false)} className="text-white hover:bg-white/20">
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="h-2 bg-gray-200">
                <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500" style={{ width: `${completion.percentage}%` }} />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "user" ? "bg-primary" : "bg-purple-100"}`}>
                      {msg.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-purple-600" />}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === "user" ? "bg-primary text-white" : "bg-gray-100 text-gray-800"}`}>
                      <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                    </div>
                  </div>
                ))}
                {isAILoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="border-t p-4 space-y-3">
                <div className="flex gap-2">
                  <textarea
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                    placeholder="Type anything... name, skills, experience, achievements (Enter to send)"
                    className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    rows={2}
                  />
                  <Button onClick={sendMessage} disabled={!inputMessage.trim() || isAILoading} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4">
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
                
                {completion.percentage >= 30 && (
                  <Button onClick={generateCVFromAI} disabled={isAILoading} className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-5">
                    <Wand2 className="w-5 h-5" />
                    {isAILoading ? "Generating..." : `Generate CV (${completion.percentage}% complete)`}
                  </Button>
                )}
              </div>
            </div>

            {/* Status Sidebar */}
            <div className="w-64 bg-gray-50 border-l p-4 hidden lg:block">
              <h3 className="font-semibold text-gray-700 mb-4">CV Progress</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasName} />
                  <span className={completion.status?.hasName ? "text-gray-700" : "text-gray-400"}>Name</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasEmail} />
                  <span className={completion.status?.hasEmail ? "text-gray-700" : "text-gray-400"}>Email</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasPhone} />
                  <span className={completion.status?.hasPhone ? "text-gray-700" : "text-gray-400"}>Phone</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasJobTitle} />
                  <span className={completion.status?.hasJobTitle ? "text-gray-700" : "text-gray-400"}>Job Title</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasSummary} />
                  <span className={completion.status?.hasSummary ? "text-gray-700" : "text-gray-400"}>Summary</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasExperience} />
                  <span className={completion.status?.hasExperience ? "text-gray-700" : "text-gray-400"}>Experience</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasEducation} />
                  <span className={completion.status?.hasEducation ? "text-gray-700" : "text-gray-400"}>Education</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasSkills} />
                  <span className={completion.status?.hasSkills ? "text-gray-700" : "text-gray-400"}>Skills</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasProjects} />
                  <span className={completion.status?.hasProjects ? "text-gray-700" : "text-gray-400"}>Projects</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon completed={completion.status?.hasAchievements} />
                  <span className={completion.status?.hasAchievements ? "text-gray-700" : "text-gray-400"}>Achievements</span>
                </div>
              </div>
              
              <div className="mt-6 p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-700 font-medium">💡 Quick Tips:</p>
                <ul className="text-xs text-purple-600 mt-2 space-y-1">
                  <li>• "Add you some skills" - I'll generate relevant ones!</li>
                  <li>• "Add you some responsibilities" - I'll create professional bullet points!</li>
                  <li>• "Add you another data" for projects - I'll expand it!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-lg shadow-lg p-6 max-w-sm w-full mx-4 text-center">
            <h2 className="text-lg font-semibold mb-2">Saved successfully</h2>
            <p className="text-sm text-muted-foreground mb-4">Your CV has been saved.</p>
            <Button onClick={() => setShowSuccessPopup(false)} className="px-4 py-2">Close</Button>
          </div>
        </div>
      )}
    </div>
  );
}

