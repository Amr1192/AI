"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Loader2, Save, Download, FileText, RefreshCw, Sparkles, CheckCircle, XCircle, Plus } from "lucide-react"
import { useHotkeys } from 'react-hotkeys-hook'

interface LocalUser {
  id: string
  name: string
  email: string
  createdAt: string
}

interface SkillSuggestion {
  skill: string
  category: string
  relevance: string
  reason: string
}

export default function EnhanceCVPage() {
  const router = useRouter()
  const [user, setUser] = useState<LocalUser | null>(null)
  const [cvText, setCVText] = useState("")
  const [strengths, setStrengths] = useState<string[]>([])
  const [improvements, setImprovements] = useState<string[]>([])
  const [atsScore, setAtsScore] = useState<number | null>(null)
  const [overallScore, setOverallScore] = useState<number | null>(null)
  const [enhancedCV, setEnhancedCV] = useState("")
  const [enhancedData, setEnhancedData] = useState<any>(null)
  const [lastAnalysis, setLastAnalysis] = useState<any>(null)
  const [customSections, setCustomSections] = useState<Array<{title:string; items:string[]}>>([])
  const [hiddenSections, setHiddenSections] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  
  // Missing-fields prompt before enhancement
  const [showMissingFields, setShowMissingFields] = useState(false)
  const [missingFieldValues, setMissingFieldValues] = useState<Record<string, string>>({})

  // NEW: Skill suggestions state
  const [skillSuggestions, setSkillSuggestions] = useState<SkillSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [enhancingSummary, setEnhancingSummary] = useState(false)
  
  const [keyboardShortcuts] = useState({
    analyze: 'Ctrl+Enter',
    enhance: 'Ctrl+E',
    save: 'Ctrl+S',
    download: 'Ctrl+D'
  })

  const API_URL = process.env.NEXT_PUBLIC_ENHANCE_API ?? "http://127.0.0.1:5006"
  
  const [templates, setTemplates] = useState<Array<{id:string;name:string;colors:string[];fonts:string[]}>>([])
  const [selectedTemplate, setSelectedTemplate] = useState<{id:string;name:string;colors:string[];fonts:string[]}|null>(null)
  const [accentColor, setAccentColor] = useState<string>("#000000")
  const [fontFamily, setFontFamily] = useState<string>("Helvetica")

  const previewRef = useRef<HTMLDivElement>(null)

  const formatEducationEntry = (item: any): string => {
    if (item == null) return ""
    if (typeof item === "object" && !Array.isArray(item)) {
      const degree = item.degree || item.qualification || item.title || item.name || ""
      const institution = item.institution || item.school || item.university || item.college || ""
      const year = item.year || item.graduationYear || item.graduation || item.date || ""
      const field = item.field || item.major || ""
      let degreeText = String(degree).trim()
      if (field && degreeText && !degreeText.toLowerCase().includes(String(field).toLowerCase())) {
        degreeText = `${degreeText} in ${field}`
      }
      const parts = [degreeText, String(institution).trim()].filter(Boolean)
      let line = parts.join(" - ")
      if (year) line = line ? `${line}, ${year}` : String(year)
      return line.trim()
    }

    const text = String(item).trim()
    if (!text) return ""
    if (text.startsWith("{") && /degree|institution|university/i.test(text)) {
      try {
        const parsed = JSON.parse(text.replace(/'/g, '"'))
        if (parsed && typeof parsed === "object") return formatEducationEntry(parsed)
      } catch {
        try {
          const degree = text.match(/['"]degree['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1]
          const institution = text.match(/['"]institution['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1]
          const year = text.match(/['"]year['"]\s*:\s*(\d{4})/i)?.[1]
          if (degree || institution) {
            return formatEducationEntry({ degree, institution, year })
          }
        } catch { /* fall through */ }
      }
    }
    return text
  }

  const normalizeEducationList = (v: any): string[] => {
    if (!v) return []
    const items = Array.isArray(v) ? v : [v]
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of items) {
      const line = formatEducationEntry(item)
      if (!line) continue
      const key = line.toLowerCase().replace(/[^a-z0-9]/g, "")
      if (seen.has(key)) continue
      seen.add(key)
      out.push(line)
    }
    return out
  }

  const toLine = (item: any): string => {
    if (item == null) return ""
    if (typeof item === "string") return item
    if (typeof item === "number") return String(item)
    if (Array.isArray(item)) return item.map(toLine).join(", ")
    if (typeof item === "object") {
      if ("degree" in item || "institution" in item || "university" in item) {
        return formatEducationEntry(item)
      }
      const preferred = (item as any).text || (item as any).bullet || (item as any).description || (item as any).title
      if (preferred) return String(preferred)
      try { return Object.values(item).map(toLine).join(" — ") } catch { return "" }
    }
    return String(item)
  }

  const toArray = (v: any): string[] => {
    if (!v) return []
    if (Array.isArray(v)) return v.map(toLine).filter(Boolean)
    if (typeof v === 'string') return v.split(/\n|\u2022|\-/).map(s=>s.trim()).filter(Boolean)
    if (typeof v === 'object') return Object.values(v).map(toLine).filter(Boolean)
    return []
  }

  const mergeContactFields = (primary: any, fallback: any) => ({
    ...fallback,
    ...primary,
    name: primary?.name || fallback?.name || "",
    email: primary?.email || fallback?.email || "",
    phone: primary?.phone || fallback?.phone || "",
    address: primary?.address || fallback?.address || "",
    linkedin: primary?.linkedin || fallback?.linkedin || "",
    education: normalizeEducationList(primary?.education?.length ? primary.education : fallback?.education),
  })

  const toggleSection = (key: string) => {
    setHiddenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // NEW: Enhance summary with AI
  const enhanceSummaryWithAI = useCallback(async () => {
    if (!cvText.trim() && !enhancedData) {
      toast.error("Please analyze your CV first")
      return
    }
    
    setEnhancingSummary(true)
    try {
      const res = await fetch(`${API_URL}/enhance-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          cv_text: cvText,
          job_description: "",
          tone: "professional"
        })
      })
      const data = await res.json()
      
      if (!data.success) throw new Error(data.error || "Failed to enhance summary")
      
      const enhancedSummary = data.summary || ""
      
      // Update enhanced data with new summary
      if (enhancedData) {
        setEnhancedData({ ...enhancedData, summary: enhancedSummary })
      } else {
        // If no enhanced data yet, create minimal structure
        setEnhancedData({ 
          summary: enhancedSummary,
          skills: lastAnalysis?.skills || [],
          experienceEntries: []
        })
      }
      
      toast.success("Summary enhanced successfully!")
    } catch (e: any) {
      toast.error(e.message || "Failed to enhance summary")
    } finally {
      setEnhancingSummary(false)
    }
  }, [cvText, enhancedData, lastAnalysis, API_URL])

  // NEW: Get AI skill suggestions
  const getSuggestedSkills = useCallback(async () => {
    if (!cvText.trim()) {
      toast.error("Please add your CV text first")
      return
    }
    
    setLoadingSuggestions(true)
    try {
      const res = await fetch(`${API_URL}/suggest-skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          cv_text: cvText,
          job_description: ""  // You can add job description here if available
        })
      })
      const data = await res.json()
      
      if (!data.success) throw new Error(data.error || "Failed to get suggestions")
      
      setSkillSuggestions(data.suggestions || [])
      setShowSuggestions(true)
      toast.success(`Found ${data.suggestions?.length || 0} skill suggestions`)
    } catch (e: any) {
      toast.error(e.message || "Failed to get skill suggestions")
    } finally {
      setLoadingSuggestions(false)
    }
  }, [cvText, API_URL])

  const buildCvTextFromData = useCallback((data: any, contact?: any): string => {
    const lines: string[] = []
    const name = contact?.name || data?.name
    if (name) lines.push(String(name))

    const contactLine = [contact?.phone, contact?.email, contact?.address, contact?.linkedin]
      .filter(Boolean)
      .join(" | ")
    if (contactLine) lines.push(contactLine)
    if (lines.length) lines.push("")

    if (data?.summary) {
      lines.push("Professional Summary")
      lines.push(String(data.summary))
      lines.push("")
    }

    const experiences = data?.experienceEntries || []
    if (experiences.length > 0) {
      lines.push("Work Experience")
      for (const exp of experiences) {
        const header = [exp.title, exp.company].filter(Boolean).join(" at ")
        const meta = [exp.period, exp.location].filter(Boolean).join(" | ")
        lines.push(meta ? `${header} | ${meta}` : header)
        for (const bullet of exp.bullets || []) {
          const t = toLine(bullet).trim()
          if (t) lines.push(`- ${t}`)
        }
        lines.push("")
      }
    }

    const skills = Array.isArray(data?.skills) ? data.skills.filter((s: string) => String(s).trim()) : []
    if (skills.length > 0) {
      lines.push("Skills")
      lines.push(skills.join(", "))
      lines.push("")
    }

    const education = normalizeEducationList(data?.education)
    if (education.length > 0) {
      lines.push("Education")
      education.forEach((e) => lines.push(e))
      lines.push("")
    }

    const languages = toArray(data?.languages)
    if (languages.length > 0) {
      lines.push("Languages")
      languages.forEach((l) => lines.push(`- ${l}`))
      lines.push("")
    }

    const certifications = toArray(data?.certifications)
    if (certifications.length > 0) {
      lines.push("Certifications")
      certifications.forEach((c) => lines.push(`- ${c}`))
      lines.push("")
    }

    return lines.join("\n").trim()
  }, [])

  const analyzableText = useMemo(() => {
    if (enhancedData) {
      const built = buildCvTextFromData(enhancedData, lastAnalysis)
      if (built.trim()) return built
    }
    return cvText
  }, [enhancedData, lastAnalysis, cvText, buildCvTextFromData])

  // Save draft to localStorage
  const saveDraft = useCallback(async () => {
    if (!cvText.trim()) return
    
    setIsDraftSaving(true)
    try {
      const draft = {
        cvText,
        lastSaved: new Date().toISOString(),
        analysis: lastAnalysis ? {
          strengths,
          improvements,
          atsScore,
          overallScore
        } : null
      }
      localStorage.setItem('cvDraft', JSON.stringify(draft))
      setHasUnsavedChanges(false)
      toast.success('Draft saved successfully')
    } catch (error) {
      console.error('Failed to save draft:', error)
      toast.error('Failed to save draft')
    } finally {
      setIsDraftSaving(false)
    }
  }, [cvText, lastAnalysis, strengths, improvements, atsScore, overallScore])

  const clearEnhanceStorage = useCallback(() => {
    localStorage.removeItem('cv_from_analysis')
    localStorage.removeItem('cv_auto_enhance')
    localStorage.removeItem('cv_enhance_intent')
    localStorage.removeItem('cv_file_name')
    localStorage.removeItem('cv_file_type')
    localStorage.removeItem('cvDraft')
  }, [])

  const resetEnhanceState = useCallback(() => {
    setCVText('')
    setStrengths([])
    setImprovements([])
    setAtsScore(null)
    setOverallScore(null)
    setEnhancedCV('')
    setEnhancedData(null)
    setLastAnalysis(null)
    setCustomSections([])
    setHiddenSections({})
    setSkillSuggestions([])
    setSelectedSkills([])
    setShowSuggestions(false)
    setHasUnsavedChanges(false)
  }, [])

  const toArrayWithEmpty = (v: any): string[] => {
  if (!v) return []
  if (Array.isArray(v)) return v.map(toLine)  // Don't filter out empty strings
  if (typeof v === 'string') return v.split(/\n|\u2022|\-/).map(s=>s.trim())
  if (typeof v === 'object') return Object.values(v).map(toLine)
  return []
}

  const extractWorkExperience = (text: string): Array<{
    company: string
    title: string
    period: string
    location: string
    bullets: string[]
  }> => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const experiences: Array<{
      company: string
      title: string
      period: string
      location: string
      bullets: string[]
    }> = []

    const expKeywords = ['experience', 'work history', 'employment', 'professional experience', 'career history']
    let expStartIdx = -1
    
    for (let i = 0; i < lines.length; i++) {
      const lineLower = lines[i].toLowerCase()
      if (expKeywords.some(k => lineLower === k || lineLower.includes(k))) {
        expStartIdx = i + 1
        break
      }
    }

    if (expStartIdx === -1) expStartIdx = 0

    let currentExp: any = null
    const endSections = ['education', 'skills', 'languages', 'certifications', 'training', 'projects', 'awards']

    for (let i = expStartIdx; i < lines.length; i++) {
      const line = lines[i]
      const lineLower = line.toLowerCase()

      if (endSections.some(s => lineLower === s || (lineLower.startsWith(s) && line.length < 30))) {
        break
      }

      const pattern1 = line.match(/^(.+?)\s+(?:at|@|-|–)\s+(.+?)\s*[|•]\s*(.+)$/i)
      const pattern2 = line.match(/^(.+?)\s*[-–]\s*(.+?)\s*\((.+?)\)$/i)
      const datePattern = /(\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\s*[-–—to]\s*(?:Present|Current|(\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}))/i
      const durationPattern = /^(?:Duration|Period|Date|Dates?):\s*(.+)$/i
      
      const hasDate = datePattern.test(line)
      const durationMatch = line.match(durationPattern)
      
      if (durationMatch && currentExp) {
        currentExp.period = durationMatch[1].trim()
        continue
      }

      if (pattern1) {
        if (currentExp && (currentExp.company || currentExp.title)) {
          experiences.push(currentExp)
        }
        currentExp = {
          title: pattern1[1].trim(),
          company: pattern1[2].trim(),
          period: pattern1[3].trim(),
          location: '',
          bullets: []
        }
      } else if (pattern2) {
        if (currentExp && (currentExp.company || currentExp.title)) {
          experiences.push(currentExp)
        }
        currentExp = {
          title: pattern2[1].trim(),
          company: pattern2[2].trim(),
          period: pattern2[3].trim(),
          location: '',
          bullets: []
        }
      } else if (hasDate && line.length > 20) {
        if (currentExp && (currentExp.company || currentExp.title)) {
          experiences.push(currentExp)
        }
        const dateMatch = line.match(datePattern)
        const period = dateMatch ? dateMatch[0] : ''
        const remainingText = line.replace(datePattern, '').trim()
        const parts = remainingText.split(/[-–—|@]/).map(p => p.trim()).filter(Boolean)
        
        currentExp = {
          title: parts[0] || '',
          company: parts[1] || remainingText,
          period: period,
          location: '',
          bullets: []
        }
      } else if (currentExp && (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))) {
        const bullet = line.replace(/^[•\-*\d.]\s*/, '').trim()
        if (bullet.length > 5) {
          currentExp.bullets.push(bullet)
        }
      } else if (currentExp && line.length > 20 && !line.match(/^[A-Z\s]+$/) && currentExp.bullets.length > 0) {
        if (line.match(/^[A-Z]/) && !line.endsWith('.')) {
          currentExp.bullets.push(line.trim())
        } else {
          const lastIdx = currentExp.bullets.length - 1
          currentExp.bullets[lastIdx] += ' ' + line.trim()
        }
      } else if (!currentExp && line.length > 10 && line.length < 100) {
        const nextLine = lines[i + 1] || ''
        
        if (nextLine.match(durationPattern) || nextLine.match(datePattern)) {
          currentExp = {
            title: '',
            company: line.trim(),
            period: '',
            location: '',
            bullets: []
          }
        } else if (nextLine.startsWith('•') || nextLine.startsWith('-')) {
          currentExp = {
            title: line.trim(),
            company: '',
            period: '',
            location: '',
            bullets: []
          }
        }
      }
    }

    if (currentExp && (currentExp.company || currentExp.title)) {
      experiences.push(currentExp)
    }

    return experiences
      .filter(exp => exp.company || exp.title || exp.bullets.length > 0)
      .map(exp => ({
        company: exp.company || 'Company Name',
        title: exp.title || 'Job Title',
        period: exp.period || 'Date - Date',
        location: exp.location || '',
        bullets: exp.bullets.length > 0 ? exp.bullets : ['Add job responsibilities here']
      }))
  }

  const deriveFromText = (text: string) => {
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean)
    const res: any = {}
    
    for (const l of lines.slice(0,6)) {
      if (/@|\d/.test(l)) continue
      if (/^[A-Za-z]{2,}(\s+[A-Za-z\-']{2,})+/.test(l)) { res.name = l; break }
    }
    
    const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    if (email) res.email = email[0]
    const phone = text.match(/(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}(?:[-.\s]?\d+)?/)
    if (phone) res.phone = phone[0].trim()

    const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub)\/[\w\-./%]+/i)
      || text.match(/\blinkedin\.com\/[\w\-./%]+/i)
    if (linkedin) {
      let url = linkedin[0].trim().replace(/[.,;]+$/, "")
      if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`
      res.linkedin = url
    }

    const labeledAddress = text.match(/(?:address|location|based in|residence)\s*[:\-–]\s*([^\n|]+)/i)
    if (labeledAddress) {
      res.address = labeledAddress[1].trim().replace(/[.,;]+$/, "")
    } else {
      const cityCountry = text.match(
        /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*[,|\-–]\s*(Egypt|UAE|Saudi Arabia|KSA|USA|UK|United Kingdom|Canada|Jordan)\b/
      )
      if (cityCountry) {
        res.address = cityCountry[0].trim().replace(/[.,;]+$/, "")
      } else {
        for (const l of lines.slice(0, 15)) {
          const low = l.toLowerCase()
          if (/@|linkedin|http/.test(low) || /\b(phone|email|mobile|tel)\b/.test(low)) continue
          if (/(cairo|giza|alexandria|egypt|riyadh|dubai|uae|london|amman)/i.test(l) && l.length < 100) {
            res.address = l.replace(/[.,;]+$/, "")
            break
          }
        }
      }
    }
    
    const eduKeywords = ['Bachelor', 'Master', 'PhD', 'Doctor', 'Bachelor\'s', 'Master\'s', 'BSc', 'MSc', 'MBA', 'BS', 'MS']
    for (const l of lines) {
      if (eduKeywords.some(k => l.includes(k))) {
        res.education = l
        break
      }
    }
    
    const langs: string[] = []
    const langKeywords = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Russian', 'Arabic']
    for (const l of lines) {
      if (langKeywords.some(k => l.includes(k))) {
        langs.push(l)
      }
    }
    if (langs.length > 0) res.languages = langs
    
    const experienceEntries = extractWorkExperience(text)
    if (experienceEntries.length > 0) {
      res.experienceEntries = experienceEntries
    }
    
    return res
  }

  const analyzeWithText = useCallback(async (
    text: string,
    structuredData?: Record<string, unknown>,
    altText?: string,
  ) => {
    if (!text.trim()) {
      toast.error("Please paste your CV text")
      return null
    }

    setAnalyzing(true)
    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_text: text,
          ...(structuredData ? { structured_data: structuredData } : {}),
          ...(altText && altText.trim() && altText !== text ? { alt_text: altText } : {}),
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Analyze failed")
      let r = data.result || {}
      const local = deriveFromText(text)
      r = mergeContactFields(r, local)
      r.education = normalizeEducationList(r.education)
      setLastAnalysis(r)
      setEnhancedData((prev: any) => {
        const base = prev || {}
        return {
          ...base,
          phone: r.phone || base.phone || "",
          email: r.email || base.email || "",
          address: r.address || base.address || "",
          linkedin: r.linkedin || base.linkedin || "",
          summary: base.summary || r.summary || "",
          skills: base.skills?.length ? base.skills : (r.skills || []),
          experienceEntries: base.experienceEntries?.length
            ? base.experienceEntries
            : (r.experienceEntries || []),
          education: normalizeEducationList(base.education?.length ? base.education : r.education),
          languages: base.languages?.length ? base.languages : (r.languages || []),
          certifications: base.certifications?.length ? base.certifications : (r.certifications || []),
        }
      })
      setStrengths(Array.isArray(r.strengths) ? r.strengths : [])
      setImprovements(Array.isArray(r.improvements) ? r.improvements : [])
      setAtsScore(typeof r.atsScore === "number" ? r.atsScore : null)
      setOverallScore(typeof r.overallScore === "number" ? r.overallScore : null)
      // The server may have merged content from both text versions; adopt its
      // canonical text so every later analyze/enhance scores the same content.
      if (typeof r.sourceText === "string" && r.sourceText.trim() && r.sourceText !== text) {
        setCVText(r.sourceText)
        setEnhancedCV(r.sourceText)
      }
      if (r.isValidCV === false) {
        toast.error(r.whyThisScore || "This document is not a valid resume — ATS score is 0.")
      }
      return r
    } catch (e: any) {
      toast.error(e.message || "Analyze request failed")
      return null
    } finally {
      setAnalyzing(false)
    }
  }, [API_URL])

  const addSelectedSkills = useCallback(async () => {
    if (selectedSkills.length === 0) {
      toast.error("Please select skills to add")
      return
    }

    const count = selectedSkills.length
    const base = enhancedData || {
      summary: lastAnalysis?.summary || "",
      skills: Array.isArray(lastAnalysis?.skills) ? [...lastAnalysis.skills] : [],
      experienceEntries: lastAnalysis?.experienceEntries || deriveFromText(cvText).experienceEntries || [],
      education: lastAnalysis?.education || [],
      languages: lastAnalysis?.languages || [],
      certifications: lastAnalysis?.certifications || [],
    }

    const currentSkills: string[] = Array.isArray(base.skills) ? [...base.skills] : []
    selectedSkills.forEach((skill) => {
      if (!currentSkills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
        currentSkills.push(skill)
      }
    })

    const updated = { ...base, skills: currentSkills }
    setEnhancedData(updated)

    const built = buildCvTextFromData(updated, lastAnalysis)
    setCVText(built)
    setEnhancedCV(built)
    setSelectedSkills([])
    setShowSuggestions(false)

    const prevAts = atsScore
    const result = await analyzeWithText(built, updated)
    if (result && prevAts !== null && typeof result.atsScore === "number" && result.atsScore > prevAts) {
      toast.success(`Added ${count} skills — ATS score: ${prevAts} → ${result.atsScore}`)
    } else {
      toast.success(`Added ${count} skills and re-analyzed your CV`)
    }
  }, [selectedSkills, enhancedData, lastAnalysis, cvText, buildCvTextFromData, atsScore, analyzeWithText])

  const handleAnalyze = useCallback(async () => {
    // Raw text is the source of truth; the structure rebuild is sent as an
    // alternate version so the server can merge anything only one of them has.
    const alt = enhancedData ? buildCvTextFromData(enhancedData, lastAnalysis) : undefined
    const prevAts = atsScore
    const result = await analyzeWithText(cvText, enhancedData || undefined, alt)
    if (result && prevAts !== null && typeof result.atsScore === "number" && result.atsScore !== prevAts) {
      toast.success(`ATS score updated: ${prevAts} → ${result.atsScore}`)
    }
  }, [cvText, enhancedData, lastAnalysis, buildCvTextFromData, atsScore, analyzeWithText])

  type MissingFieldDef = {
    key: string
    label: string
    kind: "text" | "textarea" | "list" | "experience"
    placeholder: string
    aliases?: string[]
  }

  const MISSING_FIELD_DEFS: MissingFieldDef[] = [
    { key: "name", label: "Full Name", kind: "text", placeholder: "John Doe" },
    { key: "email", label: "Email", kind: "text", placeholder: "you@example.com" },
    { key: "phone", label: "Phone", kind: "text", placeholder: "+20 100 123 4567" },
    { key: "address", label: "Address / Location", kind: "text", placeholder: "Cairo, Egypt" },
    { key: "linkedin", label: "LinkedIn URL", kind: "text", placeholder: "linkedin.com/in/your-name" },
    {
      key: "summary", label: "Professional Summary", kind: "textarea",
      placeholder: "3-5 sentences about your experience, strengths, and goals",
      aliases: ["professional summary", "summary", "profile", "objective", "about me", "about"],
    },
    {
      key: "experience", label: "Work Experience", kind: "experience",
      placeholder: "One role per line:\nLawyer at Smith & Co | Jan 2019 - Dec 2022\nLegal Intern at Firm LLP | 2018 - 2019",
      aliases: ["work experience", "professional experience", "experience", "employment history", "employment", "work history"],
    },
    {
      key: "skills", label: "Skills", kind: "list",
      placeholder: "Communication, Leadership, Legal research (comma or new line separated)",
      aliases: ["skills", "technical skills", "core competencies", "key skills"],
    },
    {
      key: "education", label: "Education", kind: "list",
      placeholder: "Bachelor Degree in Law - Cairo University, 2018",
      aliases: ["education", "academic background", "academic qualifications", "qualifications"],
    },
    {
      key: "languages", label: "Languages", kind: "list",
      placeholder: "Arabic: Native, English: Advanced",
      aliases: ["languages", "language skills"],
    },
    {
      key: "certifications", label: "Certifications", kind: "list",
      placeholder: "AWS Certified Developer - 2023 (one per line)",
      aliases: ["certifications", "certificates", "licenses", "courses", "training"],
    },
  ]

  const getContactValue = (key: string): string => {
    const v = (enhancedData as any)?.[key] || (lastAnalysis as any)?.[key] || ""
    return String(v).trim()
  }

  const sectionPresentInText = (aliases: string[]): boolean => {
    return cvText.split(/\r?\n/).some((l) => {
      const s = l.trim().replace(/:$/, "").trim().toLowerCase()
      return s.length <= 40 && aliases.includes(s)
    })
  }

  const getMissingFields = (): MissingFieldDef[] => {
    const missing: MissingFieldDef[] = []
    for (const def of MISSING_FIELD_DEFS) {
      if (def.kind === "text") {
        if (!getContactValue(def.key)) missing.push(def)
        continue
      }
      if (def.key === "summary") {
        const summary = String(enhancedData?.summary || lastAnalysis?.summary || "").trim()
        if (summary.split(/\s+/).filter(Boolean).length < 10 && !sectionPresentInText(def.aliases!)) {
          missing.push(def)
        }
        continue
      }
      if (def.key === "experience") {
        const entries = enhancedData?.experienceEntries?.length
          ? enhancedData.experienceEntries
          : lastAnalysis?.experienceEntries
        if (!(entries?.length > 0) && !sectionPresentInText(def.aliases!)) {
          missing.push(def)
        }
        continue
      }
      // list sections: skills, education, languages, certifications
      const fromData = (enhancedData as any)?.[def.key]?.length
        ? (enhancedData as any)[def.key]
        : (lastAnalysis as any)?.[def.key]
      if (!(toArray(fromData).length > 0) && !sectionPresentInText(def.aliases!)) {
        missing.push(def)
      }
    }
    return missing
  }

  const parseExperienceLines = (raw: string) => {
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.+?)\s+at\s+(.+?)(?:\s*\|\s*(.+))?$/i)
        if (m) {
          return { title: m[1].trim(), company: m[2].trim(), period: (m[3] || "").trim(), location: "", bullets: [] }
        }
        return { title: line, company: "", period: "", location: "", bullets: [] }
      })
  }

  const mergeFilled = (base: any, filled: Record<string, any>) => {
    const out = { ...(base || {}) }
    for (const [k, v] of Object.entries(filled)) {
      if (Array.isArray(v)) {
        out[k] = [...(Array.isArray(out[k]) ? out[k] : []), ...v]
      } else {
        out[k] = v
      }
    }
    return out
  }

  const injectMissingIntoText = (text: string, extra: Record<string, any>): string => {
    const labels: Record<string, string> = {
      email: "Email", phone: "Phone", address: "Address", linkedin: "LinkedIn",
    }
    const contactAdditions = ["email", "phone", "address", "linkedin"]
      .filter((k) => typeof extra[k] === "string" && extra[k].trim())
      .map((k) => `${labels[k]}: ${String(extra[k]).trim()}`)

    const lines = text.split(/\r?\n/)
    const firstContentIdx = lines.findIndex((l) => l.trim())
    let out = [...lines]
    if (contactAdditions.length > 0) {
      out.splice(Math.max(firstContentIdx, 0) + 1, 0, ...contactAdditions)
    }
    const name = typeof extra.name === "string" ? extra.name.trim() : ""
    if (name && firstContentIdx >= 0 && !lines[firstContentIdx].toLowerCase().includes(name.toLowerCase())) {
      out.unshift(name)
    }

    const sections: string[] = []
    if (typeof extra.summary === "string" && extra.summary.trim()) {
      sections.push(`Professional Summary\n${extra.summary.trim()}`)
    }
    if (Array.isArray(extra.experienceEntries) && extra.experienceEntries.length > 0) {
      const expLines = extra.experienceEntries.map((e: any) => {
        const header = e.title && e.company ? `${e.title} at ${e.company}` : (e.title || e.company)
        return e.period ? `${header} | ${e.period}` : header
      })
      sections.push(`Work Experience\n${expLines.join("\n")}`)
    }
    if (Array.isArray(extra.skills) && extra.skills.length > 0) {
      sections.push(`Skills\n${extra.skills.join(", ")}`)
    }
    if (Array.isArray(extra.education) && extra.education.length > 0) {
      sections.push(`Education\n${extra.education.join("\n")}`)
    }
    if (Array.isArray(extra.languages) && extra.languages.length > 0) {
      sections.push(`Languages\n${extra.languages.map((l: string) => `- ${l}`).join("\n")}`)
    }
    if (Array.isArray(extra.certifications) && extra.certifications.length > 0) {
      sections.push(`Certifications\n${extra.certifications.map((c: string) => `- ${c}`).join("\n")}`)
    }

    let result = out.join("\n")
    if (sections.length > 0) {
      result = result.trimEnd() + "\n\n" + sections.join("\n\n")
    }
    return result
  }

  const handleEnhance = async () => {
    if (!analyzableText.trim()) {
      toast.error("Please paste your CV text")
      return
    }
    const missing = getMissingFields()
    if (missing.length > 0) {
      setMissingFieldValues(Object.fromEntries(missing.map((f) => [f.key, ""])))
      setShowMissingFields(true)
      return
    }
    await runEnhance({})
  }

  const submitMissingFields = async (skip: boolean) => {
    setShowMissingFields(false)
    const filled: Record<string, any> = {}
    if (!skip) {
      for (const def of MISSING_FIELD_DEFS) {
        const raw = missingFieldValues[def.key]
        if (!raw || !raw.trim()) continue
        if (def.kind === "text" || def.kind === "textarea") {
          filled[def.key] = raw.trim()
        } else if (def.kind === "list") {
          filled[def.key] = raw.split(/\r?\n|,|;/).map((s) => s.trim()).filter(Boolean)
        } else if (def.kind === "experience") {
          filled.experienceEntries = parseExperienceLines(raw)
        }
      }
    }
    if (Object.keys(filled).length > 0) {
      setLastAnalysis((prev: any) => mergeFilled(prev, filled))
      setEnhancedData((prev: any) => (prev ? mergeFilled(prev, filled) : prev))
    }
    await runEnhance(filled)
  }

  const runEnhance = async (extra: Record<string, any>) => {
    // Send the full current content (textarea + preview edits + newly filled
    // fields), so nothing the user added is lost during enhancement.
    const contactExtra: Record<string, string> = {}
    for (const k of ["name", "email", "phone", "address", "linkedin"]) {
      if (typeof extra[k] === "string" && extra[k].trim()) contactExtra[k] = extra[k].trim()
    }

    // Raw text (plus newly filled fields) is always the primary source; the
    // structure rebuild goes along as alt_text so the server can union them.
    const sourceText = injectMissingIntoText(cvText, extra)
    let altText: string | undefined
    if (enhancedData) {
      const mergedContact = {
        ...deriveFromText(cvText),
        ...lastAnalysis,
        ...contactExtra,
      }
      altText = buildCvTextFromData(mergeFilled(enhancedData, extra), mergedContact)
    }
    if (!sourceText.trim()) {
      toast.error("Please paste your CV text")
      return
    }
    let baseline = lastAnalysis ? mergeFilled(lastAnalysis, extra) : null
    if (!baseline) {
      baseline = await analyzeWithText(sourceText)
      if (!baseline) return
      baseline = mergeFilled(baseline, extra)
    }
    setEnhancing(true)
    try {
      const res = await fetch(`${API_URL}/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_text: sourceText,
          tone: "professional",
          baseline,
          ...(altText && altText.trim() && altText !== sourceText ? { alt_text: altText } : {}),
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Enhance failed")

      const merged = {
        ...(data.enhanced || {}),
        education: normalizeEducationList(data.enhanced?.education),
      }
      const local = deriveFromText(sourceText)
      const contact = mergeContactFields(merged, mergeContactFields(baseline, local))
      const fullText = data.enhancedText || data.builtText || buildCvTextFromData(merged, contact)

      setEnhancedData({
        ...merged,
        phone: contact.phone,
        email: contact.email,
        address: contact.address,
        linkedin: contact.linkedin,
      })
      setCVText(fullText)
      setEnhancedCV(fullText)

      const newScore = typeof data.atsScore === "number" ? data.atsScore : null
      const baselineScore = typeof data.previousAtsScore === "number"
        ? data.previousAtsScore
        : (typeof atsScore === "number" ? atsScore : null)

      setLastAnalysis({ ...baseline, ...merged, atsScore: newScore, overallScore: newScore })
      setAtsScore(newScore)
      setOverallScore(newScore)
      if (Array.isArray(merged.improvements)) {
        setImprovements(merged.improvements)
      }
      if (Array.isArray(merged.strengths)) {
        setStrengths(merged.strengths)
      }

      if (newScore !== null) {
        if (baselineScore !== null && newScore > baselineScore) {
          toast.success(`CV enhanced — ATS score improved: ${baselineScore} → ${newScore}`)
        } else if (baselineScore !== null && newScore === baselineScore) {
          toast.success(`CV enhanced — ATS score: ${newScore}/100 (structure improved, same rubric score)`)
        } else {
          toast.success(`CV enhanced — ATS score: ${newScore}/100`)
        }
      } else {
        toast.success("CV enhanced successfully")
      }
    } catch (e: any) {
      toast.error(e.message || "Enhance request failed")
    } finally {
      setEnhancing(false)
    }
  }

  const handleDownload = useCallback(() => {
    try {
      const content = enhancedCV || cvText
      if (!content) {
        toast.error("No content to download")
        return
      }
      
      const element = document.createElement("a")
      const now = new Date().toISOString().split('T')[0]
      const filename = `cv-${now}${enhancedCV ? '-enhanced' : ''}.txt`
      
      const file = new Blob([content], { type: "text/plain;charset=utf-8" })
      element.href = URL.createObjectURL(file)
      element.download = filename
      
      document.body.appendChild(element)
      element.click()
      document.body.removeChild(element)
      
      toast.success("CV downloaded successfully")
    } catch (error) {
      console.error("Download failed:", error)
      toast.error("Failed to download CV")
    }
  }, [cvText, enhancedCV])

  const handleDownloadPdf = useCallback(async () => {
    if (!enhancedData && !lastAnalysis) {
      toast.error("Please analyze or enhance your CV first")
      return
    }

    setDownloadingPdf(true)
    try {
      const cvData = {
        name: lastAnalysis?.name || enhancedData?.name || '',
        email: lastAnalysis?.email || enhancedData?.email || '',
        phone: lastAnalysis?.phone || enhancedData?.phone || '',
        address: lastAnalysis?.address || enhancedData?.address || '',
        linkedin: lastAnalysis?.linkedin || enhancedData?.linkedin || '',
        summary: enhancedData?.summary || '',
        experienceEntries: enhancedData?.experienceEntries || [],
        skills: enhancedData?.skills || lastAnalysis?.skills || [],
        education: enhancedData?.education || lastAnalysis?.education || [],
        languages: enhancedData?.languages || lastAnalysis?.languages || [],
        certifications: enhancedData?.certifications || lastAnalysis?.certifications || [],
        projects: enhancedData?.projects || lastAnalysis?.projects || [],
        customSections: customSections.filter(s => s.title && s.items.length > 0) // Add this line

      }

      const response = await fetch(`${API_URL}/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cv_data: cvData,
          template_id: selectedTemplate?.id || 'ats_standard',
          accent_color: accentColor || '#000000'
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const now = new Date()
      const fileName = `cv-ats-optimized-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`
      
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      toast.success("ATS-optimized PDF downloaded successfully")
    } catch (error) {
      console.error('Error generating PDF:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }, [enhancedData, lastAnalysis, selectedTemplate, accentColor, API_URL])

  useHotkeys(keyboardShortcuts.analyze, (e) => {
    e.preventDefault()
    handleAnalyze()
  }, { enableOnFormTags: ['TEXTAREA', 'INPUT'] })

  useHotkeys(keyboardShortcuts.enhance, (e) => {
    e.preventDefault()
    handleEnhance()
  }, { enableOnFormTags: ['TEXTAREA', 'INPUT'] })

  useHotkeys(keyboardShortcuts.save, (e) => {
    e.preventDefault()
    saveDraft()
  }, { enableOnFormTags: ['TEXTAREA', 'INPUT'] })

  useHotkeys(keyboardShortcuts.download, (e) => {
    e.preventDefault()
    if (enhancedCV) {
      handleDownload()
    } else if (cvText) {
      handleDownload()
    }
  }, { enableOnFormTags: ['TEXTAREA', 'INPUT'] })

  useEffect(() => {
    if (hasUnsavedChanges && cvText) {
      const timer = setTimeout(() => {
        saveDraft()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [cvText, hasUnsavedChanges, saveDraft])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/templates`)
        const data = await res.json()
        const list = data.templates || []
        setTemplates(list)
        if (list.length) {
          setSelectedTemplate(list[0])
          setAccentColor(list[0].colors?.[0] || "#000000")
          setFontFamily(list[0].fonts?.[0] || "Helvetica")
        }
      } catch {}
    }
    load()
  }, [API_URL])

  useEffect(() => {
    const userData = localStorage.getItem("cvmaster_user")
    if (!userData) {
      router.push("/login")
      return
    }
    setUser(JSON.parse(userData))
    setLoading(false)
  }, [router])

  useEffect(() => {
    if (!loading && user) {
      try {
        const enhanceIntent = localStorage.getItem('cv_enhance_intent')
        const fromAnalysis = localStorage.getItem('cv_from_analysis')
        const autoEnhance = localStorage.getItem('cv_auto_enhance')

        // Only preload CV when user analyzed then clicked "Enhance CV" on analysis page
        if (enhanceIntent === 'true' && fromAnalysis?.trim()) {
          localStorage.removeItem('cv_enhance_intent')
          localStorage.removeItem('cv_from_analysis')
          localStorage.removeItem('cv_auto_enhance')
          localStorage.removeItem('cv_file_name')
          localStorage.removeItem('cv_file_type')

          setCVText(fromAnalysis)

          if (autoEnhance === 'true') {
            setTimeout(async () => {
              await analyzeWithText(fromAnalysis)
              setTimeout(() => {
                const enhanceBtn = document.querySelector('[data-enhance-btn]') as HTMLButtonElement
                if (enhanceBtn) enhanceBtn.click()
              }, 500)
            }, 100)
          } else {
            setTimeout(() => analyzeWithText(fromAnalysis), 100)
          }

          setHasUnsavedChanges(true)
          return
        }
      } catch (error) {
        console.error('Failed to load CV from analysis flow:', error)
      }

      // Fresh start for direct navigation or navbar visits
      clearEnhanceStorage()
      resetEnhanceState()
    }
  }, [loading, user, clearEnhanceStorage, resetEnhanceState, analyzeWithText])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    setHasUnsavedChanges(true)
  }, [cvText])

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">

      {showMissingFields && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-primary">Complete your CV for ATS</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These sections are missing or empty in your CV. ATS systems score them,
                so filling them will genuinely raise your score — we never invent your data.
                Anything left blank will simply be skipped.
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {MISSING_FIELD_DEFS.filter((f) => f.key in missingFieldValues).map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-medium">{f.label}</label>
                  {f.kind === "text" ? (
                    <input
                      className="w-full rounded border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                      placeholder={f.placeholder}
                      value={missingFieldValues[f.key] ?? ''}
                      onChange={(e) =>
                        setMissingFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                    />
                  ) : (
                    <textarea
                      className="w-full rounded border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                      placeholder={f.placeholder}
                      rows={f.kind === "textarea" || f.kind === "experience" ? 4 : 2}
                      value={missingFieldValues[f.key] ?? ''}
                      onChange={(e) =>
                        setMissingFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                    />
                  )}
                  {f.kind === "list" && (
                    <p className="mt-1 text-xs text-muted-foreground">Separate items with commas or new lines.</p>
                  )}
                  {f.kind === "experience" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      One role per line: Job Title at Company | Period
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="ghost" onClick={() => setShowMissingFields(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={() => submitMissingFields(true)}>
                Skip & Enhance
              </Button>
              <Button className="bg-accent hover:bg-accent/90" onClick={() => submitMissingFields(false)}>
                Save & Enhance
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Enhance Your CV - ATS Optimized</h1>
          <p className="text-muted-foreground mb-8">
            Honest ATS analysis and improvement based on your actual CV content
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-primary">Your CV</h2>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  disabled={uploadingFile}
                  onChange={async (e) => {
                    const input = e.target as HTMLInputElement
                    const file = input.files?.[0]
                    if (!file) return
                    try {
                      setUploadingFile(true)
                      const form = new FormData()
                      form.append("file", file)
                      const res = await fetch(`${API_URL}/upload`, {
                        method: "POST",
                        body: form,
                      })
                      const contentType = res.headers.get("content-type") || ""
                      const data = contentType.includes("application/json")
                        ? await res.json()
                        : { success: false, error: await res.text() }
                      if (!res.ok) {
                        throw new Error(data.error || `Upload failed (${res.status})`)
                      }
                      if (!data.success) throw new Error(data.error || "Upload failed")
                      const text = data.text || ""
                      setCVText(text)
                      if (text) {
                        toast.success(
                          data.ocr_used
                            ? "Scanned PDF read successfully (OCR)"
                            : "CV text extracted successfully"
                        )
                        await analyzeWithText(text)
                      } else {
                        toast.error("No text was extracted from the file. Please paste your CV text manually.")
                      }
                    } catch (err: any) {
                      toast.error(err.message || "Failed to extract text from file")
                    } finally {
                      setUploadingFile(false)
                      input.value = ''
                    }
                  }}
                  className="block text-sm"
                />
                {uploadingFile && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting text…
                  </span>
                )}
                <span className="text-xs text-muted-foreground">PDF/DOCX/TXT</span>
              </div>
              <textarea
                value={cvText}
                onChange={(e) => setCVText(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent h-96"
                placeholder="Paste your CV text here..."
              />
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Button 
                  onClick={handleAnalyze} 
                  disabled={analyzing || !analyzableText.trim()} 
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Analyze
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleEnhance} 
                  disabled={enhancing || !cvText.trim()} 
                  variant="secondary" 
                  className="w-full"
                  data-enhance-btn
                >
                  {enhancing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enhancing...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Enhance
                    </>
                  )}
                </Button>
                <Button 
                  onClick={getSuggestedSkills} 
                  disabled={loadingSuggestions || !cvText.trim()}
                  variant="outline" 
                  className="w-full bg-gradient-to-r from-purple-50 to-blue-50 border-purple-300"
                >
                  {loadingSuggestions ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI Skills
                    </>
                  )}
                </Button>
                <Button 
                  onClick={saveDraft} 
                  disabled={isDraftSaving || !cvText.trim()}
                  variant="outline" 
                  className="w-full"
                >
                  {isDraftSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                Keyboard shortcuts: {keyboardShortcuts.analyze} to analyze, {keyboardShortcuts.enhance} to enhance
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-primary">AI Suggestions</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-5 h-96 overflow-y-auto">
                {!analyzableText.trim() && (
                  <div className="h-full flex items-center justify-center text-center p-4">
                    <div>
                      <p className="text-muted-foreground mb-4">No CV content to analyze yet.</p>
                      <p className="text-sm text-muted-foreground">Paste your CV text or upload a file to get started.</p>
                    </div>
                  </div>
                )}
                {(strengths.length + improvements.length) > 0 ? (
                  <>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-2">✓ What you got right</h3>
                      <ul className="list-disc pl-5 space-y-1">
                        {strengths.map((s, i) => (
                          <li key={i} className="text-sm">{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-2">→ How we'll help you improve</h3>
                      <ul className="list-disc pl-5 space-y-1">
                        {improvements.map((s, i) => (
                          <li key={i} className="text-sm">{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2 text-sm text-blue-900">
                      <div className="flex gap-4">
                        {atsScore !== null && (
                          <span className={`font-semibold ${atsScore >= 80 ? 'text-green-700' : atsScore >= 60 ? 'text-yellow-700' : 'text-red-700'}`}>
                            ATS score: {atsScore}/100
                          </span>
                        )}
                        {overallScore !== null && <span>Overall: <strong>{overallScore}</strong></span>}
                      </div>
                      {lastAnalysis?.whyThisScore && (
                        <p className="text-xs text-blue-800/80">{lastAnalysis.whyThisScore}</p>
                      )}
                      {lastAnalysis?.isValidCV === false && (
                        <p className="text-xs font-medium text-red-700">
                          Not scored as a resume — upload a CV with experience, skills, and education.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-12">
                    Paste your CV and click "Analyze" to get suggestions
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* AI SKILL SUGGESTIONS MODAL */}
          {showSuggestions && skillSuggestions.length > 0 && (
            <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border-2 border-purple-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-purple-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI-Powered Skill Suggestions
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowSuggestions(false)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
              
              <p className="text-sm text-purple-700 mb-4">
                Select skills to add to your CV. These suggestions are based on your experience and industry standards.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 max-h-96 overflow-y-auto">
                {skillSuggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedSkills.includes(suggestion.skill)
                        ? 'border-purple-500 bg-purple-100'
                        : 'border-gray-300 bg-white hover:border-purple-300'
                    }`}
                    onClick={() => {
                      setSelectedSkills(prev => 
                        prev.includes(suggestion.skill)
                          ? prev.filter(s => s !== suggestion.skill)
                          : [...prev, suggestion.skill]
                      )
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{suggestion.skill}</span>
                          {selectedSkills.includes(suggestion.skill) && (
                            <CheckCircle className="h-4 w-4 text-purple-600" />
                          )}
                        </div>
                        <div className="flex gap-2 mb-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            suggestion.category === 'Technical' ? 'bg-blue-100 text-blue-700' :
                            suggestion.category === 'Soft' ? 'bg-green-100 text-green-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {suggestion.category}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            suggestion.relevance === 'High' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {suggestion.relevance} Relevance
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">{suggestion.reason}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={addSelectedSkills}
                  disabled={selectedSkills.length === 0}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add {selectedSkills.length} Selected Skill{selectedSkills.length !== 1 ? 's' : ''}
                </Button>
                <Button
                  onClick={() => {
                    const allSkills = skillSuggestions.map(s => s.skill)
                    setSelectedSkills(allSkills)
                  }}
                  variant="outline"
                >
                  Select All
                </Button>
                <Button
                  onClick={() => setSelectedSkills([])}
                  variant="outline"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {enhancedData && (
            <div className="mt-8 pt-8 border-t border-border">
              <h2 className="text-xl font-semibold text-primary mb-4">ATS-Optimized Preview</h2>
              
              <div className="mb-4 p-4 bg-green-50 border border-green-300 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">Enhanced preview</h3>
                <p className="text-sm text-green-800">
                  Edits are based on your original CV. Re-analyze after changes to see your real ATS score — scores are never inflated.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 mb-4">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { 
                      setSelectedTemplate(t)
                      setAccentColor(t.colors?.[0] || accentColor)
                      setFontFamily(t.fonts?.[0] || fontFamily)
                    }}
                    className={`px-3 py-2 border rounded text-sm ${selectedTemplate?.id === t.id ? 'border-blue-600 bg-blue-50' : 'border-border'}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              <div 
                id="pdf-preview" 
                ref={previewRef} 
                className="border border-border rounded-lg p-6 space-y-5 bg-white" 
                style={{ 
                  fontFamily, 
                  borderColor: accentColor, 
                  width: '794px', 
                  margin: '0 auto', 
                  backgroundColor: '#ffffff' 
                }}
              >
                <div className="mb-2">
                  <input
                    className="font-extrabold text-3xl tracking-wide outline-none w-full uppercase"
                    style={{ color: '#000000' }}
                    value={lastAnalysis?.name || ''}
                    onChange={(e)=> setLastAnalysis({ ...lastAnalysis, name: e.target.value })}
                    placeholder="FULL NAME"
                  />
                </div>

                {!hiddenSections['contact'] && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div 
                        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
                        style={{ borderColor: '#000000', color: '#000000' }}
                      >
                        CONTACT INFORMATION
                      </div>
                      <Button size="sm" variant="ghost" onClick={()=>toggleSection('contact')}>
                        Hide
                      </Button>
                    </div>
                    <div className="bg-gray-50 p-3 border-b border-l border-r" style={{ borderColor: '#000000' }}>
                      <div className="text-sm space-y-1">
                        <div>
                          <span className="font-semibold">Phone: </span>
                          <input 
                            className="outline-none bg-transparent" 
                            placeholder="Phone" 
                            value={enhancedData?.phone || lastAnalysis?.phone || ''} 
                            onChange={(e)=> {
                              const phone = e.target.value
                              setLastAnalysis({ ...lastAnalysis, phone })
                              setEnhancedData({ ...(enhancedData || {}), phone })
                            }} 
                          />
                        </div>
                        <div>
                          <span className="font-semibold">Email: </span>
                          <input 
                            className="outline-none bg-transparent" 
                            placeholder="Email" 
                            value={enhancedData?.email || lastAnalysis?.email || ''} 
                            onChange={(e)=> {
                              const email = e.target.value
                              setLastAnalysis({ ...lastAnalysis, email })
                              setEnhancedData({ ...(enhancedData || {}), email })
                            }} 
                          />
                        </div>
                        <div>
                          <span className="font-semibold">Address: </span>
                          <input 
                            className="outline-none bg-transparent w-3/4" 
                            placeholder="Address" 
                            value={enhancedData?.address || lastAnalysis?.address || ''} 
                            onChange={(e)=> {
                              const address = e.target.value
                              setLastAnalysis({ ...lastAnalysis, address })
                              setEnhancedData({ ...(enhancedData || {}), address })
                            }} 
                          />
                        </div>
                        <div>
                          <span className="font-semibold">LinkedIn: </span>
                          <input 
                            className="outline-none bg-transparent w-3/4" 
                            placeholder="LinkedIn" 
                            value={enhancedData?.linkedin || lastAnalysis?.linkedin || ''} 
                            onChange={(e)=> {
                              const linkedin = e.target.value
                              setLastAnalysis({ ...lastAnalysis, linkedin })
                              setEnhancedData({ ...(enhancedData || {}), linkedin })
                            }} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!hiddenSections['summary'] && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div 
                        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
                        style={{ borderColor: '#000000', color: '#000000' }}
                      >
                        PROFESSIONAL SUMMARY
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={enhanceSummaryWithAI}
                          disabled={enhancingSummary}
                          className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-300"
                        >
                          {enhancingSummary ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Enhancing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-1 h-3 w-3" />
                              AI Enhance
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={()=>toggleSection('summary')}>
                          Hide
                        </Button>
                      </div>
                    </div>
                    <textarea
                      className="w-full bg-gray-50 rounded-b p-3 text-sm outline-none border-b border-l border-r"
                      style={{ borderColor: '#000000' }}
                      value={enhancedData?.summary || ''}
                      onChange={(e)=> setEnhancedData({ ...enhancedData, summary: e.target.value })}
                      placeholder="Professional summary will appear here. Click 'AI Enhance' to generate a compelling 3-5 line summary based on your CV."
                      rows={5}
                    />
                  </div>
                )}

                {!hiddenSections['experience'] && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div 
                        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
                        style={{ borderColor: '#000000', color: '#000000' }}
                      >
                        WORK EXPERIENCE
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={()=>{
                            const next = [...(enhancedData?.experienceEntries||[]), { 
                              company:'', 
                              title:'', 
                              period:'', 
                              location:'', 
                              bullets:[] 
                            }]
                            setEnhancedData({ ...enhancedData, experienceEntries: next })
                          }}
                        >
                          Add Experience
                        </Button>
                        <Button size="sm" variant="ghost" onClick={()=>toggleSection('experience')}>
                          Hide
                        </Button>
                      </div>
                    </div>
                    <div 
                      className="space-y-4 border-b border-l border-r rounded-b p-3" 
                      style={{ borderColor: '#000000' }}
                    >
                      {(enhancedData?.experienceEntries || []).map((exp: any, idx: number) => (
                        <div key={idx} className="border rounded p-3 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input 
                              className="outline-none border rounded px-2 py-1" 
                              placeholder="Company" 
                              value={exp.company ?? ''}
                              onChange={(e)=>{
                                const next = [...enhancedData.experienceEntries]
                                next[idx] = { ...exp, company: e.target.value }
                                setEnhancedData({ ...enhancedData, experienceEntries: next })
                              }} 
                            />
                            <input 
                              className="outline-none border rounded px-2 py-1" 
                              placeholder="Job Title" 
                              value={exp.title ?? ''}
                              onChange={(e)=>{
                                const next = [...enhancedData.experienceEntries]
                                next[idx] = { ...exp, title: e.target.value }
                                setEnhancedData({ ...enhancedData, experienceEntries: next })
                              }} 
                            />
                            <input 
                              className="outline-none border rounded px-2 py-1" 
                              placeholder="Period (e.g., Jan 2024 – Present)" 
                              value={exp.period ?? ''}
                              onChange={(e)=>{
                                const next = [...enhancedData.experienceEntries]
                                next[idx] = { ...exp, period: e.target.value }
                                setEnhancedData({ ...enhancedData, experienceEntries: next })
                              }} 
                            />
                            <input 
                              className="outline-none border rounded px-2 py-1" 
                              placeholder="Location" 
                              value={exp.location ?? ''}
                              onChange={(e)=>{
                                const next = [...enhancedData.experienceEntries]
                                next[idx] = { ...exp, location: e.target.value }
                                setEnhancedData({ ...enhancedData, experienceEntries: next })
                              }} 
                            />
                          </div>
                          <div>
                            <div className="text-xs mb-1" style={{ color: '#000000' }}>Responsibilities & Achievements</div>
                            <ul className="space-y-1">
                              {(exp.bullets||[]).map((b:string, bi:number)=>(
                                <li key={bi} className="flex gap-2">
                                  <span>-</span>
                                  <input 
                                    className="flex-1 outline-none" 
                                    value={b ?? ''} 
                                    onChange={(e)=>{
                                      const next = [...enhancedData.experienceEntries]
                                      const xb = [...(exp.bullets||[])]
                                      xb[bi] = e.target.value
                                      next[idx] = { ...exp, bullets: xb }
                                      setEnhancedData({ ...enhancedData, experienceEntries: next })
                                    }} 
                                  />
                                </li>
                              ))}
                            </ul>
                            <div className="flex gap-2 mt-2">
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                onClick={()=>{
                                  const next = [...enhancedData.experienceEntries]
                                  next[idx] = { ...exp, bullets: [...(exp.bullets||[]), ""] }
                                  setEnhancedData({ ...enhancedData, experienceEntries: next })
                                }}
                              >
                                Add Bullet
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={()=>{
                                  const next = enhancedData.experienceEntries.filter((_:any,i:number)=>i!==idx)
                                  setEnhancedData({ ...enhancedData, experienceEntries: next })
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                
{!hiddenSections['skills'] && (
  <div>
    <div className="flex items-center justify-between">
      <div 
        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
        style={{ borderColor: '#000000', color: '#000000' }}
      >
        SKILLS
      </div>
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={()=>{
            const currentData = enhancedData || {}
            const currentSkills = Array.isArray(currentData.skills) ? currentData.skills : []
            setEnhancedData({ ...currentData, skills: [...currentSkills, ""] })
          }}
        >
          Add Skill
        </Button>
        <Button size="sm" variant="ghost" onClick={()=>toggleSection('skills')}>
          Hide
        </Button>
      </div>
    </div>
    <div 
      className="bg-gray-50 border-b border-l border-r rounded-b p-3" 
      style={{ borderColor: '#000000' }}
    >
      <ul className="space-y-1">
        {(Array.isArray(enhancedData?.skills) ? enhancedData.skills : []).map((skill: string, idx: number) => (
          <li key={idx} className="flex gap-2 items-center">
            <span>-</span>
            <input 
              className="flex-1 outline-none bg-transparent" 
              value={skill || ''} 
              placeholder="Enter skill..."
              onChange={(e)=>{
                const currentData = enhancedData || {}
                const currentSkills = Array.isArray(currentData.skills) ? [...currentData.skills] : []
                currentSkills[idx] = e.target.value
                setEnhancedData({ ...currentData, skills: currentSkills })
              }}
            />
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-red-500 hover:text-red-700 p-1 h-6"
              onClick={()=>{
                const currentData = enhancedData || {}
                const currentSkills = Array.isArray(currentData.skills) ? [...currentData.skills] : []
                currentSkills.splice(idx, 1)
                setEnhancedData({ ...currentData, skills: currentSkills })
              }}
            >
              ×
            </Button>
          </li>
        ))}
        {(!enhancedData?.skills || enhancedData.skills.length === 0) && (
          <li className="text-gray-400 text-sm">No skills added yet. Click "Add Skill" to start.</li>
        )}
      </ul>
    </div>
  </div>
)}

               {!hiddenSections['languages'] && (
  <div>
    <div className="flex items-center justify-between">
      <div 
        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
        style={{ borderColor: '#000000', color: '#000000' }}
      >
        LANGUAGES
      </div>
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={()=>{
            const currentData = enhancedData || {}
            const currentLangs = Array.isArray(currentData.languages) ? currentData.languages : []
            setEnhancedData({ ...currentData, languages: [...currentLangs, ""] })
          }}
        >
          Add Language
        </Button>
        <Button size="sm" variant="ghost" onClick={()=>toggleSection('languages')}>
          Hide
        </Button>
      </div>
    </div>
    <div 
      className="bg-gray-50 border-b border-l border-r rounded-b p-3" 
      style={{ borderColor: '#000000' }}
    >
      <ul className="space-y-1">
        {(Array.isArray(enhancedData?.languages) ? enhancedData.languages : []).map((lang: string, idx: number) => {
          let displayLang = lang || ''
          try {
            if (lang && (lang.includes("{'language':") || lang.includes('{"language":'))) {
              const parsed = JSON.parse(lang.replace(/'/g, '"'))
              displayLang = `${parsed.language}: ${parsed.proficiency}`
            }
          } catch (e) {}
          
          return (
            <li key={idx} className="flex gap-2 items-center">
              <span>-</span>
              <input 
                className="flex-1 outline-none bg-transparent" 
                value={displayLang}
                placeholder="Language: Proficiency (e.g., English: Advanced)"
                onChange={(e)=>{
                  const currentData = enhancedData || {}
                  const currentLangs = Array.isArray(currentData.languages) ? [...currentData.languages] : []
                  currentLangs[idx] = e.target.value
                  setEnhancedData({ ...currentData, languages: currentLangs })
                }}
              />
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-red-500 hover:text-red-700 p-1 h-6"
                onClick={()=>{
                  const currentData = enhancedData || {}
                  const currentLangs = Array.isArray(currentData.languages) ? [...currentData.languages] : []
                  currentLangs.splice(idx, 1)
                  setEnhancedData({ ...currentData, languages: currentLangs })
                }}
              >
                ×
              </Button>
            </li>
          )
        })}
        {(!enhancedData?.languages || enhancedData.languages.length === 0) && (
          <li className="text-gray-400 text-sm">No languages added yet. Click "Add Language" to start.</li>
        )}
      </ul>
    </div>
  </div>
)}

                {/* {!hiddenSections['education'] && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div 
                        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
                        style={{ borderColor: '#000000', color: '#000000' }}
                      >
                        EDUCATION
                      </div>
                      <Button size="sm" variant="ghost" onClick={()=>toggleSection('education')}>
                        Hide
                      </Button>
                    </div>
                    <ul 
                      className="mt-2 space-y-1 border-b border-l border-r rounded-b p-3 bg-white" 
                      style={{ borderColor: '#000000' }}
                    >
                      {toArray(lastAnalysis?.education).map((eItem: string, idx: number) => (
                        <li key={idx} className="flex gap-2">
                          <span>-</span>
                          <input 
                            className="flex-1 outline-none" 
                            value={eItem}
                            onChange={(e)=>{
                              const arr = toArray(lastAnalysis?.education)
                              arr[idx] = e.target.value
                              setLastAnalysis({ ...lastAnalysis, education: arr })
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )} */}
               {!hiddenSections['education'] && (
  <div>
    <div className="flex items-center justify-between">
      <div 
        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
        style={{ borderColor: '#000000', color: '#000000' }}
      >
        EDUCATION
      </div>
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={()=>{
            const currentData = enhancedData || {}
            // Get existing education from either enhancedData or lastAnalysis
            const currentEdu = normalizeEducationList(
              currentData.education?.length ? currentData.education : lastAnalysis?.education
            )
            setEnhancedData({ ...currentData, education: [...currentEdu, ""] })
          }}
        >
          Add Education
        </Button>
        <Button size="sm" variant="ghost" onClick={()=>toggleSection('education')}>
          Hide
        </Button>
      </div>
    </div>
    <ul 
      className="mt-2 space-y-1 border-b border-l border-r rounded-b p-3 bg-white" 
      style={{ borderColor: '#000000' }}
    >
      {(() => {
        const eduList = normalizeEducationList(
          enhancedData?.education?.length ? enhancedData.education : lastAnalysis?.education
        )
        
        return eduList.map((eItem: string, idx: number) => (
          <li key={idx} className="flex gap-2 items-center">
            <span>-</span>
            <input 
              className="flex-1 outline-none" 
              value={eItem || ''}
              placeholder="Degree, Institution, Year"
              onChange={(e)=>{
                const currentData = enhancedData || {}
                let currentEdu = normalizeEducationList(
                  currentData.education?.length ? currentData.education : lastAnalysis?.education
                )
                currentEdu = [...currentEdu]
                currentEdu[idx] = e.target.value
                setEnhancedData({ ...currentData, education: currentEdu })
              }}
            />
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-red-500 hover:text-red-700 p-1 h-6"
              onClick={()=>{
                const currentData = enhancedData || {}
                let currentEdu = normalizeEducationList(
                  currentData.education?.length ? currentData.education : lastAnalysis?.education
                )
                currentEdu = [...currentEdu]
                currentEdu.splice(idx, 1)
                setEnhancedData({ ...currentData, education: currentEdu })
              }}
            >
              ×
            </Button>
          </li>
        ))
      })()}
      {(() => {
        const eduList = normalizeEducationList(
          enhancedData?.education?.length ? enhancedData.education : lastAnalysis?.education
        )
        return eduList.length === 0 && (
          <li className="text-gray-400 text-sm">No education added yet. Click "Add Education" to start.</li>
        )
      })()}
    </ul>
  </div>
)}


{!hiddenSections['certifications'] && (
  <div>
    <div className="flex items-center justify-between">
      <div 
        className="font-semibold text-xs tracking-wider px-3 py-1 border" 
        style={{ borderColor: '#000000', color: '#000000' }}
      >
        CERTIFICATIONS
      </div>
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={()=>{
            const currentData = enhancedData || {}
            const currentCerts = Array.isArray(currentData.certifications) ? currentData.certifications : []
            setEnhancedData({ ...currentData, certifications: [...currentCerts, ""] })
          }}
        >
          Add Certification
        </Button>
        <Button size="sm" variant="ghost" onClick={()=>toggleSection('certifications')}>
          Hide
        </Button>
      </div>
    </div>
    <ul 
      className="mt-2 space-y-1 border-b border-l border-r rounded-b p-3 bg-white" 
      style={{ borderColor: '#000000' }}
    >
      {(Array.isArray(enhancedData?.certifications) ? enhancedData.certifications : []).map((cert: string, idx: number) => (
        <li key={idx} className="flex gap-2 items-center">
          <span>-</span>
          <input 
            className="flex-1 outline-none" 
            value={cert || ''}
            placeholder="Certification Name, Issuing Organization, Year"
            onChange={(e)=>{
              const currentData = enhancedData || {}
              const currentCerts = Array.isArray(currentData.certifications) ? [...currentData.certifications] : []
              currentCerts[idx] = e.target.value
              setEnhancedData({ ...currentData, certifications: currentCerts })
            }}
          />
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-red-500 hover:text-red-700 p-1 h-6"
            onClick={()=>{
              const currentData = enhancedData || {}
              const currentCerts = Array.isArray(currentData.certifications) ? [...currentData.certifications] : []
              currentCerts.splice(idx, 1)
              setEnhancedData({ ...currentData, certifications: currentCerts })
            }}
          >
            ×
          </Button>
        </li>
      ))}
      {(!enhancedData?.certifications || enhancedData.certifications.length === 0) && (
        <li className="text-gray-400 text-sm">No certifications added yet. Click "Add Certification" to start.</li>
      )}
    </ul>
  </div>
)}

{/* Custom Sections */}
{customSections.map((section, sectionIdx) => (
  !hiddenSections[`custom-${sectionIdx}`] && (
    <div key={sectionIdx}>
      <div className="flex items-center justify-between">
        <input
          className="font-semibold text-xs tracking-wider px-3 py-1 border outline-none uppercase"
          style={{ borderColor: '#000000', color: '#000000' }}
          value={section.title}
          placeholder="SECTION TITLE"
          onChange={(e) => {
            const newSections = [...customSections]
            newSections[sectionIdx] = { ...section, title: e.target.value }
            setCustomSections(newSections)
          }}
        />
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => {
              const newSections = [...customSections]
              newSections[sectionIdx] = { 
                ...section, 
                items: [...section.items, ""] 
              }
              setCustomSections(newSections)
            }}
          >
            Add Item
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => toggleSection(`custom-${sectionIdx}`)}
          >
            Hide
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-red-500"
            onClick={() => {
              setCustomSections(customSections.filter((_, i) => i !== sectionIdx))
            }}
          >
            Delete Section
          </Button>
        </div>
      </div>
      <ul 
        className="mt-2 space-y-1 border-b border-l border-r rounded-b p-3 bg-white" 
        style={{ borderColor: '#000000' }}
      >
        {section.items.map((item, itemIdx) => (
          <li key={itemIdx} className="flex gap-2 items-center">
            <span>-</span>
            <input 
              className="flex-1 outline-none" 
              value={item}
              placeholder="Enter item..."
              onChange={(e) => {
                const newSections = [...customSections]
                const newItems = [...section.items]
                newItems[itemIdx] = e.target.value
                newSections[sectionIdx] = { ...section, items: newItems }
                setCustomSections(newSections)
              }}
            />
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-red-500 hover:text-red-700 p-1 h-6"
              onClick={() => {
                const newSections = [...customSections]
                newSections[sectionIdx] = { 
                  ...section, 
                  items: section.items.filter((_, i) => i !== itemIdx) 
                }
                setCustomSections(newSections)
              }}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
))}

{/* Add Custom Section Button */}
<Button 
  variant="outline" 
  className="w-full border-dashed"
  onClick={() => {
    setCustomSections([...customSections, { title: '', items: [''] }])
  }}
>
  <Plus className="mr-2 h-4 w-4" />
  Add Custom Section
</Button>
              </div>

              <div className="flex gap-4 mt-4">
                <Button 
                  onClick={handleDownloadPdf} 
                  className="flex-1 bg-accent hover:bg-accent/90"
                  disabled={downloadingPdf}
                >
                  {downloadingPdf ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download ATS-Optimized PDF
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleDownload} 
                  variant="outline"
                >
                  Download as TXT
                </Button>
                <Button 
                  onClick={() => router.push("/cv-analysis-pro")} 
                  variant="outline"
                >
                  Back to Analysis
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}