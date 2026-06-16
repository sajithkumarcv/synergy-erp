import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { variables, authHeaders } from './Variable';

// ─────────────────────────────────────────────────────────────
// THEME DEFINITIONS
// Each theme is a set of CSS custom properties applied to :root
// Modern concept: each theme has a personality, not just colours
// ─────────────────────────────────────────────────────────────
export const THEMES = {
  'ocean-blue': {
    name:        'Ocean Blue',
    description: 'Clean, professional blue — the default',
    preview:     ['#2e5fa3', '#eef2f8', '#0f766e'],

    // Header
    '--header-bg':          '#2e5fa3',
    '--header-text':        '#ffffff',
    '--header-sub':         '#b8d0f0',
    '--header-logo-bg':     '#ffffff',
    '--header-logo-color':  '#2e5fa3',
    '--header-btn-bg':      'rgba(255,255,255,0.16)',
    '--header-btn-border':  'rgba(255,255,255,0.28)',

    // Sidebar
    '--side-bg':            '#eef2f8',
    '--side-border':        '#d4dce9',
    '--side-text':          '#4a6080',
    '--side-active-bg':     '#e0e8f4',
    '--side-active-text':   '#2e5fa3',
    '--side-active-border': '#2e5fa3',
    '--side-header-text':   '#3a5070',
    '--side-sub-bg':        '#f4f7fc',

    // Main content
    '--main-bg':            '#f5f7fb',
    '--main-text':          '#334155',

    // Primary accent
    '--primary':            '#2e5fa3',
    '--primary-hover':      '#245090',
    '--primary-light':      '#dbeafe',
    '--primary-light-text': '#1e40af',

    // Secondary accent (teal)
    '--teal':               '#0f766e',
    '--teal-hover':         '#0a5c55',
    '--teal-light':         '#d1fae5',

    // Filter panel
    '--fp-bg':              '#f7f9fc',
    '--fp-header-bg':       '#2e5fa3',
    '--fp-group-bg':        '#eef2f8',
    '--fp-group-hover':     '#e4ecf6',
    '--fp-border':          '#e0e8f2',
  },

  'midnight-dark': {
    name:        'Midnight Dark',
    description: 'Sleek dark mode — easy on the eyes',
    preview:     ['#1e1e2e', '#2a2a3e', '#7c6af7'],

    '--header-bg':          '#12121e',
    '--header-text':        '#e2e2f0',
    '--header-sub':         '#7070a0',
    '--header-logo-bg':     '#7c6af7',
    '--header-logo-color':  '#ffffff',
    '--header-btn-bg':      'rgba(255,255,255,0.08)',
    '--header-btn-border':  'rgba(255,255,255,0.15)',

    '--side-bg':            '#1e1e2e',
    '--side-border':        '#2e2e42',
    '--side-text':          '#9090c0',
    '--side-active-bg':     '#2d2d45',
    '--side-active-text':   '#a89af7',
    '--side-active-border': '#7c6af7',
    '--side-header-text':   '#7070a0',
    '--side-sub-bg':        '#252536',

    '--main-bg':            '#16162a',
    '--main-text':          '#d0d0e8',

    '--primary':            '#7c6af7',
    '--primary-hover':      '#6a58e0',
    '--primary-light':      '#2d2d50',
    '--primary-light-text': '#a89af7',

    '--teal':               '#22d3ee',
    '--teal-hover':         '#0bc5e0',
    '--teal-light':         '#0f3040',

    '--fp-bg':              '#1e1e2e',
    '--fp-header-bg':       '#12121e',
    '--fp-group-bg':        '#252536',
    '--fp-group-hover':     '#2d2d45',
    '--fp-border':          '#2e2e42',
  },

  'carbon-dark': {
    name:        'Carbon Dark',
    description: 'Warm charcoal dark — vivid accents, easy reading',
    preview:     ['#25262b', '#1a1b1e', '#4dabf7'],

    // Header
    '--header-bg':          '#1e2028',
    '--header-text':        '#ffffff',
    '--header-sub':         '#aab0c0',
    '--header-logo-bg':     '#4dabf7',
    '--header-logo-color':  '#151720',
    '--header-btn-bg':      'rgba(255,255,255,0.10)',
    '--header-btn-border':  'rgba(255,255,255,0.22)',

    // Sidebar
    '--side-bg':            '#1e2028',
    '--side-border':        '#2e3240',
    '--side-text':          '#dde1ea',
    '--side-active-bg':     '#262a36',
    '--side-active-text':   '#74c0fc',
    '--side-active-border': '#4dabf7',
    '--side-header-text':   '#aab0c0',
    '--side-sub-bg':        '#252830',

    // Main content
    '--main-bg':            '#151720',
    '--main-text':          '#d0d4de',

    // Primary accent — sky blue
    '--primary':            '#4dabf7',
    '--primary-hover':      '#339af0',
    '--primary-light':      '#1e3a52',
    '--primary-light-text': '#74c0fc',

    // Secondary accent — mint green
    '--teal':               '#69db7c',
    '--teal-hover':         '#51cf66',
    '--teal-light':         '#1a3325',

    // Filter panel
    '--fp-bg':              '#25262b',
    '--fp-header-bg':       '#1a1b1e',
    '--fp-group-bg':        '#2c2e33',
    '--fp-group-hover':     '#373a40',
    '--fp-border':          '#373a40',
  },

  'forest-green': {
    name:        'Forest Green',
    description: 'Calm, natural green — focused productivity',
    preview:     ['#1a4731', '#ecf5f0', '#d97706'],

    '--header-bg':          '#1a4731',
    '--header-text':        '#ffffff',
    '--header-sub':         '#86c8a8',
    '--header-logo-bg':     '#ffffff',
    '--header-logo-color':  '#1a4731',
    '--header-btn-bg':      'rgba(255,255,255,0.16)',
    '--header-btn-border':  'rgba(255,255,255,0.28)',

    '--side-bg':            '#f0f8f4',
    '--side-border':        '#c8e6d6',
    '--side-text':          '#2d6048',
    '--side-active-bg':     '#d4eddf',
    '--side-active-text':   '#1a4731',
    '--side-active-border': '#1a4731',
    '--side-header-text':   '#2d6048',
    '--side-sub-bg':        '#f5fbf7',

    '--main-bg':            '#f7faf8',
    '--main-text':          '#1e3a2e',

    '--primary':            '#1a4731',
    '--primary-hover':      '#153b27',
    '--primary-light':      '#d4eddf',
    '--primary-light-text': '#1a4731',

    '--teal':               '#d97706',
    '--teal-hover':         '#b45309',
    '--teal-light':         '#fef3c7',

    '--fp-bg':              '#f0f8f4',
    '--fp-header-bg':       '#1a4731',
    '--fp-group-bg':        '#e8f5ee',
    '--fp-group-hover':     '#d4eddf',
    '--fp-border':          '#c8e6d6',
  },
};

// ─────────────────────────────────────────────────────────────
// ThemeContext
// ─────────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const { auth, updateTheme } = useAuth();

  const activeTheme = auth?.theme || 'ocean-blue';

  // Apply CSS variables to :root whenever theme changes
  const applyTheme = useCallback((themeKey) => {
    const vars = THEMES[themeKey] || THEMES['ocean-blue'];
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, val]) => {
      if (key.startsWith('--')) root.style.setProperty(key, val);
    });
    // Also set a data-theme attribute for any CSS selectors that need it
    root.setAttribute('data-theme', themeKey);
  }, []);

  // Apply on mount and whenever auth.theme changes
  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme, applyTheme]);

  // Called from the theme picker — saves to DB then updates local state
  const setTheme = useCallback(async (themeKey) => {
    if (!THEMES[themeKey]) return;
    applyTheme(themeKey);
    updateTheme(themeKey);

    // Persist to DB in background — fire and forget
    try {
      await fetch(`${variables.API_URL}user/theme`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ userId: auth?.userId, theme: themeKey }),
      });
    } catch (e) {
      console.error('[ThemeContext] Failed to save theme to server:', e);
    }
  }, [auth?.userId, applyTheme, updateTheme]);

  return (
    <ThemeContext.Provider value={{ activeTheme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside <ThemeProvider>');
  return ctx;
};

export default ThemeContext;
