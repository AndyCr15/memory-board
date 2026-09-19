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
 * Bootstrap: hydrate the PHP session and attach the tenant IndexedDB
 * partition *before* React mounts (App then calls getMemories()).
 */
void apiService.ensureAuthenticated().finally(mount);
