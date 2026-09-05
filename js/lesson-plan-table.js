/* ============================================================
   WEEKLY LESSON PLAN / POINTERS TABLE — row management, AI
   generation of the weekly table, and DOCX export.
   ============================================================ */
function renderTable(){
  const tbody=document.getElementById('ltBody');
  tbody.innerHTML='';
  state.rows.forEach((row,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="slbl"><div class="ed" contenteditable="true" data-r="${i}" data-c="area" placeholder="Subject">${esc(row.area)}</div></td>
      <td>
        <div class="sm-wrap">
          <div class="ed" contenteditable="true" data-r="${i}" data-c="subjectMatter" placeholder="Type topic here&#10;e.g. Plants and their Uses&#10;Reference: Book pg. XX">${esc(row.subjectMatter)}</div>
          <button class="sm-search-btn" id="smBtn_${i}" onclick="searchBySubjectMatter(${i})" title="AI will fill all columns based on this subject matter">
            🔍 Search &amp; Auto-Fill Row
          </button>
        </div>
      </td>
      <td><div class="ed" contenteditable="true" data-r="${i}" data-c="competencies" placeholder="At the end of the lesson, learners should be able to…">${esc(row.competencies)}</div></td>
      <td><div class="ed" contenteditable="true" data-r="${i}" data-c="objectives" placeholder="a. …&#10;b. …&#10;c. …">${esc(row.objectives)}</div></td>
      <td style="background:#F1F8E9;"><div class="ed" contenteditable="true" data-r="${i}" data-c="faith" placeholder='✝ Bible verse or faith value…&#10;"[verse text]"&#10;— Reference'>${esc(row.faith)}</div></td>
      <td><div class="ed" contenteditable="true" data-r="${i}" data-c="mon" placeholder='Strategy: "…"&#10;1. Question&#10;2. Question&#10;3. Question'>${esc(row.mon)}</div></td>
      <td><div class="ed" contenteditable="true" data-r="${i}" data-c="tue" placeholder='Strategy: "…"&#10;1. Question&#10;2. Question&#10;3. Question'>${esc(row.tue)}</div></td>
      <td><div class="ed" contenteditable="true" data-r="${i}" data-c="wed" placeholder='Strategy: "…"&#10;1. Question&#10;2. Question&#10;3. Question'>${esc(row.wed)}</div></td>
      <td class="sumcell"><div class="ed" contenteditable="true" data-r="${i}" data-c="thu" style="text-align:center;font-weight:700">${esc(row.thu||'SUMMATIVE')}</div></td>
      <td><div class="ed" contenteditable="true" data-r="${i}" data-c="fri" placeholder="Home-based activity…">${esc(row.fri)}</div></td>
      <td>
        <div class="ra">
          <button class="regen" onclick="regenRow(${i})">🔄 AI</button>
          <button class="btn br bxs" onclick="delRow(${i})">🗑</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[contenteditable]').forEach(el=>{
    el.addEventListener('input', e=>{
      const el=e.currentTarget, i=+el.dataset.r, c=el.dataset.c;
      if(!isNaN(i)&&state.rows[i]) state.rows[i][c]=el.innerText;
      debounceSave();
    });
  });
}

function addRow(){
  const s=prompt('Subject / Learning Area name:');
  if(s===null) return;
  const v=s.trim()||'New Subject';
  state.subjects.push(v); state.rows.push(mkRow(v)); state.summatives.push(mkSummativeMeta());
  renderSubs(); renderTable(); renderSummativesTable();
}
function delRow(i){
  if(!confirm(`Delete "${state.rows[i].area}" row?`)) return;
  state.rows.splice(i,1); state.subjects.splice(i,1); state.summatives.splice(i,1);
  renderSubs(); renderTable(); renderSummativesTable();
}
function clearTable(){
  if(!confirm('Clear all generated content?')) return;
  state.rows = state.subjects.map(s=>mkRow(s));
  ensureSummatives();
  renderTable(); renderSummativesTable();
}

/* ════════════════════════════════
   AI GENERATE (ALL)
════════════════════════════════ */
async function generateAll(){
  const apiKey = getActiveKey();
  if(!apiKey){ toast('Please add at least one API Key first.','te'); return; }
  const topic = gv('globalTopic').trim();
  if(!topic){ toast('Please enter a topic first.','te'); return; }

  syncDOM();
  document.getElementById('genBtn').disabled=true;
  const gp=document.getElementById('gp'); gp.classList.add('show');
  setProgress(5,'Connecting to AI…');

  try {
    const result = await callAI(apiKey, topic, state.rows.map(r=>r.area).filter(Boolean), gv('gradeLevel'), gv('quarter'));
    setProgress(90,'Updating table…');
    applyResult(result);
    renderTable();
    renderSummativesTable();
    setProgress(100,'Done!');
    toast('Lesson plan generated!','ts');
    autoSave();
    setTimeout(()=>gp.classList.remove('show'),2000);
  } catch(e){
    if(e.message==='QUOTA' && markQuota(apiKey)){
      // rotated — retry once automatically
      gp.classList.remove('show');
      document.getElementById('genBtn').disabled=false;
      toast('🔄 Retrying with next key…','ti');
      setTimeout(()=>generateAll(), 800);
      return;
    }
    handleApiError(e);
    gp.classList.remove('show');
  } finally {
    document.getElementById('genBtn').disabled=false;
  }
}

/* AI GENERATE (SINGLE ROW) */
async function regenRow(i){
  const apiKey = getActiveKey();
  if(!apiKey){ toast('Add an API Key first.','te'); return; }
  const topic = gv('globalTopic').trim()||state.rows[i].area;
  const area = state.rows[i].area;
  syncDOM();
  toast(`Regenerating ${area}…`,'ti');
  try {
    const result = await callAI(apiKey, topic, [area], gv('gradeLevel'), gv('quarter'));
    applyResult(result);
    renderTable();
    renderSummativesTable();
    toast(`${area} updated!`,'ts');
    autoSave();
  } catch(e){
    if(e.message==='QUOTA' && markQuota(apiKey)){
      toast('🔄 Quota hit, retrying with next key…','ti');
      setTimeout(()=>regenRow(i), 800);
      return;
    }
    handleApiError(e);
  }
}

/* CORE AI CALL — routes to Gemini or OpenAI based on active key provider */
function buildPrompt(topic, subjects, grade, quarter){
  const gradeDisplay = grade==='multi'?'Multi-Grade (4-5-6)':`Grade ${grade}`;
  const school = 'UPPER KLINAN SDA SCHOOL INC (Seventh-day Adventist, Philippines)';
  /* Per-subject language tag: ONLY Filipino & Arpan are written in Filipino; everything else is English. */
  const isFil = a => /\bfilipino\b/i.test(a||'') || /\barpan\b/i.test(a||'');
  const subjectLines = subjects.map((s,i)=>`${i+1}. ${s}  →  WRITE IN ${isFil(s) ? 'FILIPINO (Tagalog)' : 'ENGLISH'}`).join('\n');
  return { gradeDisplay, school, prompt: `You are an expert Filipino elementary school lesson plan writer for ${school}.
Return ONLY raw valid JSON. No markdown, no backticks, no explanation whatsoever.

Rules:
- CRITICAL LANGUAGE RULE (per subject, follow the language tag in the subject list below exactly):
  • ONLY subjects whose area contains "Filipino" (e.g. Filipino 4/5/6) OR "Arpan" are written entirely in Filipino (Tagalog) — all fields: subjectMatter, competencies, objectives, mon, tue, wed, fri. No English except proper nouns.
  • EVERY other subject (Bible, English, Math, Science, EPP, MAPEH, GMRC, etc.) MUST be written entirely in English. Do NOT use Filipino/Tagalog for these, not even partially.
  • Decide the language for EACH subject independently. Do not let one Filipino subject make the others Filipino.
- Bible: use NIV, include verse text and reference (in English, since Bible is an English subject).
- Strategies (rotate): Writing Pairs, Round Robin, Rally Table, Think-Pair-Share, Think-Square-Share, KWL, Think-Pair-Square
- Each day: 1 strategy label + 3 numbered discussion questions
- Thursday: always exactly "SUMMATIVE"
- Friday/Home-Based: short label only. For Filipino subjects use Filipino labels (e.g. PAGBASA AT PAGSULAT, PAGGUHIT AT PAGSULAT, MGA TANONG SA BIBLIYA)

JSON format (exact):
{"subjects":[{"area":"...","subjectMatter":"Topic Title\nSanggunian/Reference: BookName pg. XX","competencies":"At the end of the lesson, the learners should be able to [specific competency].","objectives":"a. [obj]\nb. [obj]\nc. [obj]","faith":"\"[verse text]\"\n— [Reference]","mon":"Strategy: \"[Name]\"\n1. [question]\n2. [question]\n3. [question]","tue":"Strategy: \"[Name]\"\n1. [question]\n2. [question]\n3. [question]","wed":"Strategy: \"[Name]\"\n1. [question]\n2. [question]\n3. [question]","thu":"SUMMATIVE","fri":"[HOME LABEL]"}]}

Weekly topic: "${topic}"
Grade: ${gradeDisplay} | Quarter: ${quarter} | School: ${school}

Generate complete lesson plan entries for:
${subjectLines}

Use accurate Philippine K-12 curriculum competencies. Use real textbook references (Angkla, HELE, MAPEH, Science, Math, Sibika/Araling Panlipunan, Hiyas, Bible, etc.).` };
}

function parseAIJson(raw){
  let js = String(raw||'').replace(/```json|```/g,'').trim();
  const s=js.indexOf('{'), e=js.lastIndexOf('}');
  if(s!==-1&&e!==-1) js=js.slice(s,e+1);
  if(!js) throw new Error('AI returned empty content. Try again.');
  try { return JSON.parse(js); }
  catch(_){
    /* Repair the most common AI formatting mistakes, then retry once. */
    const fixed = js
      .replace(/[\u201C\u201D]/g,'"').replace(/[\u2018\u2019]/g,"'")  // smart quotes → straight
      .replace(/,\s*([}\]])/g,'$1')                                    // trailing commas
      .replace(/}\s*{/g,'},{');                                        // missing comma between objects
    return JSON.parse(fixed);
  }
}

async function callAI(apiKey, topic, subjects, grade, quarter){
  const activeKeyObj = mkKeys[mkActive] || {};
  const provider = activeKeyObj.provider || 'gemini';
  const { prompt } = buildPrompt(topic, subjects, grade, quarter);

  const providerNames = {gemini:'Gemini AI', openai:'OpenAI', groq:'Groq AI', cohere:'Cohere AI', mistral:'Mistral AI', deepseek:'DeepSeek AI', nvidia:'NVIDIA', together:'Together AI', openrouter:'OpenRouter'};
  setProgress(20, `Asking ${providerNames[provider]||'AI'}…`);

  if(provider === 'deepseek'){
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({
        model:'deepseek-chat', max_tokens:8192, temperature:0.7,
        messages:[
          {role:'system',content:'Return only valid JSON, no markdown, no backticks.'},
          {role:'user',content:prompt}
        ]
      })
    });
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      const errMsg = errData.error?.message||`HTTP ${resp.status}`;
      if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
      if(resp.status===401) throw new Error('Unauthorized');
      throw new Error(errMsg);
    }
    setProgress(70,'Parsing response…');
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content||'';
    if(!raw) throw new Error('DeepSeek returned empty content. Try again.');
    return parseAIJson(raw);

  } else if(provider === 'mistral'){
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({
        model:'mistral-small-latest', max_tokens:8192, temperature:0.7,
        messages:[
          {role:'system',content:'Return only valid JSON, no markdown, no backticks.'},
          {role:'user',content:prompt}
        ]
      })
    });
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      const errMsg = errData.message||errData.error?.message||`HTTP ${resp.status}`;
      if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
      if(resp.status===401) throw new Error('Unauthorized');
      throw new Error(errMsg);
    }
    setProgress(70,'Parsing response…');
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content||'';
    if(!raw) throw new Error('Mistral returned empty content. Try again.');
    return parseAIJson(raw);

  } else if(provider === 'openai' || provider === 'groq'){
    const url = provider==='groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = provider==='groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
    const body = {model, max_tokens:8192, temperature:0.7,
      messages:[{role:'system',content:'Return only valid JSON, no markdown, no backticks.'},{role:'user',content:prompt}]};
    if(provider==='openai') body.response_format={type:'json_object'};
    const resp = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify(body)
    });
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      const errMsg = errData.error?.message || `HTTP ${resp.status}`;
      if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
      throw new Error(errMsg);
    }
    setProgress(70,'Parsing response…');
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if(!raw) throw new Error(`${providerNames[provider]} returned empty content. Try again.`);
    return parseAIJson(raw);

  } else if(provider === 'cohere'){
    const resp = await fetch('https://api.cohere.com/v2/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({
        model:'command-r-plus',
        max_tokens:8192,
        temperature:0.7,
        messages:[
          {role:'system',content:'Return only valid JSON, no markdown, no backticks.'},
          {role:'user',content:prompt}
        ]
      })
    });
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      const errMsg = errData.message || `HTTP ${resp.status}`;
      if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
      throw new Error(errMsg);
    }
    setProgress(70,'Parsing response…');
    const data = await resp.json();
    const raw = data.message?.content?.[0]?.text || '';
    if(!raw) throw new Error('Cohere returned empty content. Try again.');
    return parseAIJson(raw);

  } else if(provider === 'openrouter'){
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey,
        'HTTP-Referer':'https://localhost','X-Title':'Lesson Plan Generator'},
      body:JSON.stringify({
        model:'openrouter/free',
        max_tokens:2048,
        temperature:0.7,
        messages:[
          {role:'system',content:'Return only valid JSON, no markdown, no backticks.'},
          {role:'user',content:prompt}
        ]
      })
    });
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      const raw = errData.error?.metadata?.raw;
      const inner = raw ? (() => { try { return JSON.parse(raw); } catch(_){ return null; } })() : null;
      const errMsg = inner?.error?.message || errData.error?.message || `HTTP ${resp.status}`;
      if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
      throw new Error('OpenRouter: ' + errMsg);
    }
    setProgress(70,'Parsing response…');
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if(!raw) throw new Error('OpenRouter returned empty content. Try again.');
    return parseAIJson(raw);

  } else {
    // Gemini
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0.7,maxOutputTokens:8192,responseMimeType:'application/json'}
      })
    });
    if(!resp.ok){
      const errData=await resp.json().catch(()=>({}));
      const errMsg = errData.error?.message || `HTTP ${resp.status}`;
      if(resp.status===429) throw new Error('QUOTA');
      throw new Error(errMsg);
    }
    setProgress(70,'Parsing response…');
    const data = await resp.json();
    let raw = '';
    try { raw = data.candidates[0].content.parts[0].text || ''; }
    catch(_){ throw new Error('Unexpected response from Gemini. Try again.'); }
    return parseAIJson(raw);
  }
}

/* SEARCH BY SUBJECT MATTER — fills one row based on typed subject matter */
async function searchBySubjectMatter(i){
  const apiKey = getActiveKey();
  if(!apiKey){ toast('Add an API Key first.','te'); return; }

  syncDOM();
  const row = state.rows[i];
  const subjectMatter = (row.subjectMatter||'').trim();
  if(!subjectMatter){ toast('Type a topic/subject matter in the cell first, then click Search.','te'); return; }

  const btn = document.getElementById('smBtn_'+i);
  if(btn){ btn.disabled=true; btn.className='sm-search-btn loading'; btn.textContent='⏳ Searching…'; }
  toast(`Searching "${subjectMatter}" for ${row.area}…`,'ti');

  const grade = gv('gradeLevel');
  const gradeDisplay = grade==='multi'?'Multi-Grade (4-5-6)':`Grade ${grade}`;
  const quarter = gv('quarter');
  const school = 'UPPER KLINAN SDA SCHOOL INC (Seventh-day Adventist, Philippines)';
  const isfilipinoArea = /filipino|arpan/i.test(row.area);

  // Detect if the typed subject matter itself is in Filipino/Tagalog
  // by checking for common Filipino words and letter patterns
  const filipinoWords = /\b(ang|ng|mga|na|sa|ay|at|ni|si|para|kung|ano|bakit|paano|ito|iyon|sila|kami|tayo|namin|natin|nila|kanila|akin|iyo|kanya|aming|inyong|kanilang|nang|din|rin|pa|nga|ba|po|ho|daw|raw|sana|kaya|pero|dahil|kapag|habang|upang|bilang|halimbawa|paaralan|guro|mag-aaral|aralin|paksa|layunin|kasanayan|pagbabasa|pagsulat|pagbibilang|kalikasan|lipunan|wika|bansa|tahanan|pamilya|kalusugan|katawan|hayop|halaman|tubig|hangin|lupa|apoy|langit|araw|buwan|bituin)\b/i;

  const isFilipino = isfilipinoArea || filipinoWords.test(subjectMatter);

  const prompt = `You are an expert Filipino elementary school lesson plan writer for ${school}.
Return ONLY raw valid JSON. No markdown, no backticks, no explanation.

The teacher has already entered the Subject Matter: "${subjectMatter}" for the subject "${row.area}".
Based on this subject matter, fill in ALL the other columns for this one subject row.

Rules:
- Subject: ${row.area} | Grade: ${gradeDisplay} | Quarter: ${quarter}
${isFilipino ? '- CRITICAL: The subject matter is written in Filipino language. ALL fields (competencies, objectives, mon, tue, wed, fri) MUST be written entirely in Filipino language. Strategy names stay in English but ALL questions and content must be in Filipino. Do NOT use English in any answer field.' : '- Use English for all content'}
- Bible subject: use NIV bible verse relevant to the topic
- Strategies (rotate Mon/Tue/Wed): Writing Pairs, Round Robin, Rally Table, Think-Pair-Share, Think-Square-Share, KWL, Think-Pair-Square
- Each day (mon/tue/wed): 1 strategy label + 3 numbered discussion questions based on the subject matter
- Thursday: always exactly "SUMMATIVE"
- Home-Based (fri): short activity label only (e.g. READING AND ARTS, DRAWING AND WRITING, BIBLE QUESTIONS, PAGBASA AT PAGSULAT)
- Keep the subjectMatter field exactly as: "${subjectMatter}"
- Use real Philippine K-12 curriculum competencies for ${row.area}

Return this exact JSON structure (one subject only):
{"area":"${row.area}","subjectMatter":"${subjectMatter}","competencies":"At the end of the lesson, the learners should be able to [specific competency based on the subject matter].","objectives":"a. [objective]\nb. [objective]\nc. [objective]","faith":"\"[relevant Bible verse or faith value]\"\n— [Reference or Source]","mon":"Strategy: \"[Name]\"\n1. [question about ${subjectMatter}]\n2. [question]\n3. [question]","tue":"Strategy: \"[Name]\"\n1. [question about ${subjectMatter}]\n2. [question]\n3. [question]","wed":"Strategy: \"[Name]\"\n1. [question about ${subjectMatter}]\n2. [question]\n3. [question]","thu":"SUMMATIVE","fri":"[HOME ACTIVITY LABEL]"}`;

  try {
    const activeKeyObj = mkKeys[mkActive] || {};
    const provider = activeKeyObj.provider || 'gemini';
    let resp, raw='';

    if(provider==='deepseek'){
      resp = await fetch('https://api.deepseek.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body:JSON.stringify({model:'deepseek-chat', max_tokens:4096, temperature:0.7,
          messages:[{role:'system',content:'Return only valid JSON, no markdown, no backticks.'},{role:'user',content:prompt}]})
      });
      if(!resp.ok){
        const errData=await resp.json().catch(()=>({}));
        const errMsg = errData.error?.message||`HTTP ${resp.status}`;
        if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
        if(resp.status===401) throw new Error('Unauthorized');
        throw new Error(errMsg);
      }
      const data=await resp.json();
      raw=data.choices?.[0]?.message?.content||'';
      if(!raw) throw new Error('DeepSeek returned empty. Try again.');

    } else if(provider==='mistral'){
      resp = await fetch('https://api.mistral.ai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body:JSON.stringify({model:'mistral-small-latest', max_tokens:4096, temperature:0.7,
          messages:[{role:'system',content:'Return only valid JSON, no markdown, no backticks.'},{role:'user',content:prompt}]})
      });
      if(!resp.ok){
        const errData=await resp.json().catch(()=>({}));
        const errMsg = errData.message||errData.error?.message||`HTTP ${resp.status}`;
        if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
        if(resp.status===401) throw new Error('Unauthorized');
        throw new Error(errMsg);
      }
      const data=await resp.json();
      raw=data.choices?.[0]?.message?.content||'';
      if(!raw) throw new Error('Mistral returned empty. Try again.');

    } else if(provider==='openai' || provider==='groq'){
      const url = provider==='groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = provider==='groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
      const body = {model, max_tokens:4096, temperature:0.7,
        messages:[{role:'system',content:'Return only valid JSON, no markdown, no backticks.'},{role:'user',content:prompt}]};
      if(provider==='openai') body.response_format={type:'json_object'};
      resp = await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body:JSON.stringify(body)
      });
      if(!resp.ok){
        const errData=await resp.json().catch(()=>({}));
        const errMsg = errData.error?.message||`HTTP ${resp.status}`;
        if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
        throw new Error(errMsg);
      }
      const data=await resp.json();
      raw=data.choices?.[0]?.message?.content||'';
      if(!raw) throw new Error('AI returned empty. Try again.');

    } else if(provider==='cohere'){
      resp = await fetch('https://api.cohere.com/v2/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body:JSON.stringify({model:'command-r-plus', max_tokens:4096, temperature:0.7,
          messages:[{role:'system',content:'Return only valid JSON, no markdown, no backticks.'},{role:'user',content:prompt}]})
      });
      if(!resp.ok){
        const errData=await resp.json().catch(()=>({}));
        const errMsg = errData.message||`HTTP ${resp.status}`;
        if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
        throw new Error(errMsg);
      }
      const data=await resp.json();
      raw=data.message?.content?.[0]?.text||'';
      if(!raw) throw new Error('Cohere returned empty. Try again.');

    } else if(provider==='openrouter'){
      resp = await fetch('https://openrouter.ai/api/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey,
          'HTTP-Referer':'https://localhost','X-Title':'Lesson Plan Generator'},
        body:JSON.stringify({model:'openrouter/free', max_tokens:2048, temperature:0.7,
          messages:[{role:'system',content:'Return only valid JSON, no markdown, no backticks.'},{role:'user',content:prompt}]})
      });
      if(!resp.ok){
        const errData=await resp.json().catch(()=>({}));
        const rawMeta = errData.error?.metadata?.raw;
        const inner = rawMeta ? (() => { try { return JSON.parse(rawMeta); } catch(_){ return null; } })() : null;
        const errMsg = inner?.error?.message || errData.error?.message||`HTTP ${resp.status}`;
        if(resp.status===429||errMsg.includes('quota')||errMsg.includes('rate')) throw new Error('QUOTA');
        throw new Error('OpenRouter: ' + errMsg);
      }
      const data=await resp.json();
      raw=data.choices?.[0]?.message?.content||'';
      if(!raw) throw new Error('OpenRouter returned empty. Try again.');

    } else {
      // Gemini
      resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],
          generationConfig:{temperature:0.7,maxOutputTokens:4096,responseMimeType:'application/json'}})
      });
      if(!resp.ok){
        const errData=await resp.json().catch(()=>({}));
        const errMsg = errData.error?.message||`HTTP ${resp.status}`;
        if(resp.status===429) throw new Error('QUOTA');
        throw new Error(errMsg);
      }
      const data=await resp.json();
      try { raw=data.candidates[0].content.parts[0].text||''; }
      catch(_){ throw new Error('Unexpected Gemini response. Try again.'); }
    }

    const gen = parseAIJson(raw);
    // Preserve the user-typed subject matter, merge the rest
    state.rows[i] = { ...state.rows[i], ...gen, subjectMatter: subjectMatter, area: row.area };
    renderTable();
    renderSummativesTable();
    autoSave();
    toast(`✅ ${row.area} filled from subject matter!`,'ts');
  } catch(e){
    if(e.message==='QUOTA' && markQuota(apiKey)){
      toast('🔄 Quota hit, retrying with next key…','ti');
      setTimeout(()=>searchBySubjectMatter(i), 800);
      return;
    }
    handleApiError(e);
  } finally {
    // Button will be re-rendered by renderTable(), no need to reset
  }
}

function applyResult(result){
  const generated = result.subjects||[];
  generated.forEach(gen=>{
    const idx=state.rows.findIndex(r=>{
      const ra=(r.area||'').toLowerCase(), ga=(gen.area||'').toLowerCase();
      return ra===ga||ra.includes(ga.split(' ')[0])||ga.includes(ra.split(' ')[0]);
    });
    if(idx!==-1){
      /* Never let AI generation overwrite a Subject Matter the teacher already typed. */
      const existingSM = (state.rows[idx].subjectMatter || '').trim();
      const merged = {...state.rows[idx], ...gen};
      if(existingSM) merged.subjectMatter = state.rows[idx].subjectMatter;
      state.rows[idx] = merged;
    }
  });
}

function setProgress(pct,txt){
  document.getElementById('gfill').style.width=pct+'%';
  document.getElementById('gstatTxt').textContent=txt;
}

function handleApiError(e){
  console.error('AI Error:', e);
  const msg = e.message || '';
  if(msg === 'QUOTA'){
    // markQuota already called; check if all exhausted
    const allHit = mkKeys.length > 0 && mkKeys.every(k=>k.quotaHit);
    if(allHit){
      document.getElementById('quotaBanner').classList.add('show');
      autoSave();
      toast('⚠️ All API keys hit quota. Draft saved. Try again tomorrow or add a new key.','te');
    } else {
      toast('Daily quota reached on this key. Rotating…','te');
    }
  } else if(msg.includes('API_KEY_INVALID')||msg.includes('API key not valid')||msg.includes('Unauthorized')||msg.includes('401')){
    const _akObj=mkKeys[mkActive]||{}; const _prov=feDetectProvider(_akObj.key||'',_akObj.provider||''); const _pName={gemini:'Gemini',openai:'OpenAI',groq:'Groq',cohere:'Cohere',mistral:'Mistral',deepseek:'DeepSeek',nvidia:'NVIDIA',together:'Together AI',openrouter:'OpenRouter',custom:'Custom'}[_prov]||'API'; toast('❌ Invalid API key. Please check your '+_pName+' key.','te');
  } else if(msg.includes('SyntaxError')||msg.includes('JSON')){
    toast('⚠️ AI response format error. Please try generating again.','te');
  } else if(msg.includes('Failed to fetch')||msg.includes('NetworkError')){
    toast('❌ Network error. Check your internet connection.','te');
  } else {
    toast('❌ Error: ' + msg, 'te');
  }
}

/* ════════════════════════════════
   DOCX EXPORT — Exact Original Format
════════════════════════════════ */
function exportDOCX(){
  syncDOM();

  const teacher  = gv('teacher'), grade   = gv('gradeLevel'),
        section  = gv('section'), quarter = gv('quarter'),
        date     = gv('date'),    sy      = gv('sy'),
        prepBy   = gv('prepBy')||teacher, prepTitle = gv('prepTitle'),
        checkBy  = gv('checkBy'), checkTitle = gv('checkTitle');

  const gradeLabel = grade==='multi'?'4-5-6':grade;

  /* Escape XML special chars */
  const x = s => String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');

  /* Convert newlines to Word line breaks */
  const lines = s => x(s).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">');

  /* Paragraph helpers */
  const para = (text, opts={}) => {
    const {bold=false, color='', center=false, sz=16} = opts;
    return `<w:p><w:pPr>${center?'<w:jc w:val="center"/>':''}</w:pPr>
      <w:r><w:rPr>${bold?'<w:b/>':''}${color?`<w:color w:val="${color}"/>`:''}
      <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rFonts w:val="Arial"/></w:rPr>
      <w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
  };

  const cellPara = (text, opts={}) => {
    const {bold=false, color='', center=false, sz=14, shading=''} = opts;
    return `<w:p><w:pPr>${center?'<w:jc w:val="center"/>':''}
      ${shading?`<w:shd w:val="clear" w:color="${shading}" w:fill="${shading}"/>`:''}
      </w:pPr>
      <w:r><w:rPr>${bold?'<w:b/>':''}${color?`<w:color w:val="${color}"/>`:''}
      <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rFonts w:val="Arial"/></w:rPr>
      <w:t xml:space="preserve">${lines(text)}</w:t></w:r></w:p>`;
  };

  const bdr = `<w:top w:val="single" w:sz="4" w:color="AAAAAA"/>
               <w:left w:val="single" w:sz="4" w:color="AAAAAA"/>
               <w:bottom w:val="single" w:sz="4" w:color="AAAAAA"/>
               <w:right w:val="single" w:sz="4" w:color="AAAAAA"/>`;

  const hCell = (text, colspan=1, rowspan=1, fill='FFC000') =>
    `<w:tc><w:tcPr>
      ${colspan>1?`<w:gridSpan w:val="${colspan}"/>`:''}
      ${rowspan>1?`<w:vMerge w:val="restart"/>`:''}
      <w:shd w:val="clear" w:color="${fill}" w:fill="${fill}"/>
      <w:tcBorders>${bdr}</w:tcBorders>
      <w:vAlign w:val="center"/>
     </w:tcPr>
     ${cellPara(text,{bold:true,center:true,sz:14})}</w:tc>`;

  const hCellCont = (fill='FFF9C4') =>
    `<w:tc><w:tcPr>
      <w:vMerge/>
      <w:shd w:val="clear" w:color="${fill}" w:fill="${fill}"/>
      <w:tcBorders>${bdr}</w:tcBorders>
     </w:tcPr><w:p/></w:tc>`;

  const dCell = (text, fill='') =>
    `<w:tc><w:tcPr>
      ${fill?`<w:shd w:val="clear" w:color="${fill}" w:fill="${fill}"/>`:''}
      <w:tcBorders>${bdr}</w:tcBorders>
      <w:vAlign w:val="top"/>
     </w:tcPr>
     ${cellPara(text,{sz:14})}</w:tc>`;

  const infoTc = (text, span=1, bold=false) =>
    `<w:tc><w:tcPr>
      ${span>1?`<w:gridSpan w:val="${span}"/>`:''}
      <w:tcBorders>${bdr}</w:tcBorders>
     </w:tcPr>
     ${cellPara(text,{bold,sz:14})}</w:tc>`;

  /* ── Info row ── */
  const infoRow = `<w:tr>
    ${infoTc('Teacher:',1,true)}
    ${infoTc(teacher,2)}
    ${infoTc('Grade Level:',1,true)}
    ${infoTc(`${gradeLabel}${section?'-'+section:''}`,2)}
    ${infoTc('Grade Period:',1,true)}
    ${infoTc(quarter,1)}
    ${infoTc('Date:',1,true)}
    ${infoTc(date,1)}
  </w:tr>`;

  /* ── Header rows ── */
  const headerRow1 = `<w:tr>
    ${hCell('Learning Areas',1,2,'FFC000')}
    ${hCell('Subject Matter &amp; References',1,2,'FFC000')}
    ${hCell('Learning Competencies',1,2,'FFC000')}
    ${hCell('Objectives',1,2,'FFC000')}
    ${hCell('Integration of Faith and Learning',1,2,'C8E6C9')}
    ${hCell('Daily Faith Integration Activities',4,1,'FFD54F')}
    ${hCell('Home-Based Activities',1,2,'FFC000')}
  </w:tr>`;

  const headerRow2 = `<w:tr>
    ${hCellCont('FFC000')}
    ${hCellCont('FFC000')}
    ${hCellCont('FFC000')}
    ${hCellCont('FFC000')}
    ${hCellCont('C8E6C9')}
    ${hCell('Monday',1,1,'FFF9C4')}
    ${hCell('Tuesday',1,1,'FFF9C4')}
    ${hCell('Wednesday',1,1,'FFF9C4')}
    ${hCell('Thursday',1,1,'FFF9C4')}
    ${hCellCont('FFC000')}
  </w:tr>`;

  /* ── Data rows ── */
  const dataRows = state.rows.map(row => `<w:tr>
    ${dCell(row.area)}
    ${dCell(row.subjectMatter)}
    ${dCell(row.competencies)}
    ${dCell(row.objectives)}
    ${dCell(row.faith,'E8F5E9')}
    ${dCell(row.mon)}
    ${dCell(row.tue)}
    ${dCell(row.wed)}
    ${dCell(row.thu||'SUMMATIVE','FFFDE7')}
    ${dCell(row.fri)}
  </w:tr>`).join('');

  /* ── Signature row ── */
  const sigRow = `<w:tr>
    <w:tc><w:tcPr><w:tcBorders>${bdr}</w:tcBorders></w:tcPr>
      ${cellPara('Prepared by:',{bold:true,sz:14})}
      ${cellPara(prepBy,{sz:14})}
      ${cellPara(prepTitle,{sz:14})}
    </w:tc>
    <w:tc><w:tcPr><w:tcBorders>${bdr}</w:tcBorders></w:tcPr>
      ${cellPara('Checked / Noted by:',{bold:true,sz:14})}
      ${cellPara(checkBy,{sz:14})}
      ${cellPara(checkTitle,{sz:14})}
    </w:tc>
  </w:tr>`;

  /* ── Full Word XML document ── */
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"
  xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint"
  w:macrosPresent="no" w:embeddedObjPresent="no" w:ocxPresent="no">
<w:body>
  <w:sectPr>
    <w:pgSz w:w="18720" w:h="12240" w:orient="landscape"/>
    <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
  </w:sectPr>

  ${para('UPPER KLINAN SDA SCHOOL INC',{bold:true,color:'002060',center:true,sz:20})}
  ${para('Purok Mabinuligon, Upper Klinan, Polomolok, South Cotabato',{center:true,sz:16})}
  ${para('\u201cWhere Children Enjoy Holistic Learning\u201d',{bold:true,color:'002060',center:true,sz:16})}
  ${para('LESSON PLAN',{bold:true,color:'002060',center:true,sz:20})}
  ${para(sy,{color:'0070C0',center:true,sz:16})}
  <w:p/>

  <w:tbl><w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>${bdr}</w:tblBorders>
    <w:tblLayout w:type="autofit"/>
  </w:tblPr>
  ${infoRow}
  </w:tbl>
  <w:p/>

  <w:tbl><w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>${bdr}</w:tblBorders>
    <w:tblLayout w:type="autofit"/>
  </w:tblPr>
  ${headerRow1}
  ${headerRow2}
  ${dataRows}
  </w:tbl>
  <w:p/>

  <w:tbl><w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>${bdr}</w:tblBorders>
  </w:tblPr>
  ${sigRow}
  </w:tbl>
</w:body>
</w:wordDocument>`;

  try {
    const blob = new Blob([xml], {type:'application/msword'});
    const fname = `LessonPlan_G${gradeLabel}${section?'-'+section:''}_${(quarter||'').replace(/\s/g,'')}_${(date||'Draft').replace(/[\/,\s]/g,'-')}.doc`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    toast('✅ Word document downloaded!','ts');
  } catch(e) {
    console.error(e);
    toast('❌ Download error: '+e.message,'te');
  }
}

/* ════════════════════════════════════════════════════════════════
   TOS MANAGEMENT — All logic namespaced with "tos" prefix
   to avoid any conflict with existing LP functions above.
   NOTE: These are shared TOS constants used by js/tos.js, kept here
   because this is exactly where they appeared in the original file.
════════════════════════════════════════════════════════════════ */

/* ─── CONSTANTS ─── */
const TOS_SAVE_KEY = 'tos_lp_v1';
const TOS_BANK_KEY = 'tos_lp_bank_v1';

/* Cognitive level weights — matching the uploaded reference TOS:
   Remember/Knowledge 40%, Understand/Comprehend 30%, Apply 20%, Analyze+Evaluate+Create+Synthesize 10% */
const TOS_COG_W = [0.40, 0.30, 0.20, 0.10];
const TOS_COG_LABELS = [
  'Remember/\nKnowledge\n40%',
  'Understand/\nComprehend\n30%',
  'Apply\n20%',
  'Analyze/Evaluate/\nCreate/Synthesize\n10%'
];
/* Items shown in header per 40-item exam (reference doc values) */
const TOS_COG_ITEMS_HINT = [16, 12, 8, 4]; // for 40 items

/* Split an integer `total` across `weights` so the parts always sum exactly
   to `total`. Uses floor + largest-remainder so a cell is only rounded up
   when the leftover fraction actually earns it (no needless rounding). */