import React, { useState, useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LoginSkeleton } from './LoginSkeleton';

export const Login: React.FC = () => {
    const { login, isLoading, lockoutTime } = useAuth();
    const [loginRole, setLoginRole] = useState<UserRole>(UserRole.COMMANDANT);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<{ username?: string, password?: string }>({});
    const [isPageLoading, setIsPageLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsPageLoading(false);
        }, 1000); // 1-second "polish" delay for the skeleton
        return () => clearTimeout(timer);
    }, []);

    if (isPageLoading) {
        return <LoginSkeleton />;
    }

    const validate = () => {
        const errors: { username?: string, password?: string } = {};
        if (username.length < 3) {
            errors.username = 'Username must be at least 3 characters long.';
        }
        if (password.length < 6) {
            errors.password = 'Password must be at least 6 characters long.';
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setValidationErrors({});

        if (lockoutTime > 0) return;
        if (!validate()) return;

        try {
            await login(username, password, loginRole);
        } catch (err: any) {
            const msg = err.message || 'Login failed. Please check your credentials.';
            setError(msg);
            // Highlight both fields on authentication failure
            if (!msg.includes('Unauthorized') && !msg.includes('Too many')) {
                setValidationErrors({
                    username: 'Please verify your username',
                    password: 'Please verify your password'
                });
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 relative overflow-hidden">
            <img
                src="/background.jpg"
                alt="Background"
                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm scale-105 grayscale-0"
            />

            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10">
                <div className="bg-primary p-8 text-center bg-blue-900 text-white">
                    <div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center text-blue-900 shadow-xl overflow-hidden border-4 border-white/20">
                        <img
                            src="/logo.png"
                            alt="NPA Logo"
                            className="w-[90%] h-[90%] object-contain block mx-auto"
                        />
                    </div>
                    <h1 className="text-2xl font-bold">Nigeria Police Academy</h1>
                    <div className="flex justify-center mt-2">
                        <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border-2 ${loginRole === UserRole.COMMANDANT
                            ? 'bg-blue-800 border-blue-400 text-blue-100'
                            : 'bg-slate-800 border-slate-500 text-slate-100'
                            }`}>
                            {loginRole === UserRole.COMMANDANT ? 'Commandant Portal' : 'Course Officer Portal'}
                        </span>
                    </div>
                </div>

                <div className="flex border-b">
                    <button
                        onClick={() => {
                            setLoginRole(UserRole.COMMANDANT);
                            setUsername('');
                            setPassword('');
                            setError(null);
                            setValidationErrors({});
                        }}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${loginRole === UserRole.COMMANDANT ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        Commandant
                    </button>
                    <button
                        onClick={() => {
                            setLoginRole(UserRole.COURSE_OFFICER);
                            setUsername('');
                            setPassword('');
                            setError(null);
                            setValidationErrors({});
                        }}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${loginRole === UserRole.COURSE_OFFICER ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        Course Officer
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="text-center mb-2">
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${loginRole === UserRole.COMMANDANT ? 'text-blue-900' : 'text-slate-800'
                            }`}>
                            {loginRole === UserRole.COMMANDANT ? 'Secure Auth' : 'Officer Sign-In'}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                            {loginRole === UserRole.COMMANDANT ? 'Restricted Commandant Access' : 'Unit Deployment Records'}
                        </p>
                    </div>
                    {error && (
                        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Username</label>
                        <input
                            type="text"
                            required
                            className={`w-full px-4 py-3 rounded-xl border ${validationErrors.username ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 focus:ring-blue-500'} focus:ring-2 focus:border-transparent outline-none transition-all`}
                            placeholder={loginRole === UserRole.COMMANDANT ? "e.g. commandant" : "e.g. course officer"}
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value);
                                if (validationErrors.username) setValidationErrors(prev => ({ ...prev, username: undefined }));
                            }}
                        />
                        {validationErrors.username && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.username}</p>}
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Password</label>
                        <input
                            type="password"
                            required
                            className={`w-full px-4 py-3 rounded-xl border ${validationErrors.password ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 focus:ring-blue-500'} focus:ring-2 focus:border-transparent outline-none transition-all`}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                if (validationErrors.password) setValidationErrors(prev => ({ ...prev, password: undefined }));
                            }}
                        />
                        {validationErrors.password && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.password}</p>}
                    </div>
                    <button
                        disabled={isLoading || lockoutTime > 0}
                        className={`w-full ${lockoutTime > 0 ? 'bg-slate-400' : 'bg-blue-700 hover:bg-blue-800'} text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-blue-200 transition-all flex items-center justify-center space-x-2`}
                    >
                        {isLoading ? (
                            <RefreshCcw className="animate-spin" />
                        ) : lockoutTime > 0 ? (
                            <span>Locked ({lockoutTime}s)</span>
                        ) : (
                            <span>Sign In</span>
                        )}
                    </button>
                    <p className="text-center text-xs text-slate-400">Restricted Access • Supabase Backed</p>
                </form>
            </div>
        </div>
    );
};
