from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
from openai import OpenAI
import logging

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
CORS(app)

# ---------------------- CONFIG ---------------------- #
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("Missing OPENAI_API_KEY environment variable. Set OPENAI_API_KEY in your shell or a local .env file.")
client = OpenAI(api_key=OPENAI_API_KEY)
CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini")

# ---------------------- CV ANALYZER ---------------------- #
class CVAnalyzer:
    def _extract_contacts(self, cv_text: str):
        """Detects name, email, phone number from text"""
        name, email, phone = None, None, None
        lines = [l.strip() for l in cv_text.splitlines() if l.strip()]

        for l in lines[:5]:
            if '@' in l or re.search(r"\d", l):
                continue
            # normalize spaced-letter names like "M O H A M E D H A M D Y"
            l_norm = re.sub(r"(?i)(?:\b([A-Za-z])\s+)+", lambda m: ''.join(m.group(0).split()), l).strip()
            candidate = l_norm if len(l_norm.replace(' ', '')) > len(l.replace(' ', '')) else l
            if re.search(r"[A-Za-z]{2,}\s+[A-Za-z]{2,}", candidate) or re.fullmatch(r"[A-Za-z]{4,}", candidate):
                name = candidate
                break

        email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", cv_text)
        phone_match = re.search(r"(\+?\d[\d\s().-]{7,}\d)", cv_text)

        return name, (email_match.group(0) if email_match else None), (phone_match.group(1) if phone_match else None)

    def _detect_document_type(self, cv_text: str) -> str:
        """Detect if document is a CV, Certificate, Cover Letter, or Other"""
        
        document_type_prompt = f"""
You are a document classification expert. Analyze the following text and determine what type of document it is.

Respond ONLY with one of these exact values:
- "CV" - if it's a resume/CV with work experience, skills, education sections
- "CERTIFICATE" - if it's a certificate of completion, training, or achievement
- "COVER_LETTER" - if it's a cover letter
- "OTHER" - for any other document type

Look for these indicators:
CV: Work experience, professional summary, skills sections, multiple jobs/roles
CERTIFICATE: Certificate of completion, training course, authorization, verification, single achievement, award, credential
COVER_LETTER: Addressed to company/hiring manager, mentions specific job application
OTHER: None of the above patterns

TEXT:
{cv_text[:3000]}
"""

        try:
            doc_response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "You are a document classifier. Respond with only one word: CV, CERTIFICATE, COVER_LETTER, or OTHER."},
                    {"role": "user", "content": document_type_prompt}
                ],
                temperature=0.1
            )
            document_type = doc_response.choices[0].message.content.strip().upper()
            logging.info(f"Document type detected: {document_type}")
            return document_type
        except Exception as e:
            logging.error(f"Document type detection failed: {e}")
            return "UNKNOWN"

    def analyze_cv(self, cv_text: str):
        """Send CV to OpenAI for structured analysis"""
        
        # First, detect if this is actually a CV or another document type
        document_type = self._detect_document_type(cv_text)
        
        # If not a CV, return appropriate response with low score
        if document_type != "CV":
            doc_type_display = {
                "CERTIFICATE": "certificate of completion/training",
                "COVER_LETTER": "cover letter",
                "OTHER": "non-CV document",
                "UNKNOWN": "unrecognized document"
            }.get(document_type, "non-CV document")
            
            return {
                "success": True, 
                "result": {
                    "documentType": document_type,
                    "name": "",
                    "email": "",
                    "phone": "",
                    "summary": "",
                    "skills": [],
                    "experience": [],
                    "education": [],
                    "strengths": [],
                    "improvements": [
                        f"This is a {doc_type_display}, not a CV/resume",
                        "Please upload your full CV/resume for analysis",
                        "A CV should include: work experience, education, skills, and contact information"
                    ],
                    "weaknesses": [
                        f"Document identified as: {doc_type_display}",
                        "Not a valid CV/resume format",
                        "Missing essential CV sections (experience, skills, education)"
                    ],
                    "atsScore": 0,
                    "overallScore": 0,
                    "whyThisScore": f"This document appears to be a {doc_type_display} rather than a CV/resume. ATS systems expect resumes with work experience, skills, and education sections. Please upload your complete CV for proper analysis."
                }
            }
        
        # If it's a CV, proceed with normal analysis
        prompt = f"""
You are a professional ATS and resume analysis system.
Your task is to extract and score the following fields from the CV text.
Respond ONLY with valid JSON — no commentary, no explanations, no text before or after the JSON.

Required JSON keys:
name, email, phone, summary, skills, experience, education, strengths, improvements, atsScore, overallScore, whyThisScore.

Rules:
- Return ONLY one JSON object (no extra text).
- If a field is missing or unclear, use an empty string ("") or empty list ([]).
- "skills": list of skills mentioned in the CV.
- "experience": array of objects with fields:
    company, role, dates, description, and projects (if available).
- "education": array of objects with fields:
    degree, institution, year, and details.
- "strengths": 3–6 short, positive, specific points.
- "improvements": 3–6 short, actionable improvement points.
- "atsScore" and "overallScore": integers between 30 and 100.
- "whyThisScore": 2–4 sentences explaining the reasoning, referencing CV evidence.
- Use English only.
- Begin your response DIRECTLY with '{{' and end with '}}'.
- Do NOT include words like "Here is the JSON" or any extra text.

CV TEXT:
{cv_text}
"""

        try:
            response = client.chat.completions.create(
                model=CHAT_MODEL,
                messages=[
                    {"role": "system", "content": "You extract structured data from resumes and score ATS alignment. Output JSON only. Never claim a section is missing if any relevant text appears in the CV."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7
            )

            raw_text = response.choices[0].message.content.strip()
            try:
                logging.info("AI raw response (first 1000 chars): %s", raw_text[:1000])
            except Exception:
                pass

            # استخراج JSON من النص
            import json
            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                import re
                match = re.search(r"\{[\s\S]*\}", raw_text)
                data = json.loads(match.group(0)) if match else {"summary": raw_text}

            # Add document type to response
            data["documentType"] = "CV"
            
            # إضافة بيانات التواصل لو مش موجودة
            name, email, phone = self._extract_contacts(cv_text)
            data.setdefault("name", name)
            data.setdefault("email", email)
            data.setdefault("phone", phone)

            # Ensure weaknesses mirror improvements if needed
            if not data.get("weaknesses") and data.get("improvements"):
                data["weaknesses"] = data["improvements"]

            return {"success": True, "result": data}
        except Exception as e:
            logging.exception("analyze_cv failed; returning safe empty structure")
            empty = {
                "documentType": "CV",
                "name": "",
                "email": "",
                "phone": "",
                "summary": "",
                "skills": [],
                "experience": [],
                "education": [],
                "strengths": [],
                "improvements": [],
                "weaknesses": [],
                "atsScore": 0,
                "overallScore": 0,
            }
            return {"success": True, "result": empty}

cv_analyzer = CVAnalyzer()

# ---------------------- ROUTES ---------------------- #
@app.route('/')
def home():
    return jsonify({
        "message": "✅ CV Analyzer API is running using OpenAI!",
        "usage": "POST /analyze with {'cv_text': 'your resume text'}"
    })

@app.route('/analyze', methods=['POST'])
def analyze_endpoint():
    try:
        data = request.get_json()
        if not data or "cv_text" not in data:
            return jsonify({"success": False, "error": "Missing cv_text field"}), 400

        result = cv_analyzer.analyze_cv(data["cv_text"])
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---------------------- RUN ---------------------- #
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5005, debug=True)