// App JSX (no external deps). Mirrors the canvas version, adapted for browser.
const { useEffect, useMemo, useState } = React;

/**
 * Planner 3 Flussi – GH Pages build
 * - No imports/exports, uses React global.
 * - Static manifest/sw provided by repo.
 * - localStorage persistence
 * - Suggestion engine + mini tests
 */

// ====== Stili minimi (inline CSS, nessuna libreria) ======
const baseCss = `
:root { --bg: #0b1220; --card:#ffffff; --muted:#6b7280; --ink:#111827; --line:#e5e7eb; }
*{box-sizing:border-box}
body{background:var(--bg)}
.app{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink)}
.h1{font-size:24px;font-weight:800;margin:0}
.p{margin:6px 0;color:var(--muted)}
.grid{display:grid;gap:16px}
.grid-4{grid-template-columns: repeat(1, minmax(0,1fr));}
@media (min-width: 900px){.grid-4{grid-template-columns: repeat(4, minmax(0,1fr));}}
.card{background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:0 2px 6px rgba(0,0,0,0.05)}
.card-head{padding:14px 16px}
.card-body{padding:0 16px 16px 16px}
.btn{border:0;border-radius:12px;padding:8px 12px;font-weight:600;cursor:pointer}
.btn.primary{background:#111827;color:#fff}
.btn.ghost{background:transparent;color:#111827}
.btn.ghost:hover{background:#f3f4f6}
.btn.secondary{background:#f3f4f6}
.btn.danger{background:#dc2626;color:#fff}
.row{display:flex;gap:8px;flex-wrap:wrap}
.input, select, textarea{width:100%; border:1px solid #cbd5e1;border-radius:12px;padding:8px 10px;font-size:14px}
.small{font-size:12px;color:var(--muted)}
.badge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:600}
.b-indigo{background:#e0e7ff;color:#3730a3}
.b-emerald{background:#d1fae5;color:#065f46}
.b-amber{background:#fef3c7;color:#92400e}
.b-red{background:#fee2e2;color:#991b1b}
.b-yellow{background:#fef9c3;color:#854d0e}
.b-gray{background:#f3f4f6;color:#374151}
.b-sky{background:#e0f2fe;color:#075985}
.b-purple{background:#f3e8ff;color:#6b21a8}
.b-green{background:#dcfce7;color:#166534}
.kicker{display:flex;align-items:center;gap:8px;color:#6b7280;font-size:13px;margin-top:6px}
.columns-title{font-size:13px;font-weight:600;color:#64748b}
.tabbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tab{border:1px solid var(--line);border-radius:999px;background:#fff;padding:8px 10px;text-align:center;cursor:pointer}
.tab.active{background:#111827;color:#fff;border-color:#111827}
.details{background:#fff;border:1px dashed #cbd5e1;border-radius:12px;padding:12px}
`;

// ====== Costanti dominio ======
const AREAS = [
  { id: "conservatorio", label: "Conservatorio", badge: "b-indigo" },
  { id: "tempoReale", label: "Tempo Reale", badge: "b-emerald" },
  { id: "libera", label: "Libera Professione", badge: "b-amber" },
];

const PRIORITIES = [
  { id: "alta", label: "Alta", badge: "b-red" },
  { id: "media", label: "Media", badge: "b-yellow" },
  { id: "bassa", label: "Bassa", badge: "b-gray" },
];

const STATI = [
  { id: "backlog", label: "Backlog", badge: "b-gray" },
  { id: "oggi", label: "Oggi", badge: "b-sky" },
  { id: "incorso", label: "In corso", badge: "b-purple" },
  { id: "fatto", label: "Fatto", badge: "b-green" },
];

const DEFAULT_QUOTE = { conservatorio: 0.4, tempoReale: 0.35, libera: 0.25 };
const STORAGE_KEY = "planner3flussi:v4";

// ====== Utilità generali ======
function genId(){ return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36); }
function loadState(){ try{ const raw=localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw): null; }catch{ return null; } }
function saveState(state){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{} }
function fmtDate(iso){ try{ return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(new Date(iso)); }catch{ return iso; } }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

function loadLogo(){ try{ return localStorage.getItem(STORAGE_KEY+':logo') || null; }catch{ return null; } }
function saveLogo(dataUrl){ try{ if(dataUrl){ localStorage.setItem(STORAGE_KEY+':logo', dataUrl);} else { localStorage.removeItem(STORAGE_KEY+':logo'); } }catch{} }
function applyFavicon(dataUrl){
  try{
    let link = document.querySelector('link[rel="icon"]');
    if(!link){ link = document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
    link.href = dataUrl || 'icon-256.png';
  }catch{}
}

// Punteggio: priorità (10/20/30) + urgenza (1..5)
function scoreTask(t){
  const prio = t.priorita === "alta" ? 3 : t.priorita === "media" ? 2 : 1;
  let urgency = 1;
  if (t.scadenza){
    const days = Math.ceil((new Date(t.scadenza) - new Date()) / (1000*60*60*24));
    urgency = days <= 0 ? 5 : days === 1 ? 4 : days <= 3 ? 3 : days <= 7 ? 2 : 1;
  }
  return prio * 10 + urgency;
}

// Funzione pura per suggerire: restituisce lista di ID task selezionati
function suggestTasks(tasks, oreDisponibili, quote){
  const listsByArea = AREAS.reduce((acc,a)=>{acc[a.id]=[];return acc;},{});
  tasks.filter(t=>t.stato!=="fatto").forEach(t=>listsByArea[t.area].push(t));
  Object.values(listsByArea).forEach(list=>list.sort((a,b)=>scoreTask(b)-scoreTask(a)));

  const alloc = {
    conservatorio: oreDisponibili * (quote.conservatorio ?? DEFAULT_QUOTE.conservatorio),
    tempoReale:    oreDisponibili * (quote.tempoReale ?? DEFAULT_QUOTE.tempoReale),
    libera:        oreDisponibili * (quote.libera ?? DEFAULT_QUOTE.libera),
  };

  const picked = [];
  for (const a of AREAS){
    let budget = alloc[a.id];
    for (const t of listsByArea[a.id]){
      if (budget <= 0) break;
      const d = Number(t.durata) || 1;
      picked.push(t.id);
      budget -= d;
    }
  }
  return picked;
}

// ====== Piccoli componenti UI ======
const Badge = ({tone, children}) => (
  <span className={["badge", tone].filter(Boolean).join(" ")}>{children}</span>
);

const Button = ({variant="primary", children, ...rest}) => (
  <button className={["btn", variant].join(" ")} {...rest}>{children}</button>
);

const Card = ({title, kicker, children, footer}) => (
  <div className="card">
    <div className="card-head">
      {title && <div style={{fontWeight:700}}>{title}</div>}
      {kicker}
    </div>
    <div className="card-body">{children}</div>
    {footer}
  </div>
);

function AreaBadge({ area }){
  const a = AREAS.find(x=>x.id===area);
  return <Badge tone={a?.badge}>{a?.label ?? area}</Badge>;
}
function PriorityBadge({ p }){
  const x = PRIORITIES.find(x=>x.id===p);
  return <Badge tone={x?.badge}>{x?.label ?? p}</Badge>;
}
function StateBadge({ s }){
  const x = STATI.find(x=>x.id===s);
  return <Badge tone={x?.badge}>{x?.label ?? s}</Badge>;
}

function TaskCard({ task, onMove, onDelete, onToggle }){
  const overdue = task.scadenza && new Date(task.scadenza) < new Date() && task.stato !== "fatto";
  return (
    <div className="card" style={{borderRadius:16}}>
      <div className="card-head">
        <div style={{display:'flex',justifyContent:'space-between',gap:8, alignItems:'flex-start'}}>
          <div style={{fontSize:16,fontWeight:700,lineHeight:1.2}}>{task.titolo}</div>
          <div className="row">
            <AreaBadge area={task.area} />
            <PriorityBadge p={task.priorita} />
            <StateBadge s={task.stato} />
          </div>
        </div>
        {task.scadenza && (
          <div className="kicker" style={{color: overdue? '#b91c1c' : undefined}}>📅 Scade: {fmtDate(task.scadenza)}</div>
        )}
        {task.durata ? <div className="kicker">⏱️ {task.durata} h</div> : null}
      </div>
      {task.note && (
        <div className="card-body" style={{paddingTop:0}}>
          <div style={{whiteSpace:'pre-wrap', fontSize:14, color:'#374151'}}>{task.note}</div>
        </div>
      )}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',padding:"0 16px 14px 16px"}}>
        {task.stato !== "fatto" && (
          <Button variant="secondary" onClick={()=>onToggle(task)}>
            {task.stato === "incorso" ? "Metti in pausa" : "Avvia"}
          </Button>
        )}
        {task.stato !== "backlog" && (<Button variant="ghost" onClick={()=>onMove(task,"backlog")}>Backlog</Button>)}
        {task.stato !== "oggi" && (<Button variant="ghost" onClick={()=>onMove(task,"oggi")}>Oggi</Button>)}
        {task.stato !== "incorso" && (<Button variant="ghost" onClick={()=>onMove(task,"incorso")}>In corso</Button>)}
        {task.stato !== "fatto" && (<Button variant="ghost" onClick={()=>onMove(task,"fatto")}>Fatto</Button>)}
        <Button variant="danger" onClick={()=>onDelete(task)}>Elimina</Button>
      </div>
    </div>
  );
}

function NewTaskForm({ defaultArea, onAdd }){
  const [titolo, setTitolo] = useState("");
  const [area, setArea] = useState(defaultArea ?? AREAS[0].id);
  const [priorita, setPriorita] = useState("media");
  const [scadenza, setScadenza] = useState("");
  const [durata, setDurata] = useState(1);
  const [note, setNote] = useState("");

  return (
    <div className="card" style={{borderStyle:'dashed'}}> 
      <div className="card-head"><strong>➕ Nuova attività</strong></div>
      <div className="card-body">
        <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:12}}>
          <div>
            <div className="small">Titolo</div>
            <input className="input" value={titolo} onChange={e=>setTitolo(e.target.value)} placeholder="Es. Rispondere agli studenti"/>
          </div>
          <div>
            <div className="small">Area</div>
            <select value={area} onChange={(e)=>setArea(e.target.value)}>
              {AREAS.map(a=> <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <div className="small">Priorità</div>
            <select value={priorita} onChange={(e)=>setPriorita(e.target.value)}>
              {PRIORITIES.map(p=> <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <div className="small">Scadenza</div>
            <input className="input" type="date" value={scadenza} onChange={e=>setScadenza(e.target.value)} />
          </div>
          <div>
            <div className="small">Durata (ore)</div>
            <input className="input" type="number" min={0.25} step={0.25} value={durata} onChange={e=>setDurata(parseFloat(e.target.value)||0)} />
          </div>
          <div style={{gridColumn:'1 / -1'}}>
            <div className="small">Note</div>
            <textarea className="input" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Dettagli, checklist, link…"/>
          </div>
          <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end', gap:8}}>
            <Button onClick={()=>{
              if(!titolo.trim()) return;
              onAdd({ id: genId(), titolo, area, priorita, scadenza: scadenza||null, durata: Number(durata)||1, note, stato: "backlog" });
              setTitolo(""); setNote(""); setScadenza(""); setDurata(1); setPriorita("media"); setArea(defaultArea ?? AREAS[0].id);
            }}>Aggiungi</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({ title, tasks, onMove, onDelete, onToggle }){
  return (
    <div className="grid" style={{gap:12}}>
      <div className="columns-title">{title} <span className="small">({tasks.length})</span></div>
      <div className="grid" style={{gap:12}}>
        {tasks.map(t=> <TaskCard key={t.id} task={t} onMove={onMove} onDelete={onDelete} onToggle={onToggle}/>) }
      </div>
    </div>
  );
}

function Suggeritore({ tasks, quote, onMoveMany }){
  const [oreDisponibili, setOreDisponibili] = useState(6);
  const [q, setQ] = useState(quote);

  function pianifica(){
    const picked = suggestTasks(tasks, oreDisponibili, q);
    const selected = new Set(picked);
    onMoveMany(tasks.filter(t=>selected.has(t.id)), "oggi");
  }

  return (
    <Card title={"✨ Suggerisci piano di oggi"} kicker={<div className="small">Distribuisce i task in base a priorità/urgenza e alle quote per area</div>}>
      <div className="row" style={{alignItems:'flex-end'}}>
        <div>
          <div className="small">Ore disponibili oggi</div>
          <input className="input" type="number" min={1} step={0.5} value={oreDisponibili} onChange={e=>setOreDisponibili(parseFloat(e.target.value)||0)} />
        </div>
        {AREAS.map(a=> (
          <div key={a.id}>
            <div className="small">Quota {a.label} (%)</div>
            <input className="input" type="number" min={0} max={100} step={5}
              defaultValue={(q[a.id] ?? DEFAULT_QUOTE[a.id]) * 100}
              onChange={(e)=>{
                const val = Math.max(0, Math.min(100, parseFloat(e.target.value)||0))/100;
                const next = { ...q, [a.id]: val };
                setQ(next);
              }}
            />
          </div>
        ))}
        <Button onClick={pianifica}>🚀 Pianifica</Button>
      </div>
    </Card>
  );
}

// ====== Test runner semplice (nessuna libreria) ======
function runTests(){
  const results = [];
  const T = (name, fn) => { try{ fn(); results.push({name, pass:true}); }catch(e){ results.push({name, pass:false, error:String(e)}); } };
  const ok = (cond, msg) => { if(!cond) throw new Error(msg || "assertion failed"); };

  // Test 1
  const highUrgent = { priorita:'alta', scadenza:new Date().toISOString(), durata:1 };
  const mediumNoDue = { priorita:'media', scadenza:null, durata:1 };
  T("scoreTask ranks urgent/high above medium/none", ()=>{
    if (!(scoreTask(highUrgent) > scoreTask(mediumNoDue))) throw new Error("expected higher score");
  });

  // Test 2
  const tasks = [];
  for (let i=0;i<3;i++) tasks.push({id:`c${i}`, area:'conservatorio', priorita:'media', scadenza:null, durata:1, stato:'backlog'});
  for (let i=0;i<3;i++) tasks.push({id:`t${i}`, area:'tempoReale', priorita:'media', scadenza:null, durata:1, stato:'backlog'});
  for (let i=0;i<3;i++) tasks.push({id:`l${i}`, area:'libera', priorita:'media', scadenza:null, durata:1, stato:'backlog'});
  const picked = suggestTasks(tasks, 6, {conservatorio:0.5, tempoReale:0.33, libera:0.17});
  T("suggestTasks returns deterministic ids length <= hours", ()=>{
    if (!(picked.length <= 6)) throw new Error("should pick at most 6 tasks");
  });
  T("suggestTasks covers multiple areas", ()=>{
    const hasC = picked.some(id=>id.startsWith('c'));
    const hasT = picked.some(id=>id.startsWith('t'));
    const hasL = picked.some(id=>id.startsWith('l'));
    if (!(hasC && hasT && hasL)) throw new Error("should include tasks from all areas");
  });

  // Test 3
  T("fmtDate produces a non-empty string", ()=>{
    const s = fmtDate("2025-09-24");
    if (!(typeof s === 'string' && s.length>0)) throw new Error("empty date string");
  });

  // Test 4
  T("genId uniqueness (100 samples)", ()=>{
    const set = new Set();
    for(let i=0;i<100;i++){ set.add(genId()); }
    if (!(set.size===100)) throw new Error("duplicate id detected");
  });

  // Test 5 durations
  T("suggestTasks respects hours budget with durations", ()=>{
    const tasks2 = [
      {id:'a', area:'conservatorio', priorita:'alta', scadenza:null, durata:3, stato:'backlog'},
      {id:'b', area:'conservatorio', priorita:'media', scadenza:null, durata:3, stato:'backlog'},
      {id:'c', area:'tempoReale', priorita:'media', scadenza:null, durata:2, stato:'backlog'},
    ];
    const out = suggestTasks(tasks2, 4, {conservatorio:0.5, tempoReale:0.5, libera:0});
    const pickedSet = new Set(out);
    const sumCons = tasks2.filter(t=>t.area==='conservatorio' && pickedSet.has(t.id)).reduce((s,t)=>s+t.durata,0);
    const sumTR   = tasks2.filter(t=>t.area==='tempoReale' && pickedSet.has(t.id)).reduce((s,t)=>s+t.durata,0);
    if (!(sumCons <= 2)) throw new Error("conservatorio should be <= 2h");
    if (!(sumTR <= 2)) throw new Error("tempoReale should be <= 2h");
  });

  return results;
}

function App(){
  const [boot] = useState(Date.now());
  const [tasks, setTasks] = useState([]);
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [tab, setTab] = useState("tutto");
  const [tests, setTests] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // PWA install prompt
  useEffect(()=>{
    const handler = (e)=>{ e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return ()=> window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // bootstrap + tests
  useEffect(()=>{
    const saved = loadState();
    if (saved){ setTasks(saved.tasks||[]); setQuote(saved.quote||DEFAULT_QUOTE); }
    setTests(runTests());
  }, []);

  useEffect(()=>{ saveState({ tasks, quote }); }, [tasks, quote]);

  function addTask(t){ setTasks(prev=>[t, ...prev]); }
  function deleteTask(t){ setTasks(prev=>prev.filter(x=>x.id!==t.id)); }
  function moveTask(t, stato){ setTasks(prev=>prev.map(x=>x.id===t.id?{...x, stato}:x)); }
  function toggleTask(t){ setTasks(prev=>prev.map(x=>x.id===t.id?{...x, stato: x.stato==="incorso"?"oggi":"incorso"}:x)); }
  function moveMany(list, stato){ const ids = new Set(list.map(t=>t.id)); setTasks(prev=>prev.map(x=> ids.has(x.id)?{...x, stato}:x)); }

  function exportJSON(){
    const data = { version: 4, tasks, quote, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `planner-3flussi-export-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function importJSON(file){
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
        if (data.quote) setQuote(data.quote);
      }catch{}
    };
    reader.readAsText(file);
  }
  function resetAll(){ if (confirm('Sicuro di voler cancellare tutti i dati locali?')) { setTasks([]); setQuote(DEFAULT_QUOTE); localStorage.removeItem(STORAGE_KEY);} }
  function installPWA(){ if (deferredPrompt){ deferredPrompt.prompt(); deferredPrompt.userChoice.finally(()=> setDeferredPrompt(null)); } }

  const filteredByArea = (area) => tasks.filter(t=>!area || t.area===area);
  const byState = (arr, s) => arr.filter(t=>t.stato===s).sort((a,b)=>scoreTask(b)-scoreTask(a));

  return (
    <div className="app" style={{padding:24, maxWidth:1200, margin:'0 auto'}}>
      <style key={boot} dangerouslySetInnerHTML={{__html: baseCss}}/>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap',marginBottom:8}}>
        <div>
          <div className="h1">Planner 3 Flussi</div>
          <div className="p">Conservatorio • Tempo Reale • Libera Professione — pianifica la giornata in un clic.</div>
        </div>
        <div className="row">
          <Button className="secondary" onClick={exportJSON}>⬇️ Esporta</Button>
          <label className="btn secondary" style={{display:'inline-flex',alignItems:'center',gap:6,cursor:'pointer'}}>
            ⬆️ Importa
            <input type="file" accept="application/json" style={{display:'none'}} onChange={(e)=> e.target.files?.[0] && importJSON(e.target.files[0]) }/>
          </label>
          <Button className="secondary" onClick={resetAll}>🗑️ Reset</Button>
          <Button className="secondary" disabled={!deferredPrompt} onClick={installPWA}>📲 Installa</Button>
        </div>
      </div>

      <NewTaskForm onAdd={addTask} />
      <Suggeritore tasks={tasks} quote={quote} onMoveMany={moveMany} />

      <div className="card" style={{padding:12}}>
        <div className="tabbar">
          <div className={"tab "+(tab==="tutto"?"active":"")} onClick={()=>setTab("tutto")}>Tutto</div>
          {AREAS.map(a=> (
            <div key={a.id} className={"tab "+(tab===a.id?"active":"")} onClick={()=>setTab(a.id)}>{a.label}</div>
          ))}
        </div>
      </div>

      {tab === 'tutto' ? (
        <div className="grid grid-4">
          <Column title="Backlog" tasks={byState(tasks, 'backlog')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
          <Column title="Oggi" tasks={byState(tasks, 'oggi')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
          <Column title="In corso" tasks={byState(tasks, 'incorso')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
          <Column title="Fatto" tasks={byState(tasks, 'fatto')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
        </div>
      ) : (
        <div className="grid grid-4">
          <Column title="Backlog" tasks={byState(filteredByArea(tab), 'backlog')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
          <Column title="Oggi" tasks={byState(filteredByArea(tab), 'oggi')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
          <Column title="In corso" tasks={byState(filteredByArea(tab), 'incorso')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
          <Column title="Fatto" tasks={byState(filteredByArea(tab), 'fatto')} onMove={moveTask} onDelete={deleteTask} onToggle={toggleTask} />
        </div>
      )}

      <div style={{marginTop:16}}>
        <details className="details">
          <summary><strong>🧪 Test (auto-eseguiti)</strong></summary>
          <ul>
            {runTests().map((t,i)=> (
              <li key={i} style={{color: t.pass? '#166534':'#b91c1c'}}>
                {t.pass ? '✅' : '❌'} {t.name}{!t.pass && t.error?`: ${t.error}`:''}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="small" style={{marginTop:8}}>Dati salvati in locale (localStorage). Nessun server richiesto. Installabile come PWA per uso offline.</div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
