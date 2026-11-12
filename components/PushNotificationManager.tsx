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

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.success('Live alerts disabled');
    } else {
      await subscribe();
      toast.success('Live pop-up notifications enabled!');
    }
  };

  return (
    <div className="p-4 sm:p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
        
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className={`p-3 rounded-full shrink-0 ${isSubscribed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
            <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-gray-900">Live Phone & Browser Notifications</h3>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {isSubscribed 
                ? 'Active — You will receive instant pop-up alerts for Commandant Parade Remarks and parade updates.' 
                : 'Enable notifications to receive instant pop-up alerts on your phone or browser.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`w-full sm:w-auto relative inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium rounded-lg transition-all shrink-0
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
