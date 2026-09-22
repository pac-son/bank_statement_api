import re
from typing import List, Dict, Any
from .base import BaseParser

class KudaParser(BaseParser):
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        date_pattern = re.compile(r"(\d{2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4}|\d{2}\s+[A-Za-z]{3}\s+\d{4})")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            match = date_pattern.search(line_str)
            if match:
                date_str = match.group(1)
                upper = line_str.upper()

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

                    is_money_in = "MONEY IN" in upper or "CREDIT" in upper or "+" in line_str
                    is_money_out = "MONEY OUT" in upper or "DEBIT" in upper or "-" in line_str

                    desc = line_no_date
                    for a in amount_matches:
                        desc = desc.replace(a, "")
                    desc = re.sub(r"\s+", " ", desc).strip() or "Kuda Transaction"

                    transactions.append({
                        "date": date_str,
                        "description": desc,
                        "debit": amount if is_money_out and not is_money_in else (0.0 if is_money_in else amount),
                        "credit": amount if is_money_in else 0.0,
                        "balance": balance
                    })

        return transactions
