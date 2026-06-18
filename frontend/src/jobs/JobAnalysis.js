import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const API          = variables.API_URL;
const PAGE_SIZES   = [15, 30, 50, 100];
const DEFAULT_FILTERS = { searchText: '', jobTypeId: '', jobId: '', statusId: '', dateFrom: '', dateTo: '' };
const GROUP_OPTIONS   = [
    { value: 'Job',      label: 'Per Job' },
    { value: 'JobType',  label: 'By Type' },
    { value: 'Customer', label: 'By Customer' },
    { value: 'Status',   label: 'By Status' },
];
const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#6366f1'];

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK   = (v) => { const n = Number(v ?? 0); if (Math.abs(n)>=1e6) return `${(n/1e6).toFixed(1)}M`; if (Math.abs(n)>=1000) return `${(n/1000).toFixed(0)}K`; return n.toFixed(0); };
const fmtPct = (n) => `${Number(n ?? 0).toFixed(1)}%`;
const lbl    = (r, gb) => gb === 'Job'
    ? (r.jobId || '').slice(0, 18)
    : (r.jobTypeName || r.customerName || r.jobStatusName || r.jobId || '').slice(0, 18);

// ── Colour helpers ─────────────────────────────────────────────────────────────
const mc  = (p) => p >= 25 ? '#10b981' : p >= 10 ? '#f59e0b' : p >= 0 ? '#f97316' : '#ef4444';
const mcb = (p) => p >= 25 ? '#d1fae5' : p >= 10 ? '#fef3c7' : p >= 0 ? '#ffedd5' : '#fee2e2';

// ── Custom tooltip ─────────────────────────────────────────────────────────────
const CTooltip = ({ active, payload, label: l }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background:'#1e293b', borderRadius:8, padding:'10px 14px', boxShadow:'0 8px 24px rgba(0,0,0,.3)', fontSize:12 }}>
            <div style={{ color:'#94a3b8', fontWeight:600, marginBottom:6, fontSize:11 }}>{l}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:20, color:p.color, marginBottom:2 }}>
                    <span>{p.name}</span><span style={{ fontWeight:700 }}>{fmt(p.value)}</span>
                </div>
            ))}
        </div>
    );
};
const PTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
        <div style={{ background:'#1e293b', borderRadius:8, padding:'8px 12px', fontSize:12, boxShadow:'0 4px 16px rgba(0,0,0,.3)' }}>
            <div style={{ color:'#94a3b8', marginBottom:3 }}>{p.name}</div>
            <div style={{ color:p.payload.fill||'#fff', fontWeight:700 }}>{fmt(p.value)}</div>
        </div>
    );
};

// ── Components ─────────────────────────────────────────────────────────────────
const MetricCard = ({ label: lbl2, value, sub, accent, icon, large }) => (
    <div style={{
        background:'#fff', borderRadius:12, padding: large ? '20px 24px' : '16px 20px',
        border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:6,
        borderTop:`3px solid ${accent||'#e2e8f0'}`, boxShadow:'0 1px 4px rgba(0,0,0,.04)',
    }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em' }}>{lbl2}</span>
            <span style={{ fontSize: large ? 22 : 18 }}>{icon}</span>
        </div>
        <div style={{ fontSize: large ? 26 : 20, fontWeight:800, color:accent||'#0f172a', letterSpacing:'-.02em', lineHeight:1.1 }}>{value}</div>
        {sub && <div style={{ fontSize:11, color:'#64748b', lineHeight:1.4 }}>{sub}</div>}
    </div>
);

const STitle = ({ title, sub }) => (
    <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{title}</div>
        {sub && <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
    </div>
);

const EmptyChart = ({ h = 200 }) => (
    <div style={{ height:h, display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'center', gap:10, color:'#cbd5e1' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="4"  y="20" width="8" height="16" rx="2" fill="currentColor" opacity=".3"/>
            <rect x="16" y="12" width="8" height="24" rx="2" fill="currentColor" opacity=".5"/>
            <rect x="28" y="6"  width="8" height="30" rx="2" fill="currentColor" opacity=".7"/>
        </svg>
        <div style={{ fontSize:12, fontWeight:500 }}>No data yet</div>
        <div style={{ fontSize:11 }}>Add jobs with financial data to see charts</div>
    </div>
);

// ══════════════════════════════════════════════════════════════════════════════
export default function JobAnalysis() {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs, setFilter: setCtxFilter } = useFilters();
    const { baseCurrencyCode } = useLookup();
    const baseCode = baseCurrencyCode || 'base currency';

    const [summary,    setSummary]    = useState(null);
    const [rows,       setRows]       = useState([]);
    const [totalRows,  setTotalRows]  = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page,       setPage]       = useState(1);
    const [pageSize,   setPageSize]   = useState(30);
    const [groupBy,    setGroupBy]    = useState('Job');
    const [loading,    setLoading]    = useState(false);
    const [activeTab,  setActiveTab]  = useState('charts');
    const [sortCol,    setSortCol]    = useState('grossProfit');
    const [sortDir,    setSortDir]    = useState('ASC');
    const [jobTypes,   setJobTypes]   = useState([]);
    const [statuses,   setStatuses]   = useState([]);

    // Refs so the jobTypeId onChange handler always sees fresh lookup data
    const jobTypesRef = useRef([]);
    const statusesRef = useRef([]);
    useEffect(() => { jobTypesRef.current = jobTypes; }, [jobTypes]);
    useEffect(() => { statusesRef.current = statuses; }, [statuses]);

    const gridRef = useRef({ pageSize:30, applied:DEFAULT_FILTERS, groupBy:'Job' });
    useEffect(() => { gridRef.current.pageSize = pageSize; }, [pageSize]);
    useEffect(() => { gridRef.current.groupBy  = groupBy;  }, [groupBy]);

    const buildDefs = useCallback((jTypes, stats, jobOptions, onTypeChange) => ({
        searchText: { label:'Search',    type:'text',   placeholder:'Job ID, name, customer…' },
        jobTypeId:  { label:'Job Type',  type:'select', options:jTypes.map(t=>({ value:t.jobTypeId, label:t.jobTypeName })), placeholder:'All Types', onChange: onTypeChange },
        ...(jobOptions.length > 0 ? {
            jobId: { label:'Job ID', type:'select', options:jobOptions.map(j=>({ value:j.jobId, label:j.jobId+(j.projectName?` – ${j.projectName}`:'') })), placeholder:'All Jobs' },
        } : {}),
        statusId:   { label:'Status',    type:'select', options:stats.map(s=>({ value:String(s.id??''), label:s.name??'' })), placeholder:'All Statuses' },
        dateFrom:   { label:'Date From', type:'date' },
        dateTo:     { label:'Date To',   type:'date' },
    }), []);

    const handleJobTypeChangeRef = useRef(null);
    const handleJobTypeChange = useCallback((typeId) => {
        setCtxFilter('job-analysis', 'jobId', '');
        if (!typeId) {
            updateFilterDefs('job-analysis', buildDefs(jobTypesRef.current, statusesRef.current, [], handleJobTypeChangeRef.current));
            return;
        }
        fetch(`${API}job/search?jobTypeId=${encodeURIComponent(typeId)}&pageSize=200`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : {})
            .then(res => {
                const jobs = res.data || [];
                updateFilterDefs('job-analysis', buildDefs(jobTypesRef.current, statusesRef.current, jobs, handleJobTypeChangeRef.current));
            })
            .catch(() => {});
    }, [setCtxFilter, updateFilterDefs, buildDefs]);
    handleJobTypeChangeRef.current = handleJobTypeChange;

    const load = useCallback((pg, ps, gb, af) => {
        setLoading(true);
        const q = new URLSearchParams({ groupBy:gb, page:pg, pageSize:ps });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.jobTypeId)  q.set('jobTypeId',  af.jobTypeId);
        if (af.jobId)      q.set('jobId',      af.jobId);
        if (af.statusId)   q.set('statusId',   af.statusId);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${API}jobanalysis?${q}`, { headers:authHeaders() })
            .then(r => r.json())
            .then(res => {
                setSummary(res.summary || null);
                setRows(res.data || []);
                setTotalRows(res.totalRows || 0);
                setTotalPages(Math.max(1, Math.ceil((res.totalRows||0)/ps)));
                setPage(pg);
            })
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetch(`${API}adminjob/jobtype`, { headers:authHeaders() })
            .then(r => r.ok?r.json():[]).then(d => setJobTypes(Array.isArray(d)?d:[])).catch(()=>{});
        fetch(`${API}Lookup/jobstatus`, { headers:authHeaders() })
            .then(r => r.ok?r.json():[]).then(d => setStatuses(Array.isArray(d)?d:[])).catch(()=>{});
    }, []);

    useEffect(() => { load(1, 30, 'Job', DEFAULT_FILTERS); }, [load]);

    useEffect(() => {
        const onApply = (vals) => {
            gridRef.current.applied = vals;
            const { pageSize:ps, groupBy:gb } = gridRef.current;
            load(1, ps, gb, vals);
        };
        registerFilters('job-analysis', buildDefs(jobTypes, statuses, [], handleJobTypeChangeRef.current), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('job-analysis');
    }, [jobTypes, statuses, load, registerFilters, unregisterFilters, buildDefs, handleJobTypeChange]);

    const changeGroup   = (gb) => { setGroupBy(gb); gridRef.current.groupBy=gb; load(1, gridRef.current.pageSize, gb, gridRef.current.applied); };
    const changePage    = (pg) => { const { pageSize:ps, groupBy:gb, applied:af } = gridRef.current; load(pg,ps,gb,af); };
    const changePageSize = (ps) => { setPageSize(ps); gridRef.current.pageSize=ps; load(1,ps,gridRef.current.groupBy,gridRef.current.applied); };
    const doSort        = (col) => { setSortCol(col); setSortDir(d => sortCol===col?(d==='ASC'?'DESC':'ASC'):'DESC'); };
    const SI            = ({ col }) => <span style={{ marginLeft:3, opacity:sortCol===col?1:.25, fontSize:10 }}>{sortCol===col?(sortDir==='ASC'?'▲':'▼'):'⇅'}</span>;

    // ── Chart data ─────────────────────────────────────────────────────────────
    const top10  = [...rows].sort((a,b)=>(b.grossProfit??0)-(a.grossProfit??0)).slice(0,10);
    const worst  = [...rows].sort((a,b)=>(a.marginPct??0)-(b.marginPct??0)).slice(0,12);
    const pieSet = [...rows].filter(r=>(r.orderValue??0)>0).slice(0,8);

    const barRevCost = top10.map(r=>({ name:lbl(r,groupBy), 'Revenue':+(r.orderValue??0), 'Cost':+(r.actualCost??0), 'Invoiced':+(r.invoiced??0) }));
    const barMargin  = worst.map(r=>({ name:lbl(r,groupBy), Margin:+((r.marginPct??0).toFixed(1)), fill:mc(r.marginPct??0) }));
    const barProfit  = top10.map(r=>({ name:lbl(r,groupBy), 'Profit':+(r.grossProfit??0), 'Budget Var':+(r.budgetVariance??0) }));
    const barRecv    = top10.map(r=>({ name:lbl(r,groupBy), 'Outstanding':+(r.receivable??0), 'Collected':+(r.received??0) }));
    const pieRev     = pieSet.map((r,i)=>({ name:lbl(r,groupBy), value:Math.abs(+(r.orderValue??0)), fill:PIE_COLORS[i%PIE_COLORS.length] }));
    const sorted     = [...rows].sort((a,b)=>{ const av=a[sortCol]??0,bv=b[sortCol]??0; return sortDir==='ASC'?(av>bv?1:-1):(av<bv?1:-1); });

    const s = summary || {};
    const overallMargin  = s.totalOrderValue>0 ? (s.totalGrossProfit/s.totalOrderValue*100) : 0;
    const collectionRate = s.totalInvoiced>0   ? (s.totalReceived/s.totalInvoiced*100)      : 0;
    const invPct         = s.totalOrderValue>0 ? (s.totalInvoiced/s.totalOrderValue*100)    : 0;
    const fromIdx = (page-1)*pageSize+1;
    const toIdx   = Math.min(page*pageSize, totalRows);

    return (
        <div style={{ padding:24, background:'#f1f5f9', minHeight:'100%' }}>

            {/* ── Header ─────────────────────────────────────────────── */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
                <div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#0f172a', letterSpacing:'-.02em' }}>Job Profitability Analysis</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>360° financial view per job — Revenue · Cost · Profit · Receivable · Budget</div>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:8,
                        background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6,
                        padding:'4px 10px', fontSize:11.5, fontWeight:600, color:'#1e40af' }}>
                        💱 All amounts in {baseCode} (base currency) — foreign-currency jobs converted at their exchange rate.
                    </div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {GROUP_OPTIONS.map(g => (
                        <button key={g.value} onClick={() => changeGroup(g.value)} style={{
                            padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s',
                            border: groupBy===g.value ? 'none' : '1px solid #cbd5e1',
                            background: groupBy===g.value ? '#0f172a' : '#fff',
                            color:      groupBy===g.value ? '#fff'    : '#475569',
                        }}>{g.label}</button>
                    ))}
                </div>
            </div>

            {/* loading strip */}
            {loading && <div style={{ height:3, borderRadius:2, marginBottom:20, overflow:'hidden', background:'#e2e8f0' }}>
                <div style={{ height:'100%', width:'60%', background:'linear-gradient(90deg,#3b82f6,#10b981)', borderRadius:2 }} />
            </div>}

            {/* ── KPI row 1 ──────────────────────────────────────────── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:14 }}>
                <MetricCard icon="💼" label="Total Order Value" accent="#3b82f6" large
                    value={fmtK(s.totalOrderValue)} sub={`${totalRows} jobs · ${fmtPct(invPct)} invoiced`} />
                <MetricCard icon="📈" label="Gross Profit" accent={mc(overallMargin)} large
                    value={fmtK(s.totalGrossProfit)} sub={`${fmtPct(overallMargin)} overall margin`} />
                <MetricCard icon="⚠️" label="Outstanding Receivable" accent="#f59e0b" large
                    value={fmtK(s.totalReceivable)} sub={`${fmtPct(collectionRate)} collection rate`} />
                <MetricCard icon="⚖️" label="Budget Variance" accent={s.totalBudgetVariance>=0?'#10b981':'#ef4444'} large
                    value={(s.totalBudgetVariance>=0?'+':'')+fmtK(s.totalBudgetVariance)}
                    sub={s.totalBudgetVariance>=0 ? 'Under budget ✓' : 'Over budget ⚠'} />
            </div>

            {/* ── KPI row 2 ──────────────────────────────────────────── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
                <MetricCard icon="🏗️" label="Actual Cost"    accent="#64748b" value={fmtK(s.totalActualCost)}  sub="Material + expenses" />
                <MetricCard icon="📄" label="Total Invoiced"  accent="#6366f1" value={fmtK(s.totalInvoiced)}   sub={`${fmtPct(invPct)} of order value`} />
                <MetricCard icon="💰" label="Cash Received"   accent="#10b981" value={fmtK(s.totalReceived)}   sub={`${fmtPct(collectionRate)} of invoiced`} />
                <MetricCard icon="📊" label="Total Budget"    accent="#8b5cf6" value={fmtK(s.totalBudget)}     sub="Approved budget total" />
            </div>

            {/* ── Tab bar ────────────────────────────────────────────── */}
            <div style={{ display:'flex', borderBottom:'2px solid #e2e8f0', marginBottom:22, gap:2 }}>
                {[['charts','📊  Charts & Visuals'],['table','📋  Detail Table']].map(([v,t])=>(
                    <button key={v} onClick={()=>setActiveTab(v)} style={{
                        padding:'10px 22px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none', background:'none',
                        color:      activeTab===v ? '#2e5fa3' : '#64748b',
                        borderBottom: activeTab===v ? '2px solid #2e5fa3' : '2px solid transparent',
                        marginBottom:'-2px', transition:'color .15s',
                    }}>{t}</button>
                ))}
                <div style={{ marginLeft:'auto', alignSelf:'center', fontSize:12, color:'#94a3b8', paddingRight:4 }}>
                    {totalRows} jobs
                </div>
            </div>

            {/* ════════════════ CHARTS TAB ════════════════ */}
            {activeTab==='charts' && (
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                    {/* Row 1 */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                        <div style={CARD}>
                            <STitle title="Revenue · Cost · Invoiced" sub="Top 10 by gross profit — identify cost overruns" />
                            {barRevCost.length===0 ? <EmptyChart h={260}/> :
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={barRevCost} barCategoryGap="28%" margin={{top:4,right:8,left:8,bottom:55}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#64748b'}} angle={-35} textAnchor="end" interval={0}/>
                                    <YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                                    <Tooltip content={<CTooltip/>} cursor={{fill:'#f8fafc'}}/>
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,paddingTop:14}}/>
                                    <Bar dataKey="Revenue"  fill="#3b82f6" radius={[4,4,0,0]}/>
                                    <Bar dataKey="Cost"     fill="#ef4444" radius={[4,4,0,0]}/>
                                    <Bar dataKey="Invoiced" fill="#10b981" radius={[4,4,0,0]}/>
                                </BarChart>
                            </ResponsiveContainer>}
                        </div>
                        <div style={CARD}>
                            <STitle title="Revenue Mix" sub="Order value distribution"/>
                            {pieRev.length===0 ? <EmptyChart h={260}/> :
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={pieRev} cx="50%" cy="42%" outerRadius={98} innerRadius={52}
                                         dataKey="value" nameKey="name" paddingAngle={2}
                                         label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false}>
                                        {pieRev.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                                    </Pie>
                                    <Tooltip content={<PTooltip/>}/>
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:10}}/>
                                </PieChart>
                            </ResponsiveContainer>}
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                        <div style={CARD}>
                            <STitle title="Gross Margin %" sub="Worst → best — red bars = loss-making jobs"/>
                            <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }}>
                                {[['≥25%','#10b981','Excellent'],['10–25%','#f59e0b','Good'],['0–10%','#f97316','Tight'],['<0%','#ef4444','Loss']].map(([r,c,l])=>(
                                    <span key={r} style={{ display:'flex',alignItems:'center',gap:5,fontSize:10.5,color:'#64748b' }}>
                                        <span style={{width:8,height:8,borderRadius:2,background:c,display:'inline-block'}}/>{r} {l}
                                    </span>
                                ))}
                            </div>
                            {barMargin.length===0 ? <EmptyChart h={200}/> :
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={barMargin} margin={{top:4,right:8,left:0,bottom:55}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#64748b'}} angle={-35} textAnchor="end" interval={0}/>
                                    <YAxis tickFormatter={v=>`${v}%`} tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                                    <Tooltip formatter={v=>[`${v}%`,'Margin']} contentStyle={{background:'#1e293b',border:'none',borderRadius:8,color:'#fff',fontSize:12}}/>
                                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2"/>
                                    <Bar dataKey="Margin" radius={[4,4,0,0]}>{barMargin.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
                                </BarChart>
                            </ResponsiveContainer>}
                        </div>
                        <div style={CARD}>
                            <STitle title="Profit vs Budget Variance" sub="Purple above zero = under budget (good)"/>
                            {barProfit.length===0 ? <EmptyChart h={220}/> :
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={barProfit} barCategoryGap="30%" margin={{top:4,right:8,left:8,bottom:55}}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#64748b'}} angle={-35} textAnchor="end" interval={0}/>
                                    <YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                                    <Tooltip content={<CTooltip/>} cursor={{fill:'#f8fafc'}}/>
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,paddingTop:14}}/>
                                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2"/>
                                    <Bar dataKey="Profit"     fill="#10b981" radius={[4,4,0,0]}/>
                                    <Bar dataKey="Budget Var" fill="#8b5cf6" radius={[4,4,0,0]}/>
                                </BarChart>
                            </ResponsiveContainer>}
                        </div>
                    </div>

                    {/* Row 3 */}
                    <div style={CARD}>
                        <STitle title="Receivables vs Cash Collected" sub="Yellow = still outstanding · Teal = already received — spot collection risk"/>
                        {barRecv.length===0 ? <EmptyChart h={180}/> :
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={barRecv} barCategoryGap="28%" margin={{top:4,right:20,left:8,bottom:55}}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                                <XAxis dataKey="name" tick={{fontSize:10,fill:'#64748b'}} angle={-35} textAnchor="end" interval={0}/>
                                <YAxis tickFormatter={fmtK} tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                                <Tooltip content={<CTooltip/>} cursor={{fill:'#f8fafc'}}/>
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11,paddingTop:14}}/>
                                <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4,4,0,0]}/>
                                <Bar dataKey="Collected"   fill="#14b8a6" radius={[4,4,0,0]}/>
                            </BarChart>
                        </ResponsiveContainer>}
                    </div>
                </div>
            )}

            {/* ════════════════ TABLE TAB ════════════════ */}
            {activeTab==='table' && (
                <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <span style={{ fontSize:12, color:'#94a3b8' }}>{totalRows>0?`${fromIdx}–${toIdx} of ${totalRows}`:'0 results'}</span>
                        <select style={{ padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, background:'#fff' }}
                            value={pageSize} onChange={e=>changePageSize(Number(e.target.value))}>
                            {PAGE_SIZES.map(s=><option key={s} value={s}>{s} / page</option>)}
                        </select>
                    </div>
                    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
                        <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                                <thead>
                                    <tr style={{ background:'#f8fafc' }}>
                                        {groupBy==='Job'&&<th style={TH} onClick={()=>doSort('jobId')}>Job <SI col="jobId"/></th>}
                                        <th style={TH}>{groupBy==='Job'?'Project':groupBy==='JobType'?'Type':groupBy==='Customer'?'Customer':'Status'}</th>
                                        {groupBy==='Job'&&<th style={TH}>Customer</th>}
                                        {groupBy==='Job'&&<th style={TH}>Status</th>}
                                        {groupBy!=='Job'&&<th style={{...TH,textAlign:'right'}} onClick={()=>doSort('jobCount')}>Jobs <SI col="jobCount"/></th>}
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('orderValue')}>Order Value <SI col="orderValue"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('invoiced')}>Invoiced <SI col="invoiced"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('receivable')}>Receivable <SI col="receivable"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('actualCost')}>Cost <SI col="actualCost"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('totalBudget')}>Budget <SI col="totalBudget"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('budgetVariance')}>Var <SI col="budgetVariance"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('grossProfit')}>Profit <SI col="grossProfit"/></th>
                                        <th style={{...TH,textAlign:'right'}} onClick={()=>doSort('marginPct')}>Margin <SI col="marginPct"/></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.length===0?(
                                        <tr><td colSpan={13} style={{padding:40,textAlign:'center',color:'#94a3b8'}}>No data.</td></tr>
                                    ):sorted.map((r,i)=>{
                                        const profit=r.grossProfit??0, margin=r.marginPct??0, bv=r.budgetVariance??0, recv=r.receivable??0;
                                        const gl=lbl(r);
                                        return (
                                            <tr key={r.jobId||r.jobTypeId||r.customerId||r.jobStatusId||i}
                                                style={{ borderBottom:'1px solid #f1f5f9', background:r.isClosedStatus?'#f8fafc':'#fff',
                                                         cursor:groupBy==='Job'?'pointer':'default' }}
                                                onClick={()=>groupBy==='Job'&&navigate(`/jobs/${r.jobId}`)}>
                                                {groupBy==='Job'&&<td style={{...TD,fontWeight:700,color:'#2e5fa3',whiteSpace:'nowrap',fontSize:12}}>{r.jobId}</td>}
                                                <td style={{...TD,fontWeight:500,color:'#0f172a',maxWidth:200}}>
                                                    <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={gl}>{gl||'—'}</div>
                                                    {groupBy==='Job'&&r.jobStageName&&<div style={{fontSize:10,color:'#94a3b8',marginTop:1}}>{r.jobStageName}</div>}
                                                </td>
                                                {groupBy==='Job'&&<td style={{...TD,fontSize:11,color:'#64748b'}}>{r.customerName||'—'}</td>}
                                                {groupBy==='Job'&&<td style={TD}><span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:6,background:r.isClosedStatus?'#f1f5f9':'#dbeafe',color:r.isClosedStatus?'#64748b':'#1e40af'}}>{r.jobStatusName||'—'}</span></td>}
                                                {groupBy!=='Job'&&<td style={{...TD,textAlign:'right',fontWeight:700}}>{r.jobCount}</td>}
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace'}}>{fmt(r.orderValue)}</td>
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace'}}>{fmt(r.invoiced)}</td>
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace',color:recv>0?'#d97706':'#94a3b8',fontWeight:recv>0?600:400}}>{fmt(recv)}</td>
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace',color:'#64748b'}}>{fmt(r.actualCost)}</td>
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace',color:'#8b5cf6'}}>{fmt(r.totalBudget)}</td>
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace',fontWeight:600,color:bv>=0?'#10b981':'#ef4444'}}>{bv>=0?'+':''}{fmt(bv)}</td>
                                                <td style={{...TD,textAlign:'right',fontFamily:'monospace',fontWeight:700,color:mc(margin)}}>{fmt(profit)}</td>
                                                <td style={{...TD,textAlign:'right'}}>
                                                    <span style={{display:'inline-block',padding:'2px 8px',borderRadius:6,fontSize:11,fontWeight:700,background:mcb(margin),color:mc(margin)}}>{fmtPct(margin)}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',borderTop:'1px solid #f1f5f9',fontSize:12,color:'#64748b'}}>
                            <span>{totalRows>0?`${fromIdx}–${toIdx} of ${totalRows} jobs`:'0 jobs'}</span>
                            <div style={{display:'flex',gap:6}}>
                                {[[1,'«'],[page-1,'‹'],[page+1,'›'],[totalPages,'»']].map(([pg,t],i)=>(
                                    <button key={i} style={PGB} onClick={()=>changePage(pg)} disabled={pg<1||pg>totalPages}>{t}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const CARD = { background:'#fff', borderRadius:14, padding:'22px 24px', border:'1px solid #e2e8f0', boxShadow:'0 1px 4px rgba(0,0,0,.04)' };
const TH   = { padding:'10px 12px', textAlign:'left', fontWeight:600, fontSize:11, color:'#64748b', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none', background:'#f8fafc' };
const TD   = { padding:'10px 12px', verticalAlign:'middle' };
const PGB  = { padding:'4px 9px', border:'1px solid #e2e8f0', borderRadius:6, background:'#fff', cursor:'pointer', fontSize:12, color:'#475569' };
