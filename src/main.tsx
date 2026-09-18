// =============================================================================
// Memory Board – Application entry point
// =============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { apiService } from './services/apiService';
import './styles/main.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html.');

const mount = () => {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

/**
 * Bootstrap: confirm the PHP session before the first board fetch.
 * Unauthenticated sessions open LoginModal; offline sessions skip the prompt
 * so IndexedDB can still render a cached board.
 */
void apiService.ensureAuthenticated().finally(mount);
