import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE_URL: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:8000'
const TERMINAL_ENDPOINT = `${API_BASE_URL}/api/terminal/command`
const UPLOAD_ENDPOINT   = `${API_BASE_URL}/api/upload`
const LINES_CAP   = 500
const HISTORY_CAP = 10
const OTHERS_SUBJECT = 'Others'

const SUBJECTS = ['DSU', 'OOP using c++', 'CGR', 'DMS', 'DTE', OTHERS_SUBJECT] as const
type Subject = typeof SUBJECTS[number]

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:          '#f0f2f5',
  surface:     '#ffffff',
  border:      '#e4e7ec',
  txt:         '#101828',
  txt2:        '#667085',
  muted:       '#98a2b3',
  accent:      '#6366f1',
  accentDark:  '#4f46e5',
  accentLight: '#eef2ff',
  green:       '#12b76a',
  greenLight:  '#ecfdf3',
  red:         '#f04438',
  redLight:    '#fef3f2',
  amber:       '#f79009',
  amberLight:  '#fffaeb',
  userBg:      '#6366f1',
  userTxt:     '#ffffff',
  shadow:      '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.1)',
  shadowMd:    '0 4px 8px rgba(16,24,40,0.06), 0 2px 4px rgba(16,24,40,0.04)',
  shadowLg:    '0 12px 24px rgba(16,24,40,0.08), 0 4px 8px rgba(16,24,40,0.06)',
  r:           '12px',
  rSm:         '8px',
  rFull:       '9999px',
  font:        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Role         = 'user' | 'system' | 'error'
type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface Line { id: string; role: Role; text: string }
interface Turn { role: 'user' | 'assistant'; content: string }

interface ApiResponse {
  output: string
  status: 'ok' | 'error'
  audio_base64?: string
}

interface UploadResp {
  subject: string
  filename: string
  pages: number
  chars_extracted: number
  message: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
let _c = 0
function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `z-${Date.now()}-${(_c++).toString(36)}`
}
const line = (role: Role, text: string): Line => ({ id: uid(), role, text })
const welcome = (s: Subject): Line =>
  line('system',
    s === OTHERS_SUBJECT
      ? "Welcome to General Chat! Ask me anything — I'll search the web and answer."
      : `Welcome to ${s}! Upload your notes PDF, then ask questions about this subject.`)

function initMap<V>(fn: (s: Subject) => V): Record<string, V> {
  const m: Record<string, V> = {}
  SUBJECTS.forEach(s => { m[s] = fn(s) })
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// SpeechRecognition types (no @types package)
// ─────────────────────────────────────────────────────────────────────────────
interface SREvent extends Event { readonly results: SpeechRecognitionResultList }
interface SRInstance extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string
  start(): void; stop(): void; abort(): void
  onresult: ((e: SREvent) => void) | null
  onerror:  ((e: Event)  => void) | null
  onend:    ((e: Event)  => void) | null
}
type SRConstructor = new () => SRInstance
function getSR(): SRConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as SRConstructor | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Global CSS keyframes (injected once)
// ─────────────────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes slideUpFadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dotBounce {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.75) translateY(0); }
    40%           { opacity: 1;   transform: scale(1)    translateY(-4px); }
  }
  @keyframes tabSlide {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }
  @keyframes micPulse {
    0%  { box-shadow: 0 0 0 0   rgba(240,68,56,0.55); }
    70% { box-shadow: 0 0 0 10px rgba(240,68,56,0);    }
    100%{ box-shadow: 0 0 0 0   rgba(240,68,56,0);     }
  }
  @keyframes spinIn {
    from { opacity: 0; transform: scale(0.85) rotate(-4deg); }
    to   { opacity: 1; transform: scale(1)    rotate(0deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #d0d5dd; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #98a2b3; }

  .tool-btn {
    display: flex; align-items: center; gap: 9px;
    width: 100%; padding: 10px 14px;
    border-radius: 8px; border: none;
    font-size: 13.5px; font-weight: 600; cursor: pointer;
    text-align: left;
    box-shadow: 0 1px 3px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.04);
    transition: transform 0.18s ease, box-shadow 0.2s ease, filter 0.15s ease;
    color: #fff;
  }
  .tool-btn:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02);
    filter: brightness(1.05);
    box-shadow: 0 10px 24px rgba(99,102,241,0.22), 0 4px 8px rgba(99,102,241,0.12);
  }
  .tool-btn:active:not(:disabled) {
    transform: translateY(0) scale(0.99);
    box-shadow: 0 1px 2px rgba(16,24,40,0.06);
    filter: brightness(0.97);
  }
  .tool-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .send-btn {
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s;
  }
  .send-btn:hover:not(:disabled) {
    transform: scale(1.08);
    box-shadow: 0 4px 12px rgba(99,102,241,0.4);
  }
  .send-btn:active:not(:disabled) { transform: scale(0.95); }
  .send-btn:disabled { cursor: not-allowed; }

  .upload-btn {
    width: 100%; padding: 8px 0;
    border: none; border-radius: 8px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s;
  }
  .upload-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99,102,241,0.35);
  }
  .upload-btn:active:not(:disabled) { transform: translateY(0); }
  .upload-btn:disabled { cursor: not-allowed; }

  .drop-zone {
    border-radius: 8px; padding: 11px 12px;
    cursor: pointer; text-align: center; margin-bottom: 9px;
    transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.15s ease;
  }
  .drop-zone:hover { transform: scale(1.01); }
`

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Per-tab isolated state ────────────────────────────────────────────────
  const [tabLines,    setTabLines]    = useState<Record<string, Line[]>>(() => initMap(s => [welcome(s)]))
  const [tabConvs,    setTabConvs]    = useState<Record<string, Turn[]>>(() => initMap(() => []))
  const [tabCmdHist,  setTabCmdHist]  = useState<Record<string, string[]>>(() => initMap(() => []))

  // ── Shared UI state ───────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState<Subject>(SUBJECTS[0])
  const [input,         setInput]         = useState('')
  const [isProcessing,  setIsProcessing]  = useState(false)
  const [isSpeaking,    setIsSpeaking]    = useState(false)
  const [isListening,   setIsListening]   = useState(false)
  const [uploadedTabs,  setUploadedTabs]  = useState<Set<string>>(() => new Set([OTHERS_SUBJECT]))

  // ── Upload UI state ───────────────────────────────────────────────────────
  const [uploadFile,    setUploadFile]    = useState<File | null>(null)
  const [uploadStatus,  setUploadStatus]  = useState<UploadStatus>('idle')
  const [uploadMsg,     setUploadMsg]     = useState('')

  // ── Refs ──────────────────────────────────────────────────────────────────
  const histIdxRef  = useRef(-1)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const abortRef    = useRef<AbortController | null>(null)
  const speakRef    = useRef<SpeechSynthesisUtterance | null>(null)
  const audioRef    = useRef<HTMLAudioElement | null>(null)
  const srRef       = useRef<SRInstance | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────────
  const lines      = tabLines[activeTab]   ?? [welcome(activeTab)]
  const convHist   = tabConvs[activeTab]   ?? []
  const cmdHist    = tabCmdHist[activeTab] ?? []
  const isOthers   = activeTab === OTHERS_SUBJECT
  const pdfLoaded  = uploadedTabs.has(activeTab)

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines])

  // ── Reset input on tab switch ─────────────────────────────────────────────
  useEffect(() => {
    histIdxRef.current = -1
    setInput('')
  }, [activeTab])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      srRef.current?.abort()
      window.speechSynthesis?.cancel()
      audioRef.current?.pause()
    }
  }, [])

  // ── Push line to a specific tab ───────────────────────────────────────────
  const push = useCallback((tab: Subject, role: Role, text: string) => {
    setTabLines(prev => {
      const cur  = prev[tab] ?? [welcome(tab)]
      const next = [...cur, line(role, text)]
      return { ...prev, [tab]: next.length > LINES_CAP ? next.slice(-LINES_CAP) : next }
    })
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────
  const playAudio = useCallback((text: string, b64?: string) => {
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)

    if (b64) {
      try {
        const bytes = atob(b64)
        const arr   = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
        const url   = URL.createObjectURL(new Blob([arr], { type: 'audio/mpeg' }))
        const aud   = new Audio(url)
        audioRef.current = aud
        aud.onplay  = () => setIsSpeaking(true)
        aud.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null }
        aud.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null }
        aud.play().catch(e => { console.error('[Z] audio play', e); setIsSpeaking(false) })
        return
      } catch (e) { console.error('[Z] b64 decode', e) }
    }

    // Fallback: browser TTS
    const cleaned = text.replace(/```[\s\S]*?```/g, 'code block.').replace(/[#*`_~]/g, '').trim()
    if (!cleaned || !window.speechSynthesis) return
    const utt   = new SpeechSynthesisUtterance(cleaned)
    utt.pitch   = 0.85; utt.rate = 0.88; utt.volume = 1
    utt.onstart = () => setIsSpeaking(true)
    utt.onend   = () => { setIsSpeaking(false); speakRef.current = null }
    utt.onerror = () => { setIsSpeaking(false); speakRef.current = null }
    speakRef.current = utt
    window.speechSynthesis.speak(utt)
  }, [])

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!uploadFile) { setUploadStatus('error'); setUploadMsg('Select a PDF first.'); return }
    if (isOthers)    { setUploadStatus('error'); setUploadMsg("'Others' tab needs no upload."); return }
    setUploadStatus('uploading'); setUploadMsg(`Uploading "${uploadFile.name}"…`)

    const form = new FormData()
    form.append('file', uploadFile); form.append('subject', activeTab)
    try {
      const res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: form })
      if (!res.ok) {
        let d = `HTTP ${res.status}`
        try { const b = await res.json() as { detail?: unknown }; if (b.detail) d = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail) } catch { /* */ }
        setUploadStatus('error'); setUploadMsg(`Failed: ${d}`)
        push(activeTab, 'error', `Upload error [${activeTab}]: ${d}`)
        return
      }
      const data = await res.json() as UploadResp
      setUploadStatus('success'); setUploadMsg(data.message)
      setUploadFile(null); if (fileRef.current) fileRef.current.value = ''
      setUploadedTabs(prev => new Set([...prev, activeTab]))
      push(activeTab, 'system', `✓ ${data.subject} notes uploaded — ${data.chars_extracted.toLocaleString()} chars from ${data.pages} pages. Ready!`)
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'Network error'
      setUploadStatus('error'); setUploadMsg(`Failed: ${m}`)
      push(activeTab, 'error', `Upload failed: ${m}`)
      console.error('[Z] upload', e)
    }
  }, [uploadFile, activeTab, isOthers, push])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const SR = getSR()
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Backspace — stop mic + clear
      if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault()
        srRef.current?.stop(); srRef.current = null; setIsListening(false); setInput('')
        return
      }
      // Ctrl+Shift — start mic
      if (e.ctrlKey && e.shiftKey && e.key === 'Shift') {
        e.preventDefault()
        if (!SR) { push(activeTab, 'error', 'Voice input not supported in this browser.'); return }
        if (srRef.current) return
        const rec = new SR()
        rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN'
        rec.onresult = (ev: SREvent) => {
          let t = ''
          for (let i = ev.results.length - 1; i >= 0; i--) { t = ev.results[i][0].transcript; break }
          setInput(t)
        }
        rec.onerror = () => { setIsListening(false); srRef.current = null }
        rec.onend   = () => { setIsListening(false); srRef.current = null }
        srRef.current = rec; rec.start(); setIsListening(true)
        push(activeTab, 'system', '🎤 Listening… Ctrl+Enter to send · Ctrl+Backspace to cancel.')
        return
      }
      // Ctrl+Enter — stop + submit
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        srRef.current?.stop(); srRef.current = null; setIsListening(false)
        inputRef.current?.form?.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKey)

    // Alt key — immediately stop any playing AI audio / TTS
    const onAlt = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        audioRef.current?.pause()
        audioRef.current = null
        window.speechSynthesis?.cancel()
        setIsSpeaking(false)
      }
    }
    window.addEventListener('keydown', onAlt)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onAlt)
    }
  }, [push, activeTab])

  // ── Core fetch pipeline ───────────────────────────────────────────────────
  const dispatch = useCallback(async (cmd: string) => {
    if (!cmd || isProcessing) return
    const tab = activeTab
    srRef.current?.stop(); srRef.current = null; setIsListening(false)

    push(tab, 'user', cmd)
    setInput(''); histIdxRef.current = -1
    setTabCmdHist(prev => ({ ...prev, [tab]: [cmd, ...(prev[tab] ?? [])] }))

    if (cmd.toLowerCase() === 'clear') {
      setTabLines(prev => ({ ...prev, [tab]: [welcome(tab)] }))
      setTabConvs(prev => ({ ...prev, [tab]: [] }))
      return
    }

    const snapshot = convHist
    setTabConvs(prev => {
      const cur     = prev[tab] ?? []
      const updated = [...cur, { role: 'user' as const, content: cmd }]
      return { ...prev, [tab]: updated.length > HISTORY_CAP ? updated.slice(-HISTORY_CAP) : updated }
    })

    setIsProcessing(true)
    const ctrl = new AbortController(); abortRef.current = ctrl
    const tid  = window.setTimeout(() => ctrl.abort(), 15_000)

    try {
      const res = await fetch(TERMINAL_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ command: cmd, history: snapshot.slice(-10), subject: tab }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        let d = `HTTP ${res.status}`
        try { const b = await res.json() as { detail?: unknown }; if (b.detail) d = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail) } catch { /* */ }
        push(tab, 'error', `Request failed: ${d}`)
      } else {
        const data   = await res.json() as ApiResponse
        const output = typeof data.output === 'string' ? data.output : JSON.stringify(data.output)
        push(tab, 'system', output)
        setTabConvs(prev => {
          const cur     = prev[tab] ?? []
          const updated = [...cur, { role: 'assistant' as const, content: output }]
          return { ...prev, [tab]: updated.length > HISTORY_CAP ? updated.slice(-HISTORY_CAP) : updated }
        })
        playAudio(output, data.audio_base64)
      }
    } catch (e: unknown) {
      push(tab, 'error',
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Request timed out (15 s). Is the backend running?'
          : 'Could not reach backend on :8000.')
      console.error('[Z] fetch', e)
    } finally {
      window.clearTimeout(tid); abortRef.current = null
      setIsProcessing(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isProcessing, push, playAudio, convHist, activeTab])

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); void dispatch(input.trim())
  }, [input, dispatch])

  const handleQuick = useCallback((p: string) => { void dispatch(p) }, [dispatch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const n = Math.min(histIdxRef.current + 1, cmdHist.length - 1)
      histIdxRef.current = n; setInput(cmdHist[n] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const n = Math.max(histIdxRef.current - 1, -1)
      histIdxRef.current = n; setInput(n === -1 ? '' : (cmdHist[n] ?? ''))
    }
  }, [cmdHist])

  const switchTab = useCallback((t: Subject) => {
    setActiveTab(t); setUploadFile(null); setUploadStatus('idle'); setUploadMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        backgroundColor: C.bg, fontFamily: C.font, color: C.txt, overflow: 'hidden',
        animation: 'fadeIn 0.4s ease',
      }}>

        {/* ── TOP HEADER ─────────────────────────────────────────────────── */}
        <header style={{
          display: 'flex', alignItems: 'stretch',
          backgroundColor: C.surface,
          borderBottom: `1px solid ${C.border}`,
          boxShadow: '0 1px 0 #e4e7ec, 0 2px 8px rgba(16,24,40,0.04)',
          padding: '0 24px', flexShrink: 0, height: '56px',
        }}>
          {/* Brand */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            paddingRight: '20px', marginRight: '16px',
            borderRight: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
            }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '16px' }}>Z</span>
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: C.txt, lineHeight: 1.2 }}>Zayden</p>
              <p style={{ margin: 0, fontSize: '10px', color: C.muted, lineHeight: 1.2 }}>AI Study Assistant</p>
            </div>
          </div>

          {/* Tab bar */}
          <nav style={{ display: 'flex', alignItems: 'stretch', flex: 1, gap: '0' }}>
            {SUBJECTS.map(tab => {
              const active  = tab === activeTab
              const loaded  = uploadedTabs.has(tab)
              return (
                <button
                  key={tab}
                  onClick={() => switchTab(tab)}
                  style={{
                    position: 'relative',
                    padding: '0 18px',
                    border: 'none',
                    background: active ? 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' : 'transparent',
                    color: active ? C.accent : C.txt2,
                    fontSize: '13.5px',
                    fontWeight: active ? 600 : 400,
                    fontFamily: C.font,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'background 0.2s ease, color 0.2s ease',
                    borderRadius: '0',
                    outline: 'none',
                  }}
                >
                  {tab}
                  {loaded && (
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      backgroundColor: C.green, flexShrink: 0,
                      boxShadow: `0 0 0 2px ${C.greenLight}`,
                    }} />
                  )}
                  {/* Animated bottom border for active tab */}
                  {active && (
                    <span style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: '2.5px',
                      backgroundColor: C.accent,
                      borderRadius: '2px 2px 0 0',
                      transformOrigin: 'left',
                      animation: 'tabSlide 0.2s ease forwards',
                    }} />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Status indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            borderLeft: `1px solid ${C.border}`, paddingLeft: '16px',
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              backgroundColor: isListening ? C.red : isProcessing ? C.amber : C.green,
              animation: isListening ? 'micPulse 1.2s infinite' : 'none',
            }} />
            <span style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>
              {isListening ? 'Recording' : isProcessing ? 'Thinking…' : isSpeaking ? 'Speaking' : 'Ready'}
            </span>
          </div>
        </header>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
          <aside style={{
            width: '260px', minWidth: '260px',
            backgroundColor: C.surface,
            borderRight: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }}>

            {/* Upload section */}
            <div style={{ padding: '18px 16px', borderBottom: `1px solid ${C.border}` }}>
              {isOthers ? (
                <div style={{
                  padding: '12px', borderRadius: C.rSm,
                  backgroundColor: C.accentLight,
                  border: `1px solid #c7d7fe`,
                }}>
                  <p style={{ margin: 0, fontSize: '12.5px', color: C.accent, lineHeight: 1.5 }}>
                    <strong>General Chat</strong><br />
                    No PDF needed. Ask anything and I'll search the web for you.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Upload Notes — {activeTab}
                  </p>
                  <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null
                      setUploadFile(f); setUploadStatus('idle'); setUploadMsg(f ? f.name : '')
                    }} />
                  <div
                    className="drop-zone"
                    onClick={() => fileRef.current?.click()}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
                    style={{
                      border: `1.5px dashed ${pdfLoaded && !uploadFile ? C.green : uploadFile ? C.accent : C.border}`,
                      backgroundColor: pdfLoaded && !uploadFile ? C.greenLight : uploadFile ? C.accentLight : C.bg,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '12.5px', color: pdfLoaded && !uploadFile ? C.green : uploadFile ? C.accent : C.muted }}>
                      {pdfLoaded && !uploadFile
                        ? '✓ Notes loaded'
                        : uploadFile
                          ? `📄 ${uploadFile.name.length > 22 ? uploadFile.name.slice(0, 20) + '…' : uploadFile.name}`
                          : '+ Click to choose PDF'}
                    </p>
                  </div>
                  <button
                    className="upload-btn"
                    onClick={handleUpload}
                    disabled={!uploadFile || uploadStatus === 'uploading'}
                    style={{
                      backgroundColor: uploadFile && uploadStatus !== 'uploading' ? C.accent : '#d0d5dd',
                      color: '#fff',
                      fontFamily: C.font,
                    }}
                  >
                    {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload to Brain'}
                  </button>
                  {uploadMsg && (
                    <p style={{
                      margin: '7px 0 0', fontSize: '11.5px', lineHeight: 1.4,
                      color: uploadStatus === 'success' ? C.green : uploadStatus === 'error' ? C.red : C.muted,
                    }}>
                      {uploadMsg}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* AI Tools */}
            <div style={{ padding: '16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                AI Tools
              </p>
              {[
                {
                  e: '📋', l: 'Summary',
                  p: 'Generate a detailed, bulleted summary of the uploaded document for this subject.',
                  grad: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  glow: 'rgba(99,102,241,0.35)',
                },
                {
                  e: '🃏', l: 'Flashcards',
                  p: 'Create 5 important study flashcards (Question & Answer format) based on the uploaded document.',
                  grad: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                  glow: 'rgba(6,182,212,0.35)',
                },
                {
                  e: '🧩', l: 'Quiz Me',
                  p: 'Generate a 3-question multiple-choice quiz based on the uploaded document, and wait for my answers.',
                  grad: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                  glow: 'rgba(245,158,11,0.35)',
                },
                {
                  e: '🕐', l: 'History',
                  p: 'Please provide a brief summary of all the questions and topics we have discussed in this chat session so far.',
                  grad: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  glow: 'rgba(16,185,129,0.35)',
                },
                {
                  e: '📝', l: 'MSBTE Practice Paper',
                  p: `Using your web search capabilities, find the MSBTE diploma computer engineering exam pattern and syllabus. Generate a complete, professional practice question paper for the current subject (${activeTab}) based on that specific MSBTE format.`,
                  grad: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                  glow: 'rgba(236,72,153,0.35)',
                },
              ].map(({ e, l, p, grad, glow }) => (
                <div key={l} style={{ marginBottom: '7px' }}>
                  <button
                    className="tool-btn"
                    disabled={isProcessing}
                    onClick={() => handleQuick(p)}
                    style={{ fontFamily: C.font, background: grad, boxShadow: `0 2px 8px ${glow}` }}
                  >
                    <span style={{ fontSize: '16px' }}>{e}</span>
                    {l}
                  </button>
                </div>
              ))}
            </div>

            {/* Shortcuts */}
            <div style={{
              marginTop: 'auto', padding: '14px 16px',
              borderTop: `1px solid ${C.border}`,
              backgroundColor: C.bg,
            }}>
              <p style={{ margin: '0 0 8px', fontSize: '10px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Keyboard Shortcuts
              </p>
              {[
                ['Ctrl+Shift',     'Start voice'],
                ['Ctrl+Enter',     'Send / stop mic'],
                ['Ctrl+Backspace', 'Cancel mic'],
                ['↑ / ↓',          'History'],
              ].map(([k, d]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <code style={{ fontSize: '10px', backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: '4px', padding: '1px 6px', color: C.txt2 }}>
                    {k}
                  </code>
                  <span style={{ fontSize: '10px', color: C.muted }}>{d}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* ── CHAT ──────────────────────────────────────────────────────── */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: C.bg }}>

            {/* Chat header */}
            <div style={{
              padding: '10px 24px',
              backgroundColor: C.surface,
              borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
              boxShadow: '0 1px 4px rgba(16,24,40,0.04)',
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '14.5px' }}>
                  {activeTab}{!isOthers ? ' — Study Chat' : ' — General Chat'}
                </p>
                <p style={{ margin: 0, fontSize: '11.5px', color: C.muted }}>
                  {isOthers ? 'Ask anything · Powered by Tavily + Groq'
                    : pdfLoaded ? 'Notes loaded · Ask questions below'
                    : 'Upload your notes to get started'}
                </p>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 12px', borderRadius: C.rFull,
                backgroundColor: isProcessing ? C.amberLight : C.greenLight,
                border: `1px solid ${isProcessing ? C.amber + '55' : C.green + '55'}`,
              }}>
                <div style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  backgroundColor: isProcessing ? C.amber : C.green,
                }} />
                <span style={{ fontSize: '12px', fontWeight: 500, color: isProcessing ? C.amber : C.green }}>
                  {isProcessing ? 'Processing' : 'Online'}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div
              role="log" aria-live="polite" aria-label={`${activeTab} messages`}
              style={{
                flex: 1, overflowY: 'auto',
                padding: '24px 28px',
                display: 'flex', flexDirection: 'column', gap: '16px',
              }}
            >
              {lines.map(ln => {
                const isUser  = ln.role === 'user'
                const isError = ln.role === 'error'
                return (
                  <div
                    key={ln.id}
                    style={{
                      display: 'flex',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      alignItems: 'flex-end', gap: '10px',
                      animation: 'slideUpFadeIn 0.3s cubic-bezier(0.22,1,0.36,1) both',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700,
                      backgroundColor: isUser ? C.userBg : isError ? C.redLight : '#f2f4f7',
                      color: isUser ? '#fff' : isError ? C.red : C.txt2,
                      boxShadow: isUser ? '0 2px 8px rgba(99,102,241,0.35)' : C.shadow,
                    }}>
                      {isUser ? 'U' : isError ? '!' : 'Z'}
                    </div>

                    {/* Bubble */}
                    <div style={{
                      maxWidth: '70%',
                      padding: '11px 15px',
                      borderRadius: isUser
                        ? `${C.r} ${C.rSm} ${C.r} ${C.r}`
                        : `${C.rSm} ${C.r} ${C.r} ${C.r}`,
                      background: isUser
                        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                        : isError
                          ? C.redLight
                          : 'linear-gradient(135deg, #f8f9ff 0%, #f3f4f6 100%)',
                      color: isUser ? C.userTxt : isError ? C.red : C.txt,
                      fontSize: '14px', lineHeight: 1.65,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      boxShadow: isUser
                        ? '0 4px 14px rgba(99,102,241,0.30)'
                        : isError ? 'none' : C.shadowMd,
                      border: isError ? `1px solid ${C.red}33` : 'none',
                    }}>
                      {ln.text}
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {isProcessing && (
                <div style={{
                  display: 'flex', alignItems: 'flex-end', gap: '10px',
                  animation: 'slideUpFadeIn 0.3s cubic-bezier(0.22,1,0.36,1)',
                }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 700,
                    backgroundColor: '#f2f4f7', color: C.txt2, boxShadow: C.shadow, flexShrink: 0,
                  }}>Z</div>
                  <div style={{
                    padding: '13px 16px',
                    borderRadius: `${C.rSm} ${C.r} ${C.r} ${C.r}`,
                    backgroundColor: C.surface, boxShadow: C.shadowMd,
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        backgroundColor: C.muted,
                        animation: `dotBounce 1.2s ease-in-out ${i * 0.18}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={scrollRef} />
            </div>

            {/* Input bar */}
            <div style={{
              padding: '14px 24px 18px',
              backgroundColor: C.surface,
              borderTop: `1px solid ${C.border}`,
              flexShrink: 0,
              boxShadow: '0 -2px 8px rgba(16,24,40,0.04)',
            }}>
              <form
                onSubmit={handleSubmit}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  backgroundColor: isListening ? '#fff5f5' : C.bg,
                  border: `1.5px solid ${isListening ? C.red + 'aa' : C.border}`,
                  borderRadius: C.r, padding: '8px 10px',
                  boxShadow: isListening
                    ? `0 0 0 3px ${C.red}22`
                    : '0 1px 4px rgba(16,24,40,0.06)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                }}
              >
                <span style={{
                  fontSize: '17px', flexShrink: 0,
                  color: isListening ? C.red : C.muted,
                  animation: isListening ? 'micPulse 1.2s infinite' : 'none',
                  transition: 'color 0.2s ease',
                }}>
                  {isListening ? '🎤' : '💬'}
                </span>

                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isProcessing}
                  placeholder={
                    isListening ? 'Listening… Ctrl+Enter to send · Ctrl+Backspace to cancel'
                    : isProcessing ? 'Zayden is thinking…'
                    : isOthers ? 'Ask anything…'
                    : pdfLoaded ? `Ask about ${activeTab}…`
                    : `Upload ${activeTab} notes first, then ask…`
                  }
                  aria-label="Chat input"
                  autoComplete="off" spellCheck={false}
                  style={{
                    flex: 1, border: 'none', outline: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '14px', fontFamily: C.font, color: C.txt,
                    opacity: isProcessing ? 0.5 : 1,
                  }}
                />

                <button
                  className="send-btn"
                  type="submit"
                  disabled={isProcessing || !input.trim()}
                  style={{
                    width: '34px', height: '34px', borderRadius: '9px',
                    backgroundColor: isProcessing || !input.trim() ? '#e4e7ec' : C.accent,
                    color: isProcessing || !input.trim() ? C.muted : '#fff',
                    fontSize: '16px',
                    boxShadow: isProcessing || !input.trim() ? 'none' : '0 2px 8px rgba(99,102,241,0.35)',
                    fontFamily: C.font,
                  }}
                  aria-label="Send"
                >
                  ↑
                </button>
              </form>

              <p style={{ margin: '6px 0 0', fontSize: '10.5px', color: C.muted, textAlign: 'center' }}>
                Ctrl+Shift: voice · Ctrl+Enter: send · Ctrl+Backspace: cancel · ↑↓: history
              </p>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
