import React, { useState } from 'react';
import { getFileUrl } from '../../Variable';

// ── Logo with fallback ────────────────────────────────────────
export const CompanyLogo = ({ url }) => {
    const [ok, setOk] = useState(true);
    const src = getFileUrl(url);
    if (!src || !ok)
        return <div className="pop-logo-placeholder">COMPANY<br />LOGO</div>;
    return <img src={src} alt="Logo" className="pop-logo" onError={() => setOk(false)} />;
};

// ── Company header band (matches the image layout) ────────────
// Left: name + address block   Right: logo
export const CompanyHeaderBand = ({ company, loading }) => {
    const primaryAddr = company?.addresses?.find(a => a.isPrimary)
        ?? company?.addresses?.[0];

    return (
        <div className="pop-company-header-band"
             style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: 12,
                      paddingBottom: 10, borderBottom: '2px solid #1e3a5f' }}>
            {/* Left: name + address */}
            <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f', marginBottom: 4 }}>
                    {loading ? '…' : (company?.companyName || '—')}
                </div>
                {primaryAddr && (
                    <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
                        {[primaryAddr.addressLine1, primaryAddr.addressLine2,
                          primaryAddr.city, primaryAddr.state, primaryAddr.country]
                            .filter(Boolean).join(', ')}
                    </div>
                )}
                {(company?.phone || company?.fax || company?.email) && (
                    <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
                        {company.phone && <>Tel : {company.phone}</>}
                        {company.fax   && <>{'   '}Fax: {company.fax}</>}
                        {company.email && <>{'   '}Email :  {company.email}</>}
                    </div>
                )}
                {(company?.trn || company?.website) && (
                    <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
                        {company.trn     && <>TRN: {company.trn}</>}
                        {company.website && <>{company.trn ? '  ,  ' : ''}Web : {company.website}</>}
                    </div>
                )}
            </div>
            {/* Right: logo */}
            <CompanyLogo url={company?.logoPath} />
        </div>
    );
};

// ── Bank details table block ──────────────────────────────────
export const BankDetailsBlock = ({ banks = [], note, headerBg = '#1e3a5f', rowAlt = '#f8fafc' }) => {
    if (!banks.length) return null;

    // Group by beneficiary+bank — show one header row per unique bank
    const bankGroups = banks.reduce((acc, b) => {
        const key = `${b.bankName}|${b.beneficiary}|${b.swift}|${b.branchAddress}`;
        if (!acc[key]) acc[key] = { ...b, accounts: [] };
        acc[key].accounts.push({ currency: b.currency, accountNo: b.accountNo, iban: b.iban });
        return acc;
    }, {});

    return (
        <div style={{ margin: '0 0 20px', border: '1px solid #e2e8f0',
                      borderRadius: 6, overflow: 'hidden' }}>
            {/* Header bar */}
            <div style={{ background: headerBg, color: '#fff', padding: '7px 16px',
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '.07em' }}>
                Bank Details
            </div>

            <div style={{ padding: '12px 16px', background: '#f8fafc' }}>
                {/* Note */}
                {note && (
                    <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic',
                                  marginBottom: 10, paddingBottom: 8,
                                  borderBottom: '1px solid #e2e8f0' }}>
                        {note}
                    </div>
                )}

                {Object.values(bankGroups).map((grp, gi) => (
                    <div key={gi} style={{ marginBottom: gi < Object.keys(bankGroups).length - 1 ? 16 : 0 }}>
                        {/* Beneficiary + Bank name */}
                        <div style={{ display: 'flex', gap: 32, marginBottom: 8, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                              letterSpacing: '.07em', color: '#64748b', marginBottom: 2 }}>
                                    Beneficiary
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                                    {grp.beneficiary}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                              letterSpacing: '.07em', color: '#64748b', marginBottom: 2 }}>
                                    Bank
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                                    {grp.bankName}
                                </div>
                            </div>
                        </div>

                        {/* Account rows */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr style={{ background: '#e2e8f0' }}>
                                    {['CCY', 'Account No', 'IBAN'].map(h => (
                                        <th key={h} style={{ padding: '5px 10px', textAlign: 'left',
                                                             fontWeight: 700, fontSize: 9,
                                                             textTransform: 'uppercase',
                                                             letterSpacing: '.05em', color: '#475569',
                                                             ...(h === 'CCY' ? { width: 50 } : {}) }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {grp.accounts.map((a, i) => (
                                    <tr key={a.currency}
                                        style={{ background: i % 2 === 0 ? '#fff' : rowAlt,
                                                 borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 700,
                                                     color: '#1e293b' }}>{a.currency}</td>
                                        <td style={{ padding: '6px 10px', fontFamily: 'Courier New',
                                                     fontSize: 11, color: '#1e293b' }}>{a.accountNo}</td>
                                        <td style={{ padding: '6px 10px', fontFamily: 'Courier New',
                                                     fontSize: 11, color: '#1e293b' }}>{a.iban}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Branch + SWIFT */}
                        {(grp.branchAddress || grp.swift) && (
                            <div style={{ display: 'flex', gap: 32, marginTop: 6,
                                          flexWrap: 'wrap', fontSize: 11, color: '#475569' }}>
                                {grp.branchAddress && <span>{grp.branchAddress}</span>}
                                {grp.swift && (
                                    <span>
                                        <span style={{ fontWeight: 700 }}>SWIFT: </span>
                                        <span style={{ fontFamily: 'Courier New', fontWeight: 700,
                                                       color: '#1e293b' }}>{grp.swift}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
