# Invoice → Excel (End-to-End)

One repo, two services: a **FastAPI** backend (LayoutLMv3 + OCR → Excel) and a **Next.js** frontend (drag & drop UI). Run locally or with Docker Compose.

## Prereqs
- Your trained **best_model** files (including `model.safetensors`).
- If running without Docker: a system OCR install (Tesseract).

## Run with Docker Compose (recommended)
1) Place your model files into `best_model/`.
2) From the repo root:
```bash
docker compose up --build
```
3) Open the UI at **http://localhost:3000**.

Back-end endpoints:
- Health: http://localhost:8000/health
- Download Excel: http://localhost:8000/download

## Local Dev (no Docker)
See the repo-level README in previous messages.
