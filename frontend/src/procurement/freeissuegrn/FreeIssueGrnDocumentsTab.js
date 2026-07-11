import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { usePermission } from '../../PermissionContext';
import AlertModal from '../../common/AlertModal';
import ConfirmModal from '../../common/ConfirmModal';

const MODULE = 'FREEISSUEGRN';

const fmtSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDateTime = (d) => d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
const FILE_ICON = { PDF: '📄', JPG: '🖼', JPEG: '🖼' };

const FreeIssueGrnDocumentsTab = ({ grn, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { canDo } = usePermission();
    const fileRef = useRef(null);
    const editable = grn?.status !== 'Cancelled' && canDo('/free-issue-grn', 'EDIT');
    const canDelete = canDo('/free-issue-grn', 'DELETE') && grn?.status !== 'Cancelled';

    const [docs,      setDocs]      = useState([]);
    const [types,     setTypes]     = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form,      setForm]      = useState({ documentType: '', remarks: '' });
    const [file,      setFile]      = useState(null);
    const [error,     setError]     = useState('');
    const [success,   setSuccess]   = useState('');
    const [alertMsg,  setAlertMsg]  = useState(null);
    const [confirm,   setConfirm]   = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}document/${MODULE}/${grn.freeIssueGrnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setDocs(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [grn.freeIssueGrnId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch(`${variables.API_URL}document/types/${MODULE}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setTypes(list);
                if (list.length > 0) setForm(p => ({ ...p, documentType: list[0].documentType }));
            })
            .catch(console.error);
    }, []);

    const handleFile = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase();
        if (!['jpg', 'jpeg', 'pdf'].includes(ext)) {
            setError('Only JPG, JPEG and PDF files are allowed.');
            e.target.value = '';
            return;
        }
        setFile(f); setError('');
    };

    const upload = () => {
        if (!file)              { setError('Please select a file.');          return; }
        if (!form.documentType) { setError('Please select a document type.'); return; }
        setError(''); setSuccess(''); setUploading(true);

        const fd = new FormData();
        fd.append('file',         file);
        fd.append('documentType', form.documentType);
        fd.append('uploadedBy',   currentUser);
        fd.append('remarks',      form.remarks || '');

        fetch(`${variables.API_URL}document/${MODULE}/${grn.freeIssueGrnId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessionStorage.getItem('erp_token') || ''}` },
            body: fd,
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Upload failed.'); return; }
                setSuccess(`${d.fileName} uploaded successfully.`);
                setFile(null);
                setForm(p => ({ ...p, remarks: '' }));
                if (fileRef.current) fileRef.current.value = '';
                load();
                onRefresh && onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setUploading(false));
    };

    const openDoc = (id, fileName) => {
        fetch(`${variables.API_URL}document/${id}/download`, { headers: authHeaders() })
            .then(r => r.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a   = document.createElement('a');
                a.href = url; a.target = '_blank'; a.rel = 'noreferrer';
                const ext = fileName.split('.').pop().toLowerCase();
                if (!['pdf', 'jpg', 'jpeg'].includes(ext)) a.download = fileName;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            })
            .catch(() => setAlertMsg('Could not open document.'));
    };

    const deleteDoc = (id, fileName) => {
        setConfirm({
            title: 'Delete Document', message: `Delete "${fileName}"?`, confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                await fetch(`${variables.API_URL}document/${id}`, { method: 'DELETE', headers: authHeaders() });
                load(); onRefresh && onRefresh();
            },
        });
    };

    return (
        <div className="jd-tab-body">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {!editable && (
                <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>🔒</span>
                    <span style={{ fontSize: 12.5, color: '#475569' }}>This GRN is cancelled. Documents cannot be uploaded.</span>
                </div>
            )}

            {editable && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Upload Document</div>
                {error   && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '6px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
                {success && <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '6px 12px', fontSize: 12.5, marginBottom: 10 }}>✓ {success}</div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 200px' }}>
                        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Document Type *</label>
                        <select className="pf-input" value={form.documentType} onChange={e => setForm(p => ({ ...p, documentType: e.target.value }))}>
                            {types.map(t => <option key={t.documentTypeId} value={t.documentType}>{t.documentType}{t.isMandatory ? ' *' : ''}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 180 }}>
                        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>File <span style={{ color: '#94a3b8', fontWeight: 400 }}>(JPG, JPEG, PDF — max 20 MB)</span></label>
                        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.pdf" className="pf-input" style={{ padding: '5px 8px', cursor: 'pointer' }} onChange={handleFile} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 140 }}>
                        <label style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Remarks</label>
                        <input className="pf-input" placeholder="Optional note…" value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} />
                    </div>
                    <button className="pf-btn-pri" onClick={upload} disabled={uploading || !file} style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
                        {uploading ? '⏳ Uploading…' : '⬆ Upload'}
                    </button>
                </div>
                {file && <div style={{ marginTop: 8, fontSize: 11.5, color: '#475569' }}>Selected: <strong>{file.name}</strong> ({fmtSize(file.size)})</div>}
            </div>
            )}

            <div className="jd-tab-toolbar" style={{ marginBottom: 8 }}>
                <span className="jd-tab-count">{loading ? 'Loading…' : `${docs.length} document${docs.length !== 1 ? 's' : ''}`}</span>
            </div>

            {docs.length === 0 && !loading ? (
                <div className="jd-empty-card">No documents uploaded yet.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {docs.map(doc => (
                        <div key={doc.documentId} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                            <span style={{ fontSize: 22, lineHeight: 1 }}>{FILE_ICON[doc.fileType] || '📎'}</span>
                            <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{doc.documentType}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.fileName}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                    {fmtSize(doc.fileSize)} · {fmtDateTime(doc.uploadedDate)} · by {doc.uploadedBy}
                                    {doc.remarks && <> · <em>{doc.remarks}</em></>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button className="pf-btn-sec" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openDoc(doc.documentId, doc.fileName)}>View</button>
                                {canDelete && <button className="pf-btn-sec" style={{ padding: '5px 12px', fontSize: 12, color: '#991b1b' }} onClick={() => deleteDoc(doc.documentId, doc.fileName)}>Delete</button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default FreeIssueGrnDocumentsTab;
