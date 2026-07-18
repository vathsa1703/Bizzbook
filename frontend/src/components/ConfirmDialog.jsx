import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ isOpen = true, title, message, onConfirm, onCancel, confirmText = 'Delete', cancelText = 'Cancel', type = 'danger' }) {
  const btnColor = type === 'danger' ? 'bg-brand-red text-white hover:bg-red-700' : 'bg-accent text-white hover:bg-blue-600';

  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-inkB dark:text-inkB-dark leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 border border-gray-300 dark:border-edge-dark text-sm font-semibold text-inkB dark:text-inkB-dark rounded-xl hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${btnColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
