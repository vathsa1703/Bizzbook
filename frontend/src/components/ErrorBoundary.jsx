import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-panel2 dark:bg-panel2-dark flex items-center justify-center p-6">
          <div className="bg-panel dark:bg-panel-dark max-w-md w-full rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-8 text-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-red-500 dark:text-red-400" size={32} />
            </div>
            <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark mb-2">Something went wrong</h1>
            <p className="text-sm text-inkB dark:text-inkB-dark mb-8">
              A critical error occurred while rendering this page. The system administrator has been notified.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-gray-900 text-inkA dark:text-inkA-dark font-semibold active:bg-gray-800 transition-colors"
            >
              <RefreshCw size={18} />
              Reload Application
            </button>
            <p className="mt-4 text-[10px] text-gray-400 dark:text-slate-500 font-mono text-left bg-panel2 dark:bg-panel2-dark p-2 rounded max-h-24 overflow-y-auto">
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
