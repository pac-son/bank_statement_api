import os
import sqlite3
import secrets
import time
from typing import Optional, Dict, Any, Tuple

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "credova.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_billing_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. API Keys Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            tier TEXT NOT NULL DEFAULT 'payg',
            credits_balance INTEGER NOT NULL DEFAULT 25,
            total_used INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 2. Usage Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key TEXT NOT NULL,
            job_id TEXT NOT NULL,
            job_type TEXT NOT NULL,
            credits_deducted INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 3. Top-Up Transactions Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS topup_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key TEXT NOT NULL,
            reference TEXT UNIQUE NOT NULL,
            credits_added INTEGER NOT NULL,
            amount_paid REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'NGN',
            payment_method TEXT NOT NULL DEFAULT 'instant_wallet',
            status TEXT NOT NULL DEFAULT 'success',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Insert default demo key if not present
    cursor.execute("SELECT id FROM api_keys WHERE api_key = 'cdv_demo_public_unlimited'")
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO api_keys (api_key, name, tier, credits_balance, total_used, is_active)
            VALUES ('cdv_demo_public_unlimited', 'Credova Public Demo Sandbox', 'trial', 1000, 0, 1)
        """)
        
    conn.commit()
    conn.close()

# Auto-initialize on module load
init_billing_db()

def generate_api_key(name: str, tier: str = "payg") -> Dict[str, Any]:
    """
    Creates a new Credova API key with 25 free trial credits.
    """
    random_token = secrets.token_hex(16)
    prefix = "cdv_test" if tier == "trial" else "cdv_live"
    api_key = f"{prefix}_{random_token}"
    initial_credits = 25  # Free starter quota (~₦8,750 value)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO api_keys (api_key, name, tier, credits_balance, total_used, is_active)
        VALUES (?, ?, ?, ?, 0, 1)
    """, (api_key, name, tier, initial_credits))
    conn.commit()
    conn.close()
    
    return {
        "api_key": api_key,
        "name": name,
        "tier": tier,
        "credits_balance": initial_credits,
        "total_used": 0,
        "message": "API key successfully created with 25 free starter credits (~₦8,750 value)!"
    }

def get_key_details(api_key: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves key details, current credit balance, and usage statistics.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT api_key, name, tier, credits_balance, total_used, is_active, created_at
        FROM api_keys
        WHERE api_key = ?
    """, (api_key,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
        
    return {
        "api_key": row["api_key"],
        "name": row["name"],
        "tier": row["tier"],
        "credits_balance": row["credits_balance"],
        "total_used": row["total_used"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"]
    }

def validate_and_charge_key(
    api_key: Optional[str],
    credits_needed: int,
    job_id: str,
    job_type: str
) -> Tuple[bool, Optional[str], int]:
    """
    Validates the API key and charges the required credits atomically.
    Returns (success: bool, error_message: Optional[str], remaining_credits: int).
    """
    # If no key is provided, use the public demo key for sandbox evaluation
    if not api_key or api_key.strip() == "":
        api_key = "cdv_demo_public_unlimited"
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT api_key, credits_balance, total_used, is_active
        FROM api_keys
        WHERE api_key = ?
    """, (api_key,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return False, f"Invalid API key: '{api_key}'. Please generate an API key on the Credova dashboard.", 0
        
    if not row["is_active"]:
        conn.close()
        return False, "This API key has been deactivated. Please contact support@credova.io.", 0
        
    balance = row["credits_balance"]
    if balance < credits_needed:
        conn.close()
        return False, (
            f"Insufficient credits. This operation requires {credits_needed} credit(s), "
            f"but your balance is {balance} credit(s). Please top up your Credova wallet."
        ), balance

    # Deduct credits
    new_balance = balance - credits_needed
    new_used = row["total_used"] + credits_needed
    
    cursor.execute("""
        UPDATE api_keys
        SET credits_balance = ?, total_used = ?
        WHERE api_key = ?
    """, (new_balance, new_used, api_key))
    
    # Log usage
    cursor.execute("""
        INSERT INTO usage_logs (api_key, job_id, job_type, credits_deducted, balance_after)
        VALUES (?, ?, ?, ?, ?)
    """, (api_key, job_id, job_type, credits_needed, new_balance))
    
    conn.commit()
    conn.close()
    
    return True, None, new_balance

def topup_key(
    api_key: str,
    credits: int,
    amount_paid: float,
    currency: str = "NGN",
    payment_method: str = "instant_wallet"
) -> Dict[str, Any]:
    """
    Adds credits to an existing API key wallet.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT credits_balance, total_used FROM api_keys WHERE api_key = ?", (api_key,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise ValueError(f"API key '{api_key}' not found.")
        
    new_balance = row["credits_balance"] + credits
    cursor.execute("UPDATE api_keys SET credits_balance = ? WHERE api_key = ?", (new_balance, api_key))
    
    reference = f"top_{int(time.time())}_{secrets.token_hex(4)}"
    cursor.execute("""
        INSERT INTO topup_transactions (api_key, reference, credits_added, amount_paid, currency, payment_method, status)
        VALUES (?, ?, ?, ?, ?, ?, 'success')
    """, (api_key, reference, credits, amount_paid, currency, payment_method))
    
    conn.commit()
    conn.close()
    
    return {
        "api_key": api_key,
        "credits_added": credits,
        "new_balance": new_balance,
        "reference": reference,
        "amount_paid": amount_paid,
        "currency": currency,
        "status": "success"
    }

def get_pricing_tiers() -> Dict[str, Any]:
    """
    Returns public pricing plans and counterpart benchmarks.
    """
    return {
        "currency_rates": {
            "credit_cost_single_ngn": 350,
            "credit_cost_consolidated_ngn": 700,
            "credit_cost_single_usd": 0.25,
            "credit_cost_consolidated_usd": 0.50
        },
        "plans": [
            {
                "id": "trial",
                "name": "Developer Trial",
                "price": "₦0 / Free",
                "price_usd": "$0",
                "badge": "FREE STARTER",
                "description": "Ideal for exploring the API, testing parsers, and proof-of-concept builds.",
                "included_credits": 25,
                "overage_rate": "₦350 / assessment",
                "features": [
                    "25 Free Assessments included (~₦8,750 value)",
                    "Single Statement & Multi-Account Parsing",
                    "Authenticity & Tampering Forensics",
                    "Digital Loan-Stacking Detection",
                    "Interactive Swagger Docs & Web Widget"
                ]
            },
            {
                "id": "payg",
                "name": "Pay-As-You-Go",
                "price": "₦350",
                "price_usd": "$0.25",
                "billing": "per statement (no monthly fee)",
                "badge": "MOST FLEXIBLE",
                "description": "Prepaid wallet for independent loan brokers, pilot fintechs, and variable volumes.",
                "included_credits": "Fund on demand",
                "overage_rate": "₦350 single / ₦700 multi",
                "features": [
                    "Zero monthly subscription commitment",
                    "Pay only for successfully completed assessments",
                    "Instant wallet top-up via Paystack / Card",
                    "Webhooks for asynchronous pipeline integration",
                    "Full Pan-African Bank Support (NG, GH, KE)"
                ]
            },
            {
                "id": "growth",
                "name": "Fintech Growth",
                "price": "₦50,000",
                "price_usd": "$35",
                "billing": "per month",
                "badge": "POPULAR FOR LENDERS",
                "description": "Designed for active digital lending apps, BNPL originators, and credit unions.",
                "included_credits": 200,
                "overage_rate": "₦250 / assessment (28% discount)",
                "features": [
                    "200 statement assessments included monthly",
                    "Discounted overage rate (₦250 per call)",
                    "Sub-second priority processing queue",
                    "Unlimited multi-account cross-bank consolidations",
                    "Email & Slack technical developer support"
                ]
            },
            {
                "id": "enterprise",
                "name": "Enterprise Underwriter",
                "price": "₦200,000",
                "price_usd": "$140",
                "billing": "per month",
                "badge": "HIGH VOLUME",
                "description": "For Microfinance Banks (MFBs), commercial lenders, and high-frequency underwriting.",
                "included_credits": 1000,
                "overage_rate": "₦180 / assessment (48% discount)",
                "features": [
                    "1,000 statement assessments included monthly",
                    "Maximum volume discount (₦180 per call)",
                    "Custom debt-to-income (DTI) & risk thresholds",
                    "Dedicated SLA (99.9% uptime guarantee)",
                    "Dedicated solutions architect & custom parser onboarding"
                ]
            }
        ]
    }
