import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="glass-panel rounded-3xl p-10 max-w-md w-full text-center space-y-6">
            <div className="p-5 rounded-3xl bg-rose-500/10 inline-block">
              <AlertTriangle className="w-12 h-12 text-rose-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-100">Something went wrong</h2>
              <p className="text-slate-400 mt-2 text-sm">
                {this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-white font-bold hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
