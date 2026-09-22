"use client";

import React, { useState } from "react";

interface Summary {
  total_income: number;
  total_expenses: number;
  net_cashflow: number;
  average_balance: number;
  transaction_count: number;
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
  debit: number;
  credit: number;
  balance: number;
}

interface StatementResult {
  status: string;
  bank?: string;
  filename?: string;
  summary?: Summary;
  loan_stacking?: LoanStacking;
  credit_narrative?: CreditNarrative;
  transactions?: Transaction[];
  error?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (password) {
      formData.append("password", password);
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/statements/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload statement.");
      }

      const data = await res.json();
      setJobId(data.job_id);
      pollStatus(data.job_id);
    } catch (err: any) {
      setErrorMsg(err.message || "Network error. Is the backend running on port 8000?");
      setLoading(false);
    }
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/statements/${id}`);
        const data: StatementResult = await res.json();

        if (data.status === "completed") {
          clearInterval(interval);
          setResult(data);
          setLoading(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setResult(data);
          setErrorMsg(data.error || "Failed to process bank statement.");
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Bank Statement & Credit Scoring Engine
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Automated Statement Parsing, Loan-Stacking Detection & AI Credit Assessment Memo.
            </p>
          </div>
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            API Online
          </span>
        </header>

        {/* Upload Form */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-white mb-4">Upload Statement</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="sm:col-span-2">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 text-sm text-slate-400 w-full cursor-pointer bg-slate-800/40 rounded-lg p-1.5 border border-slate-700/60"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="PDF Password (if protected)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!file || loading}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm transition"
              >
                {loading ? "Extracting & Generating Memo..." : "Analyze Statement"}
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="mt-4 p-4 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-sm font-medium">
              ⚠️ {errorMsg}
            </div>
          )}
        </section>

        {/* Status / Loading */}
        {loading && (
          <div className="flex items-center justify-center p-12 bg-slate-900/50 rounded-xl border border-slate-800 animate-pulse">
            <p className="text-slate-300 font-medium">
              Extracting transactions, assessing risk flags & compiling credit memo...
            </p>
          </div>
        )}

        {/* Extraction Results */}
        {result && result.status === "completed" && (
          <div className="space-y-6">
            {/* Executive Credit Memo Card */}
            {result.credit_narrative && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                      Credit Decision & Underwriting Memo
                    </span>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      Executive Narrative Summary
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border uppercase tracking-wider ${result.credit_narrative.recommendation_badge}`}
                    >
                      {result.credit_narrative.recommendation}
                    </span>
                  </div>
                </div>

                {/* Plain-English Synthesis Paragraph */}
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-sm leading-relaxed text-slate-200">
                  <p>{result.credit_narrative.executive_summary}</p>
                </div>

                {/* Key Underwriting Indicators */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Income Stream Profile</span>
                    <p className="text-sm font-bold text-white mt-1">
                      {result.credit_narrative.income_profile}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Expense Burn Rate</span>
                    <p className="text-sm font-bold text-slate-200 mt-1">
                      {result.credit_narrative.burn_rate_percentage}% of inflows
                    </p>
                  </div>
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Recommended Max Loan Ticket</span>
                    <p className="text-sm font-bold text-emerald-400 mt-1">
                      ₦{result.credit_narrative.recommended_max_loan_capacity.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400">Safe Monthly Installment Cap</span>
                    <p className="text-sm font-bold text-sky-400 mt-1">
                      ₦{result.credit_narrative.recommended_monthly_installment_cap.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Decision Rationale */}
                <div className="p-3.5 rounded-lg bg-blue-950/20 border border-blue-900/40 text-xs text-blue-200 flex items-start gap-2">
                  <span className="font-bold shrink-0">Rationale:</span>
                  <span>{result.credit_narrative.recommendation_reason}</span>
                </div>
              </div>
            )}

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">Detected Bank</p>
                <p className="text-xl font-bold text-white mt-1">{result.bank || "Unknown"}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">Total Inflow / Income</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  ₦{result.summary?.total_income.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">Total Outflow / Expenses</p>
                <p className="text-xl font-bold text-rose-400 mt-1">
                  ₦{result.summary?.total_expenses.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-xs text-slate-400 font-medium uppercase">Average Balance</p>
                <p className="text-xl font-bold text-sky-400 mt-1">
                  ₦{result.summary?.average_balance.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Loan-Stacking Detection Engine Card */}
            {result.loan_stacking && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>Loan-Stacking & Multi-Lender Risk</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pattern detection matching repayments across Nigerian digital lenders (Carbon, FairMoney, Branch, QuickCheck, etc.)
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-bold rounded-full border self-start sm:self-auto ${getRiskBadge(
                      result.loan_stacking.risk_level
                    )}`}
                  >
                    {result.loan_stacking.risk_level} RISK
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-2">
                  <div className="bg-slate-800/40 rounded-lg p-3.5 border border-slate-700/50">
                    <p className="text-xs text-slate-400">Active Lenders Detected</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {result.loan_stacking.unique_lenders_count}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3.5 border border-slate-700/50">
                    <p className="text-xs text-slate-400">Total Loan Servicing Outflows</p>
                    <p className="text-2xl font-bold text-rose-400 mt-1">
                      ₦{result.loan_stacking.total_repayments.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3.5 border border-slate-700/50">
                    <p className="text-xs text-slate-400">Debt-to-Income (DTI) Impact</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">
                      {result.loan_stacking.debt_to_income_ratio}%
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <span className="font-semibold text-slate-200">Assessment:</span> {result.loan_stacking.risk_description}
                </p>

                {/* Detected Lenders Table */}
                {result.loan_stacking.lenders_breakdown.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Breakdown by Lender
                    </h4>
                    <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden text-sm">
                      {result.loan_stacking.lenders_breakdown.map((lender, i) => (
                        <div key={i} className="p-3 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-white">{lender.lender}</span>
                            <span className="text-xs text-slate-400 ml-2">
                              ({lender.repayment_count} repayment transactions)
                            </span>
                          </div>
                          <span className="font-semibold text-rose-400">
                            -₦{lender.total_repaid.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Extracted Transactions Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-semibold text-white">Extracted Transactions</h3>
                <span className="text-xs text-slate-400">
                  {result.transactions?.length || 0} records parsed
                </span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Debit (₦)</th>
                      <th className="p-3 text-right">Credit (₦)</th>
                      <th className="p-3 text-right">Balance (₦)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {result.transactions && result.transactions.length > 0 ? (
                      result.transactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="p-3 whitespace-nowrap">{tx.date}</td>
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
                        <td colSpan={5} className="p-4 text-center text-slate-500">
                          No transactions found or layout requires tailored regex pattern.
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
