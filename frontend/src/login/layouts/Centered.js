import React from 'react';
import { brand, brandAsset, brandText } from '../../branding';

// Single centered card over the page background (or a brand background image).
// No side panel — logo + name sit above the form card.
export default function Centered({ form }) {
  const b = brand();
  const bg = b.background ? brandAsset(b.background) : null;
  return (
    <div
      className="login-root login-layout-centered"
      style={bg ? { backgroundImage: `url(${bg})` } : undefined}
    >
      <div className="login-centered-wrap">
        <div className="login-centered-head">
          {b.logo && (
            <img src={brandAsset(b.logo)} alt={b.appName} className="login-centered-logo" />
          )}
          <h1 className="login-app-name login-centered-name">{b.appName}</h1>
          {b.tagline && <p className="login-app-desc login-centered-desc">{b.tagline}</p>}
        </div>
        <div className="login-card">{form}</div>
        {b.footer && (
          <div className="login-centered-footer">{brandText(b.footer)}</div>
        )}
      </div>
    </div>
  );
}
