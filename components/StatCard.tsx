
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'red' | 'orange' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color }) => {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]',
    green: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]',
    red: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]',
    orange: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]',
    purple: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]',
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm border border-slate-200 flex items-center space-x-4 hover:border-slate-300 transition-all group overflow-hidden relative">
      <div className={`p-3 rounded-md border ${colorMap[color]} shrink-0 flex items-center justify-center transition-transform group-hover:scale-105`}>
        {React.cloneElement(icon as React.ReactElement, { size: 20 })}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 truncate">{label}</p>
        <h3 className="text-xl md:text-2xl font-black text-slate-900 font-mono tracking-tighter truncate leading-none">{value}</h3>
      </div>
      <div className={`absolute top-0 right-0 w-1 h-full ${color === 'blue' ? 'bg-blue-500' :
          color === 'green' ? 'bg-emerald-500' :
            color === 'red' ? 'bg-rose-500' :
              color === 'orange' ? 'bg-amber-500' : 'bg-indigo-500'
        } opacity-20`} />
    </div>
  );
};
