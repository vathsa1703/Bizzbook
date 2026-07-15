import { useState } from 'react';
import { api } from '../api/client';

// Simple UUID generator for session ID
const generateSessionId = () => Math.random().toString(36).substring(2, 15);

export function useAIChat() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(generateSessionId());

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    
    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    
    try {
      const response = await api.ai.chat(text, sessionId);
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: response.reply };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = { id: Date.now() + 1, role: 'assistant', content: `Error: ${err.message}`, isError: true };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return { messages, loading, sendMessage };
}
