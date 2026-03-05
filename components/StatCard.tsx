
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'red' | 'orange' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color }) => {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-rose-50 text-rose-600',
    orange: 'bg-amber-50 text-amber-600',
    purple: 'bg-indigo-50 text-indigo-600',
  };

  const iconColorMap = {
    blue: 'bg-blue-600',
    green: 'bg-emerald-600',
    red: 'bg-rose-600',
    orange: 'bg-amber-600',
    purple: 'bg-indigo-600',
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-3 md:space-x-4 hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-xl ${colorMap[color]}`}>
        <div className="w-8 h-8 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-[10px] md:text-sm font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <h3 className="text-xl md:text-2xl font-bold text-slate-800">{value}</h3>
      </div>
    </div>
  );
};
