import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen = true, title, children, onClose, size = 'md' }) {
  // useEffect must run unconditionally on every render (Rules of Hooks) — the isOpen
  // check has to happen after it, not before, or the hook is conditionally skipped
  // depending on isOpen, which corrupts React's hook-order bookkeeping across renders.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn">
      {/* Backdrop clickable area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div
        className={`relative w-full ${sizeClasses[size] || sizeClasses.md} bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-t-2xl sm:rounded-xl shadow-card-md dark:shadow-none flex flex-col max-h-[85vh] sm:max-h-[90vh] overflow-hidden transform transition-all duration-300 animate-slideUp`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge dark:border-edge-dark bg-panel dark:bg-panel-dark sticky top-0 z-10">
          <h3 className="text-lg font-bold text-inkA dark:text-inkA-dark">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 bg-canvas/60 dark:bg-canvas-dark/60">
          {children}
        </div>
      </div>
    </div>
  );
}
