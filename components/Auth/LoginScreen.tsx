import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { supabase } from '../../services/dbService';

export const LoginScreen: React.FC = () => {
  const { login, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.COMMANDANT);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [occupancy, setOccupancy] = useState({ cmd: 0, off: 0 });

  useEffect(() => {
    const fetchOccupancy = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('role');
      
      if (!error && data) {
        const cmdCount = data.filter(u => u.role === UserRole.COMMANDANT).length;
        const offCount = data.filter(u => u.role === UserRole.COURSE_OFFICER).length;
        setOccupancy({ cmd: cmdCount, off: offCount });
        
        // Default role logic: if commandant is taken, switch default to officer
        if (cmdCount > 0) {
          setRole(UserRole.COURSE_OFFICER);
        }
      }
    };
    fetchOccupancy();
  }, []);

  const isFull = (occupancy.cmd + occupancy.off) >= 6;
  const canShowCommandant = occupancy.cmd === 0;
  const canShowOfficer = occupancy.off < 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password, username, role);
      } else {
        await login(email, password);
      }
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
            {mode === 'login' ? 'Secure Authentication' : 'Personnel Onboarding'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <div className="flex bg-black/50 p-1 rounded-lg mb-6 border border-white/5">
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Grant Access
          </button>
          {!isFull ? (
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
              onClick={() => { setMode('signup'); setError(''); }}
            >
              Initialize Profile
            </button>
          ) : (
            <div className="flex-1 py-2 text-[9px] font-bold text-white/30 uppercase tracking-tighter flex items-center justify-center text-center leading-none px-2 border border-white/5 rounded-md bg-white/5">
              System Registry Full • Access Restricted
            </div>
          )}
        </div>

        {isFull && mode === 'signup' && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs text-center font-medium">
            Registry capacity reached. New personnel onboarding is currently suspended by Command.
          </div>
        )}

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

          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase mb-1">Display Username</label>
                <input
                  type="text"
                  required
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
                  placeholder="e.g. Commandant1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase mb-1">Assigned Role</label>
                <select
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors appearance-none"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  {canShowCommandant && <option value={UserRole.COMMANDANT}>Commandant (Max 1)</option>}
                  {canShowOfficer && <option value={UserRole.COURSE_OFFICER}>Course Officer (Max 5)</option>}
                </select>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white hover:bg-gray-200 text-black font-bold uppercase tracking-widest text-sm py-4 rounded-lg mt-6 shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : (mode === 'login' ? 'Acknowledge & Enter' : 'Register Identity')}
          </button>
        </form>
      </div>
    </div>
  );
};
