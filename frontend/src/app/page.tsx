"use client";

import React, { useState } from "react";

declare const process: any;

interface Summary {
  currency?: string;
  total_income: number;
  total_expenses: number;
  net_cashflow: number;
  average_balance?: number;
  combined_average_balance?: number;
  transaction_count?: number;
  total_accounts_count?: number;
  total_transactions_count?: number;
  self_transfers_deduped_count?: number;
  self_transfers_volume_deduped?: number;
}

interface LenderBreakdown {
  lender: string;
  repayment_count: number;
  total_repaid: number;
  disbursement_count: number;
  total_disbursed: number;
}

interface FlaggedTx {
  date: string;
  description: string;
  lender: string;
  type: string;
  amount: number;
}

interface LoanStacking {
  risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  risk_description: string;
  unique_lenders_count: number;
  total_repayments: number;
  total_disbursements: number;
  debt_to_income_ratio: number;
  lenders_breakdown: LenderBreakdown[];
  flagged_transactions: FlaggedTx[];
}

interface FraudEvaluation {
  fraud_score: number;
  overall_status: string;
  badge: string;
  is_tampered: boolean;
  reasons: string[];
  metadata_forensics?: {
    status: string;
    passed: boolean;
    metadata?: {
      producer?: string;
      creator?: string;
    };
    flags?: string[];
  };
  balance_reconciliation?: {
    status: string;
    passed: boolean;
    discrepancies_count: number;
    message: string;
  };
  font_uniformity?: {
    status: string;
    passed: boolean;
    message: string;
  };
}

interface CreditNarrative {
  recommendation: string;
  recommendation_badge: string;
  recommendation_reason: string;
  executive_summary: string;
  income_profile: string;
  liquidity_status: string;
  burn_rate_percentage: number;
  gambling_detected: boolean;
  gambling_total_spend: number;
  recommended_max_loan_capacity: number;
  recommended_monthly_installment_cap: number;
}

interface Transaction {
  date: string;
  description: string;
  currency?: string;
  debit: number;
  credit: number;
  balance: number;
  source_bank?: string;
}

interface SelfTransfer {
  amount: number;
  from_account: string;
  to_account: string;
  debit_description: string;
  credit_description: string;
  date: string;
}

interface AccountOverview {
  account_index: number;
  bank: string;
  filename: string;
  transaction_count: number;
  total_income: number;
  total_expenses: number;
  average_balance: number;
}

interface StatementResult {
  status: string;
  is_consolidated?: boolean;
  bank?: string;
  currency?: string;
  filename?: string;
  summary?: Summary;
  consolidated_summary?: Summary;
  accounts_overview?: AccountOverview[];
  self_transfers_detected?: SelfTransfer[];
  loan_stacking?: LoanStacking;
  consolidated_loan_stacking?: LoanStacking;
  fraud_evaluation?: FraudEvaluation;
  consolidated_fraud?: {
    max_fraud_score: number;
    is_tampered: boolean;
    files_breakdown: any[];
  };
  credit_narrative?: CreditNarrative;
  consolidated_credit_narrative?: CreditNarrative;
  transactions?: Transaction[];
  consolidated_transactions?: Transaction[];
  error?: string;
}

const rawApi = process.env.NEXT_PUBLIC_API_URL || "";
const getApiBase = () => {
  if (rawApi) return rawApi.startsWith("http") ? rawApi : `https://${rawApi}`;
  if (typeof window !== "undefined" && window.location.port === "3210") {
    return "http://127.0.0.1:8000";
  }
  return "";
};
const API_BASE = getApiBase();

export default function Home() {
  const [mode, setMode] = useState<"single" | "consolidate" | "api_docs">("single");
  const [codeLang, setCodeLang] = useState<"curl" | "python" | "node">("curl");
  const [countryFilter, setCountryFilter] = useState<"ALL" | "NG" | "GH" | "KE">("ALL");
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singlePassword, setSinglePassword] = useState("");
  const [singleWebhook, setSingleWebhook] = useState("");

  const [multiFiles, setMultiFiles] = useState<FileList | null>(null);
  const [multiPasswords, setMultiPasswords] = useState("");
  const [multiWebhook, setMultiWebhook] = useState("");

  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<StatementResult | null>(null);

  const launchTestWidget = () => {
    if (typeof window === "undefined") return;
    const launch = () => {
      const WidgetClass = (window as any).CredovaWidget || (window as any).BankStatementWidget;
      if (WidgetClass) {
        const widget = new WidgetClass({
          apiUrl: API_BASE || window.location.origin,
          lenderName: "Demo Partner Lender",
          onSuccess: (data: any) => {
            alert(`Assessment Completed for ${data.bank_name}! Decision: ${data.credit_narrative?.recommendation || 'APPROVED'}`);
          },
          onError: (err: any) => {
            alert(`Widget error: ${err.message}`);
          }
        });
        widget.open();
      }
    };

    if (!(window as any).CredovaWidget && !(window as any).BankStatementWidget) {
      const script = document.createElement("script");
      script.src = "/widget.js";
      script.onload = launch;
      document.body.appendChild(script);
    } else {
      launch();
    }
  };
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUploadSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleFile) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", singleFile);
    if (singlePassword) formData.append("password", singlePassword);
    if (singleWebhook) formData.append("webhook_url", singleWebhook);

    try {
      const res = await fetch(`${API_BASE}/statements/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to upload statement.");
      const data = await res.json();
      setJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (err: any) {
      setErrorMsg(err.message || "Network error. Is the backend running?");
      setLoading(false);
    }
  };

  const handleUploadConsolidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiFiles || multiFiles.length < 2) {
      setErrorMsg("Please select at least 2 bank statements to consolidate.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    const formData = new FormData();
    for (let i = 0; i < multiFiles.length; i++) {
      const f = multiFiles[i];
      if (f) formData.append("files", f);
    }
    if (multiPasswords) formData.append("passwords", multiPasswords);
    if (multiWebhook) formData.append("webhook_url", multiWebhook);

    try {
      const res = await fetch(`${API_BASE}/statements/consolidate`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to start consolidation job.");
      }

      const data = await res.json();
      setJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (err: any) {
      setErrorMsg(err.message || "Network error during consolidation.");
      setLoading(false);
    }
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/statements/${id}`);
        const data: StatementResult = await res.json();

        if (data.status === "completed") {
          clearInterval(interval);
          setResult(data);
          setLoading(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setResult(data);
          setErrorMsg(data.error || "Failed to process statement(s).");
          setLoading(false);
        }
      } catch (err) {
        clearInterval(interval);
        setLoading(false);
      }
    }, 1500);
  };

  const getRiskBadge = (level?: string) => {
    switch (level) {
      case "LOW":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "MODERATE":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "HIGH":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700";
    }
  };

  const formatCurrencySymbol = (curr?: string) => {
    if (curr === "GHS") return "GH¢";
    if (curr === "KES") return "KSh ";
    return "₦";
  };

  const activeSummary = result?.is_consolidated ? result.consolidated_summary : result?.summary;
  const activeStacking = result?.is_consolidated ? result.consolidated_loan_stacking : result?.loan_stacking;
  const activeNarrative = result?.is_consolidated ? result.consolidated_credit_narrative : result?.credit_narrative;
  const activeTransactions = result?.is_consolidated ? result.consolidated_transactions : result?.transactions;

  const activeCurrency = result?.currency || activeSummary?.currency || "NGN";
  const currSym = formatCurrencySymbol(activeCurrency);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-black text-sm shadow-md shadow-blue-500/20">
                C
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Pan-African Statement Intelligence
              </span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Credova
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                Underwriting Engine
              </span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Automated Statement Parsing, Fraud Forensics & Risk Analytics for Nigeria 🇳🇬, Ghana 🇬🇭, and Kenya 🇰🇪.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 self-start sm:self-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Credova Core Online
            </span>
          </div>
        </header>

        {/* Supported Countries Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3">
            <span className="text-2xl">🇳🇬</span>
            <div>
              <p className="text-xs font-bold text-white">Nigeria (NGN)</p>
              <p className="text-[11px] text-slate-400">GTBank, Access, UBA, OPay, PalmPay, Kuda, Moniepoint</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3">
            <span className="text-2xl">🇬🇭</span>
            <div>
              <p className="text-xs font-bold text-white">Ghana (GHS)</p>
              <p className="text-[11px] text-slate-400">Consolidated Bank Ghana (CBG), GCB, Ecobank GH</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3">
            <span className="text-2xl">🇰🇪</span>
            <div>
              <p className="text-xs font-bold text-white">Kenya (KES)</p>
              <p className="text-[11px] text-slate-400">Equity Bank Kenya, KCB & Safaricom M-PESA</p>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-800 gap-4">
          <button
            onClick={() => setMode("single")}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              mode === "single"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Single Statement Analysis
          </button>
          <button
            onClick={() => setMode("consolidate")}
            className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-1.5 ${
              mode === "consolidate"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Multi-Account Consolidation</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/20 text-blue-300 font-bold">
              PRO
            </span>
          </button>
          <button
            onClick={() => setMode("api_docs")}
            className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-1.5 ${
              mode === "api_docs"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Developer API & SDK</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-400 font-bold">
              DOCS
            </span>
          </button>
        </div>

        {/* Upload Form */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          {mode === "single" ? (
            <form onSubmit={handleUploadSingle} className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Upload Bank / M-PESA Statement</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="sm:col-span-2">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setSingleFile(e.target.files?.[0] || null)}
                    className="file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 text-sm text-slate-400 w-full cursor-pointer bg-slate-800/40 rounded-lg p-1.5 border border-slate-700/60"
                  />
                </div>
                <div>
                  <input
                    type="password"
                    placeholder="PDF Password (if protected)"
                    value={singlePassword}
                    onChange={(e) => setSinglePassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <input
                  type="url"
                  placeholder="Optional Webhook Notification URL (e.g. https://your-app.com/api/webhooks)"
                  value={singleWebhook}
                  onChange={(e) => setSingleWebhook(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!singleFile || loading}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm transition"
                >
                  {loading ? "Analyzing..." : "Analyze Statement"}
                </button>
              </div>
            </form>
          ) : mode === "consolidate" ? (
            <form onSubmit={handleUploadConsolidate} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Consolidate Multiple Statements (Merge Accounts)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Supports multi-statement merging across commercial banks, digital wallets, or regional accounts.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="sm:col-span-2">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/*"
                    onChange={(e) => setMultiFiles(e.target.files)}
                    className="file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 text-sm text-slate-400 w-full cursor-pointer bg-slate-800/40 rounded-lg p-1.5 border border-slate-700/60"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Passwords (comma-separated)"
                    value={multiPasswords}
                    onChange={(e) => setMultiPasswords(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <input
                  type="url"
                  placeholder="Optional Webhook Notification URL (e.g. https://your-app.com/api/webhooks)"
                  value={multiWebhook}
                  onChange={(e) => setMultiWebhook(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800/40 border border-slate-700/60 text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!multiFiles || multiFiles.length < 2 || loading}
                  className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm transition"
                >
                  {loading ? "Consolidating..." : "Consolidate & Analyze Profile"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚡</span>
                    <h2 className="text-lg font-bold text-white">
                      Credova Developer API & SDK Hub
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Integrate automated bank statement parsing, loan stacking detection, and credit scoring directly into your loan engine.
                  </p>
                </div>
                <a
                  href="/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition self-start sm:self-auto shadow-sm shadow-blue-500/20"
                >
                  <span>Interactive Swagger Docs (/docs)</span>
                  <span>↗</span>
                </a>
              </div>

              {/* Endpoints Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Core API Endpoints</h3>
                <div className="bg-slate-950/80 rounded-lg border border-slate-800 overflow-hidden divide-y divide-slate-800/60 font-mono text-xs">
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">POST</span>
                      <span className="text-slate-200">/statements/upload</span>
                    </div>
                    <span className="text-slate-400 font-sans text-xs">Upload single PDF statement + password + webhook</span>
                  </div>
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold">POST</span>
                      <span className="text-slate-200">/statements/consolidate</span>
                    </div>
                    <span className="text-slate-400 font-sans text-xs">Consolidate 2-5 statements with cross-account self-transfer deduping</span>
                  </div>
                  <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">GET</span>
                      <span className="text-slate-200">/statements/&#123;job_id&#125;</span>
                    </div>
                    <span className="text-slate-400 font-sans text-xs">Poll status & retrieve full underwriting assessment</span>
                  </div>
                </div>
              </div>

              {/* Code Snippets Tabs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCodeLang("curl")}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                        codeLang === "curl" ? "bg-slate-800 text-blue-400 border border-slate-700" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      cURL
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeLang("python")}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                        codeLang === "python" ? "bg-slate-800 text-blue-400 border border-slate-700" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Python
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeLang("node")}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                        codeLang === "node" ? "bg-slate-800 text-blue-400 border border-slate-700" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Node.js / TS
                    </button>
                  </div>
                </div>

                <div className="relative bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto text-slate-300">
                  {codeLang === "curl" && (
                    <pre>{`# 1. Upload statement for async processing
curl -X POST "${API_BASE || 'https://credova-api.onrender.com'}/statements/upload" \\
  -F "file=@bank_statement.pdf" \\
  -F "password=optional_pdf_password" \\
  -F "webhook_url=https://your-lending-app.com/api/webhooks"

# Response returns Job ID immediately:
# { "job_id": "786cc1a4-9941-438d-9379-0740fcef10d4", "status": "pending" }

# 2. Retrieve decision & underwriting metrics:
curl "${API_BASE || 'https://credova-api.onrender.com'}/statements/786cc1a4-9941-438d-9379-0740fcef10d4"`}</pre>
                  )}
                  {codeLang === "python" && (
                    <pre>{`import requests

url = "${API_BASE || 'https://credova-api.onrender.com'}/statements/upload"
files = {"file": open("customer_statement.pdf", "rb")}
data = {
    "password": "customer_password_if_any",
    "webhook_url": "https://your-lending-app.com/api/webhooks"
}

response = requests.post(url, files=files, data=data)
job = response.json()
print("Job ID:", job["job_id"])`}</pre>
                  )}
                  {codeLang === "node" && (
                    <pre>{`import FormData from "form-data";
import fs from "fs";
import axios from "axios";

const form = new FormData();
form.append("file", fs.createReadStream("customer_statement.pdf"));
form.append("password", "optional_password");
form.append("webhook_url", "https://your-lending-app.com/api/webhooks");

const res = await axios.post(
  "${API_BASE || 'https://credova-api.onrender.com'}/statements/upload",
  form,
  { headers: form.getHeaders() }
);

console.log("Job ID:", res.data.job_id);`}</pre>
                  )}
                </div>
              </div>

              {/* Embeddable Drop-In Widget */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>📱</span> Embeddable Borrower Upload Widget
                    </h3>
                    <p className="text-xs text-slate-400">
                      Add a white-labeled bank statement uploader directly to your checkout or loan flow with 3 lines of JavaScript.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={launchTestWidget}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition self-start sm:self-auto flex items-center gap-1"
                  >
                    <span>Test-Drive Live Widget</span>
                    <span>▶</span>
                  </button>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre>{`<script src="${API_BASE || 'https://credova-api.onrender.com'}/widget.js"></script>
<script>
  const widget = new CredovaWidget({
    apiUrl: "${API_BASE || 'https://credova-api.onrender.com'}",
    lenderName: "Your Brand",
    onSuccess: function (data) {
      console.log("Decision:", data.credit_narrative.recommendation);
      console.log("Max Loan Capacity:", data.credit_narrative.recommended_max_loan_capacity);
    }
  });
  // Open modal on user click
  document.getElementById("upload-btn").onclick = () => widget.open();
</script>`}</pre>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 p-4 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-sm font-medium">
              ⚠️ {errorMsg}
            </div>
          )}
        </section>

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-center justify-center p-12 bg-slate-900/50 rounded-xl border border-slate-800 animate-pulse">
            <p className="text-slate-300 font-medium">
              Classifying African bank format, verifying document authenticity & scoring risk...
            </p>
          </div>
        )}

        {/* Results View */}
        {result && result.status === "completed" && (
          <div className="space-y-6">
            {/* Document Tampering & Fraud Detection Banner */}
            {result.fraud_evaluation && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🛡️</span>
                    <div>
                      <h3 className="font-bold text-white text-base">
                        Document Authenticity & Tampering Analysis
                      </h3>
                      <p className="text-xs text-slate-400">
                        PDF metadata forensic audit, font uniformity, and arithmetic balance reconciliation
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider self-start sm:self-auto ${result.fraud_evaluation.badge}`}
                  >
                    {result.fraud_evaluation.overall_status} • {100 - result.fraud_evaluation.fraud_score}% Authenticity (Tamper Risk: {result.fraud_evaluation.fraud_score}/100)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Balance Arithmetic Check</span>
                    <p className={`font-semibold mt-1 ${result.fraud_evaluation.balance_reconciliation?.passed ? "text-emerald-400" : "text-rose-400"}`}>
                      {result.fraud_evaluation.balance_reconciliation?.passed ? "✓ Math Verified" : "✗ Discrepancies Found"}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      {result.fraud_evaluation.balance_reconciliation?.message}
                    </p>
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Producer & Creator Metadata</span>
                    <p className={`font-semibold mt-1 ${result.fraud_evaluation.metadata_forensics?.passed ? "text-emerald-400" : "text-rose-400"}`}>
                      {result.fraud_evaluation.metadata_forensics?.passed ? "✓ Core Banking Export" : "✗ Suspicious Tool"}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5 truncate">
                      {result.fraud_evaluation.metadata_forensics?.metadata?.producer || "Genuine"}
                    </p>
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400">Font Uniformity</span>
                    <p className={`font-semibold mt-1 ${result.fraud_evaluation.font_uniformity?.passed ? "text-emerald-400" : "text-amber-400"}`}>
                      {result.fraud_evaluation.font_uniformity?.passed ? "✓ Uniform Standard Fonts" : "⚠ Spliced Text Layer"}
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      {result.fraud_evaluation.font_uniformity?.message}
                    </p>
                  </div>
                </div>

                {result.fraud_evaluation.reasons && result.fraud_evaluation.reasons.length > 0 && (
                  <div className="p-3 bg-rose-950/30 border border-rose-900/40 rounded-lg text-xs text-rose-300 space-y-1">
                    <span className="font-bold">Specific Tampering Warnings:</span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {result.fraud_evaluation.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Multi-Account Overview Pills (If Consolidated) */}
            {result.is_consolidated && result.accounts_overview && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Merged Accounts ({result.accounts_overview.length} Banks)
                  </h3>
                  {result.consolidated_summary?.self_transfers_deduped_count ? (
                    <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      ✓ {result.consolidated_summary.self_transfers_deduped_count} Internal Self-Transfers Deduped (
                      {currSym}
                      {result.consolidated_summary.self_transfers_volume_deduped?.toLocaleString()})
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {result.accounts_overview.map((acc, i) => (
                    <div key={i} className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs space-y-1">
                      <div className="flex justify-between font-bold text-white">
                        <span>{acc.bank}</span>
                        <span className="text-slate-400 font-normal">{acc.transaction_count} txs</span>
                      </div>
                      <div className="text-slate-400 truncate">{acc.filename}</div>
                      <div className="pt-1 text-emerald-400 font-medium">
                        Inflow: {currSym}{acc.total_income.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executive Credit Memo Card */}
            {activeNarrative && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                      {result.is_consolidated ? "Consolidated Underwriting Memo" : "Credit Decision Memo"}
                    </span>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      Executive Narrative Summary
                    </h2>
                  </div>
                  <span
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider self-start sm:self-auto ${activeNarrative.recommendation_badge}`}
                  >
                    {activeNarrative.recommendation}
                  </span>
                </div>

                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-sm leading-relaxed text-slate-200">
                  <p>{activeNarrative.executive_summary}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Income Stream Profile</span>
                    <p className="text-sm font-bold text-white mt-1">{activeNarrative.income_profile}</p>
                  </div>
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Expense Burn Rate</span>
                    <p className="text-sm font-bold text-slate-200 mt-1">{activeNarrative.burn_rate_percentage}%</p>
                  </div>
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Recommended Max Loan Ticket</span>
                    <p className="text-sm font-bold text-emerald-400 mt-1">
                      {currSym}{activeNarrative.recommended_max_loan_capacity.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Safe Monthly Installment Cap</span>
                    <p className="text-sm font-bold text-sky-400 mt-1">
                      {currSym}{activeNarrative.recommended_monthly_installment_cap.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-blue-950/20 border border-blue-900/40 text-xs text-blue-200 flex items-start gap-2">
                  <span className="font-bold shrink-0">Rationale:</span>
                  <span>{activeNarrative.recommendation_reason}</span>
                </div>
              </div>
            )}

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">
                  {result.is_consolidated ? "Consolidated Bank Profile" : "Detected Bank"}
                </p>
                <p className="text-xl font-bold text-white mt-1">
                  {result.is_consolidated
                    ? `${result.accounts_overview?.length || 2} Accounts Merged`
                    : result.bank || "Unknown"}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">Total Real Inflow / Income</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  {currSym}{activeSummary?.total_income.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">Total Real Outflow / Expenses</p>
                <p className="text-xl font-bold text-rose-400 mt-1">
                  {currSym}{activeSummary?.total_expenses.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">
                  {result.is_consolidated ? "Combined Avg Balance" : "Average Balance"}
                </p>
                <p className="text-xl font-bold text-sky-400 mt-1">
                  {currSym}
                  {(
                    activeSummary?.combined_average_balance ||
                    activeSummary?.average_balance ||
                    0
                  ).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Loan-Stacking Detection Engine Card */}
            {activeStacking && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>Loan-Stacking & Multi-Lender Risk</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cross-account pattern detection matching Nigerian and regional digital lenders
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-bold rounded-full border self-start sm:self-auto ${getRiskBadge(
                      activeStacking.risk_level
                    )}`}
                  >
                    {activeStacking.risk_level} RISK
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-2">
                  <div className="bg-slate-800/40 rounded-lg p-3.5 border border-slate-700/50">
                    <p className="text-xs text-slate-400">Active Lenders Detected</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {activeStacking.unique_lenders_count}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3.5 border border-slate-700/50">
                    <p className="text-xs text-slate-400">Total Monthly Debt Outflow</p>
                    <p className="text-2xl font-bold text-rose-400 mt-1">
                      {currSym}{activeStacking.total_repayments.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3.5 border border-slate-700/50">
                    <p className="text-xs text-slate-400">Consolidated DTI Ratio</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">
                      {activeStacking.debt_to_income_ratio}%
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <span className="font-semibold text-slate-200">Assessment:</span> {activeStacking.risk_description}
                </p>
              </div>
            )}

            {/* Extracted Transactions Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-semibold text-white">
                  {result.is_consolidated ? "Unified Consolidated Transactions" : "Extracted Transactions"}
                </h3>
                <span className="text-xs text-slate-400">
                  {activeTransactions?.length || 0} records ({activeCurrency})
                </span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-3">Date</th>
                      {result.is_consolidated && <th className="p-3">Bank Source</th>}
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Debit ({currSym})</th>
                      <th className="p-3 text-right">Credit ({currSym})</th>
                      <th className="p-3 text-right">Balance ({currSym})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {activeTransactions && activeTransactions.length > 0 ? (
                      activeTransactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="p-3 whitespace-nowrap">{tx.date}</td>
                          {result.is_consolidated && (
                            <td className="p-3 whitespace-nowrap text-xs text-blue-400 font-medium">
                              {tx.source_bank || "Account"}
                            </td>
                          )}
                          <td className="p-3 max-w-xs truncate">{tx.description}</td>
                          <td className="p-3 text-right text-rose-400">
                            {tx.debit > 0 ? tx.debit.toLocaleString() : "-"}
                          </td>
                          <td className="p-3 text-right text-emerald-400">
                            {tx.credit > 0 ? tx.credit.toLocaleString() : "-"}
                          </td>
                          <td className="p-3 text-right font-medium text-slate-200">
                            {tx.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={result.is_consolidated ? 6 : 5} className="p-4 text-center text-slate-500">
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
