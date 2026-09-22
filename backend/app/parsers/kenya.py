import re
from typing import List, Dict, Any
from .base import BaseParser

class KenyaEquityParser(BaseParser):
    """
    Parser for Equity Bank Kenya, KCB (Kenya Commercial Bank) and M-PESA statement exports.
    Layout typically includes:
    Receipt / Trans Date | Details / Particulars | Paid Out (KES) | Paid In (KES) | Balance (KES)
    """
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        
        # Kenyan / M-PESA date formats: YYYY-MM-DD HH:MM:SS, DD/MM/YYYY, or DD-MMM-YYYY
        date_pattern = re.compile(r"(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?|\d{2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            match = date_pattern.search(line_str)
            if match:
                date_str = match.group(1)
                upper = line_str.upper()

                line_no_date = line_str.replace(date_str, "")
                # Kenyan Shilling (KES) figures with standard comma separators
                amount_matches = re.findall(r"\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b", line_no_date)
                
                amounts = []
                for a in amount_matches:
                    clean = a.replace(",", "")
                    try:
                        val = float(clean)
                        amounts.append(val)
                    except ValueError:
                        pass

                if amounts:
                    balance = amounts[-1] if len(amounts) > 1 else 0.0
                    amount = amounts[0] if len(amounts) > 1 else 0.0

                    is_credit = "PAID IN" in upper or "CR" in upper or "+" in line_str or "RECEIVED" in upper or "FUNDS RECEIVED" in upper
                    is_debit = "PAID OUT" in upper or "DR" in upper or "-" in line_str or "SENT TO" in upper or "PAYBILL" in upper or "BUY GOODS" in upper

                    desc = line_no_date
                    for a in amount_matches:
                        desc = desc.replace(a, "")
                    desc = re.sub(r"\b(KES|KSH|DR|CR)\b", "", desc, flags=re.IGNORECASE)
                    desc = re.sub(r"\s+", " ", desc).strip() or "Kenya Bank / M-PESA Transaction"

                    transactions.append({
                        "date": date_str,
                        "description": desc,
                        "currency": "KES",
                        "debit": amount if is_debit and not is_credit else 0.0,
                        "credit": amount if is_credit else (0.0 if is_debit else amount),
                        "balance": balance
                    })

        return transactions
