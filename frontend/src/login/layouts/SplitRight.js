import React from 'react';
import { brand, brandAsset, brandText } from '../../branding';

// Mirror of SplitLeft: form on the left, brand panel on the right.
// Order is driven by CSS (flex-direction: row-reverse) so the same markup
// and styles from SplitLeft are reused.
export default function SplitRight({ form }) {
  const b = brand();
  return (
    <div className="login-root login-layout-split login-split-right">
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
