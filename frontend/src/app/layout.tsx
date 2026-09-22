import type { ReactNode } from "react";
import "./globals.css";
import { Geist, GeistMono } from "swift-rust/font/google";

const geist = Geist({ variable: true, subsets: ["latin"] });
const geistMono = GeistMono({ variable: true, subsets: ["latin"] });

const fontSansClass = geist.className;
const fontMonoClass = geistMono.className;

export const metadata = {
  title: "Bank Statement & Credit Scoring Engine",
  description:
    "Pan-African Automated Bank Statement Parsing, Fraud Detection, Loan-Stacking Risk Analysis, and Financial Underwriting.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable ?? ""} ${geistMono.variable ?? ""} ${fontSansClass} ${fontMonoClass}`.trim()}
      style={{
        ["--font-sans" as string]: "'Geist', system-ui, sans-serif",
        ["--font-mono" as string]: "'Geist Mono', ui-monospace, monospace",
      }}
    >
      <body className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased selection:bg-blue-500/30 selection:text-blue-200">
        {children}
      </body>
    </html>
  );
}
