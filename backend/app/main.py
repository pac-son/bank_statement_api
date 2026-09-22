import os
import re
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
from .parsers.opay import OPayParser
from .parsers.palmpay import PalmPayParser
from .parsers.kuda import KudaParser
from .parsers.moniepoint import MoniepointParser
from .parsers.ghana import GhanaCBGParser
from .parsers.kenya import KenyaEquityParser

from .services.loan_stacking import analyze_loan_stacking
from .services.narrative_summary import generate_credit_narrative
from .services.consolidation import consolidate_statements
from .services.fraud_detector import evaluate_fraud_risk
from .services.webhook import dispatch_webhook_notification

app = FastAPI(title="Bank Statement Extraction & Credit Scoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

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

def classify_and_parse(extracted_text: str):
    upper_text = extracted_text.upper()
    
    # 1. Multi-Country: Kenya (Equity, KCB, M-PESA, Safaricom)
    if any(k in upper_text for k in ["EQUITY BANK", "KCB", "M-PESA", "MPESA", "SAFARICOM", "KENYA COMMERCIAL"]):
        return "Equity Bank / Kenya M-PESA", KenyaEquityParser(extracted_text), "KES"
        
    # 2. Multi-Country: Ghana (Consolidated Bank Ghana, GCB, Ecobank Ghana, Fidelity Ghana)
    elif any(g in upper_text for g in ["GHANA", "CBG", "CONSOLIDATED BANK", "GCB BANK", "CALBANK", "GHS"]):
        return "Consolidated Bank Ghana (CBG)", GhanaCBGParser(extracted_text), "GHS"

    # 3. Nigeria: Traditional Commercial Banks
    elif "GUARANTY TRUST" in upper_text or bool(re.search(r"\bGTBANK\b", upper_text)):
        return "GTBank", GTBankParser(extracted_text), "NGN"
    elif "ACCESS BANK" in upper_text:
        return "Access Bank", AccessBankParser(extracted_text), "NGN"
    elif "UNITED BANK FOR AFRICA" in upper_text or "AFRICA'S GLOBAL BANK" in upper_text or bool(re.search(r"\bUBA\b", upper_text)):
        return "UBA", UBAParser(extracted_text), "NGN"
        
    # 4. Nigeria: Neobanks & Digital Wallets
    elif bool(re.search(r"\bOPAY\b", upper_text)):
        return "OPay", OPayParser(extracted_text), "NGN"
    elif bool(re.search(r"\bPALMPAY\b", upper_text)):
        return "PalmPay", PalmPayParser(extracted_text), "NGN"
    elif bool(re.search(r"\bKUDA\b", upper_text)):
        return "Kuda Bank", KudaParser(extracted_text), "NGN"
    elif bool(re.search(r"\bMONIEPOINT\b", upper_text)):
        return "Moniepoint MFB", MoniepointParser(extracted_text), "NGN"
        
    return "Unknown Bank / Generic", GTBankParser(extracted_text), "NGN"

def parse_single_file_sync(file_path: str, filename: str, password: Optional[str] = None) -> Dict[str, Any]:
    is_pdf = filename.lower().endswith(".pdf")
    extracted_text = ""
    
    if is_pdf:
        try:
            with pdfplumber.open(file_path, password=password or "") as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        extracted_text += text + "\n"
                        
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
            err_str = f"{repr(pdf_err)} {str(pdf_err)} {getattr(pdf_err, 'args', '')}".lower()
            if "password" in err_str:
                return {
                    "error": f"File '{filename}' is password-protected. Please enter your PDF statement password in the password field to unlock it."
                }
            raise pdf_err
    else:
        try:
            img = Image.open(file_path)
            extracted_text = pytesseract.image_to_string(img)
        except Exception as ocr_err:
            print(f"Image OCR error: {ocr_err}")

    bank_name, parser, currency = classify_and_parse(extracted_text)
    transactions = parser.extract_transactions() if parser else []

    # Tag currency to transactions
    for t in transactions:
        t["currency"] = currency

    total_income = sum(t.get("credit", 0.0) for t in transactions)
    total_expenses = sum(t.get("debit", 0.0) for t in transactions)
    balances = [t.get("balance", 0.0) for t in transactions if "balance" in t]
    avg_balance = (sum(balances) / len(balances)) if balances else 0.0

    summary = {
        "currency": currency,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "net_cashflow": round(total_income - total_expenses, 2),
        "average_balance": round(avg_balance, 2),
        "transaction_count": len(transactions)
    }

    loan_stacking = analyze_loan_stacking(transactions, total_income)
    fraud_evaluation = evaluate_fraud_risk(file_path, transactions)
    credit_narrative = generate_credit_narrative(bank_name, summary, loan_stacking, transactions)

    return {
        "status": "completed",
        "bank": bank_name,
        "currency": currency,
        "filename": filename,
        "summary": summary,
        "loan_stacking": loan_stacking,
        "fraud_evaluation": fraud_evaluation,
        "credit_narrative": credit_narrative,
        "transactions": transactions,
        "raw_text_preview": extracted_text[:300] if extracted_text else ""
    }

def process_file_background(
    job_id: str,
    file_path: str,
    filename: str,
    password: Optional[str] = None,
    webhook_url: Optional[str] = None
):
    jobs_db[job_id]["status"] = "processing"
    try:
        res = parse_single_file_sync(file_path, filename, password)
        if "error" in res:
            jobs_db[job_id] = {"status": "failed", "error": res["error"]}
        else:
            jobs_db[job_id] = res
            if webhook_url:
                dispatch_webhook_notification(webhook_url, "statement.completed", job_id, res)
    except Exception as e:
        jobs_db[job_id] = {"status": "failed", "error": str(e) or "An error occurred during extraction."}
        if webhook_url:
            dispatch_webhook_notification(webhook_url, "statement.failed", job_id, {"error": str(e)})

def process_multi_files_background(
    job_id: str,
    file_tuples: List[tuple],
    webhook_url: Optional[str] = None
):
    jobs_db[job_id]["status"] = "processing"
    try:
        account_results = []
        overall_fraud_list = []

        for file_path, filename, password in file_tuples:
            res = parse_single_file_sync(file_path, filename, password)
            if "error" in res:
                jobs_db[job_id] = {"status": "failed", "error": res["error"]}
                if webhook_url:
                    dispatch_webhook_notification(webhook_url, "statement.failed", job_id, {"error": res["error"]})
                return
            account_results.append(res)
            if "fraud_evaluation" in res:
                overall_fraud_list.append({
                    "filename": filename,
                    "bank": res.get("bank"),
                    **res["fraud_evaluation"]
                })

        consolidated_data = consolidate_statements(account_results)
        max_fraud_score = max([f.get("fraud_score", 0) for f in overall_fraud_list], default=0)
        consolidated_fraud = {
            "max_fraud_score": max_fraud_score,
            "is_tampered": max_fraud_score >= 30,
            "files_breakdown": overall_fraud_list
        }

        final_res = {
            "status": "completed",
            "is_consolidated": True,
            "consolidated_fraud": consolidated_fraud,
            **consolidated_data
        }
        jobs_db[job_id] = final_res

        if webhook_url:
            dispatch_webhook_notification(webhook_url, "statement.consolidated", job_id, final_res)

    except Exception as e:
        jobs_db[job_id] = {"status": "failed", "error": str(e) or "Error consolidating statements."}
        if webhook_url:
            dispatch_webhook_notification(webhook_url, "statement.failed", job_id, {"error": str(e)})

@app.get("/")
def read_root():
    return {"message": "Bank Statement Extraction & Credit Scoring API (Multi-Country: Nigeria, Ghana, Kenya)"}

@app.post("/statements/upload")
async def upload_statement(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    webhook_url: Optional[str] = Form(None)
):
    job_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    saved_filename = f"{job_id}{file_ext}"
    dest_path = os.path.join(UPLOAD_DIR, saved_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    jobs_db[job_id] = {
        "status": "pending",
        "filename": file.filename,
        "webhook_url": webhook_url
    }
    
    background_tasks.add_task(process_file_background, job_id, dest_path, file.filename, password, webhook_url)
    return {"job_id": job_id, "status": "pending", "message": "Statement upload accepted"}

@app.post("/statements/consolidate")
async def upload_multiple_statements(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    passwords: Optional[str] = Form(None),
    webhook_url: Optional[str] = Form(None)
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 bank statements to consolidate.")
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 bank statements can be consolidated at once.")

    job_id = str(uuid.uuid4())
    pwd_list = [p.strip() for p in (passwords.split(",") if passwords else [])]

    file_tuples = []
    for idx, f in enumerate(files):
        file_ext = os.path.splitext(f.filename)[1]
        saved_filename = f"{job_id}_{idx}{file_ext}"
        dest_path = os.path.join(UPLOAD_DIR, saved_filename)
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        pwd = pwd_list[idx] if idx < len(pwd_list) else None
        file_tuples.append((dest_path, f.filename, pwd))

    jobs_db[job_id] = {
        "status": "pending",
        "is_consolidated": True,
        "files_count": len(files),
        "webhook_url": webhook_url
    }

    background_tasks.add_task(process_multi_files_background, job_id, file_tuples, webhook_url)
    return {"job_id": job_id, "status": "pending", "message": "Consolidation job accepted"}

@app.get("/statements/{job_id}")
def get_statement_status(job_id: str):
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_db[job_id]
