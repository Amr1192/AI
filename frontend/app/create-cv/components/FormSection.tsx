"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, ArrowRight, Home, Sparkles } from "lucide-react"
import Link from "next/link"
import { cvEnhanceService } from "@/lib/cv-enhance-service"

type ExperienceItem = { id: string; company: string; position: string; startDate: string; endDate: string; description: string; currentlyWorking?: boolean }
type EducationItem = {
  id: string;
  university: string;
  faculty: string;
  field: string;
  startDate: string;
  endDate: string;
  currentlyStudying?: boolean;
}
type ProjectItem = { id: string; title: string; description: string; link?: string; isGithubRepo?: boolean }

export interface CVData {
  personalInfo: { fullName: string; jobTitle: string; email: string; phone: string; location: string; linkedin?: string; github?: string; militaryService?: string }
  summary: string
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: string[]
  themeColor?: string
  projects: ProjectItem[]
  achievements?: string[]
  fontSize?: number
  fontSizes?: { name?: number; title?: number; body?: number }
  linkifyContacts?: boolean
}

export default function FormSection({ cv, setCV, onStepChange }: { cv: CVData; setCV: (u: CVData | ((p: CVData)=>CVData))=>void; onStepChange?: (step: number)=>void }) {
  const [activeFormIndex, setActiveFormIndex] = useState(1)
  const [enableNext, setEnableNext] = useState(false)
  const [skillInput, setSkillInput] = useState("")
  const [projectInput, setProjectInput] = useState<{ title: string; description: string; link?: string; isGithubRepo?: boolean }>({ title: "", description: "", link: "", isGithubRepo: false })
  const [achievementInput, setAchievementInput] = useState("")
  const [activeFontTarget, setActiveFontTarget] = useState<'name'|'title'|'body'>('body')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summarySuggestions, setSummarySuggestions] = useState<string[]>([])

  const onPersonalChange = (name: string, value: string) => {
    setEnableNext(value.trim().length > 0)
    setCV({ ...cv, personalInfo: { ...cv.personalInfo, [name]: value } as any })
  }

  const addExperience = () => {
    setCV((prev: any) => ({
      ...prev,
      experience: [...prev.experience, { id: Date.now().toString(), company: "", position: "", startDate: "", endDate: "", description: "", currentlyWorking: false }],
    }))
  }

  const removeExperience = (id: string) => {
    setCV((prev: any) => ({ ...prev, experience: prev.experience.filter((e: any) => e.id !== id) }))
  }

  const addEducation = () => {
    setCV((prev: any) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          id: Date.now().toString(),
          university: "",
          faculty: "",
          field: "",
          startDate: "",
          endDate: "",
          currentlyStudying: false,
        },
      ],
    }))
  }

  const removeEducation = (id: string) => {
    setCV((prev: any) => ({ ...prev, education: prev.education.filter((e: any) => e.id !== id) }))
  }

  const addSkill = () => {
    const s = skillInput.trim()
    if (!s) return
    if (cv.skills.includes(s)) return
    setCV({ ...cv, skills: [...cv.skills, s] })
    setSkillInput("")
  }

  const removeSkill = (idx: number) => {
    setCV({ ...cv, skills: cv.skills.filter((_, i) => i !== idx) })
  }

  const addProject = () => {
    const t = projectInput.title.trim()
    const d = projectInput.description.trim()
    if (!t || !d) return
    setCV((prev: any) => ({
      ...prev,
      projects: [
        ...(prev.projects||[]),
        {
          id: Date.now().toString(),
          title: t,
          description: d,
          link: projectInput.link?.trim() || "",
          isGithubRepo: !!projectInput.isGithubRepo,
        },
      ],
    }))
    setProjectInput({ title: "", description: "", link: "", isGithubRepo: false })
  }

  const removeProject = (id: string) => {
    setCV((prev: any) => ({ ...prev, projects: (prev.projects||[]).filter((p: any)=>p.id!==id) }))
  }

  const addAchievement = () => {
    const a = achievementInput.trim()
    if (!a) return
    setCV((prev: any) => ({
      ...prev,
      achievements: [...(prev.achievements || []), a],
    }))
    setAchievementInput("")
  }

 const removeAchievement = (idx: number) => {
    setCV((prev: CVData) => ({
      ...prev,
      achievements: (prev.achievements || []).filter((_item: string, i: number) => i !== idx)
    }))
  }

  const goToStep = (step: number) => {
    setActiveFormIndex(step)
    if (onStepChange) onStepChange(step)
  }

  const handleGenerateSummary = async () => {
    const baseTitle = cv.personalInfo.jobTitle?.trim() || "Professional";
    const currentSummary = cv.summary?.trim() || "";
    const experienceLines = cv.experience
      .map((e) => `${e.position} at ${e.company} (${e.startDate} - ${e.endDate || e.currentlyWorking ? 'Present' : ''})`)
      .filter(Boolean)
      .join("\n");

    const prompt = [
      `Write a concise, ATS-friendly professional summary for a ${baseTitle}.`,
      experienceLines && "Experience:\n" + experienceLines,
      currentSummary && "Current summary (improve this):\n" + currentSummary,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!prompt.trim()) return;

    try {
      setSummaryLoading(true);
      const result = await cvEnhanceService.enhance(prompt);
      const enhanced = result.enhanced?.trim();
      if (enhanced) {
        setCV({ ...cv, summary: enhanced });
      }
      setSummarySuggestions(result.suggestions || []);
    } catch {
      // silent failure: keep existing summary
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex gap-3">
          <Link href="/">
            <Button className="theme-button">
              <Home className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <div className="flex gap-2">
          {activeFormIndex > 1 && (
            <Button size="sm" className="theme-button" onClick={() => goToStep(activeFormIndex - 1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <Button
            disabled={!enableNext && activeFormIndex===1}
            size="sm"
            className={`theme-button ${enableNext || activeFormIndex!==1 ? '' : 'bg-gray-500 cursor-not-allowed'}`}
            onClick={() => goToStep(activeFormIndex + 1)}
          >
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div>
        {activeFormIndex === 1 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <h2 className="font-bold text-lg">Personal Details</h2>
            <p>Get started with basic information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              <div className="sm:col-span-2">
                <label className="text-sm">Full Name</label>
                <Input value={cv.personalInfo.fullName || ""} onFocus={()=>setActiveFontTarget('name')} onChange={(e)=>onPersonalChange('fullName', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm">Professional Title</label>
                <Input value={cv.personalInfo.jobTitle || ""} onFocus={()=>setActiveFontTarget('title')} onChange={(e)=>onPersonalChange('jobTitle', e.target.value)} placeholder="e.g., Senior Software Engineer" />
              </div>
              <div>
                <label className="text-sm">Email</label>
                <Input value={cv.personalInfo.email || ""} onChange={(e)=>onPersonalChange('email', e.target.value)} />
              </div>
              <div>
                <label className="text-sm">Phone</label>
                <Input value={cv.personalInfo.phone || ""} onChange={(e)=>onPersonalChange('phone', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm">Location</label>
                <Input value={cv.personalInfo.location || ""} onChange={(e)=>onPersonalChange('location', e.target.value)} />
              </div>
              <div>
                <label className="text-sm">LinkedIn URL</label>
                <Input value={cv.personalInfo.linkedin || ""} placeholder="https://linkedin.com/in/username" onChange={(e)=>onPersonalChange('linkedin', e.target.value)} />
              </div>
              <div>
                <label className="text-sm">GitHub URL</label>
                <Input value={cv.personalInfo.github || ""} placeholder="https://github.com/username" onChange={(e)=>onPersonalChange('github', e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3">
                <input id="linkify" type="checkbox" checked={!!cv.linkifyContacts} onChange={(e)=>setCV({ ...cv, linkifyContacts: e.target.checked })} />
                <label htmlFor="linkify" className="text-sm">Render contact fields as hyperlinks</label>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm">Military Service Status</label>
                <Input
                  placeholder="Completed / Exempted / Not applicable"
                  value={cv.personalInfo.militaryService || ""}
                  onChange={(e)=>onPersonalChange('militaryService', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm">Active Font Size ({activeFontTarget})</label>
                <div className="flex items-center gap-3">
                  <Input type="number" step={0.5} min={8} max={32} value={(cv.fontSizes?.[activeFontTarget] ?? (activeFontTarget==='body' ? (cv.fontSize||10.5) : activeFontTarget==='name' ? 24 : 14)) as number}
                    onChange={(e)=>{
                      const v = parseFloat(e.target.value)
                      const fs = { ...(cv.fontSizes||{}) } as any
                      fs[activeFontTarget] = v
                      setCV({ ...cv, fontSizes: fs })
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : activeFormIndex === 2 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-lg">Professional Summary</h2>
            </div>
            <Textarea
              rows={6}
              value={cv.summary || ""}
              onChange={(e)=>setCV({ ...cv, summary: e.target.value })}
              placeholder="Write a short professional summary or use the AI helper to generate one."
            />
            {summarySuggestions.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                <div className="font-semibold">AI suggestions:</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {summarySuggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : activeFormIndex === 3 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Education</h2>
              <Button variant="outline" onClick={addEducation}>+ Add</Button>
            </div>
            <div className="space-y-3">
              {cv.education.map((edu, idx) => (
                <div key={edu.id} className="space-y-3 p-3 rounded-md border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      placeholder="University"
                      value={edu.university || ""}
                      onChange={(e)=>setCV((prev:any)=>({
                        ...prev,
                        education: prev.education.map((x:any)=>x.id===edu.id?{...x, university:e.target.value}:x),
                      }))}
                    />
                    <Input
                      placeholder="Faculty"
                      value={edu.faculty || ""}
                      onChange={(e)=>setCV((prev:any)=>({
                        ...prev,
                        education: prev.education.map((x:any)=>x.id===edu.id?{...x, faculty:e.target.value}:x),
                      }))}
                    />
                    <Input
                      placeholder="Field of Study"
                      value={edu.field || ""}
                      onChange={(e)=>setCV((prev:any)=>({
                        ...prev,
                        education: prev.education.map((x:any)=>x.id===edu.id?{...x, field:e.target.value}:x),
                      }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        placeholder="Start date"
                        value={edu.startDate || ""}
                        onChange={(e)=>setCV((prev:any)=>({
                          ...prev,
                          education: prev.education.map((x:any)=>x.id===edu.id?{...x, startDate:e.target.value}:x),
                        }))}
                      />
                      <Input
                        type={edu.currentlyStudying ? "text" : "date"}
                        placeholder="End date"
                        value={edu.currentlyStudying ? "Present" : (edu.endDate || "")}
                        onChange={(e)=>setCV((prev:any)=>({
                          ...prev,
                          education: prev.education.map((x:any)=>x.id===edu.id?{...x, endDate:e.target.value, currentlyStudying:false}:x),
                        }))}
                        disabled={edu.currentlyStudying}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      id={`edu-current-${edu.id}`}
                      type="checkbox"
                      checked={!!edu.currentlyStudying}
                      onChange={(e)=>setCV((prev:any)=>({
                        ...prev,
                        education: prev.education.map((x:any)=>x.id===edu.id?{
                          ...x,
                          currentlyStudying: e.target.checked,
                          endDate: e.target.checked ? 'Present' : '',
                        }:x),
                      }))}
                    />
                    <label htmlFor={`edu-current-${edu.id}`}>I am currently studying here</label>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="ghost" className="text-red-600" onClick={()=>removeEducation(edu.id)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeFormIndex === 4 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Experience</h2>
              <Button variant="outline" onClick={addExperience}>+ Add</Button>
            </div>
            <div className="space-y-3">
              {cv.experience.map((exp) => (
                <div key={exp.id} className="space-y-2 p-3 rounded-md border">
                  <Input placeholder="Company" value={exp.company || ""} onChange={(e)=>setCV((prev:any)=>({ ...prev, experience: prev.experience.map((x:any)=>x.id===exp.id?{...x, company:e.target.value}:x) }))} />
                  <Input placeholder="Position" value={exp.position || ""} onChange={(e)=>setCV((prev:any)=>({ ...prev, experience: prev.experience.map((x:any)=>x.id===exp.id?{...x, position:e.target.value}:x) }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" placeholder="Start" value={exp.startDate || ""} onChange={(e)=>setCV((prev:any)=>({ ...prev, experience: prev.experience.map((x:any)=>x.id===exp.id?{...x, startDate:e.target.value}:x) }))} />
                    <div className="flex items-center gap-2">
                      <Input
                        type={exp.currentlyWorking ? "text" : "date"}
                        placeholder="End"
                        value={exp.currentlyWorking ? "Present" : (exp.endDate || "")}
                        onChange={(e)=>setCV((prev:any)=>({
                          ...prev,
                          experience: prev.experience.map((x:any)=>x.id===exp.id?{...x, endDate: e.target.value, currentlyWorking: false}:x)
                        }))}
                        disabled={exp.currentlyWorking}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      id={`current-${exp.id}`}
                      type="checkbox"
                      checked={!!exp.currentlyWorking}
                      onChange={(e)=>setCV((prev:any)=>({
                        ...prev,
                        experience: prev.experience.map((x:any)=>x.id===exp.id?{
                          ...x,
                          currentlyWorking: e.target.checked,
                          endDate: e.target.checked ? 'Present' : ''
                        }:x)
                      }))}
                    />
                    <label htmlFor={`current-${exp.id}`}>I currently work here</label>
                  </div>
                  <Textarea rows={3} placeholder="Description" value={exp.description || ""} onChange={(e)=>setCV((prev:any)=>({ ...prev, experience: prev.experience.map((x:any)=>x.id===exp.id?{...x, description:e.target.value}:x) }))} />
                  <Button variant="ghost" onClick={()=>removeExperience(exp.id)} className="text-red-600 w-fit">Remove</Button>
                </div>
              ))}
            </div>
          </div>
        ) : activeFormIndex === 5 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Projects</h2>
            </div>
            <div className="space-y-3">
              <Input placeholder="Project Title" value={projectInput.title || ""} onChange={(e)=>setProjectInput({...projectInput, title: e.target.value})} />
              <Textarea rows={3} placeholder="Short Description" value={projectInput.description || ""} onChange={(e)=>setProjectInput({...projectInput, description: e.target.value})} />
              <Input placeholder="Link (optional)" value={projectInput.link || ""} onChange={(e)=>setProjectInput({...projectInput, link: e.target.value})} />
              <div className="flex items-center gap-2">
                <input
                  id="project-github-repo"
                  type="checkbox"
                  checked={!!projectInput.isGithubRepo}
                  onChange={(e)=>setProjectInput({...projectInput, isGithubRepo: e.target.checked})}
                />
                <label htmlFor="project-github-repo" className="text-sm">Github Repo</label>
              </div>
              <Button onClick={addProject}>Add Project</Button>
            </div>
            <div className="mt-4 space-y-3">
              {(cv.projects||[]).map((p)=> (
                <div key={p.id} className="p-3 rounded-md border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-sm text-muted-foreground whitespace-pre-line">{p.description}</div>
                      {p.link && (
                        <a href={p.link} target="_blank" className="text-xs text-accent underline">
                          {p.isGithubRepo ? "Github Repo" : p.link}
                        </a>
                      )}
                    </div>
                    <Button variant="ghost" className="text-red-600" onClick={()=>removeProject(p.id)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeFormIndex === 6 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <h2 className="font-bold text-lg">Achievements</h2>
            <p className="text-sm text-muted-foreground mb-3">Add any notable achievements, or skip this step for now.</p>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Add an achievement"
                value={achievementInput || ""}
                onChange={(e)=>setAchievementInput(e.target.value)}
                onKeyDown={(e)=>{ if (e.key === "Enter") { e.preventDefault(); addAchievement() } }}
              />
              <Button onClick={addAchievement}>Add</Button>
            </div>
            <div className="mt-2">
              {(cv.achievements || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No achievements added yet.</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {(cv.achievements || []).map((a, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2">
                      <span>{a}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-red-600 h-6 px-2 text-xs"
                        onClick={()=>removeAchievement(idx)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : activeFormIndex === 7 ? (
          <div className="p-5 shadow-lg rounded-lg border-t-primary border-t-4 mt-2">
            <h2 className="font-bold text-lg">Skills</h2>
            <div className="flex gap-2">
              <Input placeholder="Add a skill" value={skillInput || ""} onChange={(e)=>setSkillInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==="Enter"){ e.preventDefault(); addSkill() } }} />
              <Button onClick={addSkill}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {cv.skills.map((s, i)=> (
                <span key={i} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent">
                  {s}
                  <button onClick={()=>removeSkill(i)} className="text-accent hover:text-accent/80">×</button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}