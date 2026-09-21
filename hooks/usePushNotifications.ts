import { useState, useEffect } from 'react';
import { supabase } from '../services/dbService';
import { useAuth } from '../context/AuthContext';

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
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if push messaging is supported
    const checkSupported = () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        return;
      }
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Load existing subscription if available
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setSubscription(sub);
          }
        });
      });
    };

    checkSupported();
  }, []);

  const subscribe = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (!isSupported) {
        throw new Error('Push notifications are not supported in this browser.');
      }

      // 1. Request Permission
      const permResult = await Notification.requestPermission();
      setPermission(permResult);
      if (permResult !== 'granted') {
        throw new Error('Notification permission denied by the user.');
      }

      // 2. Register / Get Service Worker
      const registration = await navigator.serviceWorker.ready;

      // 3. Subscribe to PushManager using the Public VAPID key from .env
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        throw new Error('VAPID public key is missing from environment variables.');
      }

      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
      
      setSubscription(pushSubscription);

      // 4. Save to Supabase
      if (!currentUser) {
        throw new Error('User must be authenticated to save subscription.');
      }

      const subscriptionJSON = pushSubscription.toJSON();
      
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: currentUser.id,
          endpoint: subscriptionJSON.endpoint,
          auth_key: subscriptionJSON.keys?.auth,
          p256dh_key: subscriptionJSON.keys?.p256dh
        }, {
          onConflict: 'user_id, endpoint'
        });

      if (dbError) throw dbError;

    } catch (err: any) {
      console.error('Error subscribing to push notifications:', err);
      setError(err.message || 'An error occurred while enabling notifications.');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (subscription) {
        // Unsubscribe from browser
        await subscription.unsubscribe();
        setSubscription(null);

        // Delete from database
        if (currentUser) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .match({ endpoint: subscription.endpoint, user_id: currentUser.id });
        }
      }
    } catch (err: any) {
      console.error('Error unsubscribing:', err);
      setError(err.message || 'An error occurred while disabling notifications.');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSupported,
    permission,
    subscription,
    isLoading,
    error,
    subscribe,
    unsubscribe
  };
};
