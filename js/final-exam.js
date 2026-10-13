/* ============================================================
   FINAL EXAM MODULE — TOS-based item generation, preview,
   pause/resume, DOCX export.
   ============================================================ */
function feDebounceSave(){
  clearTimeout(feSaveTimer);
  feSaveTimer = setTimeout(feSaveState, 800);
}

function feSaveState(){
  try{
    const d = {
      sub:    document.getElementById('feMSub')?.value||'',
      grade:  document.getElementById('feMGrade')?.value||'',
      quarter:document.getElementById('feMQuarter')?.value||'',
      date:   document.getElementById('feMDate')?.value||'',
      prepBy: document.getElementById('feMPrepBy')?.value||'',
      checkBy:document.getElementById('feMCheckBy')?.value||'',
      items:  feExamItems,
      logoLeft: feLogoData.left||'',
      logoRight:feLogoData.right||''
    };
    localStorage.setItem(FE_SAVE_KEY, JSON.stringify(d));
  }catch(e){}
}

function feLoadState(){
  try{
    const raw = localStorage.getItem(FE_SAVE_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(d.sub)    document.getElementById('feMSub').value    = d.sub;
    if(d.grade)  document.getElementById('feMGrade').value  = d.grade;
    if(d.quarter)document.getElementById('feMQuarter').value= d.quarter;
    if(d.date)   document.getElementById('feMDate').value   = d.date;
    if(d.prepBy) document.getElementById('feMPrepBy').value = d.prepBy;
    if(d.checkBy)document.getElementById('feMCheckBy').value= d.checkBy;
    if(d.items && d.items.length){
      feExamItems = d.items;
      feRenderPreview();
    }
    if(d.logoLeft)  feRestoreLogo('feLogoLeft','feLogoLeftImg',d.logoLeft);
    if(d.logoRight) feRestoreLogo('feLogoRight','feLogoRightImg',d.logoRight);
  }catch(e){}
}

/* ── Logo handling ── */
const feLogoData = {left:'', right:''};

function feTriggerLogo(slotId){
  const fileId = slotId==='feLogoLeft' ? 'feLogoLeftFile' : 'feLogoRightFile';
  document.getElementById(fileId).click();
}

function feLoadLogo(slotId, fileInputId, imgId){
  const file = document.getElementById(fileInputId).files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    feLogoData[slotId==='feLogoLeft'?'left':'right'] = data;
    feRestoreLogo(slotId, imgId, data);
    feDebounceSave();
  };
  reader.readAsDataURL(file);
}

function feRestoreLogo(slotId, imgId, data){
  const img = document.getElementById(imgId);
  const ph  = document.querySelector('#'+slotId+' .tos-logo-ph');
  if(img && data){ img.src=data; img.style.display='block'; if(ph) ph.style.display='none'; }
}

function feRemoveLogo(evt, slotId, imgId){
  evt.stopPropagation();
  feLogoData[slotId==='feLogoLeft'?'left':'right'] = '';
  const img = document.getElementById(imgId);
  const ph  = document.querySelector('#'+slotId+' .tos-logo-ph');
  if(img){ img.src=''; img.style.display='none'; }
  if(ph) ph.style.display='';
  feDebounceSave();
}

/* ── Init: populate TOS selector — retry until tosTosList is ready ── */
function feInit(){
  fePopulateTOSSel();
  feLoadState();
}

function fePopulateTOSSel(){
  const sel = document.getElementById('feTOSSel');
  if(!sel) return;
  if(!tosTosList || !tosTosList.length){
    sel.innerHTML='<option>No TOS available — add a TOS first</option>';
    setTimeout(fePopulateTOSSel, 700);
    return;
  }
  /* Remember which TOS was selected before rebuilding the options, so a
     refresh (or re-focusing the dropdown) doesn't silently snap back to
     the first TOS in the list. Matched by stable `id`, not raw index,
     since the list order could change. */
  const prevIdx = parseInt(sel.value);
  const prevTOS = (!isNaN(prevIdx) && tosTosList[prevIdx]) ? tosTosList[prevIdx] : null;

  sel.innerHTML = tosTosList.map((t,i)=>`<option value="${i}">${tosEsc(t.name||'TOS '+(i+1))}</option>`).join('');

  let restoreIdx = 0;
  if(prevTOS){
    const byId = tosTosList.findIndex(t => t.id === prevTOS.id);
    restoreIdx = byId >= 0 ? byId : Math.min(prevIdx, tosTosList.length - 1);
  }
  sel.value = String(restoreIdx);
  feOnTOSChange();
}

function feOnTOSChange(){
  const sel = document.getElementById('feTOSSel');
  const idx = parseInt(sel?.value||'0');
  const tos = tosTosList[idx];
  if(!tos){ document.getElementById('feItemCount').textContent=''; return; }
  const ti  = tos.meta?.totalItems || 40;
  const n   = tos.activeRows || 1;
  const rows = tos.rows.slice(0,n);
  const hasComp = rows.some(r=>r.competency);
  document.getElementById('feItemCount').textContent =
    `${ti} items · ${n} topic${n>1?'s':''} · ${hasComp?'Competencies found':'No competencies yet'}`;
  /* Auto-fill meta from TOS if blank */
  const sub   = document.getElementById('feMSub');
  const grade = document.getElementById('feMGrade');
  const qtr   = document.getElementById('feMQuarter');
  if(!sub.value   && tos.meta?.subject)  sub.value   = tos.meta.subject;
  if(!grade.value && tos.meta?.grade)    grade.value = tos.meta.grade;
  if(!qtr.value   && tos.meta?.quarter)  qtr.value   = tos.meta.quarter;
}

/* ── GENERATE ── */
async function feGenerate(){
  /* Must have at least one API key */
  const apiKey = getActiveKey();
  if(!apiKey){
    toast('⚠️ No API key found. Open the API Key Manager at the top and add a Gemini or Groq key first.','te');
    document.querySelector('.topbar')?.scrollIntoView({behavior:'smooth'});
    return;
  }

  const sel = document.getElementById('feTOSSel');
  const idx = parseInt(sel?.value||'0');
  const tos = tosTosList[idx];
  if(!tos){ toast('No TOS selected. Create a TOS first in the TOS Management section.','te'); return; }

  const n  = tos.activeRows || 1;
  const ti = parseInt(tos.meta?.totalItems) || 40;
  const rows = tos.rows.slice(0, n);

  /* ── Step 1: Calculate per-lesson total item allocation ──
     Uses the exact same largest-remainder distribution (tosDistribute) that
     the TOS table itself uses, so these numbers always match what's shown
     on screen — no separate/independent rounding that can drift apart. */
  let totalDays = 0;
  rows.forEach(r => { totalDays += parseFloat(r.days||0); });

  const dayShares = rows.map(r => totalDays > 0 ? (parseFloat(r.days||0) / totalDays) : 0);
  const rawAllocs = totalDays > 0 ? tosDistribute(ti, dayShares) : rows.map(() => 0);

  let lessonAllocs = rows.map((r, i) => ({
    topic:      r.topic || ('Lesson ' + (i+1)),
    competency: r.competency || '',
    days:       r.days || 0,
    alloc:      rawAllocs[i],
    origIndex:  i,
    refFiles:   r.refFiles || []
  }));

  lessonAllocs = lessonAllocs.filter(a => a.alloc > 0 && a.topic.trim());
  if(!lessonAllocs.length){ toast('No topics found in TOS. Fill in the TOS table first.','te'); return; }

  /* ── Step 2: Per-lesson, per-cog breakdown ──
     For each lesson, split its alloc into 4 cognitive levels using the same
     per-row tosDistribute(alloc, TOS_COG_W) call the TOS table uses — this
     guarantees each lesson's cog items sum exactly to its alloc AND match
     the TOS table's own Remember/Understand/Apply/Analyze columns exactly.
     cogGrid[cogLevel][lessonIndex] = number of items
  */
  const COG_LABELS = [
    'Remember / Knowledge',
    'Understand / Comprehend',
    'Apply',
    'Analyze / Evaluate / Create / Synthesize'
  ];
  const COG_SHORT = ['Remembering', 'Understanding', 'Applying', 'Analyzing/Evaluating'];
  const COG_DIFFICULTY = ['recall', 'comprehension', 'application', 'higher-order thinking (analysis, evaluation, or synthesis)'];

  // cogGrid[c][l] = item count for cog-level c, lesson l
  const cogGrid = TOS_COG_W.map(() => []);
  lessonAllocs.forEach((a, li) => {
    const rowCogs = tosDistribute(a.alloc, TOS_COG_W);
    TOS_COG_W.forEach((w, ci) => { cogGrid[ci][li] = rowCogs[ci]; });
  });

  /* ── Step 3: Build generation tasks in cognitive-level-first order ──
     Order: cog0/lesson0, cog0/lesson1, cog0/lesson2, …, cog1/lesson0, cog1/lesson1, …
     (matching the TOS column reading order left→right, top→bottom)
  */
  const tasks = [];
  COG_LABELS.forEach((cogLabel, ci) => {
    lessonAllocs.forEach((lesson, li) => {
      const count = cogGrid[ci][li];
      if(count > 0){
        tasks.push({ cogLabel, cogShort: COG_SHORT[ci], cogDiff: COG_DIFFICULTY[ci], cogIdx: ci, lesson, lessonIdx: li, count });
      }
    });
  });

  const totalTasks = tasks.length;
  const totalItems = tasks.reduce((s,t) => s + t.count, 0);

  /* ── Step 4: UI setup ── */
  feGenAbort = false;
  const genBtn = document.getElementById('feGenBtn');
  genBtn.disabled = true;
  genBtn.textContent = '⏳ Generating…';
  const gp    = document.getElementById('feGP');
  const gfill = document.getElementById('feGFill');
  const gstat = document.getElementById('feGStatTxt');
  gp.classList.add('show');
  gfill.style.width = '0%';
  feExamItems = [];

  const subject = document.getElementById('feMSub')?.value  || tos.meta?.subject || 'the subject';
  const grade   = document.getElementById('feMGrade')?.value || tos.meta?.grade   || 'Elementary';

  /* Detect if subject is Filipino or Arpan — use Filipino language for exam */
  const isFilipinoSubject = /\bfilipino\b/i.test(subject) || /\barpan\b/i.test(subject);
  const langInstruction = isFilipinoSubject
    ? `- WIKA: Isulat ang lahat ng tanong at pagpipilian SA FILIPINO (wikang Tagalog). Huwag gumamit ng Ingles maliban sa mga tamang pangalan o teknikal na salita na walang katumbas sa Filipino.
- ANTAS: Angkop para sa mga mag-aaral ng Grades 4–6 — gumamit ng simpleng salita na naiintindihan ng mga bata.
- Iwasan ang masyadong malalim o pormal na salita. Gamitin ang wikang ginagamit sa paaralan.`
    : `- Language appropriate for ${grade} level.`;

  let globalNum = 1;
  let tasksDone = 0;

  /* Fallback reference text from the global upload box — used only when a competency
     row has no reference files of its own. Item count & order still come from the TOS. */
  const feGlobalRefContext = feBuildRefContext();

  /* ── Step 5: Generate each task ── */
  for(const task of tasks){
    if(feGenAbort) break;

    gstat.textContent =
      `[${tasksDone+1}/${totalTasks}] "${task.lesson.topic}" — ${task.cogShort} (${task.count} item${task.count>1?'s':''})…`;
    gfill.style.width = Math.round(tasksDone / totalTasks * 90) + '%';

    const competencyLine = task.lesson.competency
      ? `Learning Competency: "${task.lesson.competency}"`
      : `Topic/Lesson: "${task.lesson.topic}"`;

    /* Per-competency reference files take priority; fall back to the global upload */
    const lessonRefFiles = task.lesson.refFiles || [];
    const feRefContext = lessonRefFiles.length
      ? lessonRefFiles.map((f,fi)=>`--- FILE ${fi+1}: ${f.name} ---\n${f.text}`).join('\n\n').slice(0,12000)
      : feGlobalRefContext;

    const refLineFil = feRefContext
      ? `\nSANGGUNIANG NILALAMAN (ibatay ang mga tanong dito kung may kaugnayan sa aralin):\n"""\n${feRefContext}\n"""\n`
      : '';
    const refLineEn = feRefContext
      ? `\nREFERENCE CONTENT (base the questions on this material when relevant to the lesson):\n"""\n${feRefContext}\n"""\n`
      : '';

    const prompt = isFilipinoSubject
? `Ikaw ay isang guro na gumagawa ng Pangwakas na Pagsusulit (Final Examination) sa ${subject} para sa ${grade}.
${competencyLine}
Antas ng Pag-iisip (Cognitive Level): ${task.cogLabel} (${task.cogDiff})
${refLineFil}

Gumawa ng eksaktong ${task.count} tanong na may apat na pagpipilian (multiple choice) sa antas na "${task.cogShort}" tungkol sa araling ito.

Mga Panuntunan:
- Lahat ng tanong ay dapat nasa "${task.cogShort}" na antas ng pag-iisip (${task.cogDiff}).
- Bawat tanong ay may eksaktong 4 na pagpipilian: A, B, C, D.
- Isang tamang sagot lang bawat tanong — walang dalawang pagpipilian na parehong tama o parehong maaaring tama.
- Siguraduhing ang letra sa "answer" (A, B, C, o D) ay TUMUTUGMA nang eksakto sa tamang pagpipilian sa "choices". Bago sumagot, balikan at tingnan muli kung tama ang letrang inilagay mo.
- ISULAT SA FILIPINO — simpleng salita na naiintindihan ng mga mag-aaral ng Grades 4–6.
- Huwag isama ang letra ng sagot sa loob ng tanong.
- Sumagot LAMANG ng valid JSON array. Walang markdown, walang backticks, walang paliwanag bago o pagkatapos.

[
  {
    "question": "Tanong dito?",
    "choices": ["Pagpipilian A", "Pagpipilian B", "Pagpipilian C", "Pagpipilian D"],
    "answer": "A"
  }
]`
:
`You are a school teacher writing a Final Examination for ${grade} ${subject}.
${competencyLine}
Cognitive Level: ${task.cogLabel} (${task.cogDiff})
${refLineEn}

Generate exactly ${task.count} multiple choice question${task.count>1?'s':''} at the "${task.cogShort}" cognitive level about this lesson/competency.

Rules:
- All questions MUST be at the "${task.cogShort}" cognitive level (${task.cogDiff}).
- Each question has exactly 4 choices: A, B, C, D.
- Exactly one correct answer per question — no two choices may both be correct or both be defensible as correct.
- The "answer" letter (A, B, C, or D) MUST match the actually correct choice in "choices" exactly. Re-check each item before responding to confirm the letter is accurate.
- Language appropriate for ${grade} level.
- Do NOT include the answer letter inside the question text.
- Respond ONLY with a valid JSON array. No markdown, no backticks, no explanation before or after.

[
  {
    "question": "Question text here?",
    "choices": ["Choice A text", "Choice B text", "Choice C text", "Choice D text"],
    "answer": "A"
  }
]`;

    try{
      const items = await feCallAnthropicAPI(prompt, task.count, task.cogShort, task.lesson.topic, isFilipinoSubject);
      /* items is ALWAYS exactly task.count long (padded if needed) */
      items.forEach(it => {
        /* Alphabetize choices A→D and re-map the correct answer letter to match */
        const alpha = feAlphabetizeChoices(it.choices, it.answer);
        feExamItems.push({
          num:        globalNum++,
          topic:      task.lesson.topic,
          competency: task.lesson.competency,
          cogLabel:   task.cogLabel,
          cogIdx:     task.cogIdx,
          question:   it.question,
          choices:    alpha.choices,
          answer:     alpha.answer
        });
      });
    } catch(e){
      console.error('Error:', e);
      toast('⚠️ Error for "' + task.lesson.topic + '" (' + task.cogShort + '): ' + e.message, 'te');
      /* Still pad so total item count stays correct */
      for(let p = 0; p < task.count; p++){
        feExamItems.push({
          num: globalNum++, topic: task.lesson.topic, competency: task.lesson.competency,
          cogLabel: task.cogLabel, cogIdx: task.cogIdx,
          question: '[' + task.cogShort + ' — ' + task.lesson.topic + '] Item ' + (p+1) + ' (regenerate)',
          choices: ['Option A','Option B','Option C','Option D'], answer: 'A'
        });
      }
    }

    tasksDone++;
  }

  gfill.style.width = '100%';
  gfill.style.background = ''; // restore default color
  genBtn.disabled = false;
  genBtn.style.display = '';
  genBtn.textContent = '🤖 Generate Final Exam';
  /* Hide resume btn and spinner state cleanly */
  const resumeBtn2 = document.getElementById('feResumeBtn');
  const spin2      = document.getElementById('feGenSpin');
  if(resumeBtn2) resumeBtn2.style.display = 'none';
  if(spin2)      spin2.style.display = '';
  _feResolvePause = null; // clear any pending pause

  if(feExamItems.length){
    gstat.textContent = '✅ ' + feExamItems.length + ' items generated!';
    setTimeout(() => gp.classList.remove('show'), 2500);
    feRenderPreview();
    feDebounceSave();
    document.getElementById('feDlBtn').style.display = '';
    document.getElementById('fePreviewWrap').scrollIntoView({behavior:'smooth', block:'start'});
    toast('✅ Final Exam generated — ' + feExamItems.length + ' items!', 'ts');
  } else {
    gstat.textContent = 'No items generated. Check your TOS data and API key.';
    setTimeout(() => gp.classList.remove('show'), 3500);
    toast('❌ No items generated. Check your TOS topics and API key.', 'te');
  }
}


/* ── AI call for Final Exam — auto-detect provider, retry until exact count ── */

/* feDetectProvider moved to top of script */

/* Single raw API call — returns text string.
   Throws Error('QUOTA') ONLY when the API confirms a real rate-limit/quota (HTTP 429
   or the provider's documented quota error codes). All other errors are thrown as
   plain Error(message) so they do NOT trigger false quota-hit marking. */
async function feRawCall(prompt, apiKey, provider){
  const SYS = 'You are a test-question generator. Return ONLY a valid JSON array with no markdown, no backticks, no extra text before or after the array.';

  /* Helper: decides if an HTTP error response is a REAL quota/rate-limit.
     Only returns true on HTTP 429 OR specific quota-related error codes from each provider. */
  function isRealQuota(status, errBody){
    if(status === 429) return true;
    const code = String(errBody?.error?.code || errBody?.error?.type || '').toLowerCase();
    const msg  = String(errBody?.error?.message || errBody?.message || '').toLowerCase();
    // Only flag quota on very specific signals — NOT generic "quota" mentions
    return (
      code.includes('rate_limit_exceeded') ||
      code.includes('insufficient_quota') ||
      code.includes('quota_exceeded') ||
      msg.includes('rate limit exceeded') ||
      msg.includes('insufficient_quota') ||
      msg.includes('you exceeded your current quota') ||
      msg.includes('requests per minute') ||
      msg.includes('tokens per minute') ||
      msg.includes('too many requests')
    );
  }

  if(provider === 'openai'){
    const r = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'gpt-4o-mini', max_tokens:4096, temperature:0.7,
        response_format:{type:'json_object'},
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'groq'){
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'llama-3.3-70b-versatile', max_tokens:4096, temperature:0.7,
        response_format:{type:'json_object'},
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'deepseek'){
    const r = await fetch('https://api.deepseek.com/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'deepseek-chat', max_tokens:2048, temperature:0.7,
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(r.status===401) throw new Error('Unauthorized — check your DeepSeek key.');
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'DeepSeek HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'mistral'){
    const r = await fetch('https://api.mistral.ai/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'mistral-small-latest', max_tokens:4096, temperature:0.7,
        response_format:{type:'json_object'},
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(r.status===401) throw new Error('Unauthorized — check your Mistral key.');
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||e.message||'Mistral HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'openrouter'){
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey,
        'HTTP-Referer':'https://localhost','X-Title':'Exam Generator'},
      body:JSON.stringify({ model:'openrouter/free', max_tokens:2048, temperature:0.7,
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      const rawMeta = e.error?.metadata?.raw;
      const inner = rawMeta ? (() => { try { return JSON.parse(rawMeta); } catch(_){ return null; } })() : null;
      if(isRealQuota(r.status, inner||e)) throw new Error('QUOTA');
      throw new Error(inner?.error?.message || e.error?.message || 'OpenRouter HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'nvidia'){
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'meta/llama-3.1-70b-instruct', max_tokens:4096, temperature:0.7,
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'NVIDIA HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'together'){
    const r = await fetch('https://api.together.xyz/v1/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo', max_tokens:4096, temperature:0.7,
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'Together HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else if(provider === 'cohere'){
    const r = await fetch('https://api.cohere.com/v2/chat',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model:'command-r-plus', max_tokens:4096, temperature:0.7,
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.message||'Cohere HTTP '+r.status);
    }
    const d=await r.json(); return d.message?.content?.[0]?.text||'';

  } else if(provider === 'custom'){
    const baseUrl = (document.getElementById('mkCustomUrl')?.value||'').replace(/\/$/,'');
    const model   = document.getElementById('mkCustomModel')?.value||'default';
    if(!baseUrl) throw new Error('Custom provider: no base URL configured.');
    const r = await fetch(baseUrl+'/chat/completions',{
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({ model, max_tokens:4096, temperature:0.7,
        messages:[{role:'system',content:SYS},{role:'user',content:prompt}] })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'Custom API HTTP '+r.status);
    }
    const d=await r.json(); return d.choices?.[0]?.message?.content||'';

  } else {
    /* Gemini — default */
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:SYS+'\n\n'+prompt}]}],
        generationConfig:{temperature:0.7,maxOutputTokens:4096,responseMimeType:'application/json'}
      })
    });
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      if(isRealQuota(r.status,e)) throw new Error('QUOTA');
      throw new Error(e.error?.message||'Gemini HTTP '+r.status);
    }
    const d=await r.json();
    try{ return d.candidates[0].content.parts[0].text||''; }
    catch(_){ throw new Error('Unexpected Gemini response: '+JSON.stringify(d).slice(0,200)); }
  }
}

/* Parse JSON array from raw AI text */
function feParseItems(raw){
  if(!raw) return [];
  // Strip markdown fences
  raw = raw.replace(/^\s*```json/i,'').replace(/^\s*```/,'').replace(/```\s*$/,'').trim();
  // Extract first [...] block
  const m = raw.match(/\[[\s\S]*\]/);
  if(!m) return [];
  let block = m[0]
    .replace(/[\u201C\u201D]/g,'"').replace(/[\u2018\u2019]/g,"'")  // smart quotes
    .replace(/,\s*([}\]])/g,'$1')                                    // trailing commas
    .replace(/}\s*{/g,'},{');                                        // missing comma between objects
  try{
    const arr = JSON.parse(block);
    if(!Array.isArray(arr)) return [];
    return arr
      .filter(it => it && typeof it.question==='string' && it.question.trim() && Array.isArray(it.choices))
      .map(it=>({
        question: it.question.trim(),
        choices:  it.choices.length===4
          ? it.choices.map(c=>String(c||'').trim()||'—')
          : [...it.choices.map(c=>String(c||'').trim()), 'Option C','Option D'].slice(0,4),
        answer: String(it.answer||'A').toUpperCase().replace(/[^A-D]/g,'A')
      }));
  }catch(e){ return []; }
}

/* ── Alphabetize each item's 4 choices (A→D by text) and keep the
   correct-answer letter in sync with the new order. Works for both
   English and Filipino/Arpan items since it sorts by text, not language. ── */
function feAlphabetizeChoices(choices, answerLetter){
  const letters = ['A','B','C','D'];
  const safeChoices = (choices||[]).map(c=>String(c||'').trim());
  const origIdx  = letters.indexOf(String(answerLetter||'A').toUpperCase().charAt(0));
  const correctText = safeChoices[origIdx] !== undefined ? safeChoices[origIdx] : safeChoices[0];
  const sorted = [...safeChoices].sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base', numeric:true}));
  let newIdx = sorted.indexOf(correctText);
  if(newIdx < 0) newIdx = 0; // fallback safety, should not happen
  return { choices: sorted, answer: letters[newIdx] };
}

/* Main call — retries until we have exactly `needed` items */
async function feCallAnthropicAPI(prompt, needed, cogShort, topicLabel, isFilipinoLang){
  const MAX_ATTEMPTS   = 4;  // content retries per key
  const MAX_KEY_ROTATE = mkKeys.length + 1; // max key rotations
  let collected  = [];
  let keyRotates = 0;

  while(collected.length < needed && keyRotates <= MAX_KEY_ROTATE){
    const apiKey = getActiveKey();
    if(!apiKey){
      feGenPause('⚠️ All API keys hit quota. Add a new key then click Resume.');
      await feWaitForResume();
      /* After resume, check again */
      if(!getActiveKey()) break;
      continue;
    }

    const keyObj   = mkKeys[mkActive] || {};
    const provider = feDetectProvider(apiKey, keyObj.provider);
    let attempts   = 0;
    let keyExhausted = false;

    while(collected.length < needed && attempts < MAX_ATTEMPTS && !keyExhausted){
      attempts++;
      const remaining = needed - collected.length;

      const retryNote = attempts > 1
        ? (isFilipinoLang
            ? `\n\nMAHALAGA: Kailangan mong magbigay ng eksaktong ${remaining} tanong. Huwag magbigay ng mas kaunti.`
            : `\n\nIMPORTANT: You MUST return exactly ${remaining} question${remaining>1?'s':''}. Do not return fewer.`)
        : '';
      const retryPrompt = attempts > 1
        ? prompt.replace(/Generate exactly \d+|Gumawa ng eksaktong \d+/, isFilipinoLang ? `Gumawa ng eksaktong ${remaining}` : `Generate exactly ${remaining}`) + retryNote
        : prompt;

      try{
        const raw   = await feRawCall(retryPrompt, apiKey, provider);
        const items = feParseItems(raw);
        items.forEach(it => { if(collected.length < needed) collected.push(it); });

        if(collected.length >= needed) break;

        if(attempts < MAX_ATTEMPTS)
          await new Promise(r => setTimeout(r, 800));

      } catch(e){
        const isQuota = e.message === 'QUOTA'; // ONLY the typed signal from feRawCall

        if(isQuota){
          /* Mark this key as quota-hit and rotate */
          markQuota(apiKey);
          keyExhausted  = true;
          keyRotates++;

          /* Check if there's still another valid key available */
          const nextKey = getActiveKey();
          if(nextKey && nextKey !== apiKey){
            /* Pause generation visually, then auto-resume after brief delay */
            const nextName = mkKeys[mkActive]?.name || 'next key';
            feGenPause(`⚠️ Real quota hit confirmed. Rotating to "${nextName}"… resuming in 3s`);
            await new Promise(r => setTimeout(r, 3000));
            feGenResume();
          } else {
            /* No keys left — pause and wait for user to add/reset a key */
            feGenPause('🚫 All keys hit quota. Reset quotas or add a new key, then click Resume.');
            await feWaitForResume();
            keyRotates = 0; // reset so we try again
          }
        } else if(attempts >= MAX_ATTEMPTS){
          /* Non-quota error, out of retries — skip with placeholder */
          console.warn('feCallAnthropicAPI non-quota error after max attempts:', e.message);
          break;
        } else {
          console.warn('feCallAnthropicAPI non-quota error, will retry:', e.message);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  /* Pad any remaining with placeholders so total count is always exact */
  while(collected.length < needed){
    const n = collected.length + 1;
    collected.push({
      question: `[${cogShort} — ${topicLabel}] Item ${n} — could not generate (check key/quota)`,
      choices:  ['Option A', 'Option B', 'Option C', 'Option D'],
      answer:   'A'
    });
  }

  return collected.slice(0, needed);
}

/* ── Pause / Resume helpers for exam generation ── */
let _feResolvePause = null;

function feGenPause(msg){
  const gstat     = document.getElementById('feGStatTxt');
  const gfill     = document.getElementById('feGFill');
  const genBtn    = document.getElementById('feGenBtn');
  const resumeBtn = document.getElementById('feResumeBtn');
  const spin      = document.getElementById('feGenSpin');

  if(gstat)     gstat.textContent = '⏸ ' + msg;
  if(gfill){    gfill.style.background = '#FFA000'; gfill.style.transition = 'background 0.4s'; }
  if(genBtn)    genBtn.style.display = 'none';
  if(resumeBtn){ resumeBtn.style.display = ''; resumeBtn.textContent = '▶ Resume'; }
  if(spin)      spin.style.display = 'none'; // hide spinner while paused
  toast('⏸ ' + msg, 'ti');
}

function feGenResume(){
  const gfill     = document.getElementById('feGFill');
  const genBtn    = document.getElementById('feGenBtn');
  const resumeBtn = document.getElementById('feResumeBtn');
  const spin      = document.getElementById('feGenSpin');
  const gstat     = document.getElementById('feGStatTxt');

  if(gfill){    gfill.style.background = ''; } // restore blue
  if(genBtn)    genBtn.style.display = 'none';  // still generating
  if(resumeBtn) resumeBtn.style.display = 'none';
  if(spin)      spin.style.display = '';        // show spinner again
  if(gstat)     gstat.textContent = 'Resuming…';

  if(_feResolvePause){ _feResolvePause(); _feResolvePause = null; }
}

function feWaitForResume(){
  return new Promise(resolve => { _feResolvePause = resolve; });
}

function feUserResume(){
  /* Called by the Resume button */
  const newKey = getActiveKey();
  if(!newKey){
    toast('⚠️ Still no active key. Reset quotas or add a new key first.', 'te');
    return;
  }
  feGenResume();
  toast('▶ Resuming exam generation…', 'ti');
}


/* ── Render preview ── */
function feRenderPreview(){
  if(!feExamItems.length) return;

  /* Update header */
  const qtrEl  = document.getElementById('feHdrQuarter');
  const subEl  = document.getElementById('feHdrSub');
  const dateEl = document.getElementById('feHdrDate');
  if(qtrEl)  qtrEl.textContent  = document.getElementById('feMQuarter')?.value || '';
  if(subEl)  subEl.textContent  = document.getElementById('feMSub')?.value     || '';
  if(dateEl) dateEl.textContent = document.getElementById('feMDate')?.value    || '';

  const choiceLetters = ['A','B','C','D'];

  /* Group items by cognitive level (in order 0,1,2,3) */
  const COG_ORDER = [0,1,2,3];
  const COG_DISPLAY = [
    'Remember / Knowledge',
    'Understand / Comprehend',
    'Apply',
    'Analyze / Evaluate / Create / Synthesize'
  ];
  const COG_COLORS = ['#1565C0','#2E7D32','#E65100','#6A1B9A'];
  const COG_BG     = ['#E3F2FD','#E8F5E9','#FFF3E0','#F3E5F5'];

  let html = '';

  COG_ORDER.forEach(ci => {
    const groupItems = feExamItems.filter(it => it.cogIdx === ci);
    if(!groupItems.length) return;

    /* Cognitive level header */
    html += `<div style="margin-bottom:20px;">`;
    html += `<div style="background:${COG_BG[ci]};border-left:4px solid ${COG_COLORS[ci]};
      border-radius:6px;padding:7px 12px;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
      <span style="font-weight:900;color:${COG_COLORS[ci]};font-size:12px;">${COG_DISPLAY[ci]}</span>
      <span style="font-size:11px;color:#666;margin-left:auto;">${groupItems.length} item${groupItems.length>1?'s':''}</span>
    </div>`;

    /* Track current topic for sub-headings */
    let prevTopic = null;
    groupItems.forEach(it => {
      /* Sub-heading when topic changes within this cog level */
      if(it.topic !== prevTopic){
        html += `<div style="font-size:11px;font-weight:700;color:#888;margin:6px 0 4px 4px;
          font-style:italic;">— ${it.topic}${it.competency?' · '+it.competency:''} —</div>`;
        prevTopic = it.topic;
      }

      /* Question */
      html += `<div style="margin-bottom:11px;padding-left:4px;">`;
      html += `<div style="display:flex;gap:6px;">
        <span style="min-width:32px;font-weight:700;color:#444;">_____${it.num}.</span>
        <span style="flex:1;">${it.question}</span>
      </div>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;grid-auto-flow:column;gap:1px 16px;
        margin-left:38px;margin-top:3px;font-size:12.5px;">`;
      it.choices.forEach((ch, chi) => {
        html += `<div><span style="font-weight:700;">${choiceLetters[chi]}.</span> ${ch}</div>`;
      });
      html += `</div></div>`;
    });

    html += `</div>`;
  });

  document.getElementById('feItemsPreview').innerHTML = html;

  /* Answer key — numbered in exam order */
  let akHtml = '';
  let row = [];
  feExamItems.forEach((it, i) => {
    row.push(`<span style="min-width:44px;display:inline-block;">${it.num}. <b>${it.answer}</b></span>`);
    if((i+1) % 10 === 0 || i === feExamItems.length-1){
      akHtml += `<div style="margin-bottom:4px;">${row.join('')}</div>`;
      row = [];
    }
  });
  document.getElementById('feAnsKey').innerHTML = akHtml;

  document.getElementById('fePreviewWrap').style.display = 'block';
  document.getElementById('feDlBtn').style.display = '';
}


/* ── Toggle answer key ── */
function feToggleAnsKey(){
  const wrap = document.getElementById('feAnsKeyWrap');
  const btn  = document.getElementById('feToggleAns');
  const show = wrap.style.display==='none';
  wrap.style.display = show?'block':'none';
  btn.textContent    = show?'🙈 Hide Answer Key':'👁 Show Answer Key';
}

/* ── DOWNLOAD DOCX ── */
async function feDownloadDOCX(){
  if(!feExamItems.length){ toast('Generate the exam first.','te'); return; }

  /* Load JSZip */
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
  const schoolID= 'School ID: 409417';
  const motto   = '\u201cWhere Children Enjoy Holistic Learning\u201d';
  const sub     = document.getElementById('feMSub')?.value    || '';
  const grade   = document.getElementById('feMGrade')?.value  || '';
  const quarter = document.getElementById('feMQuarter')?.value|| '';
  const date    = document.getElementById('feMDate')?.value   || '';
  const prepBy  = document.getElementById('feMPrepBy')?.value || '_____________________';
  const checkBy = document.getElementById('feMCheckBy')?.value|| 'Nathaniel A. Lofranco';
  const sy      = (document.getElementById('sy')?.value||'SY 2025-2026');

  const NS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const X=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const BDR=`<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
             <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
             <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
             <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;

  const P=(text,opts={})=>{
    const {bold=false,color='',center=false,sz=20,after=0,font=''}=opts;
    const fontTag = font?`<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>`:'';
    return `<w:p>
      <w:pPr>${center?'<w:jc w:val="center"/>':''}<w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/></w:pPr>
      <w:r><w:rPr>${fontTag}${bold?'<w:b/>':''}${color?`<w:color w:val="${color}"/>`:''}
      <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>
      <w:t xml:space="preserve">${X(text)}</w:t></w:r></w:p>`;
  };
  const EP=(after=80)=>`<w:p><w:pPr><w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/></w:pPr></w:p>`;

  /* Build logo image relationships if logos are present */
  const hasLogoL = !!feLogoData.left;
  const hasLogoR = !!feLogoData.right;

  /* Header row with school name (logos would require image embedding — for simplicity, use text placeholders) */
  let headerXml = '';

  /* Logo-flanked header table */
  const logoCell=(side)=>{
    const data = side==='L'?feLogoData.left:feLogoData.right;
    if(!data) return `<w:tc><w:tcPr><w:tcW w:w="900" w:type="dxa"/><w:tcBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/></w:tcBorders></w:tcPr>${EP(0)}</w:tc>`;
    /* We can't embed binary images easily without full relationship XML; just leave blank for now */
    return `<w:tc><w:tcPr><w:tcW w:w="900" w:type="dxa"/><w:tcBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/></w:tcBorders></w:tcPr>${EP(0)}</w:tc>`;
  };

  headerXml = `
  <w:tbl>
    <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>
      <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/>
      <w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/>
    </w:tblBorders></w:tblPr>
    <w:tblGrid><w:gridCol w:w="900"/><w:gridCol w:w="10080"/><w:gridCol w:w="900"/></w:tblGrid>
    <w:tr>
      ${logoCell('L')}
      <w:tc>
        <w:tcPr><w:tcW w:w="10080" w:type="dxa"/><w:tcBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
        </w:tcBorders></w:tcPr>
        ${P(school,  {bold:true,color:'002060',center:true,sz:24,after:0,font:'Franklin Gothic Medium'})}
        ${P(addr,    {center:true,sz:18,after:0})}
        ${P(schoolID,{center:true,sz:18,after:0,color:'C00000'})}
        ${P(motto,   {center:true,sz:18,after:0,color:'C00000',font:'Times New Roman'})}
        ${P(quarter, {bold:true,color:'002060',center:true,sz:22,after:0})}
        ${P(sy,      {color:'0070C0',center:true,sz:18,after:0})}
        ${P(sub,     {bold:true,color:'002060',center:true,sz:22,after:0})}
        ${P(date,    {center:true,sz:18,after:0})}
      </w:tc>
      ${logoCell('R')}
    </w:tr>
  </w:tbl>`;

  /* Name/Date/Score line */
  const infoLine=`
  <w:p>
    <w:pPr><w:spacing w:after="80" w:line="240" w:lineRule="auto"/>
      <w:tabs><w:tab w:val="left" w:pos="5000"/><w:tab w:val="left" w:pos="8500"/></w:tabs>
    </w:pPr>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      <w:t xml:space="preserve">Name: ____________________________________________</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:tab/>
      <w:t xml:space="preserve">Date: _______________</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:tab/>
      <w:t xml:space="preserve">Score: ___________</w:t></w:r>
  </w:p>`;

  /* Instructions */
  const instrXml=`
  <w:p>
    <w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      <w:t xml:space="preserve">Multiple Choice.</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      <w:t xml:space="preserve"> Choose the letter of the correct answer and write it on the space provided before each number.</w:t></w:r>
  </w:p>`;

  /* Items — grouped by cognitive level, with topic sub-headings */
  const choiceLetters=['A','B','C','D'];
  const COG_DOCX_LABELS=[
    'Remember / Knowledge',
    'Understand / Comprehend',
    'Apply',
    'Analyze / Evaluate / Create / Synthesize'
  ];
  const COG_DOCX_COLORS=['1565C0','2E7D32','E65100','6A1B9A'];
  let itemsXml='';

  const cogIndexes=[0,1,2,3];
  cogIndexes.forEach(ci=>{
    const groupItems=feExamItems.filter(it=>it.cogIdx===ci);
    if(!groupItems.length) return;

    /* Cognitive level header */
    itemsXml += `<w:p>
      <w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>
        <w:shd w:val="clear" w:color="auto" w:fill="E8F4FF"/>
      </w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="${COG_DOCX_COLORS[ci]}"/>
        <w:sz w:val="20"/><w:szCs w:val="20"/>
        <w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/>
      </w:rPr><w:t xml:space="preserve">${X(COG_DOCX_LABELS[ci])}</w:t></w:r>
    </w:p>`;

    let prevTopic='';
    groupItems.forEach(it=>{
      /* Topic sub-heading when topic changes */
      if(it.topic !== prevTopic){
        itemsXml += `<w:p>
          <w:pPr><w:spacing w:after="20" w:line="240" w:lineRule="auto"/>
            <w:ind w:left="0"/>
          </w:pPr>
          <w:r><w:rPr><w:i/><w:color w:val="555555"/>
            <w:sz w:val="18"/><w:szCs w:val="18"/>
          </w:rPr><w:t xml:space="preserve">${X(it.topic+(it.competency?' – '+it.competency:''))}</w:t></w:r>
        </w:p>`;
        prevTopic=it.topic;
      }

      /* Question */
      itemsXml += `<w:p>
        <w:pPr><w:spacing w:after="20" w:line="240" w:lineRule="auto"/>
          <w:ind w:left="0" w:hanging="360"/>
          <w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>
        </w:pPr>
        <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
          <w:t xml:space="preserve">_____${it.num}. ${X(it.question)}</w:t></w:r>
      </w:p>`;

      /* Choices 2-col */
      const half=Math.ceil(it.choices.length/2);
      for(let r=0;r<half;r++){
        const ci1=r, ci2=r+half;
        itemsXml+=`<w:p>
          <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
            <w:ind w:left="540"/>
            <w:tabs><w:tab w:val="left" w:pos="4680"/></w:tabs>
          </w:pPr>`;
        if(it.choices[ci1]!==undefined)
          itemsXml+=`<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
            <w:t xml:space="preserve">${choiceLetters[ci1]}. ${X(it.choices[ci1]||'')}</w:t></w:r>`;
        if(it.choices[ci2]!==undefined)
          itemsXml+=`<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:tab/>
            <w:t xml:space="preserve">${choiceLetters[ci2]}. ${X(it.choices[ci2]||'')}</w:t></w:r>`;
        itemsXml+=`</w:p>`;
      }
      itemsXml += EP(60);
    });

    itemsXml += EP(80);
  });


  /* Answer key */
  let akXml = P('Answer Key', {bold:true,color:'002060',sz:20,after:40});
  let akRow = [];
  feExamItems.forEach((it,i)=>{
    akRow.push(`${it.num}. ${it.answer}`);
    if((i+1)%10===0 || i===feExamItems.length-1){
      akXml += P(akRow.join('   '), {sz:18,after:20});
      akRow=[];
    }
  });

  /* Signature line */
  const sigXml=`
  <w:p>
    <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
      <w:tabs><w:tab w:val="right" w:pos="9215"/></w:tabs>
    </w:pPr>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">Prepared by: </w:t></w:r>
    <w:r><w:rPr><w:b/><w:u w:val="single"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${X(prepBy)}</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:tab/><w:t xml:space="preserve">Checked by: </w:t></w:r>
    <w:r><w:rPr><w:b/><w:u w:val="single"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>${X(checkBy)}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
      <w:tabs><w:tab w:val="right" w:pos="9215"/></w:tabs>
    </w:pPr>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">   Class Adviser</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:tab/><w:t xml:space="preserve">School Head</w:t></w:r>
  </w:p>`;

  const bodyXml=`
    ${headerXml}
    ${EP(80)}
    ${infoLine}
    ${EP(40)}
    ${instrXml}
    ${EP(40)}
    ${itemsXml}
    ${EP(120)}
    ${akXml}
    ${EP(120)}
    ${sigXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>
      <w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>`;

  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>${bodyXml}</w:body>
</w:document>`;

  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/>
      <w:sz w:val="20"/><w:szCs w:val="20"/>
    </w:rPr></w:rPrDefault>
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
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels',         pkgRels);
    zip.file('word/document.xml',   docXml);
    zip.file('word/styles.xml',     stylesXml);
    zip.file('word/settings.xml',   settingsXml);
    zip.file('word/_rels/document.xml.rels', wordRels);

    const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    const safe=(s)=>String(s||'').replace(/[^\w\s-]/g,'').replace(/\s+/g,'_').slice(0,30);
    const fname=`FinalExam_${safe(sub)}_${safe(grade)}_${safe(quarter)}.docx`;
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=fname; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast('✅ Final Exam downloaded as Word (.docx)!','ts');
  }catch(e){ console.error(e); toast('❌ Download error: '+e.message,'te'); }
}
/* ── END FINAL EXAM ── */

/* ════════════════════════════════════════════════════════════════
   PRELIM EXAM MANAGEMENT
   NOTE: These are shared Prelim Exam state vars used by
   js/prelim-exam.js, kept here because this is exactly where
   they appeared in the original file.
   ════════════════════════════════════════════════════════════════ */

let prelimFiles = [];      // Array of {name, text} — extracted text from each docx
let prelimResult = null;   // Generated exam data {partI, partII, partIII, answerKey, storyRefs}

/* ── File handling ── */