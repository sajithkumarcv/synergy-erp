import React, { useState, useEffect, useCallback } from 'react';
import { variables } from "./Variable.js";
import AlertModal from './common/AlertModal';

export const CustomerModal = ({ title, cust, closeModal, refreshList }) => {
    // 1. STATE DEFINITIONS
    const [formData, setFormData] = useState({ ...cust });
    const [activeTab, setActiveTab] = useState("basic");
    
    // Lookup Lists
    const [, setCountries] = useState([]);
    const [currencies, setCurrencies] = useState([]);
    const [paymentTerms, setPaymentTerms] = useState([]);

    // Child Table Data
    const [addresses, setAddresses] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [alertMsg, setAlertMsg] = useState(null);

    // Temporary states for Sub-Forms
    const [newAddress, setNewAddress] = useState({
        customerAddressId: 0, customerId: cust.customerId, addressType: "",
        addressLine1: "", city: "", state: "", countryId: 0, isDefault: false, isActive: true
    });

    const [newContact, setNewContact] = useState({
        customerContactId: 0, customerId: cust.customerId, contactName: "",
        designation: "", mobile: "", email: "", isPrimary: false, isActive: true
    });

    // 2. DATA FETCHING
    const fetchChildData = useCallback(() => {
        if (formData.customerId === 0) return;
        fetch(variables.API_URL + 'customer/addresses/' + formData.customerId)
            .then(res => res.json()).then(data => setAddresses(data));
        fetch(variables.API_URL + 'customer/contacts/' + formData.customerId)
            .then(res => res.json()).then(data => setContacts(data));
    }, [formData.customerId]);

    useEffect(() => {
        const loadLookup = (type, setter) => {
            fetch(variables.API_URL + "Lookup/" + type)
                .then(res => res.json()).then(data => setter(data))
                .catch(err => console.error("Lookup error:", err));
        };
        loadLookup("country", setCountries);
        loadLookup("currency", setCurrencies);
        loadLookup("paymentterms", setPaymentTerms);

        if (formData.customerId > 0) { fetchChildData(); }
    }, [formData.customerId, fetchChildData]);

    // 3. EVENT HANDLERS
   const handleInputChange = (e) => {
    // 1. Destructure the properties we need from the input
    const { name, value, type, checked } = e.target;

    // 2. Update the state object dynamically
    setFormData({
        ...formData, // Keep all existing fields
        [name]: type === 'checkbox' ? checked : value // Use name as the key
    });
};

    const saveCustomer = () => {
        fetch(variables.API_URL + 'customer/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        })
        .then(res => res.json())
        .then((result) => {
            setAlertMsg(result.message || "Saved Successfully");
            refreshList();
            closeModal();
        });
    };

    const saveAddress = () => {
        fetch(variables.API_URL + 'customer/address/save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newAddress, customerId: formData.customerId })
        }).then(() => { fetchChildData(); setAlertMsg("Address Added"); });
    };

    const saveContact = () => {
        fetch(variables.API_URL + 'customer/contact/save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newContact, customerId: formData.customerId })
        }).then(() => { fetchChildData(); setAlertMsg("Contact Added"); });
    };

   

    return (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-xl">
                <div className="modal-content">
                    <div className="modal-header bg-primary text-white">
                        <h5 className="modal-title">{title}</h5>
                        <button type="button" className="btn-close btn-close-white" onClick={closeModal}></button>
                    </div>

                    <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                        <ul className="nav nav-tabs mb-3">
                            <li className="nav-item"><button className={`nav-link ${activeTab === 'basic' ? 'active' : ''}`} onClick={() => setActiveTab('basic')}>Basic Info</button></li>
                            <li className="nav-item"><button disabled={formData.customerId === 0} className={`nav-link ${activeTab === 'address' ? 'active' : ''}`} onClick={() => setActiveTab('address')}>Address</button></li>
                            <li className="nav-item"><button disabled={formData.customerId === 0} className={`nav-link ${activeTab === 'contact' ? 'active' : ''}`} onClick={() => setActiveTab('contact')}>Contacts</button></li>
                        </ul>

                        {activeTab === 'basic' && (
                            <div className="row">
                                <div className="col-md-4 mb-3"><label>Customer Code</label><input name="customerCode" className="form-control" value={formData.customerCode || ''} onChange={handleInputChange} /></div>
                                <div className="col-md-8 mb-3"><label>Customer Name</label><input name="customerName" className="form-control" value={formData.customerName || ''} onChange={handleInputChange} /></div>
                                <div className="col-md-4 mb-3"><label>Email</label><input name="email" className="form-control" value={formData.email || ''} onChange={handleInputChange} /></div>
                                <div className="col-md-4 mb-3"><label>Mobile</label><input name="mobile" className="form-control" value={formData.mobile || ''} onChange={handleInputChange} /></div>
                                <div className="col-md-4 mb-3"><label>Phone</label><input name="phone" className="form-control" value={formData.phone || ''} onChange={handleInputChange} /></div>
                                <div className="col-md-4 mb-3"><label>Credit Limit {currencies.find(c => c.isBaseCurrency)?.shortName ? `(${currencies.find(c => c.isBaseCurrency).shortName})` : ''}</label><input type="number" name="creditLimit" className="form-control" value={formData.creditLimit || 0} onChange={handleInputChange} /></div>
                                <div className="col-md-4 mb-3"><label>Credit Days</label><input type="number" name="creditDays" className="form-control" value={formData.creditDays || 0} onChange={handleInputChange} /></div>
                                <div className="col-md-4 mb-3"><label>VAT Number</label><input name="vatNumber" className="form-control" value={formData.vatNumber || ''} onChange={handleInputChange} /></div>
                           <div className="input-group mb-3">
    <span className="col-md-4 mb-3">Currency</span>
    <select 
        name="currencyId" 
        className="form-select" 
        value={formData.currencyId || ""} 
        onChange={handleInputChange}
    >
        <option value="">-- Select Currency --</option>
        {currencies && currencies.length > 0 ? (
            currencies.map((c, index) => (
                <option key={index} value={c.id}>
                     {c.name}
                </option>
            ))
        ) : (
            <option disabled>Loading currencies...</option>
        )}
    </select>
</div>
 <div className="input-group mb-3">
    <span className="col-md-4 mb-3">Payment Terms</span>
    <select 
        name="paymentTermsId" 
        className="form-select" 
        value={formData.paymentTermsId || ""} 
        onChange={handleInputChange}
    >
        <option value="">-- Select Terms --</option>
        {paymentTerms && paymentTerms.length > 0 ? (
            paymentTerms.map((c, index) => (
                <option key={index} value={c.id}>
                     {c.name}
                </option>
            ))
        ) : (
            <option disabled>Loading Terms...</option>
        )}
    </select>
</div>
                                <div className="col-md-12 mb-3"><label>Remarks</label><textarea name="remarks" className="form-control" rows="2" value={formData.remarks || ''} onChange={handleInputChange}></textarea></div>
                            </div>
                        )}

                        {activeTab === 'address' && (
                            <div>
                                <div className="p-3 border bg-light mb-3">
                                    <div className="row">
                                        <div className="col-md-3"><input name="addressType" className="form-control" placeholder="Type" onChange={(e) => setNewAddress({...newAddress, addressType: e.target.value})} /></div>
                                        <div className="col-md-6"><input name="addressLine1" className="form-control" placeholder="Address" onChange={(e) => setNewAddress({...newAddress, addressLine1: e.target.value})} /></div>
                                        <div className="col-md-3"><button className="btn btn-success w-100" onClick={saveAddress}>Add Address</button></div>
                                    </div>
                                </div>
                                <table className="table table-sm border">
                                    <thead><tr><th>Type</th><th>Address</th><th>Action</th></tr></thead>
                                    <tbody>{addresses.map(a => <tr key={a.customerAddressId}><td>{a.addressType}</td><td>{a.addressLine1}</td><td><button className="btn btn-danger btn-sm">Delete</button></td></tr>)}</tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'contact' && (
                             <div>
                                <div className="p-3 border bg-light mb-3">
                                    <div className="row">
                                        <div className="col-md-4"><input className="form-control" placeholder="Contact Name" onChange={(e) => setNewContact({...newContact, contactName: e.target.value})} /></div>
                                        <div className="col-md-4"><input className="form-control" placeholder="Mobile" onChange={(e) => setNewContact({...newContact, mobile: e.target.value})} /></div>
                                        <div className="col-md-4"><button className="btn btn-success w-100" onClick={saveContact}>Add Contact</button></div>
                                    </div>
                                </div>
                                <table className="table table-sm border">
                                    <thead><tr><th>Name</th><th>Mobile</th><th>Action</th></tr></thead>
                                    <tbody>{contacts.map(c => <tr key={c.customerContactId}><td>{c.contactName}</td><td>{c.mobile}</td><td><button className="btn btn-danger btn-sm">Delete</button></td></tr>)}</tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={closeModal}>Close</button>
                        {activeTab === 'basic' && <button className="btn btn-primary" onClick={saveCustomer}>Save Customer</button>}
                    </div>
                </div>
            </div>
        </div>
        {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
    );
};