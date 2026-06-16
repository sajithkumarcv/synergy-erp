import React from 'react';

const ValidationModal = ({ errors, onClose }) => (
    <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
        <div style={{
            background: '#fff', borderRadius: 8, width: 380, maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}>
            <div style={{
                background: '#c0392b', color: '#fff', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontWeight: 600, fontSize: 14,
            }}>
                <span>Required Information Missing</span>
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', color: '#fff',
                    fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0,
                }}>&#10005;</button>
            </div>
            <div style={{ padding: '14px 20px' }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {errors.map((e, i) => (
                        <li key={i} style={{ fontSize: 13.5, color: '#374151', marginBottom: 4 }}>{e}</li>
                    ))}
                </ul>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb' }}>
                <button onClick={onClose} style={{
                    background: '#2e5fa3', color: '#fff', border: 'none',
                    padding: '6px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}>OK</button>
            </div>
        </div>
    </div>
);

export default ValidationModal;
