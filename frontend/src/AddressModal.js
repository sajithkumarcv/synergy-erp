import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from './Variable.js';
import AlertModal from './common/AlertModal';

export const AddressModal = ({ customerId, customerName, closeModal }) => {
    const [addresses, setAddresses] = useState([]);
    const [countries, setCountries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);

    // Initial state for a new address entry
    const [newAddress, setNewAddress] = useState({
        customerAddressId: 0,
        customerId: customerId,
        addressType: "", // e.g., Billing, Shipping
        addressLine1: "",
        city: "",
        countryId: 0,
        isDefault: false
    });

    // Fetch addresses and country lookup
    const refreshData = useCallback(() => {
        setLoading(true);
        // Get existing addresses
        fetch(variables.API_URL + 'customer/addresses/' + customerId, {
            headers: authHeaders()
        })
            .then(res => res.json())
            .then(data => setAddresses(data));

        // Get country lookup
        fetch(variables.API_URL + 'Lookup/country', {
            headers: authHeaders()
        })
            .then(res => res.json())
            .then(data => setCountries(data))
            .finally(() => setLoading(false));
    }, [customerId]);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setNewAddress({
            ...newAddress,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const saveAddress = async () => {
        if (!newAddress.addressType || !newAddress.addressLine1) {
            setAlertMsg("Please fill in Type and Address Line");
            return;
        }
        try {
            const res = await fetch(variables.API_URL + 'customer/address/save', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(newAddress)
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save address.'); return; }
            setAlertMsg("Address saved successfully");
            refreshData();
            setNewAddress({
                customerAddressId: 0,
                customerId: customerId,
                addressType: "",
                addressLine1: "",
                city: "",
                countryId: 0,
                isDefault: false
            });
        } catch { setAlertMsg('Network error. Please try again.'); }
    };

    return (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-lg">
                <div className="modal-content">
                    <div className="modal-header bg-success text-white">
                        <h5 className="modal-title">Addresses: {customerName}</h5>
                        <button type="button" className="btn-close btn-close-white" onClick={closeModal}></button>
                    </div>

                    <div className="modal-body">
                        {/* INPUT FORM SECTION */}
                        <div className="p-3 border rounded bg-light mb-4">
                            <h6>Add New Address</h6>
                            <div className="row">
                                <div className="col-md-4 mb-2">
                                    <label className="small">Type (e.g. Home, Office)</label>
                                    <input type="text" name="addressType" className="form-control form-control-sm" 
                                        value={newAddress.addressType} onChange={handleInputChange} />
                                </div>
                                <div className="col-md-8 mb-2">
                                    <label className="small">Address Line 1</label>
                                    <input type="text" name="addressLine1" className="form-control form-control-sm" 
                                        value={newAddress.addressLine1} onChange={handleInputChange} />
                                </div>
                                <div className="col-md-4 mb-2">
                                    <label className="small">City</label>
                                    <input type="text" name="city" className="form-control form-control-sm" 
                                        value={newAddress.city} onChange={handleInputChange} />
                                </div>
                                <div className="col-md-4 mb-2">
                                    <label className="small">Country</label>
                                    <select name="countryId" className="form-select form-select-sm" 
                                        value={newAddress.countryId} onChange={handleInputChange}>
                                        <option value="0">-- Select --</option>
                                        {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-4 mb-2 d-flex align-items-end">
                                    <div className="form-check mb-1">
                                        <input type="checkbox" name="isDefault" className="form-check-input" 
                                            checked={newAddress.isDefault} onChange={handleInputChange} id="defAddr" />
                                        <label className="form-check-label small" htmlFor="defAddr">Set as Default</label>
                                    </div>
                                    <button className="btn btn-sm btn-success ms-auto" onClick={saveAddress}>
                                        Save Address
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* LIST SECTION */}
                        <h6>Existing Addresses</h6>
                        <table className="table table-hover table-sm border">
                            <thead className="table-light">
                                <tr>
                                    <th>Type</th>
                                    <th>Address</th>
                                    <th>City</th>
                                    <th>Default</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="5" className="text-center">Loading...</td></tr>
                                ) : addresses.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center text-muted">No addresses found.</td></tr>
                                ) : (
                                    addresses.map(addr => (
                                        <tr key={addr.customerAddressId}>
                                            <td>{addr.addressType}</td>
                                            <td>{addr.addressLine1}</td>
                                            <td>{addr.city}</td>
                                            <td>{addr.isDefault ? <span className="badge bg-primary">Yes</span> : "No"}</td>
                                            <td>
                                                <button className="btn btn-outline-danger btn-sm">Delete</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                    </div>
                </div>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};