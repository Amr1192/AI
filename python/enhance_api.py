from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import base64
import os
import re
import logging
import io
import shutil
from openai import OpenAI

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ReportLab imports for PDF generation
from reportlab.lib.pagesizes import A4, inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib import colors

app = Flask(__name__)
CORS(app)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY environment variable. Set OPENAI_API_KEY in your shell or a local .env file.")
client = OpenAI(api_key=OPENAI_API_KEY)
CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")

class CVEnhancer:
    def _clean_text(self, text):
        """Remove PDF artifacts and ATS-incompatible characters"""
        if not text:
            return ""
        cleaned = re.sub(r'\(cid:\d+\)', '', str(text))
        cleaned = re.sub(r'[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB]', '', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned)
        cleaned = re.sub(r'^[\s\-\*\•\·]+', '', cleaned.strip())
        return cleaned.strip()

    def _extract_contacts(self, cv_text: str):
        name, email, phone, address, linkedin = None, None, None, None, None
        lines = [l.strip() for l in cv_text.splitlines() if l.strip()]

        for l in lines[:8]:
            if '@' in l or re.search(r"\d", l) or 'linkedin' in l.lower() or 'http' in l.lower():
                continue
            l_norm = re.sub(r"(?i)(?:\b([A-Za-z])\s+)+", lambda m: ''.join(m.group(0).split()), l).strip()
            candidate = l_norm if len(l_norm.replace(' ', '')) > len(l.replace(' ', '')) else l
            if re.search(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}", candidate) or re.fullmatch(r"[A-Za-z]{4,}", candidate):
                name = candidate
                break

        email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", cv_text)
        phone_match = re.search(
            r"(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}(?:[-.\s]?\d+)?",
            cv_text,
        )

        linkedin_match = re.search(
            r"(?:https?://)?(?:www\.)?linkedin\.com/(?:in|pub)/[\w\-./%]+",
            cv_text,
            re.I,
        )
        if not linkedin_match:
            linkedin_match = re.search(r"\blinkedin\.com/[\w\-./%]+", cv_text, re.I)
        if linkedin_match:
            linkedin = linkedin_match.group(0).strip().rstrip('.,;')
            if not linkedin.lower().startswith('http'):
                linkedin = 'https://' + linkedin.lstrip('/')

        labeled_address = re.search(
            r"(?:address|location|based in|residence)\s*[:\-–]\s*([^\n|]+)",
            cv_text,
            re.I,
        )
        if labeled_address:
            address = labeled_address.group(1).strip().rstrip('.,;')

        location_words = [
            'cairo', 'giza', 'alexandria', 'egypt', 'riyadh', 'jeddah', 'ksa', 'saudi',
            'dubai', 'abu dhabi', 'uae', 'london', 'paris', 'berlin', 'new york', 'amman',
        ]
        if not address:
            for l in lines[:15]:
                low = l.lower()
                if '@' in l or 'linkedin' in low or re.search(r'https?://', l):
                    continue
                if re.search(r'\b(phone|email|mobile|tel)\b', low):
                    continue
                if any(w in low for w in location_words) and re.search(r'[A-Za-z]{3,}', l):
                    if len(l) < 100 and not re.match(r'^[A-Z\s]{3,}$', l):
                        address = l.strip().rstrip('.,;')
                        break

        if not address:
            city_country = re.search(
                r"\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*[,|\-–]\s*"
                r"(Egypt|UAE|Saudi Arabia|KSA|USA|UK|United Kingdom|Canada|Jordan)\b",
                cv_text,
            )
            if city_country:
                address = city_country.group(0).strip().rstrip('.,;')

        return (
            name,
            (email_match.group(0) if email_match else None),
            (phone_match.group(0).strip() if phone_match else None),
            address,
            linkedin,
        )

    def _format_education_dict(self, entry: dict) -> str:
        degree = (
            entry.get('degree') or entry.get('qualification') or entry.get('title')
            or entry.get('name') or ''
        )
        institution = (
            entry.get('institution') or entry.get('school') or entry.get('university')
            or entry.get('college') or ''
        )
        year = entry.get('year') or entry.get('graduationYear') or entry.get('graduation') or entry.get('date') or ''
        field = entry.get('field') or entry.get('major') or ''
        degree_text = str(degree).strip()
        if field and degree_text and str(field).lower() not in degree_text.lower():
            degree_text = f"{degree_text} in {field}"

        parts = [str(p).strip() for p in (degree_text, institution) if p and str(p).strip()]
        line = ' - '.join(parts)
        if year:
            line = f"{line}, {year}" if line else str(year).strip()
        return line.strip(' ,-')

    def _normalize_education_entry(self, entry) -> str:
        if entry is None:
            return ''
        if isinstance(entry, dict):
            return self._format_education_dict(entry)

        text = str(entry).strip()
        if not text:
            return ''

        if text.startswith('{') and (
            'degree' in text.lower() or 'institution' in text.lower() or 'university' in text.lower()
        ):
            import ast
            import json
            for loader in (
                ast.literal_eval,
                lambda t: json.loads(t),
                lambda t: json.loads(t.replace("'", '"')),
            ):
                try:
                    parsed = loader(text)
                    if isinstance(parsed, dict):
                        return self._format_education_dict(parsed)
                except Exception:
                    continue
        return text

    def _normalize_education_list(self, education) -> list:
        if not education:
            return []
        if isinstance(education, str):
            items = [education]
        elif isinstance(education, dict):
            items = [education]
        elif isinstance(education, list):
            items = education
        else:
            items = [education]

        results: list[str] = []
        seen: set[str] = set()
        for item in items:
            line = self._normalize_education_entry(item)
            if not line:
                continue
            key = re.sub(r'[^a-z0-9]', '', line.lower())
            if key in seen:
                continue
            seen.add(key)
            results.append(line)
        return results

    def _fill_contact_field(self, data: dict, key: str, value: str | None) -> None:
        if not value or not str(value).strip():
            return
        current = data.get(key)
        if current is None or (isinstance(current, str) and not current.strip()):
            data[key] = str(value).strip()

    def _normalize_resume_data(self, data: dict, cv_text: str) -> dict:
        name, email, phone, address, linkedin = self._extract_contacts(cv_text)
        self._fill_contact_field(data, 'name', name)
        self._fill_contact_field(data, 'email', email)
        self._fill_contact_field(data, 'phone', phone)
        self._fill_contact_field(data, 'address', address)
        self._fill_contact_field(data, 'linkedin', linkedin)

        data['education'] = self._normalize_education_list(data.get('education'))
        if isinstance(data.get('skills'), list):
            data['skills'] = [str(s).strip() for s in data['skills'] if str(s).strip()]
        return data

    def suggest_skills(self, cv_text: str, job_description: str = None):
        """AI-powered skill suggestions based on CV content and job description"""
        prompt = f"""
Analyze this CV and suggest relevant skills that would improve ATS compatibility and job matching.

Rules:
1. Return ONLY valid JSON with key "suggestedSkills" containing an array of skill objects
2. Each skill object must have: "skill" (name), "category" (Technical/Soft/Domain), "relevance" (High/Medium), "reason" (why suggest it)
3. Suggest 10-15 skills maximum
4. Focus on industry-standard keywords that ATS systems look for
5. Include both hard skills and soft skills
6. Base suggestions on the candidate's experience and role

CV TEXT:
{cv_text[:3000]}

JOB DESCRIPTION (if provided):
{job_description or 'No specific job description provided'}
"""
        
        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "You are an ATS optimization expert. Suggest relevant skills that improve resume matching. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7
            )
            
            raw = response.choices[0].message.content.strip()
            import json
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{[\s\S]*\}", raw)
                data = json.loads(m.group(0)) if m else {"suggestedSkills": []}
            
            return {"success": True, "suggestions": data.get("suggestedSkills", [])}
        except Exception as e:
            logging.error(f"Skill suggestion failed: {e}")
            return {"success": False, "error": str(e)}

    def _non_cv_result(self, document_type: str, reason: str) -> dict:
        label = document_type.lower().replace('_', ' ')
        return {
            "success": True,
            "result": {
                "name": "", "email": "", "phone": "", "summary": "",
                "skills": [], "experience": [], "education": [],
                "strengths": [], "improvements": [
                    "Upload a resume/CV with work experience, skills, and education sections.",
                    "Use PDF with selectable text or paste your CV content directly.",
                ],
                "weaknesses": [reason or f"This appears to be a {label}, not a CV."],
                "atsScore": 0,
                "overallScore": 0,
                "scoreBreakdown": {},
                "isValidCV": False,
                "documentType": document_type,
                "whyThisScore": reason or f"ATS scoring requires a resume. This document is classified as {label}.",
            },
        }

    def _validate_cv_document(self, cv_text: str) -> tuple[bool, str, str]:
        """Heuristic gate: reject obvious non-resumes before scoring."""
        text = cv_text.strip()
        if len(text) < 120:
            return False, "OTHER", "Document is too short to be a resume."

        lower = text.lower()

        non_cv_hints = [
            r'\binvoice\b', r'\breceipt\b', r'\bpurchase order\b',
            r'\bterms and conditions\b', r'\bprivacy policy\b',
            r'\bchapter\s+\d+\b', r'\btable of contents\b',
            r'\bwire transfer\b', r'\baccount statement\b',
        ]
        for pattern in non_cv_hints:
            if re.search(pattern, lower):
                return False, "OTHER", "This document does not appear to be a resume."

        has_email = bool(re.search(r'[\w.+-]+@[\w.-]+\.\w+', text))
        has_phone = bool(re.search(
            r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text
        ))
        has_experience = bool(re.search(
            r'(?:work experience|professional experience|employment history|experience)',
            lower,
        )) or bool(re.search(
            r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*[-–—]',
            lower,
        ))
        has_education = bool(re.search(
            r'(?:education|bachelor|master|phd|b\.sc|m\.sc|university|college|degree)',
            lower,
        ))
        has_skills = bool(re.search(r'\bskills?\b', lower))

        resume_signals = sum([has_email or has_phone, has_experience, has_education, has_skills])
        if resume_signals < 2:
            return False, "OTHER", (
                "Not enough resume content detected (need contact info plus experience, "
                "education, or skills sections)."
            )

        return True, "CV", ""

    def _build_cv_text_from_data(self, data: dict, contact: dict | None = None) -> str:
        """Canonical plain-text CV used for consistent ATS scoring before/after enhance."""
        contact = contact or {}
        lines: list[str] = []

        name = contact.get('name') or data.get('name')
        if name:
            lines.append(str(name).strip())

        contact_bits = [
            contact.get('phone') or data.get('phone'),
            contact.get('email') or data.get('email'),
            contact.get('address') or data.get('address'),
            contact.get('linkedin') or data.get('linkedin'),
        ]
        contact_line = ' | '.join(str(b).strip() for b in contact_bits if b and str(b).strip())
        if contact_line:
            lines.append(contact_line)
        if lines:
            lines.append('')

        summary = (data.get('summary') or '').strip()
        if summary:
            lines.extend(['Professional Summary', summary, ''])

        entries = data.get('experienceEntries') or []
        if entries:
            lines.append('Work Experience')
            for exp in entries:
                if not isinstance(exp, dict):
                    continue
                title = str(exp.get('title') or '').strip()
                company = str(exp.get('company') or '').strip()
                header = f'{title} at {company}' if title and company else (title or company)
                meta = ' | '.join(
                    str(x).strip() for x in (exp.get('period'), exp.get('location')) if x and str(x).strip()
                )
                if header:
                    lines.append(f'{header} | {meta}' if meta else header)
                for bullet in exp.get('bullets') or []:
                    text = str(bullet).strip().lstrip('-').strip()
                    if text:
                        lines.append(f'- {text}')
                lines.append('')

        skills = [str(s).strip() for s in (data.get('skills') or []) if str(s).strip()]
        if skills:
            lines.extend(['Skills', ', '.join(skills), ''])

        education = self._normalize_education_list(data.get('education') or [])
        if education:
            lines.append('Education')
            lines.extend(education)
            lines.append('')

        languages = data.get('languages') or []
        if isinstance(languages, str):
            languages = [languages]
        languages = [str(l).strip() for l in languages if str(l).strip()]
        if languages:
            lines.append('Languages')
            lines.extend(f'- {l}' for l in languages)
            lines.append('')

        certifications = data.get('certifications') or []
        if isinstance(certifications, str):
            certifications = [certifications]
        certifications = [str(c).strip() for c in certifications if str(c).strip()]
        if certifications:
            lines.append('Certifications')
            lines.extend(f'- {c}' for c in certifications)
            lines.append('')

        return '\n'.join(lines).strip()

    def _exp_key(self, entry: dict) -> str:
        company = str(entry.get('company') or '').strip().lower()
        title = str(entry.get('title') or '').strip().lower()
        period = str(entry.get('period') or '').strip().lower()
        if company or title:
            return f'{company}|{title}|{period}'
        return ''

    def _merge_single_experience(self, original: dict, enhanced: dict) -> dict:
        orig_bullets = [str(b).strip() for b in (original.get('bullets') or []) if str(b).strip()]
        enh_bullets = [str(b).strip() for b in (enhanced.get('bullets') or []) if str(b).strip()]

        bullets: list[str] = []
        for idx in range(max(len(orig_bullets), len(enh_bullets))):
            enh = enh_bullets[idx] if idx < len(enh_bullets) else ''
            orig = orig_bullets[idx] if idx < len(orig_bullets) else ''
            chosen = enh if len(enh) >= len(orig) else orig
            if not chosen and orig:
                chosen = orig
            if chosen:
                bullets.append(chosen)

        for bullet in orig_bullets[len(enh_bullets):]:
            if bullet not in bullets:
                bullets.append(bullet)

        return {
            'company': enhanced.get('company') or original.get('company') or '',
            'title': enhanced.get('title') or original.get('title') or '',
            'period': enhanced.get('period') or original.get('period') or '',
            'location': enhanced.get('location') or original.get('location') or '',
            'bullets': bullets,
        }

    def _merge_experience_entries(self, original: list, enhanced: list) -> list:
        original = [e for e in original if isinstance(e, dict)]
        enhanced = [e for e in enhanced if isinstance(e, dict)]
        if not original:
            return enhanced
        if not enhanced:
            return original

        enh_by_key = {}
        for entry in enhanced:
            key = self._exp_key(entry)
            if key:
                enh_by_key[key] = entry

        merged: list[dict] = []
        used_keys: set[str] = set()
        for orig in original:
            key = self._exp_key(orig)
            if key and key in enh_by_key:
                used_keys.add(key)
                merged.append(self._merge_single_experience(orig, enh_by_key[key]))
            else:
                merged.append(orig)

        for entry in enhanced:
            key = self._exp_key(entry)
            if key and key in used_keys:
                continue
            merged.append(entry)

        return merged

    def _union_strings(self, *lists) -> list:
        seen: set[str] = set()
        out: list[str] = []
        for items in lists:
            for item in items or []:
                text = str(item).strip()
                if not text:
                    continue
                key = text.lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(text)
        return out

    def _merge_baseline_and_enhanced(self, baseline: dict, enhanced: dict) -> dict:
        """Never drop original resume content when applying AI edits."""
        base_summary = (baseline.get('summary') or '').strip()
        enh_summary = (enhanced.get('summary') or '').strip()
        summary = enh_summary if len(enh_summary) >= len(base_summary) else base_summary
        if not summary:
            summary = enh_summary or base_summary

        merged = {
            'name': baseline.get('name') or enhanced.get('name'),
            'email': baseline.get('email') or enhanced.get('email'),
            'phone': baseline.get('phone') or enhanced.get('phone'),
            'address': baseline.get('address') or enhanced.get('address'),
            'linkedin': baseline.get('linkedin') or enhanced.get('linkedin'),
            'summary': summary,
            'skills': self._union_strings(baseline.get('skills'), enhanced.get('skills')),
            'experienceEntries': self._merge_experience_entries(
                baseline.get('experienceEntries') or [],
                enhanced.get('experienceEntries') or [],
            ),
            'education': self._normalize_education_list(
                self._union_strings(baseline.get('education'), enhanced.get('education'))
            ),
            'languages': self._union_strings(baseline.get('languages'), enhanced.get('languages')),
            'certifications': self._union_strings(
                baseline.get('certifications'), enhanced.get('certifications')
            ),
            'atsOptimizations': enhanced.get('atsOptimizations') or [],
        }
        return merged

    def _polish_for_ats_rubric(self, merged: dict, baseline: dict, cv_text: str,
                               job_description: str | None, tone: str) -> dict:
        """Apply safe, content-grounded improvements that raise the ATS rubric score."""
        summary = (merged.get('summary') or '').strip()
        if len(summary) < 100 and len(cv_text.strip()) >= 200:
            summary_result = self.enhance_summary(cv_text, job_description, tone)
            if summary_result.get('success'):
                candidate = (summary_result.get('summary') or '').strip()
                if len(candidate) > len(summary):
                    merged['summary'] = candidate

        action_verbs = [
            'led', 'managed', 'developed', 'achieved', 'implemented', 'designed',
            'built', 'created', 'improved', 'delivered', 'coordinated', 'optimized',
        ]
        entries = merged.get('experienceEntries') or []
        for entry in entries:
            bullets = entry.get('bullets') or []
            polished = []
            for bullet in bullets:
                text = str(bullet).strip().lstrip('-').strip()
                if not text:
                    continue
                lower = text.lower()
                if not any(re.search(rf'\b{v}\b', lower) for v in action_verbs):
                    first = text.split()[0].lower().rstrip('.,')
                    if first.endswith('ed') or first.endswith('ing'):
                        polished.append(text)
                    elif text[0].islower():
                        polished.append(text[0].upper() + text[1:])
                    else:
                        polished.append(text)
                else:
                    polished.append(text)
            entry['bullets'] = polished

        if len(merged.get('skills') or []) < len(baseline.get('skills') or []):
            merged['skills'] = self._union_strings(baseline.get('skills'), merged.get('skills'))

        if not merged.get('experienceEntries') and baseline.get('experienceEntries'):
            merged['experienceEntries'] = baseline.get('experienceEntries')

        return merged

    SECTION_ALIASES = {
        'summary': ['professional summary', 'summary', 'profile', 'objective',
                    'about me', 'about', 'career objective', 'personal statement'],
        'experience': ['work experience', 'professional experience', 'experience',
                       'employment history', 'employment', 'work history', 'career history'],
        'skills': ['skills', 'technical skills', 'core competencies', 'key skills',
                   'skills & tools', 'areas of expertise', 'competencies'],
        'education': ['education', 'academic background', 'academic qualifications',
                      'qualifications', 'education and training'],
        'certifications': ['certifications', 'certificates', 'licenses', 'courses',
                           'training', 'professional development'],
        'languages': ['languages', 'language skills'],
        'projects': ['projects', 'personal projects', 'key projects'],
    }

    ACTION_VERBS = {
        'led', 'managed', 'developed', 'achieved', 'implemented', 'designed', 'built',
        'created', 'improved', 'delivered', 'coordinated', 'optimized', 'launched',
        'increased', 'reduced', 'streamlined', 'automated', 'architected', 'engineered',
        'mentored', 'taught', 'trained', 'maintained', 'integrated', 'migrated',
        'deployed', 'tested', 'analyzed', 'collaborated', 'spearheaded', 'established',
        'founded', 'negotiated', 'resolved', 'supported', 'administered', 'directed',
        'supervised', 'executed', 'initiated', 'produced', 'researched', 'organized',
    }

    def _split_sections(self, cv_text: str) -> dict[str, list[str]]:
        """Split CV text into sections by detecting standard headings."""
        sections: dict[str, list[str]] = {'header': []}
        current = 'header'
        for line in cv_text.splitlines():
            stripped = line.strip().strip(':').strip().lower()
            matched = None
            if stripped and len(stripped) <= 40:
                for key, aliases in self.SECTION_ALIASES.items():
                    if stripped in aliases:
                        matched = key
                        break
            if matched:
                current = matched
                sections.setdefault(current, [])
            else:
                sections.setdefault(current, []).append(line)
        return sections

    def _bullet_lines(self, lines: list[str]) -> list[str]:
        out = []
        for l in lines:
            s = l.strip()
            if s.startswith(('-', '*', '\u2022', '\u00b7')):
                out.append(s.lstrip('-*\u2022\u00b7 ').strip())
        return out

    def _compute_ats_score(self, cv_text: str) -> dict:
        """
        Deterministic ATS score computed ONLY from the CV text (max 100).
        Same text always produces the same score. No LLM involvement, no inflation.
        """
        text = cv_text or ''
        breakdown: dict[str, int] = {}
        sections = self._split_sections(text)

        # Contact (15): email 8, phone 7
        has_email = bool(re.search(r'[\w.+-]+@[\w.-]+\.\w+', text))
        has_phone = bool(re.search(r'(\+?\d[\d\s().-]{7,}\d)', text))
        breakdown['contact'] = (8 if has_email else 0) + (7 if has_phone else 0)

        # Summary (15): labeled section with real content
        summary_text = ' '.join(l.strip() for l in sections.get('summary', []) if l.strip())
        wc = len(summary_text.split())
        if wc >= 40:
            breakdown['summary'] = 15
        elif wc >= 25:
            breakdown['summary'] = 10
        elif wc >= 10:
            breakdown['summary'] = 5
        else:
            breakdown['summary'] = 0

        # Experience (25): labeled section 5, entries up to 6, bullets up to 4, metrics up to 10
        exp_lines = sections.get('experience', []) + sections.get('projects', [])
        exp_text = '\n'.join(exp_lines)
        exp_pts = 0
        if exp_text.strip():
            exp_pts += 5
            date_ranges = re.findall(
                r'(?:19|20)\d{2}\s*[-\u2013\u2014]\s*'
                r'(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?'
                r'(?:(?:19|20)\d{2}|present|current|now)',
                exp_text, re.I,
            )
            entries = max(len(date_ranges), 1)
            exp_pts += min(6, entries * 3)
            bullets = self._bullet_lines(exp_lines)
            if len(bullets) >= 3:
                exp_pts += 4
            elif len(bullets) >= 1:
                exp_pts += 2
            metric_bullets = sum(
                1 for b in bullets
                if re.search(r'\d+\s*%|\d+\+|\$\s*\d|\b\d{2,}\b', b)
            )
            exp_pts += min(10, metric_bullets * 2)
        breakdown['experience'] = min(25, exp_pts)

        # Skills (15): labeled section 5, item count up to 10
        skills_lines = [l for l in sections.get('skills', []) if l.strip()]
        skill_items: list[str] = []
        for l in skills_lines:
            cleaned = l.strip().lstrip('-*\u2022\u00b7 ').strip()
            skill_items.extend(s.strip() for s in re.split(r'[,;|]', cleaned) if s.strip())
        n_skills = len(skill_items)
        skills_pts = 5 if skills_lines else 0
        if n_skills >= 8:
            skills_pts += 10
        elif n_skills >= 5:
            skills_pts += 7
        elif n_skills >= 3:
            skills_pts += 4
        elif n_skills >= 1:
            skills_pts += 2
        breakdown['skills'] = min(15, skills_pts)

        # Education (10): labeled section 5, degree keyword 5
        edu_lines = [l for l in sections.get('education', []) if l.strip()]
        edu_pts = 5 if edu_lines else 0
        if re.search(r'bachelor|master|phd|b\.?\s?sc|m\.?\s?sc|mba|diploma|degree|university|college', text, re.I):
            edu_pts += 5
        breakdown['education'] = min(10, edu_pts)

        # Formatting (10): plain parseable text
        fmt_pts = 10
        if re.search(r'\(cid:\d+\)', text):
            fmt_pts -= 4
        if len(re.findall(r'[^\x00-\x7F]', text)) > 30:
            fmt_pts -= 3
        if not self._bullet_lines(text.splitlines()):
            fmt_pts -= 2
        breakdown['formatting'] = max(0, fmt_pts)

        # Action verbs (5): bullets that START with a strong verb
        all_bullets = self._bullet_lines(text.splitlines())
        verb_starts = 0
        for b in all_bullets:
            first = b.split()[0].lower().rstrip('.,:;') if b.split() else ''
            if first in self.ACTION_VERBS:
                verb_starts += 1
        breakdown['action_verbs'] = min(5, verb_starts)

        # Keywords (5): skill terms echoed inside experience content
        echoed = 0
        exp_lower = exp_text.lower()
        for s in skill_items[:40]:
            s_low = s.lower()
            if len(s_low) >= 3 and s_low in exp_lower:
                echoed += 1
        if echoed >= 2:
            breakdown['keywords'] = 5
        elif echoed == 1:
            breakdown['keywords'] = 2
        else:
            breakdown['keywords'] = 0

        total = min(100, sum(breakdown.values()))
        return {'score': total, 'breakdown': breakdown}

    def _score_structured_cv(self, data: dict, cv_text: str | None = None) -> dict:
        contact = {
            'name': data.get('name'),
            'email': data.get('email'),
            'phone': data.get('phone'),
            'address': data.get('address'),
            'linkedin': data.get('linkedin'),
        }
        built = self._build_cv_text_from_data(data, contact)
        text_for_score = built if len(built) >= 120 else (cv_text or built)
        return {
            'builtText': built,
            'ats': self._compute_ats_score(text_for_score),
        }

    SECTION_DISPLAY_NAMES = {
        'summary': 'Professional Summary',
        'experience': 'Work Experience',
        'skills': 'Skills',
        'education': 'Education',
        'certifications': 'Certifications',
        'languages': 'Languages',
        'projects': 'Projects',
    }

    def _union_texts(self, primary: str, secondary: str) -> str:
        """
        Merge two versions of the same CV: keep primary intact, then add any
        contact details or whole sections that exist only in secondary.
        Strictly additive — the result can never score lower than primary.
        """
        result = primary.rstrip()

        contact_additions: list[str] = []
        if not re.search(r'[\w.+-]+@[\w.-]+\.\w+', primary):
            m = re.search(r'[\w.+-]+@[\w.-]+\.\w+', secondary)
            if m:
                contact_additions.append(f'Email: {m.group(0)}')
        if not re.search(r'(\+?\d[\d\s().-]{7,}\d)', primary):
            m = re.search(r'(\+?\d[\d\s().-]{7,}\d)', secondary)
            if m:
                contact_additions.append(f'Phone: {m.group(1)}')
        if not re.search(r'linkedin\.com/', primary, re.I):
            m = re.search(r'(?:https?://)?(?:www\.)?linkedin\.com/[\w\-./%]+', secondary, re.I)
            if m:
                contact_additions.append(f'LinkedIn: {m.group(0)}')

        if contact_additions:
            lines = result.split('\n')
            first_idx = next((i for i, l in enumerate(lines) if l.strip()), 0)
            lines = lines[:first_idx + 1] + contact_additions + lines[first_idx + 1:]
            result = '\n'.join(lines)

        p_sections = self._split_sections(primary)
        s_sections = self._split_sections(secondary)
        additions: list[str] = []
        for key, content_lines in s_sections.items():
            if key == 'header':
                continue
            content = [l for l in content_lines if l.strip()]
            if not content:
                continue
            if not [l for l in p_sections.get(key, []) if l.strip()]:
                heading = self.SECTION_DISPLAY_NAMES.get(key, key.title())
                additions.append(heading + '\n' + '\n'.join(content))

        if additions:
            result = result.rstrip() + '\n\n' + '\n\n'.join(additions)
        return result

    def _choose_source_text(self, cv_text: str, alt_text: str | None) -> str:
        """Pick the better-scoring text and merge in content only the other has."""
        if not alt_text or not alt_text.strip():
            return cv_text
        a = self._compute_ats_score(cv_text)['score']
        b = self._compute_ats_score(alt_text)['score']
        primary, secondary = (cv_text, alt_text) if a >= b else (alt_text, cv_text)
        return self._union_texts(primary, secondary)

    def _augment_original_text(self, cv_text: str, merged: dict) -> str:
        """Additive-only fallback: append missing sections to the original text."""
        text = cv_text.rstrip()
        sections = self._split_sections(cv_text)
        additions: list[str] = []

        summary_wc = len(' '.join(sections.get('summary', [])).split())
        new_summary = (merged.get('summary') or '').strip()
        if summary_wc < 25 and len(new_summary.split()) >= 25:
            additions.append('Professional Summary\n' + new_summary)

        if not any(l.strip() for l in sections.get('skills', [])) and merged.get('skills'):
            additions.append('Skills\n' + ', '.join(str(s) for s in merged['skills']))

        if not any(l.strip() for l in sections.get('education', [])) and merged.get('education'):
            additions.append('Education\n' + '\n'.join(str(e) for e in merged['education']))

        if not any(l.strip() for l in sections.get('certifications', [])) and merged.get('certifications'):
            additions.append('Certifications\n' + '\n'.join(f'- {c}' for c in merged['certifications']))

        if additions:
            text = text + '\n\n' + '\n\n'.join(additions)
        return text

    def analyze(self, cv_text: str, job_description: str | None = None,
                structured_data: dict | None = None, alt_text: str | None = None):
        cv_text = self._choose_source_text(cv_text, alt_text)
        is_cv, heuristic_type, heuristic_reason = self._validate_cv_document(cv_text)
        if not is_cv:
            return self._non_cv_result(heuristic_type, heuristic_reason)

        document_type_prompt = f"""
Analyze this text and respond with ONLY one word: CV, CERTIFICATE, COVER_LETTER, or OTHER.
CV: Resume with work history and/or skills and education
CERTIFICATE: Certificate of completion/training/achievement only
COVER_LETTER: Letter addressed to a hiring manager/company
OTHER: Anything else (articles, invoices, forms, random documents)

TEXT:
{cv_text[:2500]}
"""
        try:
            doc_response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "Respond with only: CV, CERTIFICATE, COVER_LETTER, or OTHER"},
                    {"role": "user", "content": document_type_prompt},
                ],
                temperature=0.1,
            )
            document_type = doc_response.choices[0].message.content.strip().upper()
            document_type = document_type.split()[0] if document_type else "OTHER"

            if document_type != "CV":
                return self._non_cv_result(
                    document_type,
                    f"This document was classified as {document_type.replace('_', ' ').lower()}, not a resume.",
                )
        except Exception as e:
            logging.error(f"Document type detection failed: {e}")

        prompt = f"""
        Analyze this CV and output ONLY valid JSON with keys:
        name,email,phone,address,linkedin,skills,experience,experienceEntries,education,
        strengths,improvements,summary,whyThisScore,atsIssues,missingKeywords.
        
        Do NOT invent scores — the server calculates ATS score separately.
        Be honest and strict:
        - Extract address and linkedin URL/profile if present in the header/contact area
        - strengths: 2-5 real positives found in the text
        - improvements: 3-6 specific, actionable gaps
        - atsIssues: concrete ATS parsing risks (missing sections, tables, graphics, etc.)
        - missingKeywords: skills/terms missing for the target role
        - experienceEntries: array of {{company, title, period, location, bullets[]}} when possible
        - education: array of plain strings like "Bachelor of Law - Cairo University, 2018"
          (NOT nested objects)
        
        CV:\n{cv_text}\n
        JOB DESCRIPTION:\n{job_description or ''}
        """
        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract structured resume data. Output JSON only. "
                            "Never fabricate experience or inflate quality."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
            )
            raw = response.choices[0].message.content.strip()
            import json
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{[\s\S]*\}", raw)
                data = json.loads(m.group(0)) if m else {"summary": raw}

            data = self._normalize_resume_data(data, cv_text)

            if structured_data and isinstance(structured_data, dict):
                for key in (
                    'name', 'email', 'phone', 'address', 'linkedin', 'summary', 'skills',
                    'experienceEntries', 'education', 'languages', 'certifications',
                ):
                    if structured_data.get(key) not in (None, '', []):
                        data[key] = structured_data[key]
                data = self._normalize_resume_data(data, cv_text)

            # Official score comes ONLY from the posted text — deterministic and repeatable.
            ats_result = self._compute_ats_score(cv_text)
            data["atsScore"] = ats_result["score"]
            data["overallScore"] = ats_result["score"]
            data["scoreBreakdown"] = ats_result["breakdown"]
            data["isValidCV"] = True
            data["documentType"] = "CV"
            data["sourceText"] = cv_text
            if not data.get("whyThisScore"):
                data["whyThisScore"] = (
                    f"ATS score {ats_result['score']}/100 from rubric: "
                    + ", ".join(f"{k} {v}" for k, v in ats_result["breakdown"].items())
                )

            return {"success": True, "result": data}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def enhance_summary(self, cv_text: str, job_description: str | None = None, tone: str = "professional"):
        """Generate an enhanced 3-5 line professional summary based on CV content"""
        prompt = f"""
        Analyze this CV and create a compelling professional summary that is 3-5 lines long.
        
        REQUIREMENTS:
        1. Extract key information from the CV:
           - Years of experience (calculate from work history)
           - Primary role/title
           - Key skills and expertise areas
           - Notable achievements or certifications
           - Industry focus
        
        2. Create a summary that:
           - Starts with job title and years of experience
           - Highlights 2-3 core competencies
           - Mentions 1-2 key achievements with metrics if available
           - Includes relevant keywords for ATS
           - Uses active, powerful language
           - Is {tone} in tone
        
        3. Length: MUST be 3-5 complete sentences (around 80-120 words)
        
        4. Format: Plain text, no special characters, no bullet points
        
        5. Output ONLY valid JSON with key "summary" containing the text
        
        CV TEXT:
        {cv_text}
        
        JOB DESCRIPTION (if provided):
        {job_description or 'No specific job description provided'}
        """
        
        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "You are an expert CV writer. Create compelling professional summaries that are ATS-optimized and highlight candidate strengths. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8
            )
            
            raw = response.choices[0].message.content.strip()
            import json
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{[\s\S]*\}", raw)
                data = json.loads(m.group(0)) if m else {"summary": raw}
            
            summary = data.get("summary", "")
            sentences = [s.strip() for s in summary.split('.') if s.strip()]
            
            if len(sentences) < 3:
                return self.enhance_summary(cv_text, job_description, tone)
            
            return {"success": True, "summary": summary}
        except Exception as e:
            logging.error(f"Summary enhancement failed: {e}")
            return {"success": False, "error": str(e)}

    def enhance(self, cv_text: str, job_description: str | None = None, tone: str = "professional",
                baseline: dict | None = None, alt_text: str | None = None):
        """Improve CV clarity and ATS structure using only content grounded in the source CV."""
        cv_text = self._choose_source_text(cv_text, alt_text)
        is_cv, doc_type, reason = self._validate_cv_document(cv_text)
        if not is_cv:
            return {
                "success": False,
                "error": reason or "Please upload a resume before enhancing.",
                "documentType": doc_type,
            }

        if baseline and baseline.get('isValidCV') is False:
            return {
                "success": False,
                "error": baseline.get('whyThisScore') or "Please upload a valid resume before enhancing.",
            }

        if not baseline or not baseline.get('experienceEntries'):
            analysis = self.analyze(cv_text, job_description)
            if not analysis.get('success'):
                return analysis
            baseline = analysis.get('result') or {}
            if not baseline.get('isValidCV', True):
                return {
                    "success": False,
                    "error": baseline.get('whyThisScore') or "Please upload a valid resume before enhancing.",
                }

        baseline_score = int(self._compute_ats_score(cv_text)['score'])
        baseline_entries = baseline.get('experienceEntries') or []
        entry_count = len(baseline_entries)

        import json
        prompt = f"""
You are an ATS-savvy resume editor. Improve this CV for applicant tracking systems.

RULES (strict):
- Use ONLY facts present in the original CV. Do NOT invent employers, degrees, dates, or metrics.
- Include EVERY job from the original CV ({entry_count} roles). Do not omit any role or bullet.
- Rephrase bullets with strong action verbs. Keep all facts; you may clarify wording.
- Add a skill ONLY if it is clearly implied by the candidate's experience or education.
- Write a 3-5 sentence professional summary (80-120 words) from real CV facts if missing or weak.
- Use plain ASCII text, standard headings, and hyphen bullets.
- Tone: {tone}

OUTPUT — valid JSON only:
{{
    "summary": "3-5 sentence professional summary from real CV facts",
    "experienceEntries": [
        {{
            "company": "from CV",
            "title": "from CV",
            "period": "from CV",
            "location": "from CV or empty",
            "bullets": ["improved bullets grounded in original content — one per original bullet minimum"]
        }}
    ],
    "skills": ["skills supported by the CV"],
    "education": ["Degree - Institution, Year as plain strings"],
    "languages": [],
    "certifications": [],
    "atsOptimizations": ["specific improvements you made"]
}}

BASELINE STRUCTURE (preserve all entries):
{json.dumps({
    'experienceEntries': baseline_entries,
    'skills': baseline.get('skills') or [],
    'education': baseline.get('education') or [],
}, ensure_ascii=False)[:6000]}

ORIGINAL CV:
{cv_text}

JOB DESCRIPTION (optional keyword context):
{job_description or 'None'}
"""
        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Improve resumes honestly for ATS. Never fabricate experience or metrics. "
                            "Never drop jobs or bullets from the baseline structure. Output JSON only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.4,
            )
            raw = response.choices[0].message.content.strip()
            try:
                enhanced_raw = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{[\s\S]*\}", raw)
                enhanced_raw = json.loads(m.group(0)) if m else {"summary": raw}

            merged = self._merge_baseline_and_enhanced(baseline, enhanced_raw)
            merged = self._polish_for_ats_rubric(merged, baseline, cv_text, job_description, tone)
            merged = self._normalize_resume_data(merged, cv_text)

            scored = self._score_structured_cv(merged, cv_text)
            new_score = int(scored['ats']['score'])
            final_text = scored['builtText']

            if new_score < baseline_score:
                # Honest fallback: keep the original text untouched and only ADD
                # missing sections (summary/skills/education/certifications).
                # Additions can never lower the deterministic text score.
                augmented = self._augment_original_text(cv_text, merged)
                augmented_ats = self._compute_ats_score(augmented)
                if augmented_ats['score'] >= new_score:
                    final_text = augmented
                    scored = {'builtText': augmented, 'ats': augmented_ats}
                    new_score = int(augmented_ats['score'])

            if new_score < baseline_score:
                # Last resort: never return something worse than the original.
                base_ats = self._compute_ats_score(cv_text)
                final_text = cv_text
                scored = {'builtText': cv_text, 'ats': base_ats}
                new_score = int(base_ats['score'])

            merged['atsScore'] = new_score
            merged['overallScore'] = new_score
            merged['scoreBreakdown'] = scored['ats']['breakdown']
            merged['previousAtsScore'] = baseline_score
            merged['isValidCV'] = True
            merged['documentType'] = 'CV'
            merged['whyThisScore'] = (
                f"ATS score {new_score}/100 (was {baseline_score}/100). "
                + ", ".join(f"{k} {v}" for k, v in scored['ats']['breakdown'].items())
            )

            return {
                "success": True,
                "enhanced": merged,
                "builtText": final_text,
                "enhancedText": final_text,
                "atsScore": new_score,
                "previousAtsScore": baseline_score,
                "scoreBreakdown": scored['ats']['breakdown'],
                "improved": new_score >= baseline_score,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def generate_pdf(self, cv_data: dict, template_id: str = "smart", accent_color: str = "#000000"):
        """Generate 100% ATS-compatible PDF - clean text, no complex formatting"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4, 
            topMargin=0.5*inch, 
            bottomMargin=0.5*inch,
            leftMargin=0.75*inch,
            rightMargin=0.75*inch
        )
        
        styles = getSampleStyleSheet()
        
        # ATS-FRIENDLY STYLES
        name_style = ParagraphStyle(
            'Name',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.black,
            spaceAfter=4,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold',
            leading=22
        )
        
        section_title_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.black,
            spaceAfter=6,
            spaceBefore=10,
            fontName='Helvetica-Bold',
            leading=14
        )
        
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=4,
            fontName='Helvetica',
            leading=12,
            textColor=colors.black,
            alignment=TA_LEFT
        )
        
        bullet_style = ParagraphStyle(
            'Bullet',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=3,
            leftIndent=10,
            fontName='Helvetica',
            leading=12,
            textColor=colors.black
        )
        
        contact_style = ParagraphStyle(
            'Contact',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=8,
            fontName='Helvetica',
            leading=12,
            textColor=colors.black
        )
        
        job_title_style = ParagraphStyle(
            'JobTitle',
            parent=styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
            spaceAfter=2,
            leading=13,
            textColor=colors.black
        )
        
        job_details_style = ParagraphStyle(
            'JobDetails',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica',
            spaceAfter=3,
            leading=11,
            textColor=HexColor('#333333')
        )
        
        story = []
        
        # NAME
        if cv_data.get('name'):
            clean_name = self._clean_text(cv_data['name']).upper()
            story.append(Paragraph(clean_name, name_style))
        
        # CONTACT INFO
        contact_parts = []
        if cv_data.get('phone'):
            contact_parts.append(self._clean_text(cv_data['phone']))
        if cv_data.get('email'):
            contact_parts.append(self._clean_text(cv_data['email']))
        if cv_data.get('address'):
            contact_parts.append(self._clean_text(cv_data['address']))
        if cv_data.get('linkedin'):
            linkedin_clean = self._clean_text(cv_data['linkedin'])
            linkedin_clean = linkedin_clean.replace('https://', '').replace('http://', '')
            contact_parts.append(linkedin_clean)
        
        if contact_parts:
            story.append(Paragraph(" | ".join(contact_parts), contact_style))
        
        story.append(Spacer(1, 0.15*inch))
        
        # PROFESSIONAL SUMMARY
        if cv_data.get('summary'):
            story.append(Paragraph("PROFESSIONAL SUMMARY", section_title_style))
            summary_text = self._clean_text(cv_data['summary'])
            story.append(Paragraph(summary_text, body_style))
            story.append(Spacer(1, 0.1*inch))
        
        # WORK EXPERIENCE
        if cv_data.get('experienceEntries') and len(cv_data['experienceEntries']) > 0:
            story.append(Paragraph("WORK EXPERIENCE", section_title_style))
            
            for exp in cv_data['experienceEntries']:
                company = self._clean_text(exp.get('company', ''))
                title = self._clean_text(exp.get('title', ''))
                
                if title:
                    story.append(Paragraph(f"<b>{title}</b>", job_title_style))
                if company:
                    story.append(Paragraph(company, job_details_style))
                
                exp_details = []
                if exp.get('period'):
                    exp_details.append(self._clean_text(exp['period']))
                if exp.get('location'):
                    exp_details.append(self._clean_text(exp['location']))
                if exp_details:
                    story.append(Paragraph(" | ".join(exp_details), job_details_style))
                
                bullets = exp.get('bullets', [])
                if bullets:
                    for bullet in bullets:
                        bullet_text = self._clean_text(bullet)
                        if bullet_text:
                            story.append(Paragraph(f"- {bullet_text}", bullet_style))
                
                story.append(Spacer(1, 0.08*inch))
        
        # SKILLS
        if cv_data.get('skills'):
            story.append(Paragraph("SKILLS", section_title_style))
            skills_values = cv_data['skills'] if isinstance(cv_data['skills'], list) else []
            
            # Filter out empty skills
            skills_values = [s for s in skills_values if s and str(s).strip()]
            
            for skill in skills_values:
                clean_skill = self._clean_text(skill)
                if clean_skill:
                    story.append(Paragraph(f"- {clean_skill}", bullet_style))
            
            story.append(Spacer(1, 0.1*inch))
        
        # EDUCATION
        if cv_data.get('education'):
            story.append(Paragraph("EDUCATION", section_title_style))
            edu_values = cv_data['education'] if isinstance(cv_data['education'], list) else [cv_data['education']]
            edu_values = [e for e in edu_values if e and str(e).strip()]
            for edu in edu_values:
                if edu:
                    clean_edu = self._clean_text(str(edu))
                    if clean_edu:
                        story.append(Paragraph(f"- {clean_edu}", bullet_style))
            story.append(Spacer(1, 0.1*inch))
        
        # LANGUAGES
        if cv_data.get('languages'):
            lang_values = cv_data['languages'] if isinstance(cv_data['languages'], list) else [cv_data['languages']]
            lang_values = [l for l in lang_values if l and str(l).strip()]
            if lang_values:
                story.append(Paragraph("LANGUAGES", section_title_style))
                for lang in lang_values:
                    if lang:
                        clean_lang = self._clean_text(str(lang))
                        if clean_lang:
                            story.append(Paragraph(f"- {clean_lang}", bullet_style))
                story.append(Spacer(1, 0.1*inch))
        
        # CERTIFICATIONS
        if cv_data.get('certifications'):
            certs = cv_data['certifications'] if isinstance(cv_data['certifications'], list) else [cv_data['certifications']]
            certs = [c for c in certs if c and str(c).strip()]
            if certs:
                story.append(Paragraph("CERTIFICATIONS", section_title_style))
                for cert in certs:
                    clean_cert = self._clean_text(str(cert))
                    if clean_cert:
                        story.append(Paragraph(f"- {clean_cert}", bullet_style))
                story.append(Spacer(1, 0.1*inch))
        
        # CUSTOM SECTIONS
        if cv_data.get('customSections'):
            custom_sections = cv_data['customSections']
            if isinstance(custom_sections, list):
                for section in custom_sections:
                    if isinstance(section, dict):
                        section_title = section.get('title', '').strip().upper()
                        section_items = section.get('items', [])
                        section_items = [item for item in section_items if item and str(item).strip()]
                        
                        if section_title and section_items:
                            story.append(Paragraph(section_title, section_title_style))
                            for item in section_items:
                                clean_item = self._clean_text(str(item))
                                if clean_item:
                                    story.append(Paragraph(f"- {clean_item}", bullet_style))
                            story.append(Spacer(1, 0.1*inch))
        
        doc.build(story)
        buffer.seek(0)
        return buffer

enhancer = CVEnhancer()

logger = logging.getLogger(__name__)


def _tesseract_available() -> bool:
    cmd = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if not cmd:
        return False
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = cmd
        return True
    except ImportError:
        return False


def _ocr_png_with_tesseract(png_bytes: bytes) -> str:
    import pytesseract
    from PIL import Image

    cmd = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd

    image = Image.open(io.BytesIO(png_bytes))
    return (pytesseract.image_to_string(image) or "").strip()


def _ocr_png_with_openai(png_bytes: bytes) -> str:
    """OCR a single page via OpenAI vision (fallback when PDF has image-only pages)."""
    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    model = os.environ.get("OPENAI_VISION_MODEL", CHAT_MODEL)
    response = client.chat.completions.create(
        model=model,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Extract all text from this CV/resume page. "
                        "Preserve line breaks and section order. "
                        "Return only the extracted text with no commentary."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{b64}",
                        "detail": "high",
                    },
                },
            ],
        }],
        max_tokens=4096,
    )
    return (response.choices[0].message.content or "").strip()


def _ocr_pdf_pages(content: bytes) -> tuple[str, str | None]:
    """
    OCR scanned/image-based PDF pages.
    Tries local Tesseract first, then OpenAI vision.
    """
    if os.environ.get("PDF_OCR_ENABLED", "true").lower() in ("0", "false", "no"):
        return "", "OCR disabled"

    try:
        import fitz  # pymupdf
    except ImportError:
        return "", "pymupdf not installed (pip install pymupdf)"

    max_pages = int(os.environ.get("PDF_OCR_MAX_PAGES", "12"))
    zoom = float(os.environ.get("PDF_OCR_ZOOM", "2.5"))
    use_tesseract = _tesseract_available()
    page_texts: list[str] = []
    ocr_errors: list[str] = []

    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as e:
        return "", f"Could not open PDF for OCR: {e}"

    try:
        for page_num in range(min(len(doc), max_pages)):
            try:
                page = doc[page_num]
                pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
                png_bytes = pix.tobytes("png")

                page_text = ""
                if use_tesseract:
                    try:
                        page_text = _ocr_png_with_tesseract(png_bytes)
                    except Exception as e:
                        ocr_errors.append(f"tesseract page {page_num + 1}: {e}")

                if not page_text:
                    try:
                        page_text = _ocr_png_with_openai(png_bytes)
                        logger.info("OCR page %s via OpenAI vision", page_num + 1)
                    except Exception as e:
                        ocr_errors.append(f"vision page {page_num + 1}: {e}")

                if page_text:
                    page_texts.append(page_text)
            except Exception as e:
                ocr_errors.append(f"page {page_num + 1}: {e}")
    finally:
        doc.close()

    text = "\n\n".join(page_texts).strip()
    if text:
        return text, None

    return "", "; ".join(ocr_errors) if ocr_errors else "OCR extracted empty text"


def _extract_pdf_text(content: bytes) -> tuple[str, str | None, bool]:
    """
    Extract text from PDF: selectable text first, then OCR for scanned/image pages.
    Returns (text, error_message, ocr_used).
    """
    errors: list[str] = []

    # First attempt: pdfplumber (best layout extraction for many resumes)
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = [p.extract_text() or '' for p in pdf.pages]
            text = "\n".join(pages).strip()
            if text:
                return text, None, False
            errors.append("pdfplumber extracted empty text")
    except Exception as e:
        errors.append(f"pdfplumber: {e}")

    # Fallback: pypdf/PyPDF2-style extraction
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages = [(page.extract_text() or '') for page in reader.pages]
        text = "\n".join(pages).strip()
        if text:
            return text, None, False
        errors.append("pypdf extracted empty text")
    except Exception as e:
        errors.append(f"pypdf: {e}")

    # Scanned / image-only PDFs: OCR each rendered page
    ocr_text, ocr_error = _ocr_pdf_pages(content)
    if ocr_text:
        return ocr_text, None, True

    if ocr_error:
        errors.append(ocr_error)

    return "", "; ".join(errors) if errors else "Could not parse PDF", False

@app.route('/')
def root():
    return jsonify({"message": "Enhanced CV API — honest ATS analysis and improvement"})

@app.route('/upload', methods=['POST'])
def upload():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "Missing file"}), 400
        f = request.files['file']
        filename = (f.filename or '').lower()
        content = f.read()
        text = ""
        
        mime = (f.mimetype or "").lower()

        ocr_used = False
        if filename.endswith('.pdf') or mime == 'application/pdf':
            text, parse_error, ocr_used = _extract_pdf_text(content)
            if parse_error and not text:
                return jsonify({
                    "success": False,
                    "error": f"PDF parse failed: {parse_error}. Try a clearer scan or paste the CV text manually."
                }), 422
            text = re.sub(r'\(cid:\d+\)', '', text)
        elif filename.endswith('.docx'):
            try:
                import docx
                doc = docx.Document(io.BytesIO(content))
                text = "\n".join(p.text for p in doc.paragraphs)
            except Exception as e:
                return jsonify({"success": False, "error": f"DOCX parse failed: {e}"}), 500
        else:
            text = content.decode('utf-8', errors='replace')
        
        text = (text or '').strip()
        if not text:
            return jsonify({"success": False, "error": "No text extracted"}), 422

        response_payload: dict = {"success": True, "text": text}
        if ocr_used:
            response_payload["ocr_used"] = True
            response_payload["message"] = "Scanned PDF — text extracted via OCR"

        return jsonify(response_payload)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_endpoint():
    data = request.get_json() or {}
    text = data.get("cv_text", "").strip()
    jd = data.get("job_description")
    structured = data.get("structured_data")
    alt_text = data.get("alt_text")
    if not text:
        return jsonify({"success": False, "error": "Missing cv_text"}), 400
    return jsonify(enhancer.analyze(text, jd, structured, alt_text))

@app.route('/enhance', methods=['POST'])
def enhance_endpoint():
    data = request.get_json() or {}
    text = data.get("cv_text", "").strip()
    jd = data.get("job_description")
    tone = data.get("tone", "professional")
    baseline = data.get("baseline")
    alt_text = data.get("alt_text")
    if not text:
        return jsonify({"success": False, "error": "Missing cv_text"}), 400
    return jsonify(enhancer.enhance(text, jd, tone, baseline, alt_text))

@app.route('/suggest-skills', methods=['POST'])
def suggest_skills_endpoint():
    data = request.get_json() or {}
    text = data.get("cv_text", "").strip()
    jd = data.get("job_description")
    if not text:
        return jsonify({"success": False, "error": "Missing cv_text"}), 400
    return jsonify(enhancer.suggest_skills(text, jd))

@app.route('/enhance-summary', methods=['POST'])
def enhance_summary_endpoint():
    data = request.get_json() or {}
    text = data.get("cv_text", "").strip()
    jd = data.get("job_description")
    tone = data.get("tone", "professional")
    if not text:
        return jsonify({"success": False, "error": "Missing cv_text"}), 400
    return jsonify(enhancer.enhance_summary(text, jd, tone))

@app.route('/templates', methods=['GET'])
def templates():
    return jsonify({
        "templates": [
            {"id": "ats_standard", "name": "ATS Standard", "colors": ["#000000"], "fonts": ["Helvetica"]},
            {"id": "ats_clean", "name": "ATS Clean", "colors": ["#1a1a1a"], "fonts": ["Helvetica"]},
        ]
    })

@app.route('/generate-pdf', methods=['POST'])
def generate_pdf_endpoint():
    try:
        data = request.get_json() or {}
        cv_data = data.get("cv_data")
        template_id = data.get("template_id", "ats_standard")
        accent_color = data.get("accent_color", "#000000")
        
        if not cv_data:
            return jsonify({"success": False, "error": "Missing cv_data"}), 400
        
        pdf_buffer = enhancer.generate_pdf(cv_data, template_id, accent_color)
        
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='cv-ats-optimized.pdf'
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5006, debug=True)