/* ============================================================
   API KEY MANAGER — multi-key storage, provider detection,
   quota tracking, key testing/rotation.
   ============================================================ */
/* ════════════════════════════════
   CONSTANTS & STATE
════════════════════════════════ */

/* ── Provider auto-detection (defined first so all functions can use it) ── */
function feDetectProvider(key, declared){
  if(declared && declared !== 'auto') return declared;
  if(!key) return 'gemini';
  if(key.startsWith('AIza'))          return 'gemini';
  if(key.startsWith('nvapi-'))        return 'nvidia';
  if(key.startsWith('sk-or-'))        return 'openrouter';
  if(key.startsWith('sk-') && key.includes('deepseek')) return 'deepseek';
  if(key.startsWith('sk-'))           return 'openai';
  if(key.startsWith('gsk_'))          return 'groq';
  if(key.startsWith('mistral'))       return 'mistral';
  if(key.length === 40 && /^[a-zA-Z0-9]+$/.test(key)) return 'cohere';
  return 'gemini'; // fallback
}

const SAVE_KEY  = 'lp_v5';
const APIKEY_K  = 'lp_apikey';
const MKKEYS_K  = 'lp_multikeys'; // multi-key storage key

const CUSTOM_ANSWER_TYPE = 'Custom Answer Set (2-6 Answers)';

const SUMMATIVE_TYPES = [
  'True or False',
  'True or False (Write the Correct Answer)',
  'Multiple Choice',
  'Matching Type',
  'Word Bank',
  'Identification',
  'Enumeration',
  'Fill in the Blanks',
  'Short Answer',
  'Essay / Extended Response',
  'Performance Task',
  'Problem Solving',
  'Oral Recitation',
  'Practical Test',
  CUSTOM_ANSWER_TYPE,
];

/* ════════════════════════════════
   MULTI-KEY STATE
════════════════════════════════ */
// Each key: { id, name, key, quotaHit: false, lastTested: null }
let mkKeys  = [];
let mkActive = 0; // index of currently active key

let mkApiOpen = false;

/* ════════════════════════════════
   MULTI-KEY SAVE
════════════════════════════════ */
function mkSave(){
  try {
    localStorage.setItem(MKKEYS_K, JSON.stringify({ keys: mkKeys, active: mkActive }));
  } catch(e){ console.warn('mkSave failed:', e); }
  updateMkSummary();
}

function toggleApiManager(){
  mkApiOpen = !mkApiOpen;
  const body = document.getElementById('mkBody');
  const icon = document.getElementById('mkCollapseIcon');
  if(mkApiOpen){
    body.style.maxHeight = body.scrollHeight + 600 + 'px';
    body.style.opacity = '1';
    body.style.pointerEvents = 'auto';
    icon.style.transform = 'rotate(180deg)';
  } else {
    body.style.maxHeight = '0';
    body.style.opacity = '0';
    body.style.pointerEvents = 'none';
    icon.style.transform = 'rotate(0deg)';
  }
}

function updateMkSummary(){
  const el = document.getElementById('mkStatusSummary');
  if(!el) return;
  if(!mkKeys.length){
    el.textContent = '⚠️ No API keys added yet — click to add one.';
    el.style.color = '#C62828';
    return;
  }
  const active = mkKeys[mkActive];
  const providerLabels = {gemini:'Gemini',openai:'OpenAI',groq:'Groq',cohere:'Cohere',mistral:'Mistral',nvidia:'NVIDIA NIM',together:'Together AI',openrouter:'OpenRouter',custom:'Custom',auto:'Auto'};
  const providerName = providerLabels[active?.provider||'gemini']||'AI';
  const quota = mkKeys.filter(k=>k.quotaHit).length;
  const ok = mkKeys.length - quota;
  el.style.color = '';
  el.textContent = `${mkKeys.length} key${mkKeys.length>1?'s':''} — Active: "${active?.name||'—'}" (${providerName}) · ${ok} OK${quota?`, ${quota} quota hit`:''}`;
}

function mkLoad(){
  try {
    const raw = localStorage.getItem(MKKEYS_K);
    if(raw){
      const d = JSON.parse(raw);
      mkKeys   = d.keys  || [];
      mkActive = d.active|| 0;
      if(mkActive >= mkKeys.length) mkActive = 0;
    }
    // Legacy: migrate old single-key
    const legacy = localStorage.getItem(APIKEY_K);
    if(legacy && mkKeys.length === 0){
      mkKeys = [{ id: Date.now(), name:'Key 1', key: legacy, provider:'gemini', quotaHit: false }];
      mkActive = 0;
      mkSave();
    }
  } catch(e){ mkKeys = []; mkActive = 0; }
  renderKeyList();
}

function getActiveKey(){
  if(!mkKeys.length) return null;
  // Try from active index onward
  for(let i=0;i<mkKeys.length;i++){
    const idx = (mkActive + i) % mkKeys.length;
    if(!mkKeys[idx].quotaHit){ mkActive = idx; mkSave(); return mkKeys[idx].key; }
  }
  return null; // all quota hit
}

function markQuota(key){
  const idx = mkKeys.findIndex(k=>k.key === key);
  if(idx!==-1){ mkKeys[idx].quotaHit = true; mkSave(); }
  // Try rotating
  const next = mkKeys.findIndex((k,i)=> i !== idx && !k.quotaHit);
  if(next !== -1){
    mkActive = next; mkSave();
    toast(`⚠️ Quota hit on "${mkKeys[idx]?.name||'key'}". Rotating to "${mkKeys[next].name}"…`,'ti');
    renderKeyList();
    return true; // rotated
  }
  renderKeyList();
  return false; // no more keys
}

function onProviderChange(){
  const p = document.getElementById('mkProvider').value;
  const placeholders = {
    auto:       'Paste any API key — provider auto-detected',
    gemini:     'AIza… (Gemini key)',
    openai:     'sk-… (OpenAI key)',
    groq:       'gsk_… (Groq key)',
    cohere:     'Cohere API key',
    mistral:    'Mistral API key',
    nvidia:     'nvapi-… (NVIDIA NIM key)',
    together:   'Together AI key',
    openrouter: 'sk-or-… (OpenRouter key)',
    custom:     'Your API key',
  };
  document.getElementById('mkKeyInput').placeholder = placeholders[p] || 'API Key…';
  const allHelp = ['Auto','Gemini','Openai','Groq','Cohere','Mistral','Nvidia','Together','Openrouter','Custom'];
  allHelp.forEach(n=>{
    const el = document.getElementById('mkHelp'+n);
    if(el) el.style.display = p===n.toLowerCase() ? '' : 'none';
  });
  const customRow = document.getElementById('mkCustomUrlRow');
  if(customRow) customRow.style.display = p==='custom' ? '' : 'none';
}

function addApiKey(){
  const name      = document.getElementById('mkNickname').value.trim() || `Key ${mkKeys.length+1}`;
  const key       = document.getElementById('mkKeyInput').value.trim();
  const provider  = document.getElementById('mkProvider').value || 'auto';
  const customUrl = document.getElementById('mkCustomUrl')?.value.trim()  || '';
  const customMod = document.getElementById('mkCustomModel')?.value.trim() || '';
  if(!key){ toast('Paste an API key first.','te'); return; }
  if(mkKeys.find(k=>k.key===key)){ toast('That key is already saved.','te'); return; }
  mkKeys.push({ id: Date.now(), name, key, provider, customUrl, customMod, quotaHit: false });
  if(mkKeys.length === 1) mkActive = 0;
  mkSave();
  document.getElementById('mkNickname').value = '';
  document.getElementById('mkKeyInput').value  = '';
  renderKeyList();
  // Refresh open panel height
  if(mkApiOpen){ const b=document.getElementById('mkBody'); b.style.maxHeight=b.scrollHeight+600+'px'; }
  toast(`✅ "${name}" (${provider}) added!`, 'ts');
}

function removeApiKey(id){
  const idx = mkKeys.findIndex(k=>k.id===id);
  if(idx === -1) return;
  if(!confirm(`Remove key "${mkKeys[idx].name}"?`)) return;
  mkKeys.splice(idx,1);
  if(mkActive >= mkKeys.length) mkActive = Math.max(0, mkKeys.length-1);
  mkSave(); renderKeyList();
}

function setActiveKey(id){
  const idx = mkKeys.findIndex(k=>k.id===id);
  if(idx===-1) return;
  mkActive = idx; mkSave(); renderKeyList();
  toast(`✅ Switched to "${mkKeys[idx].name}"`, 'ts');
}

function resetQuota(id){
  const k = mkKeys.find(k=>k.id===id);
  if(k){ k.quotaHit=false; mkSave(); renderKeyList(); toast(`Quota reset for "${k.name}".`,'ti'); }
}

function resetAllQuotas(){
  mkKeys.forEach(k=>k.quotaHit=false);
  mkSave(); renderKeyList(); toast('All quotas reset.','ti');
}

function toggleNewKey(){
  const el=document.getElementById('mkKeyInput');
  el.type = el.type==='password'?'text':'password';
}

async function testKey(id){
  const k = mkKeys.find(k=>k.id===id);
  if(!k) return;
  toast(`Testing "${k.name}"…`,'ti');
  try {
    let resp;
    const provider = feDetectProvider(k.key, k.provider);
    const OAI_MSG  = {model:'',max_tokens:5,messages:[{role:'user',content:'Hi'}]};

    if(provider==='openai'){
      OAI_MSG.model='gpt-4o-mini';
      resp = await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='groq'){
      OAI_MSG.model='llama-3.3-70b-versatile';
      resp = await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='deepseek'){
      OAI_MSG.model='deepseek-chat';
      resp = await fetch('https://api.deepseek.com/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='mistral'){
      OAI_MSG.model='mistral-small-latest';
      resp = await fetch('https://api.mistral.ai/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='nvidia'){
      OAI_MSG.model='meta/llama-3.1-8b-instruct';
      resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='openrouter'){
      OAI_MSG.model='openrouter/free';
      resp = await fetch('https://openrouter.ai/api/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key,
          'HTTP-Referer':'https://localhost','X-Title':'Exam Generator'},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='together'){
      OAI_MSG.model='meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo';
      resp = await fetch('https://api.together.xyz/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else if(provider==='cohere'){
      resp = await fetch('https://api.cohere.com/v2/chat',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify({model:'command-r-plus',max_tokens:5,messages:[{role:'user',content:'Hi'}]})
      });
    } else if(provider==='custom'){
      const baseUrl = (k.customUrl||'').replace(/\/$/,'');
      if(!baseUrl){ toast(`❌ "${k.name}": No custom base URL set.`,'te'); return; }
      OAI_MSG.model = k.customMod||'default';
      resp = await fetch(baseUrl+'/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+k.key},
        body:JSON.stringify(OAI_MSG)
      });
    } else {
      /* Gemini — default */
      resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${k.key}`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:'Hi'}]}],generationConfig:{maxOutputTokens:5}})
      });
    }
    if(!resp.ok){
      const e=await resp.json().catch(()=>({}));
      throw new Error((e.error?.message||e.error?.code||e.message)||`HTTP ${resp.status}`);
    }
    k.quotaHit=false; mkSave(); renderKeyList();
    toast(`✅ "${k.name}" (${provider}) works!`,'ts');
  } catch(e){
    const msg = e.message||'';
    if(msg.includes('429')||msg.toLowerCase().includes('quota')||msg.includes('insufficient_quota')||msg.includes('rate_limit')){
      k.quotaHit=true; mkSave(); renderKeyList();
      toast(`⚠️ "${k.name}" hit quota/rate-limit.`,'te');
    } else {
      toast(`❌ "${k.name}": ${msg}`,'te');
    }
  }
}

function setActiveKeyByIndex(idx){
  const i = parseInt(idx);
  if(isNaN(i)||i<0||i>=mkKeys.length) return;
  mkActive = i; mkSave(); renderKeyList();
  toast('✅ Switched to "' + mkKeys[i].name + '"', 'ts');
}

function renderKeyList(){
  const list     = document.getElementById('mkList');
  const empty    = document.getElementById('mkEmpty');
  const selRow   = document.getElementById('mkSelectorRow');
  const dropdown = document.getElementById('mkDropdown');
  const note     = document.getElementById('mkRotateNote');

  if(!mkKeys.length){
    list.innerHTML = '';
    list.appendChild(empty);
    selRow.style.display = 'none';
    return;
  }
  if(empty && empty.parentNode===list) list.removeChild(empty);

  // Populate dropdown
  selRow.style.display = 'block';
  dropdown.innerHTML = mkKeys.map((k,i)=>{
    const tag = k.quotaHit ? ' ⚠ Quota Hit' : (i===mkActive ? ' ✓' : '');
    const _pt = feDetectProvider(k.key, k.provider);
    const pTag = {'gemini':'[Gemini] ','openai':'[OpenAI] ','groq':'[Groq] ','cohere':'[Cohere] ',
      'mistral':'[Mistral] ','nvidia':'[NVIDIA] ','together':'[Together] ','openrouter':'[OpenRouter] ',
      'custom':'[Custom] '}[_pt]||'[AI] ';
    return `<option value="${i}" ${i===mkActive?'selected':''}>${pTag}${esc(k.name)}${tag}</option>`;
  }).join('');
  note.style.display = mkKeys.length > 1 ? 'block' : 'none';

  // Render key list rows
  list.innerHTML = mkKeys.map((k,i)=>{
    const isActive = i === mkActive;
    const cls = k.quotaHit ? 'quota-hit' : (isActive ? 'active-key' : '');
    const badgeCls = k.quotaHit ? 'badge-quota' : (isActive ? 'badge-active' : 'badge-idle');
    const badgeTxt = k.quotaHit ? '⚠ Quota Hit' : (isActive ? '✓ Active' : 'Standby');
    const preview  = k.key ? k.key.slice(0,8)+'\u2026'+k.key.slice(-4) : '\u2014';
    const _prov = feDetectProvider(k.key, k.provider);
    const providerLabel = {
      gemini:'🟦 Gemini', openai:'🟩 OpenAI', groq:'🟧 Groq', cohere:'🟪 Cohere',
      mistral:'🟥 Mistral', nvidia:'🟢 NVIDIA', together:'🟫 Together', openrouter:'🌐 OpenRouter',
      custom:'⚙️ Custom', auto:'🔑 Auto'
    }[_prov] || '🔑 '+_prov;
    return `<div class="mk-item ${cls}">
      <span class="mk-badge ${badgeCls}">${badgeTxt}</span>
      <span class="mk-name">${esc(k.name)}</span>
      <span style="font-size:10px;color:var(--muted);font-weight:700;">${providerLabel}</span>
      <span class="mk-key-preview" title="${esc(k.key)}">${preview}</span>
      ${!isActive?`<button class="btn bo bxs" onclick="setActiveKey(${k.id})">Use</button>`:''}
      <button class="btn bo bxs" onclick="testKey(${k.id})">⚡ Test</button>
      ${k.quotaHit?`<button class="btn bo bxs" onclick="resetQuota(${k.id})">↺ Reset</button>`:''}
      <button class="btn br bxs" onclick="removeApiKey(${k.id})">🗑</button>
    </div>`;
  }).join('');
  updateMkSummary();
}

const GRADE_SUBJECTS = {
  '4': ['Bible','Filipino 4','English 4','Math 4','Science','Arpan','EPP','MAPEH','GMRC'],
  '5': ['Bible','Filipino 5','English 5','Math 5','Science','Arpan','EPP','MAPEH','GMRC'],
  '6': ['Bible','Filipino 6','English 6','Math 6','Science','Arpan','EPP','MAPEH','GMRC'],
  'multi': ['Bible','Filipino 4','Filipino 5','Filipino 6','English 4','English 5','English 6','Math 4','Math 5','Math 6','Science','Arpan','EPP','MAPEH','GMRC'],
};

let state = { subjects: [...GRADE_SUBJECTS['4']], rows: [], summatives: [], sumRefSubject: '' };
let saveTimer = null;

/* ════════════════════════════════
   INIT
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  mkLoad();
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    document.getElementById('restoreMo').classList.add('show');
  } else {
    initRows();
    renderSubs();
    renderTable();
    renderSummativesTable();
  }
  window.addEventListener('beforeunload', autoSave);
});