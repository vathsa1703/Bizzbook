import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ isOpen = true, title, message, onConfirm, onCancel, confirmText = 'Delete', cancelText = 'Cancel', type = 'danger' }) {
  const btnColor = type === 'danger' ? 'bg-brand-red text-white hover:bg-red-700' : 'bg-brand-blue text-white hover:bg-blue-700';

  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${btnColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
