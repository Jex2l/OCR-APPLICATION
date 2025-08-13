# Invoice Extractor E2E (LayoutLMv3 + FastAPI + Next.js)

Operationalize invoice data extraction end-to-end: upload an invoice image → extract **Company, Invoice No, Dates, Line Items, Totals** → write to **Google Sheets** (or Excel). Batteries included: OCR, heuristics, model serving, and a clean React/Next.js UI.

---

## ✨ Features

- **Vision-Language KIE**: LayoutLMv3 token classification over OCR words/boxes  
- **Robust Heuristics**: Smarter date normalization, invoice-no detection, item table parsing  
- **Dual Sinks**: Write to **Google Sheets**, **Excel**, or **both**  
- **Modern Stack**: FastAPI + Uvicorn backend; Next.js 14 frontend  
- **Ops-Friendly**: Health checks, diagnostics (`/where`), CORS, env-driven config

---

## 🗺️ Table of Contents

- [Project Structure](#-project-structure)  
- [Quick Start](#-quick-start)  
  - [Backend](#1-backend--setup--run)  
  - [Frontend](#2-frontend--setup--run)  
- [How It Works](#-how-it-works)  
- [API Reference](#-api-reference)  
- [Data Model](#-data-model-rows-in-sheetsexcel)  
- [Environment Variables](#-environment-variables-backend)  
- [Troubleshooting](#-troubleshooting)  
- [Performance Notes](#-performance-notes)  
- [Security](#-security--pii)  
- [Roadmap](#-roadmap)  
- [License](#-license)

---

## 📦 Project Structure

```
invoice-extractor-e2e/
├─ backend/
│  ├─ app.py
│  ├─ .env                      # backend env (see template below)
│  ├─ requirements.txt
│  ├─ invoice-extractor-sa.json # (optional) Google service-account key file
│  └─ data/
│     └─ invoices.xlsx          # Excel sink (if enabled)
├─ frontend/
│  ├─ package.json
│  ├─ .env.local                # frontend env (see template below)
│  └─ app/ ... components/ ...
└─ best_model/                  # your trained model folder
   ├─ config.json
   ├─ preprocessor_config.json
   ├─ tokenizer.json            # (and/or vocab.json + merges.txt)
   ├─ special_tokens_map.json
   └─ model.safetensors         # (or pytorch_model.bin)
```

> The **`best_model/`** directory must directly contain `config.json`, `tokenizer.json`, and weights.

---

## 🚀 Quick Start

### 0) Prereqs

- **Python 3.11+**, **Node 20+**  
- macOS: `brew install tesseract`  
- Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y tesseract-ocr`

### 1) Backend — Setup & Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Create **`backend/.env`** (adjust paths; **quote paths with spaces**):

```dotenv
# --- model & server ---
MODEL_DIR="/absolute/or/quoted/path/to/invoice-extractor-e2e/best_model"
MAX_LENGTH=512
ALLOWED_ORIGINS=*

# --- sinks: excel | gsheets | both ---
WRITE_SINK=gsheets
EXCEL_PATH=./data/invoices.xlsx

# --- Google Sheets (pick ONE auth method) ---
GSHEETS_ID=<your-google-sheet-id>

# (file-based, recommended)
GOOGLE_APPLICATION_CREDENTIALS=./invoice-extractor-sa.json

# (OR inline JSON - leave the other one blank)
# GOOGLE_CRED_JSON={"type":"service_account","project_id":"...","client_email":"...@...iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\n..."}
```

> **Service account**: Google Cloud → IAM & Admin → Service Accounts → *your SA* → **Keys → Add key → JSON**.  
> Save as `backend/invoice-extractor-sa.json`. Then **share the Google Sheet** with the **`client_email`** from that file as **Editor**.

Run the API:

```bash
source .venv/bin/activate
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Health checks:

```bash
curl -s http://localhost:8000/health | jq
curl -s http://localhost:8000/where  | jq
```

You want `/where` to show a non-empty `service_account_email` and your configured sink.

---

### 2) Frontend — Setup & Run

```bash
cd ../frontend
npm install
```

Create **`frontend/.env.local`**:

```dotenv
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

Launch:

```bash
npm run dev
# open http://localhost:3000
```

Upload an invoice image; watch rows materialize in your Google Sheet **rows** tab (or Excel file).

---

## 🧠 How It Works

1. **OCR** via Tesseract → per-word transcripts + bounding boxes (normalized to 0–1000).  
2. **Encoding** using `AutoProcessor` for LayoutLMv3.  
3. **Model Inference** (`LayoutLMv3ForTokenClassification`) over tokens.  
4. **BIO Aggregation** → word-level entity spans (COMPANY, DATE, TOTAL, etc.).  
5. **Heuristics**:
   - **Total**: keyword proximity (“TOTAL/AMOUNT DUE”), sanity filters, max-amount fallback.
   - **Dates**: multi-format parsing + jammed `mmdd/yyyy` fix + year sanity check.
   - **Invoice No**: keyword adjacency; must contain digits.
   - **Line Items**: header synonyms (`QTY|Quantity|Rate|Unit Price|Item|Desc`) + y-row grouping.
6. **Persistence**: append **one row per item** (Company, Invoice No, Dates repeated per item) to:
   - Google Sheets `"rows"` tab, and/or
   - Excel workbook at `EXCEL_PATH`.

---

## 🛠 API Reference

**GET `/health`** → basic readiness + label set  
**GET `/where`** → sink & credentials diagnostics (Sheets/Excel paths, SA email)  
**GET `/download`** → Excel file (when Excel sink enabled)  
**POST `/predict`** (multipart form):
- form field: `file=@/path/to/invoice.jpg`  
- response:
```json
{
  "fields": {
    "COMPANY": "...",
    "INVOICE_NO": "...",
    "DATE": "YYYY-MM-DD",
    "DUE_DATE": "YYYY-MM-DD",
    "TOTAL": "123.45"
  },
  "items": [
    { "DESCRIPTION":"...", "QTY":1, "UNIT_PRICE":"15.00", "AMOUNT":"15.00" }
  ],
  "wrote": ["gsheets", "excel:./data/invoices.xlsx"],
  "errors": []
}
```

**cURL test**
```bash
curl -s -F "file=@/absolute/path/to/sample-invoice.jpg"   http://localhost:8000/predict | jq
```

---

## 🧾 Data Model (Rows in Sheets/Excel)

Columns (flat, one row per **line item**):

```
COMPANY | INVOICE_NO | DATE | DUE_DATE | ITEM_DESCRIPTION | QTY | UNIT_PRICE | AMOUNT | TOTAL
```

- `TOTAL` is repeated per item (denormalized for analysis convenience).  
- If no items are detected, a single row with metadata and blank item fields is still added.

---

## ⚙️ Environment Variables (Backend)

| Var | Purpose | Example |
|---|---|---|
| `MODEL_DIR` | Path to trained model folder (must contain `config.json`, tokenizer, weights) | `"/…/invoice-extractor-e2e/best_model"` |
| `MAX_LENGTH` | LayoutLMv3 sequence length | `512` |
| `ALLOWED_ORIGINS` | CORS | `*` or `http://localhost:3000` |
| `WRITE_SINK` | `excel`, `gsheets`, or `both` | `gsheets` |
| `EXCEL_PATH` | Excel file path (if Excel sink used) | `./data/invoices.xlsx` |
| `GSHEETS_ID` | Google Sheet ID | `1TRKGL…VR0` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service-account JSON | `./invoice-extractor-sa.json` |
| `GOOGLE_CRED_JSON` | One-line JSON for service account (alternative to file) | `{"type":"service_account", ...}` |

> If **both** `GOOGLE_CRED_JSON` and `GOOGLE_APPLICATION_CREDENTIALS` are set, the app prioritizes the **inline JSON**.

---

## 🧰 Troubleshooting

**Frontend/Node: `uv_cwd` or Backend/Uvicorn: `getcwd` FileNotFoundError**  
Your shell’s current directory vanished (moved/unmounted). **Fix:** `cd` back into a valid folder before running `npm`/`uvicorn`. **Quote** paths with spaces.

**HF 401 / “best_model is not a local folder”**  
`MODEL_DIR` isn’t resolving to your local folder, so `transformers` tries Hugging Face.  
**Fix:** point `MODEL_DIR` to the local folder containing `config.json` + weights (absolute path recommended).

**Google Sheets write fails**  
- Ensure `GSHEETS_ID` is set.  
- `/where` should show a **service_account_email**.  
- **Share the Sheet** with that email as **Editor**.  
- Use **service account** keys, not OAuth client IDs.

**Totals wrong or `1.00`**  
Heuristics ignore stray small integers and favor proximity/max-amount logic. If a layout still misbehaves, add vendor-specific rules.

**No line items detected**  
Headers vary. We match synonyms (`Quantity|Qty|Q`, `Description|Item|Details`, `Unit Price|Rate`, `Amount|Line Total`). Extend the synonyms if your template is exotic.

---

## 📈 Performance Notes

- Apple Silicon: prebuilt `torch` wheels for arm64 work well; CPU is fine for small loads.  
- OCR is often the bottleneck (Tesseract). Consider tuning `--psm 6` or swapping OCR backends when scaling.  
- Increase `MAX_LENGTH` cautiously; very long sequences may slow inference.

---

## 🔐 Security & PII

Invoices contain PII/financial data. Treat artifacts accordingly:
- Keep service-account keys **out of version control**.
- Restrict CORS in production.
- Lock down the Sheet to required stakeholders only.

---

## 🧭 Roadmap

- PDF ingestion (multi-page)  
- Multi-currency support  
- Vendor-specific parsing plugins  
- Optional DocTR/OCRmyPDF backends

---
