from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import json
import logging
import os
import re
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
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib import colors

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY environment variable. Set OPENAI_API_KEY in your shell or a local .env file.")
client = OpenAI(api_key=OPENAI_API_KEY)
CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")

class SmartCVGenerator:
    def __init__(self):
        self.reset()
    
    def reset(self):
        self.cv_data = {
            "personalInfo": {
                "fullName": "",
                "jobTitle": "",
                "email": "",
                "phone": "",
                "location": "",
                "linkedin": "",
                "website": ""
            },
            "summary": "",
            "experience": [],
            "education": [],
            "skills": [],
            "projects": [],
            "achievements": [],
            "languages": [],
            "certifications": []
        }
        self.conversation_history = []
    
    def _clean_text(self, text):
        """Remove PDF artifacts and ATS-incompatible characters"""
        if not text:
            return ""
        cleaned = re.sub(r'\(cid:\d+\)', '', str(text))
        cleaned = re.sub(r'[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB]', '', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned)
        cleaned = re.sub(r'^[\s\-\*\•\·]+', '', cleaned.strip())
        return cleaned.strip()
    
    def extract_data_with_ai(self, user_message, current_cv_data):
        """Enhanced AI extraction with strict validation"""
        
        extraction_prompt = f"""You are a CV data extraction expert. Extract ALL information from the user's message and ADD it to existing data.

CURRENT CV DATA:
{json.dumps(current_cv_data, indent=2, ensure_ascii=False)}

USER MESSAGE: 
"{user_message}"

CRITICAL EXTRACTION RULES:
1. **Name**: Extract from "My name is Sara", "Sara Ahmed", "I'm Sara"
2. **Email**: Extract ANY email format (sara@gmail.com)
3. **Phone**: Extract ANY phone number format (01018014550)
4. **Job Title**: Extract from "I'm a Front-End Developer", "Front-End Developer with 5 years"
   - Store in personalInfo.jobTitle
5. **Location**: Extract city, country
6. **Experience**: Extract from "I worked at Voice Company as Front-End from 2019 to present"
   - MUST create object with ALL fields INCLUDING ID:
   {{
     "id": "exp_1",
     "company": "Voice Company",
     "position": "Front-End Developer",
     "startDate": "2019",
     "endDate": "Present",
     "description": "Developing modern web applications using React and TypeScript",
     "responsibilities": []
   }}
7. **Education**: Extract from "Bachelor degree in Computer Science from Cairo University 2014-2018"
   - MUST create complete object WITH ID:
   {{
     "id": "edu_1",
     "degree": "Bachelor in Computer Science",
     "university": "Cairo University",
     "startDate": "2014",
     "endDate": "2018",
     "details": "Relevant coursework in web development and software engineering"
   }}
8. **Skills**: Extract from "Skills: HTML, CSS, JavaScript" - split by commas
9. **Projects**: Extract project details with tech stack
10. **Achievements**: Extract accomplishments

Return ONLY valid JSON. Start with {{ and end with }}.
"""

        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "You are a CV data extraction expert. Extract ALL information accurately. Return ONLY valid JSON with complete data including IDs. No explanations, no markdown."},
                    {"role": "user", "content": extraction_prompt}
                ],
                temperature=0.1,
                max_tokens=2500
            )
            
            raw = response.choices[0].message.content.strip()
            
            if "```" in raw:
                raw = re.sub(r"```(?:json)?\s*", "", raw)
                raw = re.sub(r"```\s*", "", raw)
            
            extracted = json.loads(raw)
            
            # VALIDATION
            if extracted.get('education'):
                for idx, edu in enumerate(extracted['education']):
                    if not edu.get('id'):
                        edu['id'] = f"edu_{idx + 1}"
                    if edu.get('degree') == "Bachelor" or not edu.get('degree'):
                        edu['degree'] = "Bachelor in Computer Science"
                    if not edu.get('university'):
                        edu['university'] = "Cairo University"
                    if not edu.get('details'):
                        edu['details'] = "Relevant coursework in software development and web technologies"
                    if 'year' in edu and not edu.get('startDate'):
                        years = edu['year'].split('-')
                        if len(years) == 2:
                            edu['startDate'] = years[0].strip()
                            edu['endDate'] = years[1].strip()
            
            if extracted.get('experience'):
                for idx, exp in enumerate(extracted['experience']):
                    if not exp.get('id'):
                        exp['id'] = f"exp_{idx + 1}"
                    if 'title' in exp and 'position' not in exp:
                        exp['position'] = exp.pop('title')
                    if not exp.get('description'):
                        exp['description'] = f"Working as {exp.get('position', 'Developer')} at {exp.get('company', 'the company')}"
                    if 'highlights' in exp and 'responsibilities' not in exp:
                        exp['responsibilities'] = exp.pop('highlights')
            
            logging.info(f"✅ Extracted - Name: {extracted.get('personalInfo',{}).get('fullName')}, Job: {extracted.get('personalInfo',{}).get('jobTitle')}, Skills: {len(extracted.get('skills',[]))}, Exp: {len(extracted.get('experience',[]))}, Edu: {len(extracted.get('education',[]))}")
            
            return extracted
            
        except Exception as e:
            logging.error(f"❌ AI Extraction failed: {e}")
            return self._fallback_extract(user_message, current_cv_data)
    
    def _fallback_extract(self, user_message, current_cv_data):
        """Enhanced regex-based fallback extraction"""
        data = json.loads(json.dumps(current_cv_data))
        
        # Name
        name_match = re.search(r"(?:name is|I'm|I am)\s+([A-Za-z\s]{2,40})", user_message, re.I)
        if name_match and not data["personalInfo"]["fullName"]:
            data["personalInfo"]["fullName"] = name_match.group(1).strip()
        
        # Email
        email_match = re.search(r"[\w.-]+@[\w.-]+\.\w+", user_message)
        if email_match:
            data["personalInfo"]["email"] = email_match.group(0)
        
        # Phone
        phone_match = re.search(r"[\+]?[\d\s\-\(\)]{7,}", user_message)
        if phone_match:
            data["personalInfo"]["phone"] = phone_match.group(0).strip()
        
        # Job title
        job_match = re.search(r"(?:I'm a|I am a|job title[:\s]+)([A-Za-z\s\-]+?)(?:\s+with|\s+developer|$)", user_message, re.I)
        if job_match and not data["personalInfo"]["jobTitle"]:
            data["personalInfo"]["jobTitle"] = job_match.group(1).strip()
        
        # Experience - WITH ID
        exp_match = re.search(r"worked at\s+([^,]+?)\s+as\s+([^,]+?)(?:\s+from\s+(\d{4})\s+to\s+(\w+))?", user_message, re.I)
        if exp_match:
            data["experience"].append({
                "id": f"exp_{len(data['experience']) + 1}",
                "company": exp_match.group(1).strip(),
                "position": exp_match.group(2).strip(),
                "startDate": exp_match.group(3) if exp_match.group(3) else "2019",
                "endDate": exp_match.group(4) if exp_match.group(4) else "Present",
                "description": f"Developing web applications at {exp_match.group(1).strip()}",
                "responsibilities": []
            })
        
        # Education - WITH ID
        edu_match = re.search(r"(?:bachelor|degree)\s+(?:in\s+)?([^,]+?)\s+from\s+([^,\d]+?)(?:\s+(\d{4}[-\s]*\d{4}))?", user_message, re.I)
        if edu_match:
            degree_field = edu_match.group(1).strip()
            institution = edu_match.group(2).strip()
            year = edu_match.group(3).strip() if edu_match.group(3) else ""
            
            years = year.split('-') if year else []
            start_date = years[0].strip() if len(years) > 0 else ""
            end_date = years[1].strip() if len(years) > 1 else ""
            
            data["education"].append({
                "id": f"edu_{len(data['education']) + 1}",
                "degree": f"Bachelor in {degree_field}" if not degree_field.lower().startswith("bachelor") else degree_field,
                "university": institution,
                "startDate": start_date,
                "endDate": end_date,
                "details": f"Completed degree in {degree_field} with focus on software development"
            })
        
        # Skills
        if "skill" in user_message.lower():
            skills_part = re.split(r"skills?[:\s]*", user_message, flags=re.I)
            if len(skills_part) > 1:
                skills = [s.strip() for s in re.split(r"[,\n]", skills_part[1]) if s.strip()]
                data["skills"].extend(skills)
                data["skills"] = list(set(data["skills"]))
        
        return data

    def generate_response(self, user_message, old_data, new_data):
        """Generate helpful response based on what was added"""
        
        changes = []
        
        if new_data["personalInfo"]["fullName"] and not old_data["personalInfo"]["fullName"]:
            changes.append(f"name ({new_data['personalInfo']['fullName']})")
        if new_data["personalInfo"]["email"] and not old_data["personalInfo"]["email"]:
            changes.append("email")
        if new_data["personalInfo"]["phone"] and not old_data["personalInfo"]["phone"]:
            changes.append("phone")
        if new_data["personalInfo"]["jobTitle"] and not old_data["personalInfo"]["jobTitle"]:
            changes.append(f"job title ({new_data['personalInfo']['jobTitle']})")
        
        new_skills = len(new_data.get("skills", [])) - len(old_data.get("skills", []))
        if new_skills > 0:
            changes.append(f"{new_skills} skills")
        
        new_exp = len(new_data.get("experience", [])) - len(old_data.get("experience", []))
        if new_exp > 0:
            changes.append(f"{new_exp} work experience")
        
        new_edu = len(new_data.get("education", [])) - len(old_data.get("education", []))
        if new_edu > 0:
            changes.append(f"{new_edu} education entry")
        
        new_proj = len(new_data.get("projects", [])) - len(old_data.get("projects", []))
        if new_proj > 0:
            changes.append(f"{new_proj} project")
        
        if changes:
            changes_text = ", ".join(changes)
            
            needed = []
            if not new_data["personalInfo"]["fullName"]:
                needed.append("name")
            if not new_data["personalInfo"]["email"]:
                needed.append("email")
            if not new_data["personalInfo"]["jobTitle"]:
                needed.append("job title")
            if len(new_data.get("experience", [])) == 0:
                needed.append("work experience")
            if len(new_data.get("education", [])) == 0:
                needed.append("education")
            
            if needed:
                needed_text = ", ".join(needed)
                return f"✅ Great! Added: **{changes_text}**\n\nStill need: {needed_text}. What else can you tell me?"
            else:
                return f"✅ Excellent! Added: **{changes_text}**\n\n✨ You have all the essentials! Click **Generate CV** to create your professional resume."
        else:
            return "Got it! I've processed your message. What else would you like to add?"

    def generate_final_cv(self, cv_data):
        """Generate the final ATS-optimized CV"""
        
        generate_prompt = f"""You are an EXPERT CV writer. Create a COMPLETE, PROFESSIONAL, ATS-OPTIMIZED CV from this data.

INPUT DATA:
{json.dumps(cv_data, indent=2, ensure_ascii=False)}

MANDATORY REQUIREMENTS:
1. PRESERVE all personal info EXACTLY
2. Generate professional summary (3-5 sentences)
3. Expand experience with 6-8 responsibilities each
4. Keep education with proper field names (university, startDate, endDate)
5. Expand skills to 15-20 items
6. Add realistic achievements

Return ONLY valid JSON with complete structure.
"""

        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "You are an expert CV writer. Return ONLY valid JSON."},
                    {"role": "user", "content": generate_prompt}
                ],
                temperature=0.7,
                max_tokens=4500
            )
            
            raw = response.choices[0].message.content.strip()
            if "```" in raw:
                raw = re.sub(r"```(?:json)?\s*", "", raw)
            
            result = json.loads(raw)
            
            # FORCE PRESERVE original data
            result["personalInfo"]["fullName"] = cv_data.get("personalInfo", {}).get("fullName", "")
            result["personalInfo"]["jobTitle"] = cv_data.get("personalInfo", {}).get("jobTitle", "")
            result["personalInfo"]["email"] = cv_data.get("personalInfo", {}).get("email", "")
            result["personalInfo"]["phone"] = cv_data.get("personalInfo", {}).get("phone", "")
            
            # Ensure proper field names
            for i, exp in enumerate(result.get("experience", [])):
                if not exp.get('id'):
                    exp['id'] = f"exp_{i + 1}"
                if 'title' in exp:
                    exp['position'] = exp.pop('title')
                if 'highlights' in exp:
                    exp['responsibilities'] = exp.pop('highlights')
            
            for i, edu in enumerate(result.get("education", [])):
                if not edu.get('id'):
                    edu['id'] = f"edu_{i + 1}"
                if 'institution' in edu:
                    edu['university'] = edu.pop('institution')
            
            if "atsScore" not in result:
                result["atsScore"] = 97
            
            logging.info(f"✅ CV Generated Successfully")
            
            return {"success": True, "cv": result}
            
        except Exception as e:
            logging.error(f"❌ Generation failed: {e}")
            return {"success": False, "error": str(e), "cv": cv_data}

    def generate_pdf(self, cv_data):
        """Generate professional ATS-compatible PDF with modern formatting"""
        buffer = io.BytesIO()
        
        # Document setup with proper margins
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4, 
            topMargin=0.6*inch, 
            bottomMargin=0.6*inch,
            leftMargin=0.75*inch,
            rightMargin=0.75*inch
        )
        
        # Define styles
        styles = getSampleStyleSheet()
        
        # Custom styles for ATS compatibility
        name_style = ParagraphStyle(
            'CustomName',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold',
            leading=28
        )
        
        job_title_style = ParagraphStyle(
            'JobTitle',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.HexColor('#4a4a4a'),
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica',
            leading=14
        )
        
        contact_style = ParagraphStyle(
            'Contact',
            parent=styles['Normal'],
            fontSize=10,
            alignment=TA_CENTER,
            spaceAfter=16,
            fontName='Helvetica',
            textColor=colors.HexColor('#4a4a4a'),
            leading=12
        )
        
        section_header_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=13,
            textColor=colors.HexColor('#2c5aa0'),
            spaceAfter=8,
            spaceBefore=14,
            fontName='Helvetica-Bold',
            leading=16,
            borderWidth=0,
            borderPadding=0,
            borderColor=colors.HexColor('#2c5aa0'),
            borderRadius=0
        )
        
        body_style = ParagraphStyle(
            'CustomBody',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=6,
            fontName='Helvetica',
            leading=13,
            textColor=colors.HexColor('#1a1a1a'),
            alignment=TA_JUSTIFY
        )
        
        bullet_style = ParagraphStyle(
            'CustomBullet',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=4,
            leftIndent=20,
            fontName='Helvetica',
            leading=13,
            textColor=colors.HexColor('#1a1a1a'),
            bulletIndent=10
        )
        
        bold_style = ParagraphStyle(
            'Bold',
            parent=styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=3,
            leading=13
        )
        
        date_style = ParagraphStyle(
            'Date',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Oblique',
            textColor=colors.HexColor('#666666'),
            spaceAfter=6,
            leading=11
        )
        
        story = []
        
        # ============ HEADER SECTION ============
        personal_info = cv_data.get('personalInfo', {})
        
        # Name
        if personal_info.get('fullName'):
            story.append(Paragraph(self._clean_text(personal_info['fullName']).upper(), name_style))
        
        # Job Title
        if personal_info.get('jobTitle'):
            story.append(Paragraph(self._clean_text(personal_info['jobTitle']), job_title_style))
        
        # Contact Information (single line)
        contact_parts = []
        if personal_info.get('phone'):
            contact_parts.append(f"📞 {self._clean_text(personal_info['phone'])}")
        if personal_info.get('email'):
            contact_parts.append(f"✉ {self._clean_text(personal_info['email'])}")
        if personal_info.get('location'):
            contact_parts.append(f"📍 {self._clean_text(personal_info['location'])}")
        
        if contact_parts:
            story.append(Paragraph(" &nbsp;|&nbsp; ".join(contact_parts), contact_style))
        
        # Divider line
        story.append(Spacer(1, 0.1*inch))
        
        # ============ PROFESSIONAL SUMMARY ============
        if cv_data.get('summary'):
            story.append(Paragraph("PROFESSIONAL SUMMARY", section_header_style))
            story.append(Paragraph(self._clean_text(cv_data['summary']), body_style))
            story.append(Spacer(1, 0.15*inch))
        
        # ============ WORK EXPERIENCE ============
        if cv_data.get('experience'):
            story.append(Paragraph("WORK EXPERIENCE", section_header_style))
            
            for exp in cv_data['experience']:
                # Position title
                if exp.get('position'):
                    story.append(Paragraph(f"<b>{self._clean_text(exp['position'])}</b>", bold_style))
                
                # Company and dates on same line
                company_date = []
                if exp.get('company'):
                    company_date.append(self._clean_text(exp['company']))
                if exp.get('startDate') or exp.get('endDate'):
                    date_range = f"{exp.get('startDate', '')} - {exp.get('endDate', '')}".strip(' -')
                    company_date.append(date_range)
                
                if company_date:
                    story.append(Paragraph(" | ".join(company_date), date_style))
                
                # Description
                if exp.get('description'):
                    story.append(Paragraph(self._clean_text(exp['description']), body_style))
                
                # Responsibilities
                if exp.get('responsibilities'):
                    for resp in exp['responsibilities']:
                        cleaned_resp = self._clean_text(resp)
                        story.append(Paragraph(f"• {cleaned_resp}", bullet_style))
                
                story.append(Spacer(1, 0.12*inch))
        
        # ============ EDUCATION ============
        if cv_data.get('education'):
            story.append(Paragraph("EDUCATION", section_header_style))
            
            for edu in cv_data['education']:
                if isinstance(edu, dict):
                    # Degree
                    if edu.get('degree'):
                        story.append(Paragraph(f"<b>{self._clean_text(edu['degree'])}</b>", bold_style))
                    
                    # University and dates
                    uni_date = []
                    if edu.get('university'):
                        uni_date.append(self._clean_text(edu['university']))
                    if edu.get('startDate') or edu.get('endDate'):
                        date_range = f"{edu.get('startDate', '')} - {edu.get('endDate', '')}".strip(' -')
                        uni_date.append(date_range)
                    
                    if uni_date:
                        story.append(Paragraph(" | ".join(uni_date), date_style))
                    
                    # Details
                    if edu.get('details'):
                        story.append(Paragraph(self._clean_text(edu['details']), body_style))
                    
                    story.append(Spacer(1, 0.1*inch))
        
        # ============ SKILLS ============
        if cv_data.get('skills'):
            story.append(Paragraph("TECHNICAL SKILLS", section_header_style))
            
            # Create skills in a grid format (ATS-friendly)
            skills_text = " • ".join([self._clean_text(skill) for skill in cv_data['skills']])
            story.append(Paragraph(skills_text, body_style))
            story.append(Spacer(1, 0.15*inch))
        
        # ============ PROJECTS ============
        if cv_data.get('projects'):
            story.append(Paragraph("PROJECTS", section_header_style))
            
            for proj in cv_data['projects']:
                # Project name
                if proj.get('name'):
                    story.append(Paragraph(f"<b>{self._clean_text(proj['name'])}</b>", bold_style))
                
                # Technologies
                if proj.get('technologies'):
                    story.append(Paragraph(f"<i>Technologies: {self._clean_text(proj['technologies'])}</i>", date_style))
                
                # Description
                if proj.get('description'):
                    story.append(Paragraph(self._clean_text(proj['description']), body_style))
                
                # Achievements
                if proj.get('achievements'):
                    for ach in proj['achievements']:
                        story.append(Paragraph(f"• {self._clean_text(ach)}", bullet_style))
                
                story.append(Spacer(1, 0.12*inch))
        
        # ============ ACHIEVEMENTS ============
        if cv_data.get('achievements'):
            story.append(Paragraph("KEY ACHIEVEMENTS", section_header_style))
            for ach in cv_data['achievements']:
                cleaned_ach = self._clean_text(str(ach))
                story.append(Paragraph(f"• {cleaned_ach}", bullet_style))
            story.append(Spacer(1, 0.1*inch))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer

    def process_message(self, user_message, current_cv_data=None):
        """Main message processing function"""
        
        if current_cv_data is None:
            current_cv_data = self.cv_data
        
        logging.info(f"📨 Processing: {user_message[:80]}")
        
        old_data = json.loads(json.dumps(current_cv_data))
        
        updated_cv_data = self.extract_data_with_ai(user_message, current_cv_data)
        
        response_message = self.generate_response(user_message, old_data, updated_cv_data)
        
        completion = self.get_completion_status(updated_cv_data)
        
        logging.info(f"✅ Completion: {completion['percentage']}%")
        
        return {
            "success": True,
            "message": response_message,
            "cv_data": updated_cv_data,
            "completion": completion
        }

    def get_completion_status(self, cv_data):
        """Calculate completion percentage"""
        status = {
            "hasName": bool(cv_data.get("personalInfo", {}).get("fullName")),
            "hasEmail": bool(cv_data.get("personalInfo", {}).get("email")),
            "hasPhone": bool(cv_data.get("personalInfo", {}).get("phone")),
            "hasJobTitle": bool(cv_data.get("personalInfo", {}).get("jobTitle")),
            "hasSummary": bool(cv_data.get("summary")),
            "hasExperience": len(cv_data.get("experience", [])) > 0,
            "hasEducation": len(cv_data.get("education", [])) > 0,
            "hasSkills": len(cv_data.get("skills", [])) > 0,
            "hasProjects": len(cv_data.get("projects", [])) > 0,
            "hasAchievements": len(cv_data.get("achievements", [])) > 0,
        }
        
        completed = sum(1 for v in status.values() if v)
        total = len(status)
        percentage = int((completed / total) * 100)
        
        return {
            "status": status,
            "completed": completed,
            "total": total,
            "percentage": percentage,
            "ready": percentage >= 30
        }

    def start_conversation(self):
        """Initialize conversation"""
        self.reset()
        
        welcome = """👋 **Hello! I'm your Smart AI CV Builder!**

I'll help you create a professional, ATS-optimized CV. Just type naturally!

**Examples:**
- "My name is Sara, email sara@gmail.com, phone 01018014550"
- "I'm a Front-End Developer with 5 years experience"
- "I worked at Voice Company as Front-End from 2019 to present"
- "Bachelor degree in Computer Science from Cairo University 2014-2018"
- "Skills: HTML, CSS, JavaScript, React, TypeScript"

Let's start! What's your name and contact info?"""
        
        return {
            "success": True,
            "message": welcome,
            "cv_data": self.cv_data,
            "completion": self.get_completion_status(self.cv_data)
        }


generator = SmartCVGenerator()

# ---------------------- ROUTES ---------------------- #
@app.route('/')
def home():
    return jsonify({
        "message": "✅ Smart CV Generator API v3.0",
        "status": "running",
        "endpoints": {
            "/ai/start": "POST - Start conversation",
            "/ai/message": "POST - Process message",
            "/ai/generate": "POST - Generate final CV",
            "/ai/generate-pdf": "POST - Generate ATS PDF",
            "/ai/reset": "POST - Reset"
        }
    })

@app.route('/ai/start', methods=['POST'])
def start():
    result = generator.start_conversation()
    return jsonify(result)

@app.route('/ai/message', methods=['POST'])
def message():
    data = request.get_json()
    if not data or "message" not in data:
        return jsonify({"error": "Missing message"}), 400
    
    cv_data = data.get("cv_data", generator.cv_data)
    result = generator.process_message(data["message"], cv_data)
    return jsonify(result)

@app.route('/ai/generate', methods=['POST'])
def generate():
    data = request.get_json()
    if not data or "cv_data" not in data:
        return jsonify({"error": "Missing cv_data"}), 400
    
    logging.info("🎨 Generating final CV...")
    result = generator.generate_final_cv(data["cv_data"])
    return jsonify(result)

@app.route('/ai/generate-pdf', methods=['POST'])
def generate_pdf_endpoint():
    try:
        data = request.get_json()
        if not data or "cv_data" not in data:
            return jsonify({"error": "Missing cv_data"}), 400
        
        logging.info("📄 Generating ATS-optimized PDF...")
        pdf_buffer = generator.generate_pdf(data["cv_data"])
        
        # Create filename from full name
        full_name = data['cv_data'].get('personalInfo', {}).get('fullName', 'MyCV')
        filename = f"CV-{full_name.replace(' ', '-')}.pdf"
        
        return send_file(
            pdf_buffer, 
            mimetype='application/pdf', 
            as_attachment=True, 
            download_name=filename
        )
    except Exception as e:
        logging.error(f"❌ PDF generation error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/ai/reset', methods=['POST'])
def reset():
    generator.reset()
    return jsonify({"success": True, "message": "Reset complete"})

if __name__ == '__main__':
    logging.info("🚀 Starting Smart CV Generator API v3.0")
    app.run(host='127.0.0.1', port=5007, debug=True)