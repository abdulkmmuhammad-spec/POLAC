// Service Worker for POLAC Parade Management Web Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push events
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('Push event received but no data was provided');
    return;
  }

  try {
    const payload = event.data.json();
    
    const title = payload.title || 'POLAC Parade Alert';
    const options = {
      body: payload.body || 'You have a new notification.',
      icon: payload.icon || '/vite.svg', // Update with actual POLAC icon (e.g., /polac-logo.png)
      badge: payload.badge || '/vite.svg',
      data: {
        url: payload.url || '/' // Where to navigate on click
      },
      vibrate: [200, 100, 200, 100, 200, 100, 200], // Alert vibration pattern
      requireInteraction: true // Keep notification on screen until user interacts (useful for urgent alerts)
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error('Error parsing push payload:', error);
    // Fallback if payload isn't JSON
    event.waitUntil(
      self.registration.showNotification('POLAC System Alert', {
        body: event.data.text(),
        icon: '/vite.svg'
      })
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  // Check if the app is already open and focus it, or open a new window
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open to this URL, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
