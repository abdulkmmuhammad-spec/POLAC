/**
 * POLAC Parade Management System - Tactile Haptic Engine
 * 
 * Safely guards Web Vibration API for Android / PWA WebAPK devices,
 * preventing runtime TypeErrors on iOS Safari (where navigator.vibrate is undefined).
 */

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

export const triggerHaptic = (style: HapticStyle = 'light'): void => {
    try {
        if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
            return;
        }

        switch (style) {
            case 'selection':
            case 'light':
                navigator.vibrate(10);
                break;
            case 'medium':
                navigator.vibrate(25);
                break;
            case 'heavy':
                navigator.vibrate(40);
                break;
            case 'success':
                navigator.vibrate([12, 40, 15]);
                break;
            case 'warning':
                navigator.vibrate([20, 60, 20]);
                break;
            case 'error':
                navigator.vibrate([35, 60, 35, 60, 45]);
                break;
            default:
                navigator.vibrate(10);
                break;
        }
    } catch {
        // Silently swallow errors if restricted by device policy or user settings
    }
};
