import os
import shutil
import uuid
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import pdfplumber
import pytesseract
from PIL import Image

from .parsers.gtbank import GTBankParser
from .parsers.access import AccessBankParser
from .parsers.uba import UBAParser

app = FastAPI(title="Bank Statement Extraction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory / local task store
jobs_db: Dict[str, Dict[str, Any]] = {}

def find_tesseract_path():
    possible_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Users\Admin\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
        shutil.which("tesseract")
    ]
    for p in possible_paths:
        if p and os.path.exists(p):
            return p
    return None

tess_path = find_tesseract_path()
if tess_path:
    pytesseract.pytesseract.tesseract_cmd = tess_path

def process_file_background(job_id: str, file_path: str, filename: str, password: Optional[str] = None):
    jobs_db[job_id]["status"] = "processing"
    try:
        is_pdf = filename.lower().endswith(".pdf")
        extracted_text = ""
        
        if is_pdf:
            try:
                with pdfplumber.open(file_path, password=password or "") as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            extracted_text += text + "\n"
                            
                # Fallback to OCR if scanned/no text
                if not extracted_text.strip():
                    try:
                        with pdfplumber.open(file_path, password=password or "") as pdf:
                            for page in pdf.pages:
                                img = page.to_image(resolution=200).original
                                ocr_text = pytesseract.image_to_string(img)
                                extracted_text += ocr_text + "\n"
                    except Exception as ocr_err:
                        print(f"OCR error: {ocr_err}")
            except Exception as pdf_err:
                err_msg = str(pdf_err)
                if "password" in err_msg.lower() or "pdfpassword" in str(type(pdf_err)).lower():
                    jobs_db[job_id] = {
                        "status": "failed",
                        "error": "This PDF is password-protected. Please enter the password to unlock it."
                    }
                    return
                else:
                    raise pdf_err
        else:
            # Scanned image (PNG, JPG, TIFF)
            try:
                img = Image.open(file_path)
                extracted_text = pytesseract.image_to_string(img)
            except Exception as ocr_err:
                print(f"Image OCR error: {ocr_err}")

        # Bank Classification
        upper_text = extracted_text.upper()
        bank_name = "Unknown"
        parser = None

        if "GUARANTY TRUST" in upper_text or "GTBANK" in upper_text:
            bank_name = "GTBank"
            parser = GTBankParser(extracted_text)
        elif "ACCESS BANK" in upper_text:
            bank_name = "Access Bank"
            parser = AccessBankParser(extracted_text)
        elif "UBA" in upper_text or "UNITED BANK FOR AFRICA" in upper_text:
            bank_name = "UBA"
            parser = UBAParser(extracted_text)
        else:
            # Fallback default parser
            parser = GTBankParser(extracted_text)

        transactions = parser.extract_transactions() if parser else []

        total_income = sum(t.get("credit", 0.0) for t in transactions)
        total_expenses = sum(t.get("debit", 0.0) for t in transactions)
        balances = [t.get("balance", 0.0) for t in transactions if "balance" in t]
        avg_balance = (sum(balances) / len(balances)) if balances else 0.0

        summary = {
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "net_cashflow": round(total_income - total_expenses, 2),
            "average_balance": round(avg_balance, 2),
            "transaction_count": len(transactions)
        }

        jobs_db[job_id] = {
            "status": "completed",
            "bank": bank_name,
            "filename": filename,
            "summary": summary,
            "transactions": transactions,
            "raw_text_preview": extracted_text[:500] if extracted_text else ""
        }
    except Exception as e:
        jobs_db[job_id] = {
            "status": "failed",
            "error": str(e) or "An error occurred during extraction."
        }

@app.get("/")
def read_root():
    return {"message": "Bank Statement Extraction API (Local Mode)"}

@app.post("/statements/upload")
async def upload_statement(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    password: Optional[str] = Form(None)
):
    job_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    saved_filename = f"{job_id}{file_ext}"
    dest_path = os.path.join(UPLOAD_DIR, saved_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    jobs_db[job_id] = {
        "status": "pending",
        "filename": file.filename
    }
    
    background_tasks.add_task(process_file_background, job_id, dest_path, file.filename, password)
    return {"job_id": job_id, "status": "pending", "message": "Statement upload accepted"}

@app.get("/statements/{job_id}")
def get_statement_status(job_id: str):
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_db[job_id]
