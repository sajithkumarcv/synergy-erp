import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from './ErrorBoundary';
import { installGlobalErrorLogging } from './errorLog';
import { loadBrand } from './branding';

// Capture uncaught errors & unhandled promise rejections app-wide → backend log.
installGlobalErrorLogging();

// Load runtime config + per-client login branding before rendering.
// loadBrand() reads public/config.json (API_URL + BRAND) and the selected
// brand folder, so API URL and login appearance are both changeable
// per environment by editing files on the server — no rebuild.
loadBrand()
  .catch(() => { /* fallback to compiled defaults in Variable.js / branding.js */ })
  .finally(() => {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    );
  });

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
