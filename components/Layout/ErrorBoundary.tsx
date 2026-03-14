import React from 'react';
import { AlertCircle, RefreshCcw, WifiOff } from 'lucide-react';

type Props = {
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
};

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false });
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 p-10 text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-rose-500" />

                        <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-8 text-rose-500 shadow-inner">
                            <WifiOff size={40} />
                        </div>

                        <h2 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">
                            System Interruption
                        </h2>
                        <p className="text-slate-500 leading-relaxed mb-10 text-sm">
                            The CMS encountered a critical connection or rendering error. This usually
                            happens during network timeouts or database maintenance.
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-4 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 group"
                            >
                                <RefreshCcw
                                    size={18}
                                    className="group-hover:rotate-180 transition-transform duration-500"
                                />
                                Reconnect Now
                            </button>

                            <button
                                onClick={this.handleReset}
                                className="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-2xl transition-all text-sm"
                            >
                                Return to Dashboard
                            </button>
                        </div>

                        <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300">
                            <AlertCircle size={12} />
                            Critical Fail-Safe Mode Active
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
