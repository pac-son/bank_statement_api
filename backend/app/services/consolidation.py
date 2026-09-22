from typing import Optional
from datetime import datetime
import re
from .loan_stacking import analyze_loan_stacking
from .narrative_summary import generate_credit_narrative

def parse_date_lenient(date_str: str) -> Optional[datetime]:
    clean_date = date_str.strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d-%b-%Y",
        "%d %b %Y",
        "%d/%b/%Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean_date[:19].strip(), fmt)
        except (ValueError, TypeError):
            continue
    return None

def consolidate_statements(account_results: list) -> dict:
    if not account_results:
        return {}

    all_raw_transactions = []
    accounts_overview = []
    
    for idx, acc in enumerate(account_results):
        bank = acc.get("bank", f"Account #{idx+1}")
        txs = acc.get("transactions", [])
        summary = acc.get("summary", {})
        
        accounts_overview.append({
            "account_index": idx + 1,
            "bank": bank,
            "filename": acc.get("filename"),
            "transaction_count": len(txs),
            "total_income": summary.get("total_income", 0.0),
            "total_expenses": summary.get("total_expenses", 0.0),
            "average_balance": summary.get("average_balance", 0.0)
        })

        for tx in txs:
            tx_copy = dict(tx)
            tx_copy["source_bank"] = bank
            tx_copy["account_id"] = idx + 1
            all_raw_transactions.append(tx_copy)

    self_transfers = []
    cleaned_transactions = []
    matched_credit_indices = set()
    deduped_volume = 0.0

    for i, debit_tx in enumerate(all_raw_transactions):
        debit_amt = float(debit_tx.get("debit", 0.0))
        if debit_amt <= 0:
            continue

        date_debit = parse_date_lenient(str(debit_tx.get("date", "")))
        paired = False

        for j, credit_tx in enumerate(all_raw_transactions):
            if j in matched_credit_indices:
                continue
            if debit_tx.get("account_id") == credit_tx.get("account_id"):
                continue

            credit_amt = float(credit_tx.get("credit", 0.0))
            if abs(debit_amt - credit_amt) < 0.01:
                date_credit = parse_date_lenient(str(credit_tx.get("date", "")))
                close_in_time = True
                if date_debit and date_credit:
                    close_in_time = abs((date_debit - date_credit).total_seconds()) <= 172800

                if close_in_time:
                    matched_credit_indices.add(j)
                    self_transfers.append({
                        "amount": debit_amt,
                        "from_account": debit_tx.get("source_bank"),
                        "to_account": credit_tx.get("source_bank"),
                        "debit_description": debit_tx.get("description"),
                        "credit_description": credit_tx.get("description"),
                        "date": debit_tx.get("date")
                    })
                    deduped_volume += debit_amt
                    paired = True
                    break

        if not paired:
            cleaned_transactions.append(debit_tx)

    for j, tx in enumerate(all_raw_transactions):
        if float(tx.get("credit", 0.0)) > 0 and j not in matched_credit_indices:
            cleaned_transactions.append(tx)

    try:
        cleaned_transactions.sort(key=lambda x: parse_date_lenient(str(x.get("date", ""))) or datetime.min, reverse=True)
    except Exception:
        pass

    consolidated_income = sum(float(t.get("credit", 0.0)) for t in cleaned_transactions)
    consolidated_expenses = sum(float(t.get("debit", 0.0)) for t in cleaned_transactions)
    consolidated_net_cashflow = round(consolidated_income - consolidated_expenses, 2)
    combined_avg_balance = sum(acc.get("average_balance", 0.0) for acc in accounts_overview)

    consolidated_summary = {
        "total_income": round(consolidated_income, 2),
        "total_expenses": round(consolidated_expenses, 2),
        "net_cashflow": consolidated_net_cashflow,
        "combined_average_balance": round(combined_avg_balance, 2),
        "total_accounts_count": len(accounts_overview),
        "total_transactions_count": len(all_raw_transactions),
        "self_transfers_deduped_count": len(self_transfers),
        "self_transfers_volume_deduped": round(deduped_volume, 2)
    }

    consolidated_loan_stacking = analyze_loan_stacking(cleaned_transactions, consolidated_income)

    account_names = " + ".join([a["bank"] for a in accounts_overview])
    consolidated_narrative = generate_credit_narrative(
        f"Consolidated ({account_names})",
        {
            "total_income": consolidated_income,
            "total_expenses": consolidated_expenses,
            "net_cashflow": consolidated_net_cashflow,
            "average_balance": combined_avg_balance,
            "transaction_count": len(cleaned_transactions)
        },
        consolidated_loan_stacking,
        cleaned_transactions
    )

    return {
        "status": "completed",
        "accounts_overview": accounts_overview,
        "consolidated_summary": consolidated_summary,
        "self_transfers_detected": self_transfers,
        "consolidated_loan_stacking": consolidated_loan_stacking,
        "consolidated_credit_narrative": consolidated_narrative,
        "consolidated_transactions": cleaned_transactions[:150]
    }
