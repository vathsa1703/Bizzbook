import React, { createContext, useContext, useState } from 'react';

const AIContext = createContext(null);

export function AIProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInitialContext, setChatInitialContext] = useState('');

  const openChat = (initialMessage = '') => {
    setChatInitialContext(initialMessage);
    setIsChatOpen(true);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setChatInitialContext('');
  };

  return (
    <AIContext.Provider value={{ isChatOpen, openChat, closeChat, chatInitialContext }}>
      {children}
    </AIContext.Provider>
  );
}

export const useAI = () => useContext(AIContext);
