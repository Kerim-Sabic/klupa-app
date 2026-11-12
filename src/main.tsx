import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppErrorBoundary } from './app/ErrorScreen';
import { reporter, startVitals } from './app/reporter';
import { registerServiceWorker } from './app/registerServiceWorker';
import './i18n';
import { installErrorReporting } from './lib/report';
import './index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root element #root is missing from index.html.');
}

// Errors nothing else caught (event handlers, timers, rejected promises) are reported too.
installErrorReporting(reporter, window);
// How fast this page load felt: three numbers, no person (see lib/vitals.ts).
startVitals();

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
