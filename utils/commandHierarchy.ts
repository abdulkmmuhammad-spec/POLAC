import { User, UserRole } from '../types';

/**
 * Normalized Senior Officer Chain-of-Command helpers.
 * Handles wording variations such as "Director Field Studies",
 * "Director of Field Studies", or "DFS".
 */

export const isDFS = (user?: Pick<User, 'role' | 'designation'> | null): boolean => {
  if (!user || user.role !== UserRole.COMMANDANT) return false;
  const d = (user.designation || '').trim().toLowerCase();
  return (d.includes('director') && d.includes('field') && d.includes('studies')) || d === 'dfs';
};

export const isDeputyCommandant = (user?: Pick<User, 'role' | 'designation'> | null): boolean => {
  if (!user || user.role !== UserRole.COMMANDANT) return false;
  const d = (user.designation || '').trim().toLowerCase();
  return d.includes('deputy') && d.includes('commandant');
};

export const isTopCommandant = (user?: Pick<User, 'role' | 'designation'> | null): boolean => {
  if (!user || user.role !== UserRole.COMMANDANT) return false;
  return !isDFS(user) && !isDeputyCommandant(user);
};

export const isExecutiveCommand = (user?: Pick<User, 'role' | 'designation'> | null): boolean => {
  return isTopCommandant(user) || isDeputyCommandant(user);
};

