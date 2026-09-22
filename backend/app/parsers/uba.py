import re
from typing import List, Dict, Any
from .base import BaseParser

class UBAParser(BaseParser):
    """
    Parser for United Bank for Africa (UBA) e-statements.
    Layout typically contains:
    Trans Date | Value Date | Description / Reference | Debit | Credit | Balance
    """
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        
        # Detect opening balance if present
        op_match = re.search(r'OPENING BALANCE.*?(\d{1,3}(?:,\d{3})*(?:\.\d{2}))', self.text, re.IGNORECASE)
        prev_balance = float(op_match.group(1).replace(',', '')) if op_match else None

        # Matches dates like 01-Apr-2026 or 01/04/2026 or 01-04-2026
        date_pattern = re.compile(r"(\d{2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})")

        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue

            # Skip header lines, page counters, and slogans
            upper = line_str.upper()
            if any(h in upper for h in [
                "ACCOUNT TYPE", "OPENING BALANCE", "CLOSING BALANCE", "TOTAL DEBIT", 
                "TOTAL CREDIT", "AFRICA'S GLOBAL BANK", "STATEMENT OF ACCOUNT",
                "ACCOUNT NUMBER", "PAGE NO", "DATE VALUE DATE"
            ]):
                continue

            match = date_pattern.search(line_str)
            if match:
                date_str = match.group(1)
                line_no_date = line_str.replace(date_str, "")

                # Extract currency amounts (e.g. 18,203.75 or 20,000.00 or 500.00)
                amount_matches = re.findall(r"\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b", line_no_date)
                amounts = []
                for a in amount_matches:
                    clean = a.replace(",", "")
                    try:
                        val = float(clean)
                        amounts.append(val)
                    except ValueError:
                        pass

                # If there are amounts (debit, credit, balance)
                if amounts:
                    balance = amounts[-1] if len(amounts) >= 1 else 0.0
                    
                    # If 3 amounts: debit, credit, balance
                    if len(amounts) >= 3:
                        debit_val = amounts[-3]
                        credit_val = amounts[-2]
                    elif len(amounts) == 2:
                        val = amounts[0]
                        # Reconcile using consecutive balance delta
                        if prev_balance is not None:
                            diff = round(balance - prev_balance, 2)
                            if diff > 0 and abs(diff - val) < 1.0:
                                debit_val = 0.0
                                credit_val = val
                            elif diff < 0 and abs(abs(diff) - val) < 1.0:
                                debit_val = val
                                credit_val = 0.0
                            else:
                                is_credit = any(k in upper for k in ["CR", "CREDIT", "TRANSFER FROM", "TRF FROM", "INWARD", "SALARY", "REVERSAL", "DEPOSIT"])
                                is_debit = any(k in upper for k in ["DR", "DEBIT", "TRANSFER TO", "TRF TO", "POS", "ATM", "CHARGE", "VAT", "PURCHASE", "STAMP DUTY", "WITHDRAWAL"])
                                if is_credit and not is_debit:
                                    debit_val = 0.0
                                    credit_val = val
                                elif is_debit:
                                    debit_val = val
                                    credit_val = 0.0
                                else:
                                    debit_val = val if diff < 0 else 0.0
                                    credit_val = val if diff > 0 else 0.0
                        else:
                            is_credit = any(k in upper for k in ["CR", "CREDIT", "TRANSFER FROM", "TRF FROM", "INWARD", "SALARY", "REVERSAL", "DEPOSIT"])
                            is_debit = any(k in upper for k in ["DR", "DEBIT", "TRANSFER TO", "TRF TO", "POS", "ATM", "CHARGE", "VAT", "PURCHASE", "STAMP DUTY", "WITHDRAWAL"])
                            if is_credit and not is_debit:
                                debit_val = 0.0
                                credit_val = val
                            else:
                                debit_val = val
                                credit_val = 0.0
                    else:
                        debit_val = 0.0
                        credit_val = amounts[0]

                    prev_balance = balance

                    desc = line_no_date
                    for a in amount_matches:
                        desc = desc.replace(a, "")
                    desc = re.sub(date_pattern, "", desc)
                    desc = re.sub(r"\s+", " ", desc).strip() or "UBA Transaction"

                    transactions.append({
                        "date": date_str,
                        "description": desc,
                        "currency": "NGN",
                        "debit": debit_val,
                        "credit": credit_val,
                        "balance": balance
                    })

        return transactions
