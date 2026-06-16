import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import ValidationModal from '../common/ValidationModal';
import '../settings/Settings.css';
import '../jobs/JobDetail.css';
import './AdminPage.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const API = variables.API_URL;

const badge = (isActive) => isActive
    ? <span className="adm-badge-active">Active</span>
    : <span className="adm-badge-inactive">Inactive</span>;

// ── Reusable slide-over panel ─────────────────────────────────────────────────
const SlidePanel = ({ title, subtitle, onClose, children, footer }) => (
    <div className="ds-overlay">
        <div className="ds-panel">
            <div className="ds-panel-header">
                <div>
                    <div className="ds-panel-title">{title}</div>
                    {subtitle && <div className="ds-panel-sub">{subtitle}</div>}
                </div>
                <button className="ds-close" onClick={onClose}>✕</button>
            </div>
            <div className="ds-panel-body">{children}</div>
            <div className="ds-panel-footer">{footer}</div>
        </div>
    </div>
);

// ── Field components ──────────────────────────────────────────────────────────
const Field = ({ label, required, error, children }) => (
    <div className="ds-field" style={{ marginBottom: 8 }}>
        <label>{label}{required && <span className="ds-req"> *</span>}</label>
        {children}
        {error && <span className="ds-field-err">{error}</span>}
    </div>
);

const Input = ({ value, onChange, name, placeholder, type = 'text', className = '' }) => (
    <input className={`ds-input ${className}`} type={type}
        name={name} value={value ?? ''} onChange={onChange} placeholder={placeholder} />
);

const Checkbox = ({ label, checked, onChange, name }) => (
    <label className="ds-toggle">
        <input type="checkbox" name={name} checked={!!checked} onChange={onChange} />
        {label}
    </label>
);

// ── Table configs ─────────────────────────────────────────────────────────────

const BOOL_CHIP = (val) => val
    ? <span className="adm-chip-yes">Yes</span>
    : <span className="adm-chip-no">No</span>;

const SECTIONS = [
    // ── Financial ────────────────────────────────────────────────────────────
    {
        group: 'Financial', key: 'currency',
        title: 'Currency',
        apiBase: 'adminjob/currency/save',
        listBase: 'adminjob/currency',
        deleteBase: 'adminjob/currency',
        idField: 'currencyId',
        columns: [
            { key: 'currencyName', label: 'Name' },
            { key: 'shortName',    label: 'Code' },
            { key: 'symbol',       label: 'Symbol' },
            { key: 'exchangeRate', label: 'Rate' },
            { key: 'isBaseCurrency', label: 'Base', render: r => BOOL_CHIP(r.isBaseCurrency) },
            { key: 'isActive',     label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder',    label: 'Sort' },
        ],
        fields: [
            { name: 'currencyName', label: 'Currency Name', required: true },
            { name: 'shortName',    label: 'Short Name / Code', required: true },
            { name: 'symbol',       label: 'Symbol', required: true },
            { name: 'exchangeRate', label: 'Exchange Rate', type: 'number' },
            { name: 'isBaseCurrency', label: 'Is Base Currency', type: 'checkbox' },
            { name: 'isActive',     label: 'Active', type: 'checkbox' },
            { name: 'sortOrder',    label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({
            currencyId:     parseInt(f.currencyId) || 0,
            currencyName:   f.currencyName,
            shortName:      f.shortName,
            symbol:         f.symbol,
            exchangeRate:   parseFloat(f.exchangeRate) || 1,
            isBaseCurrency: !!f.isBaseCurrency,
            isActive:       f.isActive !== false,
            sortOrder:      parseInt(f.sortOrder) || 0,
        }),
    },
    {
        group: 'Financial', key: 'paymentTerms',
        title: 'Payment Terms',
        apiBase: 'adminlookup/save/paymentTerms',
        listBase: 'adminlookup/list/paymentTerms',
        deleteBase: 'adminlookup/paymentTerms',
        idField: 'id',
        columns: [
            { key: 'name',   label: 'Term Name' },
            { key: 'code',   label: 'Code' },
            { key: 'extra1', label: 'Days' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'name',    label: 'Term Name', required: true },
            { name: 'code',    label: 'Code' },
            { name: 'extra1',  label: 'Days', type: 'number' },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id || '0', name: f.name, code: f.code, extra1: f.extra1, isActive: f.isActive !== false }),
    },
    {
        group: 'Financial', key: 'deliveryTerms',
        title: 'Delivery Terms',
        apiBase: 'adminlookup/save/deliveryTerms',
        listBase: 'adminlookup/list/deliveryTerms',
        deleteBase: 'adminlookup/deliveryTerms',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Term Name' },
            { key: 'code', label: 'Code' },
            { key: 'description', label: 'Description' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Term Name', required: true },
            { name: 'code',        label: 'Code' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active', type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id || '0', name: f.name, code: f.code, description: f.description, isActive: f.isActive !== false, sortOrder: parseInt(f.sortOrder)||0 }),
    },

    // ── Items ────────────────────────────────────────────────────────────────
    {
        group: 'Items', key: 'itemType',
        title: 'Item Type',
        apiBase: 'adminlookup/save/itemType',
        listBase: 'adminlookup/list/itemType',
        deleteBase: 'adminlookup/itemType',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Type Name' },
            { key: 'code', label: 'Code' },
            { key: 'extra1', label: 'Stockable', render: r => BOOL_CHIP(r.extra1==='True'||r.extra1===true) },
            { key: 'extra2', label: 'Service',   render: r => BOOL_CHIP(r.extra2==='True'||r.extra2===true) },
            { key: 'isActive', label: 'Active',  render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Type Name', required: true },
            { name: 'code',        label: 'Type Code', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'extra1',      label: 'Is Stockable', type: 'checkbox' },
            { name: 'extra2',      label: 'Is Service',   type: 'checkbox' },
            { name: 'extra3',      label: 'Is Asset',     type: 'checkbox' },
            { name: 'isActive',    label: 'Active',       type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order',   type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, code: f.code, description: f.description,
            extra1: f.extra1?'true':'false', extra2: f.extra2?'true':'false', extra3: f.extra3?'true':'false',
            isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },

    // ── Procurement ──────────────────────────────────────────────────────────
    {
        group: 'Procurement', key: 'poTerms',
        title: 'PO Terms',
        apiBase: 'adminlookup/save/poTerms',
        listBase: 'adminlookup/list/poTerms',
        deleteBase: 'adminlookup/poTerms',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Term Text' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',      label: 'Term Text', required: true, type: 'textarea' },
            { name: 'isActive',  label: 'Active', type: 'checkbox' },
            { name: 'sortOrder', label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Procurement', key: 'documentTypes',
        title: 'Document Types',
        apiBase: 'adminlookup/save/documentTypes',
        listBase: 'adminlookup/list/documentTypes',
        deleteBase: 'adminlookup/documentTypes',
        idField: 'id',
        columns: [
            { key: 'name',        label: 'Document Type' },
            { key: 'description', label: 'Module' },
            { key: 'isActive',    label: 'Mandatory', render: r => BOOL_CHIP(r.isActive) },
        ],
        fields: [
            { name: 'name',        label: 'Document Type', required: true },
            { name: 'description', label: 'Module Name' },
            { name: 'isActive',    label: 'Is Mandatory', type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, description: f.description, isActive: f.isActive!==false }),
    },
    {
        group: 'Procurement', key: 'bomSection',
        title: 'BOM Section',
        apiBase: 'adminlookup/save/bomSection',
        listBase: 'adminlookup/list/bomSection',
        deleteBase: 'adminlookup/bomSection',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Section Name' },
            { key: 'code', label: 'Code' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Section Name', required: true },
            { name: 'code',        label: 'Code' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active', type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, code: f.code, description: f.description, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Procurement', key: 'issueType',
        title: 'Issue Type',
        apiBase: 'adminlookup/save/issueType',
        listBase: 'adminlookup/list/issueType',
        deleteBase: 'adminlookup/issueType',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Issue Type Name' },
            { key: 'code', label: 'Code' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Issue Type Name', required: true },
            { name: 'code',        label: 'Code' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active', type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, code: f.code, description: f.description, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },

    // ── Customers ────────────────────────────────────────────────────────────
    {
        group: 'Customers', key: 'customerCategory',
        title: 'Customer Category',
        apiBase: 'adminlookup/save/customerCategory',
        listBase: 'adminlookup/list/customerCategory',
        deleteBase: 'adminlookup/customerCategory',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Category Name' },
            { key: 'code', label: 'Code' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Category Name', required: true },
            { name: 'code',        label: 'Code' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active', type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, code: f.code, description: f.description, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },

    // ── Suppliers ────────────────────────────────────────────────────────────
    {
        group: 'Suppliers', key: 'supplierCategory',
        title: 'Supplier Category',
        apiBase: 'adminlookup/save/supplierCategory',
        listBase: 'adminlookup/list/supplierCategory',
        deleteBase: 'adminlookup/supplierCategory',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Category Name' },
            { key: 'description', label: 'Description' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'name',        label: 'Category Name', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active', type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, description: f.description, isActive: f.isActive!==false }),
    },

    // ── Jobs ─────────────────────────────────────────────────────────────────
    {
        group: 'Jobs', key: 'jobType',
        title: 'Job Type',
        apiBase: 'adminjob/jobtype/save',
        listBase: 'adminjob/jobtype',
        deleteBase: 'adminjob/jobtype',
        idField: 'jobTypeId',
        columns: [
            { key: 'jobTypeId',   label: 'ID' },
            { key: 'jobTypeName', label: 'Name' },
            { key: 'preFix',      label: 'Prefix' },
            { key: 'isActive',    label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder',   label: 'Sort' },
        ],
        fields: [
            { name: 'jobTypeId',         label: 'Type ID (Code)',   required: true },
            { name: 'jobTypeName',        label: 'Type Name',        required: true },
            { name: 'preFix',             label: 'Prefix' },
            { name: 'suffix',             label: 'Suffix' },
            { name: 'startingSeries',     label: 'Starting Series' },
            { name: 'isCostingRequired',  label: 'Costing Required',  type: 'checkbox' },
            { name: 'requiresParentJob',  label: 'Requires Parent Job', type: 'checkbox' },
            { name: 'isStockJob',         label: 'Is Stock Job',       type: 'checkbox' },
            { name: 'isActive',           label: 'Active',             type: 'checkbox' },
            { name: 'sortOrder',          label: 'Sort Order',         type: 'number' },
        ],
        saveMapper: (f, _user, isNew) => ({
            jobTypeId:         f.jobTypeId,
            jobTypeName:       f.jobTypeName,
            preFix:            f.preFix||null,
            suffix:            f.suffix||null,
            startingSeries:    f.startingSeries||null,
            isCostingRequired: !!f.isCostingRequired,
            requiresParentJob: !!f.requiresParentJob,
            isStockJob:        !!f.isStockJob,
            isActive:          f.isActive!==false,
            sortOrder:         parseInt(f.sortOrder)||0,
            isNew:             !f._originalId,
        }),
    },
    {
        group: 'Jobs', key: 'jobStatus',
        title: 'Job Status',
        apiBase: 'adminlookup/save/jobStatus',
        listBase: 'adminlookup/list/jobStatus',
        deleteBase: 'adminlookup/jobStatus',
        idField: 'id',
        columns: [
            { key: 'name',   label: 'Status Name' },
            { key: 'extra1', label: 'Closed', render: r => BOOL_CHIP(r.extra1===1||r.extra1===true) },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',    label: 'Status Name', required: true },
            { name: 'extra1',  label: 'Is Closed', type: 'checkbox' },
            { name: 'isActive', label: 'Active',    type: 'checkbox' },
            { name: 'sortOrder', label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, extra1: f.extra1?'true':'false', isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Jobs', key: 'jobStage',
        title: 'Job Stage',
        apiBase: 'adminlookup/save/jobStage',
        listBase: 'adminlookup/list/jobStage',
        deleteBase: 'adminlookup/jobStage',
        idField: 'id',
        columns: [
            { key: 'id',   label: 'Stage ID' },
            { key: 'name', label: 'Stage Name' },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'code',      label: 'Stage ID (Code)', required: true, placeholder: 'e.g. DESIGN' },
            { name: 'name',      label: 'Stage Name',      required: true },
            { name: 'sortOrder', label: 'Sort Order',      type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'', code: f.code, name: f.name, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Jobs', key: 'jobRole',
        title: 'Job Role',
        apiBase: 'adminlookup/save/jobRole',
        listBase: 'adminlookup/list/jobRole',
        deleteBase: 'adminlookup/jobRole',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Role Name' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'name',     label: 'Role Name', required: true },
            { name: 'isActive', label: 'Active',    type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, isActive: f.isActive!==false }),
    },
    {
        group: 'Jobs', key: 'jobCategory',
        title: 'Job Category',
        apiBase: 'adminlookup/save/jobCategory',
        listBase: 'adminlookup/list/jobCategory',
        deleteBase: 'adminlookup/jobCategory',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Category Name' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',      label: 'Category Name', required: true },
            { name: 'isActive',  label: 'Active',       type: 'checkbox' },
            { name: 'sortOrder', label: 'Sort Order',   type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Jobs', key: 'jobBay',
        title: 'Job Bay',
        apiBase: 'adminlookup/save/jobBay',
        listBase: 'adminlookup/list/jobBay',
        deleteBase: 'adminlookup/jobBay',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Bay Name' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',      label: 'Bay Name',   required: true },
            { name: 'isActive',  label: 'Active',     type: 'checkbox' },
            { name: 'sortOrder', label: 'Sort Order', type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Jobs', key: 'jobQuality',
        title: 'Job Quality',
        apiBase: 'adminlookup/save/jobQuality',
        listBase: 'adminlookup/list/jobQuality',
        deleteBase: 'adminlookup/jobQuality',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Quality Level Name' },
            { key: 'description', label: 'Description' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Quality Level Name', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active',      type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order',  type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, description: f.description, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Jobs', key: 'jobExpenseCategory',
        title: 'Job Expense Category',
        apiBase: 'adminlookup/save/jobExpenseCategory',
        listBase: 'adminlookup/list/jobExpenseCategory',
        deleteBase: 'adminlookup/jobExpenseCategory',
        idField: 'id',
        columns: [
            { key: 'name',    label: 'Category Name' },
            { key: 'code',    label: 'Code' },
            { key: 'extra1',  label: 'Budget',  render: r => BOOL_CHIP(r.extra1==='True'||r.extra1===true) },
            { key: 'extra2',  label: 'Expense', render: r => BOOL_CHIP(r.extra2==='True'||r.extra2===true) },
            { key: 'extra3',  label: 'MH Type', render: r => r.extra3
                ? <span style={{ background:'#dbeafe', color:'#1e40af', borderRadius:10, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{r.extra3}</span>
                : <span style={{ color:'#94a3b8' }}>—</span> },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'name',        label: 'Category Name',    required: true },
            { name: 'code',        label: 'Code' },
            { name: 'description', label: 'Description',      type: 'textarea' },
            { name: 'extra1',      label: 'Used For Budget',  type: 'checkbox' },
            { name: 'extra2',      label: 'Used For Expense', type: 'checkbox' },
            { name: 'extra3',      label: 'Manhour Type Code',
              type: 'select', optionsListBase: 'Lookup/vlist/Manhour/Type',
              valueKey: 'value', labelKey: 'label' },
            { name: 'isActive',    label: 'Active',           type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order',       type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, code: f.code, description: f.description,
            extra1: f.extra1?'true':'false', extra2: f.extra2?'true':'false',
            extra3: f.extra3 || '',
            isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },

    // ── Team ─────────────────────────────────────────────────────────────────
    {
        group: 'Team', key: 'team',
        title: 'Team',
        apiBase: 'adminlookup/save/team',
        listBase: 'adminlookup/list/team',
        deleteBase: 'adminlookup/team',
        idField: 'id',
        columns: [
            { key: 'name', label: 'Team Name' },
            { key: 'description', label: 'Description' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'name',        label: 'Team Name',   required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active',      type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', name: f.name, description: f.description, isActive: f.isActive!==false }),
    },
    {
        group: 'Team', key: 'engineer',
        title: 'Engineer',
        apiBase: 'adminjob/engineer/save',
        listBase: 'adminjob/engineer',
        deleteBase: 'adminjob/engineer',
        idField: 'engineerId',
        columns: [
            { key: 'engineerName', label: 'Name' },
            { key: 'linkedUser',   label: 'Linked User' },
            { key: 'teamName',     label: 'Team' },
            { key: 'email',        label: 'Email' },
            { key: 'hourlyRate',   label: 'Rate' },
            { key: 'isActive',     label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'engineerName', label: 'Engineer Name', required: true },
            { name: 'userId',       label: 'Linked User (optional)',
              type: 'select', optionsListBase: 'user/list',
              valueKey: 'userId', labelKey: 'fullName' },
            { name: 'teamId',       label: 'Team',
              type: 'select', optionsListBase: 'adminlookup/list/team' },
            { name: 'email',        label: 'Email',       type: 'email' },
            { name: 'hourlyRate',   label: 'Hourly Rate', type: 'number' },
            { name: 'isActive',     label: 'Active',      type: 'checkbox' },
        ],
        saveMapper: (f) => ({
            engineerId:   parseInt(f.engineerId)||0,
            engineerName: f.engineerName,
            teamId:       f.teamId  ? parseInt(f.teamId)  : null,
            userId:       f.userId  ? parseInt(f.userId)  : null,
            email:        f.email||null,
            hourlyRate:   parseFloat(f.hourlyRate)||0,
            isActive:     f.isActive!==false,
        }),
    },

    // ── Item UOM ──────────────────────────────────────────────────────────────
    {
        group: 'Items', key: 'uom',
        title: 'Unit of Measure',
        apiBase: 'adminlookup/save/uom',
        listBase: 'adminlookup/list/uom',
        deleteBase: 'adminlookup/uom',
        idField: 'id',
        columns: [
            { key: 'code',        label: 'Code' },
            { key: 'name',        label: 'UOM Name' },
            { key: 'extra1',      label: 'Type' },
            { key: 'description', label: 'Description' },
            { key: 'isActive',    label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'code',        label: 'UOM Code',   required: true, placeholder: 'e.g. KG' },
            { name: 'name',        label: 'UOM Name',   required: true, placeholder: 'e.g. Kilogram' },
            { name: 'extra1',      label: 'Type',       required: true, placeholder: 'Count / Weight / Length / Volume / Area / Time' },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'isActive',    label: 'Active',     type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', code: f.code, name: f.name, extra1: f.extra1, description: f.description, isActive: f.isActive!==false }),
    },

    // ── Item Categories ───────────────────────────────────────────────────────
    {
        group: 'Items', key: 'category',
        title: 'Item Category',
        apiBase: 'adminlookup/save/category',
        listBase: 'adminlookup/list/category',
        deleteBase: 'adminlookup/category',
        idField: 'id',
        columns: [
            { key: 'code',     label: 'Code' },
            { key: 'name',     label: 'Category Name' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder', label: 'Sort' },
        ],
        fields: [
            { name: 'code',        label: 'Category Code', required: true, placeholder: 'e.g. CAT-001' },
            { name: 'name',        label: 'Category Name', required: true },
            { name: 'description', label: 'Description',   type: 'textarea' },
            { name: 'isActive',    label: 'Active',        type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order',    type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', code: f.code, name: f.name, description: f.description, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },
    {
        group: 'Items', key: 'subcategory',
        title: 'Sub-Category',
        apiBase: 'adminlookup/save/subcategory',
        listBase: 'adminlookup/list/subcategory',
        deleteBase: 'adminlookup/subcategory',
        idField: 'id',
        columns: [
            { key: 'code',        label: 'Code' },
            { key: 'name',        label: 'Sub-Category' },
            { key: 'description', label: 'Parent Category' },
            { key: 'isActive',    label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'extra1',      label: 'Parent Category', type: 'select', required: true,
              optionsListBase: 'adminlookup/list/category' },
            { name: 'code',        label: 'Sub-Category Code', required: true, placeholder: 'e.g. SUB-001' },
            { name: 'name',        label: 'Sub-Category Name', required: true },
            { name: 'description', label: 'Description',       type: 'textarea' },
            { name: 'isActive',    label: 'Active',            type: 'checkbox' },
            { name: 'sortOrder',   label: 'Sort Order',         type: 'number' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', code: f.code, name: f.name, description: f.description, extra1: f.extra1, isActive: f.isActive!==false, sortOrder: parseInt(f.sortOrder)||0 }),
    },

    // ── System ───────────────────────────────────────────────────────────────
    {
        group: 'System', key: 'fieldConfig',
        title: 'Field Config',
        apiBase: 'adminlookup/save/fieldConfig',
        listBase: 'adminlookup/list/fieldConfig',
        deleteBase: 'adminlookup/fieldConfig',
        idField: 'id',
        columns: [
            { key: 'code',   label: 'Form Key' },
            { key: 'name',   label: 'Field Key' },
            { key: 'extra1', label: 'Required',  render: r => BOOL_CHIP(r.extra1==='True'||r.extra1===true||r.extra1==='1'||r.extra1===1) },
            { key: 'isActive', label: 'Active',  render: r => badge(r.isActive) },
        ],
        fields: [
            { name: 'code',   label: 'Form Key',   required: true, placeholder: 'e.g. PO, PR, INVOICE' },
            { name: 'name',   label: 'Field Key',  required: true, placeholder: 'e.g. supplierId' },
            { name: 'extra1', label: 'Is Required', type: 'checkbox' },
            { name: 'isActive', label: 'Active',   type: 'checkbox' },
        ],
        saveMapper: (f) => ({ id: f.id||'0', code: f.code, name: f.name, extra1: f.extra1?'true':'false', isActive: f.isActive!==false }),
    },
    {
        group: 'System', key: 'approvalModule',
        title: 'Approval Modules',
        apiBase: null,                              // view-only
        listBase: 'adminlookup/list/approvalModule',
        deleteBase: null,
        idField: 'id',
        readOnly: true,
        columns: [
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Module Name' },
            { key: 'description', label: 'Description' },
            { key: 'isActive', label: 'Active', render: r => badge(r.isActive) },
        ],
        fields: [],
        saveMapper: () => ({}),
    },
    {
        group: 'System', key: 'vlist',
        title: 'VList',
        apiBase: 'adminjob/vlist/save',
        listBase: 'adminjob/vlist',
        deleteBase: 'adminjob/vlist',
        idField: 'vListID',
        columns: [
            { key: 'typeName',        label: 'Type' },
            { key: 'listName',        label: 'List' },
            { key: 'itemValue',       label: 'Value' },
            { key: 'itemDescription', label: 'Description' },
            { key: 'isActive',        label: 'Active', render: r => badge(r.isActive) },
            { key: 'sortOrder',       label: 'Sort' },
        ],
        fields: [
            { name: 'typeName',        label: 'Type Name',    required: true },
            { name: 'listName',        label: 'List Name',    required: true },
            { name: 'itemValue',       label: 'Item Value',   required: true },
            { name: 'itemDescription', label: 'Description',  required: true },
            { name: 'isActive',        label: 'Active',       type: 'checkbox' },
            { name: 'sortOrder',       label: 'Sort Order',   type: 'number' },
        ],
        saveMapper: (f) => ({
            vListID:         parseInt(f.vListID)||0,
            typeName:        f.typeName,
            listName:        f.listName,
            itemValue:       f.itemValue,
            itemDescription: f.itemDescription,
            isActive:        f.isActive!==false,
            sortOrder:       parseInt(f.sortOrder)||0,
        }),
    },
];

// Group sections by their 'group' key
const GROUPS = ['Financial','Items','Procurement','Customers','Suppliers','Jobs','Team','System'];

// ── SmartLookupTable — wires listBase / saveBase / deleteBase correctly ───────
const SmartLookupTable = ({ section }) => {
    const currentUser = useCurrentUser();
    const [rows,        setRows]        = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [editing,     setEditing]     = useState(null);
    const [form,        setForm]        = useState({});
    const [saving,      setSaving]      = useState(false);
    const [errors,      setErrors]      = useState({});
    const [valMsgs,     setValMsgs]     = useState(null);
    const [sortCol,     setSortCol]     = useState(null);
    const [sortDir,     setSortDir]     = useState('asc');
    const [colFilters,  setColFilters]  = useState({});
    const [page,        setPage]        = useState(1);
    const [pageSize,    setPageSize]    = useState(20);
    // Dynamic options for select-type fields (keyed by field name)
    const [fieldOptions, setFieldOptions] = useState({});

    const doSort = (key) => {
        setSortCol(prev => {
            if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
            setSortDir('asc'); return key;
        });
        setPage(1);
    };

    const setColFilter = (key, val) => {
        setColFilters(p => ({ ...p, [key]: val }));
        setPage(1);
    };

    const clearColFilters = () => { setColFilters({}); setPage(1); };

    const activeFilterCount = Object.values(colFilters).filter(Boolean).length;

    const sortedRows = React.useMemo(() => {
        // 1. Filter
        let result = rows.filter(row =>
            Object.entries(colFilters).every(([key, val]) => {
                if (!val) return true;
                const cell = row[key];
                if (cell == null) return false;
                return String(cell).toLowerCase().includes(val.toLowerCase());
            })
        );
        // 2. Sort
        if (sortCol) {
            result = [...result].sort((a, b) => {
                let av = a[sortCol], bv = b[sortCol];
                if (av == null) av = '';
                if (bv == null) bv = '';
                if (typeof av === 'boolean') av = av ? 1 : 0;
                if (typeof bv === 'boolean') bv = bv ? 1 : 0;
                const cmp = typeof av === 'number'
                    ? av - bv
                    : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }
        return result;
    }, [rows, sortCol, sortDir, colFilters]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}${section.listBase}`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            setRows(await res.json());
        } catch { setRows([]); }
        finally { setLoading(false); }
    }, [section.listBase]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSortCol(null); setSortDir('asc'); setColFilters({}); setPage(1); }, [section.key]);

    // Load dynamic options for any select field that has optionsListBase
    useEffect(() => {
        const selectFields = section.fields.filter(f => f.type === 'select' && f.optionsListBase);
        if (!selectFields.length) return;
        Promise.all(
            selectFields.map(f =>
                fetch(`${API}${f.optionsListBase}`, { headers: authHeaders() })
                    .then(r => r.ok ? r.json() : [])
                    .then(data => ({ name: f.name, options: Array.isArray(data) ? data : [] }))
                    .catch(() => ({ name: f.name, options: [] }))
            )
        ).then(results => {
            const map = {};
            results.forEach(r => { map[r.name] = r.options; });
            setFieldOptions(map);
        });
    }, [section.key]); // eslint-disable-line

    const openNew = () => {
        const init = {};
        section.fields.forEach(f => { init[f.name] = f.type==='checkbox' ? false : ''; });
        init.isActive = true; init.sortOrder = 0;
        setForm(init); setErrors({}); setEditing({});
    };
    const openEdit = (row) => {
        const init = {};
        section.fields.forEach(f => { init[f.name] = row[f.name] ?? (f.type==='checkbox' ? false : ''); });
        init[section.idField] = row[section.idField];
        init._originalId = row[section.idField]; // flag: this is an edit
        setForm(init); setErrors({}); setEditing(row);
    };

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type==='checkbox' ? checked : value }));
    };

    const validate = () => {
        const errs = {}, msgs = [];
        section.fields.filter(f=>f.required).forEach(f => {
            const v = form[f.name];
            if (!v && v!==0 && v!==false) { errs[f.name]='Required'; msgs.push(`${f.label} is required`); }
        });
        setErrors(errs);
        if (msgs.length) { setValMsgs(msgs); return false; }
        return true;
    };

    const save = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            const body = section.saveMapper
                ? section.saveMapper(form, currentUser, !form._originalId)
                : form;
            const res = await fetch(`${API}${section.apiBase}`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(()=>({}));
                setValMsgs([err.message || 'Save failed']); return;
            }
            setEditing(null); load();
        } catch { setValMsgs(['Unexpected error.']); }
        finally { setSaving(false); }
    };

    // ── Pagination derived values ──────────────────────────────────────────────
    const totalFiltered = sortedRows.length;
    const totalPages    = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const safePage      = Math.min(page, totalPages);
    const pageRows      = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

    const PAGE_SIZES = [10, 20, 50, 100];

    return (
        <div className="adm-table-section">
            <div className="adm-table-header">
                <span className="adm-table-title">
                    {section.title}
                    {activeFilterCount > 0 && (
                        <span style={{ marginLeft:8, fontSize:11, fontWeight:600, background:'#dbeafe',
                                       color:'#1e40af', padding:'2px 8px', borderRadius:10 }}>
                            {totalFiltered} / {rows.length}
                        </span>
                    )}
                </span>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {activeFilterCount > 0 && (
                        <button onClick={clearColFilters}
                            style={{ fontSize:11, color:'#64748b', background:'none', border:'1px solid #cbd5e1',
                                     borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                            Clear filters ✕
                        </button>
                    )}
                    {!section.readOnly && <button className="adm-add-btn" onClick={openNew}>+ Add</button>}
                </div>
            </div>

            {loading ? <div className="adm-loading">Loading…</div>
            : rows.length===0 ? <div className="adm-empty">No records yet.</div>
            : (
                <div className="adm-grid">
                    <table className="adm-tbl">
                        <thead>
                            {/* Sort header row */}
                            <tr>
                                {section.columns.map(c => (
                                    <th key={c.key}
                                        onClick={() => doSort(c.key)}
                                        style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                                        {c.label}
                                        <span style={{ marginLeft:4, opacity: sortCol===c.key ? 1 : 0.3, fontSize:10 }}>
                                            {sortCol===c.key ? (sortDir==='asc' ? '▲' : '▼') : '⇅'}
                                        </span>
                                    </th>
                                ))}
                                <th style={{width:90}}>Actions</th>
                            </tr>
                            {/* Column filter row */}
                            <tr style={{ background:'#f8fafc' }}>
                                {section.columns.map(c => (
                                    <th key={c.key} style={{ padding:'4px 6px', fontWeight:'normal' }}>
                                        <input
                                            type="text"
                                            value={colFilters[c.key] || ''}
                                            onChange={e => setColFilter(c.key, e.target.value)}
                                            placeholder="Filter…"
                                            style={{
                                                width:'100%', padding:'4px 7px', fontSize:11,
                                                border: colFilters[c.key] ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                                borderRadius:5, outline:'none', background:'#fff',
                                                color:'#334155', boxSizing:'border-box',
                                            }}
                                        />
                                    </th>
                                ))}
                                <th style={{ padding:'4px 6px' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.length === 0 ? (
                                <tr><td colSpan={section.columns.length + 1}
                                    style={{ textAlign:'center', padding:28, color:'#94a3b8', fontStyle:'italic' }}>
                                    No records match the current filters.
                                </td></tr>
                            ) : pageRows.map((row, i) => (
                                <tr key={row[section.idField]??i}
                                    className={row.isActive===false ? 'adm-row-inactive':''}>
                                    {section.columns.map(c => (
                                        <td key={c.key}>{c.render ? c.render(row) : (row[c.key]??'—')}</td>
                                    ))}
                                    <td>
                                        {!section.readOnly &&
                                            <button className="ds-edit-btn" onClick={()=>openEdit(row)}>Edit</button>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* ── Pagination bar ── */}
                    <div className="adm-pagination">
                        <div className="adm-page-info">
                            {totalFiltered > 0
                                ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, totalFiltered)} of ${totalFiltered}`
                                : '0 records'}
                        </div>
                        <div className="adm-page-controls">
                            <button className="adm-page-btn" onClick={() => setPage(1)}          disabled={safePage===1}>«</button>
                            <button className="adm-page-btn" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={safePage===1}>‹</button>
                            {Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
                                // sliding window of up to 7 page buttons
                                const half  = 3;
                                let start = Math.max(1, safePage - half);
                                let end   = Math.min(totalPages, start + 6);
                                if (end - start < 6) start = Math.max(1, end - 6);
                                const pg = start + i;
                                if (pg > totalPages) return null;
                                return (
                                    <button key={pg}
                                        className={`adm-page-btn ${pg === safePage ? 'adm-page-btn-active' : ''}`}
                                        onClick={() => setPage(pg)}>{pg}</button>
                                );
                            })}
                            <button className="adm-page-btn" onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={safePage===totalPages}>›</button>
                            <button className="adm-page-btn" onClick={() => setPage(totalPages)}  disabled={safePage===totalPages}>»</button>
                        </div>
                        <select className="adm-page-size"
                            value={pageSize}
                            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                        </select>
                    </div>
                </div>
            )}

            {editing !== null && (
                <SlidePanel
                    title={form[section.idField] ? `Edit ${section.title}` : `New ${section.title}`}
                    subtitle={section.title}
                    onClose={() => setEditing(null)}
                    footer={
                        <>
                            <button className="ds-btn-sec" onClick={()=>setEditing(null)}>Cancel</button>
                            <button className="ds-btn-pri" onClick={save} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </>
                    }
                >
                    {section.fields.map(f => (
                        <Field key={f.name} label={f.label} required={f.required} error={errors[f.name]}>
                            {f.type==='checkbox' ? (
                                <Checkbox label={f.label} name={f.name} checked={form[f.name]} onChange={handle} />
                            ) : f.type==='textarea' ? (
                                <textarea className="ds-input" name={f.name}
                                    value={form[f.name]??''} onChange={handle}
                                    rows={3} style={{resize:'vertical'}} />
                            ) : f.type==='select' ? (
                                <select className={`ds-input${errors[f.name] ? ' ds-input-err' : ''}`}
                                    name={f.name} value={form[f.name]??''}
                                    onChange={handle}>
                                    <option value="">— Select —</option>
                                    {(f.options || fieldOptions[f.name] || []).map(o => {
                                        const vk = f.valueKey || 'id';
                                        const lk = f.labelKey || 'name';
                                        const val = o[vk] ?? o.id ?? o.value;
                                        const lbl = o[lk] ?? o.name ?? o.label;
                                        return (
                                            <option key={val} value={val}>
                                                {o.code ? `${o.code} — ` : ''}{lbl}
                                            </option>
                                        );
                                    })}
                                </select>
                            ) : (
                                <Input name={f.name} value={form[f.name]} onChange={handle}
                                    type={f.type||'text'} placeholder={f.placeholder}
                                    className={errors[f.name] ? 'ds-input-err' : ''} />
                            )}
                        </Field>
                    ))}
                </SlidePanel>
            )}

            {valMsgs && <ValidationModal errors={valMsgs} onClose={()=>setValMsgs(null)} />}
        </div>
    );
};

// ── SMTP Settings panel ───────────────────────────────────────────────────────
const SmtpPanel = () => {
    const [form, setForm]     = useState({ host:'', port:587, username:'', password:'', fromAddress:'', fromName:'', enableSsl:true });
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [msg,     setMsg]     = useState({ type:'', text:'' });
    const [showPw,  setShowPw]  = useState(false);

    useEffect(() => {
        fetch(`${API}appsettings/smtp`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setForm({ host:d.host||'', port:d.port||587, username:d.username||'', password:d.password||'', fromAddress:d.fromAddress||'', fromName:d.fromName||'', enableSsl:d.enableSsl!==false }); })
            .catch(()=>{})
            .finally(()=>setLoading(false));
    }, []);

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type==='checkbox' ? checked : value }));
    };

    const save = async e => {
        e.preventDefault();
        if (!form.host.trim())        return setMsg({ type:'err', text:'SMTP Host is required.' });
        if (!form.username.trim())    return setMsg({ type:'err', text:'Username is required.' });
        if (!form.fromAddress.trim()) return setMsg({ type:'err', text:'From Address is required.' });
        setSaving(true); setMsg({ type:'', text:'' });
        try {
            const r = await fetch(`${API}appsettings/smtp`, {
                method:'POST', headers: authHeaders(),
                body: JSON.stringify({ ...form, port: parseInt(form.port)||587 }),
            });
            const d = await r.json();
            setMsg({ type: r.ok ? 'ok' : 'err', text: d.message });
        } catch { setMsg({ type:'err', text:'Unexpected error.' }); }
        finally { setSaving(false); }
    };

    const iStyle = { border:'1px solid #cbd5e1', borderRadius:6, padding:'7px 10px', fontSize:13, color:'#0f172a', width:'100%', boxSizing:'border-box' };
    const lStyle = { fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:4 };
    const fStyle = { display:'flex', flexDirection:'column' };
    const secStyle = { fontSize:10.5, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12, marginTop:24, borderBottom:'1px solid #e2e8f0', paddingBottom:6 };

    if (loading) return <div className="adm-table-section" style={{ padding:24, color:'#94a3b8' }}>Loading…</div>;

    return (
        <div className="adm-table-section" style={{ padding:24, maxWidth:660 }}>
            <form onSubmit={save}>
                {msg.text && (
                    <div style={{ padding:'10px 14px', borderRadius:7, marginBottom:18, fontSize:13, fontWeight:500,
                        background: msg.type==='ok' ? '#f0fdf4' : '#fef2f2',
                        color:      msg.type==='ok' ? '#16a34a' : '#dc2626',
                        border:     `1px solid ${msg.type==='ok' ? '#bbf7d0' : '#fecaca'}` }}>
                        {msg.text}
                    </div>
                )}

                <div style={secStyle}>Server</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 130px', gap:14, marginBottom:14 }}>
                    <div style={fStyle}>
                        <label style={lStyle}>SMTP Host</label>
                        <input style={iStyle} name="host" value={form.host} onChange={handle} placeholder="smtp.gmail.com" />
                        <span style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>e.g. smtp.gmail.com, smtp.office365.com</span>
                    </div>
                    <div style={fStyle}>
                        <label style={lStyle}>Port</label>
                        <input style={iStyle} name="port" type="number" value={form.port} onChange={handle} placeholder="587" />
                        <span style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>587 (TLS) or 465 (SSL)</span>
                    </div>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, cursor:'pointer' }}>
                    <input type="checkbox" name="enableSsl" checked={form.enableSsl} onChange={handle} style={{ width:15, height:15 }} />
                    <span style={{ fontSize:13, color:'#334155', fontWeight:500 }}>Enable SSL / TLS</span>
                </label>

                <div style={secStyle}>Credentials</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
                    <div style={fStyle}>
                        <label style={lStyle}>Username</label>
                        <input style={iStyle} name="username" value={form.username} onChange={handle} placeholder="you@example.com" />
                    </div>
                    <div style={fStyle}>
                        <label style={lStyle}>Password</label>
                        <div style={{ position:'relative' }}>
                            <input style={{ ...iStyle, paddingRight:52 }} name="password"
                                type={showPw ? 'text' : 'password'}
                                value={form.password} onChange={handle} placeholder="App password" />
                            <button type="button" onClick={()=>setShowPw(p=>!p)}
                                style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                                         background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#64748b' }}>
                                {showPw ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <span style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>Use an App Password for Gmail/Outlook</span>
                    </div>
                </div>

                <div style={secStyle}>Sender Identity</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:28 }}>
                    <div style={fStyle}>
                        <label style={lStyle}>From Address</label>
                        <input style={iStyle} name="fromAddress" value={form.fromAddress} onChange={handle} placeholder="alerts@yourcompany.com" />
                    </div>
                    <div style={fStyle}>
                        <label style={lStyle}>From Name</label>
                        <input style={iStyle} name="fromName" value={form.fromName} onChange={handle} placeholder="WebERP Alerts" />
                    </div>
                </div>

                <button type="submit" className="adm-add-btn" disabled={saving}
                    style={{ minWidth:180 }}>
                    {saving ? 'Saving…' : 'Save SMTP Settings'}
                </button>
            </form>

            <div style={{ marginTop:20, padding:'12px 16px', background:'#fffbeb', border:'1px solid #fde68a',
                          borderRadius:8, fontSize:12, color:'#92400e', lineHeight:1.7 }}>
                <strong>Gmail:</strong> Enable 2FA → Google Account → Security → App Passwords → generate one.<br/>
                <strong>Outlook/Office 365:</strong> Use smtp.office365.com, port 587, your email + password.
            </div>
        </div>
    );
};

// ── Main AdminPage ────────────────────────────────────────────────────────────
const AdminPage = () => {
    const [activeKey, setActiveKey] = useState(SECTIONS[0].key);
    const activeSection = SECTIONS.find(s => s.key === activeKey) || SECTIONS[0];

    return (
        <div className="adm-page">
            {/* Sidebar */}
            <nav className="adm-nav">
                {GROUPS.map(group => {
                    const items = SECTIONS.filter(s => s.group === group);
                    if (!items.length) return null;
                    return (
                        <div key={group} className="adm-nav-group">
                            <div className="adm-nav-group-label">{group}</div>
                            {items.map(s => (
                                <button
                                    key={s.key}
                                    className={`adm-nav-item ${activeKey===s.key ? 'adm-nav-active' : ''}`}
                                    onClick={() => setActiveKey(s.key)}
                                >
                                    {s.title}
                                </button>
                            ))}
                        </div>
                    );
                })}
                {/* System extras */}
                <div className="adm-nav-group">
                    <div className="adm-nav-group-label">Configuration</div>
                    <button
                        className={`adm-nav-item ${activeKey==='smtp' ? 'adm-nav-active' : ''}`}
                        onClick={() => setActiveKey('smtp')}
                    >
                        SMTP Settings
                    </button>
                </div>
            </nav>

            {/* Content */}
            <main className="adm-content">
                <div className="adm-content-header">
                    <div className="adm-content-title">
                        {activeKey === 'smtp' ? 'SMTP Settings' : activeSection.title}
                    </div>
                    <div className="adm-content-sub">
                        {activeKey === 'smtp'
                            ? 'Configuration › SMTP Settings'
                            : `${activeSection.group} › ${activeSection.title}`}
                    </div>
                </div>
                {activeKey === 'smtp'
                    ? <SmtpPanel />
                    : <SmartLookupTable key={activeKey} section={activeSection} />
                }
            </main>
        </div>
    );
};

export default AdminPage;
