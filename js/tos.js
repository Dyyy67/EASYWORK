/* ============================================================
   TABLE OF SPECIFICATION (TOS) MODULE
   ============================================================ */
function tosDistribute(total, weights){
  const raw    = weights.map(w=>total*w);
  const floors = raw.map(Math.floor);
  let used = floors.reduce((a,b)=>a+b,0);
  let remainder = total - used;
  const order = raw.map((v,i)=>({i, frac:v-floors[i]}))
                    .sort((a,b)=>b.frac-a.frac);
  const result = floors.slice();
  for(let k=0;k<remainder;k++) result[order[k%order.length].i]++;
  return result;
}
/* Format a percentage: only show a decimal point when the value truly isn't whole */
function tosFmtPct(pct){
  return (Math.abs(pct-Math.round(pct))<0.05) ? Math.round(pct)+'%' : pct.toFixed(1)+'%';
}

/* ─── STATE ─── */
let tosTosList   = [];
let tosActiveIdx = 0;
let tosBank      = [];
let tosInsertRow = 0;
let tosSaveTimer = null;

/* ─── FACTORIES ─── */
function tosMkDataRow(){ return { topic:'', days:0, refFiles:[] }; }
function tosMkTOS(name){
  return {
    id: Date.now()+Math.random(),
    name: name||'TOS 1',
    activeRows: 3,
    rows: Array.from({length:6}, tosMkDataRow),
    meta: { subject:'', grade:'', quarter:'', totalItems:40, prepBy:'' }
  };
}

/* ─── GET ACTIVE TOS ─── */
function tosGet(){ return tosTosList[tosActiveIdx]||null; }

/* ─── CALCULATIONS ─── */
function tosRecalc(){
  const tos = tosGet(); if(!tos) return;

  const ti = Math.max(1, parseInt(document.getElementById('tosMTotal').value)||40);
  tos.meta.totalItems = ti;

  const n = tos.activeRows;
  let totalDays = 0;

  for(let i=0;i<n;i++){
    const dEl = document.getElementById('tosDays'+i);
    const tEl = document.getElementById('tosTopic'+i);
    const d = dEl ? (parseFloat(dEl.value)||0) : 0;
    tos.rows[i].days  = d;
    tos.rows[i].topic = tEl ? tEl.value : tos.rows[i].topic;
    totalDays += d;
  }
  document.getElementById('tosMDays').value = totalDays;

  /* Compute allocations — items per competency across rows, using
     floor + largest-remainder so the row values always sum to `ti`
     and nothing gets rounded unless it actually needs to be. */
  const dayShares = [];
  for(let i=0;i<n;i++){
    const pct = totalDays>0 ? (tos.rows[i].days/totalDays*100) : 0;
    dayShares.push(pct);
  }
  const rawAllocs = totalDays>0 ? tosDistribute(ti, dayShares.map(p=>p/100)) : dayShares.map(()=>0);
  const allocs = dayShares.map((pct,i)=>({pct, alloc:rawAllocs[i]}));

  /* Push to DOM */
  const cogColSums = TOS_COG_W.map(()=>0);
  for(let i=0;i<n;i++){
    const {pct,alloc} = allocs[i];
    const pctEl   = document.getElementById('tosPct'+i);
    const allocEl = document.getElementById('tosAlloc'+i);
    if(pctEl)   pctEl.textContent   = tosFmtPct(pct);
    if(allocEl) allocEl.textContent = alloc;
    /* cognitive columns for THIS row must sum exactly to alloc */
    const rowCogs = tosDistribute(alloc, TOS_COG_W);
    TOS_COG_W.forEach((w,ci)=>{
      const cel = document.getElementById('tosCog'+i+'_'+ci);
      if(cel) cel.textContent = rowCogs[ci];
      cogColSums[ci] += rowCogs[ci];
    });
    const totEl = document.getElementById('tosRowTotal'+i);
    if(totEl) totEl.textContent = alloc;
  }

  /* Totals row */
  const totDays  = totalDays;
  const totAlloc = allocs.reduce((s,a)=>s+a.alloc,0);
  const cogTots  = cogColSums;

  document.getElementById('tosTblFoot').innerHTML = `<tr>
    <td style="text-align:center;font-weight:700;background:#F2F2F2;font-size:10pt;font-family:'Century Gothic',sans-serif;"></td>
    <td style="text-align:center;font-weight:700;background:#F2F2F2;font-size:10pt;font-family:'Century Gothic',sans-serif;"></td>
    <td style="text-align:center;font-weight:700;background:#F2F2F2;font-size:10pt;font-family:'Century Gothic',sans-serif;">${totDays}</td>
    <td style="text-align:center;font-weight:700;background:#F2F2F2;font-size:10pt;font-family:'Century Gothic',sans-serif;">100%</td>
    <td style="text-align:center;font-weight:700;background:#F2F2F2;font-size:10pt;font-family:'Century Gothic',sans-serif;">${totAlloc}</td>
    ${cogTots.map(c=>`<td style="text-align:center;font-weight:700;background:#F2F2F2;font-size:10pt;font-family:'Times New Roman',serif;">${c}</td>`).join('')}
    <td style="text-align:center;font-weight:800;background:#F2F2F2;font-size:10pt;">${totAlloc}</td>
  </tr>`;

  const statusEl = document.getElementById('tosStatus');
  if(statusEl) statusEl.textContent = totalDays>0
    ? `${n} topic${n>1?'s':''} · ${totDays} total days · ${totAlloc} items allocated`
    : `${n} topic${n>1?'s':''}  — enter Days Taught to calculate.`;

  tosDebounceSave();
}

/* ─── RENDER TABLE ─── */
function tosRenderTable(){
  const tos = tosGet();
  const tbody = document.getElementById('tosTblBody');
  if(!tos){
    tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted);">No TOS active. Click ➕ New TOS.</td></tr>';
    document.getElementById('tosTblFoot').innerHTML='';
    return;
  }

  let html='';
  for(let i=0;i<6;i++){
    const row = tos.rows[i];
    const on  = i < tos.activeRows;
    const isTgt = (i===tosInsertRow);
    const trCls = (on?'tos-row-on':'tos-row-off') + (isTgt&&on?' tos-insert-tgt':'');

    html += `<tr class="${trCls}" id="tosTrow${i}">
      <td class="tos-cell-topic" style="padding:3px 5px;">
        <input id="tosTopic${i}" value="${tosEsc(row.topic)}"
          placeholder="Lesson ${i+1} title…"
          oninput="tosRecalc()"
          onfocus="tosSetInsertRow(${i})"
          style="font-family:'Century Gothic',sans-serif;font-size:10pt;min-width:120px;">
      </td>
      <td class="tos-cell-topic" style="padding:3px 5px;">
        <input id="tosComp${i}" value="${tosEsc(row.competency||'')}"
          placeholder="Learning competency…"
          oninput="tosSnapComp(${i})"
          style="font-family:'Century Gothic',sans-serif;font-size:10pt;min-width:120px;">
        <div style="display:flex;align-items:center;gap:4px;margin-top:3px;">
          <button type="button" onclick="tosRowUploadClick(${i})" title="Upload reference file(s) for this competency — AI reads them to generate Final Exam questions"
            style="background:#EEF4FF;color:#1565C0;border:1px solid #BBDEFB;border-radius:5px;font-size:9px;font-weight:800;padding:2px 6px;cursor:pointer;white-space:nowrap;">⬆ Upload</button>
          <input type="file" id="tosRowFile${i}" accept=".docx,.doc,.pdf" multiple style="display:none" onchange="tosRowHandleFiles(${i},this.files)">
        </div>
        ${(row.refFiles&&row.refFiles.length) ? `<div style="display:flex;flex-direction:column;gap:2px;margin-top:3px;">` +
          row.refFiles.map((f,fi)=>`<div style="display:flex;align-items:center;gap:4px;background:#F1F8E9;border-radius:4px;padding:2px 5px;">
            <span style="font-size:9px;">📄</span><span style="flex:1;font-size:9px;color:#33691E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;">${tosEsc(f.name)}</span>
            <button type="button" onclick="tosRowRemoveFile(${i},${fi})" style="background:none;border:none;color:#C62828;font-size:10px;cursor:pointer;padding:0 2px;">✕</button>
          </div>`).join('') + `</div>` : ''}
      </td>
      <td class="tos-cell-days" style="padding:3px;text-align:center;">
        <input id="tosDays${i}" type="number" min="0" step="0.5"
          value="${row.days||''}" placeholder="0"
          oninput="tosRecalc()"
          style="font-family:'Century Gothic',sans-serif;font-size:10pt;width:50px;border:none;background:transparent;text-align:center;font-weight:700;">
      </td>
      <td class="tos-cell-pct" id="tosPct${i}">—</td>
      <td class="tos-cell-alloc" id="tosAlloc${i}" style="background:#F2F2F2;color:#333;">—</td>
      ${TOS_COG_W.map((_,ci)=>`<td class="tos-cell-cog" id="tosCog${i}_${ci}" style="font-family:'Times New Roman',serif;">—</td>`).join('')}
      <td class="tos-cell-alloc" id="tosRowTotal${i}" style="background:#F2F2F2;font-weight:800;text-align:center;">—</td>
    </tr>`;
  }
  tbody.innerHTML = html;
  tosUpdateToggle();
  tosRenderPills();
  tosRecalc();
}

/* snap competency field into state */
function tosSnapComp(i){
  const tos=tosGet(); if(!tos) return;
  const el=document.getElementById('tosComp'+i);
  if(el) tos.rows[i].competency=el.value;
  tosDebounceSave();
}

/* ─── PER-ROW (PER-COMPETENCY) REFERENCE FILES — used by Final Exam AI generation ─── */
function tosRowUploadClick(i){
  const inp = document.getElementById('tosRowFile'+i);
  if(inp) inp.click();
}
/* Pull the exam "Title:" field out of extracted text, e.g.:
   "Title:\nThe Great Feast: God's Invitation" -> "The Great Feast: God's Invitation" */
function tosDetectTitle(text){
  if(!text) return '';
  const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
  for(let k=0;k<lines.length;k++){
    const m = lines[k].match(/^title\s*:\s*(.*)$/i);
    if(m){
      if(m[1]) return m[1].trim();
      if(lines[k+1]) return lines[k+1].trim();
    }
  }
  return '';
}
async function tosRowHandleFiles(i, fileList){
  const tos = tosGet(); if(!tos) return;
  const row = tos.rows[i]; if(!row) return;
  if(!row.refFiles) row.refFiles = [];
  const files = Array.from(fileList).filter(f => /\.(docx|doc|pdf)$/i.test(f.name));
  if(!files.length){ toast('Please upload .docx, .doc, or .pdf files only.','te'); return; }
  if(files.length + row.refFiles.length > 4){ toast('Maximum 4 reference files per competency.','te'); return; }
  const wasTopicEmpty = !row.topic.trim();
  let detectedTitle = '';
  for(const file of files){
    const text = await prelimExtractDocx(file); // reuse existing docx/pdf extractor
    row.refFiles.push({ name:file.name, text:(text||'').slice(0,12000) });
    if(!detectedTitle) detectedTitle = tosDetectTitle(text);
  }
  /* Auto-fill the Content/Topic field from the file's Title: if it's still empty */
  const autoFilled = wasTopicEmpty && !!detectedTitle;
  if(autoFilled){
    row.topic = detectedTitle;
  }
  const inp = document.getElementById('tosRowFile'+i);
  if(inp) inp.value = '';
  tosRenderTable();
  tosRecalc();
  tosDebounceSave();
  toast(autoFilled
    ? `✅ ${files.length} file(s) attached — topic auto-filled from "Title:"`
    : `✅ ${files.length} file(s) attached to this competency.`, 'ts');
}
function tosRowRemoveFile(i, fi){
  const tos = tosGet(); if(!tos) return;
  const row = tos.rows[i]; if(!row || !row.refFiles) return;
  row.refFiles.splice(fi,1);
  tosRenderTable();
  tosDebounceSave();
}

/* ─── ROW COUNT TOGGLE ─── */
function tosSetRows(n){
  const tos=tosGet(); if(!tos) return;
  tos.activeRows=n;
  for(let i=0;i<6;i++){
    const row=document.getElementById('tosTrow'+i); if(!row) continue;
    const on=i<n;
    row.className=(on?'tos-row-on':'tos-row-off')+(i===tosInsertRow&&on?' tos-insert-tgt':'');
  }
  tosUpdateToggle(); tosRenderPills();
  if(tosInsertRow>=n){ tosInsertRow=n-1; tosHighlight(); }
  tosRecalc();
  toast(`TOS showing ${n} topic row${n>1?'s':''}`, 'ti');
}
function tosUpdateToggle(){
  const tos=tosGet(); const n=tos?tos.activeRows:1;
  for(let i=1;i<=6;i++){
    const b=document.getElementById('tosTcb'+i); if(b) b.className='tos-tc-btn'+(i===n?' tos-tc-on':'');
  }
}

/* ─── INSERT ROW ─── */
function tosRenderPills(){
  const tos=tosGet(); const n=tos?tos.activeRows:1;
  const wrap=document.getElementById('tosPills'); if(!wrap) return;
  wrap.innerHTML=Array.from({length:n},(_,i)=>
    `<button class="tos-pill${i===tosInsertRow?' tos-pill-on':''}" onclick="tosSetInsertRow(${i})">Row ${i+1}</button>`
  ).join('');
}
function tosSetInsertRow(i){
  const tos=tosGet(); if(!tos||i>=tos.activeRows) return;
  tosInsertRow=i; tosHighlight(); tosRenderPills();
  const h=document.getElementById('tosHint');
  if(h){ h.innerHTML=`👉 Click <b>Insert</b> on a topic → it goes into <b>Row ${i+1}</b>`; h.classList.add('show'); clearTimeout(window._tosHintT); window._tosHintT=setTimeout(()=>h.classList.remove('show'),4000); }
}
function tosHighlight(){
  const tos=tosGet(); const n=tos?tos.activeRows:6;
  for(let i=0;i<6;i++){
    const r=document.getElementById('tosTrow'+i); if(!r) continue;
    r.className=(i<n?'tos-row-on':'tos-row-off')+(i===tosInsertRow&&i<n?' tos-insert-tgt':'');
  }
}

/* ─── BANK ─── */
function tosAddToBank(){
  const sub  = document.getElementById('tosBankSub').value.trim();
  const week = document.getElementById('tosBankWeek').value.trim();
  if(!sub){ toast('Enter a topic name first.','te'); return; }
  tosBank.push({id:Date.now()+Math.random(), subject:sub, week});
  document.getElementById('tosBankSub').value='';
  document.getElementById('tosBankWeek').value='';
  document.getElementById('tosBankSub').focus();
  tosSaveBank(); tosRenderBank();
  toast(`✅ "${sub.slice(0,28)}" saved!`,'ts');
}
function tosRemoveFromBank(id){
  tosBank=tosBank.filter(b=>b.id!==id); tosSaveBank(); tosRenderBank();
}
function tosInsertFromBank(id){
  const item=tosBank.find(b=>b.id===id); if(!item){ toast('Item not found.','te'); return; }
  const tos=tosGet(); if(!tos){ toast('Create a TOS first.','te'); return; }
  const inp=document.getElementById('tosTopic'+tosInsertRow); if(!inp){ toast('Row not found.','te'); return; }
  const txt=item.week?`${item.subject} (${item.week})`:item.subject;
  inp.value=txt; tos.rows[tosInsertRow].topic=txt;
  tosRecalc(); toast(`✅ Inserted into Row ${tosInsertRow+1}!`,'ts');
  if(tosInsertRow<tos.activeRows-1) tosSetInsertRow(tosInsertRow+1);
}
function tosRenderBank(){
  const list=document.getElementById('tosBankList');
  const empty=document.getElementById('tosBankEmpty');
  if(!tosBank.length){ list.innerHTML=''; list.appendChild(empty); return; }
  if(empty && empty.parentNode===list) list.removeChild(empty);
  list.innerHTML=tosBank.map(b=>`
    <div class="tos-bank-item">
      <div style="flex:1;min-width:0;">
        <div class="tos-bank-name" title="${tosEsc(b.subject)}">${tosEsc(b.subject)}</div>
        ${b.week?`<div class="tos-bank-week">📅 ${tosEsc(b.week)}</div>`:''}
      </div>
      <button class="tos-ins-btn" onclick="tosInsertFromBank(${b.id})">Insert</button>
      <button class="tos-rm-btn" onclick="tosRemoveFromBank(${b.id})" title="Remove">✕</button>
    </div>`).join('');
}
function tosSaveBank(){ try{localStorage.setItem(TOS_BANK_KEY,JSON.stringify(tosBank));}catch(e){} }
function tosLoadBank(){ try{const r=localStorage.getItem(TOS_BANK_KEY); if(r) tosBank=JSON.parse(r)||[];}catch(e){tosBank=[];} tosRenderBank(); }

/* ─── TOS LIST MANAGEMENT ─── */
function tosAdd(){
  tosSnapshotMeta();
  const name='TOS '+(tosTosList.length+1);
  tosTosList.push(tosMkTOS(name));
  tosActiveIdx=tosTosList.length-1;
  tosInsertRow=0;
  tosRenderSwitcher(); tosPushMeta(); tosRenderTable();
  toast(`✅ "${name}" created!`,'ts'); tosDebounceSave();
}
function tosDelete(){
  if(!tosTosList.length){ toast('No TOS to delete.','te'); return; }
  const tos=tosGet();
  if(!confirm(`Delete "${tos.name}"? This cannot be undone.`)) return;
  tosTosList.splice(tosActiveIdx,1);
  tosActiveIdx=Math.max(0,Math.min(tosActiveIdx,tosTosList.length-1));
  tosRenderSwitcher();
  if(tosTosList.length){ tosPushMeta(); tosRenderTable(); }
  else{ document.getElementById('tosTblBody').innerHTML=''; document.getElementById('tosTblFoot').innerHTML=''; }
  toast('TOS deleted.','ti'); tosDebounceSave();
}
function tosSwitch(idx){
  tosSnapshotMeta(); tosActiveIdx=idx; tosInsertRow=0;
  tosRenderSwitcher(); tosPushMeta(); tosRenderTable(); tosDebounceSave();
}
function tosClearRows(){
  const tos=tosGet(); if(!tos||!confirm('Clear all row data for this TOS?')) return;
  tos.rows=Array.from({length:6},tosMkDataRow); tosRenderTable(); toast('Row data cleared.','ti');
}
function tosRenderSwitcher(){
  const tos=tosGet();
  const lbl=document.getElementById('tosLabel'); if(lbl) lbl.textContent='📊 '+(tos?.name||'TOS');
  const wrap=document.getElementById('tosSwitchWrap'); if(!wrap) return;
  const sel=document.getElementById('tosSwitchSel');
  if(tosTosList.length>1){
    wrap.style.display='block';
    sel.innerHTML=tosTosList.map((t,i)=>`<option value="${i}"${i===tosActiveIdx?' selected':''}>${tosEsc(t.name)}</option>`).join('');
  } else { wrap.style.display='none'; }
}

/* ─── META SYNC ─── */
function tosPushMeta(){
  const tos=tosGet(); if(!tos) return;
  document.getElementById('tosMSub').value     = tos.meta.subject||'';
  document.getElementById('tosMGrade').value   = tos.meta.grade||'';
  document.getElementById('tosMQuarter').value = tos.meta.quarter||'';
  document.getElementById('tosMTotal').value   = tos.meta.totalItems||40;
  document.getElementById('tosMPrepBy').value  = tos.meta.prepBy||'';
}
function tosSnapshotMeta(){
  const tos=tosGet(); if(!tos) return;
  tos.meta.subject    = document.getElementById('tosMSub').value;
  tos.meta.grade      = document.getElementById('tosMGrade').value;
  tos.meta.quarter    = document.getElementById('tosMQuarter').value;
  tos.meta.totalItems = parseInt(document.getElementById('tosMTotal').value)||40;
  tos.meta.prepBy     = document.getElementById('tosMPrepBy').value;
  /* Snapshot live row inputs */
  const n=tos.activeRows;
  for(let i=0;i<n;i++){
    const tEl=document.getElementById('tosTopic'+i); const dEl=document.getElementById('tosDays'+i);
    const cEl=document.getElementById('tosComp'+i);
    if(tEl) tos.rows[i].topic=tEl.value;
    if(dEl) tos.rows[i].days=parseFloat(dEl.value)||0;
    if(cEl) tos.rows[i].competency=cEl.value;
  }
}

/* ─── SAVE / RESTORE ─── */
function tosDebounceSave(){ clearTimeout(tosSaveTimer); tosSaveTimer=setTimeout(tosAutoSave,800); }
function tosAutoSave(){
  tosSnapshotMeta();
  try{localStorage.setItem(TOS_SAVE_KEY,JSON.stringify({tosTosList,tosActiveIdx}));}catch(e){}
}
function tosInitState(){
  try{
    const raw=localStorage.getItem(TOS_SAVE_KEY);
    if(raw){
      const d=JSON.parse(raw);
      tosTosList=d.tosTosList||[tosMkTOS('TOS 1')];
      tosActiveIdx=d.tosActiveIdx||0;
      if(tosActiveIdx>=tosTosList.length) tosActiveIdx=0;
      tosTosList.forEach(t=>{
        if(!t.rows) t.rows=Array.from({length:6},tosMkDataRow);
        while(t.rows.length<6) t.rows.push(tosMkDataRow());
        if(!t.meta) t.meta={subject:'',grade:'',quarter:'',totalItems:40,prepBy:''};
        if(!t.activeRows) t.activeRows=3;
      });
    } else {
      tosTosList=[tosMkTOS('TOS 1')]; tosActiveIdx=0;
    }
  }catch(e){ tosTosList=[tosMkTOS('TOS 1')]; tosActiveIdx=0; }
  tosLoadBank();
  tosRenderSwitcher();
  tosPushMeta();
  tosRenderTable();
}

/* ─── UTILITY ─── */
function tosEsc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function tosXml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─── DOCX EXPORT — proper OOXML .docx via JSZip (no Word errors) ─── */
async function tosDOCX(){
  tosSnapshotMeta();
  const tos=tosGet(); if(!tos){ toast('No TOS to export.','te'); return; }

  /* Load JSZip from CDN if not already loaded */
  if(typeof JSZip==='undefined'){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }

  const school  = 'UPPER KLINAN SDA SCHOOL INC';
  const addr    = 'Purok Mabinuligon, Upper Klinan, Polomolok, South Cotabato';
  const motto   = '\u201cWhere Children Enjoy Holistic Learning\u201d';
  const subject = tos.meta.subject||'';
  const grade   = tos.meta.grade||'';
  const quarter = tos.meta.quarter||'';
  const prepBy  = tos.meta.prepBy||(document.getElementById('prepBy')?document.getElementById('prepBy').value:'')||'_____________________';
  const checkBy = (document.getElementById('checkBy')?document.getElementById('checkBy').value:'')||'Nathaniel A. Lofranco';
  const ti      = tos.meta.totalItems||40;
  const n       = tos.activeRows;

  /* ── Calculations ── */
  let totalDays=0;
  const rows=tos.rows.slice(0,n).map(r=>{totalDays+=(r.days||0);return r;});
  const rawAllocs = totalDays>0 ? tosDistribute(ti, rows.map(r=>(r.days||0)/totalDays)) : rows.map(()=>0);
  const allocs=rows.map((r,i)=>{
    const pct   = totalDays>0?(r.days||0)/totalDays*100:0;
    const alloc = rawAllocs[i];
    return {topic:r.topic||'',competency:r.competency||'',days:r.days||0,pct,alloc,
            cogs:tosDistribute(alloc, TOS_COG_W)};
  });
  const cogHdrItems=tosDistribute(ti, TOS_COG_W);

  /* ── XML helpers ── */
  const X=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const NS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  /* Single border set */
  const BDR=`<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
             <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
             <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
             <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;

  /* Run property builders */
  const rFGM =(b,sz)=>`<w:rFonts w:ascii="Franklin Gothic Medium" w:hAnsi="Franklin Gothic Medium"/>${b?'<w:b/>':''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  const rCG  =(b,sz)=>`<w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/>${b?'<w:b/>':''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  const rTNR =(b,sz)=>`<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${b?'<w:b/>':''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;

  /* Paragraph builder: text, rpr-inner-xml, center?, spacing-after?, highlight? */
  const para=(text,rpr,center=true,after=0,hl='')=>`
    <w:p>
      <w:pPr>
        ${center?'<w:jc w:val="center"/>':''}
        <w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        <w:rPr>${rpr}${hl?`<w:highlight w:val="${hl}"/>`:''}
        </w:rPr>
        <w:t xml:space="preserve">${X(text)}</w:t>
      </w:r>
    </w:p>`;

  const emptyP=(after=0)=>`<w:p><w:pPr><w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;

  /* Table cell builder */
  const tc=(content,wDxa,fill='',vAlign='center')=>`
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${wDxa}" w:type="dxa"/>
        ${fill?`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`:''}
        <w:tcBorders>${BDR}</w:tcBorders>
        <w:vAlign w:val="${vAlign}"/>
      </w:tcPr>
      ${content}
    </w:tc>`;

  const cPara=(text,rpr,center=true)=>
    `<w:p><w:pPr>${center?'<w:jc w:val="center"/>':''}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
     <w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${X(text)}</w:t></w:r></w:p>`;

  /* Column widths — exact match to reference TOS docx */
  /* Content | Competency | Days | % | Items/comp | Know | Understand | Apply | Analyze+ | TOTAL */
  const CW=[1638,4991,992,851,1559,1701,1843,1559,1559,992];
  const TW=CW.reduce((a,b)=>a+b,0); // 17685

  /* ── Document body XML ── */
  const bodyXml=`
    ${para(school,   rFGM(true,20))}
    ${para(addr,     '<w:sz w:val="20"/><w:szCs w:val="20"/>')}
    ${para(motto,    '<w:rFonts w:ascii="Curlz MT" w:hAnsi="Curlz MT"/><w:color w:val="FF0000"/><w:sz w:val="20"/><w:szCs w:val="20"/>')}
    ${emptyP()}
    ${para('TABLE OF SPECIFICATIONS', rFGM(false,20), true, 0, 'yellow')}
    ${para(quarter+(subject?' \u2013 '+subject:''), rFGM(false,20), true, 0, 'yellow')}
    ${emptyP()}

    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="${TW}" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>${BDR}</w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        ${CW.map(w=>`<w:gridCol w:w="${w}"/>`).join('\n        ')}
      </w:tblGrid>

      <!-- HEADER ROW -->
      <w:tr>
        <w:trPr><w:trHeight w:val="1638"/><w:tblHeader/></w:trPr>
        ${tc(cPara('Content',             '<w:b/><w:szCs w:val="20"/>'),       CW[0])}
        ${tc(cPara('Competencies',        '<w:b/><w:szCs w:val="20"/>'),       CW[1])}
        ${tc(cPara('No. of days taught',  '<w:b/><w:szCs w:val="20"/>'),       CW[2])}
        ${tc(cPara('%',                   '<w:b/><w:szCs w:val="20"/>'),       CW[3])}
        ${tc(cPara('No. of Items per Competency','<w:b/><w:szCs w:val="20"/>'),CW[4],'F2F2F2')}
        ${tc(
            cPara('Remember/',  rTNR(true,14))+
            cPara('Knowledge',  rTNR(true,14))+
            cPara(Math.round(TOS_COG_W[0]*100)+'%',         rTNR(true,14))+
            cPara(`(${cogHdrItems[0]} items)`,rTNR(true,14)),
          CW[5])}
        ${tc(
            cPara('Understand/', rTNR(true,20))+
            cPara('Comprehend',  rTNR(true,20))+
            cPara(Math.round(TOS_COG_W[1]*100)+'%',          rTNR(true,14))+
            cPara(`(${cogHdrItems[1]} items)`, rTNR(true,14)),
          CW[6])}
        ${tc(
            cPara('Apply',   rTNR(true,20))+
            cPara(Math.round(TOS_COG_W[2]*100)+'%',          rTNR(true,14))+
            cPara(`(${cogHdrItems[2]} items)`, rTNR(true,14)),
          CW[7])}
        ${tc(
            cPara('Analyze/ Evaluate/', rTNR(true,20))+
            cPara('Create/',            rTNR(true,20))+
            cPara('Synthesize',         rTNR(true,20))+
            cPara(Math.round(TOS_COG_W[3]*100)+'%',          rTNR(true,20))+
            cPara(`(${cogHdrItems[3]} items)`, rTNR(true,14)),
          CW[8])}
        ${tc(cPara('TOTAL','<w:b/><w:szCs w:val="20"/>'), CW[9],'F2F2F2')}
      </w:tr>

      <!-- DATA ROWS -->
      ${allocs.map((a,idx)=>`
      <w:tr>
        <w:trPr><w:trHeight w:val="462"/></w:trPr>
        ${tc(cPara(a.topic||'LESSON '+(idx+1), '<w:szCs w:val="20"/>'),    CW[0])}
        ${tc(a.competency
          ? `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>${rCG(false,20)}</w:rPr><w:t xml:space="preserve">${X(a.competency)}</w:t></w:r></w:p>`
          : emptyP(),  CW[1], '', 'bottom')}
        ${tc(cPara(String(a.days),  '<w:szCs w:val="20"/>'),    CW[2])}
        ${tc(cPara(tosFmtPct(a.pct),'<w:szCs w:val="20"/>'),CW[3])}
        ${tc(cPara(String(a.alloc), '<w:szCs w:val="20"/>'),    CW[4],'F2F2F2')}
        ${a.cogs.map((c,ci)=>tc(cPara(String(c),'<w:szCs w:val="20"/>'),CW[5+ci])).join('')}
        ${tc(cPara(String(a.alloc), '<w:szCs w:val="20"/>'),    CW[9],'F2F2F2')}
      </w:tr>`).join('')}

      <!-- TOTALS ROW -->
      <w:tr>
        ${(()=>{
          const totA=allocs.reduce((s,a)=>s+a.alloc,0);
          const tC=TOS_COG_W.map((w,ci)=>allocs.reduce((s,a)=>s+a.cogs[ci],0));
          return `
            ${tc(cPara('','<w:szCs w:val="20"/>'),             CW[0],'F2F2F2')}
            ${tc(cPara('','<w:szCs w:val="20"/>'),             CW[1],'F2F2F2')}
            ${tc(cPara(String(totalDays),'<w:b/><w:szCs w:val="20"/>'), CW[2],'F2F2F2')}
            ${tc(cPara('100%',           '<w:b/><w:szCs w:val="20"/>'), CW[3],'F2F2F2')}
            ${tc(cPara(String(totA),     '<w:b/><w:szCs w:val="20"/>'), CW[4],'F2F2F2')}
            ${tC.map((c,ci)=>tc(cPara(String(c),'<w:b/><w:szCs w:val="20"/>'),CW[5+ci],'F2F2F2')).join('')}
            ${tc(cPara(String(totA),     '<w:b/><w:szCs w:val="20"/>'), CW[9],'F2F2F2')}`;
        })()}
      </w:tr>
    </w:tbl>

    ${emptyP()}

    <!-- SIGNATURE LINE 1: Prepared by / Checked by -->
    <w:p>
      <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
        <w:tabs><w:tab w:val="right" w:pos="9215"/></w:tabs>
      </w:pPr>
      <w:r><w:rPr><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">Prepared by: </w:t></w:r>
      <w:r><w:rPr><w:b/><w:u w:val="single"/><w:szCs w:val="20"/></w:rPr><w:t>${X(prepBy)}</w:t></w:r>
      <w:r><w:rPr><w:szCs w:val="20"/></w:rPr><w:tab/><w:t xml:space="preserve">Checked by: </w:t></w:r>
      <w:r><w:rPr><w:b/><w:u w:val="single"/><w:szCs w:val="20"/></w:rPr><w:t>${X(checkBy)}</w:t></w:r>
    </w:p>

    <!-- SIGNATURE LINE 2: Class Adviser / School Head -->
    <w:p>
      <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
        <w:tabs><w:tab w:val="right" w:pos="9215"/></w:tabs>
      </w:pPr>
      <w:r><w:rPr><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">   Class Adviser</w:t></w:r>
      <w:r><w:rPr><w:szCs w:val="20"/></w:rPr><w:tab/><w:t xml:space="preserve">School Head</w:t></w:r>
    </w:p>

    <!-- PAGE SETUP: Legal landscape, 0.5-inch margins -->
    <w:sectPr>
      <w:pgSz w:w="18720" w:h="12240" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>`;

  /* ── Assemble proper OOXML .docx package ── */
  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>${bodyXml}</w:body>
</w:document>`;

  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/>
        <w:sz w:val="20"/><w:szCs w:val="20"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders></w:tblPr>
  </w:style>
</w:styles>`;

  const settingsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${NS}>
  <w:defaultTabStop w:val="720"/>
  <w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>`;

  const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

  const pkgRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"   Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

  try{
    const zip=new JSZip();
    zip.file('[Content_Types].xml',  contentTypes);
    zip.file('_rels/.rels',          pkgRels);
    zip.file('word/document.xml',    docXml);
    zip.file('word/styles.xml',      stylesXml);
    zip.file('word/settings.xml',    settingsXml);
    zip.file('word/_rels/document.xml.rels', wordRels);

    const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    const parts=['TOS',(subject||'Subject').replace(/\s+/g,'_'),(grade||'').replace(/\s+/g,'_'),(quarter||'').replace(/\s+/g,'_')].filter(Boolean);
    const fname=parts.join('_')+'.docx';
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=fname; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast('✅ TOS downloaded as proper Word (.docx)!','ts');
  }catch(e){ console.error(e); toast('❌ TOS export error: '+e.message,'te'); }
}

/* ─── BOOT TOS after main page loads ─── */
document.addEventListener('DOMContentLoaded', ()=>{
  /* Wire meta inputs */
  ['tosMSub','tosMGrade','tosMQuarter','tosMPrepBy'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('input',tosDebounceSave);
  });
  /* Init TOS state (runs after LP restore logic) */
  setTimeout(tosInitState, 200);
  /* Init Final Exam — retry at 1s and 2.5s to ensure TOS is loaded */
  setTimeout(feInit, 800);
  setTimeout(fePopulateTOSSel, 2500);
});

/* ══════════════════════════════════════════════════════
   FINAL EXAM MANAGEMENT — Multiple Choice, TOS-aligned
   NOTE: These are shared Final Exam constants used by
   js/final-exam.js, kept here because this is exactly
   where they appeared in the original file.
══════════════════════════════════════════════════════ */

const FE_SAVE_KEY = 'lp_final_exam_v1';
let feExamItems = [];   // [{num, competency, topic, question, choices:[A,B,C,D], answer}]
let feGenAbort  = false;
let feSaveTimer = null;

/* ── Debounce save ── */