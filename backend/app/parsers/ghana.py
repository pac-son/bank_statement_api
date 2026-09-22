import re
from typing import List, Dict, Any
from .base import BaseParser

class GhanaCBGParser(BaseParser):
    """
    Parser for Consolidated Bank Ghana (CBG) and Ecobank Ghana e-statements.
    Layout typically includes:
    Post Date | Value Date | Description / Reference | Debit (GHS) | Credit (GHS) | Balance (GHS)
    """
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        
        # Ghana date formats: DD/MM/YYYY or DD-MMM-YYYY (e.g. 15-JAN-2025)
        date_pattern = re.compile(r"(\d{2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            match = date_pattern.search(line_str)
            if match:
                date_str = match.group(1)
                upper = line_str.upper()

                line_no_date = line_str.replace(date_str, "")
                # Ghana statements often format currency with commas (e.g. GHS 1,450.00)
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

                    is_credit = "CR" in upper or "+" in line_str or "DEPOSIT" in upper or "CREDIT" in upper
                    is_debit = "DR" in upper or "-" in line_str or "WITHDRAWAL" in upper or "DEBIT" in upper or "CHARGES" in upper

                    desc = line_no_date
                    for a in amount_matches:
                        desc = desc.replace(a, "")
                    desc = re.sub(r"\b(GHS|GH¢|DR|CR)\b", "", desc, flags=re.IGNORECASE)
                    desc = re.sub(r"\s+", " ", desc).strip() or "Ghana Commercial Bank Transaction"

                    transactions.append({
                        "date": date_str,
                        "description": desc,
                        "currency": "GHS",
                        "debit": amount if is_debit and not is_credit else 0.0,
                        "credit": amount if is_credit else (0.0 if is_debit else amount),
                        "balance": balance
                    })

        return transactions
