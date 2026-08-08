import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../Variable';

// ── Formatters ────────────────────────────────────────────────────────────
const fmt  = v => v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Shared field/section sub-components ──────────────────────────────────
const F = ({ label, children, wide, mono }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: wide ? '1 1 100%' : '1 1 calc(50% - 6px)', minWidth: 120 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
        <span style={{ fontSize: 13, color: '#0f172a', fontFamily: mono ? 'monospace' : undefined, fontWeight: mono ? 600 : 400 }}>
            {children || <span style={{ color: '#cbd5e1' }}>—</span>}
        </span>
    </div>
);

const Section = ({ title, children }) => (
    <div style={{ marginBottom: 16 }}>
        {title && <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #f1f5f9' }}>{title}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{children}</div>
    </div>
);

const LinesTable = ({ columns, rows, emptyMsg }) => (
    <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid #e2e8f0', marginTop: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
                <tr style={{ background: '#f8fafc' }}>
                    {columns.map((c, i) => (
                        <th key={i} style={{ padding: '6px 10px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px', color: '#64748b', textAlign: c.right ? 'right' : 'left', whiteSpace: 'nowrap' }}>{c.label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.length === 0
                    ? <tr><td colSpan={columns.length} style={{ padding: '12px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{emptyMsg || 'No lines.'}</td></tr>
                    : rows.map((row, ri) => (
                        <tr key={ri} style={{ borderTop: '1px solid #f1f5f9' }}>
                            {columns.map((c, ci) => (
                                <td key={ci} style={{ padding: '6px 10px', textAlign: c.right ? 'right' : 'left', fontFamily: c.mono ? 'monospace' : undefined, whiteSpace: c.nowrap ? 'nowrap' : undefined }}>
                                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))
                }
            </tbody>
        </table>
    </div>
);

const StatusBadge = ({ label, color = '#475569', bg = '#f1f5f9' }) => (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: bg, color }}>
        {label}
    </span>
);

// ── Module config: fetch URLs + renderers ─────────────────────────────────
const MODULE_CONFIG = {
    PR: {
        fetch: async (id) => {
            const [h, l] = await Promise.all([
                fetch(`${variables.API_URL}purchaserequest/${id}`,        { headers: authHeaders() }).then(r => r.json()),
                fetch(`${variables.API_URL}purchaserequest/lines/${id}`,  { headers: authHeaders() }).then(r => r.json()),
            ]);
            return { header: h, lines: Array.isArray(l) ? l : [] };
        },
        render: ({ header: pr, lines }) => (
            <>
                <Section>
                    <F label="PR Number" mono>{pr.prNumber}</F>
                    <F label="Date">{fmtD(pr.prDate)}</F>
                    <F label="Status"><StatusBadge label={pr.status} /></F>
                    <F label="Priority">{pr.priority || '—'}</F>
                    <F label="Requested By">{pr.requestedBy}</F>
                    <F label="Linked Job">{pr.jobId || '—'}</F>
                    {pr.notes && <F label="Notes" wide>{pr.notes}</F>}
                </Section>
                <Section title={`Lines (${lines.length})`}>
                    <div style={{ width: '100%' }}>
                        <LinesTable
                            columns={[
                                { label: '#', key: 'lineNum' },
                                { label: 'Item Code', key: 'itemCode', mono: true },
                                { label: 'Description', key: 'itemDesc' },
                                { label: 'UOM', key: 'uomName' },
                                { label: 'Qty', key: 'requiredQty', right: true, render: r => fmt(r.requiredQty) },
                                { label: 'Req. Date', key: 'requiredDate', nowrap: true, render: r => fmtD(r.requiredDate) },
                            ]}
                            rows={lines}
                        />
                    </div>
                </Section>
            </>
        ),
    },

    PO: {
        fetch: async (id) => {
            const [h, l] = await Promise.all([
                fetch(`${variables.API_URL}purchaseorder/${id}`,       { headers: authHeaders() }).then(r => r.json()),
                fetch(`${variables.API_URL}purchaseorder/lines/${id}`, { headers: authHeaders() }).then(r => r.json()),
            ]);
            return { header: h, lines: Array.isArray(l) ? l : [] };
        },
        render: ({ header: po, lines }) => (
            <>
                <Section>
                    <F label="PO Number" mono>{po.poNumber}</F>
                    <F label="Date">{fmtD(po.poDate)}</F>
                    <F label="Status"><StatusBadge label={po.status} /></F>
                    <F label="Supplier">{po.supplierName}</F>
                    <F label="Linked Job">{po.jobId || '—'}</F>
                    <F label="Currency">{po.currencyName || '—'}{po.exchangeRate && po.exchangeRate !== 1 ? ` @ ${po.exchangeRate}` : ''}</F>
                    <F label="Delivery Date">{fmtD(po.deliveryDate)}</F>
                    <F label="Payment Terms">{po.paymentTermsName || '—'}</F>
                    <F label="Total Amount" mono>{fmt(po.totalAmount)}</F>
                    {po.notes && <F label="Notes" wide>{po.notes}</F>}
                </Section>
                <Section title={`Lines (${lines.length})`}>
                    <div style={{ width: '100%' }}>
                        <LinesTable
                            columns={[
                                { label: '#', key: 'lineNum' },
                                { label: 'Item Code', key: 'itemCode', mono: true },
                                { label: 'Description', key: 'itemDesc' },
                                { label: 'UOM', key: 'uomName' },
                                { label: 'Qty', key: 'orderedQty', right: true, render: r => fmt(r.orderedQty) },
                                { label: 'Unit Price', key: 'unitPrice', right: true, render: r => fmt(r.unitPrice) },
                                { label: 'Total', key: 'lineTotal', right: true, render: r => fmt(r.lineTotal) },
                            ]}
                            rows={lines}
                        />
                    </div>
                </Section>
            </>
        ),
    },

    JOB: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}job/${encodeURIComponent(id)}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h };
        },
        render: ({ header: j }) => (
            <Section>
                <F label="Job ID" mono>{j.jobId}</F>
                <F label="Project Name" wide>{j.projectName}</F>
                <F label="Customer">{j.customerName}</F>
                <F label="Status"><StatusBadge label={j.jobStatusName || j.jobStatusId} /></F>
                <F label="Type">{j.jobTypeName || j.jobTypeCode || '—'}</F>
                <F label="Job Date">{fmtD(j.jobDate)}</F>
                <F label="Order Value" mono>{fmt(j.jobOrderValue)}</F>
                <F label="Currency">{j.currencyName || '—'}</F>
                {j.jobDescription && <F label="Description" wide>{j.jobDescription}</F>}
            </Section>
        ),
    },

    BOM: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}bom/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h.header ?? h, lines: h.details ?? [] };
        },
        render: ({ header: b, lines }) => (
            <>
                <Section>
                    <F label="BOM Number" mono>{b.bomNumber}</F>
                    <F label="Version">v{b.bomVersion}</F>
                    <F label="Status"><StatusBadge label={b.bomStatus} /></F>
                    <F label="Linked Job">{b.jobId || '—'}</F>
                    <F label="Job Type">{b.jobTypeName || b.jobTypeCode || '—'}</F>
                    <F label="Created By">{b.createdBy}</F>
                    {b.notes && <F label="Notes" wide>{b.notes}</F>}
                </Section>
                <Section title={`Lines (${lines.length})`}>
                    <div style={{ width: '100%' }}>
                        <LinesTable
                            columns={[
                                { label: 'Section', key: 'sectionName' },
                                { label: 'Item Code', key: 'itemCode', mono: true },
                                { label: 'Description', key: 'itemName' },
                                { label: 'UOM', key: 'uomCode' },
                                { label: 'Qty', key: 'bomRequestedQty', right: true, render: r => fmt(r.bomRequestedQty) },
                            ]}
                            rows={lines}
                        />
                    </div>
                </Section>
            </>
        ),
    },

    INV: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}invoice/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h };
        },
        render: ({ header: inv }) => (
            <Section>
                <F label="Invoice No." mono>{inv.invoiceNumber}</F>
                <F label="Date">{fmtD(inv.invoiceDate)}</F>
                <F label="Due Date">{fmtD(inv.dueDate)}</F>
                <F label="Status"><StatusBadge label={inv.status} /></F>
                <F label="Customer">{inv.customerName}</F>
                <F label="Job">{inv.jobId || '—'}</F>
                <F label="Currency">{inv.currencyName || '—'}</F>
                <F label="Total Amount" mono>{fmt(inv.totalAmount)}</F>
                <F label="Paid Amount" mono>{fmt(inv.paidAmount)}</F>
                <F label="Balance" mono>{fmt((inv.totalAmount ?? 0) - (inv.paidAmount ?? 0))}</F>
                {inv.notes && <F label="Notes" wide>{inv.notes}</F>}
            </Section>
        ),
    },

    MH: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}manhour/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h.header ?? h, lines: h.lines ?? [] };
        },
        render: ({ header: mh, lines }) => (
            <>
                <Section>
                    <F label="Sheet No." mono>{mh.manhourNumber || mh.manhourId}</F>
                    <F label="Job">{mh.jobId || '—'}</F>
                    <F label="Period">{fmtD(mh.periodStart)} – {fmtD(mh.periodEnd)}</F>
                    <F label="Status"><StatusBadge label={mh.status} /></F>
                    <F label="Total Hours" mono>{fmt(mh.totalHours)}</F>
                </Section>
                {lines.length > 0 && (
                    <Section title={`Entries (${lines.length})`}>
                        <div style={{ width: '100%' }}>
                            <LinesTable
                                columns={[
                                    { label: 'Employee', key: 'employeeName' },
                                    { label: 'Date', key: 'workDate', render: r => fmtD(r.workDate) },
                                    { label: 'Hours', key: 'hours', right: true, render: r => fmt(r.hours) },
                                    { label: 'Activity', key: 'activityName' },
                                ]}
                                rows={lines}
                            />
                        </div>
                    </Section>
                )}
            </>
        ),
    },

    ADJ: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}stockadjustment/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h.header ?? h, lines: h.lines ?? h.details ?? [] };
        },
        render: ({ header: adj, lines }) => (
            <>
                <Section>
                    <F label="Adj. Number" mono>{adj.adjustmentNumber}</F>
                    <F label="Date">{fmtD(adj.adjustmentDate)}</F>
                    <F label="Status"><StatusBadge label={adj.status} /></F>
                    <F label="Warehouse">{adj.warehouseName || '—'}</F>
                    <F label="Reason">{adj.reason || '—'}</F>
                    <F label="Created By">{adj.createdBy}</F>
                    {adj.notes && <F label="Notes" wide>{adj.notes}</F>}
                </Section>
                {lines.length > 0 && (
                    <Section title={`Lines (${lines.length})`}>
                        <div style={{ width: '100%' }}>
                            <LinesTable
                                columns={[
                                    { label: 'Item Code', key: 'itemCode', mono: true },
                                    { label: 'Description', key: 'itemDesc' },
                                    { label: 'UOM', key: 'uomName' },
                                    { label: 'Qty', key: 'adjustQty', right: true, render: r => fmt(r.adjustQty) },
                                ]}
                                rows={lines}
                            />
                        </div>
                    </Section>
                )}
            </>
        ),
    },

    SRV: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}servicereceipt/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h.header ?? h, lines: h.lines ?? [] };
        },
        render: ({ header: srv, lines }) => (
            <>
                <Section>
                    <F label="SRV Number" mono>{srv.srvNumber}</F>
                    <F label="Date">{fmtD(srv.srvDate)}</F>
                    <F label="Status"><StatusBadge label={srv.status} /></F>
                    <F label="Supplier">{srv.supplierName || '—'}</F>
                    <F label="PO Reference">{srv.poNumber || '—'}</F>
                    <F label="Total Amount" mono>{fmt(srv.totalAmount)}</F>
                </Section>
                {lines.length > 0 && (
                    <Section title={`Lines (${lines.length})`}>
                        <div style={{ width: '100%' }}>
                            <LinesTable
                                columns={[
                                    { label: 'Item Code', key: 'itemCode', mono: true },
                                    { label: 'Description', key: 'itemDesc' },
                                    { label: 'UOM', key: 'uomName' },
                                    { label: 'Qty', key: 'completedQty', right: true, render: r => fmt(r.completedQty) },
                                    { label: 'Unit Price', key: 'unitCost', right: true, render: r => fmt(r.unitCost) },
                                    { label: 'Total', key: 'totalCost', right: true, render: r => fmt(r.totalCost) },
                                ]}
                                rows={lines}
                            />
                        </div>
                    </Section>
                )}
            </>
        ),
    },

    IRN: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}stockissuereturn/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h.header ?? h, lines: h.lines ?? h.details ?? [] };
        },
        render: ({ header: irn, lines }) => (
            <>
                <Section>
                    <F label="IRN Number" mono>{irn.irnNumber}</F>
                    <F label="Date">{fmtD(irn.irnDate)}</F>
                    <F label="Status"><StatusBadge label={irn.status} /></F>
                    <F label="Job">{irn.jobId || '—'}</F>
                    <F label="Created By">{irn.createdBy}</F>
                </Section>
                {lines.length > 0 && (
                    <Section title={`Lines (${lines.length})`}>
                        <div style={{ width: '100%' }}>
                            <LinesTable
                                columns={[
                                    { label: 'Item Code', key: 'itemCode', mono: true },
                                    { label: 'Description', key: 'itemName' },
                                    { label: 'UOM', key: 'uomName' },
                                    { label: 'Qty', key: 'returnQty', right: true, render: r => fmt(r.returnQty) },
                                ]}
                                rows={lines}
                            />
                        </div>
                    </Section>
                )}
            </>
        ),
    },

    RV: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}receiptvoucher/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h };
        },
        render: ({ header: rv }) => (
            <Section>
                <F label="RV Number" mono>{rv.rvNumber}</F>
                <F label="Date">{fmtD(rv.rvDate)}</F>
                <F label="Status"><StatusBadge label={rv.status} /></F>
                <F label="Customer">{rv.customerName}</F>
                <F label="Payment Method">{rv.paymentMethod || '—'}</F>
                <F label="Currency">{rv.currencyName || '—'}</F>
                <F label="Amount" mono>{fmt(rv.amount)}</F>
                <F label="Reference">{rv.referenceNo || '—'}</F>
                {rv.notes && <F label="Notes" wide>{rv.notes}</F>}
            </Section>
        ),
    },

    PV: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}paymentvoucher/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h };
        },
        render: ({ header: pv }) => (
            <Section>
                <F label="PV Number" mono>{pv.pvNumber}</F>
                <F label="Date">{fmtD(pv.pvDate)}</F>
                <F label="Status"><StatusBadge label={pv.status} /></F>
                <F label="Supplier">{pv.supplierName}</F>
                <F label="Payment Method">{pv.paymentMethod || '—'}</F>
                <F label="Currency">{pv.currencyName || '—'}</F>
                <F label="Amount" mono>{fmt(pv.amount)}</F>
                <F label="Reference">{pv.referenceNo || '—'}</F>
                {pv.notes && <F label="Notes" wide>{pv.notes}</F>}
            </Section>
        ),
    },

    CN: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}creditnote/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h };
        },
        render: ({ header: cn }) => (
            <Section>
                <F label="CN Number" mono>{cn.cnNumber}</F>
                <F label="Date">{fmtD(cn.cnDate)}</F>
                <F label="Status"><StatusBadge label={cn.status} /></F>
                <F label="Customer">{cn.customerName}</F>
                <F label="Currency">{cn.currencyName || '—'}</F>
                <F label="Amount" mono>{fmt(cn.totalAmount)}</F>
                {cn.notes && <F label="Notes" wide>{cn.notes}</F>}
            </Section>
        ),
    },

    DN: {
        fetch: async (id) => {
            const h = await fetch(`${variables.API_URL}debitnote/${id}`, { headers: authHeaders() }).then(r => r.json());
            return { header: h };
        },
        render: ({ header: dn }) => (
            <Section>
                <F label="DN Number" mono>{dn.dnNumber}</F>
                <F label="Date">{fmtD(dn.dnDate)}</F>
                <F label="Status"><StatusBadge label={dn.status} /></F>
                <F label="Supplier">{dn.supplierName}</F>
                <F label="Currency">{dn.currencyName || '—'}</F>
                <F label="Amount" mono>{fmt(dn.totalAmount)}</F>
                {dn.notes && <F label="Notes" wide>{dn.notes}</F>}
            </Section>
        ),
    },
};

// ── Main drawer component ─────────────────────────────────────────────────
const DocPreviewDrawer = ({ item, onClose, onOpenFull }) => {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    const meta   = item ? (item.moduleCode in MODULE_CONFIG ? MODULE_CONFIG[item.moduleCode] : null) : null;
    const isOpen = !!item;

    const loadData = useCallback(async () => {
        if (!item || !meta) return;
        setLoading(true); setError(''); setData(null);
        try {
            const result = await meta.fetch(item.documentId);
            setData(result);
        } catch {
            setError('Failed to load document details.');
        } finally {
            setLoading(false);
        }
    }, [item?.documentId, item?.moduleCode]); // eslint-disable-line

    useEffect(() => { if (isOpen) loadData(); }, [loadData, isOpen]);

    // Close on Escape
    useEffect(() => {
        const handler = e => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    if (!isOpen) return null;

    const moduleMeta = item ? ({
        PR: { label: 'Purchase Request', icon: '🛒', color: '#1e40af' },
        PO: { label: 'Purchase Order',   icon: '📦', color: '#065f46' },
        INV:{ label: 'Invoice',          icon: '🧾', color: '#4c1d95' },
        JOB:{ label: 'Job',              icon: '🔧', color: '#7c2d12' },
        BOM:{ label: 'BOM',              icon: '📋', color: '#0f766e' },
        MH: { label: 'Manhour Sheet',    icon: '⏱', color: '#9a3412' },
        ADJ:{ label: 'Stock Adjustment', icon: '⚖',  color: '#7c3aed' },
        SRV:{ label: 'Service Receipt',  icon: '🔧', color: '#0369a1' },
        IRN:{ label: 'Issue Return',     icon: '↩',  color: '#9d174d' },
        RV: { label: 'Receipt Voucher',  icon: '💵', color: '#166534' },
        PV: { label: 'Payment Voucher',  icon: '💳', color: '#1e40af' },
        CN: { label: 'Credit Note',      icon: '➖', color: '#6d28d9' },
        DN: { label: 'Debit Note',       icon: '➕', color: '#b91c1c' },
    }[item.moduleCode] || { label: item.moduleCode, icon: '📄', color: '#475569' }) : {};

    return ReactDOM.createPortal(
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,0.3)' }}
            />

            {/* Drawer panel */}
            <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1101,
                width: 'min(540px, 95vw)',
                background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
                display: 'flex', flexDirection: 'column',
                animation: 'slideInRight 0.2s ease-out',
            }}>
                {/* Header bar */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f8fafc', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{moduleMeta.icon}</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: moduleMeta.color }}>
                                {moduleMeta.label}
                            </div>
                            <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, fontFamily: 'monospace', marginTop: 1 }}>
                                {item.documentNo}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                            onClick={() => { onClose(); onOpenFull(item); }}
                            style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                                     border: `1px solid ${moduleMeta.color}40`, background: '#fff',
                                     color: moduleMeta.color, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Open full page →
                        </button>
                        <button
                            onClick={onClose}
                            style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #e2e8f0',
                                     background: '#fff', cursor: 'pointer', fontSize: 16, color: '#64748b',
                                     display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                            <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: moduleMeta.color,
                                          borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.7s linear infinite' }} />
                            <div style={{ fontSize: 13 }}>Loading document…</div>
                        </div>
                    )}
                    {error && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
                                      padding: '12px 16px', fontSize: 13, color: '#991b1b' }}>
                            ⚠ {error}
                            <button onClick={loadData} style={{ marginLeft: 10, fontSize: 12, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
                        </div>
                    )}
                    {!loading && !error && data && meta && meta.render(data)}
                    {!loading && !error && !meta && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>
                            Preview not available for this document type.<br />
                            <button onClick={() => { onClose(); onOpenFull(item); }}
                                    style={{ marginTop: 10, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>
                                Open full page instead →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </>,
        document.body
    );
};

export default DocPreviewDrawer;
