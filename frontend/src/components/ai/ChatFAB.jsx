import React from 'react';
import { Sparkles } from 'lucide-react';
import { useAI } from '../../contexts/AIContext';
import ChatModal from './ChatModal';

export default function ChatFAB() {
  const { isChatOpen, openChat } = useAI();

  return (
    <>
      {!isChatOpen && (
        <button
          onClick={() => openChat()}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 w-14 h-14 bg-brand-purple text-white rounded-full shadow-xl shadow-brand-purple/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-40"
          aria-label="Open AI Advisor"
        >
          <Sparkles size={24} />
        </button>
      )}
      <ChatModal />
    </>
  );
}
