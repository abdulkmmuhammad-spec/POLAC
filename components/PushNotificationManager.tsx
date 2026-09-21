import React from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const PushNotificationManager: React.FC = () => {
  const {
    isSupported,
    permission,
    subscription,
    isLoading,
    error,
    subscribe,
    unsubscribe
  } = usePushNotifications();

  // Show errors if they occur
  React.useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  if (!isSupported) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
        Push notifications are not supported in this browser.
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start gap-3">
        <BellOff className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Notifications Blocked</p>
          <p className="mt-1 opacity-90">
            You have blocked notifications for this site. Please enable them in your browser settings to receive live parade alerts.
          </p>
        </div>
      </div>
    );
  }

  const isSubscribed = !!subscription;

  return (
    <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
        
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${isSubscribed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Live Notifications</h3>
            <p className="text-sm text-gray-500 mt-1">
              {isSubscribed 
                ? 'You are receiving live alerts for parade states and missing cadets.' 
                : 'Enable notifications to stay instantly updated without refreshing.'}
            </p>
          </div>
        </div>

        <button
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isLoading}
          className={`relative inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium rounded-lg transition-all
            ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-md'}
            ${isSubscribed 
              ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50' 
              : 'bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90'
            }`}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {!isLoading && isSubscribed && 'Disable Alerts'}
          {!isLoading && !isSubscribed && 'Enable Alerts'}
        </button>

      </div>
    </div>
  );
};
