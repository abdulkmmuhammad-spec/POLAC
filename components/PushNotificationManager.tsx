import React from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const PushNotificationManager: React.FC = () => {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe
  } = usePushNotifications();

  React.useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleToggle = async () => {
    if (isLoading || !isSupported || permission === 'denied') return;
    if (isSubscribed) {
      await unsubscribe();
      toast.success('Push notifications muted');
    } else {
      await subscribe();
      toast.success('Push notifications enabled');
    }
  };

  const statusBadge = !isSupported
    ? { label: 'Unsupported', classes: 'bg-slate-100 text-slate-500' }
    : permission === 'denied'
    ? { label: 'Blocked in Browser', classes: 'bg-rose-50 text-rose-700 border border-rose-200' }
    : isSubscribed
    ? { label: 'Enabled', classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
    : { label: 'Muted', classes: 'bg-slate-100 text-slate-600 border border-slate-200' };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              permission === 'denied'
                ? 'bg-rose-50 text-rose-600'
                : isSubscribed
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {permission === 'denied' ? <BellOff size={20} /> : <Bell size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                Device Push Notifications
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge.classes}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {permission === 'denied'
                ? 'Blocked by your browser. Allow notifications in site settings to receive live alerts.'
                : isSubscribed
                ? 'Saves automatically. Instant alerts are active on this device.'
                : 'Turn on to receive instant parade and sickbay alerts on this device.'}
            </p>
          </div>
        </div>

        {/* iOS-style Instant Auto-Save Switch */}
        {isSupported && permission !== 'denied' && (
          <button
            type="button"
            role="switch"
            aria-checked={isSubscribed}
            aria-label="Toggle push notifications"
            onClick={handleToggle}
            disabled={isLoading}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-60 ${
              isSubscribed ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isSubscribed ? 'translate-x-6' : 'translate-x-0'
              }`}
            >
              {isLoading && <Loader2 size={14} className="animate-spin text-slate-500" />}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
