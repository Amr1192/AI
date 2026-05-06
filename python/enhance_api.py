from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import re
import logging
import io
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
        name, email, phone, address = None, None, None, None
        lines = [l.strip() for l in cv_text.splitlines() if l.strip()]

        for l in lines[:6]:
            if '@' in l or re.search(r"\d", l):
                continue
            l_norm = re.sub(r"(?i)(?:\b([A-Za-z])\s+)+", lambda m: ''.join(m.group(0).split()), l).strip()
            candidate = l_norm if len(l_norm.replace(' ', '')) > len(l.replace(' ', '')) else l
            if re.search(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}", candidate) or re.fullmatch(r"[A-Za-z]{4,}", candidate):
                name = candidate
                break

        email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", cv_text)
        phone_match = re.search(r"(\+?\d[\d\s().-]{7,}\d)", cv_text)

        city_words = ["cairo", "giza", "alex", "egypt", "riyadh", "jeddah", "ksa", "saudi", "dubai", "uae"]
        for l in lines[:10]:
            low = l.lower()
            if any(w in low for w in city_words) and ('@' not in l):
                if not re.match(r"^[A-Z\s]{3,}$", l):
                    address = l
                    break

        return (
            name,
            (email_match.group(0) if email_match else None),
            (phone_match.group(1) if phone_match else None),
            address,
        )

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
                model="gpt-4o-mini",
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

    def analyze(self, cv_text: str, job_description: str | None = None):
        document_type_prompt = f"""
Analyze this text and respond with ONLY one word: CV, CERTIFICATE, COVER_LETTER, or OTHER.
CV: Has work experience, skills, education sections
CERTIFICATE: Certificate of completion/training/achievement
COVER_LETTER: Addressed to company/hiring manager
OTHER: None of the above

TEXT:
{cv_text[:2000]}
"""
        try:
            doc_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Respond with only: CV, CERTIFICATE, COVER_LETTER, or OTHER"},
                    {"role": "user", "content": document_type_prompt}
                ],
                temperature=0.1
            )
            document_type = doc_response.choices[0].message.content.strip().upper()
            
            if document_type != "CV":
                return {
                    "success": True, 
                    "result": {
                        "name": "", "email": "", "phone": "", "summary": "",
                        "skills": [], "experience": [], "education": [],
                        "strengths": [], "improvements": [],
                        "weaknesses": [f"This appears to be a {document_type.lower().replace('_', ' ')}, not a CV"],
                        "atsScore": 0, "overallScore": 0,
                        "whyThisScore": f"This is a {document_type.lower().replace('_', ' ')}, not a resume."
                    }
                }
        except Exception as e:
            logging.error(f"Document type detection failed: {e}")

        prompt = f"""
        Analyze this CV and output ONLY valid JSON with keys:
        name,email,phone,skills,experience,education,strengths,improvements,atsScore,overallScore,summary,whyThisScore,atsIssues,missingKeywords.
        
        ATS SCORING CRITERIA (be strict):
        - Contact info present and complete: +15 points
        - Professional summary present and strong: +15 points
        - Work experience with quantified achievements: +20 points
        - Skills section with relevant keywords: +15 points
        - Education section present: +10 points
        - Proper formatting (no tables, graphics): +10 points
        - Action verbs used: +5 points
        - No spelling/grammar errors: +5 points
        - Relevant keywords for industry: +5 points
        
        - strengths: 3-6 positive bullets
        - improvements: 3-6 actionable bullets
        - atsScore and overallScore: integers 30-100 (be realistic based on above criteria)
        - atsIssues: array of specific ATS compatibility problems found
        - missingKeywords: array of important keywords missing from CV
        
        CV:\n{cv_text}\n
        JOB DESCRIPTION:\n{job_description or ''}
        """
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Extract structured data from resumes. Output JSON only. Focus on ATS compatibility. Be strict but fair in scoring."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
            )
            raw = response.choices[0].message.content.strip()
            import json
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{[\s\S]*\}", raw)
                data = json.loads(m.group(0)) if m else {"summary": raw}
            
            name, email, phone, address = self._extract_contacts(cv_text)
            data.setdefault("name", name)
            data.setdefault("email", email)
            data.setdefault("phone", phone)
            if address:
                data.setdefault("address", address)
            
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
                model="gpt-4o-mini",
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

    def enhance(self, cv_text: str, job_description: str | None = None, tone: str = "professional"):
        """
        ENHANCED VERSION - Optimizes CV to score 90-100% on ATS
        """
        prompt = f"""
You are an expert ATS optimization specialist. Your goal is to transform this CV into a PERFECT ATS-compatible resume that will score 90-100% on any ATS system.

CRITICAL ATS OPTIMIZATION REQUIREMENTS:

1. PROFESSIONAL SUMMARY (MUST have):
   - Start with exact job title + years of experience
   - Include 3-4 industry-specific keywords
   - Mention 1-2 quantified achievements
   - 3-5 sentences, 80-120 words
   - Use power words: "accomplished", "delivered", "achieved", "led", "managed"

2. WORK EXPERIENCE (MUST have for each role):
   - Company name, Job title, Location, Date range
   - 4-6 bullet points per role
   - EVERY bullet must start with strong action verb
   - EVERY bullet must include quantified results (numbers, percentages, dollar amounts)
   - Include relevant keywords naturally
   - Example format: "Achieved [X]% improvement in [metric] by implementing [action], resulting in [business impact]"

3. SKILLS SECTION (MUST have):
   - 10-15 relevant technical and soft skills
   - Include industry-standard terminology
   - Match skills to common job requirements
   - Group by category if needed (Technical Skills, Soft Skills, Tools)

4. EDUCATION (MUST have):
   - Degree, Institution, Graduation Year
   - Relevant coursework or honors if applicable

5. ATS-CRITICAL FORMATTING:
   - Use ONLY plain ASCII text
   - NO special characters, symbols, or unicode
   - Use standard section headings exactly: "Professional Summary", "Work Experience", "Skills", "Education"
   - Use simple hyphen (-) for bullets
   - Dates in format: "Month Year - Month Year" or "Month Year - Present"

OUTPUT FORMAT - Return ONLY valid JSON with these exact keys:
{{
    "summary": "3-5 line professional summary with keywords and achievements",
    "experienceEntries": [
        {{
            "company": "Company Name",
            "title": "Job Title",
            "period": "Start Date - End Date",
            "location": "City, Country",
            "bullets": [
                "Action verb + quantified achievement + business impact",
                "Action verb + quantified achievement + business impact",
                "Action verb + quantified achievement + business impact",
                "Action verb + quantified achievement + business impact"
            ]
        }}
    ],
    "skills": ["Skill 1", "Skill 2", "Skill 3", "...10-15 skills"],
    "education": ["Degree in Field, Institution, Year"],
    "languages": ["Language: Proficiency Level"],
    "certifications": ["Certification Name, Issuing Org, Year"],
    "keywords": ["keyword1", "keyword2", "...relevant ATS keywords"],
    "atsOptimizations": ["List of optimizations made"]
}}

ORIGINAL CV TO ENHANCE:
{cv_text}

JOB DESCRIPTION (use for keyword optimization):
{job_description or 'General professional role - optimize for broad ATS compatibility'}

IMPORTANT: 
- If the original CV lacks quantified achievements, CREATE realistic ones based on the role
- If skills are missing, ADD relevant industry-standard skills
- Ensure EVERY experience bullet has a number/percentage/metric
- The enhanced CV MUST score 90-100% when re-analyzed
"""
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": """You are the world's best ATS optimization expert. 
Your enhanced CVs ALWAYS score 90-100% on ATS systems because you:
1. Include ALL required sections with proper headings
2. Use quantified achievements in EVERY bullet point
3. Include 10-15 relevant skills with industry keywords
4. Write powerful professional summaries with keywords
5. Use only plain text formatting
6. Include action verbs and metrics throughout
Transform the CV to be PERFECT for ATS. Output JSON only."""},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
            )
            raw = response.choices[0].message.content.strip()
            import json
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                m = re.search(r"\{[\s\S]*\}", raw)
                data = json.loads(m.group(0)) if m else {"summary": raw}
            
            # Ensure summary is strong enough
            summary = data.get("summary", "")
            if summary:
                sentences = [s.strip() for s in summary.split('.') if s.strip()]
                if len(sentences) < 3:
                    summary_result = self.enhance_summary(cv_text, job_description, tone)
                    if summary_result.get("success"):
                        data["summary"] = summary_result.get("summary")
            
            # Ensure we have enough skills (at least 10)
            skills = data.get("skills", [])
            if len(skills) < 10:
                # Add common professional skills if needed
                common_skills = [
                    "Project Management", "Team Leadership", "Strategic Planning",
                    "Data Analysis", "Problem Solving", "Communication",
                    "Microsoft Office Suite", "Process Improvement", "Stakeholder Management",
                    "Budget Management", "Time Management", "Critical Thinking"
                ]
                for skill in common_skills:
                    if skill not in skills and len(skills) < 12:
                        skills.append(skill)
                data["skills"] = skills
            
            # Ensure experience entries have enough bullets
            experience_entries = data.get("experienceEntries", [])
            for exp in experience_entries:
                bullets = exp.get("bullets", [])
                if len(bullets) < 4:
                    # Add generic achievement bullets if needed
                    while len(bullets) < 4:
                        bullets.append("Contributed to team objectives and delivered results aligned with organizational goals")
                    exp["bullets"] = bullets
            data["experienceEntries"] = experience_entries
            
            return {"success": True, "enhanced": data}
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

def _extract_pdf_text(content: bytes) -> tuple[str, str | None]:
    """
    Extract text from PDF with graceful fallbacks.
    Returns (text, error_message).
    """
    errors: list[str] = []

    # First attempt: pdfplumber (best layout extraction for many resumes)
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = [p.extract_text() or '' for p in pdf.pages]
            text = "\n".join(pages).strip()
            if text:
                return text, None
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
            return text, None
        errors.append("pypdf extracted empty text")
    except Exception as e:
        errors.append(f"pypdf: {e}")

    return "", "; ".join(errors) if errors else "Could not parse PDF"

@app.route('/')
def root():
    return jsonify({"message": "Enhanced CV API with ATS Optimization running - 90-100% Score Guarantee"})

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

        if filename.endswith('.pdf') or mime == 'application/pdf':
            text, parse_error = _extract_pdf_text(content)
            if parse_error and not text:
                return jsonify({
                    "success": False,
                    "error": f"PDF parse failed: {parse_error}. If this is a scanned PDF, convert it to searchable PDF or paste text manually."
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
        return jsonify({"success": True, "text": text})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_endpoint():
    data = request.get_json() or {}
    text = data.get("cv_text", "").strip()
    jd = data.get("job_description")
    if not text:
        return jsonify({"success": False, "error": "Missing cv_text"}), 400
    return jsonify(enhancer.analyze(text, jd))

@app.route('/enhance', methods=['POST'])
def enhance_endpoint():
    data = request.get_json() or {}
    text = data.get("cv_text", "").strip()
    jd = data.get("job_description")
    tone = data.get("tone", "professional")
    if not text:
        return jsonify({"success": False, "error": "Missing cv_text"}), 400
    return jsonify(enhancer.enhance(text, jd, tone))

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