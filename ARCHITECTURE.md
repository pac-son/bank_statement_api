# Bank Statement Extraction & Credit Scoring Engine
## System Architecture, Technology Stack, and Project Documentation

---

## 1. Overview & Features Implemented So Far

### Phase 1: Core Ingestion & Normalization Engine (Completed)
1. **Multi-Format Ingestion**:
   - Accepts native digital PDFs, scanned documents, and image formats (PNG, JPG, TIFF).
   - Encrypted / password-protected PDF unlocking support.
2. **Text Extraction & Hybrid OCR Fallback**:
   - Fast native text extraction via `pdfplumber`.
   - Automatic fallback to optical character recognition (`pytesseract` + OpenCV) when scanned or non-searchable PDFs/images are uploaded.
3. **Automated Bank Format Classifier**:
   - Header and pattern-matching classifier routing extracted text to specialized bank templates.
   - Initial major commercial banks: **GTBank**, **Access Bank**, and **UBA**.
4. **Financial Summary Engine**:
   - Aggregates total income / inflow, total expenses / outflow, net cash flow, and average running balance across statement periods.
5. **Interactive Frontend Dashboard**:
   - Real-time drag-and-drop file upload, password field for encrypted e-statements, live status polling, and structured transaction data tables.

### Phase 2: Credit Scoring & Differentiation (In Progress)
5. **Loan-Stacking & Multi-Lender Risk Engine**:
   - Dictionary tracking major Nigerian digital lenders (Carbon/OneFi, FairMoney, Branch, QuickCheck, Renmoney, Palmcredit/Newcredit, Okash/EaseMoni, Aella, Specta, Page Financials, Umba, KiaKia, Zedvance, etc.).
   - Narration pattern matcher flagging loan repayments, recoveries, and disbursements.
   - Calculates active lender counts, total debt servicing outflows, and Debt-to-Income (DTI) impact.
   - Risk scoring with tiered alerts: `LOW`, `MODERATE`, `HIGH`, or `CRITICAL`.
6. **Neobank & Fintech Statement Support**:
   - Dedicated parsers tailored for Nigeria's largest digital banks and payment service banks:
     - **OPay**
     - **PalmPay**
     - **Kuda Bank**
     - **Moniepoint MFB**

---

## 2. Technology Stack

### Backend Stack
- **Python 3.11+ / 3.14**: Primary runtime language for financial analytics and parsing.
- **FastAPI**: Asynchronous, high-performance web framework for the REST API.
- **Uvicorn**: ASGI web server running the FastAPI application.
- **pdfplumber & pdfminer.six**: High-fidelity PDF layout and text extraction.
- **pytesseract & Pillow / OpenCV**: OCR engine and image preprocessing for scanned receipts and statements.
- **Pydantic**: Request and response validation and data modeling.

### Frontend Dashboard Stack
- **Swift Rust**: High-performance full-stack React framework powered by Rust and Bun runtime.
- **React 19 & TypeScript**: Component architecture and type-safe state management.
- **Tailwind CSS**: Modern utility-first styling for dark-mode dashboard interface.
- **Bun**: Ultra-fast JavaScript/TypeScript package manager and execution environment.

### Infrastructure & Deployment Capabilities
- **Local Mode**: Uses FastAPI background tasks and local disk storage for zero-dependency local development on Windows.
- **Docker Mode**: Multi-container Docker Compose configuration (`docker-compose.yml`) orchestrating FastAPI, Celery background workers, Redis message broker, and PostgreSQL database.
- **Version Control**: Git tracking with automated commits pushed to GitHub (`pac-son/bank_statement_api`).

---

## 3. Architecture & Data Flow

```
[User / Loan Officer]
         │
         ▼
[Swift Rust Dashboard (Port 3210)]
         │
         │ (POST /statements/upload with file & optional password)
         ▼
[FastAPI Backend (Port 8000)]
         │
         ├─► [1. File Storage] Save file locally to `backend/uploads/`
         │
         ├─► [2. Text Extraction Layer]
         │       ├── Attempt: Native text extraction via pdfplumber
         │       └── Fallback: Scanned PDF/Image -> Render to Image -> Tesseract OCR
         │
         ├─► [3. Bank Classification & Parsing Layer]
         │       ├── Traditional Banks: GTBank, Access Bank, UBA
         │       └── Neobanks: OPay, PalmPay, Kuda, Moniepoint
         │
         ├─► [4. Risk & Enrichment Engine]
         │       ├── Normalized Transactions (Date, Description, Debit, Credit, Balance)
         │       ├── Financial Summary (Income, Expenses, Net Flow, Average Balance)
         │       └── Loan-Stacking Detection (Active lenders, DTI, Risk rating)
         │
         └─► [5. Result Delivery] Polled via GET /statements/{job_id} & displayed in Dashboard
```

---

## 4. File-by-File Guide

### Root Directory
- **`docker-compose.yml`**: Docker service definitions for containerized environments (PostgreSQL, Redis, FastAPI, Celery worker).
- **`.gitignore`**: Specifies files Git should ignore (virtual environments, uploaded bank statements, database files, node_modules).
- **`ARCHITECTURE.md`**: This document explaining system design, components, and file roles.

---

### Backend (`backend/`)
- **`backend/requirements.txt`**: Python dependencies required for the backend API and OCR pipeline.
- **`backend/Dockerfile`**: Linux container definition installing Tesseract OCR, Poppler utilities, libpq, and Python packages.
- **`backend/uploads/`**: Directory where uploaded statement files are temporarily staged for extraction.
- **`backend/venv/`**: Python isolated virtual environment.

#### Application Core (`backend/app/`)
- **`backend/app/main.py`**:
  - The primary FastAPI application entry point.
  - Configures CORS middleware for frontend communication.
  - Defines routes:
    - `GET /`: Health check.
    - `POST /statements/upload`: Accepts file uploads and optional passwords, triggers async background parsing.
    - `GET /statements/{job_id}`: Returns status, summary metrics, loan-stacking risk scores, and transaction lists.
  - Implements the bank classifier router.

- **`backend/app/worker.py`**:
  - Celery background task worker definition for distributed queue architectures (Redis / RabbitMQ).

#### Services (`backend/app/services/`)
- **`backend/app/services/loan_stacking.py`**:
  - Nigerian Digital Lenders dictionary (Carbon, FairMoney, Branch, QuickCheck, Renmoney, Palmcredit, Okash, EaseMoni, Aella, Specta, etc.).
  - Regular expression pattern matcher identifying loan disbursements and repayments.
  - Computes active lender counts, total debt servicing outflows, DTI ratios, and assigns risk tiers (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`).

#### Parsers (`backend/app/parsers/`)
- **`backend/app/parsers/base.py`**:
  - Abstract base class defining the parser contract (`extract_transactions()`).
- **`backend/app/parsers/gtbank.py`**:
  - Regex and extraction rules for Guaranty Trust Bank statements.
- **`backend/app/parsers/access.py`**:
  - Parser rules tailored for Access Bank e-statements.
- **`backend/app/parsers/uba.py`**:
  - Parser rules for United Bank for Africa (UBA) statements.
- **`backend/app/parsers/opay.py`**:
  - Parser handling OPay transfer statements, merchant payments, and fee structures.
- **`backend/app/parsers/palmpay.py`**:
  - Parser handling PalmPay statement and receipt layouts.
- **`backend/app/parsers/kuda.py`**:
  - Parser for Kuda Bank two-column "Money In" / "Money Out" layouts.
- **`backend/app/parsers/moniepoint.py`**:
  - Parser for Moniepoint Microfinance Bank business/personal account statements.

---

### Frontend (`frontend/`)
- **`frontend/package.json`**: NPM package manifest containing frontend dependencies (`swift-rust`, `react`, `tailwindcss`).
- **`frontend/bun.lock`**: Bun dependency lockfile ensuring reproducible builds.
- **`frontend/swift-rust.config.json`**: Framework configuration for Swift Rust build optimizations.
- **`frontend/src/app/page.tsx`**:
  - The main dashboard page component.
  - Provides statement file upload with password unlock input.
  - Polls backend job status asynchronously.
  - Renders financial summary cards (income, expenses, average balance).
  - Renders loan-stacking risk alerts with DTI indicators and lender breakdown lists.
  - Displays searchable, scrollable transaction tables with debit/credit styling.
