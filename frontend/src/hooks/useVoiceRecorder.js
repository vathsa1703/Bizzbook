import { useState, useRef, useCallback } from 'react';
import { api } from '../api/client';

/**
 * useVoiceRecorder — toggle-mode voice recorder with cancel support.
 *
 * @param {(text: string) => void} onTranscript  Called with final transcription text.
 * @returns {{ recording, transcribing, error, start, stop, cancel }}
 *
 * Flow:
 *   start()  → browser records audio (MediaRecorder)
 *   stop()   → sends audio blob to /api/voice/transcribe, calls onTranscript(text)
 *   cancel() → discards chunks, stops mic — nothing is sent
 */
export function useVoiceRecorder(onTranscript) {
  const [recording, setRecording]     = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError]             = useState(null); // null | 'mic_denied' | 'transcription_failed'

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const streamRef        = useRef(null);
  const cancelledRef     = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        // Stop all mic tracks
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        // If user cancelled, discard
        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }

        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        if (blob.size < 1000) {
          // Too short — probably no speech captured
          setError(null);
          return;
        }

        setTranscribing(true);
        try {
          const data = await api.transcribe(blob);
          if (data.text && data.text.trim()) {
            onTranscript(data.text.trim());
          }
        } catch (err) {
          console.error('Transcription failed', err);
          setError('transcription_failed');
        } finally {
          setTranscribing(false);
        }
      };

      mr.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      console.error('Mic access denied', err);
      setError('mic_denied');
    }
  }, [onTranscript]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      cancelledRef.current = false;
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setRecording(false);
    }
  }, [recording]);

  const cancel = useCallback(() => {
    if (mediaRecorderRef.current) {
      cancelledRef.current = true;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    setRecording(false);
    setTranscribing(false);
    setError(null);
  }, []);

  return { recording, transcribing, error, start, stop, cancel };
}
