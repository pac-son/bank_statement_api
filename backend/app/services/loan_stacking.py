import re
from typing import List, Dict, Any, Set

# Comprehensive registry of known Nigerian digital lending apps, microfinance lenders, and loan keywords
NIGERIAN_LENDERS: Dict[str, List[str]] = {
    "Carbon / OneFi": [r"\bCARBON\b", r"\BONEFI\b", r"\bCARBON\s*LOAN\b", r"\bONEACCREDIT\b"],
    "FairMoney": [r"\bFAIRMONEY\b", r"\bFAIR\s*MONEY\b", r"\bMYFAIRMONEY\b"],
    "Branch International": [r"\bBRANCH\s*INT\b", r"\bBRANCH\s*LOAN\b", r"\bBRANCH\s*NIG\b"],
    "QuickCheck": [r"\bQUICKCHECK\b", r"\bQUICK\s*CHECK\b"],
    "Renmoney": [r"\bRENMONEY\b", r"\bREN\s*MONEY\b"],
    "Palmcredit / Newcredit": [r"\bPALMCREDIT\b", r"\bNEWCREDIT\b", r"\bEASYCREDIT\b", r"\bXCREDIT\b"],
    "Okash / EaseMoni (Blue Ridge MFB)": [r"\bOKASH\b", r"\bEASEMONI\b", r"\bBLUERIDGE\b", r"\bBLUE\s*RIDGE\b"],
    "Aella Credit": [r"\bAELLA\b", r"\bAELLA\s*APP\b", r"\bAELLACREDIT\b"],
    "Specta (Sterling)": [r"\bSPECTA\b", r"\bSPECTA\s*LOAN\b"],
    "Page Financials": [r"\bPAGE\s*FINANCIALS\b", r"\bPAGE\s*MFB\b"],
    "Kwikpay / Kwikcash": [r"\bKWIKPAY\b", r"\bKWIKCASH\b"],
    "Umba": [r"\bUMBA\b", r"\bUMBA\s*LOAN\b"],
    "Lidya": [r"\bLIDYA\b"],
    "Seedvest": [r"\bSEEDVEST\b"],
    "Creditville": [r"\bCREDITVILLE\b"],
    "Money in Minutes": [r"\bMONEYINMINUTES\b", r"\bMONEY\s*IN\s*MINUTES\b"],
    "KiaKia": [r"\bKIAKIA\b"],
    "FastCredit": [r"\bFASTCREDIT\b", r"\bFAST\s*CREDIT\b"],
    "Zedvance": [r"\bZEDVANCE\b"]
}

# Generic loan repayment / disbursement patterns
GENERIC_LOAN_KEYWORDS = [
    r"\bLOAN\s*REPAYMENT\b",
    r"\bLOAN\s*RECOVERY\b",
    r"\bLOAN\s*DISBURSEMENT\b",
    r"\bLOAN\s*PMT\b",
    r"\bAUTO\s*DEBIT\s*LOAN\b",
    r"\bPAYOFF\s*LOAN\b"
]

def analyze_loan_stacking(transactions: List[Dict[str, Any]], total_income: float) -> Dict[str, Any]:
    """
    Analyzes transaction narrations to detect multiple active digital lenders,
    total monthly debt servicing outflows, and computes loan-stacking risk.
    """
    detected_lenders: Dict[str, Dict[str, Any]] = {}
    flagged_transactions: List[Dict[str, Any]] = []
    total_repayments = 0.0
    total_disbursements = 0.0

    for tx in transactions:
        desc = tx.get("description", "").upper()
        debit = float(tx.get("debit", 0.0))
        credit = float(tx.get("credit", 0.0))
        matched_lender_name = None

        # Check against dictionary of specific Nigerian lenders
        for lender_name, patterns in NIGERIAN_LENDERS.items():
            for pat in patterns:
                if re.search(pat, desc):
                    matched_lender_name = lender_name
                    break
            if matched_lender_name:
                break

        # If not in named list, check for generic loan repayment/disbursement keywords
        if not matched_lender_name:
            for pat in GENERIC_LOAN_KEYWORDS:
                if re.search(pat, desc):
                    matched_lender_name = "Other Digital Lender / Unnamed"
                    break

        if matched_lender_name:
            if matched_lender_name not in detected_lenders:
                detected_lenders[matched_lender_name] = {
                    "lender": matched_lender_name,
                    "repayment_count": 0,
                    "total_repaid": 0.0,
                    "disbursement_count": 0,
                    "total_disbursed": 0.0
                }

            is_repayment = debit > 0
            is_disbursement = credit > 0

            if is_repayment:
                detected_lenders[matched_lender_name]["repayment_count"] += 1
                detected_lenders[matched_lender_name]["total_repaid"] += debit
                total_repayments += debit
            elif is_disbursement:
                detected_lenders[matched_lender_name]["disbursement_count"] += 1
                detected_lenders[matched_lender_name]["total_disbursed"] += credit
                total_disbursements += credit

            flagged_transactions.append({
                "date": tx.get("date"),
                "description": tx.get("description"),
                "lender": matched_lender_name,
                "type": "repayment" if is_repayment else "disbursement",
                "amount": debit if is_repayment else credit
            })

    unique_lenders_count = len(detected_lenders)
    dti_percentage = (total_repayments / total_income * 100) if total_income > 0 else 0.0

    # Risk level classification
    # 0 lenders: LOW
    # 1 lender: MODERATE (normal single loan)
    # 2 lenders: HIGH (loan stacking warning)
    # 3+ lenders or DTI > 40%: CRITICAL (severe stacking / distressed borrower)
    if unique_lenders_count == 0:
        risk_level = "LOW"
        risk_description = "No digital loan repayments or stacking behavior detected."
    elif unique_lenders_count == 1 and dti_percentage < 30:
        risk_level = "MODERATE"
        risk_description = "Single lender detected with manageable debt servicing."
    elif unique_lenders_count == 2 or (unique_lenders_count == 1 and dti_percentage >= 30):
        risk_level = "HIGH"
        risk_description = f"Borrower is servicing {unique_lenders_count} distinct lenders with elevated repayment obligations."
    else:
        risk_level = "CRITICAL"
        risk_description = f"Severe loan stacking detected across {unique_lenders_count} different digital lenders! High probability of default/refinancing spiral."

    return {
        "risk_level": risk_level,
        "risk_description": risk_description,
        "unique_lenders_count": unique_lenders_count,
        "total_repayments": round(total_repayments, 2),
        "total_disbursements": round(total_disbursements, 2),
        "debt_to_income_ratio": round(dti_percentage, 1),
        "lenders_breakdown": list(detected_lenders.values()),
        "flagged_transactions": flagged_transactions
    }
