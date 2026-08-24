# WhatsApp AI Bot Engine

A highly robust, anti-ban compliant, and hyper-natural WhatsApp AI assistant built using `@whiskeysockets/baileys`. 

This bot features a complex Semantic LLM routing architecture, dynamically switching between **NVIDIA NIM** and **Groq** APIs based on query complexity. It is designed to act exactly like a normal human (named "Mark") chatting on behalf of the owner, rather than a robotic AI assistant.

---

## 🌟 Key Features

- **Semantic Routing Architecture**: Analyzes incoming messages and routes them to either "Simple" (fast, lightweight models) or "Reasoning" (heavy, complex models) endpoints.
- **Multi-Provider Fallover**: Configured with automatic failovers between **NVIDIA NIM** (Primary) and **Groq** (Secondary). If one provider or model throws a 404/500, it automatically rotates keys and falls back to the next available model.
- **Anti-Ban Mechanisms**: Includes intelligent rate-limiting, randomized human-like typing delays, message deduplication, and read-receipt management to keep your number safe.
- **Live Web Dashboard**: A built-in sleek web interface (running on port 8100 by default) that displays real-time connection status, QR code scanning, and live terminal logs.
- **Hyper-Natural Persona**: The bot is heavily fine-tuned via `system.md` to perfectly mimic a human texting. It mirrors short answers (e.g. replying "sahi" to "ok"), uses minimal punctuation, avoids over-enthusiastic AI phrases, and knows exactly when to let a conversation naturally end.
- **Owner Security**: Strict authentication based on `SENDER_ROLE`. The bot blindly follows commands from the Owner while safely interacting with third-party users without leaking configurations.

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A WhatsApp account to link the bot to.
- API Keys from [NVIDIA API Catalog](https://build.nvidia.com/explore/discover) and/or [Groq](https://console.groq.com/keys).

### 2. Installation
Clone the repository and install the dependencies:

```bash
git clone <your-repo-url>
cd whatsapp-ai-bot-fixed
npm install
```

### 3. Configuration
Copy the `.env.example` to `.env` (or create a `.env` file) in the root directory and configure your variables:

```env
# Server
PORT=8100
HOST=0.0.0.0

# Bot Setup
OWNER_NUMBER=92300XXXXXXX # Your WhatsApp number with country code

# API Keys (Comma separated for key rotation)
NVIDIA_API_KEYS=your_nvidia_key_1,your_nvidia_key_2
GROQ_API_KEYS=your_groq_key_1,your_groq_key_2

# Provider Preference
DEFAULT_PROVIDER=nvidia
```

### 4. Running the Bot
Start the application:

```bash
npm start
```
Once started, you can open the Web Dashboard in your browser at `http://localhost:8100` to scan the QR code and monitor the logs.

---

## ⚙️ Advanced Customization

### The System Prompt (`system.md`)
The core persona and behavioral rules of the AI are defined in `system.md`. By default, the bot is instructed to act like a chill assistant named Mark. You can edit this file to fundamentally change the bot's tone, pacing, language rules, and constraints without touching the codebase. 

Changes to `system.md` are picked up automatically by the application.

### Admin Commands
If you are the Owner (messaging the bot from the `OWNER_NUMBER`), you can send the following commands via WhatsApp DMs:
- `/help` - Show available commands.
- `/status` - Check the active provider, model fallback status, and API key metrics.
- `/reset all` - Purge the active session and force a logout (useful if you want to switch numbers).

---

## 🛡️ Architecture & Routing

When a message is received:
1. **Fast-path**: Standard greetings (Hi, Assalamualaikum) bypass the router entirely for 0ms latency processing.
2. **Semantic Routing**: A lightweight model parses the text to determine if it requires logic/reasoning or just simple chat.
3. **Model Selection**: Based on the route, it selects the appropriate model tier (e.g., `minimax-m3` for simple chat, `glm-5.2` for reasoning).
4. **Resilience**: If the model produces "thinking/reasoning" blocks when it shouldn't, the engine automatically strips them out. If an API provider crashes, it instantly fails over to the next provider.

---

## 📝 License
This project is for educational and personal use. Keep API keys secure and respect WhatsApp's Terms of Service.
