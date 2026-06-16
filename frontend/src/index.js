import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from './ErrorBoundary';
import { installGlobalErrorLogging } from './errorLog';

// Capture uncaught errors & unhandled promise rejections app-wide → backend log.
installGlobalErrorLogging();

// Load runtime config before rendering — allows API_URL to be changed
// per environment by editing public/config.json without rebuilding.
fetch('/config.json')
  .then(r => r.json())
  .then(cfg => { window.__APP_CONFIG__ = cfg; })
  .catch(() => { /* fallback to defaults in Variable.js */ })
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
