import { ROOM_COUNT, WARN_SECS, roomKey, roomLabel, applyAction, view } from './logic.js';

const $ = (s) => document.querySelector(s);
const grid = $('#grid'), statusEl = $('#status'), connEl = $('#conn'), soundBtn = $('#sound');

let rooms = {};        // 서버에서 받은 전체 상태 (읽기 전용)
let selected = null;   // 선택된 방 번호 (이 기기에서만)
let connected = false;
let store = null;

/* ---------- 저장소: Firebase(공유) 또는 데모(로컬) ---------- */
async function makeFirebaseStore(cfg) {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const { getDatabase, ref, onValue, runTransaction } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  const db = getDatabase(initializeApp(cfg));
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  const now = () => Date.now() + offset; // 모든 기기가 서버 시계 기준으로 계산
  return {
    now,
    onRooms: (cb) => onValue(ref(db, 'rooms'), (s) => cb(s.val() || {})),
    onConn: (cb) => onValue(ref(db, '.info/connected'), (s) => cb(!!s.val())),
    // 해당 방 하나만 트랜잭션으로 수정 → 다른 방은 절대 건드리지 않음
    act: (n, action) => runTransaction(ref(db, 'rooms/' + roomKey(n)), (cur) => applyAction(cur, action, now())),
  };
}

function makeDemoStore() {
  const data = {}; let cb = () => {};
  return {
    now: () => Date.now(),
    onRooms: (f) => { cb = f; f({}); },
    onConn: (f) => f(true),
    act: async (n, action) => {
      const next = applyAction(data[roomKey(n)], action, Date.now());
      if (next === undefined) return;
      if (next === null) delete data[roomKey(n)]; else data[roomKey(n)] = next;
      cb({ ...data });
    },
  };
}

/* ---------- 화면 ---------- */
const cards = [];
for (let n = 1; n <= ROOM_COUNT; n++) {
  const el = document.createElement('button');
  el.className = 'card'; el.type = 'button';
  el.innerHTML = `<span class="head">${roomLabel(n)}</span><span class="body"><span class="main"></span><span class="sub"></span></span>`;
  el.addEventListener('click', () => { selected = selected === n ? null : n; render(); });
  grid.appendChild(el);
  cards[n] = { el, main: el.querySelector('.main'), sub: el.querySelector('.sub'), cls: '', m: '', s: '', prev: null };
}

function render() {
  if (!store) return;
  const now = store.now();
  for (let n = 1; n <= ROOM_COUNT; n++) {
    const c = cards[n], v = view(rooms[roomKey(n)], now);
    const cls = 'card ' + v.state + (v.flag ? ' flag-' + v.flag : '') + (selected === n ? ' selected' : '');
    if (cls !== c.cls) c.el.className = c.cls = cls;
    if (v.main !== c.m) c.main.textContent = c.m = v.main;
    if (v.sub !== c.s) c.sub.textContent = c.s = v.sub;
    // 알림음: 빨간색으로 바뀌는 순간(5분), 시간종료 순간
    if (c.prev != null && v.secs != null) {
      if (c.prev > WARN_SECS && v.secs <= WARN_SECS && v.secs > 0) beep(2);
      if (c.prev > 0 && v.secs === 0) beep(4);
    }
    c.prev = v.secs;
  }
  const ok = selected != null && connected;
  document.querySelectorAll('#controls button[data-min], #controls button[data-act]').forEach((b) => { b.disabled = !ok; });
  if (!toastUntil || Date.now() > toastUntil) {
    statusEl.textContent = selected != null ? roomLabel(selected) + ' 선택됨' : '방을 선택한 뒤 시간을 조절하세요';
  }
  connEl.textContent = store.demo ? '데모 모드(공유 안 됨)' : connected ? '● 연결됨' : '● 연결 끊김';
  connEl.className = store.demo ? 'warn' : connected ? 'ok' : 'bad';
}

let toastUntil = 0;
function toast(msg) { statusEl.textContent = msg; toastUntil = Date.now() + 2000; }

async function act(action, text) {
  const n = selected;                 // 누른 순간의 방 번호를 고정
  if (n == null || !connected) return;
  try { await store.act(n, action); toast(roomLabel(n) + ' ' + text); }
  catch (e) { console.error(e); toast('저장 실패 — 다시 눌러주세요'); }
}

document.querySelectorAll('#controls button[data-min]').forEach((b) => {
  const m = Number(b.dataset.min);
  b.addEventListener('click', () => act({ type: 'add', minutes: m }, (m > 0 ? '+' : '') + m + '분'));
});
$('[data-act="in"]').addEventListener('click', () => act({ type: 'flag', flag: 'in' }, '입실대기'));
$('[data-act="out"]').addEventListener('click', () => act({ type: 'flag', flag: 'out' }, '퇴실대기'));
$('[data-act="clear"]').addEventListener('click', () => act({ type: 'clear' }, '퇴실 처리'));

/* ---------- 알림음 (기기별로 켜기) ---------- */
let audio = null;
soundBtn.addEventListener('click', () => {
  if (audio) { audio.close(); audio = null; }
  else { audio = new (window.AudioContext || window.webkitAudioContext)(); beep(1); }
  soundBtn.textContent = audio ? '🔔 소리 켜짐' : '🔕 소리 꺼짐';
  soundBtn.classList.toggle('on', !!audio);
});
function beep(times) {
  if (!audio) return;
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.35;
    o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.start(t); o.stop(t + 0.3);
  }
}

/* ---------- 화면 꺼짐 방지 (지원 기기만) ---------- */
async function keepAwake() { try { if (document.visibilityState === 'visible') await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', keepAwake); keepAwake();

/* ---------- 시작 ---------- */
(async () => {
  const cfg = window.FIREBASE_CONFIG || {};
  try {
    if (cfg.databaseURL) store = await makeFirebaseStore(cfg);
    else { store = makeDemoStore(); store.demo = true; }
  } catch (e) {
    console.error(e); statusEl.textContent = 'Firebase 연결 오류 — 설정값을 확인하세요'; return;
  }
  store.onRooms((v) => { rooms = v; render(); });
  store.onConn((v) => { connected = v; render(); });
  setInterval(render, 250);
})();
