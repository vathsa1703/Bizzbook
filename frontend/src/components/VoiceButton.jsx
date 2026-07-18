import React from 'react';
import { Mic, X, Loader2 } from 'lucide-react';

/**
 * VoiceButton — toggle mic button with pulse animation.
 *
 * Props:
 *   recording     bool  — mic is active
 *   transcribing  bool  — audio is uploading/processing
 *   onStart       fn    — called when user taps to start recording
 *   onStop        fn    — called when user taps to stop recording
 *   onCancel      fn    — called when user taps the cancel X during recording
 */
export default function VoiceButton({ recording, transcribing, onStart, onStop, onCancel }) {
  if (transcribing) {
    return (
      <button
        disabled
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-purple text-white"
        title="Transcribing…"
      >
        <Loader2 size={18} className="animate-spin" />
      </button>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Cancel button */}
        <button
          onClick={onCancel}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 text-inkB dark:text-inkB-dark transition-colors active:bg-gray-300"
          title="Cancel recording"
        >
          <X size={14} />
        </button>
        {/* Stop / send button with pulse ring */}
        <button
          onClick={onStop}
          className="relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-red text-white"
          title="Tap to stop and send"
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-brand-red opacity-30 animate-ping" />
          <Mic size={18} className="relative z-10" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onStart}
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-accent/10 dark:bg-accent/15 text-accent transition-colors active:bg-blue-100"
      title="Tap to record"
    >
      <Mic size={18} />
    </button>
  );
}
