import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { engine } from './live/engine';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Installable app shell: instant start from the home screen (see public/sw.js)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The cached page opened instantly; if the server has a newer one, switch while the splash still plays
  // Later (slow server), switch the next time the app comes back to the foreground, never mid-conversation
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data !== 'app-updated') return;
    if (performance.now() < 8000) location.reload();
    else
      document.addEventListener('visibilitychange', function onShow() {
        if (document.visibilityState === 'visible' && !engine.isActive) {
          document.removeEventListener('visibilitychange', onShow);
          location.reload();
        }
      });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
