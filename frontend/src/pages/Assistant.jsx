import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, X, Send, Volume2, VolumeX, Loader2, Bot, ChevronDown } from 'lucide-react';
import ChatBubble from '../components/ChatBubble';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { api } from '../api/client';

// ─────────────────────────────────────────────
// Text-to-Speech helper (Web Speech API)
// ─────────────────────────────────────────────
function speak(text, onEnd) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 1.0;
  utter.pitch = 1.0;

  // Pick best English voice available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.localService)
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];
  if (preferred) utter.voice = preferred;

  utter.onend = onEnd || null;
  window.speechSynthesis.speak(utter);
}

function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

// ─────────────────────────────────────────────
// Animated mic waveform (CSS bars)
// ─────────────────────────────────────────────
function WaveAnimation({ active }) {
  const bars = [0.5, 1, 0.7, 1, 0.6, 0.9, 0.5];
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all ${active ? 'bg-brand-red' : 'bg-gray-300'}`}
          style={{
            height: active ? `${Math.round(h * 28)}px` : '4px',
            animation: active ? `wave ${0.5 + i * 0.08}s ease-in-out infinite alternate` : 'none',
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// Status label
// ─────────────────────────────────────────────
function StatusLabel({ recording, transcribing, thinking, speaking }) {
  if (recording)     return <p className="text-xs text-red-600 dark:text-red-400 dark:text-red-400 font-semibold animate-pulse">Listening…</p>;
  if (transcribing)  return <p className="text-xs text-violet-600 dark:text-violet-400 dark:text-violet-400 font-semibold">Processing voice…</p>;
  if (thinking)      return <p className="text-xs text-accent font-semibold">Thinking…</p>;
  if (speaking)      return <p className="text-xs text-green-600 dark:text-green-400 dark:text-green-400 font-semibold">Speaking…</p>;
  return <p className="text-xs text-gray-400 dark:text-slate-500">Tap mic to speak or type below</p>;
}

// ─────────────────────────────────────────────
// Main Assistant Page
// ─────────────────────────────────────────────
export default function Assistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm your AI Business Assistant. You can speak to me or type your question. Try asking: \"What were my best-selling products last month?\" or \"Are there any items that need restocking?\"",
    },
  ]);
  const [input, setInput]         = useState('');
  const [thinking, setThinking]   = useState(false);
  const [speaking, setSpeaking]   = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const messagesEndRef             = useRef(null);
  const inputRef                   = useRef(null);
  const sessionId                  = useRef(`voice_session_${Date.now()}`).current;

  useEffect(() => {
    // Pre-load voices (required by some browsers)
    window.speechSynthesis?.getVoices();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send text message to AI ──────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text !== undefined ? text : input).trim();
    if (!msg || thinking) return;

    setInput('');
    setMessages(m => [...m, { role: 'user', content: msg }]);
    setThinking(true);
    stopSpeaking();
    setSpeaking(false);

    try {
      const data = await api.ai.chat(msg, sessionId);
      const reply = data.reply || 'Sorry, I got an empty response. Please try again.';
      setMessages(m => [...m, { role: 'assistant', content: reply }]);

      // TTS — speak the reply if enabled
      if (ttsEnabled) {
        setSpeaking(true);
        speak(reply, () => setSpeaking(false));
      }
    } catch {
      const errMsg = 'Sorry, I had trouble reaching the server. Please check your connection and try again.';
      setMessages(m => [...m, { role: 'assistant', content: errMsg }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, ttsEnabled]);

  // ── Voice — transcript lands in input box first ──
  const handleTranscript = useCallback((text) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const { recording, transcribing, error, start, stop, cancel } =
    useVoiceRecorder(handleTranscript);

  const toggleTts = () => {
    if (speaking) stopSpeaking();
    setSpeaking(false);
    setTtsEnabled(v => !v);
  };

  const isActive = recording || transcribing || thinking || speaking;

  return (
    <div className="flex flex-col h-screen pb-20 bg-canvas dark:bg-canvas-dark">
      {/* ── Header ─────────────────────────────── */}
      <div className="bg-panel dark:bg-panel-dark px-5 pt-12 pb-4 border-b border-edge dark:border-edge-dark flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-accent flex items-center justify-center shadow-card-md">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-inkA dark:text-inkA-dark leading-tight">AI Assistant</h1>
            <p className="text-[10px] text-gray-400 dark:text-slate-500">Business Advisor · Voice & Text</p>
          </div>
        </div>
        {/* TTS toggle */}
        <button
          onClick={toggleTts}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            ttsEnabled ? 'bg-green-50 dark:bg-green-500/10 dark:bg-green-500/10 text-green-600 dark:text-green-400 dark:text-green-400' : 'bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500'
          }`}
          title={ttsEnabled ? 'Mute voice' : 'Unmute voice'}
        >
          {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* ── Chat history ────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pt-4 pb-2">
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} />
        ))}

        {/* Thinking indicator */}
        {thinking && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div className="bg-panel dark:bg-panel-dark shadow-card rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Voice Orb + Status ─────────────────── */}
      <div className="flex flex-col items-center py-4 gap-3 bg-panel dark:bg-panel-dark border-t border-edge dark:border-edge-dark">
        {/* Waveform animation */}
        <WaveAnimation active={recording} />

        {/* Status text */}
        <StatusLabel
          recording={recording}
          transcribing={transcribing}
          thinking={thinking}
          speaking={speaking}
        />

        {/* Big mic orb */}
        <div className="relative flex items-center justify-center">
          {/* Outer pulse ring — only when recording */}
          {recording && (
            <>
              <span className="absolute w-24 h-24 rounded-full bg-brand-red opacity-10 animate-ping" />
              <span className="absolute w-20 h-20 rounded-full bg-brand-red opacity-20 animate-ping" style={{ animationDelay: '150ms' }} />
            </>
          )}

          {/* Cancel button — shown during recording */}
          {recording && (
            <button
              onClick={cancel}
              className="absolute -right-12 w-10 h-10 rounded-full bg-gray-200 text-inkB dark:text-inkB-dark flex items-center justify-center active:bg-gray-300 transition-colors z-10"
              title="Cancel recording"
            >
              <X size={16} />
            </button>
          )}

          {/* Main mic button */}
          <button
            onClick={recording ? stop : transcribing ? undefined : start}
            disabled={transcribing || thinking}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center shadow-card-md transition-all z-10 ${
              recording
                ? 'bg-brand-red text-white scale-110'
                : transcribing || thinking
                ? 'bg-gray-200 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-accent text-white active:scale-95'
            }`}
            title={recording ? 'Tap to stop' : 'Tap to speak'}
          >
            {transcribing ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <Mic size={24} />
            )}
          </button>
        </div>

        {/* Speaking indicator + stop button */}
        {speaking && (
          <button
            onClick={() => { stopSpeaking(); setSpeaking(false); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-500/10 dark:bg-green-500/10 text-green-600 dark:text-green-400 dark:text-green-400 text-xs font-semibold"
          >
            <Volume2 size={12} />
            Speaking — tap to stop
          </button>
        )}
      </div>

      {/* ── Error banners ──────────────────────── */}
      {error === 'mic_denied' && (
        <p className="text-xs text-red-600 dark:text-red-400 dark:text-red-400 text-center px-4 py-2 bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10">
          Microphone access denied. Please allow mic access in browser settings.
        </p>
      )}
      {error === 'transcription_failed' && (
        <p className="text-xs text-amber-600 dark:text-amber-400 dark:text-amber-400 text-center px-4 py-2 bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10">
          Transcription failed. Please try again or type your question below.
        </p>
      )}

      {/* ── Transcription preview + text input ─── */}
      {input && !recording && !transcribing && (
        <div className="px-4 py-1 bg-accent/10 dark:bg-accent/15 border-t border-blue-200 dark:border-blue-500/25">
          <p className="text-xs text-accent font-semibold mb-1">Transcribed — edit if needed:</p>
        </div>
      )}
      <div className="px-4 pb-4 bg-canvas dark:bg-canvas-dark border-t border-edge dark:border-edge-dark pt-2">
        <div className={`flex items-center gap-2 bg-panel dark:bg-panel-dark rounded-2xl shadow-card px-3 py-2 transition-all ${input ? 'ring-2 ring-brand-blue ring-opacity-30' : ''}`}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !thinking && sendMessage()}
            placeholder={
              transcribing ? 'Transcribing your voice…'
              : recording   ? 'Recording…'
              : 'Type or use the mic above…'
            }
            className="flex-1 text-sm outline-none bg-transparent text-inkA dark:text-inkA-dark placeholder-gray-400"
            disabled={recording || transcribing}
          />
          {input && (
            <button
              onClick={() => setInput('')}
              className="text-gray-300 dark:text-slate-600 hover:text-gray-500 transition-colors"
            >
              <X size={14} />
            </button>
          )}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || thinking || recording || transcribing}
            className="w-9 h-9 rounded-full bg-accent flex items-center justify-center disabled:opacity-40 transition-opacity flex-shrink-0"
          >
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}