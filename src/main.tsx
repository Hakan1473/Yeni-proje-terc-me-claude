import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data === 'app-updated' && performance.now() < 8000) location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
