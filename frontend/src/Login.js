import React from 'react';
import './Login.css';
import { brand } from './branding';
import LoginForm  from './login/LoginForm';
import Aurora     from './login/layouts/Aurora';
import SplitLeft  from './login/layouts/SplitLeft';
import SplitRight from './login/layouts/SplitRight';
import Centered   from './login/layouts/Centered';
import FullScreen from './login/layouts/FullScreen';

// ═══════════════════════════════════════════════════════════════════
// Login — thin dispatcher. Picks a layout shell by the active brand's
// "layout" key and injects the single shared <LoginForm/>. All client
// customization is data (public/branding/<client>/) — no code change or
// rebuild needed to restyle, rebrand, or switch a client's login page.
//
// To add a brand-new page STRUCTURE (rare): drop a component in
// login/layouts/ and register it in LAYOUTS below. Existing brands are
// unaffected; any client can then opt in via their brand.json.
// ═══════════════════════════════════════════════════════════════════

const LAYOUTS = {
  'aurora':      Aurora,
  'split-left':  SplitLeft,
  'split-right': SplitRight,
  'centered':    Centered,
  'fullscreen':  FullScreen,
};

export default function Login() {
  const b = brand();
  const Layout = LAYOUTS[b.layout] || SplitLeft;
  return <Layout brand={b} form={<LoginForm />} />;
}
