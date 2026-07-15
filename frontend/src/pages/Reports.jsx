import React, { useEffect } from 'react';
import { FileText } from 'lucide-react';

/**
 * The legacy "GST Reports & Export" page has been replaced by the unified
 * GST Filing Export module (GstFiling.jsx / /api/gst-filing).
 *
 * This component now redirects users there automatically.
 */
export default function Reports({ onNavigate }) {
  useEffect(() => {
    // Automatically redirect to the unified GST Filing page
    onNavigate('gst-filing');
  }, [onNavigate]);

  // Brief flash while redirect happens
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
        <FileText size={24} className="text-blue-600" />
      </div>
      <p className="text-sm text-gray-500">Redirecting to GST Filing…</p>
    </div>
  );
}
