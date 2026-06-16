import React, { useState, useEffect } from 'react';
import { variables } from './Variable.js';

export const CustomerGrid = () => {
    const [customers, setCustomers] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const pageSize = 2;

    useEffect(() => {
        fetchData();
    }, [page, search]);

  const fetchData = () => {
    fetch(`${variables.API_URL}customer/paged?search=${search}&page=${page}&size=${pageSize}`)
        .then(res => res.json())
        .then(result => {console.log("API Result:", result);
            // If data comes back as a string, parse it
            const actualData = typeof result.data === 'string' 
                ? JSON.parse(result.data) 
                : result.data;

            setCustomers(actualData || []);
            setTotalRows(result.total || 0);
        });
};

    return (
        <div className="container mt-4">
            <h4>Customer Grid (Server-Side Paging)</h4>
            
            <input 
                type="text" 
                placeholder="Search by name or code..." 
                className="form-control mb-3"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
            />

            <table className="table table-bordered table-hover">
                <thead className="table-dark">
                    <tr>
                        <th>Code</th>
                        <th>Customer Name</th>
                        <th>Email</th>
                        <th>Mobile</th>
                    </tr>
                </thead>
                <tbody>
                    {customers.length > 0 ? (
                        customers.map((cust, index) => (
                           <tr key={index}>
        {/* If 'cust' is an array (based on your screenshot), we use index. 
            If 'cust' is an object (after the C# fix), we use the name. */}
        <td>{cust.customerCode || cust[1]}</td>
        <td>{cust.customerName || cust[2]}</td>
        <td>{cust.email || cust[11]}</td>
        <td>{cust.mobile || cust[13]}</td>
    </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="4" className="text-center">No records found</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="d-flex justify-content-between align-items-center mt-3">
                <button 
                    disabled={page === 1} 
                    onClick={() => setPage(page - 1)}
                    className="btn btn-outline-primary btn-sm">
                    &laquo; Previous
                </button>
                
                <span className="fw-bold text-muted">
                    Page {page} of {Math.max(1, Math.ceil(totalRows / pageSize))} 
                    <small className="ms-2">({totalRows} total records)</small>
                </span>

                <button 
                    disabled={page >= Math.ceil(totalRows / pageSize) || totalRows === 0} 
                    onClick={() => setPage(page + 1)}
                    className="btn btn-outline-primary btn-sm">
                    Next &raquo;
                </button>
            </div>
        </div>
    );
};