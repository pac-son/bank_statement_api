import os
import time
from celery import Celery
import pdfplumber
import pytesseract
from cv2 import cv2

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

celery_app = Celery("worker", broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

@celery_app.task(name="parse_statement_task")
def parse_statement_task(file_path: str, filename: str):
    # Simulate processing time
    time.sleep(2)
    
    # 1. Detect file type (PDF vs Image)
    is_pdf = filename.lower().endswith(".pdf")
    
    extracted_text = ""
    
    try:
        if is_pdf:
            # 2. Native PDF extraction attempt
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    extracted_text += page.extract_text() + "\n"
            
            # If no text found, it might be a scanned PDF
            if not extracted_text.strip():
                extracted_text = "Fallback to OCR for scanned PDF (Requires pdf2image in MVP)"
                
        else:
            # 3. Image OCR fallback
            img = cv2.imread(file_path)
            # Preprocessing (grayscale, deskew) goes here
            extracted_text = pytesseract.image_to_string(img)
            
        # 4. Bank Classification and Parsing
        # (This is where you'd route to gtbank.py, access.py based on keywords in extracted_text)
        
        bank_identified = "Unknown"
        if "GUARANTY TRUST" in extracted_text.upper():
            bank_identified = "GTBank"
        elif "ACCESS BANK" in extracted_text.upper():
            bank_identified = "Access Bank"
        elif "UBA" in extracted_text.upper() or "UNITED BANK FOR AFRICA" in extracted_text.upper():
            bank_identified = "UBA"
            
        # 5. Extract structured data (Mocked for MVP)
        transactions = []
        summary = {
            "total_income": 0,
            "total_expenses": 0,
            "average_balance": 0
        }
        
        return {
            "status": "success",
            "bank": bank_identified,
            "text_length": len(extracted_text),
            "summary": summary,
            "transactions": transactions
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e)
        }
