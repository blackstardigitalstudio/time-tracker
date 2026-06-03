// TimeTracker — logica interfaccia (renderer). Made in Italy.
// Script esterno (niente JS inline) per consentire una CSP severa.

let state = null, editingId = null;
let rangeFrom = 0, rangeTo = 0, rangeKey = 'week';
let LANG = 'en', sysLang = 'en', locale = 'en-US';

const $ = id => document.getElementById(id);
const MAC = window.api.isMac;
const MOD = MAC ? '⌘+⌥' : 'Ctrl+Alt';

// ---- i18n ----
function t(key, vars){
  const dict = window.TR[LANG] || {};
  let s = (key in dict) ? dict[key] : (window.TR.en[key] !== undefined ? window.TR.en[key] : key);
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
  return s;
}
function pickLang(loc){
  const code = String(loc || '').toLowerCase().split(/[-_]/)[0];
  return window.TR[code] ? code : 'en';
}
function applyStaticI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}
function setLang(code){
  LANG = window.TR[code] ? code : 'en';
  const meta = (window.LANGS.find(l => l.code === LANG)) || window.LANGS[0];
  locale = meta.locale;
  document.documentElement.lang = LANG;
  document.documentElement.dir = meta.dir;
  const sel = $('langSel');
  if (sel && sel.value !== LANG) sel.value = LANG;
  applyStaticI18n();
  if (editingId) { $('addBtn').textContent = t('save'); $('formTitle').textContent = t('editClient'); }
}
function buildLangSelector(){
  const sel = $('langSel');
  sel.innerHTML = window.LANGS.map(l => `<option value="${l.code}">${escapeHtml(l.name)}</option>`).join('');
  sel.value = LANG;
  sel.onchange = () => {
    if (state) state.settings.lang = sel.value;   // aggiornamento ottimistico: evita che render() ripristini
    setLang(sel.value);
    window.api.updateSettings({ lang: sel.value });
    render();
  };
}
function dloc(d){ return new Date(d).toLocaleDateString(locale); }
function rangeLabelText(){
  if (rangeKey === 'week') return t('thisWeek');
  if (rangeKey === 'lastweek') return t('lastWeekLbl');
  if (rangeKey === 'month') return t('thisMonth');
  if (rangeKey === 'lastmonth') return t('lastMonthLbl');
  return `${dloc(rangeFrom)} – ${dloc(rangeTo)}`;
}

// ---- Format ----
function fmt(ms){ if(ms<0)ms=0; const t=Math.floor(ms/1000); return [Math.floor(t/3600),Math.floor((t%3600)/60),t%60].map(x=>String(x).padStart(2,'0')).join(':'); }
function hm(h){ const t=Math.round(h*3600); return `${Math.floor(t/3600)}h ${String(Math.floor((t%3600)/60)).padStart(2,'0')}m`; }
function eur(n){ return n.toFixed(2).replace('.',',')+' €'; }
function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function multi(s){ return escapeHtml(s).replace(/\n/g,'<br>'); }
function dayStart(d=new Date()){ const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); }
function weekStart(d=new Date()){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-day); return x.getTime(); }
function monthStart(d=new Date()){ const x=new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x.getTime(); }

function projMs(pid, from, to=Date.now()){
  let ms=0; const now=Date.now();
  for(const s of state.sessions){
    if(s.projectId!==pid) continue;
    const end=Math.min(s.end??now, to), start=Math.max(s.start, from||0);
    if(end>start) ms+=end-start;
  }
  return ms;
}

function render(){
  if(!state) return;
  const want = state.settings.lang || sysLang;
  if(want !== LANG) setLang(want);

  const active = state.projects.find(p=>p.id===state.activeProjectId);
  const from = dayStart();
  $('aName').textContent = active ? active.name : t('noActiveTimer');
  $('aHint').textContent = active ? t('inProgressHint',{mod:MOD}) : t('pressHint');

  $('list').innerHTML = '';
  for(const p of state.projects){
    const on = p.id===state.activeProjectId;
    const el = document.createElement('div');
    el.className = 'proj'+(on?' on':'');
    el.style.setProperty('--p', p.color);
    el.innerHTML = `
      <span class="dot" style="background:${p.color}"></span>
      <span class="hk">${MOD}+${(p.key||'?').toUpperCase()}</span>
      <div class="info"><div class="nm">${escapeHtml(p.name)}</div>
        <div class="meta">${t('wordToday')} ${fmt(projMs(p.id,from))} · ${t('wordTot')} ${fmt(projMs(p.id,0))}${p.rate?' · '+p.rate+' €/h':''}</div></div>
      <span class="tt">${fmt(projMs(p.id,from))}</span>
      <span class="x" data-edit="${p.id}" title="${t('editClient')}">✎</span>
      <span class="x del" data-del="${p.id}" title="✕">✕</span>`;
    el.addEventListener('click', e=>{ if(e.target.dataset.del||e.target.dataset.edit) return; window.api.toggleProject(p.id); });
    el.querySelector('[data-edit]').addEventListener('click', e=>{ e.stopPropagation(); startEdit(p); });
    el.querySelector('[data-del]').addEventListener('click', e=>{ e.stopPropagation(); if(confirm(t('confirmDelete',{name:p.name}))) window.api.deleteProject(p.id); });
    $('list').appendChild(el);
  }

  const today = state.projects.map(p=>({p, ms:projMs(p.id,from)})).sort((a,b)=>b.ms-a.ms);
  const total = today.reduce((s,x)=>s+x.ms,0);
  $('stats').innerHTML = `<div class="stat"><div class="v">${fmt(total)}</div><div class="l">${t('totalToday')}</div></div>`
    + today.slice(0,2).map(x=>`<div class="stat"><div class="v">${fmt(x.ms)}</div><div class="l">${escapeHtml(x.p.name)}</div></div>`).join('');

  $('sShot').value = state.settings.screenshotIntervalMin;
  $('sIdle').value = state.settings.idleTimeoutMin;
  $('sOn').checked = state.settings.screenshotsEnabled;
  $('hkHint').textContent = t('hotkeyHint',{mod:MOD});

  refreshInvClient();
  $('invHint').textContent = t('invoiceHint',{label: rangeLabelText()});
  renderReport();
}

function tick(){ if(!state) return; const a=state.projects.find(p=>p.id===state.activeProjectId); $('aTime').textContent = a?fmt(projMs(a.id,dayStart())):'00:00:00'; }

// ---- Report ----
function setPeriod(name){
  rangeKey = name;
  if(name==='week'){ rangeFrom=weekStart(); rangeTo=Date.now(); }
  else if(name==='lastweek'){ rangeTo=weekStart(); rangeFrom=rangeTo-7*86400000; }
  else if(name==='month'){ rangeFrom=monthStart(); rangeTo=Date.now(); }
  else if(name==='lastmonth'){ const m=new Date(monthStart()); rangeTo=m.getTime(); m.setMonth(m.getMonth()-1); rangeFrom=m.getTime(); }
  $('rFrom').valueAsDate=new Date(rangeFrom); $('rTo').valueAsDate=new Date(Math.min(rangeTo,Date.now()));
  if(state) render(); else renderReport();
}
function applyCustom(){
  const f=$('rFrom').valueAsDate, tt=$('rTo').valueAsDate; if(!f||!tt) return;
  rangeKey='custom';
  rangeFrom=dayStart(f); rangeTo=dayStart(tt)+86400000-1;
  render();
}
function reportData(){
  return state.projects.map(p=>{ const ms=projMs(p.id,rangeFrom,rangeTo); const hours=ms/3600000;
    return {name:p.name,color:p.color,rate:p.rate||0,hours,amount:hours*(p.rate||0)}; })
    .filter(r=>r.hours>0.0003).sort((a,b)=>b.hours-a.hours);
}
function dailyRowsFor(pid){
  const rows=[]; let ds=dayStart(new Date(rangeFrom));
  while(ds<=rangeTo){ const de=ds+86400000; const ms=projMs(pid,Math.max(ds,rangeFrom),Math.min(de-1,rangeTo));
    if(ms>30000) rows.push({date:new Date(ds),hours:ms/3600000}); ds=de; }
  return rows;
}
function dailyRows(){
  const rows=[];
  for(const p of state.projects) for(const r of dailyRowsFor(p.id)) rows.push({name:p.name,rate:p.rate||0,...r});
  rows.sort((a,b)=> a.date-b.date || a.name.localeCompare(b.name));
  return rows;
}
function renderReport(){
  if(!state){ return; }
  $('reportLabel').textContent = rangeLabelText();
  const data=reportData(), hasRate=data.some(r=>r.rate>0);
  const totH=data.reduce((s,r)=>s+r.hours,0), totA=data.reduce((s,r)=>s+r.amount,0);
  let h='<table class="rep"><thead><tr><th>'+t('colClient')+'</th><th style="text-align:right">'+t('colHours')+'</th>'+(hasRate?'<th style="text-align:right">'+t('colRate')+'</th><th style="text-align:right">'+t('colAmount')+'</th>':'')+'</tr></thead><tbody>';
  if(!data.length) h+='<tr><td colspan="4" style="color:var(--mut)">'+t('noHoursPeriod')+'</td></tr>';
  for(const r of data) h+=`<tr><td><span class="chip" style="background:${r.color}"></span>${escapeHtml(r.name)}</td><td class="num">${hm(r.hours)}</td>`+(hasRate?`<td class="num">${r.rate||''}</td><td class="num">${r.rate?eur(r.amount):''}</td>`:'')+'</tr>';
  h+=`<tr class="tot"><td>${t('total')}</td><td class="num">${hm(totH)}</td>`+(hasRate?`<td></td><td class="num">${eur(totA)}</td>`:'')+'</tr></tbody></table>';
  $('reportTable').innerHTML=h;
}
function buildCsv(){
  const rows=dailyRows(), hasRate=state.projects.some(p=>p.rate>0);
  const head=[t('colClient'),t('colDate'),t('csvHoursHM'),t('csvHoursDec')]; if(hasRate) head.push(t('csvRate'),t('csvAmount'));
  const lines=[head.join(';')];
  for(const r of rows){ const c=[r.name,dloc(r.date),hm(r.hours),r.hours.toFixed(2).replace('.',',')];
    if(hasRate) c.push(String(r.rate||0).replace('.',','),(r.hours*(r.rate||0)).toFixed(2).replace('.',',')); lines.push(c.join(';')); }
  const data=reportData(), totH=data.reduce((s,r)=>s+r.hours,0), totA=data.reduce((s,r)=>s+r.amount,0);
  const tr=[t('csvTotal'),'',hm(totH),totH.toFixed(2).replace('.',',')]; if(hasRate) tr.push('',totA.toFixed(2).replace('.',',')); lines.push(tr.join(';'));
  return lines.join('\n');
}
function buildReportPdf(){
  const data=reportData(), daily=dailyRows(), hasRate=data.some(r=>r.rate>0);
  const totH=data.reduce((s,r)=>s+r.hours,0), totA=data.reduce((s,r)=>s+r.amount,0);
  const sum=data.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td class="n">${hm(r.hours)}</td>`+(hasRate?`<td class="n">${r.rate?r.rate+' €':''}</td><td class="n">${r.rate?eur(r.amount):''}</td>`:'')+'</tr>').join('');
  const day=daily.map(r=>`<tr><td>${dloc(r.date)}</td><td>${escapeHtml(r.name)}</td><td class="n">${hm(r.hours)}</td>`+(hasRate?`<td class="n">${r.rate?eur(r.hours*r.rate):''}</td>`:'')+'</tr>').join('');
  return docShell(`<h1>${t('reportHoursTitle')}</h1><div class="sub">${escapeHtml(rangeLabelText())} · ${t('generatedOn',{date:dloc(new Date())})}</div>
    <h2>${t('summaryByClient')}</h2><table><thead><tr><th>${t('colClient')}</th><th class="n">${t('colHours')}</th>${hasRate?'<th class="n">'+t('colTariffa')+'</th><th class="n">'+t('colAmount')+'</th>':''}</tr></thead>
    <tbody>${sum||'<tr><td colspan=4>'+t('noHours')+'</td></tr>'}<tr class="tot"><td>${t('total')}</td><td class="n">${hm(totH)}</td>${hasRate?`<td></td><td class="n">${eur(totA)}</td>`:''}</tr></tbody></table>
    <h2>${t('dailyDetail')}</h2><table><thead><tr><th>${t('colDate')}</th><th>${t('colClient')}</th><th class="n">${t('colHours')}</th>${hasRate?'<th class="n">'+t('colAmount')+'</th>':''}</tr></thead><tbody>${day||'<tr><td colspan=4>—</td></tr>'}</tbody></table>`);
}

// ---- Fattura ----
function buildInvoiceHtml(pid, number, dateStr){
  const p=state.projects.find(x=>x.id===pid), iss=state.issuer;
  const rows=dailyRowsFor(pid);
  const items=rows.map(r=>`<tr><td>${dloc(r.date)}</td><td>${t('professionalService')}</td><td class="n">${r.hours.toFixed(2).replace('.',',')}</td><td class="n">${eur(p.rate)}</td><td class="n">${eur(r.hours*p.rate)}</td></tr>`).join('');
  const imponibile=rows.reduce((s,r)=>s+r.hours*p.rate,0);
  const ivaP=+iss.ivaPercent||0, iva=imponibile*ivaP/100, totale=imponibile+iva;
  const emittente=`<strong>${escapeHtml(iss.name)||'—'}</strong><br>${multi(iss.address)}${iss.vat?'<br>'+t('vatPh')+' '+escapeHtml(iss.vat):''}${iss.cf?'<br>'+t('cfPh')+' '+escapeHtml(iss.cf):''}`;
  const cliente=`<strong>${escapeHtml(p.name)}</strong><br>${multi(p.address)}${p.vat?'<br>'+escapeHtml(p.vat):''}`;
  return docShell(`
    <table class="hdr"><tr>
      <td style="width:55%;vertical-align:top">${emittente}</td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-size:22px;font-weight:bold">${t('invoiceWord')}</div>
        <div>${t('invNoLabel')} ${escapeHtml(number)} · ${escapeHtml(dateStr)}</div>
        <div style="margin-top:14px;text-align:left;background:#f4f6f9;padding:10px;border-radius:6px"><div style="font-size:10px;color:#888;text-transform:uppercase">${t('clientLabel')}</div>${cliente}</div>
      </td>
    </tr></table>
    <h2>${t('servicesPeriod',{label: escapeHtml(rangeLabelText())})}</h2>
    <table><thead><tr><th>${t('colDate')}</th><th>${t('colDescription')}</th><th class="n">${t('colHours')}</th><th class="n">${t('colRate')}</th><th class="n">${t('colAmount')}</th></tr></thead>
    <tbody>${items||'<tr><td colspan=5>'+t('noServices')+'</td></tr>'}</tbody></table>
    <table style="width:50%;margin-left:auto;margin-top:10px">
      <tr><td>${t('taxable')}</td><td class="n">${eur(imponibile)}</td></tr>
      <tr><td>${t('ivaRow',{p:ivaP})}</td><td class="n">${eur(iva)}</td></tr>
      <tr class="tot"><td>${t('total')}</td><td class="n">${eur(totale)}</td></tr>
    </table>
    ${iss.iban?`<p style="margin-top:18px"><strong>${t('paymentLabel')}:</strong> IBAN ${escapeHtml(iss.iban)}</p>`:''}
    ${iss.note?`<p style="margin-top:8px;color:#555;font-size:11px">${multi(iss.note)}</p>`:''}`);
}

function docShell(inner){
  const dir = (window.LANGS.find(l=>l.code===LANG)||{}).dir || 'ltr';
  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px;padding:8px}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#666;margin-bottom:18px}
    h2{font-size:13px;margin:22px 0 6px;color:#333}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    table.hdr td{border:none;padding:0 0 4px}
    th{text-align:left;font-size:10px;text-transform:uppercase;color:#888;border-bottom:1px solid #ccc;padding:6px 8px}
    td{padding:6px 8px;border-bottom:1px solid #eee} td.n{text-align:right}
    tr.tot td{font-weight:bold;border-top:2px solid #111;border-bottom:none}
  </style></head><body>${inner}</body></html>`;
}

// ---- Form ----
function startEdit(p){
  editingId=p.id;
  $('nName').value=p.name; $('nKey').value=p.key||''; $('nRate').value=p.rate||''; $('nColor').value=p.color;
  $('nVat').value=p.vat||''; $('nAddr').value=p.address||'';
  $('addBtn').textContent=t('save'); $('cancelEdit').style.display=''; $('formTitle').textContent=t('editClient');
  $('nName').focus();
}
function resetForm(){
  editingId=null; ['nName','nKey','nRate','nVat','nAddr'].forEach(id=>$(id).value=''); $('nColor').value='#22d3ee';
  $('addBtn').textContent=t('add'); $('cancelEdit').style.display='none'; $('formTitle').textContent=t('addProjectClient');
}

function refreshInvClient(){
  const sel=$('invClient'), cur=sel.value;
  sel.innerHTML = state.projects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if(state.projects.some(p=>p.id===cur)) sel.value=cur;
}
function fillIssuer(){
  const i=state.issuer;
  $('iName').value=i.name; $('iVat').value=i.vat; $('iCf').value=i.cf; $('iAddr').value=i.address;
  $('iIban').value=i.iban; $('iPrefix').value=i.prefix; $('iIva').value=i.ivaPercent; $('iNote').value=i.note;
}
function setInvoiceSuggestion(){
  const i=state.issuer;
  $('invNumber').value = (i.prefix||'') + String(i.counter||1).padStart(3,'0');
  if(!$('invDate').value) $('invDate').valueAsDate=new Date();
}

// ---- Eventi ----
$('stopBtn').onclick=()=>window.api.stopAll();
$('addBtn').onclick=()=>{ const name=$('nName').value.trim(); if(!name) return;
  const payload={ name, key:$('nKey').value.trim(), color:$('nColor').value, rate:parseFloat($('nRate').value)||0, vat:$('nVat').value.trim(), address:$('nAddr').value.trim() };
  if(editingId) window.api.updateProject({id:editingId,...payload}); else window.api.addProject(payload); resetForm(); };
$('cancelEdit').onclick=resetForm;
$('sShot').onchange=()=>window.api.updateSettings({screenshotIntervalMin:+$('sShot').value});
$('sIdle').onchange=()=>window.api.updateSettings({idleTimeoutMin:+$('sIdle').value});
$('sOn').onchange=()=>window.api.updateSettings({screenshotsEnabled:$('sOn').checked});
$('folderBtn').onclick=()=>window.api.openShots();
$('resetBtn').onclick=()=>{ if(confirm(t('confirmReset'))) window.api.resetData(); };
document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>setPeriod(b.dataset.period));
$('rApply').onclick=applyCustom;
$('csvBtn').onclick=async()=>{ if(await window.api.exportCsv(buildCsv())) alert(t('csvSaved')); };
$('pdfBtn').onclick=async()=>{ if(await window.api.exportPdf(buildReportPdf(),'report')) alert(t('pdfSaved')); };

const issuerMap={iName:'name',iVat:'vat',iCf:'cf',iAddr:'address',iIban:'iban',iPrefix:'prefix',iNote:'note'};
Object.entries(issuerMap).forEach(([id,key])=> $(id).onchange=()=>window.api.updateIssuer({[key]:$(id).value}));
$('iIva').onchange=()=>window.api.updateIssuer({ivaPercent:parseFloat($('iIva').value)||0});
$('iPrefix').addEventListener('change',()=>setInvoiceSuggestion());

$('invBtn').onclick=async()=>{
  const pid=$('invClient').value, p=state.projects.find(x=>x.id===pid);
  if(!p){ alert(t('selectClient')); return; }
  if(!p.rate){ alert(t('setRateFirst')); return; }
  const num=$('invNumber').value.trim()||'1';
  const d=$('invDate').valueAsDate||new Date();
  const ok=await window.api.exportPdf(buildInvoiceHtml(pid,num,dloc(d)), 'Fattura_'+num.replace(/[^\w]+/g,'-'));
  if(ok){ const next=(+state.issuer.counter||1)+1; await window.api.updateIssuer({counter:next}); state.issuer.counter=next; setInvoiceSuggestion(); alert(t('invoiceSaved')); }
};

// ---- Avvio ----
Promise.all([window.api.getState(), window.api.getLocale()]).then(([s, loc])=>{
  state=s; sysLang=pickLang(loc);
  setLang(state.settings.lang || sysLang);
  buildLangSelector();
  setPeriod('week'); fillIssuer(); setInvoiceSuggestion(); render();
});
window.api.onState(s=>{ state=s; render(); });
setInterval(()=>{ render(); tick(); }, 1000);
