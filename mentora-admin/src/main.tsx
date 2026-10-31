import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';
import './index.css';

// Apply the stored/system theme before first paint to avoid a flash.
initTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
