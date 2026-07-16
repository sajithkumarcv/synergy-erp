import React from 'react';
import { brand, brandAsset, brandText } from '../../branding';

// Brand panel on the LEFT, form on the right. This is the original PMS design.
export default function SplitLeft({ form }) {
  const b = brand();
  return (
    <div className="login-root login-layout-split login-split-left">
      <div className="login-left">
        <div className="login-left-inner">
          {b.logo && (
            <img src={brandAsset(b.logo)} alt={b.appName} className="login-brand-logo" />
          )}
          <h1 className="login-app-name">{b.appName}</h1>
          <p className="login-app-desc">{b.tagline}</p>
          {b.features?.length > 0 && (
            <div className="login-features">
              {b.features.map(f => (
                <div key={f} className="login-feature-item">✓ {f}</div>
              ))}
            </div>
          )}
        </div>
        {b.footer && (
          <div className="login-left-footer">{brandText(b.footer)}</div>
        )}
      </div>

      <div className="login-right">
        <div className="login-card">{form}</div>
      </div>
    </div>
  );
}
