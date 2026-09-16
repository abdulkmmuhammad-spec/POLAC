import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { supabase } from '../../services/dbService';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Occupancy checks removed since signup is now Commandant-only internal


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#050505] text-white relative overflow-hidden">
      {/* Background Image with Blur */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-60 scale-105"
        style={{ 
          backgroundImage: 'url("/background.jpg")',
          filter: 'blur(8px)'
        }}
      />
      
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl relative z-20">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-white/10 rounded-full p-2 border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              <img 
                src="/logo.png" 
                alt="NPA Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback if logo is missing
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Nigeria Police Academy</h2>
          <p className="text-xs text-white/50 uppercase tracking-widest mt-2">
            Secure Authentication
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Registry navigation and full warning removed */}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase mb-1">Official Email</label>
            <input
              type="email"
              required
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              placeholder="name@polac.gov.ng"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-white/60 uppercase mb-1">Secure Password</label>
            <input
              type="password"
              required
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Registration form inputs removed */}

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full bg-white hover:bg-gray-200 text-black font-bold uppercase tracking-widest text-sm py-4 rounded-lg mt-6 shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Acknowledge & Enter'}
          </button>
        </form>
      </div>
    </div>
  );
};
