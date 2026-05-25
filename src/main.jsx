import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { Plus, Upload, Save, Trash2, Copy, RefreshCw, Search, Download, AlertTriangle, History, Gem, Calculator } from 'lucide-react';
import './styles.css';

const blankStyle = {
  factory: '', vendor_style_no: '', shivani_style_no: '', jewelry_category: '', metal_kt: '',
  diamond_description: '', diamond_quality: '', stone_count: 0, cttw: 0,
  net_wt_gms: 0, gold_loss_pct: 0, current_gold_lock: 0, gold_per_gram: 0,
  diamond_handling: 0, total_labor: 0, duty_pct: 7, tariff_pct: 11, notes: ''
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
        setStyle(blankStyle); setComponents([blankComponent()]); setCalc(null); setHistory([]); setView('editor');
      } else {
        const data = await api(`/api/admin/styles/${id}`);
        setStyle(data.style); setComponents(data.components?.length ? data.components : [blankComponent()]); setCalc(data.calculation); setHistory(data.history || []); setView('editor');
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
        <Editor style={style} setStyle={setStyle} components={components} setComponents={setComponents} calc={calc} saveStyle={saveStyle} goBack={() => { setView('dashboard'); loadDashboard(); }} history={history}/>
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
    <div className="tableWrap"><table><thead><tr><th>Style</th><th>Vendor</th><th>Category</th><th>Metal</th><th>CTTW</th><th>Diamond</th><th>Export</th><th>Import</th><th>Warnings</th><th></th></tr></thead><tbody>
      {styles.map(s => <tr key={s.id}><td><b>{s.shivani_style_no || 'Untitled'}</b><small>{s.factory}</small></td><td>{s.vendor_style_no}</td><td>{s.jewelry_category}</td><td>{s.metal_kt}</td><td>{num(s.current?.cttw)}</td><td>{money(s.current?.total_diamond_cost)}</td><td>{money(s.current?.total_export_cost)}</td><td><b>{money(s.current?.total_import_cost)}</b></td><td>{s.missing_price_count ? <span className="warn"><AlertTriangle size={15}/> {s.missing_price_count} missing</span> : '—'}</td><td className="actions"><button onClick={() => openStyle(s.id)}>Edit</button><button onClick={() => duplicateStyle(s.id)}><Copy size={15}/></button><button onClick={() => archiveStyle(s.id)}><Trash2 size={15}/></button></td></tr>)}
      {!styles.length && <tr><td colSpan="10" className="empty">No styles yet. Create one manually to start.</td></tr>}
    </tbody></table></div>
    <h2>Pricing Uploads</h2><div className="cards">{pricingUploads.map(p => <div className="miniCard" key={p.id}><b>{p.active ? 'Active' : 'Previous'}</b><span>{p.filename}</span><small>{date(p.uploaded_at)} · {p.row_count} rows</small></div>)}</div>
  </section>;
}

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
    return { metal, diamond, exportCost, duty, tariff, importCost: exportCost + duty + tariff };
  }, [style, components]);
  const totals = calc?.totals || localCalc;
  return <section>
    <div className="topbar"><div><h1>{style.shivani_style_no || 'New Style'}</h1><p>Save to calculate auto diamond lines from active pricing.</p></div><div className="row"><button className="secondary" onClick={goBack}>Back</button><button onClick={saveStyle}><Save size={18}/> Save & Recalculate</button></div></div>
    <div className="editorGrid">
      <div className="panel"><h2>Style Info</h2><div className="grid2">
        <Field label="Factory" value={style.factory} onChange={v=>update('factory', v)}/><Field label="Vendor Style No" value={style.vendor_style_no} onChange={v=>update('vendor_style_no', v)}/>
        <Field label="Shivani Style#" value={style.shivani_style_no} onChange={v=>update('shivani_style_no', v)}/><Field label="Jewelry Category" value={style.jewelry_category} onChange={v=>update('jewelry_category', v)}/>
        <Field label="Metal KT" value={style.metal_kt} onChange={v=>update('metal_kt', v)}/><Field label="Diamond Quality" value={style.diamond_quality} onChange={v=>update('diamond_quality', v)}/>
      </div><Field label="Diamond Description" value={style.diamond_description} onChange={v=>update('diamond_description', v)}/><Field label="Notes" value={style.notes} onChange={v=>update('notes', v)} textarea /></div>

      <div className="panel sticky"><h2>Current Cost Summary</h2><Summary label="Metal Cost" value={totals.total_metal_cost ?? totals.metal}/><Summary label="Diamond Cost" value={totals.total_diamond_cost ?? totals.diamond}/><Summary label="Handling" value={style.diamond_handling}/><Summary label="Labor" value={style.total_labor}/><hr/><Summary label="Export Cost" value={totals.total_export_cost ?? totals.exportCost} bold/><Summary label={`Duty (${style.duty_pct || 0}%)`} value={totals.duty}/><Summary label={`Tariff (${style.tariff_pct || 0}%)`} value={totals.tariff}/><Summary label="Import Cost" value={totals.total_import_cost ?? totals.importCost} big/><small>Gold loss % is stored for reference only and is not included in metal cost.</small></div>
    </div>

    <div className="panel"><h2>Gold / Metal</h2><div className="grid4"><Field type="number" label="Net wt. in gms" value={style.net_wt_gms} onChange={v=>update('net_wt_gms', v)}/><Field type="number" label="Gold Loss % (reference only)" value={style.gold_loss_pct} onChange={v=>update('gold_loss_pct', v)}/><Field type="number" label="Current Gold Lock" value={style.current_gold_lock} onChange={v=>update('current_gold_lock', v)}/><Field type="number" label="Gold per Gram $" value={style.gold_per_gram} onChange={v=>update('gold_per_gram', v)}/></div></div>

    <div className="panel"><div className="sectionHead"><h2>Diamond Components</h2><button onClick={() => setComponents([...components, blankComponent()])}><Plus size={16}/> Add Stone Line</button></div><div className="componentTable"><table><thead><tr><th>Shape</th><th>Quality</th><th>Each Wt</th><th>Qty</th><th>Mode</th><th>Manual $/ct</th><th>Manual Total</th><th>Resolved $/ct</th><th>Total</th><th></th></tr></thead><tbody>{components.map((c, i) => {
      const resolved = calc?.components?.[i];
      return <tr key={c.id || i}><td><input value={c.shape || ''} onChange={e=>updateComp(i,'shape',e.target.value)} placeholder="MQ"/></td><td><input value={c.quality || ''} onChange={e=>updateComp(i,'quality',e.target.value)} placeholder="E"/></td><td><input type="number" step="0.001" value={c.each_weight || ''} onChange={e=>updateComp(i,'each_weight',e.target.value)}/></td><td><input type="number" step="1" value={c.quantity || ''} onChange={e=>updateComp(i,'quantity',e.target.value)}/></td><td><select value={c.pricing_mode || 'auto'} onChange={e=>updateComp(i,'pricing_mode',e.target.value)}><option value="auto">Auto</option><option value="manual_unit">Manual $/ct</option><option value="manual_total">Manual total</option></select></td><td><input type="number" value={c.manual_unitcost || ''} onChange={e=>updateComp(i,'manual_unitcost',e.target.value)}/></td><td><input type="number" value={c.manual_total || ''} onChange={e=>updateComp(i,'manual_total',e.target.value)}/></td><td>{resolved?.match_status === 'missing_price' ? <span className="warn">Missing</span> : money(resolved?.resolved_unitcost || 0)}</td><td>{money(resolved?.line_total || 0)}</td><td><button className="icon" onClick={()=>setComponents(components.filter((_,x)=>x!==i))}><Trash2 size={15}/></button></td></tr>})}</tbody></table></div></div>

    <div className="panel"><h2>Other Costs / Import</h2><div className="grid4"><Field type="number" label="Diamond Handling" value={style.diamond_handling} onChange={v=>update('diamond_handling', v)}/><Field type="number" label="Total Labor" value={style.total_labor} onChange={v=>update('total_labor', v)}/><Field type="number" label="Duty %" value={style.duty_pct} onChange={v=>update('duty_pct', v)}/><Field type="number" label="Tariff %" value={style.tariff_pct} onChange={v=>update('tariff_pct', v)}/></div></div>

    <div className="panel"><h2><History size={18}/> Historical Pricing</h2><table><thead><tr><th>Date</th><th>Reason</th><th>Export</th><th>Duty</th><th>Tariff</th><th>Import</th></tr></thead><tbody>{history.map(h => <tr key={h.id}><td>{date(h.snapshot_at)}</td><td>{h.reason}</td><td>{money(h.total_export_cost)}</td><td>{money(h.duty)}</td><td>{money(h.tariff)}</td><td><b>{money(h.total_import_cost)}</b></td></tr>)}{!history.length && <tr><td colSpan="6" className="empty">No history yet. History is created when a new diamond pricing file is uploaded.</td></tr>}</tbody></table></div>
  </section>;
}

function Field({ label, value, onChange, type='text', textarea=false }) { return <label className="field"><span>{label}</span>{textarea ? <textarea value={value || ''} onChange={e=>onChange(e.target.value)}/> : <input type={type} step="any" value={value ?? ''} onChange={e=>onChange(e.target.value)}/>}</label>; }
function Summary({ label, value, bold, big }) { return <div className={`summary ${bold?'bold':''} ${big?'big':''}`}><span>{label}</span><b>{money(value)}</b></div>; }

createRoot(document.getElementById('root')).render(<App />);
