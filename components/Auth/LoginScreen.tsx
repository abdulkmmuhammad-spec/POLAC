import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  // Lock scroll while login screen is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(identifier, password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6 bg-[#050505] overflow-hidden"
      style={{
        minHeight: '-webkit-fill-available',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Background Image with Blur */}
      <div
        className="absolute z-0 bg-cover bg-center bg-no-repeat opacity-60 scale-105"
        style={{
          top: '-20px',
          left: '-20px',
          right: '-20px',
          bottom: '-20px',
          backgroundImage: 'url("/background.jpg")',
          filter: 'blur(8px)',
        }}
      />

      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl relative z-20 text-white">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-white/10 rounded-full border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center overflow-hidden">
              <img
                src="/logo.png"
                alt="NPA Logo"
                className="w-[80%] h-[80%] object-contain block"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Nigeria Police Academy
          </h2>
          <p className="text-xs text-white/60 mt-2">
            Sign in to your account
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Official Email
            </label>
            <input
              type="email"
              required
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              spellCheck={false}
              className="w-full min-h-[44px] bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-base sm:text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 transition-colors"
              placeholder="name@polac.gov.ng"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="w-full min-h-[44px] bg-black/50 border border-white/10 rounded-xl pl-4 pr-12 py-2.5 text-base sm:text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-white/60 hover:text-white active:scale-95 transition-all"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !identifier.trim() || !password}
            className="w-full min-h-[46px] bg-white hover:bg-gray-200 text-black font-bold text-sm py-3 rounded-xl mt-6 shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Developer credit */}
      <p
        className="absolute left-0 right-0 text-center text-[10px] tracking-wide text-white/25 z-20 select-none pointer-events-none"
        style={{ bottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
      >
        Designed &amp; Developed by Muhammad Abdulkarim Isyaku&ensp;·&ensp;RC10 2026
      </p>
    </div>
  );
};
