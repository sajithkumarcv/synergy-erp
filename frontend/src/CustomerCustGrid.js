import React, { useState, useEffect } from 'react';
import { variables } from './Variable.js';

export const CustomerCustGrid = () => {
    const [customers, setCustomers] = useState([]);
    const [, setTotal] = useState(0);
    
    // Manage all grid settings in one state object
    const [params, setParams] = useState({
        page: 1,
        size: 10,
        search: '',
        sortCol: 'CustomerName',
        sortDir: 'ASC'
    });

    // Automatically refetch whenever any parameter changes
    useEffect(() => {
        fetchData();
    }, [params.page, params.search, params.sortCol, params.sortDir]);

  const fetchData = async () => {
    try {
        const url = variables.API_URL + `customer/custompaged?search=${params.search}&page=${params.page}&size=${params.size}&sortCol=${params.sortCol}&sortDir=${params.sortDir}`;
        const res = await fetch(url);
        const result = await res.json();

        // CLEANUP LOGIC:
        // If the backend is sending "CustomerName": ["abc"], this flattens it to "abc"
        const cleanData = result.data.map(item => {
            let newItem = {};
            for (let key in item) {
                // If it's an array, take the first element; otherwise take the value
                newItem[key] = Array.isArray(item[key]) ? item[key][0] : item[key];
            }
            return newItem;
        });

        setCustomers(cleanData);
        setTotal(result.total);
    } catch (error) {
        console.error("Fetch error:", error);
    }
};

    // Logic for toggling Sort Direction
    const handleSort = (column) => {
        setParams(prev => ({
            ...prev,
            sortCol: column,
            sortDir: prev.sortCol === column && prev.sortDir === 'ASC' ? 'DESC' : 'ASC'
        }));
    };

    return (
        <div className="container mt-4">
            {/* 1. Filtering (Search Bar) */}
            <div className="mb-3">
                <input 
                    type="text"
                    className="form-control"
                    placeholder="Search by name or code..."
                    value={params.search}
                    onChange={(e) => setParams({ ...params, search: e.target.value, page: 1 })}
                />
            </div>

            {/* 2. The Data Grid */}
            <table className="table table-striped border">
                <thead className="table-dark">
                    <tr>
                        <th onClick={() => handleSort('customerCode')} style={{ cursor: 'pointer' }}>
                            Code {params.sortCol === 'customerCode' && (params.sortDir === 'ASC' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('customerName')} style={{ cursor: 'pointer' }}>
                            Name {params.sortCol === 'customerName' && (params.sortDir === 'ASC' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('email')} style={{ cursor: 'pointer' }}>
                            Email {params.sortCol === 'email' && (params.sortDir === 'ASC' ? '↑' : '↓')}
                        </th>
                        <th>Mobile</th>
                    </tr>
                </thead>
                <tbody>
                    {customers.length > 0 ? (
                        customers.map((cust, index) => (
                            <tr key={index}>
                                {/* Using the Index-based fallback you confirmed works */}
                              <td>{cust.customerCode}</td>
            <td>{cust.customerName}</td>
            <td>{cust.email}</td>
            <td>{cust.mobile}</td>
                            </tr>
                        ))
                    ) : (
                        <tr><td colSpan="4" className="text-center">No records found.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};