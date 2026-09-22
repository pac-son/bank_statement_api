import re
from datetime import datetime
from typing import List, Dict, Any
from .base import BaseParser

class GTBankParser(BaseParser):
    def extract_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        lines = self.text.split("\n")
        
        # Regex pattern matching typical GTBank date formats (e.g. 02-Jan-2025 or 02/01/2025)
        # Date, Narration/Remarks, Value Date, Debit, Credit, Balance
        date_pattern = re.compile(r"^(\d{2}[-/][A-Za-z]{3}[-/]\d{4}|\d{2}[-/]\d{2}[-/]\d{4})")
        
        for line in lines:
            line_str = line.strip()
            if not line_str:
                continue
                
            if date_pattern.match(line_str):
                parts = line_str.split()
                # If we have at least date, amounts
                if len(parts) >= 3:
                    tx_date = parts[0]
                    # Attempt to extract trailing monetary amounts: [debit/credit, balance]
                    amounts = []
                    desc_parts = []
                    
                    for item in reversed(parts[1:]):
                        clean_item = item.replace(",", "")
                        try:
                            val = float(clean_item)
                            if len(amounts) < 2:
                                amounts.insert(0, val)
                            else:
                                desc_parts.insert(0, item)
                        except ValueError:
                            desc_parts.insert(0, item)
                            
                    balance = amounts[-1] if len(amounts) >= 1 else 0.0
                    amount = amounts[0] if len(amounts) >= 2 else 0.0
                    narration = " ".join(desc_parts)
                    
                    # Distinguish debit vs credit based on keywords or signs
                    is_debit = "DR" in line_str.upper() or "-" in line_str
                    transactions.append({
                        "date": tx_date,
                        "description": narration or "Transaction",
                        "debit": amount if is_debit else 0.0,
                        "credit": 0.0 if is_debit else amount,
                        "balance": balance
                    })
        return transactions
