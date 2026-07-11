import React from 'react';
import { brand, brandAsset, brandText } from '../../branding';

// Full-bleed hero background with a floating glass card on one side.
// The card side is controlled by brand.cardSide ('left' | 'right', default right).
export default function FullScreen({ form }) {
  const b = brand();
  const bg = b.background ? brandAsset(b.background) : null;
  const side = b.cardSide === 'left' ? 'login-fs-left' : 'login-fs-right';
  return (
    <div
      className={`login-root login-layout-fullscreen ${side}`}
      style={bg ? { backgroundImage: `url(${bg})` } : undefined}
    >
      <div className="login-fs-overlay" />
      <div className="login-fs-card-col">
        <div className="login-card login-fs-card">
          {b.logo && (
            <img src={brandAsset(b.logo)} alt={b.appName} className="login-fs-logo" />
          )}
          {form}
        </div>
        {b.footer && (
          <div className="login-fs-footer">{brandText(b.footer)}</div>
        )}
      </div>
    </div>
  );
}
