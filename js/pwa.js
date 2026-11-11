// ---------------------------------------------
// PWA features for NASA Space Explorer
// 1. Register the service worker
// 2. Offline indicator
// 3. Custom install prompt
// 4. Notification permission + demo notification
// ---------------------------------------------

const offlineBanner = document.getElementById('offlineBanner');
const installBanner = document.getElementById('installBanner');
const installButton = document.getElementById('installBtn');
const installDismissButton = document.getElementById('installDismiss');
const iosInstallHint = document.getElementById('iosInstallHint');
const notifyButton = document.getElementById('notifyBtn');

// ---------------------------------------------
// 1. Register the service worker
// ---------------------------------------------
// Feature check: older browsers don't have service workers, so we only
// register one if the browser supports it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((registration) => {
        console.log('Service worker registered. Scope:', registration.scope);
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });
  });
}

// ---------------------------------------------
// 2. Offline indicator
// ---------------------------------------------
// navigator.onLine tells us if we're connected right now.
// The "online" and "offline" events fire whenever that changes.
function updateOnlineStatus() {
  if (navigator.onLine) {
    offlineBanner.hidden = true;
    document.body.classList.remove('is-offline');
  } else {
    offlineBanner.hidden = false;
    document.body.classList.add('is-offline');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus(); // check once when the page loads

// ---------------------------------------------
// 3. Custom install prompt
// ---------------------------------------------
// Is the app already running from the home screen?
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// We save the browser's install event here so we can use it later,
// when the user clicks OUR install button.
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  // Stop the browser from showing its own default install popup
  event.preventDefault();
  deferredInstallPrompt = event;

  // Show our custom install banner instead
  installBanner.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    return;
  }

  // Show the browser's real install dialog
  deferredInstallPrompt.prompt();

  // Wait to see if the user said yes or no
  const choice = await deferredInstallPrompt.userChoice;
  console.log('Install prompt result:', choice.outcome); // "accepted" or "dismissed"

  // The saved event can only be used once
  deferredInstallPrompt = null;
  installBanner.hidden = true;
});

installDismissButton.addEventListener('click', () => {
  installBanner.hidden = true;
});

// Fires after the app has been installed (from our button or the browser menu)
window.addEventListener('appinstalled', () => {
  console.log('NASA Space Explorer was installed!');
  deferredInstallPrompt = null;
  installBanner.hidden = true;
});

// iPhones and iPads don't support beforeinstallprompt, so Safari users
// get a short tip that explains how to add the app to their home screen.
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (isIos && !isStandalone) {
  iosInstallHint.hidden = false;
}

// ---------------------------------------------
// 4. Notifications
// ---------------------------------------------
// Feature check: only show the button if this browser supports notifications
if ('Notification' in window && 'serviceWorker' in navigator) {
  notifyButton.hidden = false;
  updateNotifyButton();
}

notifyButton.addEventListener('click', async () => {
  // Ask for permission (the browser shows its own Allow / Block popup)
  const permission = await Notification.requestPermission();
  updateNotifyButton();

  if (permission === 'granted') {
    showDemoNotification();
  } else {
    console.log('Notification permission:', permission);
  }
});

// Show a test notification. On phones, notifications must be shown by the
// service worker (new Notification() doesn't work on Android), so we use it.
async function showDemoNotification() {
  const registration = await navigator.serviceWorker.ready;
  registration.showNotification('🚀 NASA Space Explorer', {
    body: 'Notifications are on! Come back tomorrow for a new Astronomy Picture of the Day.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'demo-notification'
  });
}

// Change the button's label to match the current permission
function updateNotifyButton() {
  if (Notification.permission === 'granted') {
    notifyButton.textContent = '🔔 Send Test Notification';
  } else if (Notification.permission === 'denied') {
    notifyButton.textContent = '🔕 Notifications Blocked';
    notifyButton.disabled = true;
    notifyButton.title = 'Turn notifications back on in your browser settings.';
  } else {
    notifyButton.textContent = '🔔 Enable Notifications';
  }
}

// When permission is already granted, clicking the button sends another test
// notification (requestPermission() returns "granted" right away).
