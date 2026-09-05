/* ============================================================
   FIREBASE AUTH + PER-USER STORAGE
   ════════════════════════════════════════════════════════════════
   🔥 FIREBASE AUTH + PER-USER STORAGE — OWNER: FILL IN CONFIG
   ════════════════════════════════════════════════════════════════
   SETUP STEPS (one-time, ~5 minutes):
   1. Go to https://console.firebase.google.com
   2. Click "Add project" → name it (e.g. "lesson-plan-generator")
   3. Go to Build → Authentication → Get started → Google → Enable → Save
   4. Go to Build → Realtime Database → Create database → Start in test mode
      Then change rules to:
      {
        "rules": {
          "users": {
            "$uid": {
              ".read": "$uid === auth.uid",
              ".write": "$uid === auth.uid"
            }
          }
        }
      }
   5. Go to Project Settings (⚙️) → Your apps → Add app (</>) → copy the config below
   6. If hosting on a server/domain: go to Authentication → Settings → Authorized domains → Add your domain
   ============================================================ */
(function(){
/* ══════════════════════════════════════════════
   🔧 FILL IN YOUR FIREBASE CONFIG HERE
══════════════════════════════════════════════ */
const FB_CONFIG = {
  apiKey:            "AIzaSyBm66xVZDFh2ltngidwHdpEUmv8x_ydZX4",
  authDomain:        "lessonplan-generator.firebaseapp.com",
  databaseURL:       "https://lessonplan-generator-default-rtdb.firebaseio.com",
  projectId:         "lessonplan-generator",
  storageBucket:     "lessonplan-generator.firebasestorage.app",
  messagingSenderId: "762721301991",
  appId:             "1:762721301991:web:a1847029c2a70301d67942"
};
/* ══════════════════════════════════════════════ */

/* Owner email — this account auto-loads its saved keys and gets the 👑 badge */
const OWNER_EMAIL = 'Rhandymendoza67@gmail.com';

/* All localStorage keys the app uses — these get synced to Firebase per user */
const ALL_LS_KEYS = [
  'lp_v5',            // Lesson plan state
  'lp_multikeys',     // API keys (multi-key)
  'lp_apikey',        // API key (legacy)
  'tos_lp_v1',        // TOS state
  'tos_lp_bank_v1',   // TOS subject bank
  'lp_final_exam_v1', // Final exam state
];

/* Firebase key names (no dots/slashes allowed in Firebase keys) */
const fbKey = k => k.replace(/[.\[\]#$/]/g, '_');
const origKey = encoded => ALL_LS_KEYS.find(k => fbKey(k) === encoded) || encoded;

/* ── Init Firebase ── */
let fbApp, fbAuth, fbDb;
try {
  fbApp  = firebase.initializeApp(FB_CONFIG);
  fbAuth = firebase.auth();
  fbDb   = firebase.database();
} catch(e) {
  console.error('Firebase init failed:', e.message);
  /* If Firebase fails (misconfigured), hide overlay so app still works locally */
  const ov = document.getElementById('authOverlay');
  if(ov) ov.style.display = 'none';
  return;
}

/* ── Sign in with Google ── */
window.authSignIn = function() {
  const btn = document.getElementById('authBtn');
  const lbl = document.getElementById('authLoading');
  if(btn) btn.disabled = true;
  if(lbl){ lbl.textContent = 'Opening Google sign-in…'; lbl.style.display = 'block'; }
  const provider = new firebase.auth.GoogleAuthProvider();
  fbAuth.signInWithPopup(provider).catch(err => {
    if(btn) btn.disabled = false;
    if(lbl) lbl.style.display = 'none';
    if(typeof toast === 'function') toast('Sign-in failed: ' + err.message, 'te');
    else alert('Sign-in failed: ' + err.message);
  });
};

/* ── Sign out ── */
window.authSignOut = function() {
  if(!confirm('Sign out of Lesson Plan Generator?')) return;
  fbAuth.signOut().then(() => {
    ALL_LS_KEYS.forEach(k => localStorage.removeItem(k));
  }).catch(e => console.warn('Sign-out error:', e));
};

/* ── Push ALL localStorage data to Firebase (under user's UID) ── */
function fbPushAll() {
  const user = fbAuth.currentUser;
  if(!user) return;
  const data = {};
  ALL_LS_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if(v !== null) data[fbKey(k)] = v;
  });
  fbDb.ref('users/' + user.uid + '/data').set(data)
    .catch(e => console.warn('fbPushAll error:', e.message));
}

/* ── Pull Firebase data → localStorage ── */
async function fbPullAll(uid) {
  try {
    const snap = await fbDb.ref('users/' + uid + '/data').once('value');
    const data = snap.val();
    if(data && typeof data === 'object') {
      Object.entries(data).forEach(([encodedKey, value]) => {
        const key = origKey(encodedKey);
        if(value !== null && value !== undefined) {
          localStorage.setItem(key, value);
        }
      });
    }
  } catch(e) {
    console.warn('fbPullAll error:', e.message);
  }
}

/* ── Re-initialize the entire app after Firebase data is loaded ── */
function appReinitWithData() {
  /* 1. API keys */
  if(typeof mkLoad === 'function') mkLoad();

  /* 2. Lesson plan state */
  const savedLP = localStorage.getItem('lp_v5');
  if(savedLP) {
    /* Show restore modal (dismiss existing one first) */
    const mo = document.getElementById('restoreMo');
    if(mo) mo.classList.add('show');
  } else {
    if(typeof initRows === 'function')               initRows();
    if(typeof renderSubs === 'function')             renderSubs();
    if(typeof renderTable === 'function')            renderTable();
    if(typeof renderSummativesTable === 'function')  renderSummativesTable();
  }

  /* 3. TOS */
  setTimeout(() => {
    if(typeof tosInitState === 'function') tosInitState();
  }, 250);

  /* 4. Final Exam */
  setTimeout(() => {
    if(typeof feInit === 'function') feInit();
  }, 600);
}

/* ── Override save functions to also push to Firebase ── */
/* We wrap after DOMContentLoaded so originals are defined */
document.addEventListener('DOMContentLoaded', () => {
  /* Wrap each save function */
  const wrapSave = (name) => {
    const orig = window[name];
    if(typeof orig !== 'function') return;
    window[name] = function() {
      orig.apply(this, arguments);
      if(fbAuth.currentUser) fbPushAll();
    };
  };
  ['mkSave', 'autoSave', 'tosAutoSave', 'tosSaveBank', 'feSaveState'].forEach(wrapSave);

  /* Also wrap clearRestore to remove lesson plan from Firebase */
  const origClearRestore = window.clearRestore;
  if(typeof origClearRestore === 'function') {
    window.clearRestore = function() {
      origClearRestore.apply(this, arguments);
      const user = fbAuth.currentUser;
      if(user) {
        fbDb.ref('users/' + user.uid + '/data/' + fbKey('lp_v5'))
          .remove().catch(() => {});
      }
    };
  }
});

/* ── Render user info badge in topbar ── */
function renderUserBadge(user) {
  const badge = document.getElementById('userBadge');
  if(!badge) return;
  const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
  const name    = (user.displayName || user.email || 'User').split(' ')[0];
  const photo   = user.photoURL || '';
  badge.style.display = 'flex';
  badge.innerHTML = `
    ${photo
      ? `<img src="${photo}" alt="${name}" onerror="this.style.display='none'">`
      : `<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;">${name[0].toUpperCase()}</div>`
    }
    <span class="u-name">${name}</span>
    ${isOwner ? '<span class="owner-crown">👑 Owner</span>' : ''}
    <button class="signout-btn" onclick="authSignOut()">Sign Out</button>
  `;
}

/* ════════════════════════════════════════════════════
   FIREBASE AUTH STATE LISTENER — core logic
════════════════════════════════════════════════════ */
fbAuth.onAuthStateChanged(async (user) => {
  const overlay = document.getElementById('authOverlay');
  const loadLbl = document.getElementById('authLoading');
  const authBtn = document.getElementById('authBtn');
  const badge   = document.getElementById('userBadge');

  if(user) {
    /* ── SIGNED IN ── */
    if(loadLbl){ loadLbl.textContent = 'Loading your workspace…'; loadLbl.style.display = 'block'; }

    /* Pull all saved data from Firebase into localStorage */
    await fbPullAll(user.uid);

    /* Boot the app with the loaded data */
    appReinitWithData();

    /* Update topbar */
    renderUserBadge(user);

    /* Hide overlay */
    if(overlay) overlay.style.display = 'none';

    /* Welcome toast */
    const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
    setTimeout(() => {
      if(typeof toast === 'function') {
        if(isOwner) toast('👑 Welcome back, Owner! Your keys & work are loaded.', 'ts');
        else        toast('✅ Signed in as ' + (user.displayName || user.email), 'ts');
      }
    }, 400);

  } else {
    /* ── SIGNED OUT ── */
    /* Clear local data */
    ALL_LS_KEYS.forEach(k => localStorage.removeItem(k));

    /* Reset topbar badge */
    if(badge){ badge.innerHTML = ''; badge.style.display = 'none'; }

    /* Reset sign-in button */
    if(authBtn){ authBtn.disabled = false; }
    if(loadLbl){ loadLbl.style.display = 'none'; }

    /* Hide restore modal if open */
    const mo = document.getElementById('restoreMo');
    if(mo) mo.classList.remove('show');

    /* Show sign-in overlay */
    if(overlay) overlay.style.display = 'flex';
  }
});

})(); /* end IIFE */