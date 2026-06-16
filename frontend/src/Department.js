import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { variables, authHeaders } from "./Variable.js";
import AlertModal from "./common/AlertModal";

// ─── Modal ────────────────────────────────────────────────────────────────────
function DepartmentModal({ show, title, name, onChange, onSave, onClose }) {
  useEffect(() => {
    document.body.classList.toggle("modal-open", show);
    return () => document.body.classList.remove("modal-open");
  }, [show]);

  if (!show) return null;

  return ReactDOM.createPortal(
    <>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1040 }}
        onClick={onClose}
      />
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        style={{ zIndex: 1050 }}
        onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
        onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="modal-dialog"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>

            <div className="modal-body">
              <div className="input-group mb-3">
                <span className="input-group-text">Department Name</span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter department name"
                  value={name}
                  onChange={onChange}
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onSave}>
                {title.startsWith("New") ? "Save" : "Update"}
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function Department() {
  const [departments,     setDepartments]     = useState([]);
  const [showModal,       setShowModal]       = useState(false);
  const [modalTitle,      setModalTitle]      = useState("");
  const [departmentId,    setDepartmentId]    = useState(0);
  const [departmentName,  setDepartmentName]  = useState("");
  const [currentPage,     setCurrentPage]     = useState(1);
  const [itemsPerPage,    setItemsPerPage]    = useState(10);
  const [alertMsg, setAlertMsg] = useState(null);

  const refreshList = useCallback(() => {
    fetch(variables.API_URL + "Department", { headers: authHeaders() })
      .then(r => r.json())
      .then(setDepartments)
      .catch(e => console.error("Error loading departments:", e));
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);

  // ── Open helpers ─────────────────────────────────────────────────────────────
  const openAdd = () => {
    setDepartmentId(0);
    setDepartmentName("");
    setModalTitle("New Department");
    setShowModal(true);
  };

  const openEdit = (dep) => {
    setDepartmentId(dep.departmentId);
    setDepartmentName(dep.departmentName);
    setModalTitle("Edit Department");
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const saveClick = () => {
    if (!departmentName.trim()) {
      setAlertMsg("Department name is required.");
      return;
    }

    fetch(variables.API_URL + "Department/save", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ departmentId, departmentName: departmentName.trim() }),
    })
      .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t); });
        return r.json();
      })
      .then(() => { refreshList(); closeModal(); })
      .catch(e => { console.error("Save failed:", e); setAlertMsg("Save failed: " + e.message); });
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const deleteClick = (id) => {
    if (!window.confirm("Delete this department?")) return;
    fetch(variables.API_URL + "Department/" + id, {
      method: "DELETE",
      headers: authHeaders(),
    })
      .then(r => { if (!r.ok) throw new Error("Delete failed"); return r.text(); })
      .then(refreshList)
      .catch(e => console.error("Delete failed:", e));
  };

  // ── Paginate ──────────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(departments.length / itemsPerPage);
  const pageItems  = departments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 d-flex align-items-center gap-2">
        <label className="mb-0">Rows per page:</label>
        <select
          className="form-select w-auto"
          value={itemsPerPage}
          onChange={e => { setItemsPerPage(+e.target.value); setCurrentPage(1); }}
        >
          {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-primary ms-2" onClick={openAdd}>
          + Add Department
        </button>
      </div>

      {/* Table */}
      <table className="table table-bordered table-striped table-hover">
        <thead className="table-dark">
          <tr>
            <th>ID</th>
            <th>Department Name</th>
            <th>Edit</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map(dep => (
            <tr key={dep.departmentId}>
              <td>{dep.departmentId}</td>
              <td>{dep.departmentName}</td>
              <td>
                <button className="btn btn-primary btn-sm" onClick={() => openEdit(dep)}>
                  Edit
                </button>
              </td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => deleteClick(dep.departmentId)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {pageItems.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted py-3">No departments found.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav>
          <ul className="pagination">
            {[...Array(totalPages)].map((_, i) => (
              <li key={i} className={`page-item ${currentPage === i + 1 ? "active" : ""}`}>
                <button className="page-link" onClick={() => setCurrentPage(i + 1)}>{i + 1}</button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* React-controlled modal — no Bootstrap JS */}
      <DepartmentModal
        show={showModal}
        title={modalTitle}
        name={departmentName}
        onChange={e => setDepartmentName(e.target.value)}
        onSave={saveClick}
        onClose={closeModal}
      />
      {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    </div>
  );
}
