/**
 * Utility helper for human-readable full status terms and badging across the application.
 */

export const getStatusFullLabel = (status: string | undefined | null): string => {
  if (!status) return 'Present';
  const normalized = status.toLowerCase().trim();

  switch (normalized) {
    case 'present':
    case 'pres':
      return 'Present';
    case 'absent':
    case 'abs':
    case 'abst':
      return 'Absent';
    case 'sick':
    case 'sickbay':
      return 'Sick Bay';
    case 'detention':
    case 'det':
    case 'detn':
      return 'Detention';
    case 'pass':
    case 'permission':
    case 'on_permission':
      return 'On Permission';
    case 'suspension':
    case 'susp':
      return 'Suspension';
    case 'yet_to_report':
    case 'ytr':
      return 'Yet to Report';
    case 'dismissed':
      return 'Dismissed';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

export const getStatusBadgeStyles = (status: string | undefined | null): string => {
  if (!status) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  const normalized = status.toLowerCase().trim();

  switch (normalized) {
    case 'present':
    case 'pres':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'absent':
    case 'abs':
    case 'abst':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'sick':
    case 'sickbay':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'detention':
    case 'det':
    case 'detn':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'pass':
    case 'permission':
    case 'on_permission':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'suspension':
    case 'susp':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'yet_to_report':
    case 'ytr':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'dismissed':
      return 'bg-rose-900/10 text-rose-800 border-rose-300 font-black';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};
