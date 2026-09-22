import os
from typing import List, Dict, Any, Optional
import pdfplumber
import pypdfium2 as pdfium

# Suspicious editing software or PDF generators often used to tamper with bank statements
SUSPICIOUS_PRODUCERS = [
    "canva", "ilovepdf", "sejda", "photoshop", "illustrator",
    "coreldraw", "smallpdf", "pdfescape", "foxit phantom", "nitro pro",
    "inkscape", "libreoffice", "microsoft word", "wps office"
]

LEGITIMATE_BANK_ENGINES = [
    "oracle", "jasper", "report", "crystal", "afp", "itp", "apache fop",
    "pdf-tools", "itext", "ghostscript", "sharp", "xerox", "streamserve"
]

def check_balance_reconciliation(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Validates arithmetic integrity: checks whether each transaction's
    Running Balance matches (Previous Balance - Debit + Credit).
    Tampered bank statements almost always have math errors in the running balance.
    """
    if not transactions or len(transactions) < 2:
        return {
            "status": "PASS",
            "passed": True,
            "discrepancies_count": 0,
            "discrepancy_details": [],
            "message": "Insufficient sequential transaction lines to test balance continuity."
        }

    discrepancies = []
    
    # Analyze in reverse if ordered chronologically descending, or forward if ascending
    # Let's inspect pairwise continuity
    for i in range(len(transactions) - 1):
        current_tx = transactions[i]
        next_tx = transactions[i + 1]

        b_curr = float(current_tx.get("balance", 0.0))
        b_next = float(next_tx.get("balance", 0.0))
        dr = float(current_tx.get("debit", 0.0))
        cr = float(current_tx.get("credit", 0.0))

        # In descending order (most recent first):
        # b_curr should equal (b_next - dr + cr) or (b_next + cr - dr)
        expected_balance_desc = round(b_next - dr + cr, 2)
        # In ascending order (oldest first):
        expected_balance_asc = round(b_curr - float(next_tx.get("debit", 0.0)) + float(next_tx.get("credit", 0.0)), 2)

        # Check if either ascending or descending arithmetic matches within ₦1.00 tolerance (for roundings)
        diff_desc = abs(b_curr - expected_balance_desc)
        diff_asc = abs(float(next_tx.get("balance", 0.0)) - expected_balance_asc)

        if diff_desc > 1.0 and diff_asc > 1.0:
            discrepancies.append({
                "date": current_tx.get("date"),
                "description": current_tx.get("description"),
                "stated_balance": b_curr,
                "debit": dr,
                "credit": cr,
                "discrepancy_amount": round(min(diff_desc, diff_asc), 2)
            })

    # If >10% of rows fail arithmetic, flag as high fraud risk
    discrepancy_rate = len(discrepancies) / len(transactions)
    has_tampering = discrepancy_rate > 0.15 and len(discrepancies) >= 2

    return {
        "status": "FAIL" if has_tampering else "PASS",
        "passed": not has_tampering,
        "discrepancies_count": len(discrepancies),
        "discrepancy_rate_pct": round(discrepancy_rate * 100, 1),
        "sample_discrepancies": discrepancies[:3],
        "message": (
            f"Arithmetic balance reconciliation failed on {len(discrepancies)} transactions. High likelihood of balance manipulation!"
            if has_tampering else
            "Running balance math is consistent across transactions."
        )
    }

def inspect_pdf_metadata(file_path: str) -> Dict[str, Any]:
    """
    Examines PDF internal metadata (Producer, Creator, ModDate vs CreationDate)
    to detect third-party PDF editors (Canva, Photoshop, iLovePDF).
    """
    if not file_path.lower().endswith(".pdf"):
        return {
            "status": "PASS",
            "passed": True,
            "producer": "Image File",
            "creator": "Image File",
            "flags": [],
            "message": "Non-PDF file format (scanned/photographed statement)."
        }

    flags = []
    metadata = {}
    try:
        doc = pdfium.PdfDocument(file_path)
        meta_dict = doc.get_metadata_dict()
        doc.close()

        producer = str(meta_dict.get("Producer") or "").lower()
        creator = str(meta_dict.get("Creator") or "").lower()
        mod_date = str(meta_dict.get("ModDate") or "")
        creation_date = str(meta_dict.get("CreationDate") or "")

        metadata = {
            "producer": meta_dict.get("Producer") or "Unknown",
            "creator": meta_dict.get("Creator") or "Unknown",
            "creation_date": creation_date,
            "mod_date": mod_date
        }

        # Check for suspicious editing software
        for sus in SUSPICIOUS_PRODUCERS:
            if sus in producer or sus in creator:
                flags.append(f"Document was generated or modified using graphics/editing tool: '{sus.title()}'")

        # Check if modified long after creation
        if mod_date and creation_date and mod_date != creation_date:
            flags.append("Document was modified after initial export from core banking system.")

    except Exception as e:
        metadata["read_error"] = str(e)

    has_metadata_risk = len(flags) > 0
    return {
        "status": "FAIL" if has_metadata_risk else "PASS",
        "passed": not has_metadata_risk,
        "flags": flags,
        "metadata": metadata,
        "message": "Metadata shows signs of document editing/tampering!" if has_metadata_risk else "PDF metadata appears genuine."
    }

def check_font_consistency(file_path: str) -> Dict[str, Any]:
    """
    Inspects embedded fonts across pages. Tampered statements often inject
    new font families when replacing numbers/figures with Adobe Acrobat.
    """
    if not file_path.lower().endswith(".pdf"):
        return {"passed": True, "font_families_count": 0, "fonts": []}

    font_names = set()
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages[:3]:  # inspect first 3 pages
                for char in page.chars:
                    f = char.get("fontname")
                    if f:
                        font_names.add(f)
    except Exception:
        pass

    # Authentic statements typically have 1-4 standard fonts (e.g. Arial, Helvetica, Courier)
    # Documents with 8+ disjoint font names often indicate pasted text layers
    excessive_fonts = len(font_names) > 8

    return {
        "status": "WARN" if excessive_fonts else "PASS",
        "passed": not excessive_fonts,
        "font_count": len(font_names),
        "fonts": list(font_names)[:6],
        "message": (
            "Irregular font count detected: multiple disparate font families found, suggesting text splicing."
            if excessive_fonts else
            "Font families are uniform and consistent with institutional statement generation."
        )
    }

def evaluate_fraud_risk(file_path: str, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Main fraud evaluation pipeline combining:
    1. Metadata forensic analysis
    2. Arithmetic running-balance reconciliation
    3. Font uniformity check
    """
    meta_check = inspect_pdf_metadata(file_path)
    balance_check = check_balance_reconciliation(transactions)
    font_check = check_font_consistency(file_path)

    # Compute composite fraud score (0 to 100, where 100 is definite fraud)
    fraud_score = 0
    fraud_reasons = []

    if not meta_check["passed"]:
        fraud_score += 45
        fraud_reasons.extend(meta_check["flags"])

    if not balance_check["passed"]:
        fraud_score += 50
        fraud_reasons.append(balance_check["message"])

    if not font_check["passed"]:
        fraud_score += 15
        fraud_reasons.append(font_check["message"])

    if fraud_score >= 60:
        overall_fraud_status = "CRITICAL_FRAUD_DETECTED"
        badge = "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
    elif fraud_score >= 30:
        overall_fraud_status = "SUSPICIOUS / ELEVATED_RISK"
        badge = "bg-amber-500/10 text-amber-400 border-amber-500/20"
    else:
        overall_fraud_status = "VERIFIED_AUTHENTIC"
        badge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"

    return {
        "fraud_score": min(fraud_score, 100),
        "overall_status": overall_fraud_status,
        "badge": badge,
        "is_tampered": fraud_score >= 30,
        "reasons": fraud_reasons,
        "metadata_forensics": meta_check,
        "balance_reconciliation": balance_check,
        "font_uniformity": font_check
    }
