import re
from typing import List, Dict, Any, Optional

# Keywords for Nigerian betting platforms & high-risk outflows
BETTING_KEYWORDS = [
    r"\bBET9JA\b", r"\bSPORTYBET\b", r"\b1XBET\b", r"\bBETKING\b",
    r"\bMSPORT\b", r"\bNAIRABET\b", r"\bMERRYBET\b", r"\bBETWAY\b",
    r"\bBANG\s*BET\b", r"\bPARIPESA\b", r"\bBETANO\b"
]

SALARY_KEYWORDS = [
    r"\bSALARY\b", r"\bPAYROLL\b", r"\bSTIPEND\b", r"\bWAGES\b",
    r"\bMONTHLY\s*PAY\b", r"\bALLOWANCE\b"
]

def generate_credit_narrative(
    bank_name: str,
    summary: Dict[str, Any],
    loan_stacking: Dict[str, Any],
    transactions: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generates a structured, plain-English executive credit memo for loan officers.
    Includes income pattern modeling, gambling/behavioral risk assessment,
    loan-stacking synthesis, and an underwriting decision recommendation.
    """
    total_income = summary.get("total_income", 0.0)
    total_expenses = summary.get("total_expenses", 0.0)
    net_cashflow = summary.get("net_cashflow", 0.0)
    avg_balance = summary.get("average_balance", 0.0)
    tx_count = summary.get("transaction_count", 0)

    # 1. Analyze Income Stream Patterns (Salary vs Informal/Irregular)
    salary_txs = []
    betting_txs = []
    total_betting_spend = 0.0

    for tx in transactions:
        desc = tx.get("description", "").upper()
        credit = float(tx.get("credit", 0.0))
        debit = float(tx.get("debit", 0.0))

        # Check salary indications
        if credit > 0:
            for pat in SALARY_KEYWORDS:
                if re.search(pat, desc):
                    salary_txs.append(tx)
                    break

        # Check gambling / high-risk betting transactions
        if debit > 0:
            for pat in BETTING_KEYWORDS:
                if re.search(pat, desc):
                    betting_txs.append(tx)
                    total_betting_spend += debit
                    break

    # Determine income profile
    if len(salary_txs) > 0:
        income_profile = "Formal Salary Earner"
        income_narrative = (
            f"Borrower exhibits regular salary/payroll inflows ({len(salary_txs)} identified payroll deposits), "
            f"suggesting formal employment and predictable monthly cash flow."
        )
    elif total_income > 0:
        income_profile = "Informal / Business Revenue Inflow"
        income_narrative = (
            f"Borrower's inflows appear to be business, trading, or variable freelance deposits. "
            f"While there is aggregate monthly velocity of ₦{total_income:,.2f}, fixed salary patterns were not detected."
        )
    else:
        income_profile = "No Consistent Inflow"
        income_narrative = "No meaningful incoming credits were detected in the provided statement period."

    # 2. Gambling & Behavioral Risk Assessment
    betting_ratio = (total_betting_spend / total_income * 100) if total_income > 0 else 0.0
    if len(betting_txs) > 0:
        betting_narrative = (
            f"⚠️ Gambling/Betting activity detected across {len(betting_txs)} transactions totaling "
            f"₦{total_betting_spend:,.2f} ({betting_ratio:.1f}% of total inflows). "
            f"This represents an elevated behavioral risk factor."
        )
        betting_flag = True
    else:
        betting_narrative = "Clean behavioral profile: Zero betting or gambling-related outflows detected."
        betting_flag = False

    # 3. Cash Flow & Burn Rate Analysis
    burn_rate_pct = (total_expenses / total_income * 100) if total_income > 0 else 100.0
    if net_cashflow > 0 and burn_rate_pct < 75:
        cashflow_assessment = (
            f"Strong liquidity cushion: Borrower retains a positive monthly net cashflow of ₦{net_cashflow:,.2f} "
            f"with a healthy expense burn rate of {burn_rate_pct:.1f}%."
        )
        liquidity_status = "HEALTHY"
    elif net_cashflow >= 0:
        cashflow_assessment = (
            f"Tight margins: Operating cashflow is positive (₦{net_cashflow:,.2f}), but expenses consume "
            f"{burn_rate_pct:.1f}% of monthly income, leaving limited buffer for unexpected financial shocks."
        )
        liquidity_status = "MODERATE"
    else:
        cashflow_assessment = (
            f"Deficit cashflow: Expenses (₦{total_expenses:,.2f}) exceed recorded inflows (₦{total_income:,.2f}) "
            f"by ₦{abs(net_cashflow):,.2f}, pointing to balance depletion or reliance on external credit."
        )
        liquidity_status = "DEFICIT"

    # 4. Loan Stacking Synthesis
    stacking_risk = loan_stacking.get("risk_level", "LOW")
    unique_lenders = loan_stacking.get("unique_lenders_count", 0)
    total_repayments = loan_stacking.get("total_repayments", 0.0)
    dti = loan_stacking.get("debt_to_income_ratio", 0.0)

    if stacking_risk in ["CRITICAL", "HIGH"]:
        stacking_narrative = (
            f"🚨 CRITICAL ALERT: Borrower is servicing active debt across {unique_lenders} digital lenders "
            f"with monthly repayments of ₦{total_repayments:,.2f} ({dti:.1f}% DTI). Highly prone to loan stacking default."
        )
    elif stacking_risk == "MODERATE":
        stacking_narrative = (
            f"Moderate leverage: {unique_lenders} active lender repayment pattern detected "
            f"(₦{total_repayments:,.2f} monthly). Existing debt obligations must be factored into loan sizing."
        )
    else:
        stacking_narrative = "Zero active digital loan repayments or stacking behavior detected."

    # 5. Underwriting Recommendation & Safe Capacity Estimate
    # Safe loan installment should not exceed 33% of (Net Cashflow or disposable income)
    available_disposable = max(0.0, net_cashflow)
    max_safe_monthly_installment = round(available_disposable * 0.40, 2)
    max_loan_estimate = round(max_safe_monthly_installment * 3, 2)  # 3-month loan tenor

    if stacking_risk == "CRITICAL" or liquidity_status == "DEFICIT" or betting_ratio > 20:
        recommendation = "DECLINE / MANUAL REVIEW"
        recommendation_badge = "bg-rose-500/10 text-rose-400 border-rose-500/20"
        recommendation_reason = (
            "High default probability driven by severe debt stacking, negative net cashflow, or excessive speculative outflows."
        )
    elif stacking_risk == "HIGH" or burn_rate_pct > 85:
        recommendation = "APPROVE WITH CAUTION / REDUCE LIMIT"
        recommendation_badge = "bg-amber-500/10 text-amber-400 border-amber-500/20"
        recommendation_reason = (
            f"Borrower can service limited short-term credit, but loan ticket should be capped below ₦{max_loan_estimate:,.2f} "
            f"with an installment under ₦{max_safe_monthly_installment:,.2f}/month."
        )
    else:
        recommendation = "APPROVED"
        recommendation_badge = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        recommendation_reason = (
            f"Borrower demonstrates stable account management on {bank_name}. "
            f"Recommended safe loan ceiling is approximately ₦{max_loan_estimate:,.2f} with monthly installment capacity of ₦{max_safe_monthly_installment:,.2f}."
        )

    # Narrative Executive Summary paragraph for non-technical loan officers
    executive_summary = (
        f"This statement from {bank_name} contains {tx_count} verified transactions. "
        f"The borrower generates approximately ₦{total_income:,.2f} in total inflows against outflows of ₦{total_expenses:,.2f}, "
        f"yielding an average balance of ₦{avg_balance:,.2f}. {income_narrative} "
        f"{cashflow_assessment} {stacking_narrative} {betting_narrative}"
    )

    return {
        "recommendation": recommendation,
        "recommendation_badge": recommendation_badge,
        "recommendation_reason": recommendation_reason,
        "executive_summary": executive_summary,
        "income_profile": income_profile,
        "liquidity_status": liquidity_status,
        "burn_rate_percentage": round(burn_rate_pct, 1),
        "gambling_detected": betting_flag,
        "gambling_total_spend": round(total_betting_spend, 2),
        "recommended_max_loan_capacity": max_loan_estimate,
        "recommended_monthly_installment_cap": max_safe_monthly_installment
    }
