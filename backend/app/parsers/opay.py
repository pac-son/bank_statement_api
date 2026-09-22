import re
from typing import List, Dict, Any
from .base import BaseParser

class OPayParser(BaseParser):
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        date_pattern = re.compile(r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?|\d{2}[-/]\d{2}[-/]\d{4})")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            match = date_pattern.search(line_str)
            if match:
                date_str = match.group(1)
                upper = line_str.upper()

                is_credit = "+" in line_str or "INCOMING" in upper or "TRANSFER IN" in upper or "CREDIT" in upper
                is_debit = "-" in line_str or "OUTGOING" in upper or "TRANSFER OUT" in upper or "DEBIT" in upper or "PAYMENT" in upper

                # Strip out the date first so numbers in the date aren't matched as amounts
                line_no_date = line_str.replace(date_str, "")
                amount_matches = re.findall(r"[-+]?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b", line_no_date)
                
                amounts = []
                for a in amount_matches:
                    clean = a.replace(",", "").replace("+", "").replace("-", "")
                    try:
                        val = float(clean)
                        amounts.append(val)
                    except ValueError:
                        pass

                if amounts:
                    tx_amount = amounts[0]
                    balance = amounts[-1] if len(amounts) > 1 else 0.0

                    desc = line_no_date
                    for a in amount_matches:
                        desc = desc.replace(a, "")
                    desc = re.sub(r"\s+", " ", desc).strip() or "OPay Transaction"

                    transactions.append({
                        "date": date_str,
                        "description": desc,
                        "debit": tx_amount if is_debit and not is_credit else 0.0,
                        "credit": tx_amount if is_credit else (0.0 if is_debit else tx_amount),
                        "balance": balance
                    })

        return transactions
