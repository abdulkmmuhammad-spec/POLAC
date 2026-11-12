import { useState, useEffect } from 'react';
import { supabase } from '../services/dbService';
import { useAuth } from '../context/AuthContext';

const LOCAL_PUSH_STORAGE_KEY = 'polac_local_push_enabled';

// Utility function to convert VAPID key to Uint8Array required by pushManager
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const usePushNotifications = () => {
  const { currentUser } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLocalSubscribed, setIsLocalSubscribed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LOCAL_PUSH_STORAGE_KEY) === 'true';
  });
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSupported = () => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setIsSupported(false);
        return;
      }
      setIsSupported(true);
      setPermission(Notification.permission);

      if (Notification.permission === 'granted' && localStorage.getItem(LOCAL_PUSH_STORAGE_KEY) !== 'false') {
        setIsLocalSubscribed(true);
      }

      if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => {
            if (sub) {
              const DEFAULT_VAPID_PUBLIC_KEY = 'BHLlGvTeXErsp1DuyebhqVEC9ztRHyyLKoWQe4ijGwiBcLtDT4bF7vvbYmjebxozDq9WLq-LZoZdx7LqePDj5hw';
              const currentVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

              const currentKeyArray = urlBase64ToUint8Array(currentVapidKey);
              const subKeyArray = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;

              let matches = false;
              if (subKeyArray && subKeyArray.length === currentKeyArray.length) {
                matches = true;
                for (let i = 0; i < currentKeyArray.length; i++) {
                  if (subKeyArray[i] !== currentKeyArray[i]) {
                    matches = false;
                    break;
                  }
                }
              }

              if (!matches) {
                sub.unsubscribe().then(() => setSubscription(null)).catch(() => {});
              } else {
                setSubscription(sub);
                setIsLocalSubscribed(true);
              }
            }
          })
          .catch(() => {});
      }
    };

    checkSupported();
  }, []);

  const triggerConfirmationNotification = async (reg?: ServiceWorkerRegistration | null) => {
    const title = 'NPA Tactical Alerts Enabled';
    const options: any = {
      body: 'You will now receive instant phone & browser pop-up notifications for Commandant Parade Remarks.',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'polac-push-enabled-confirm',
      vibrate: [200, 100, 200]
    };

    try {
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return;
      }
    } catch {}

    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, options);
      }
    } catch {}
  };

  const subscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isSupported) {
        throw new Error('Notifications are not supported in this browser.');
      }

      // 1. Request Browser / OS Notification Permission
      const permResult = await Notification.requestPermission();
      setPermission(permResult);
      if (permResult !== 'granted') {
        throw new Error('Notification permission denied. Please allow notifications in your browser settings.');
      }

      // Enable local real-time OS notifications immediately once permission is granted
      localStorage.setItem(LOCAL_PUSH_STORAGE_KEY, 'true');
      setIsLocalSubscribed(true);

      // 2. Get Service Worker Registration (with timeout so it never hangs)
      let registration: ServiceWorkerRegistration | null = null;
      if ('serviceWorker' in navigator) {
        try {
          registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
          ]);
        } catch {
          registration = null;
        }
      }

      // 3. Attempt background WebPush (VAPID/FCM) registration if supported by browser push service
      if (registration && 'pushManager' in registration) {
        const DEFAULT_VAPID_PUBLIC_KEY = 'BHLlGvTeXErsp1DuyebhqVEC9ztRHyyLKoWQe4ijGwiBcLtDT4bF7vvbYmjebxozDq9WLq-LZoZdx7LqePDj5hw';
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

        if (vapidKey) {
          try {
            const existing = await registration.pushManager.getSubscription();
            if (existing) {
              try {
                await existing.unsubscribe();
              } catch {}
            }

            const pushSubscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey)
            });

            setSubscription(pushSubscription);

            // 4. Save to Supabase if push subscription succeeded
            const targetUserId =
              currentUser?.id && typeof currentUser.id === 'string' && currentUser.id.length === 36
                ? currentUser.id
                : '00000000-0000-0000-0000-000000000000';

            const subscriptionJSON = pushSubscription.toJSON();

            await supabase
              .from('push_subscriptions')
              .upsert(
                {
                  user_id: targetUserId,
                  endpoint: subscriptionJSON.endpoint,
                  auth_key: subscriptionJSON.keys?.auth,
                  p256dh_key: subscriptionJSON.keys?.p256dh
                },
                {
                  onConflict: 'user_id, endpoint'
                }
              );
          } catch {
            // Browser push relay (e.g. Brave / restricted FCM / dev environment) rejected background VAPID registration.
            // Native Service Worker & Realtime OS notifications remain fully active via granted Notification permission.
          }
        }
      }

      await triggerConfirmationNotification(registration);
    } catch (err: any) {
      setError(err.message || 'An error occurred while enabling notifications.');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      localStorage.setItem(LOCAL_PUSH_STORAGE_KEY, 'false');
      setIsLocalSubscribed(false);

      if (subscription) {
        try {
          await subscription.unsubscribe();
        } catch {}
        setSubscription(null);

        if (currentUser) {
          try {
            await supabase
              .from('push_subscriptions')
              .delete()
              .match({ endpoint: subscription.endpoint, user_id: currentUser.id });
          } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while disabling notifications.');
    } finally {
      setIsLoading(false);
    }
  };

  const isSubscribed = Boolean(subscription || (permission === 'granted' && isLocalSubscribed));

  return {
    isSupported,
    permission,
    subscription,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe
  };
};
