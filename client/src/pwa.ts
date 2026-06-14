export function registerPwaServiceWorker(): void {
  if (window.location.port === '5173' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('[pwa] service worker 注册失败', error);
    });
  });
}
