#!/usr/bin/env python3
"""Test if all required dependencies are installed for enhance_api.py"""
import sys

deps = {
    'flask': 'Flask web framework',
    'flask_cors': 'Flask CORS support',
    'openai': 'OpenAI Python SDK',
    'reportlab': 'PDF generation library',
    'pdfplumber': 'PDF text extraction',
    'docx': 'DOCX/Word document support (python-docx)',
    'dotenv': 'Environment variable loading (python-dotenv)',
}

print("Checking dependencies for enhance_api.py...\n")
missing = []

for module, description in deps.items():
    try:
        __import__(module)
        print(f"✓ {module:15} - {description}")
    except ImportError as e:
        print(f"✗ {module:15} - MISSING: {description}")
        missing.append(module)

print("\n" + "="*60)
if missing:
    print(f"Missing {len(missing)} dependency(ies): {', '.join(missing)}")
    print(f"\nRun: python -m pip install {' '.join(missing)}")
    sys.exit(1)
else:
    print("✓ All dependencies installed successfully!")
    print("\nYou can now start the server:")
    print("  python enhance_api.py")

