import { ONESIGNAL_APP_ID } from '../config/constants';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

let isInitialized = false;

// Register service worker eagerly for push notifications
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/OneSignalSDKWorker.js', { scope: '/' })
      .catch((err) => {
        console.warn('Service worker registration notice:', err);
      });
  });
}

export function initOneSignal(employeeName?: string) {
  if (typeof window === 'undefined') return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  window.OneSignalDeferred.push(async function (OneSignal: any) {
    if (!isInitialized) {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          serviceWorkerParam: { scope: '/' },
          serviceWorkerPath: '/OneSignalSDKWorker.js',
          allowLocalhostAsSecureOrigin: true,
          notifyButton: {
            enable: false,
          },
        });
        isInitialized = true;
      } catch (err) {
        console.warn('OneSignal init warning:', err);
      }
    }

    if (employeeName) {
      try {
        if (OneSignal.User && OneSignal.User.addTag) {
          await OneSignal.User.addTag('employee', employeeName.trim());
        }
      } catch (err) {
        console.warn('OneSignal tag error:', err);
      }
    }
  });
}

/**
 * Request notification permissions from both the native browser Notification API
 * and OneSignal SDK for maximum reliability across mobile and desktop.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let nativeGranted = false;

  // 1. Native browser Notification permission request
  if ('Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      nativeGranted = perm === 'granted';
    } catch (e) {
      console.warn('Native notification request error:', e);
    }
  }

  // 2. Also register with OneSignal SDK
  return new Promise((resolve) => {
    let resolved = false;

    // Timeout safety fallback after 1.5 seconds
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(nativeGranted);
      }
    }, 1500);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal: any) {
      try {
        if (OneSignal.Notifications && OneSignal.Notifications.requestPermission) {
          await OneSignal.Notifications.requestPermission();
          const permission = OneSignal.Notifications.permission;
          const osGranted = permission === true || permission === 'granted';
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(osGranted || nativeGranted);
          }
        } else if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(nativeGranted);
        }
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(nativeGranted);
        }
      }
    });
  });
}

/**
 * Check current push notification permission status
 */
export async function checkPushPermission(): Promise<string> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Display a push/local notification to the user if permission is granted.
 * Works seamlessly across mobile (Android / iOS PWA) and desktop browsers.
 */
export async function displayPushNotification(title: string, body?: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/icon.svg',
    tag: 'gv-planning-update',
    ...(('vibrate' in navigator) ? { vibrate: [200, 100, 200] } : {}),
  };

  // 1. First priority: Use ServiceWorkerRegistration.showNotification (required on mobile Chrome/Android & iOS PWAs)
  if ('serviceWorker' in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' });
      }
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    } catch (swErr) {
      console.warn('SW showNotification error, attempting desktop fallback:', swErr);
    }
  }

  // 2. Desktop native Notification fallback (if not on Android where constructor throws)
  try {
    new Notification(title, options);
  } catch (err) {
    console.warn('Native notification constructor not permitted on this device:', err);
  }
}

/**
 * Test push notification helper for admin verification
 */
export async function testPushNotification(): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      success: false,
      message: 'Les notifications ne sont pas supportées par ce navigateur.',
    };
  }

  let perm = Notification.permission;
  if (perm !== 'granted') {
    const granted = await requestPushPermission();
    if (!granted) {
      return {
        success: false,
        message:
          'Autorisation refusée par le navigateur. Veuillez autoriser les notifications dans les paramètres du site (icône cadenas à côté de l’adresse).',
      };
    }
  }

  const storeName = typeof window !== 'undefined' ? localStorage.getItem('planning_store_name') || 'Planning Équipe' : 'Planning Équipe';
  await displayPushNotification(
    `${storeName} · Planning`,
    'Test réussi ! Vos notifications push sont parfaitement activées et opérationnelles.'
  );

  return {
    success: true,
    message: 'Notification de test envoyée avec succès sur votre écran !',
  };
}
