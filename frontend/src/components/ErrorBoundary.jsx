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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-8">
              A critical error occurred while rendering this page. The system administrator has been notified.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex justify-center items-center gap-2 py-3 rounded-xl bg-gray-900 text-white font-semibold active:bg-gray-800 transition-colors"
            >
              <RefreshCw size={18} />
              Reload Application
            </button>
            <p className="mt-4 text-[10px] text-gray-400 font-mono text-left bg-gray-50 p-2 rounded max-h-24 overflow-y-auto">
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
