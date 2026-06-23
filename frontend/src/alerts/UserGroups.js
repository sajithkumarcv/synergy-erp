import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders, getCurrentUser } from '../Variable';
import AlertModal from '../common/AlertModal';
import ConfirmModal from '../common/ConfirmModal';

const S = {
  page:       { padding: '24px' },
  header:     { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  title:      { fontSize:20, fontWeight:700, color:'#1e293b', margin:0 },
  btnPrimary: { background:'#1e40af', color:'#fff', border:'none', borderRadius:7, padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnDanger:  { background:'#ef4444', color:'#fff', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' },
  btnGhost:   { background:'transparent', color:'#64748b', border:'1px solid #cbd5e1', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer' },
  layout:     { display:'grid', gridTemplateColumns:'320px 1fr', gap:20 },
  card:       { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden' },
  cardHead:   { padding:'14px 18px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  cardTitle:  { fontSize:14, fontWeight:700, color:'#1e293b', margin:0 },
  groupItem:  { padding:'12px 18px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' },
  badge:      (active) => ({ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background: active ? '#dcfce7' : '#f1f5f9', color: active ? '#15803d' : '#64748b' }),
  memberRow:  { padding:'10px 18px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' },
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:      { background:'#fff', borderRadius:12, padding:28, width:440, boxShadow:'0 20px 60px rgba(0,0,0,.2)' },
  modalTitle: { fontSize:17, fontWeight:700, color:'#1e293b', marginBottom:20 },
  field:      { marginBottom:16 },
  label:      { display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:5 },
  input:      { width:'100%', padding:'8px 11px', border:'1px solid #d1d5db', borderRadius:7, fontSize:14, boxSizing:'border-box' },
  errBox:     { background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:7, padding:'9px 14px', fontSize:13, marginBottom:14 },
  okBox:      { background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:7, padding:'9px 14px', fontSize:13, marginBottom:14 },
  row:        { display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 },
  empty:      { padding:32, textAlign:'center', color:'#94a3b8', fontSize:13 },
};

export default function UserGroups() {
  const [groups,      setGroups]      = useState([]);
  const [members,     setMembers]     = useState([]);
  const [users,       setUsers]       = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [addUserId,   setAddUserId]   = useState('');
  const [modal,       setModal]       = useState(false);
  const [form,        setForm]        = useState({ groupId:0, groupName:'', description:'', isActive:true });
  const [msg,         setMsg]         = useState({ type:'', text:'' });
  const [loading,     setLoading]     = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [confirm,  setConfirm]  = useState(null);

  const loadGroups = useCallback(async () => {
    const r = await fetch(`${variables.API_URL}UserGroup`, { headers: authHeaders() });
    if (r.ok) setGroups(await r.json());
  }, []);

  const loadMembers = useCallback(async (groupId) => {
    const r = await fetch(`${variables.API_URL}UserGroup/${groupId}/members`, { headers: authHeaders() });
    if (r.ok) setMembers(await r.json());
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await fetch(`${variables.API_URL}User/list`, { headers: authHeaders() });
    if (r.ok) setUsers(await r.json());
  }, []);

  useEffect(() => { loadGroups(); loadUsers(); }, [loadGroups, loadUsers]);

  const selectGroup = (g) => { setSelected(g); loadMembers(g.groupId); setMsg({ type:'', text:'' }); };

  const openModal = (g = null) => {
    setForm(g
      ? { groupId: g.groupId, groupName: g.groupName, description: g.description || '', isActive: g.isActive }
      : { groupId: 0, groupName: '', description: '', isActive: true });
    setMsg({ type:'', text:'' });
    setModal(true);
  };

  const saveGroup = async () => {
    if (!form.groupName.trim()) { setMsg({ type:'err', text:'Group name is required.' }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${variables.API_URL}UserGroup/save`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...form, actionBy: getCurrentUser() })
      });
      const d = await r.json();
      if (!r.ok) { setMsg({ type:'err', text: d.message }); return; }
      setMsg({ type:'ok', text: d.message });
      await loadGroups();
      setTimeout(() => setModal(false), 800);
    } finally { setLoading(false); }
  };

  const deleteGroup = (groupId) => {
    setConfirm({
      title: 'Delete Group',
      message: 'Delete this group?',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirm(null);
        const r = await fetch(`${variables.API_URL}UserGroup/${groupId}`, { method:'DELETE', headers: authHeaders() });
        const d = await r.json();
        if (r.ok) { await loadGroups(); if (selected?.groupId === groupId) { setSelected(null); setMembers([]); } }
        else setAlertMsg(d.message);
      },
    });
  };

  const addMember = async () => {
    if (!addUserId || !selected) return;
    const r = await fetch(`${variables.API_URL}UserGroup/member/add`, {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({ groupId: selected.groupId, userId: parseInt(addUserId), addedBy: getCurrentUser() })
    });
    if (r.ok) { setAddUserId(''); loadMembers(selected.groupId); loadGroups(); }
    else { const d = await r.json(); setAlertMsg(d.message); }
  };

  const removeMember = (detailId) => {
    setConfirm({
      title: 'Remove Member',
      message: 'Remove this member?',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setConfirm(null);
        await fetch(`${variables.API_URL}UserGroup/member/${detailId}`, { method:'DELETE', headers: authHeaders() });
        loadMembers(selected.groupId);
        loadGroups();
      },
    });
  };

  const memberUserIds = new Set(members.map(m => m.userId));
  const availableUsers = users.filter(u => !memberUserIds.has(u.userId));

  return (
    <div style={S.page}>
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
      <div style={S.header}>
        <h1 style={S.title}>User Groups</h1>
        <button style={S.btnPrimary} onClick={() => openModal()}>+ New Group</button>
      </div>

      <div style={S.layout}>
        {/* Group list */}
        <div style={S.card}>
          <div style={S.cardHead}><span style={S.cardTitle}>Groups ({groups.length})</span></div>
          {groups.length === 0
            ? <div style={S.empty}>No groups yet.</div>
            : groups.map(g => (
              <div key={g.groupId} style={{ ...S.groupItem, background: selected?.groupId === g.groupId ? '#eff6ff' : '#fff' }}
                onClick={() => selectGroup(g)}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:'#1e293b' }}>{g.groupName}</div>
                  <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={S.badge(g.isActive)}>{g.isActive ? 'Active' : 'Inactive'}</span>
                  <button style={S.btnGhost} onClick={e => { e.stopPropagation(); openModal(g); }}>Edit</button>
                  <button style={S.btnDanger} onClick={e => { e.stopPropagation(); deleteGroup(g.groupId); }}>Del</button>
                </div>
              </div>
            ))
          }
        </div>

        {/* Group detail / members */}
        <div style={S.card}>
          {!selected
            ? <div style={S.empty}>Select a group to manage members.</div>
            : <>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>{selected.groupName} — Members</span>
                <span style={S.badge(selected.isActive)}>{selected.isActive ? 'Active' : 'Inactive'}</span>
              </div>

              {/* Add member */}
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #e2e8f0', display:'flex', gap:10 }}>
                <select style={{ ...S.input, flex:1 }} value={addUserId} onChange={e => setAddUserId(e.target.value)}>
                  <option value="">— Select user to add —</option>
                  {availableUsers.map(u => (
                    <option key={u.userId} value={u.userId}>{u.fullName} ({u.userName})</option>
                  ))}
                </select>
                <button style={S.btnPrimary} onClick={addMember} disabled={!addUserId}>Add</button>
              </div>

              {members.length === 0
                ? <div style={S.empty}>No members in this group.</div>
                : members.map(m => (
                  <div key={m.detailId} style={S.memberRow}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14, color:'#1e293b' }}>{m.fullName}</div>
                      <div style={{ fontSize:12, color:'#64748b' }}>{m.email} · {m.userName}</div>
                    </div>
                    <button style={S.btnDanger} onClick={() => removeMember(m.detailId)}>Remove</button>
                  </div>
                ))
              }
            </>
          }
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div style={S.overlay}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalTitle}>{form.groupId === 0 ? 'New Group' : 'Edit Group'}</div>
            {msg.text && <div style={msg.type === 'err' ? S.errBox : S.okBox}>{msg.text}</div>}

            <div style={S.field}>
              <label style={S.label}>Group Name *</label>
              <input style={S.input} value={form.groupName}
                onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))} autoFocus />
            </div>
            <div style={S.field}>
              <label style={S.label}>Description</label>
              <input style={S.input} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="checkbox" id="grp-active" checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              <label htmlFor="grp-active" style={{ fontSize:13, color:'#374151' }}>Active</label>
            </div>

            <div style={S.row}>
              <button style={S.btnGhost} onClick={() => setModal(false)}>Cancel</button>
              <button style={S.btnPrimary} onClick={saveGroup} disabled={loading}>
                {loading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </div>
  );
}
