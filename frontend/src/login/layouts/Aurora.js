import React, { useEffect, useRef, useState } from 'react';
import { brand, brandAsset, brandText } from '../../branding';

// ═══════════════════════════════════════════════════════════════════
// Aurora — premium split layout: branded panel (gradient + constellation
// motif + welcome copy) on the left, glassmorphic login card on the right.
// Wraps the shared <LoginForm/>; adds only surrounding chrome (SSL badge,
// language selector, version, footer) + a light/dark toggle. All colour
// comes from brand tokens; the neutral ground is theme-aware (--au-*).
// ═══════════════════════════════════════════════════════════════════

function getTheme() {
  try { return localStorage.getItem('erp_login_theme') || ''; } catch { return ''; }
}

export default function Aurora({ form }) {
  const b = brand();
  const canvasRef = useRef(null);
  const [theme, setTheme] = useState(getTheme);

  // Persisted theme → <html data-theme>; '' means "follow the OS".
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    try { theme ? localStorage.setItem('erp_login_theme', theme) : localStorage.removeItem('erp_login_theme'); } catch {}
  }, [theme]);

  const toggleTheme = () => {
    const isDark = theme
      ? theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(isDark ? 'light' : 'dark');
  };

  // Constellation motif on the brand panel (static draw; skipped for reduced motion look — it's non-animated anyway).
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    let raf;
    const draw = () => {
      const ctx = cv.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const glow = getComputedStyle(document.documentElement).getPropertyValue('--brand-panel-glow').trim() || '#ffffff';
      ctx.clearRect(0, 0, w, h);
      const cols = 9, rows = 12, gx = w / cols, gy = h / rows, pts = [];
      for (let i = 0; i <= cols; i++)
        for (let j = 0; j <= rows; j++)
          pts.push({ x: i * gx + Math.sin(i * 3 + j) * 8, y: j * gy + Math.cos(j * 2 + i) * 8, r: (i + j) % 5 === 0 ? 2.1 : 1 });
      ctx.strokeStyle = glow + '22'; ctx.lineWidth = 1;
      for (const p of pts) for (const q of pts) {
        if (q === p) continue;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < gx * 1.15) { ctx.globalAlpha = (1 - d / (gx * 1.15)) * 0.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = glow + 'cc';
      for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    };
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    draw();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [theme, b]);

  const headline = b.headline || b.welcome || `Everything ${b.appName} runs on, in one place.`;
  const blurb    = b.blurb || (b.features || []).slice(0, 3).join(' · ');
  const initial  = (b.appName || 'P').trim().charAt(0).toUpperCase();

  return (
    <div className="login-root login-aurora">
      <button type="button" className="au-theme" onClick={toggleTheme} aria-label="Toggle light or dark mode" title="Toggle theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
      </button>

      {/* ── Brand panel ── */}
      <aside className="au-panel">
        <canvas ref={canvasRef} className="au-motif" aria-hidden="true" />
        <div className="au-wordmark">
          {b.logoWordmark && b.logo ? (
            <span className="au-logo-plate">
              <img src={brandAsset(b.logo)} alt={b.appName} />
            </span>
          ) : (
            <>
              <span className="au-monogram">
                {b.logo ? <img src={brandAsset(b.logo)} alt="" /> : initial}
              </span>
              <span className="au-wm-text">
                <span className="au-wm-name">{b.appName}</span>
                <span className="au-wm-sub">{b.tagline}</span>
              </span>
            </>
          )}
        </div>

        <div className="au-hero">
          {b.tagline && <span className="au-eyebrow">{b.tagline}</span>}
          <h1>{headline}</h1>
          {blurb && <p>{blurb}</p>}
          {b.features?.length > 0 && (
            <div className="au-marks">
              {b.features.map(f => (
                <span key={f} className="au-mark">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 8l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {b.footer && (
          <div className="au-panel-foot">
            <span>{brandText(b.footer)}</span>
          </div>
        )}
      </aside>

      {/* ── Form stage ── */}
      <main className="au-stage">
        <div className="login-card au-card">
          <div className="au-card-brand">
            {b.logoWordmark && b.logo ? (
              <span className="au-logo-plate au-logo-plate-sm">
                <img src={brandAsset(b.logo)} alt={b.appName} />
              </span>
            ) : (
              <>
                <span className="au-monogram au-monogram-sm">
                  {b.logo ? <img src={brandAsset(b.logo)} alt="" /> : initial}
                </span>
                <strong>{b.appName}</strong>
              </>
            )}
          </div>

          {form}

          {b.version && (
            <div className="au-meta">
              <span>{brandText(b.footer).split('—')[0].trim()}</span>
              <span className="au-ver">{b.version}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
