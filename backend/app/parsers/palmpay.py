import re
from typing import List, Dict, Any
from .base import BaseParser

class PalmPayParser(BaseParser):
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        date_pattern = re.compile(r"(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            match = date_pattern.search(line_str)
            if match:
                date_str = match.group(1)
                upper = line_str.upper()

                is_credit = "+" in line_str or "TRANSFER IN" in upper or "CREDIT" in upper or "REFUND" in upper
                is_debit = "-" in line_str or "TRANSFER TO" in upper or "DEBIT" in upper or "PAYMENT" in upper or "WITHDRAWAL" in upper

                line_no_date = line_str.replace(date_str, "")
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

                    desc = line_no_date
                    for a in amount_matches:
                        desc = desc.replace(a, "")
                    desc = re.sub(r"[+-]", "", desc)
                    desc = re.sub(r"\s+", " ", desc).strip() or "PalmPay Transaction"

                    transactions.append({
                        "date": date_str,
                        "description": desc,
                        "debit": amount if is_debit and not is_credit else 0.0,
                        "credit": amount if is_credit else (0.0 if is_debit else amount),
                        "balance": balance
                    })

        return transactions
