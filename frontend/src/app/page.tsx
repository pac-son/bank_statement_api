"use client";

import React, { useState } from "react";

interface Summary {
  total_income: number;
  total_expenses: number;
  net_cashflow: number;
  average_balance: number;
  transaction_count: number;
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
      setErrorMsg(err.message || "Network error");
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Bank Statement & Credit Scoring Engine
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Supports GTBank, Access Bank, and UBA with native PDF, password unlock & OCR fallback.
            </p>
          </div>
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
                {loading ? "Extracting & Analyzing..." : "Analyze Statement"}
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
            <p className="text-slate-300 font-medium">Processing statement text & running bank classifier...</p>
          </div>
        )}

        {/* Extraction Results */}
        {result && result.status === "completed" && (
          <div className="space-y-6">
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
