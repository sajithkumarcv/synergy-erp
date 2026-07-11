import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import './Settings.css';

// Read live per call — a module-level snapshot would freeze to the fallback URL
// before config.json loads window.__APP_CONFIG__.
const API = () => variables.API_URL;

const Field = ({ label, hint, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b',
                        textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {label}
        </label>
        {children}
        {hint && <span style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</span>}
    </div>
);

const Input = ({ value, onChange, name, type = 'text', placeholder }) => (
    <input
        type={type} name={name} value={value ?? ''} onChange={onChange}
        placeholder={placeholder}
        style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 10px',
                 fontSize: 13, color: '#0f172a', width: '100%', boxSizing: 'border-box' }}
    />
);

export default function SmtpSettings() {
    const [form, setForm]       = useState({
        host: '', port: 587, username: '', password: '',
        fromAddress: '', fromName: '', enableSsl: true,
    });
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [msg,      setMsg]      = useState({ type: '', text: '' });
    const [showPass, setShowPass] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API()}appsettings/smtp`, { headers: authHeaders() });
            if (r.ok) {
                const d = await r.json();
                setForm({
                    host:        d.host        || '',
                    port:        d.port        || 587,
                    username:    d.username    || '',
                    password:    d.password    || '',
                    fromAddress: d.fromAddress || '',
                    fromName:    d.fromName    || '',
                    enableSsl:   d.enableSsl   !== false,
                });
            }
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = async (e) => {
        e.preventDefault();
        if (!form.host.trim())        return setMsg({ type: 'err', text: 'SMTP Host is required.' });
        if (!form.username.trim())    return setMsg({ type: 'err', text: 'Username is required.' });
        if (!form.fromAddress.trim()) return setMsg({ type: 'err', text: 'From Address is required.' });

        setSaving(true);
        setMsg({ type: '', text: '' });
        try {
            const r = await fetch(`${API()}appsettings/smtp`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    ...form,
                    port: parseInt(form.port) || 587,
                }),
            });
            const d = await r.json();
            setMsg({ type: r.ok ? 'ok' : 'err', text: d.message });
        } catch {
            setMsg({ type: 'err', text: 'Unexpected error. Please try again.' });
        } finally { setSaving(false); }
    };

    if (loading) return <div className="settings-loading">Loading…</div>;

    return (
        <div className="settings-page">
            <div className="settings-card" style={{ maxWidth: 640 }}>
                {/* Header */}
                <div className="settings-card-header">
                    <div>
                        <div className="settings-card-title">SMTP Configuration</div>
                        <div className="settings-card-sub">
                            Outgoing email server settings for alert notifications
                        </div>
                    </div>
                </div>

                <form onSubmit={save}>
                    <div className="settings-card-body">
                        {msg.text && (
                            <div style={{
                                padding: '10px 14px', borderRadius: 7, marginBottom: 18,
                                fontSize: 13, fontWeight: 500,
                                background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
                                color:      msg.type === 'ok' ? '#16a34a' : '#dc2626',
                                border:     `1px solid ${msg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
                            }}>
                                {msg.text}
                            </div>
                        )}

                        {/* Server */}
                        <div className="settings-section-label">Server</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14, marginBottom: 18 }}>
                            <Field label="SMTP Host" hint="e.g. smtp.gmail.com, smtp.office365.com">
                                <Input name="host" value={form.host} onChange={handle}
                                    placeholder="smtp.gmail.com" />
                            </Field>
                            <Field label="Port" hint="Usually 587 (TLS) or 465 (SSL)">
                                <Input name="port" value={form.port} onChange={handle}
                                    type="number" placeholder="587" />
                            </Field>
                        </div>

                        {/* SSL toggle */}
                        <div style={{ marginBottom: 22 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                <input type="checkbox" name="enableSsl" checked={form.enableSsl}
                                    onChange={handle}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                                <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>
                                    Enable SSL / TLS
                                </span>
                            </label>
                        </div>

                        {/* Credentials */}
                        <div className="settings-section-label">Credentials</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
                            <Field label="Username" hint="Usually your email address">
                                <Input name="username" value={form.username} onChange={handle}
                                    placeholder="you@example.com" />
                            </Field>
                            <Field label="Password" hint="Use an App Password for Gmail/Outlook">
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        name="password" value={form.password} onChange={handle}
                                        placeholder="App password"
                                        style={{ border: '1px solid #cbd5e1', borderRadius: 6,
                                                 padding: '7px 36px 7px 10px', fontSize: 13,
                                                 color: '#0f172a', width: '100%', boxSizing: 'border-box' }}
                                    />
                                    <button type="button"
                                        onClick={() => setShowPass(p => !p)}
                                        style={{ position: 'absolute', right: 8, top: '50%',
                                                 transform: 'translateY(-50%)', background: 'none',
                                                 border: 'none', cursor: 'pointer', fontSize: 13,
                                                 color: '#64748b', padding: 0 }}>
                                        {showPass ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </Field>
                        </div>

                        {/* Sender */}
                        <div className="settings-section-label">Sender Identity</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <Field label="From Address" hint="Email address shown as sender">
                                <Input name="fromAddress" value={form.fromAddress} onChange={handle}
                                    placeholder="noreply@yourcompany.com" />
                            </Field>
                            <Field label="From Name" hint="Display name shown in inbox">
                                <Input name="fromName" value={form.fromName} onChange={handle}
                                    placeholder="WebERP Alerts" />
                            </Field>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="settings-card-footer">
                        <button type="submit" className="settings-save-btn" disabled={saving}>
                            {saving ? 'Saving…' : 'Save SMTP Settings'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Info box */}
            <div style={{ maxWidth: 640, marginTop: 16, padding: '14px 18px',
                          background: '#fffbeb', border: '1px solid #fde68a',
                          borderRadius: 10, fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
                <strong>Gmail:</strong> Use an <em>App Password</em> (not your login password).
                Enable 2FA → Google Account → Security → App Passwords.<br />
                <strong>Port 587</strong> = STARTTLS &nbsp;|&nbsp;
                <strong>Port 465</strong> = SSL &nbsp;|&nbsp;
                <strong>Port 25</strong> = Plain (not recommended)
            </div>
        </div>
    );
}
