import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { GST_REGISTERED } from '../../supplier/supplierConstants';

// Warning only (never blocks): a supplier in India should have GST details and a bank account on file.
const SupplierComplianceWarning = ({ supplierId }) => {
    const [missing, setMissing] = useState([]);

    useEffect(() => {
        setMissing([]);
        if (!supplierId) return undefined;
        let live = true;
        fetch(`${variables.API_URL}supplier/${supplierId}`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : null))
            .then(s => {
                if (!live || !s || !/^india$/i.test((s.countryName || '').trim())) return;
                const list = [];
                if (!s.gstTreatment) list.push('tax treatment is not set');
                else if (GST_REGISTERED.includes(s.gstTreatment) && !(s.taxNumber || '').trim()) list.push('GST number is missing');
                if (!s.bankCount) list.push('bank details are not entered');
                setMissing(list);
            })
            .catch(() => {});
        return () => { live = false; };
    }, [supplierId]);

    if (!missing.length) return null;
    return (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
            ⚠ This supplier is in India and {missing.join(' and ')}. You can continue, but please update the supplier master.
        </div>
    );
};

export default SupplierComplianceWarning;
