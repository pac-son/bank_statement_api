import json
import requests
from typing import Dict, Any, Optional

def dispatch_webhook_notification(
    webhook_url: str,
    event_type: str,
    job_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Dispatches asynchronous HTTP POST webhook events to external lender systems.
    Includes status, summary metrics, fraud flags, and loan recommendations.
    """
    if not webhook_url:
        return {"dispatched": False, "reason": "No webhook URL provided"}

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "BankStatementCreditAPI/1.0"
    }

    event_payload = {
        "event": event_type,
        "job_id": job_id,
        "data": payload
    }

    try:
        response = requests.post(
            webhook_url,
            json=event_payload,
            headers=headers,
            timeout=8
        )
        return {
            "dispatched": True,
            "status_code": response.status_code,
            "success": 200 <= response.status_code < 300
        }
    except Exception as e:
        return {
            "dispatched": False,
            "error": str(e)
        }
