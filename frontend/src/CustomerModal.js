import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from "./Variable.js";
import ValidationModal from './common/ValidationModal';

export const CustomerModal = ({ title, cust, closeModal, refreshList }) => {
    // 1. STATE DEFINITIONS
    const [formData, setFormData] = useState({ ...cust });
    const [validErrors, setValidErrors] = useState(null);
    // Lookup Lists
    const [, setCountries] = useState([]);
    const [currencies, setCurrencies] = useState([]);
    const [paymentTerms, setPaymentTerms] = useState([]);

   

  



    useEffect(() => {
        const loadLookup = (type, setter) => {
            fetch(variables.API_URL + "Lookup/" + type, {
                headers: authHeaders()
            })
                .then(res => res.json()).then(data => setter(data))
                .catch(err => console.error("Lookup error:", err));
        };
        loadLookup("country", setCountries);
        loadLookup("currency", setCurrencies);
        loadLookup("paymentterms", setPaymentTerms);

       
    }, [formData.customerId]);

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

    const saveCustomer = async () => {
        const errs = [];
        if (!formData.customerCode?.trim()) errs.push('Customer Code is required.');
        if (!formData.customerName?.trim()) errs.push('Customer Name is required.');
        if (!formData.currencyId)           errs.push('Currency is required.');
        if (!formData.paymentTermsId)       errs.push('Payment Terms are required.');
        if (errs.length) { setValidErrors(errs); return; }
        try {
            const res = await fetch(variables.API_URL + 'customer/save', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(formData)
            });
            const d = await res.json();
            if (!res.ok) { setValidErrors([d?.message || 'Failed to save customer.']); return; }
            refreshList();
            closeModal();
        } catch { setValidErrors(['Network error. Please try again.']); }
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

                     
                        
                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={closeModal}>Close</button>
                        {activeTab === 'basic' && <button className="btn btn-primary" onClick={saveCustomer}>Save Customer</button>}
                    </div>
                </div>
            </div>
            {validErrors && <ValidationModal errors={validErrors} onClose={() => setValidErrors(null)} />}
        </div>
    );
};