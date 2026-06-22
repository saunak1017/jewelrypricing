import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { Plus, Upload, Save, Trash2, Copy, RefreshCw, Search, Download, AlertTriangle, History, Gem, Calculator, Eye } from 'lucide-react';
import './styles.css';

const blankStyle = {
  factory: '', vendor_style_no: '', shivani_style_no: '', jewelry_category: '', metal_kt: '',
  diamond_description: '', diamond_quality: '', stone_count: 0, cttw: 0,
  net_wt_gms: 0, gold_loss_pct: 0, current_gold_lock: 0, gold_per_gram: 0,
  merchandiser: '', image_filename: '', image_data_url: '', model_filename: '', model_data_url: '', model_mime_type: '', diamond_handling: 0, total_labor: 0, duty_pct: 7, tariff_pct: 11, pendant_chain: 0, earring_backs: 0, cad_fees: 0, margin_pct: 45, selling_price: 0, notes: ''
};
const blankComponent = () => ({ id: crypto.randomUUID(), shape: '', quality: '', color_clarity: '', each_weight: '', quantity: '', pricing_mode: 'auto', manual_unitcost: '', manual_total: '', notes: '' });

function money(v) { return Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' }); }
function num(v, digits = 2) { return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: digits }); }
function date(v) { return v ? new Date(v).toLocaleString() : '—'; }

function App() {
  const [password, setPassword] = useState(localStorage.getItem('jc_admin_password') || '');
  const [authed, setAuthed] = useState(!!localStorage.getItem('jc_admin_password'));
  const [view, setView] = useState('dashboard');
  const [styles, setStyles] = useState([]);
  const [activePricing, setActivePricing] = useState(null);
  const [pricingUploads, setPricingUploads] = useState([]);
  const [search, setSearch] = useState('');
  const [currentId, setCurrentId] = useState(null);
  const [style, setStyle] = useState(blankStyle);
  const [components, setComponents] = useState([blankComponent()]);
  const [calc, setCalc] = useState(null);
  const [history, setHistory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const headers = useMemo(() => ({ Authorization: `Bearer ${password}`, 'Content-Type': 'application/json' }), [password]);

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { Authorization: `Bearer ${password}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem('jc_admin_password');
      setAuthed(false);
      setNotice('Session expired or password is incorrect. Please log in again.');
    }
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  async function login(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/init', { method: 'POST', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('jc_admin_password', password);
      setAuthed(true);
      await loadDashboard();
    } catch (err) {
      setNotice(err.message || 'Login failed');
    } finally { setLoading(false); }
  }

  async function loadDashboard(q = search) {
    setLoading(true);
    try {
      const data = await api(`/api/admin/styles${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setStyles(data.styles || []);
      setActivePricing(data.active_pricing_upload || null);
      const pricing = await api('/api/admin/pricing');
      setPricingUploads(pricing.uploads || []);
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  async function openStyle(id) {
    setLoading(true); setCurrentId(id);
    try {
      if (id === 'new') {
        setStyle(blankStyle); setComponents([blankComponent()]); setCalc(null); setHistory([]); setOrders([]); setView('editor');
      } else {
        const data = await api(`/api/admin/styles/${id}`);
        setStyle(data.style); setComponents(data.components?.length ? data.components : [blankComponent()]); setCalc(data.calculation); setHistory(data.history || []); setOrders(data.orders || []); setView('detail');
      }
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  async function saveStyle() {
    setLoading(true);
    try {
      const data = await api(`/api/admin/styles/${currentId || 'new'}`, { method: 'POST', body: JSON.stringify({ style, components }) });
      setCurrentId(data.id); setStyle(data.style); setComponents(data.components); setCalc(data.calculation); setNotice('Saved.');
      await loadDashboard();
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }


  async function addOrder(order) {
    if (!currentId || currentId === 'new') { setNotice('Save this style before logging orders.'); return; }
    setLoading(true);
    try {
      const data = await api(`/api/admin/styles/${currentId}/orders`, { method: 'POST', body: JSON.stringify(order) });
      setOrders([data.order, ...orders]);
      setNotice('Order logged.');
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  function editCurrentStyle() { setView('editor'); }
  async function archiveStyle(id) {
    if (!confirm('Archive this style?')) return;
    setLoading(true);
    try { await api(`/api/admin/styles/${id}`, { method: 'DELETE' }); await loadDashboard(); }
    catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  async function duplicateStyle(id) {
    setLoading(true);
    try { const data = await api(`/api/admin/styles/${id}/duplicate`, { method: 'POST' }); await loadDashboard(); await openStyle(data.id); }
    catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  async function uploadPricing(file) {
    if (!file) return;
    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const cleaned = rows.map(r => ({
        interchange_shape: r.interchange_shape ?? r.Interchange_Shape ?? r.Shape ?? r.shape ?? '',
        Quality: r.Quality ?? r.quality ?? '',
        'Color/Clarity': r['Color/Clarity'] ?? r.ColorClarity ?? r.color_clarity ?? '',
        interchange_minweight: Number(r.interchange_minweight ?? r.MinWeight ?? r.min ?? 0),
        interchange_maxweight: Number(r.interchange_maxweight ?? r.MaxWeight ?? r.max ?? 0),
        size: r.size ?? r.Size ?? '',
        interchange_unitcost: Number(String(r.interchange_unitcost ?? r.UnitCost ?? r['$/ct'] ?? 0).replace(/[$,]/g, ''))
      })).filter(r => r.interchange_shape && r.Quality && r.interchange_maxweight !== 0);
      if (!cleaned.length) throw new Error('No valid rows found. Check that the first sheet has the expected diamond pricing headers.');
      const ok = confirm(`Upload ${cleaned.length} pricing rows and make this the active master list? This will snapshot current style costs first.`);
      if (!ok) return;
      await api('/api/admin/pricing', { method: 'POST', body: JSON.stringify({ filename: file.name, rows: cleaned }) });
      setNotice(`Uploaded ${cleaned.length} pricing rows and made them active.`);
      await loadDashboard();
      if (currentId && currentId !== 'new') await openStyle(currentId);
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  async function exportCurrent() {
    setLoading(true);
    try {
      const data = await api('/api/admin/export');
      const ws = XLSX.utils.json_to_sheet(data.rows || []);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Current Costing');
      XLSX.writeFile(wb, `jewelry-current-costing-${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (err) { setNotice(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (authed) loadDashboard(); }, [authed]);

  if (!authed) return <Login password={password} setPassword={setPassword} login={login} loading={loading} notice={notice} />;

  return <div className="app">
    <aside>
      <div className="brand"><Gem size={26}/><div><b>Jewelry Costing</b><span>Dynamic style calculator</span></div></div>
      <button className={view==='dashboard'?'active':''} onClick={() => { setView('dashboard'); loadDashboard(); }}><Calculator size={18}/> Dashboard</button>
      <button onClick={() => openStyle('new')}><Plus size={18}/> New Style</button>
      <label className="uploadBtn"><Upload size={18}/> Upload Diamond Pricing<input type="file" accept=".xlsx,.xls,.csv" onChange={e => uploadPricing(e.target.files[0])}/></label>
      <button onClick={exportCurrent}><Download size={18}/> Export Current Excel</button>
      <div className="sideCard">
        <span>Active pricing</span>
        <b>{activePricing ? date(activePricing.uploaded_at) : 'No file uploaded'}</b>
        {activePricing && <small>{activePricing.filename} · {activePricing.row_count} rows</small>}
      </div>
      <button className="ghost" onClick={() => { localStorage.removeItem('jc_admin_password'); location.reload(); }}>Log out</button>
    </aside>

    <main>
      {notice && <div className="notice" onClick={() => setNotice('')}>{notice}</div>}
      {loading && <div className="loading"><RefreshCw className="spin" size={16}/> Working...</div>}
      {view === 'dashboard' ? <Dashboard styles={styles} search={search} setSearch={setSearch} loadDashboard={loadDashboard} openStyle={openStyle} archiveStyle={archiveStyle} duplicateStyle={duplicateStyle} pricingUploads={pricingUploads}/> :
        view === 'detail' ? <StyleDetail style={style} components={components} calc={calc} orders={orders} addOrder={addOrder} editStyle={editCurrentStyle} goBack={() => { setView('dashboard'); loadDashboard(); }} history={history}/> :
        <Editor style={style} setStyle={setStyle} components={components} setComponents={setComponents} calc={calc} saveStyle={saveStyle} goBack={() => { currentId && currentId !== 'new' ? setView('detail') : setView('dashboard'); loadDashboard(); }} history={history}/>
      }
    </main>
  </div>;
}

function Login({ password, setPassword, login, loading, notice }) {
  return <div className="loginPage"><form className="loginBox" onSubmit={login}>
    <Gem size={42}/><h1>Jewelry Costing</h1><p>Enter the admin password to continue.</p>
    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password" autoFocus />
    <button disabled={loading}>{loading ? 'Opening...' : 'Open Admin'}</button>
    {notice && <div className="error">{notice}</div>}
    <small>Default is admin123 until you set ADMIN_PASSWORD in Cloudflare Pages environment variables.</small>
  </form></div>;
}

function Dashboard({ styles, search, setSearch, loadDashboard, openStyle, archiveStyle, duplicateStyle, pricingUploads }) {
  return <section>
    <div className="topbar"><div><h1>Styles</h1><p>Main costs always recalculate from the active master diamond pricing file.</p></div><button onClick={() => openStyle('new')}><Plus size={18}/> New Style</button></div>
    <div className="search"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadDashboard()} placeholder="Search style, vendor, factory, category..."/><button onClick={() => loadDashboard()}>Search</button></div>
    <div className="tableWrap"><table><thead><tr><th>Style</th><th>Vendor</th><th>Category</th><th>Metal</th><th>CTTW</th><th>Diamond</th><th>Export</th><th>Import</th><th>SP</th><th>Warnings</th><th></th></tr></thead><tbody>
      {styles.map(s => <tr key={s.id}><td><button className="linkBtn" onClick={() => openStyle(s.id)}>{s.shivani_style_no || 'Untitled'}</button><small>{s.factory}</small></td><td>{s.vendor_style_no}</td><td>{s.jewelry_category}</td><td>{s.metal_kt}</td><td>{num(s.current?.cttw)}</td><td>{money(s.current?.total_diamond_cost)}</td><td>{money(s.current?.total_export_cost)}</td><td><b>{money(s.current?.total_import_cost)}</b>{Number(s.current?.findings_total || 0) > 0 && <small>Including findings/fees</small>}</td><td><b>{money(s.selling_price)}</b>{Number(s.current?.findings_total || 0) > 0 && <small>Including findings/fees</small>}</td><td>{s.missing_price_count ? <span className="warn"><AlertTriangle size={15}/> {s.missing_price_count} missing</span> : '—'}</td><td className="actions"><button onClick={() => openStyle(s.id)}><Eye size={15}/> View</button><button onClick={() => duplicateStyle(s.id)}><Copy size={15}/></button><button onClick={() => archiveStyle(s.id)}><Trash2 size={15}/></button></td></tr>)}
      {!styles.length && <tr><td colSpan="11" className="empty">No styles yet. Create one manually to start.</td></tr>}
    </tbody></table></div>
    <h2>Pricing Uploads</h2><div className="cards">{pricingUploads.map(p => <div className="miniCard" key={p.id}><b>{p.active ? 'Active' : 'Previous'}</b><span>{p.filename}</span><small>{date(p.uploaded_at)} · {p.row_count} rows</small></div>)}</div>
  </section>;
}


function StyleDetail({ style, components, calc, orders, addOrder, editStyle, goBack, history }) {
  const [order, setOrder] = useState({ customer: '', order_date: new Date().toISOString().slice(0,10), quantity: '', price: '', buying_group: '', memo_or_asset: 'Memo' });
  const updateOrder = (k, v) => setOrder({ ...order, [k]: v });
  const submitOrder = async (e) => {
    e.preventDefault();
    await addOrder(order);
    setOrder({ customer: '', order_date: new Date().toISOString().slice(0,10), quantity: '', price: '', buying_group: '', memo_or_asset: 'Memo' });
  };
  const totals = calc?.totals || {};
  return <section>
    <div className="topbar"><div><h1>{style.shivani_style_no || 'Untitled Style'}</h1><p>Style details, saved assets, and customer order tracking.</p></div><div className="row"><button className="secondary" onClick={goBack}>Back</button><button onClick={editStyle}>Edit Style</button></div></div>
    <div className="editorGrid">
      <div className="panel"><h2>Style Details</h2>{style.image_data_url && <img className="stylePhoto" src={style.image_data_url} alt={style.image_filename || 'Style'} />}<div className="detailGrid"><Detail label="Vendor" value={style.factory}/><Detail label="Vendor Style No" value={style.vendor_style_no}/><Detail label="Category" value={style.jewelry_category}/><Detail label="Metal" value={style.metal_kt}/><Detail label="Diamond Quality" value={style.diamond_quality}/><Detail label="Merchandiser" value={style.merchandiser}/><Detail label="Description" value={style.diamond_description}/><Detail label="Notes" value={style.notes}/><Detail label="Picture" value={style.image_filename}/><Detail label="CAD / 3D File" value={style.model_filename}/></div></div>
      <div className="panel sticky"><h2>Current Cost Summary</h2><Summary label="Diamond Cost" value={totals.total_diamond_cost}/><Summary label="Export Cost" value={totals.total_export_cost} bold/><Summary label="Import Cost" value={totals.total_import_cost} big/><Summary label="Selling Price" value={style.selling_price}/></div>
    </div>
    <div className="panel"><div className="sectionHead"><h2>Log Order</h2></div><form onSubmit={submitOrder} className="orderForm"><Field label="Customer" value={order.customer} onChange={v=>updateOrder('customer', v)}/><Field type="date" label="Order Date" value={order.order_date} onChange={v=>updateOrder('order_date', v)}/><Field label="Quantity" value={order.quantity} onChange={v=>updateOrder('quantity', v)}/><Field label="Price $" value={order.price} onChange={v=>updateOrder('price', v)}/><SelectField label="Buying Group" value={order.buying_group} onChange={v=>updateOrder('buying_group', v)} options={['', 'RJO', 'LJG', 'CBG', 'AGS', 'Other']}/><SelectField label="Memo or Asset" value={order.memo_or_asset} onChange={v=>updateOrder('memo_or_asset', v)} options={['Memo', 'Asset']}/><button type="submit"><Plus size={16}/> Log Order</button></form></div>
    <div className="panel"><h2>Orders</h2><table><thead><tr><th>Customer</th><th>Order Date</th><th>Quantity</th><th>Price</th><th>Buying Group</th><th>Memo/Asset</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td>{o.customer}</td><td>{o.order_date || '—'}</td><td>{o.quantity}</td><td>{o.price}</td><td>{o.buying_group || '—'}</td><td>{o.memo_or_asset}</td></tr>)}{!orders.length && <tr><td colSpan="6" className="empty">No orders logged yet.</td></tr>}</tbody></table></div>
    <div className="panel"><h2>Diamond Components</h2><table><thead><tr><th>Shape</th><th>Quality</th><th>Each Wt</th><th>Qty</th><th>Total</th></tr></thead><tbody>{components.map((c, i) => <tr key={c.id || i}><td>{c.shape}</td><td>{c.quality}</td><td>{c.each_weight}</td><td>{c.quantity}</td><td>{money(calc?.components?.[i]?.line_total || 0)}</td></tr>)}</tbody></table></div>
    <div className="panel"><h2><History size={18}/> Historical Pricing</h2><table><thead><tr><th>Date</th><th>Reason</th><th>Export</th><th>Duty</th><th>Tariff</th><th>Import</th></tr></thead><tbody>{history.map(h => <tr key={h.id}><td>{date(h.snapshot_at)}</td><td>{h.reason}</td><td>{money(h.total_export_cost)}</td><td>{money(h.duty)}</td><td>{money(h.tariff)}</td><td><b>{money(h.total_import_cost)}</b></td></tr>)}{!history.length && <tr><td colSpan="6" className="empty">No history yet.</td></tr>}</tbody></table></div>
  </section>;
}

function Detail({ label, value }) { return <div className="detail"><span>{label}</span><b>{value || '—'}</b></div>; }

function Editor({ style, setStyle, components, setComponents, calc, saveStyle, goBack, history }) {
  const update = (k, v) => setStyle({ ...style, [k]: v });
  const updateComp = (idx, k, v) => setComponents(components.map((c, i) => i === idx ? { ...c, [k]: v } : c));
  const localCalc = useMemo(() => {
    const diamond = components.reduce((sum, c) => {
      const totalCtw = Number(c.each_weight || 0) * Number(c.quantity || 0);
      if (c.pricing_mode === 'manual_total') return sum + Number(c.manual_total || 0);
      if (c.pricing_mode === 'manual_unit') return sum + totalCtw * Number(c.manual_unitcost || 0);
      return sum;
    }, 0);
    const metal = Number(style.net_wt_gms || 0) * Number(style.gold_per_gram || 0);
    const exportCost = metal + diamond + Number(style.diamond_handling || 0) + Number(style.total_labor || 0);
    const duty = exportCost * (Number(style.duty_pct || 0) / 100);
    const tariff = (exportCost + duty) * (Number(style.tariff_pct || 0) / 100);
    const findings = Number(style.pendant_chain || 0) + Number(style.earring_backs || 0) + Number(style.cad_fees || 0);
    const importCost = exportCost + duty + tariff + findings;
    const marginPct = Number(style.margin_pct || 0);
    const suggestedSp = marginPct < 100 ? importCost / (1 - (marginPct / 100)) : 0;
    return { metal, diamond, exportCost, duty, tariff, findings, importCost, suggestedSp };
  }, [style, components]);
  const totals = calc?.totals || localCalc;
  const findingsTotal = Number((totals.findings_total ?? totals.findings) || 0);
  return <section>
    <div className="topbar"><div><h1>{style.shivani_style_no || 'New Style'}</h1><p>Save to calculate auto diamond lines from active pricing.</p></div><div className="row"><button className="secondary" onClick={goBack}>Back</button><button onClick={saveStyle}><Save size={18}/> Save & Recalculate</button></div></div>
    <div className="editorGrid">
      <div className="panel"><h2>Style Info</h2><div className="grid2">
        <Field label="Vendor Name" value={style.factory} onChange={v=>update('factory', v)}/><Field label="Vendor Style No" value={style.vendor_style_no} onChange={v=>update('vendor_style_no', v)}/>
        <Field label="Shivani Style Number" value={style.shivani_style_no} onChange={v=>update('shivani_style_no', v)}/><Field label="Jewelry Category" value={style.jewelry_category} onChange={v=>update('jewelry_category', v)}/>
        <Field label="Metal KT" value={style.metal_kt} onChange={v=>update('metal_kt', v)}/><Field label="Diamond Quality" value={style.diamond_quality} onChange={v=>update('diamond_quality', v)}/>
        <Field label="Merchandiser" value={style.merchandiser} onChange={v=>update('merchandiser', v)}/>
      </div><Field label="Diamond Description" value={style.diamond_description} onChange={v=>update('diamond_description', v)}/><Field label="Notes" value={style.notes} onChange={v=>update('notes', v)} textarea /><div className="grid2"><FileField label="Style Picture" accept="image/*" filename={style.image_filename} onFile={(file, dataUrl) => setStyle({ ...style, image_filename: file.name, image_data_url: dataUrl })}/><FileField label="CAD / 3D File" accept=".stl,.3dm,.glb" filename={style.model_filename} onFile={(file, dataUrl) => setStyle({ ...style, model_filename: file.name, model_data_url: dataUrl, model_mime_type: file.type || 'application/octet-stream' })}/></div></div>

      <div className="panel sticky"><h2>Current Cost Summary</h2><Summary label="Metal Cost" value={totals.total_metal_cost ?? totals.metal}/><Summary label="Diamond Cost" value={totals.total_diamond_cost ?? totals.diamond}/><Summary label="Handling" value={style.diamond_handling}/><Summary label="Labor" value={style.total_labor}/><hr/><Summary label="Export Cost" value={totals.total_export_cost ?? totals.exportCost} bold/><Summary label={`Duty (${style.duty_pct || 0}%)`} value={totals.duty}/><Summary label={`Tariff (${style.tariff_pct || 0}%)`} value={totals.tariff}/><Summary label="Findings / Other Fees" value={totals.findings_total ?? totals.findings}/><Summary label="Import Cost" value={totals.total_import_cost ?? totals.importCost} big/>{findingsTotal > 0 && <small>Including chain, earring backs, and/or CAD fees.</small>}<small>Gold loss % is stored for reference only and is not included in metal cost.</small></div>
    </div>

    <div className="panel"><h2>Gold / Metal</h2><div className="grid4"><Field type="number" label="Net wt. in gms" value={style.net_wt_gms} onChange={v=>update('net_wt_gms', v)}/><Field type="number" label="Gold Loss % (reference only)" value={style.gold_loss_pct} onChange={v=>update('gold_loss_pct', v)}/><Field type="number" label="Current Gold Lock" value={style.current_gold_lock} onChange={v=>update('current_gold_lock', v)}/><Field type="number" label="Gold per Gram $" value={style.gold_per_gram} onChange={v=>update('gold_per_gram', v)}/></div></div>

    <div className="panel"><div className="sectionHead"><h2>Diamond Components</h2><button onClick={() => setComponents([...components, blankComponent()])}><Plus size={16}/> Add Stone Line</button></div><div className="componentTable"><table><thead><tr><th>Shape</th><th>Quality</th><th>Each Wt</th><th>Qty</th><th>Mode</th><th>Manual $/ct</th><th>Manual Total</th><th>Resolved $/ct</th><th>Total</th><th></th></tr></thead><tbody>{components.map((c, i) => {
      const resolved = calc?.components?.[i];
      return <tr key={c.id || i}><td><input value={c.shape || ''} onChange={e=>updateComp(i,'shape',e.target.value)} placeholder="MQ"/></td><td><input value={c.quality || ''} onChange={e=>updateComp(i,'quality',e.target.value)} placeholder="E"/></td><td><input type="number" step="0.001" value={c.each_weight || ''} onChange={e=>updateComp(i,'each_weight',e.target.value)}/></td><td><input type="number" step="1" value={c.quantity || ''} onChange={e=>updateComp(i,'quantity',e.target.value)}/></td><td><select value={c.pricing_mode || 'auto'} onChange={e=>updateComp(i,'pricing_mode',e.target.value)}><option value="auto">Auto</option><option value="manual_unit">Manual $/ct</option><option value="manual_total">Manual total</option></select></td><td><input type="number" value={c.manual_unitcost || ''} onChange={e=>updateComp(i,'manual_unitcost',e.target.value)}/></td><td><input type="number" value={c.manual_total || ''} onChange={e=>updateComp(i,'manual_total',e.target.value)}/></td><td>{resolved?.match_status === 'missing_price' ? <span className="warn">Missing</span> : money(resolved?.resolved_unitcost || 0)}</td><td>{money(resolved?.line_total || 0)}</td><td><button className="icon" onClick={()=>setComponents(components.filter((_,x)=>x!==i))}><Trash2 size={15}/></button></td></tr>})}</tbody></table></div></div>

    <div className="panel"><h2>Other Costs / Import</h2><div className="grid4"><Field type="number" label="Diamond Handling" value={style.diamond_handling} onChange={v=>update('diamond_handling', v)}/><Field type="number" label="Total Labor" value={style.total_labor} onChange={v=>update('total_labor', v)}/><Field type="number" label="Duty %" value={style.duty_pct} onChange={v=>update('duty_pct', v)}/><Field type="number" label="Tariff %" value={style.tariff_pct} onChange={v=>update('tariff_pct', v)}/></div><h2>Findings / Other Fees</h2><div className="grid4"><Field type="number" label="Pendant Chain" value={style.pendant_chain} onChange={v=>update('pendant_chain', v)}/><Field type="number" label="Earring Backs" value={style.earring_backs} onChange={v=>update('earring_backs', v)}/><Field type="number" label="CAD Fees" value={style.cad_fees} onChange={v=>update('cad_fees', v)}/></div></div>

    <div className="panel"><h2>Margin Calculator</h2><div className="grid4"><Field type="number" label="Margin %" value={style.margin_pct} onChange={v=>update('margin_pct', v)}/><Summary label="Suggested SP" value={totals.suggestedSp ?? localCalc.suggestedSp}/><Field type="number" label="SP" value={style.selling_price} onChange={v=>update('selling_price', v)}/></div>{findingsTotal > 0 && <small>SP includes any chain, earring backs, and/or CAD fees included above.</small>}</div>

    <div className="panel"><h2><History size={18}/> Historical Pricing</h2><table><thead><tr><th>Date</th><th>Reason</th><th>Export</th><th>Duty</th><th>Tariff</th><th>Import</th></tr></thead><tbody>{history.map(h => <tr key={h.id}><td>{date(h.snapshot_at)}</td><td>{h.reason}</td><td>{money(h.total_export_cost)}</td><td>{money(h.duty)}</td><td>{money(h.tariff)}</td><td><b>{money(h.total_import_cost)}</b></td></tr>)}{!history.length && <tr><td colSpan="6" className="empty">No history yet. History is created when a new diamond pricing file is uploaded.</td></tr>}</tbody></table></div>
  </section>;
}

function SelectField({ label, value, onChange, options }) { return <label className="field"><span>{label}</span><select value={value || ''} onChange={e=>onChange(e.target.value)}>{options.map(o => <option key={o || 'blank'} value={o}>{o || 'Not specified'}</option>)}</select></label>; }
function FileField({ label, accept, filename, onFile }) { return <label className="field"><span>{label}</span><input type="file" accept={accept} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => onFile(file, reader.result); reader.readAsDataURL(file); }}/>{filename && <small>Saved: {filename}</small>}</label>; }
function Field({ label, value, onChange, type='text', textarea=false }) { return <label className="field"><span>{label}</span>{textarea ? <textarea value={value || ''} onChange={e=>onChange(e.target.value)}/> : <input type={type} step="any" value={value ?? ''} onChange={e=>onChange(e.target.value)}/>}</label>; }
function Summary({ label, value, bold, big }) { return <div className={`summary ${bold?'bold':''} ${big?'big':''}`}><span>{label}</span><b>{money(value)}</b></div>; }

createRoot(document.getElementById('root')).render(<App />);
