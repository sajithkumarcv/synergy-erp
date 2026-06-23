import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { variables, authHeaders } from "./Variable.js";
import AlertModal from "./common/AlertModal";
import ConfirmModal from "./common/ConfirmModal";

// ─── Modal rendered via portal so it sits above all other DOM ───────────────
function UserModal({ show, title, form, companies, branches, onChange, onSave, onClose }) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.classList.toggle("modal-open", show);
    return () => document.body.classList.remove("modal-open");
  }, [show]);

  if (!show) return null;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1040 }}
        onClick={onClose}
      />

      {/* Modal shell — stopPropagation prevents backdrop click from bleeding through */}
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        style={{ zIndex: 1050 }}
        onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
        onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}
      >
        <div className="modal-dialog" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>

            <div className="modal-body">
              {[
                ["User Code *",  "userCode",     "text"],
                ["User Name *",  "userName",     "text"],
                ["Password *",   "passwordHash", "password"],
                ["Full Name",    "fullName",     "text"],
                ["Email",        "email",        "email"],
                ["Mobile",       "mobile",       "text"],
              ].map(([label, name, type]) => (
                <div className="input-group mb-3" key={name}>
                  <span className="input-group-text" style={{ minWidth: 110 }}>{label}</span>
                  <input
                    type={type}
                    className="form-control"
                    name={name}
                    value={form[name]}
                    onChange={onChange}
                    autoComplete={type === "password" ? "new-password" : "off"}
                  />
                </div>
              ))}

              {/* Company */}
              <div className="input-group mb-3">
                <span className="input-group-text" style={{ minWidth: 110 }}>Company</span>
                <select className="form-select" name="companyId" value={form.companyId} onChange={onChange}>
                  <option value={0}>-- Select Company --</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Branch */}
              <div className="input-group mb-3">
                <span className="input-group-text" style={{ minWidth: 110 }}>Branch</span>
                <select className="form-select" name="branchId" value={form.branchId} onChange={onChange}>
                  <option value={0}>-- Select Branch --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="isActiveChk"
                  name="isActive"
                  checked={form.isActive}
                  onChange={onChange}
                />
                <label className="form-check-label" htmlFor="isActiveChk">Is Active</label>
              </div>

              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="isLockedChk"
                  name="isLocked"
                  checked={form.isLocked}
                  onChange={onChange}
                />
                <label className="form-check-label" htmlFor="isLockedChk">Is Locked</label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onSave}>
                {form.userId === 0 ? "Save" : "Update"}
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Empty form template ─────────────────────────────────────────────────────
const emptyForm = {
  userId: 0, userCode: "", userName: "", passwordHash: "",
  fullName: "", email: "", mobile: "",
  companyId: 0, branchId: 0,
  isActive: true, isLocked: false,
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function User() {
  const [users,        setUsers]        = useState([]);
  const [companies,    setCompanies]    = useState([]);
  const [branches,     setBranches]     = useState([]);
  const [showModal,    setShowModal]    = useState(false);
  const [modalTitle,   setModalTitle]   = useState("");
  const [form,         setForm]         = useState(emptyForm);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [currentPage,  setCurrentPage]  = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [alertMsg, setAlertMsg] = useState(null);
  const [confirm,  setConfirm]  = useState(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  const refreshList = useCallback(() => {
    fetch(variables.API_URL + "User", { headers: authHeaders() })
      .then(r => r.json())
      .then(setUsers)
      .catch(e => console.error("Error loading users:", e));
  }, []);

  const loadBranches = useCallback((companyId, onDone) => {
    if (!companyId || companyId === "0" || companyId === 0) {
      setBranches([]);
      return;
    }
    fetch(variables.API_URL + `Lookup/branch/${companyId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setBranches(data); onDone?.(data); })
      .catch(e => console.error("Branches fetch error:", e));
  }, []);

  useEffect(() => {
    refreshList();
    fetch(variables.API_URL + "Lookup/company", { headers: authHeaders() })
      .then(r => r.json())
      .then(setCompanies)
      .catch(e => console.error("Companies fetch error:", e));
  }, [refreshList]);

  // ── Modal open helpers ───────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm);
    setBranches([]);
    setModalTitle("New User");
    setShowModal(true);
  };

  const openEdit = (user) => {
    setForm({
      userId:       user.userId,
      userCode:     user.userCode,
      userName:     user.userName,
      passwordHash: user.passwordHash,
      fullName:     user.fullName  || "",
      email:        user.email     || "",
      mobile:       user.mobile    || "",
      companyId:    user.companyId || 0,
      branchId:     0,              // reset; set after branches load
      isActive:     user.isActive  ?? true,
      isLocked:     user.isLocked  ?? false,
    });
    setBranches([]);
    setModalTitle("Edit User");
    setShowModal(true);

    if (user.companyId) {
      loadBranches(user.companyId, () => {
        // Use functional update so it does NOT re-trigger parent renders
        setForm(f => ({ ...f, branchId: user.branchId || 0 }));
      });
    }
  };

  const closeModal = () => setShowModal(false);

  // ── Field change handler ─────────────────────────────────────────────────────
  const handleChange = e => {
    const { name, value, type, checked } = e.target;

    if (type === "checkbox") {
      setForm(f => ({ ...f, [name]: checked }));
      return;
    }

    if (name === "companyId") {
      setForm(f => ({ ...f, companyId: value, branchId: 0 }));
      loadBranches(value, null);
      return;
    }

    setForm(f => ({ ...f, [name]: value }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const saveUser = () => {
    if (!form.userCode.trim() || !form.userName.trim()) {
      setAlertMsg("User Code and User Name are required.");
      return;
    }
    if (form.userId === 0 && !form.passwordHash.trim()) {
      setAlertMsg("Password is required for new users.");
      return;
    }

    fetch(variables.API_URL + "User/save", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        ...form,
        companyId:  parseInt(form.companyId)  || 0,
        branchId:   parseInt(form.branchId)   || 0,
        createdBy:  "sa",
        modifiedBy: "sa",
      }),
    })
      .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t); });
        return r.json();
      })
      .then(() => { refreshList(); closeModal(); })
      .catch(e => { console.error("Error saving user:", e); setAlertMsg("Save failed: " + e.message); });
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteUser = (id) => {
    setConfirm({
      title: 'Delete User',
      message: 'Delete this user?',
      confirmLabel: 'Delete',
      onConfirm: () => {
        setConfirm(null);
        fetch(variables.API_URL + "User/" + id, { method: "DELETE", headers: authHeaders() })
          .then(r => { if (!r.ok) throw new Error("Delete failed"); return r.text(); })
          .then(refreshList)
          .catch(e => console.error("Error deleting user:", e));
      },
    });
  };

  // ── Filter + paginate ────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    if (showOnlyActive && !u.isActive) return false;
    const s = searchFilter.toLowerCase();
    if (!s) return true;
    return (
      (u.userName || "").toLowerCase().includes(s) ||
      (u.userCode || "").toLowerCase().includes(s) ||
      (u.fullName || "").toLowerCase().includes(s) ||
      (u.email    || "").toLowerCase().includes(s)
    );
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const pageItems  = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
      {/* Toolbar */}
      <div className="mb-3 d-flex align-items-center gap-2 flex-wrap">
        <label className="mb-0">Rows per page:</label>
        <select
          className="form-select w-auto"
          value={itemsPerPage}
          onChange={e => { setItemsPerPage(+e.target.value); setCurrentPage(1); }}
        >
          {[50, 100, 150, 200].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-primary ms-2" onClick={openAdd}>
          + Add User
        </button>
      </div>

      {/* Filter bar */}
      <div className="d-flex justify-content-between align-items-center mb-3 p-2 border rounded bg-light">
        <div className="input-group w-50">
          <span className="input-group-text">Search</span>
          <input
            type="text"
            className="form-control"
            placeholder="Search by name, code or email…"
            value={searchFilter}
            onChange={e => { setSearchFilter(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <div className="form-check form-switch m-0">
          <input
            className="form-check-input"
            type="checkbox"
            id="activeSwitch"
            checked={showOnlyActive}
            onChange={e => { setShowOnlyActive(e.target.checked); setCurrentPage(1); }}
          />
          <label className="form-check-label" htmlFor="activeSwitch">Only Active</label>
        </div>
      </div>

      {/* Table */}
      <table className="table table-bordered table-striped table-hover">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>User Code</th>
            <th>User Name</th>
            <th>Full Name</th>
            <th>Email</th>
            <th>Mobile</th>
            <th>Company</th>
            <th>Branch</th>
            <th>Active</th>
            <th>Locked</th>
            <th>Edit</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map(u => (
            <tr key={u.userId} className={u.isActive ? "" : "table-warning"}>
              <td>{u.userId}</td>
              <td>{u.userCode}</td>
              <td>{u.userName}</td>
              <td>{u.fullName}</td>
              <td>{u.email}</td>
              <td>{u.mobile}</td>
              <td>{u.companyName}</td>
              <td>{u.branchName}</td>
              <td>
                <input type="checkbox" className="form-check-input" checked={!!u.isActive} readOnly />
              </td>
              <td className={u.isLocked ? "text-danger fw-bold" : ""}>
                <input type="checkbox" className="form-check-input" checked={!!u.isLocked} readOnly />
                {u.isLocked ? " Locked" : ""}
              </td>
              <td>
                <button className="btn btn-primary btn-sm" onClick={() => openEdit(u)}>Edit</button>
              </td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.userId)}>Delete</button>
              </td>
            </tr>
          ))}
          {pageItems.length === 0 && (
            <tr><td colSpan={12} className="text-center text-muted py-3">No users found.</td></tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav>
          <ul className="pagination flex-wrap">
            {[...Array(totalPages)].map((_, i) => (
              <li key={i} className={`page-item ${currentPage === i + 1 ? "active" : ""}`}>
                <button className="page-link" onClick={() => setCurrentPage(i + 1)}>{i + 1}</button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Modal — React-controlled, no Bootstrap JS involvement */}
      <UserModal
        show={showModal}
        title={modalTitle}
        form={form}
        companies={companies}
        branches={branches}
        onChange={handleChange}
        onSave={saveUser}
        onClose={closeModal}
      />
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </div>
  );
}
