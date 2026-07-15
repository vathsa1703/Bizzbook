import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen = true, title, children, onClose, size = 'md' }) {
  if (!isOpen) return null;

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn">
      {/* Backdrop clickable area */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div
        className={`relative w-full ${sizeClasses[size] || sizeClasses.md} bg-white rounded-t-2xl sm:rounded-2xl shadow-card-md flex flex-col max-h-[85vh] sm:max-h-[90vh] overflow-hidden transform transition-all duration-300 animate-slideUp`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h3 className="text-lg font-bold text-gray-950">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 bg-gray-50/50">
          {children}
        </div>
      </div>
    </div>
  );
}
