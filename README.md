# WhatsApp Artifact Generation Engine

An enterprise-grade, anti-ban compliant **PDF & PowerPoint (.pptx) Artifact Generation Bot** built on `@whiskeysockets/baileys`.

Designed with a **Multi-Key Parallel AI Racing Engine** across **Groq** and **NVIDIA NIM**, this bot delivers publication-grade visual documents in **2–4 seconds** with strict per-user quotas and zero conversational bloat.

---

## 🌟 Key Features

- **Multi-Key Parallel AI Racing (`Promise.any`)**: Dispatches concurrent requests across up to 10 Groq API keys and NVIDIA NIM models. The fastest valid response wins instantly.
- **Dedicated Artifact Commands**:
  - `/pdf <topic>` — Generates rich, multi-page vector-styled PDF documents.
  - `/ppt <topic>` — Generates executive 16:9 PowerPoint presentation decks with cards, KPIs, tables, and comparison slides.
- **Quotas & Rate Limiting**:
  - **Standard Users**: Max **10 generations/day**, max **4 pages per PDF**, max **10 slides per PPT**, 30s anti-spam cooldown.
  - **Owner & VIP Users**: **Unlimited (∞)** generations and depth.
  - Check quota balance anytime with `/usage` or `/limit`.
- **Zero Conversational Bloat**: Completely removed all casual chat, persona rules, voice notes, and image chatter. The bot exclusively generates documents on command.
- **Live Web Dashboard**: Sleek web interface for live QR code pairing, multi-key health monitoring, and live generation analytics.

---

## 🚀 Getting Started

### 1. Configuration
Create a `.env` file from `.env.example`:

```env
PORT=8100
HOST=0.0.0.0
OWNER_NUMBER=92300XXXXXXX

# User Quotas
DAILY_USER_LIMIT=10
NORMAL_USER_MAX_PAGES=4
NORMAL_USER_MAX_SLIDES=10

# Groq Multi-Key Pool (Up to 10 keys)
GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3

# NVIDIA NIM Keys
NVIDIA_API_KEYS=nvapi-key1,nvapi-key2
```

### 2. Running
```bash
npm install
npm start
```
Open `http://localhost:8100` (or your Alwaysdata URL) to scan the QR code and monitor live generation logs.

---

## 📋 Commands

### User Commands (Available in all groups)
- `/pdf <topic>` ── Generate formatted PDF document
- `/ppt <topic>` ── Generate PowerPoint presentation
- `/usage` ── Check daily quota balance and reset time
- `/help` ── Display command guide

### Owner Commands
- `/status` ── Live system health, uptime, active keys
- `/stats` ── Generation analytics and top users
- `/keys` ── Multi-key health matrix
- `/unlimit <phone>` ── Grant permanent unlimited VIP access
- `/reset <phone | all>` ── Reset daily quota
