import React, { useState, useEffect } from 'react';
import { RefreshCcw, ShieldCheck, UserPlus } from 'lucide-react';
import { UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const Login: React.FC = () => {
    const { login, signUp, isLoading, initializing, lockoutTime, registrationStatus } = useAuth();
    const [loginRole, setLoginRole] = useState<UserRole>(UserRole.COMMANDANT);
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<{ email?: string; username?: string; password?: string }>({});

    // Determine if this role should show signup or login
    const isRegistering = loginRole === UserRole.COMMANDANT
        ? registrationStatus.canRegisterCommandant
        : registrationStatus.canRegisterOfficer;

    const officerSlotLabel = `Unit Capacity: ${registrationStatus.officerCount}/5 Allocated`;

    const resetForm = () => {
        setEmail('');
        setUsername('');
        setPassword('');
        setError(null);
        setSuccessMessage(null);
        setValidationErrors({});
    };

    const validate = () => {
        const errors: { email?: string; username?: string; password?: string } = {};
        if (!email.includes('@') || email.length < 5) {
            errors.email = 'Please enter a valid email address.';
        }
        if (isRegistering && username.trim().length < 3) {
            errors.username = 'Username must be at least 3 characters.';
        }
        if (password.length < 6) {
            errors.password = 'Password must be at least 6 characters.';
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setValidationErrors({});

        if (lockoutTime > 0) return;
        if (!validate()) return;

        try {
            if (isRegistering) {
                await signUp(email, password, username, loginRole);
                setSuccessMessage('Account created! Check your email to confirm your address, then log in.');
                resetForm();
            } else {
                await login(email, password, loginRole);
            }
        } catch (err: any) {
            const msg = err.message || 'Authentication failed. Please check your credentials.';
            setError(msg);
        }
    };

    // Show a full-screen spinner while Supabase confirms the session on page load
    if (initializing) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCcw className="w-10 h-10 text-blue-400 animate-spin" />
                    <p className="text-slate-400 text-xs uppercase tracking-widest font-bold">Initializing Secure Session...</p>
                </div>
            </div>
        );
    }

    const isCommandant = loginRole === UserRole.COMMANDANT;
    const themeColor = isCommandant ? 'blue-900' : 'slate-800';

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-900 relative overflow-hidden">
            <img
                src="/background.jpg"
                alt="Background"
                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm scale-105"
            />

            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative z-10">
                {/* Header */}
                <div className={`bg-${themeColor} p-8 text-center text-white`}>
                    <div className="w-24 h-24 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-xl overflow-hidden border-4 border-white/20">
                        <img src="/logo.png" alt="NPA Logo" className="w-[90%] h-[90%] object-contain block mx-auto" />
                    </div>
                    <h1 className="text-2xl font-bold">Nigeria Police Academy</h1>
                    <div className="flex justify-center mt-2">
                        <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border-2 ${
                            isCommandant ? 'bg-blue-800 border-blue-400 text-blue-100' : 'bg-slate-700 border-slate-500 text-slate-100'
                        }`}>
                            {isCommandant ? 'Commandant Portal' : 'Course Officer Portal'}
                        </span>
                    </div>
                </div>

                {/* Role Tabs */}
                <div className="flex border-b">
                    <button
                        onClick={() => { setLoginRole(UserRole.COMMANDANT); resetForm(); }}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${isCommandant ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}
                    >
                        Commandant
                    </button>
                    <button
                        onClick={() => { setLoginRole(UserRole.COURSE_OFFICER); resetForm(); }}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${!isCommandant ? 'text-slate-700 border-b-2 border-slate-700' : 'text-slate-400'}`}
                    >
                        Course Officer
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    {/* Dynamic Header */}
                    <div className="text-center mb-2">
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isCommandant ? 'text-blue-900' : 'text-slate-800'}`}>
                            {isRegistering ? 'Initialize Account' : 'Secure Authorization'}
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                            {isCommandant
                                ? (isRegistering ? 'First-Time Commandant Setup' : 'Restricted Commandant Access')
                                : officerSlotLabel}
                        </p>
                    </div>

                    {/* Status Messages */}
                    {error && (
                        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
                            {error}
                        </div>
                    )}
                    {successMessage && (
                        <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm font-medium border border-green-100">
                            {successMessage}
                        </div>
                    )}

                    {/* Email Field */}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Official Email</label>
                        <input
                            type="email"
                            required
                            className={`w-full px-4 py-3 rounded-xl border ${validationErrors.email ? 'border-rose-500' : 'border-slate-200'} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                            placeholder="e.g. name@polac.gov.ng"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); if (validationErrors.email) setValidationErrors(p => ({ ...p, email: undefined })); }}
                        />
                        {validationErrors.email && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.email}</p>}
                    </div>

                    {/* Username Field (Signup only) */}
                    {isRegistering && (
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-700">Display Username</label>
                            <input
                                type="text"
                                required
                                className={`w-full px-4 py-3 rounded-xl border ${validationErrors.username ? 'border-rose-500' : 'border-slate-200'} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                                placeholder={isCommandant ? 'e.g. commandant' : 'e.g. officer1'}
                                value={username}
                                onChange={(e) => { setUsername(e.target.value); if (validationErrors.username) setValidationErrors(p => ({ ...p, username: undefined })); }}
                            />
                            {validationErrors.username && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.username}</p>}
                        </div>
                    )}

                    {/* Password Field */}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Secure Password</label>
                        <input
                            type="password"
                            required
                            className={`w-full px-4 py-3 rounded-xl border ${validationErrors.password ? 'border-rose-500' : 'border-slate-200'} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all`}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); if (validationErrors.password) setValidationErrors(p => ({ ...p, password: undefined })); }}
                        />
                        {validationErrors.password && <p className="text-[10px] text-rose-500 font-bold ml-1 uppercase">{validationErrors.password}</p>}
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading || lockoutTime > 0}
                        className={`w-full ${lockoutTime > 0 ? 'bg-slate-400' : isCommandant ? 'bg-blue-900 hover:bg-blue-800' : 'bg-slate-800 hover:bg-slate-700'} text-white font-bold py-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2`}
                    >
                        {isLoading ? (
                            <RefreshCcw className="animate-spin" />
                        ) : lockoutTime > 0 ? (
                            <span>Locked ({lockoutTime}s)</span>
                        ) : (
                            <>
                                {isRegistering ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
                                <span>{isRegistering ? 'Create Command Profile' : 'Grant Access'}</span>
                            </>
                        )}
                    </button>

                    <p className="text-center text-xs text-slate-400">
                        Restricted Access • {isRegistering ? 'Registration Phase' : 'Supabase Encrypted Session'}
                    </p>
                </form>
            </div>
        </div>
    );
};
