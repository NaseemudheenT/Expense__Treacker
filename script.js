// Main app logic. Uses Firebase Modular SDK via CDN imports and exported instances from firebase.js
import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.16.0/firebase-auth.js';

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.16.0/firebase-firestore.js';

/* ------------------ Helpers & UI ------------------ */
const $ = id => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');
const toast = (msg, timeout=3000) => {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  setTimeout(()=> t.classList.add('hidden'), timeout);
}

const loaderShow = () => $('loader').classList.remove('hidden');
const loaderHide = () => $('loader').classList.add('hidden');

/* ------------------ Auth UI ------------------ */
const authCard = $('authCard');
const historyCard = $('history');
const userArea = $('userArea');
const userNameEl = $('userName');

$('showLogin').addEventListener('click', ()=>{ $('showLogin').classList.add('active'); $('showSignup').classList.remove('active'); $('loginForm').classList.remove('hidden'); $('signupForm').classList.add('hidden'); });
$('showSignup').addEventListener('click', ()=>{ $('showSignup').classList.add('active'); $('showLogin').classList.remove('active'); $('signupForm').classList.remove('hidden'); $('loginForm').classList.add('hidden'); });

/* ------------------ Auth Actions ------------------ */
$('signupBtn').addEventListener('click', async ()=>{
  const name = $('signupName').value.trim();
  const email = $('signupEmail').value.trim();
  const pass = $('signupPassword').value;
  const conf = $('signupConfirm').value;
  if(!name || !email || !pass){ toast('Please fill all fields'); return }
  if(pass !== conf){ toast('Passwords do not match'); return }
  loaderShow();
  try{
    const userCred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCred.user, { displayName: name });
    toast('Account created');
  }catch(e){ toast(e.message||'Signup failed') }
  loaderHide();
});

$('loginBtn').addEventListener('click', async ()=>{
  const email = $('loginEmail').value.trim();
  const pass = $('loginPassword').value;
  if(!email || !pass){ toast('Enter email and password'); return }
  loaderShow();
  try{ await signInWithEmailAndPassword(auth, email, pass); toast('Logged in'); }
  catch(e){ toast(e.message||'Login failed') }
  loaderHide();
});

$('logoutBtn').addEventListener('click', async ()=>{ await signOut(auth); toast('Signed out'); });

/* ------------------ Firestore & Expenses ------------------ */
let expensesUnsub = null; // snapshot unsubscribe

function formatDate(date){ return date.toLocaleDateString(); }
function todayKey(){ const d = new Date(); return d.toISOString().slice(0,10); }
function yesterdayKey(){ const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }

function renderExpenses(items){
  const list = $('historyList'); list.innerHTML='';
  if(items.length===0){ show($('emptyState')); hide(list.parentElement.querySelector('h3')); } else { hide($('emptyState')); show(list.parentElement.querySelector('h3')); }

  // Group into today, yesterday, older
  const groups = {today:[], yesterday:[], older:[]};
  for(const it of items){
    if(it.date === todayKey()) groups.today.push(it);
    else if(it.date === yesterdayKey()) groups.yesterday.push(it);
    else groups.older.push(it);
  }

  function renderGroup(title, arr){ if(arr.length===0) return; const heading = document.createElement('h4'); heading.textContent = title; list.appendChild(heading);
    arr.forEach(e=>{
      const item = document.createElement('div'); item.className='history-item';
      const left = document.createElement('div'); left.className='meta';
      const chip = document.createElement('div'); chip.className='chip'; chip.textContent = e.currency + ' ' + Number(e.amount).toFixed(2);
      const meta = document.createElement('div');
      const name = document.createElement('div'); name.textContent = e.name; name.style.fontWeight='600';
      const sub = document.createElement('div'); sub.className='muted-small'; sub.textContent = e.date + ' • ' + e.time;
      meta.appendChild(name); meta.appendChild(sub);
      left.appendChild(chip); left.appendChild(meta);
      const right = document.createElement('div');
      const del = document.createElement('button'); del.className='btn small secondary'; del.textContent='Delete'; del.addEventListener('click', ()=> deleteExpense(e.id));
      right.appendChild(del);
      item.appendChild(left); item.appendChild(right);
      list.appendChild(item);
    })
  }

  renderGroup('Today', groups.today);
  renderGroup('Yesterday', groups.yesterday);
  renderGroup('Older', groups.older);
}

async function deleteExpense(id){ try{ await deleteDoc(doc(db, 'expenses', id)); toast('Deleted'); }catch(e){ toast('Delete failed') } }

async function clearAll(uid){
  if(!confirm('Clear all expenses? This cannot be undone.')) return;
  loaderShow();
  try{
    const q = query(collection(db,'expenses'), where('uid','==',uid));
    const snap = await getDocs(q);
    const batchDeletes = [];
    snap.forEach(d=> batchDeletes.push(deleteDoc(doc(db,'expenses',d.id))));
    await Promise.all(batchDeletes);
    toast('All cleared');
  }catch(e){ toast('Clear failed') }
  loaderHide();
}

/* Add expense */
$('addExpenseBtn').addEventListener('click', async ()=>{
  const name = $('expenseName').value.trim();
  const amount = Number($('expenseAmount').value);
  const currency = $('currencySelect').value;
  if(!name || !amount || isNaN(amount)) { toast('Enter valid name and amount'); return }
  const user = auth.currentUser; if(!user){ toast('Please login first'); return }
  loaderShow();
  try{
    const now = new Date();
    const date = now.toISOString().slice(0,10);
    const time = now.toTimeString().slice(0,5);
    await addDoc(collection(db,'expenses'),{
      uid: user.uid,
      name, amount, currency, date, time,
      ts: serverTimestamp()
    });
    $('expenseName').value=''; $('expenseAmount').value='';
    toast('Expense added');
  }catch(e){ toast('Add failed') }
  loaderHide();
});

/* Search */
$('searchInput').addEventListener('input', (e)=>{
  const term = e.target.value.toLowerCase();
  const items = window.__expensesCache || [];
  const filtered = items.filter(i=> i.name.toLowerCase().includes(term));
  renderExpenses(filtered);
});

$('clearAllBtn').addEventListener('click', ()=>{ const u = auth.currentUser; if(u) clearAll(u.uid); else toast('Login to clear') });

/* ------------------ Realtime sync ------------------ */
function subscribeExpenses(uid){
  if(expensesUnsub) expensesUnsub();
  const q = query(collection(db,'expenses'), where('uid','==',uid), orderBy('ts','desc'));
  expensesUnsub = onSnapshot(q, snap=>{
    const items = [];
    snap.forEach(d=> items.push({ id:d.id, ...d.data() }));
    window.__expensesCache = items;
    // today's stats
    const today = todayKey();
    const todayItems = items.filter(i=> i.date===today);
    const total = todayItems.reduce((s,i)=> s + Number(i.amount), 0);
    $('todayTotal').textContent = total.toFixed(2);
    $('todayCount').textContent = todayItems.length;
    // render
    renderExpenses(items);
  }, err=>{ console.error('snapshot',err); toast('Sync error') });
}

/* ------------------ Auth state listener ------------------ */
onAuthStateChanged(auth, user=>{
  if(user){
    hide(authCard); show(historyCard); show(userArea);
    userNameEl.textContent = user.displayName || user.email;
    subscribeExpenses(user.uid);
  } else {
    show(authCard); hide(historyCard); hide(userArea);
    userNameEl.textContent='';
    if(expensesUnsub) { expensesUnsub(); expensesUnsub=null }
  }
});

/* ------------------ Dark mode + date display + PWA register ------------------ */
const themeToggle = $('darkToggle');
function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); if(t==='dark') themeToggle.textContent='☀️'; else themeToggle.textContent='🌙'; }
const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);
themeToggle.addEventListener('click', ()=> applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

function updateDate(){ const d = new Date(); const opts={weekday:'long',month:'short',day:'numeric'}; $('currentDate').textContent = d.toLocaleDateString(undefined,opts); }
updateDate(); setInterval(updateDate, 60_000);

/* register service worker for PWA */
if('serviceWorker' in navigator){ navigator.serviceWorker.register('service-worker.js').then(()=>console.log('sw registered')).catch(()=>console.log('sw failed')) }


