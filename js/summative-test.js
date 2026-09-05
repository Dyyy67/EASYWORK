/* ============================================================
   SUMMATIVE TEST MODULE — shared app state/utils (sv/gv/esc/toast,
   autosave, subjects, grade), summative meta + AI generation + export.
   NOTE: core shared helpers (toast, esc, autoSave, etc.) live here
   because this is where they were first defined in the original file.
   ============================================================ */
function initRows() {
  state.rows = state.subjects.map(s => mkRow(s));
  ensureSummatives();
}
function mkSummativeMeta() {
  return {
    itemCount: 10,
    testTypes: ['True or False', 'Matching Type'],
    testType: '',
    title: '',
    instructions: '',
    items: [],
    generatedAt: null,
    customAnswers: [[], []],
  };
}
function migrateSummativeMeta(sm) {
  if (!sm.testTypes || !sm.testTypes.length) {
    if (sm.testType) {
      sm.testTypes = sm.testType.split(/\s*\+\s*/).map(t => t.trim()).filter(Boolean).slice(0, 2);
    } else {
      sm.testTypes = ['True or False', 'Matching Type'];
    }
  }
  while (sm.testTypes.length < 2) sm.testTypes.push('');
  sm.testTypes = sm.testTypes.slice(0, 2);
  if (!Array.isArray(sm.customAnswers)) sm.customAnswers = [[], []];
  while (sm.customAnswers.length < 2) sm.customAnswers.push([]);
}
function ensureSummatives() {
  while (state.summatives.length < state.rows.length) state.summatives.push(mkSummativeMeta());
  if (state.summatives.length > state.rows.length) state.summatives.length = state.rows.length;
  state.summatives.forEach(migrateSummativeMeta);
}
function summativeTypeSelectHtml(selected, rowIdx, slot) {
  const emptyOpt = slot === 1 ? '<option value="">— Optional —</option>' : '';
  const typeOpts = SUMMATIVE_TYPES.map(t => {
    const sel = selected === t ? ' selected' : '';
    return `<option value="${esc(t)}"${sel}>${esc(t)}</option>`;
  });
  const label = slot === 0 ? 'Test type 1 (required)' : 'Test type 2 (optional)';
  return `<select class="sum-type-sel" data-sum-r="${rowIdx}" data-sum-slot="${slot}" onchange="onSummativeTypeChange(${rowIdx},${slot},this.value)" title="${label}">${emptyOpt}${typeOpts.join('')}</select>`;
}
function resolveSummativeTypeSlots(i) {
  ensureSummatives();
  const sm = state.summatives[i];
  migrateSummativeMeta(sm);
  const slots = [];
  let customCount = 0;
  (sm.testTypes || []).forEach((t, slotIdx) => {
    if (!t || !SUMMATIVE_TYPES.includes(t)) return;
    if (t === CUSTOM_ANSWER_TYPE) {
      customCount++;
      const label = customCount === 1 ? t : `${t} (Set ${customCount})`;
      slots.push({ label, customAnswers: (sm.customAnswers && sm.customAnswers[slotIdx]) || [] });
    } else {
      if (slots.some(s => s.label === t)) return;
      slots.push({ label: t, customAnswers: null });
    }
  });
  return slots.slice(0, 2);
}
function getSummativeTypes(i) {
  return resolveSummativeTypeSlots(i).map(s => s.label);
}
function onSummativeTypeChange(i, slot, val) {
  ensureSummatives();
  const sm = state.summatives[i];
  migrateSummativeMeta(sm);
  if (val === CUSTOM_ANSWER_TYPE) {
    const existing = (sm.customAnswers[slot] || []).join(', ');
    const input = prompt('Type the answers pupils should give for this test (2 to 6 answers, separated by commas):', existing);
    if (input === null) { renderSummativesTable(); return; }
    const answers = input.split(',').map(a => a.trim()).filter(Boolean);
    if (answers.length < 2 || answers.length > 6) {
      toast('Please enter between 2 and 6 answers.', 'te');
      renderSummativesTable();
      return;
    }
    sm.customAnswers[slot] = answers;
  }
  sm.testTypes[slot] = val;
  if (slot === 1 && val && val === sm.testTypes[0] && val !== CUSTOM_ANSWER_TYPE) {
    sm.testTypes[1] = '';
    toast('Type 2 cannot be the same as Type 1.', 'te');
    renderSummativesTable();
    return;
  }
  renderSummativesTable();
  debounceSave();
}
function editSummativeCustomAnswers(i, slot) {
  onSummativeTypeChange(i, slot, CUSTOM_ANSWER_TYPE);
}
function pickDefaultSummativeTypes() {
  const shuffled = [...SUMMATIVE_TYPES].filter(t => t !== CUSTOM_ANSWER_TYPE).sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]].filter((t, idx, arr) => arr.indexOf(t) === idx);
}
/** Summative language: Filipino only for Filipino & Arpan; English for all other subjects. */
function isSummativeFilipinoSubject(area) {
  const a = String(area || '').trim();
  return /\bfilipino\b/i.test(a) || /\barpan\b/i.test(a);
}

function getSummativeGradeGuidance(grade, row) {
  const area = row.area || '';
  const fromArea = area.match(/(?:grade\s*)?([456])\b/i) || area.match(/\b([456])\s*$/);
  let g = fromArea ? fromArea[1] : (grade === 'multi' ? null : grade);
  const display = g ? `Grade ${g}` : (grade === 'multi' ? 'Grades 4–6' : `Grade ${grade}`);
  const band = g || (grade === 'multi' ? '4-6' : grade);
  const gradeRules = {
    '4': 'whole numbers up to 10,000; basic fractions; simple science vocabulary; short reading texts (3–4 sentences).',
    '5': 'fractions and decimals; basic geometry terms; cause-and-effect questions; paragraphs of 4–5 sentences.',
    '6': 'ratio and percent basics; data tables; inferential but still concrete questions; paragraphs up to 6 sentences.',
    '4-6': 'mix difficulty suitable for upper elementary (ages 9–12); never high school or college level.',
  };
  return {
    display,
    band,
    rules: gradeRules[band] || gradeRules['4-6'],
  };
}
function mkRow(area='') {
  return { area, subjectMatter:'', competencies:'', objectives:'', faith:'', mon:'', tue:'', wed:'', thu:'SUMMATIVE', fri:'' };
}

/* RESTORE */
function restoreDraft() {
  document.getElementById('restoreMo').classList.remove('show');
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    sv('teacher', d.teacher||''); sv('gradeLevel', d.grade||'4'); sv('section', d.section||'');
    sv('quarter', d.quarter||'4th Quarter'); sv('date', d.date||''); sv('sy', d.sy||'SY 2025-2026');
    sv('prepBy', d.prepBy||''); sv('prepTitle', d.prepTitle||'Teacher');
    sv('checkBy', d.checkBy||'Nathaniel A. Lofranco'); sv('checkTitle', d.checkTitle||'School Head');
    document.getElementById('globalTopic').value = d.topic||'';
    state.subjects = d.subjects || [...GRADE_SUBJECTS['4']];
    state.rows = d.rows || [];
    state.summatives = d.summatives || [];
    state.sumRefSubject = d.sumRefSubject || '';
    sv('sumRefText', d.sumRefText || '');
    ensureSummatives();
    updateSY(); renderSubs(); renderTable(); renderSummativesTable();
    toast('Draft restored!','ts');
  } catch(e) { clearRestore(); }
}
function clearRestore() {
  localStorage.removeItem(SAVE_KEY);
  document.getElementById('restoreMo').classList.remove('show');
  state.subjects = [...GRADE_SUBJECTS['4']];
  initRows(); renderSubs(); renderTable(); renderSummativesTable();
}

/* ════════════════════════════════
   HELPERS
════════════════════════════════ */
function sv(id,v){ const e=document.getElementById(id); if(e) e.value=v; }
function gv(id){ return (document.getElementById(id)||{}).value||''; }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toast(msg,cls='ti'){
  const c=document.getElementById('tw'), d=document.createElement('div');
  d.className='toast '+cls; d.textContent=msg; c.appendChild(d);
  setTimeout(()=>d.remove(), 4000);
}
function updateSY(){
  document.getElementById('phSY').textContent = gv('sy');
  debounceSave();
}
function debounceSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(autoSave, 1500); }
function autoSave(){
  syncDOM();
  const d = {
    teacher:gv('teacher'), grade:gv('gradeLevel'), section:gv('section'),
    quarter:gv('quarter'), date:gv('date'), sy:gv('sy'),
    prepBy:gv('prepBy'), prepTitle:gv('prepTitle'),
    checkBy:gv('checkBy'), checkTitle:gv('checkTitle'),
    topic:gv('globalTopic'), subjects:state.subjects, rows:state.rows,
    summatives: state.summatives,
    sumRefSubject: state.sumRefSubject || '',
    sumRefText: gv('sumRefText'),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  document.getElementById('saveLabel').textContent = 'Saved '+new Date().toLocaleTimeString();
}
function syncDOM(){
  document.querySelectorAll('[contenteditable][data-r]').forEach(el=>{
    const i=+el.dataset.r, col=el.dataset.c;
    if(!isNaN(i) && state.rows[i]) state.rows[i][col]=el.innerText.trim();
  });
}

/* ════════════════════════════════
   SUBJECTS
════════════════════════════════ */
function renderSubs(){
  document.getElementById('subGrid').innerHTML = state.subjects.map((s,i)=>
    `<div class="sub-chip">${esc(s)}<button onclick="removeSub(${i})">✕</button></div>`
  ).join('');
}
function removeSub(i){
  state.subjects.splice(i,1); state.rows.splice(i,1); state.summatives.splice(i,1);
  renderSubs(); renderTable(); renderSummativesTable();
}
function addSubject(){
  const el=document.getElementById('newSub'), v=el.value.trim();
  if(!v) return;
  state.subjects.push(v); state.rows.push(mkRow(v)); state.summatives.push(mkSummativeMeta());
  el.value=''; renderSubs(); renderTable(); renderSummativesTable();
}
function onGradeChange(){
  const g=gv('gradeLevel');
  const dirty = state.rows.some(r=>r.subjectMatter||r.competencies);
  if(dirty && !confirm('Changing grade will reset subjects. Continue?')) return;
  state.subjects=[...GRADE_SUBJECTS[g]||GRADE_SUBJECTS['4']];
  initRows(); renderSubs(); renderTable(); renderSummativesTable();
}

/* ════════════════════════════════
   SUMMATIVES TABLE
════════════════════════════════ */
function renderSummativesTable() {
  syncDOM();
  ensureSummatives();
  renderSumRefSubjectOptions();
  const tbody = document.getElementById('sumBody');
  if (!tbody) return;
  // Build display order: the subject the reference material refers to is moved
  // to the TOP and emphasized, while keeping each row's original index intact.
  const refSubj = (state.sumRefSubject || '').trim();
  const order = state.rows.map((_, i) => i);
  if (refSubj) {
    order.sort((a, b) => {
      const aMatch = state.rows[a].area === refSubj ? 0 : 1;
      const bMatch = state.rows[b].area === refSubj ? 0 : 1;
      return aMatch - bMatch;
    });
  }
  tbody.innerHTML = order.map((i) => {
    const row = state.rows[i];
    const sm = state.summatives[i] || mkSummativeMeta();
    const objText = (row.objectives || '').trim();
    const objSnippet = objText
      ? esc(objText.length > 120 ? objText.slice(0, 120) + '…' : objText)
      : '<span class="sum-none">Fill objectives in lesson plan first</span>';
    migrateSummativeMeta(sm);
    const t0 = sm.testTypes[0] || '';
    const t1 = sm.testTypes[1] || '';
    const hasDoc = sm.items && sm.items.length > 0;
    const dlDisabled = hasDoc ? '' : ' disabled title="Generate a test first"';
    const genLabel = hasDoc ? '🔄 New Test' : '🤖 Generate';
    const langBadge = isSummativeFilipinoSubject(row.area)
      ? '<span class="sum-type-badge" style="background:#E8F5E9;color:#1B5E20;margin-top:4px;display:inline-block;">🇵🇭 Filipino</span>'
      : '<span class="sum-type-badge" style="background:#E3F2FD;color:#1565C0;margin-top:4px;display:inline-block;">English</span>';
    const isRef = refSubj && row.area === refSubj;
    const rowStyle = isRef ? ' style="background:#FFF3CD;box-shadow:inset 4px 0 0 #E65100;"' : '';
    const refTag = isRef ? '<br><span class="sum-type-badge" style="background:#FFE082;color:#7A5800;margin-top:4px;display:inline-block;">⭐ Reference material</span>' : '';
    return `<tr${rowStyle}>
      <td><strong style="color:#E65100;font-size:12px;">${esc(row.area)}</strong><br>${langBadge}${refTag}</td>
      <td><div class="obj-snippet">${objSnippet}</div></td>
      <td style="text-align:center;">
        <input type="number" class="sum-items-inp" min="3" max="80" value="${sm.itemCount || 10}"
          onchange="setSummativeItems(${i}, this.value)" title="Number of test items (split across both types)">
      </td>
      <td>
        <div class="sum-type-picks">
          ${summativeTypeSelectHtml(t0, i, 0)}
          ${t0 === CUSTOM_ANSWER_TYPE ? `<span class="sum-type-badge" style="background:#EDE7F6;color:#4527A0;cursor:pointer;" onclick="editSummativeCustomAnswers(${i},0)" title="${esc((sm.customAnswers[0]||[]).join(', '))}">✎ ${(sm.customAnswers[0]||[]).length} answers</span>` : ''}
          ${summativeTypeSelectHtml(t1, i, 1)}
          ${t1 === CUSTOM_ANSWER_TYPE ? `<span class="sum-type-badge" style="background:#EDE7F6;color:#4527A0;cursor:pointer;" onclick="editSummativeCustomAnswers(${i},1)" title="${esc((sm.customAnswers[1]||[]).join(', '))}">✎ ${(sm.customAnswers[1]||[]).length} answers</span>` : ''}
        </div>
        <div class="sum-type-hint">Type 1 required · Type 2 optional (1 or 2 types) · Custom Answer Set can be used in both</div>
      </td>
      <td>
        <div class="sum-actions">
          <button class="btn bp bsm" id="sumGenBtn_${i}" onclick="generateSummative(${i})">${genLabel}</button>
          <button class="btn bg bsm" onclick="downloadSummative(${i})"${dlDisabled}>⬇ Download DOCX</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/** Populate the "which subject does the reference material refer to" dropdown. */
function renderSumRefSubjectOptions() {
  const sel = document.getElementById('sumRefSubject');
  if (!sel) return;
  const current = state.sumRefSubject || '';
  const opts = ['<option value="">— All subjects (no priority) —</option>']
    .concat(state.subjects.map(s => `<option value="${esc(s)}"${s === current ? ' selected' : ''}>${esc(s)}</option>`));
  sel.innerHTML = opts.join('');
  // Drop a stale selection if that subject no longer exists.
  if (current && !state.subjects.includes(current)) {
    state.sumRefSubject = '';
    sel.value = '';
  } else {
    sel.value = current;
  }
  const note = document.getElementById('sumRefSubjectNote');
  if (note) {
    if (state.sumRefSubject) {
      note.style.display = 'block';
      note.innerHTML = `⭐ <strong>${esc(state.sumRefSubject)}</strong> is prioritized — it appears at the top of the list and the AI will treat the reference material as belonging to this subject.`;
    } else {
      note.style.display = 'none';
    }
  }
}

/** Teacher picked which subject the pasted text / pictures belong to. */
function onSumRefSubjectChange() {
  const sel = document.getElementById('sumRefSubject');
  state.sumRefSubject = sel ? sel.value : '';
  renderSummativesTable();
  debounceSave();
}

function setSummativeItems(i, val) {
  ensureSummatives();
  const n = Math.min(80, Math.max(3, parseInt(val, 10) || 10));
  state.summatives[i].itemCount = n;
  debounceSave();
}

function buildSummativePrompt(row, itemCount, testTypes, customAnswersMap) {
  const grade = gv('gradeLevel');
  const { display: gradeDisplay, band, rules } = getSummativeGradeGuidance(grade, row);
  const quarter = gv('quarter');
  const school = 'UPPER KLINAN SDA SCHOOL INC (Seventh-day Adventist, Philippines)';
  const isFilipino = isSummativeFilipinoSubject(row.area);
  const langRule = isFilipino
    ? `LANGUAGE (CRITICAL): Learning area is "${row.area}" — Filipino or Arpan subject.
- Write the ENTIRE summative in Filipino (Tagalog): title, instructions, section labels (e.g. "Bahagi"), word bank, Column A/B labels, and EVERY question/item.
- Do NOT use English except proper nouns (names, places, book titles).
- Test type names in JSON "format" field may stay in English (e.g. "True or False") but pupil-facing "prompt" text must be Filipino.`
    : `LANGUAGE (CRITICAL): Learning area is "${row.area}" — NOT Filipino or Arpan.
- Write the ENTIRE summative in English only: title, instructions, word bank, and EVERY question/item.
- Do NOT use Filipino, Tagalog, or mixed language — English only (proper nouns allowed).`;
  const objectives = (row.objectives || '').trim();
  const subjectMatter = (row.subjectMatter || '').trim() || gv('globalTopic').trim() || row.area;
  const competencies = (row.competencies || '').trim();
  /* Optional reference material the teacher pasted / uploaded for accurate item generation. */
  const refText = (document.getElementById('sumRefText')?.value || '').trim();
  const hasImages = (typeof sumRefImages !== 'undefined') && sumRefImages.length > 0;
  const refSubject = (state.sumRefSubject || '').trim();
  let refBlock = '';
  if (refText || hasImages) {
    refBlock = `\nREFERENCE MATERIAL (HIGHEST PRIORITY — base EVERY item strictly on this content; do not invent facts outside it):`;
    if (refSubject) {
      refBlock += `\n- This reference material was provided for the subject "${refSubject}".`;
      if (refSubject === row.area) {
        refBlock += ` It DIRECTLY matches this summative — rely on it heavily for every item.`;
      } else {
        refBlock += ` This summative is for "${row.area}", so use the reference only where it is clearly relevant; otherwise follow the subject matter and objectives.`;
      }
    }
    if (hasImages) refBlock += `\n- ${sumRefImages.length} picture(s) of the lesson are attached. READ them carefully (text, diagrams, examples) and use that exact content.`;
    if (refText) refBlock += `\n- Pasted lesson text:\n"""\n${refText}\n"""`;
    refBlock += `\n`;
  }
  const types = testTypes.length ? testTypes : ['Identification'];
  const typesLabel = types.join(' + ');
  const countA = types.length === 2 ? Math.ceil(itemCount / 2) : itemCount;
  const countB = types.length === 2 ? itemCount - countA : 0;

  const typeInstructions = types.map((t, idx) => {
    const n = types.length === 2 ? (idx === 0 ? countA : countB) : itemCount;
    const baseType = t.replace(/ \(Set \d+\)$/, '');
    const customAnswers = (customAnswersMap && customAnswersMap[t]) || null;
    const hints = {
      'True or False': 'Write ' + n + ' clear factual statements pupils mark as True or False. Each prompt is a complete statement. The answer must be exactly True or False.',
      'True or False (Write the Correct Answer)': 'Write ' + n + ' clear factual statements. If a statement is TRUE, answer is exactly "True". If a statement is FALSE, do NOT use the word "False" as the answer \u2014 instead the answer must be the CORRECTED true statement/fact so pupils see the right answer (e.g. statement: "The sun revolves around the Earth." answer: "The Earth revolves around the sun."). Mix true and false statements roughly evenly.',
      'Matching Type': 'Generate exactly ' + n + ' matching pairs. For EACH item: prompt = Column A entry (term or question), columnB = the correct Column B match (definition or answer). Also copy the Column B text into answer. Never merge both columns into one field.',
      'Multiple Choice': 'Write ' + n + ' multiple-choice questions. Each item MUST include a "choices" array of exactly 4 short answer options (plain option text only \u2014 do NOT prefix them with A/B/C/D, those letters are added automatically). Exactly ONE option is correct; the other 3 must be plausible but clearly wrong distractors appropriate for the grade level. "answer" must be an EXACT copy (character-for-character) of the correct option\'s text as it appears in the choices array.',
      'Word Bank': 'Include a top-level wordBank array with ' + n + ' answer words plus 3 extra distractors. Each item prompt is a sentence with _______ for the blank. answer is the correct word from the bank.',
      'Identification': 'Write ' + n + ' clue sentences or descriptions. answer is the specific word, name, or short phrase (1-4 words) that identifies what is described.',
      'Enumeration': 'Write ' + n + ' enumeration prompts asking pupils to list/enumerate multiple related items, parts, examples, causes, or steps (state exactly how many to list, e.g. "List the 3 branches of the Philippine government."). answer contains the complete expected list, items separated by commas.',
      [CUSTOM_ANSWER_TYPE]: 'Write ' + n + ' statements or questions whose correct answer is EXACTLY one of these teacher-provided answers: ' + (customAnswers && customAnswers.length ? customAnswers.map(a => '"' + a + '"').join(', ') : '(no answers provided)') + '. ACCURACY IS CRITICAL: only write items whose TRUE, factually/grammatically correct answer genuinely and unambiguously matches ONE of the listed answers above \u2014 never force-fit, guess, or pick the closest option when the real correct answer is something else NOT in the list. If the given answers are a closed set of categories (e.g. specific grammar/subject categories), every example, word, or scenario you choose must actually belong to one of those exact categories; do NOT write an item about a word or concept that truly belongs to a different category outside the given list. Distribute the items as evenly as possible across all the given answers. Every item under this part must use "format":"' + t + '" exactly (do not mix it up with any other custom-answer part in this same test). The "answer" field must copy the chosen answer exactly (character-for-character) as given.',
      'Fill in the Blanks': 'Write ' + n + ' sentences each with exactly one blank (_______). answer is the word or short phrase that correctly fills the blank.',
      'Short Answer': 'Write ' + n + ' open-ended questions. answer contains a model answer in 1-2 sentences.',
      'Essay / Extended Response': 'Write ' + n + ' essay prompts suited to elementary level. answer contains a model answer outline in 2-4 sentences.',
      'Performance Task': 'Write ' + n + ' task instructions with observable criteria. answer describes the expected output.',
      'Problem Solving': 'Write ' + n + ' problems with clear steps. answer shows the correct solution with working.',
      'Oral Recitation': 'Write ' + n + ' prompts for oral response. answer contains the expected spoken response.',
      'Practical Test': 'Write ' + n + ' skill demonstration instructions. answer describes the correct procedure.',
    };
    return '  \u2022 "' + t + '": ' + (hints[baseType] || ('Exactly ' + n + ' items. Follow standard format.'));
  }).join('\n');

  const matchingType = types.includes('Matching Type');
  const wordBankType = types.includes('Word Bank');
  const mcType = types.includes('Multiple Choice');
  const customNotes = types.filter(t => customAnswersMap && customAnswersMap[t])
    .map(t => 'items with format "' + t + '" must use one of these exact answers only: ' + customAnswersMap[t].map(a => '"' + a + '"').join(', '))
    .join('; ');

  return `You are an expert Filipino elementary school assessment writer for ${school}.
Return ONLY raw valid JSON. No markdown, no backticks, no explanation.

Create a SUMMATIVE ASSESSMENT for:
- Subject / Learning Area: ${row.area}
- Target learners: ${gradeDisplay} (Philippine elementary, Grades 4-6 band only)
- Quarter: ${quarter}
- Subject Matter: ${subjectMatter}
${competencies ? '- Learning Competencies: ' + competencies : ''}
- Learning Objectives (every item must connect to these):
${objectives || '(derive from subject matter and K-12 competencies for Grades 4-6)'}

GRADE LEVEL (CRITICAL):
- Write ALL questions at the reading and thinking level of ${gradeDisplay} pupils (ages 9-12).
- Use simple, direct wording; avoid high school or college vocabulary.
- Content depth: ${rules}

Assessment format:
- Test types: ${typesLabel}
- Total items: exactly ${itemCount} (numbered 1 to ${itemCount} continuously)
${typeInstructions}
${mcType ? '- Multiple Choice items are ALLOWED for this test (see instructions above) \u2014 include the "choices" array as specified.' : '- NEVER use multiple choice (no A/B/C/D options).'}
- Each item must include a "format" field matching one of: ${types.map(t => '"' + t + '"').join(', ')}
- Do NOT add a "points" field to any item.
- The "instructions" text must tell pupils WHAT TO DO only — do NOT mention the number of items.

${langRule}
${!isFilipino && /bible/i.test(row.area || '') ? '- Bible subject: use age-appropriate scripture-based prompts in English (NIV).' : ''}
${refBlock}
CRITICAL JSON RULES (follow EXACTLY to avoid format errors):
- Output ONE JSON object only. Use straight double quotes ("). No trailing commas. No markdown, no comments.
- EVERY item's "prompt" field MUST be a full, real statement or question (never blank, never just the word "True" or "False", never a placeholder). This applies to ALL items, including True/False types — the prompt is the STATEMENT to judge, not the answer.
- Matching Type items: "prompt" = Column A text ONLY, "columnB" = Column B text ONLY, "answer" = same as columnB. Never put both columns in "prompt".
- Multiple Choice items: include a "choices" array of exactly 4 plain option strings (no A/B/C/D prefixes). "answer" must be an EXACT copy of the correct option's text from that array.
- Word Bank type: include a top-level "wordBank" array with answer words plus 3 distractors.
- No "points" field anywhere. No item count in instructions.

Return this exact JSON shape:
{"testTypes":${JSON.stringify(types)},"title":"[test title]","instructions":"[what to do — no item count]",${wordBankType ? '"wordBank":["word1","word2","word3"],' : ''}"items":[{"number":1,"format":"${types[0]}","prompt":"[Column A text or question]",${matchingType ? '"columnB":"[Column B match]",' : ''}${mcType ? '"choices":["[option1]","[option2]","[option3]","[option4]"],' : ''}"answer":"[correct answer]"}]}

The "answer" field must always be filled: True/False items use "True" or "False"; "True or False (Write the Correct Answer)" items use "True" if correct, or the CORRECTED true statement (never the word "False") if incorrect; Matching Type uses the Column B text; Fill/Identification uses the exact word or phrase; Enumeration lists every expected item separated by commas; ${customNotes ? customNotes + '; ' : ''}Essay uses a 1-2 sentence model answer.`;
}

async function fetchAIPrompt(prompt, maxTokens = 4096, images = []) {
  const apiKey = getActiveKey();
  if (!apiKey) throw new Error('NO_KEY');
  const activeKeyObj = mkKeys[mkActive] || {};
  const provider = activeKeyObj.provider || 'gemini';

  /* Normalize images → [{mime, b64}] from data URLs. */
  const imgParts = (images || []).map(u => {
    const m = /^data:([^;]+);base64,(.*)$/.exec(u || '');
    return m ? { mime: m[1], b64: m[2] } : null;
  }).filter(Boolean);

  if (provider === 'deepseek') {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat', max_tokens: maxTokens, temperature: 0.7,
        messages: [
          { role: 'system', content: 'Return only valid JSON, no markdown, no backticks.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 429 || errMsg.includes('quota') || errMsg.includes('rate')) throw new Error('QUOTA');
      if (resp.status === 401) throw new Error('Unauthorized');
      throw new Error(errMsg);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if (!raw) throw new Error('DeepSeek returned empty content.');
    return parseAIJson(raw);

  } else if (provider === 'mistral') {
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'mistral-small-latest', max_tokens: maxTokens, temperature: 0.7,
        messages: [
          { role: 'system', content: 'Return only valid JSON, no markdown, no backticks.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const errMsg = errData.message || errData.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 429 || errMsg.includes('quota') || errMsg.includes('rate')) throw new Error('QUOTA');
      if (resp.status === 401) throw new Error('Unauthorized');
      throw new Error(errMsg);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if (!raw) throw new Error('Mistral returned empty content.');
    return parseAIJson(raw);

  } else if (provider === 'openai' || provider === 'groq') {
    const url = provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
    /* OpenAI vision: when images are present, send a multimodal user message (gpt-4o-mini supports vision). */
    const userContent = (provider === 'openai' && imgParts.length)
      ? [{ type: 'text', text: prompt }, ...imgParts.map(p => ({ type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.b64}` } }))]
      : prompt;
    const body = {
      model, max_tokens: maxTokens, temperature: 0.7,
      messages: [
        { role: 'system', content: 'Return only valid JSON, no markdown, no backticks.' },
        { role: 'user', content: userContent },
      ],
    };
    if (provider === 'openai') body.response_format = { type: 'json_object' };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 429 || errMsg.includes('quota') || errMsg.includes('rate')) throw new Error('QUOTA');
      throw new Error(errMsg);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if (!raw) throw new Error('AI returned empty content.');
    return parseAIJson(raw);

  } else if (provider === 'cohere') {
    const resp = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'command-r-plus', max_tokens: maxTokens, temperature: 0.7,
        messages: [
          { role: 'system', content: 'Return only valid JSON, no markdown, no backticks.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const errMsg = errData.message || `HTTP ${resp.status}`;
      if (resp.status === 429 || errMsg.includes('quota') || errMsg.includes('rate')) throw new Error('QUOTA');
      throw new Error(errMsg);
    }
    const data = await resp.json();
    const raw = data.message?.content?.[0]?.text || '';
    if (!raw) throw new Error('Cohere returned empty content.');
    return parseAIJson(raw);

  } else if (provider === 'openrouter') {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': 'https://localhost', 'X-Title': 'Lesson Plan Generator' },
      body: JSON.stringify({
        model: 'openrouter/free',
        max_tokens: 2048, temperature: 0.7,
        messages: [
          { role: 'system', content: 'Return only valid JSON, no markdown, no backticks.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const raw = errData.error?.metadata?.raw;
      const inner = raw ? (() => { try { return JSON.parse(raw); } catch(_){ return null; } })() : null;
      const errMsg = inner?.error?.message || errData.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 429 || errMsg.includes('quota') || errMsg.includes('rate')) throw new Error('QUOTA');
      throw new Error('OpenRouter: ' + errMsg);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if (!raw) throw new Error('OpenRouter returned empty content.');
    return parseAIJson(raw);

  } else {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            ...imgParts.map(p => ({ inline_data: { mime_type: p.mime, data: p.b64 } })),
          ] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 429) throw new Error('QUOTA');
      throw new Error(errMsg);
    }
    const data = await resp.json();
    let raw = '';
    try { raw = data.candidates[0].content.parts[0].text || ''; }
    catch (_) { throw new Error('Unexpected Gemini response.'); }
    return parseAIJson(raw);
  }
}

/* ── Summative reference material (paste words + uploaded pictures) ── */
let sumRefImages = [];  // [{name, dataUrl}]
async function sumHandleImages(fileList){
  const files = Array.from(fileList).filter(f => /^image\//i.test(f.type));
  if(!files.length){ toast('Please upload image files (JPG/PNG).','te'); return; }
  if(files.length + sumRefImages.length > 4){ toast('Maximum 4 pictures.','te'); return; }
  for(const file of files){
    const dataUrl = await new Promise((res)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
    sumRefImages.push({ name:file.name, dataUrl });
  }
  document.getElementById('sumRefImgInput').value='';
  sumRenderImages();
}
function sumRenderImages(){
  const wrap = document.getElementById('sumRefImgList');
  if(!wrap) return;
  wrap.innerHTML = sumRefImages.map((im,i)=>`
    <div style="position:relative;width:62px;height:62px;border:1px solid #FFE082;border-radius:8px;overflow:hidden;">
      <img src="${im.dataUrl}" style="width:100%;height:100%;object-fit:cover;" alt="${esc(im.name)}">
      <button onclick="sumRemoveImage(${i})" title="Remove" style="position:absolute;top:1px;right:1px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:4px;font-size:10px;cursor:pointer;padding:1px 4px;">✕</button>
    </div>`).join('');
}
function sumRemoveImage(i){ sumRefImages.splice(i,1); sumRenderImages(); }

async function generateSummative(i) {
  const apiKey = getActiveKey();
  if (!apiKey) { toast('Add an API Key first.', 'te'); return; }

  syncDOM();
  ensureSummatives();
  const row = state.rows[i];
  if (!row) return;

  const objectives = (row.objectives || '').trim();
  const subjectMatter = (row.subjectMatter || '').trim();
  if (!objectives && !subjectMatter) {
    toast('Add objectives or subject matter in the lesson plan row first.', 'te');
    return;
  }

  const sm = state.summatives[i];
  const itemCount = sm.itemCount || 10;
  migrateSummativeMeta(sm);
  let typeSlots = resolveSummativeTypeSlots(i);
  if (!typeSlots.length) {
    const defaults = pickDefaultSummativeTypes();
    sm.testTypes = [defaults[0], defaults[1] || ''];
    typeSlots = resolveSummativeTypeSlots(i);
    renderSummativesTable();
  }
  if (!typeSlots.length) {
    toast('Select at least one test type (Type 1).', 'te');
    return;
  }

  const missingCustom = typeSlots.some(s => s.customAnswers !== null && s.customAnswers.length < 2);
  if (missingCustom) {
    toast('Set the 2\u20136 answers for the custom answer type first.', 'te');
    return;
  }

  const types = typeSlots.map(s => s.label);
  const customAnswersMap = {};
  typeSlots.forEach(s => { if (s.customAnswers && s.customAnswers.length) customAnswersMap[s.label] = s.customAnswers; });

  const typesLabel = types.join(' + ');

  const btn = document.getElementById('sumGenBtn_' + i);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  document.getElementById('loadingOv').classList.add('show');
  document.querySelector('.ov-title').textContent = 'Generating Summative Test…';
  document.getElementById('ovSub').textContent = `${row.area} — ${typesLabel} (${itemCount} items, ${getSummativeGradeGuidance(gv('gradeLevel'), row).display})`;

  try {
    const prompt = buildSummativePrompt(row, itemCount, types, customAnswersMap);
    const tfFormats = types.filter(t => t === 'True or False' || t === 'True or False (Write the Correct Answer)');
    const isMalformedTFItem = (it) => {
      if (!tfFormats.includes(it.format)) return false;
      const p = String(it.prompt || '').trim();
      if (p.length < 8) return true;
      if (/^(true|false)\.?$/i.test(p)) return true;
      return false;
    };

    let result = null;
    let items = [];
    let attempt = 0;
    const maxAttempts = tfFormats.length ? 3 : 1;
    while (attempt < maxAttempts) {
      attempt++;
      result = await fetchAIPrompt(prompt, 8192, sumRefImages.map(im => im.dataUrl));
      items = (result.items || []).slice(0, itemCount);
      const badCount = items.filter(isMalformedTFItem).length;
      if (badCount === 0) break;
    }
    // Drop any item still malformed after retries rather than showing it to pupils.
    items = items.filter(it => !isMalformedTFItem(it));
    items.forEach((it, idx) => { it.number = idx + 1; });
    while (items.length < itemCount) {
      const fmt = types[items.length % types.length];
      const filler = { number: items.length + 1, format: fmt, prompt: `[${fmt} — Item ${items.length + 1}]`, points: 2 };
      if (fmt === 'Multiple Choice') { filler.choices = ['Option A', 'Option B', 'Option C', 'Option D']; filler.answer = 'Option A'; }
      items.push(filler);
    }

    state.summatives[i] = {
      itemCount,
      testTypes: sm.testTypes.slice(0, 2),
      testType: (result.testTypes || types).join(' + '),
      title: result.title || `Summative — ${row.area}`,
      instructions: result.instructions || '',
      wordBank: result.wordBank || [],
      items,
      generatedAt: new Date().toISOString(),
      area: row.area,
      objectives: row.objectives,
      subjectMatter: row.subjectMatter,
      customAnswers: sm.customAnswers || [[], []],
    };

    renderSummativesTable();
    autoSave();
    exportSummativeDOCX(i);
    toast(`✅ ${row.area} summative ready — downloaded!`, 'ts');
  } catch (e) {
    if (e.message === 'QUOTA' && markQuota(apiKey)) {
      toast('🔄 Quota hit, retrying with next key…', 'ti');
      setTimeout(() => generateSummative(i), 800);
      return;
    }
    handleApiError(e);
  } finally {
    document.getElementById('loadingOv').classList.remove('show');
    document.querySelector('.ov-title').textContent = 'Generating Lesson Plan…';
    document.getElementById('ovSub').textContent = 'Asking Gemini AI for curriculum content…';
    if (btn) { btn.disabled = false; }
    renderSummativesTable();
  }
}

function downloadSummative(i) {
  ensureSummatives();
  const sm = state.summatives[i];
  if (!sm || !sm.items || !sm.items.length) {
    toast('Generate a summative test first.', 'te');
    return;
  }
  exportSummativeDOCX(i);
}

function exportSummativeDOCX(i) {
  syncDOM();
  ensureSummatives();
  const row = state.rows[i];
  const sm = state.summatives[i];
  if (!row || !sm || !sm.items || !sm.items.length) {
    toast('No summative data to export.', 'te');
    return;
  }

  const teacher = gv('teacher');
  const grade = gv('gradeLevel');
  const section = gv('section');
  const quarter = gv('quarter');
  const date = gv('date');
  const sy = gv('sy');
  const gradeLabel = grade === 'multi' ? '4-5-6' : grade;

  const x = s => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const lines = s => x(s).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">');

  const para = (text, opts = {}) => {
    const { bold = false, color = '', center = false, sz = 20 } = opts;
    return `<w:p><w:pPr>${center ? '<w:jc w:val="center"/>' : ''}</w:pPr>
      <w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}
      <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rFonts w:val="Arial"/></w:rPr>
      <w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
  };

  const cellPara = (text, opts = {}) => {
    const { bold = false, color = '', center = false, sz = 18, shading = '' } = opts;
    return `<w:p><w:pPr>${center ? '<w:jc w:val="center"/>' : ''}
      ${shading ? `<w:shd w:val="clear" w:color="${shading}" w:fill="${shading}"/>` : ''}
      </w:pPr>
      <w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}
      <w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rFonts w:val="Arial"/></w:rPr>
      <w:t xml:space="preserve">${lines(text)}</w:t></w:r></w:p>`;
  };

  const bdr = `<w:top w:val="single" w:sz="4" w:color="AAAAAA"/>
               <w:left w:val="single" w:sz="4" w:color="AAAAAA"/>
               <w:bottom w:val="single" w:sz="4" w:color="AAAAAA"/>
               <w:right w:val="single" w:sz="4" w:color="AAAAAA"/>`;

  const infoTc = (label, value, boldLabel = true) =>
    `<w:tr>
      <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:tcBorders>${bdr}</w:tcBorders></w:tcPr>
        ${cellPara(label, { bold: boldLabel, sz: 18 })}</w:tc>
      <w:tc><w:tcPr><w:tcW w:w="7200" w:type="dxa"/><w:tcBorders>${bdr}</w:tcBorders></w:tcPr>
        ${cellPara(value, { sz: 18 })}</w:tc>
    </w:tr>`;

  const itemFormats = [];
  (sm.items || []).forEach(it => {
    if (it.format && !itemFormats.includes(it.format)) itemFormats.push(it.format);
  });
  const typeLabel = itemFormats.length
    ? itemFormats.join(' + ')
    : ((sm.testTypes && sm.testTypes.filter(Boolean).join(' + ')) || sm.testType || '—');
  const typesOrder = itemFormats.length
    ? itemFormats
    : ((sm.testTypes && sm.testTypes.filter(Boolean).length) ? sm.testTypes.filter(Boolean) : [typeLabel]);
  const grouped = {};
  typesOrder.forEach(t => { grouped[t] = []; });
  sm.items.forEach(it => {
    const fmt = it.format && grouped[it.format] !== undefined ? it.format : typesOrder[0];
    if (!grouped[fmt]) grouped[fmt] = [];
    grouped[fmt].push(it);
  });
  let itemsBlock = '';
  Object.keys(grouped).forEach(fmt => {
    if (!grouped[fmt].length) return;
    // Section header
    itemsBlock += para(`Part: ${fmt}`, { bold: true, color: 'E65100', sz: 22 });

    if (fmt === 'Multiple Choice') {
      // --- Render question + choices in a compact 2-column layout: A/C on one line, B/D on the next ---
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const bdrNone = `<w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>`;
      const mcCell = (txt) =>
        `<w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/><w:tcBorders>${bdrNone}</w:tcBorders></w:tcPr>
          <w:p><w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:rFonts w:val="Arial"/></w:rPr>
          <w:t xml:space="preserve">${x(txt)}</w:t></w:r></w:p></w:tc>`;
      grouped[fmt].forEach(it => {
        itemsBlock += para(`${it.number}. ${it.prompt || ''}`, { sz: 20 });
        const choices = Array.isArray(it.choices) ? it.choices : [];
        if (choices.length === 4) {
          // Column-major fill: left column = A,B (top-bottom); right column = C,D (top-bottom)
          // Rows read across as: (A, C) then (B, D)
          let tbl = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${bdrNone}</w:tblBorders></w:tblPr>`;
          for (let r = 0; r < 2; r++) {
            const leftIdx = r;
            const rightIdx = r + 2;
            const leftTxt = `${letters[leftIdx] || ''}. ${choices[leftIdx] || ''}`;
            const rightTxt = `${letters[rightIdx] || ''}. ${choices[rightIdx] || ''}`;
            tbl += `<w:tr>${mcCell(leftTxt)}${mcCell(rightTxt)}</w:tr>`;
          }
          tbl += `</w:tbl>`;
          itemsBlock += tbl;
        } else {
          choices.forEach((c, ci) => {
            itemsBlock += para(`      ${letters[ci] || ''}. ${c}`, { sz: 20 });
          });
        }
      });

    } else if (fmt === 'Matching Type') {
      // --- Render as a proper two-column table ---
      const bdrM = `<w:top w:val="single" w:sz="6" w:color="336699"/>
                    <w:left w:val="single" w:sz="6" w:color="336699"/>
                    <w:bottom w:val="single" w:sz="6" w:color="336699"/>
                    <w:right w:val="single" w:sz="6" w:color="336699"/>`;
      const headerCell = (txt) =>
        `<w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/><w:tcBorders>${bdrM}</w:tcBorders>
          <w:shd w:val="clear" w:color="336699" w:fill="336699"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/><w:szCs w:val="20"/>
          <w:rFonts w:val="Arial"/></w:rPr><w:t>${x(txt)}</w:t></w:r></w:p></w:tc>`;
      const dataCell = (txt) =>
        `<w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/><w:tcBorders>${bdrM}</w:tcBorders></w:tcPr>
          <w:p><w:pPr><w:jc w:val="left"/></w:pPr>
          <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:rFonts w:val="Arial"/></w:rPr>
          <w:t xml:space="preserve">${x(txt)}</w:t></w:r></w:p></w:tc>`;
      // Header row
      let tblXml = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>${bdrM}</w:tblBorders></w:tblPr>
        <w:tr>${headerCell('Column A')}${headerCell('Column B')}</w:tr>`;
      // Collect all unique Column B options (shuffled as answer choices)
      const colBOptions = grouped[fmt].map(it => it.columnB || it.answer || '').filter(Boolean);
      // Shuffle for display
      const shuffled = [...colBOptions].sort(() => Math.random() - 0.5);
      grouped[fmt].forEach((it, idx) => {
        const colA = `${it.number}. ${it.prompt || ''}`;
        const colB = shuffled[idx] !== undefined ? shuffled[idx] : (colBOptions[idx] || '');
        tblXml += `<w:tr>${dataCell(colA)}${dataCell(colB)}</w:tr>`;
      });
      tblXml += `</w:tbl>`;
      itemsBlock += tblXml;
      // Answer line space
      itemsBlock += para('Write your answer on the line before each number in Column A.', { color: '555555', sz: 18 });

    } else if (fmt === 'Word Bank') {
      // --- Render Word Bank as a shaded box table ---
      const wbWords = (sm.wordBank && sm.wordBank.length) ? sm.wordBank : [];
      if (wbWords.length) {
        const bdrWB = `<w:top w:val="single" w:sz="4" w:color="2E7D32"/>
                       <w:left w:val="single" w:sz="4" w:color="2E7D32"/>
                       <w:bottom w:val="single" w:sz="4" w:color="2E7D32"/>
                       <w:right w:val="single" w:sz="4" w:color="2E7D32"/>`;
        // Header row
        let wbTbl = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>
          <w:tblBorders>${bdrWB}</w:tblBorders></w:tblPr>
          <w:tr><w:tc><w:tcPr><w:tcW w:w="8640" w:type="dxa"/><w:tcBorders>${bdrWB}</w:tcBorders>
            <w:shd w:val="clear" w:color="2E7D32" w:fill="2E7D32"/></w:tcPr>
            <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
            <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="20"/><w:szCs w:val="20"/>
            <w:rFonts w:val="Arial"/></w:rPr><w:t>Word Bank</w:t></w:r></w:p></w:tc></w:tr>`;
        // Words row — break into rows of 4
        const chunkSize = 4;
        for (let c = 0; c < wbWords.length; c += chunkSize) {
          const chunk = wbWords.slice(c, c + chunkSize);
          const perCell = Math.floor(8640 / chunkSize);
          wbTbl += `<w:tr>`;
          chunk.forEach(w => {
            wbTbl += `<w:tc><w:tcPr><w:tcW w:w="${perCell}" w:type="dxa"/>
              <w:tcBorders>${bdrWB}</w:tcBorders>
              <w:shd w:val="clear" w:color="E8F5E9" w:fill="E8F5E9"/></w:tcPr>
              <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/>
              <w:rFonts w:val="Arial"/></w:rPr><w:t>${x(w)}</w:t></w:r></w:p></w:tc>`;
          });
          // Pad remaining cells if chunk is short
          for (let p = chunk.length; p < chunkSize; p++) {
            wbTbl += `<w:tc><w:tcPr><w:tcW w:w="${perCell}" w:type="dxa"/>
              <w:tcBorders>${bdrWB}</w:tcBorders>
              <w:shd w:val="clear" w:color="E8F5E9" w:fill="E8F5E9"/></w:tcPr>
              <w:p><w:r><w:t></w:t></w:r></w:p></w:tc>`;
          }
          wbTbl += `</w:tr>`;
        }
        wbTbl += `</w:tbl>`;
        itemsBlock += wbTbl;
        itemsBlock += '<w:p/>';
      }
      // Render items normally
      grouped[fmt].forEach(it => {
        itemsBlock += para(`${it.number}. ${it.prompt}`, { sz: 20 });
      });

    } else if (fmt === 'True or False (Write the Correct Answer)') {
      itemsBlock += para('Write TRUE if the statement is correct. If FALSE, write the correct answer on the line.', { color: '555555', sz: 18 });
      grouped[fmt].forEach(it => {
        itemsBlock += para(`${it.number}. ${it.prompt}`, { sz: 20 });
      });
    } else {
      // --- All other types: plain numbered list ---
      grouped[fmt].forEach(it => {
        itemsBlock += para(`${it.number}. ${it.prompt}`, { sz: 20 });
      });
    }

    itemsBlock += '<w:p/>';
  });

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"
  xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint"
  w:macrosPresent="no" w:embeddedObjPresent="no" w:ocxPresent="no">
<w:body>
  <w:sectPr>
    <w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>
    <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
  </w:sectPr>

  ${para('UPPER KLINAN SDA SCHOOL INC', { bold: true, color: '002060', center: true, sz: 22 })}
  ${para('Purok Mabinuligon, Upper Klinan, Polomolok, South Cotabato', { center: true, sz: 18 })}
  ${para('"Where Children Enjoy Holistic Learning"', { bold: true, color: 'C00000', center: true, sz: 18 })}
  ${para('SUMMATIVE ASSESSMENT', { bold: true, color: 'E65100', center: true, sz: 26 })}
  ${para(sy, { color: '0070C0', center: true, sz: 18 })}
  <w:p/>

  <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${bdr}</w:tblBorders></w:tblPr>
    ${infoTc('Title:', sm.title || `Summative — ${row.area}`)}
    ${infoTc('Subject:', row.area)}
    ${infoTc('Test Type(s):', typeLabel)}
    ${infoTc('Grade:', `${gradeLabel}${section ? ' — ' + section : ''}`)}
    ${infoTc('Quarter:', quarter)}
    ${infoTc('Date:', date || '—')}
    ${infoTc('Teacher:', teacher || '—')}
  </w:tbl>
  <w:p/>

  ${para('Subject Matter', { bold: true, color: '002060', sz: 20 })}
  ${para(sm.subjectMatter || row.subjectMatter || '—', { sz: 18 })}
  <w:p/>

  ${para('Learning Objectives', { bold: true, color: '002060', sz: 20 })}
  ${para(sm.objectives || row.objectives || '—', { sz: 18 })}
  <w:p/>

  ${para('Directions', { bold: true, color: '002060', sz: 20 })}
  ${para(sm.instructions || 'Answer all items below. Write your answers clearly.', { sz: 18 })}
  <w:p/>

  ${para('Items', { bold: true, color: 'E65100', sz: 22 })}
  ${itemsBlock}
  ${para('— — — — — — — — — — — — — — — — — — — — — — — — — — — —', { center: true, color: 'AAAAAA', sz: 16 })}
  ${para('ANSWER KEY  (For Teacher Use Only)', { bold: true, color: '2E7D32', center: true, sz: 22 })}
  <w:p/>
  ${(() => {
    let akBlock = '';
    Object.keys(grouped).forEach(fmt => {
      if (!grouped[fmt].length) return;
      akBlock += para(fmt + ':', { bold: true, color: 'E65100', sz: 18 });
      grouped[fmt].forEach(it => {
        const q = String(it.prompt || '').trim();
        const qShort = q.length > 90 ? q.slice(0, 87) + '\u2026' : q;
        let ansDisplay = it.answer || '\u2014';
        if (Array.isArray(it.choices) && it.choices.length) {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
          const ci = it.choices.findIndex(c => String(c).trim().toLowerCase() === String(it.answer || '').trim().toLowerCase());
          if (ci !== -1) ansDisplay = `${letters[ci] || ''}. ${it.answer}`;
        }
        akBlock += para(it.number + '. ' + (qShort ? x(qShort) + '  \u2014  ' : '') + x(ansDisplay), { sz: 18 });
      });
      akBlock += '<w:p/>';
    });
    return akBlock;
  })()}
</w:body>
</w:wordDocument>`;

  try {
    const blob = new Blob([xml], { type: 'application/msword' });
    const safeArea = (row.area || 'Subject').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 30);
    const fname = `Summative_${safeArea}_G${gradeLabel}_${(quarter || '').replace(/\s/g, '')}.doc`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('✅ Summative Word file downloaded!', 'ts');
  } catch (e) {
    console.error(e);
    toast('❌ Download error: ' + e.message, 'te');
  }
}

/* ════════════════════════════════
   TABLE RENDERING
════════════════════════════════ */