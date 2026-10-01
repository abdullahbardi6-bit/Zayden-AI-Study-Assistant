# ◈ ZAYDEN PROTOCOL V1.0

> *Microservices AI system — Core Brain (FastAPI) + Visual Interface (React / Three.js)*

```
d:\zay_ui\
├── zayden-core/          ← Python FastAPI — The Core Brain
│   ├── main.py
│   └── requirements.txt
└── zayden-ui/            ← React + Vite + Three.js — Visual Interface
    ├── src/
    │   ├── App.tsx       ← Main cyberpunk dashboard
    │   ├── main.tsx
    │   └── index.css
    ├── public/
    │   └── zayden-icon.svg
    ├── package.json
    ├── tailwind.config.js
    ├── vite.config.ts
    └── tsconfig.json
```

---

## LAUNCH — Backend (Core Brain)

```bash
# 1. Navigate to the backend folder
cd d:\zay_ui\zayden-core

# 2. Create & activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the FastAPI server (port 8000)
uvicorn main:app --reload --port 8000
```

Interactive docs available at → http://localhost:8000/docs

---

## LAUNCH — Frontend (Visual Interface)

```bash
# 1. Navigate to the frontend folder
cd d:\zay_ui\zayden-ui

# 2. Install Node dependencies (first time only)
npm install

# 3. Start the Vite dev server (port 5173)
npm run dev
```

Dashboard available at → http://localhost:5173

The Vite dev server proxies `/api/*` → `http://localhost:8000` automatically.

---

## API ENDPOINTS

| Method | Route                    | Description                          |
|--------|--------------------------|--------------------------------------|
| GET    | `/`                      | Health check — system status         |
| POST   | `/zayden-core`           | Send a prompt, get AI response       |
| GET    | `/zayden-core/status`    | Core Brain telemetry                 |
| GET    | `/docs`                  | Swagger interactive API docs         |

### Example — POST `/zayden-core`

```json
// Request
{
  "prompt": "Initialise neural pathways",
  "context": "dashboard"
}

// Response
{
  "status": "success",
  "input_prompt": "Initialise neural pathways",
  "response": "Neural pathways engaged. Processing input vector…",
  "tokens_processed": 3,
  "latency_ms": 127.5,
  "timestamp": 1719500000.0
}
```

---

## TECH STACK

| Layer     | Technology                            |
|-----------|---------------------------------------|
| Backend   | Python 3.11 · FastAPI · Uvicorn       |
| Frontend  | React 18 · TypeScript · Vite 5        |
| 3D Engine | Three.js r165 · @react-three/fiber    |
| Styling   | Tailwind CSS 3 · Custom neon tokens   |

---

## ROADMAP

- [ ] Connect a live LLM (Ollama / OpenAI) to `/zayden-core`
- [ ] Replace wireframe cube with a rigged 3D anime character (glTF)
- [ ] Add WebSocket streaming for real-time token output
- [ ] Voice input / TTS output pipeline
- [ ] Multi-agent orchestration layer
