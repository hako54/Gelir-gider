/* Kasa Defteri — gelir, gider ve düzenli ödeme takibi.
   Tüm veriler cihazda (localStorage) tutulur. Depolama katmanı `store` nesnesinde
   toplandığı için mobil sürümde (Capacitor) kolayca SQLite/Preferences ile değiştirilebilir. */
(() => {
'use strict';

/* ================= yardımcılar ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (s, n) => { const [y, m] = s.split('-').map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
const monthDiff = (a, b) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const daysIn = (y, m) => new Date(y, m, 0).getDate();
const today = () => ymd(new Date());
const thisMonth = () => ymOf(new Date());
const dayDiff = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const trUpper = s => s.toLocaleUpperCase('tr-TR');

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MON_S = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const monthLabel = s => { const [y, m] = s.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const monShort = s => { const [y, m] = s.split('-').map(Number); return `${MON_S[m - 1]} ${String(y).slice(2)}`; };
const dateLabel = (s, withYear = true) => { const d = parseD(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`; };
const dateShort = s => { const d = parseD(s); return `${d.getDate()} ${MON_S[d.getMonth()]}`; };
const weekStart = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
};

/* ================= para ================= */
const CURRENCIES = { TRY: 'Türk lirası (₺)', USD: 'ABD doları ($)', EUR: 'Euro (€)', GBP: 'İngiliz sterlini (£)' };
const SYMBOL = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
const fmtCache = {};
function money(n, opts = {}) {
  const cur = state.settings.currency;
  const a = Math.abs(n);
  const dec = opts.dec ?? (Math.round(a * 100) % 100 ? 2 : 0);
  const k = cur + dec;
  const f = fmtCache[k] || (fmtCache[k] = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec }));
  let s = f.format(a);
  if (n < 0 && a >= 0.005) s = '−' + s; else if (opts.sign && n > 0) s = '+' + s;
  return s;
}
const trNum = (n, d) => n.toLocaleString('tr-TR', { maximumFractionDigits: d });
function compact(n) {
  const a = Math.abs(n), sg = n < 0 ? '−' : '', sym = SYMBOL[state.settings.currency] || '';
  if (a >= 1e6) return `${sg}${sym}${trNum(a / 1e6, 1)} mn`;
  if (a >= 1e3) return `${sg}${sym}${trNum(a / 1e3, a < 1e4 ? 1 : 0)} bin`;
  return `${sg}${sym}${trNum(a, 0)}`;
}
function parseAmount(v) {
  let s = String(v ?? '').replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.replace(/,/g, (m, i) => (i === lc ? '.' : ''));
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const amountInputValue = n => (n ? n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '');

/* ================= ödeme türleri ================= */
const KINDS = {
  kredi:    { label: 'Kredi taksiti', cat: 'Kredi' },
  kart:     { label: 'Kredi kartı', cat: 'Kredi kartı', variable: true },
  kira:     { label: 'Kira', cat: 'Kira' },
  aidat:    { label: 'Aidat', cat: 'Aidat' },
  elektrik: { label: 'Elektrik', cat: 'Fatura', variable: true },
  su:       { label: 'Su', cat: 'Fatura', variable: true },
  dogalgaz: { label: 'Doğalgaz', cat: 'Fatura', variable: true },
  internet: { label: 'İnternet', cat: 'Fatura' },
  telefon:  { label: 'Telefon', cat: 'Fatura' },
  abonelik: { label: 'Abonelik', cat: 'Abonelik' },
  sigorta:  { label: 'Sigorta / kasko', cat: 'Sigorta' },
  vergi:    { label: 'Vergi / harç', cat: 'Vergi' },
  egitim:   { label: 'Okul / kurs', cat: 'Eğitim' },
  diger:    { label: 'Diğer ödeme', cat: 'Diğer' },
  maas:     { label: 'Maaş', cat: 'Maaş', dir: 'income' },
  gelir:    { label: 'Düzenli gelir', cat: 'Ek gelir', dir: 'income' },
};
const kindsFor = dir => Object.entries(KINDS).filter(([, k]) => (k.dir || 'expense') === dir);
const FREQS = { 1: 'Her ay', 2: 'İki ayda bir', 3: 'Üç ayda bir', 6: 'Altı ayda bir', 12: 'Yılda bir' };
const STATUS = {
  paid:     { label: 'Ödendi', inc: 'Alındı' },
  prepaid:  { label: 'Ödendi sayıldı', inc: 'Alındı sayıldı' },
  overdue:  { label: 'Gecikti', inc: 'Bekleniyor' },
  soon:     { label: 'Yaklaşıyor', inc: 'Yaklaşıyor' },
  upcoming: { label: 'Bekliyor', inc: 'Bekliyor' },
  skipped:  { label: 'Atlandı', inc: 'Atlandı' },
};
const statusLabel = (st, dir) => (dir === 'income' ? STATUS[st].inc : STATUS[st].label);
function initials(name) {
  const w = String(name).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return trUpper(w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2));
}

/* ================= depolama ================= */
const STORE_KEY = 'kasadefteri.v1';
const store = {
  read() { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
  write(v) { try { localStorage.setItem(STORE_KEY, v); return true; } catch { return false; } },
};
const DEFAULT_CATS = {
  expense: ['Market', 'Kira', 'Fatura', 'Kredi', 'Kredi kartı', 'Aidat', 'Yeme-içme', 'Ulaşım', 'Sağlık', 'Eğitim', 'Giyim', 'Eğlence', 'Abonelik', 'Sigorta', 'Vergi', 'Diğer'],
  income: ['Maaş', 'Ek gelir', 'Kira geliri', 'Yatırım', 'Prim / ikramiye', 'Diğer'],
};
function emptyState(settings) {
  return {
    version: 1,
    settings: { currency: 'TRY', theme: 'system', remindDays: 5, ...(settings || {}) },
    categories: JSON.parse(JSON.stringify(DEFAULT_CATS)),
    transactions: [], plans: [], overrides: {}, demo: false,
  };
}
function normalize(s) {
  const b = emptyState();
  if (!s || typeof s !== 'object') return b;
  return {
    ...b,
    settings: { ...b.settings, ...(s.settings || {}) },
    categories: {
      expense: Array.isArray(s.categories?.expense) && s.categories.expense.length ? s.categories.expense : b.categories.expense,
      income: Array.isArray(s.categories?.income) && s.categories.income.length ? s.categories.income : b.categories.income,
    },
    transactions: Array.isArray(s.transactions) ? s.transactions.filter(t => t && t.date && Number.isFinite(+t.amount)).map(t => ({ ...t, amount: +t.amount })) : [],
    plans: Array.isArray(s.plans) ? s.plans.filter(p => p && p.id && p.start) : [],
    overrides: s.overrides && typeof s.overrides === 'object' ? s.overrides : {},
    demo: !!s.demo,
  };
}
let state;
function save() {
  if (!store.write(JSON.stringify(state))) toast('Kaydedilemedi: tarayıcı depolaması kapalı ya da dolu.');
}

/* ================= örnek veri ================= */
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seedDemo(s) {
  const r = rng(7), cur = thisMonth(), M = k => addMonths(cur, k), t0 = today();
  const P = o => ({ id: uid(), dir: 'expense', variable: !!KINDS[o.kind].variable, freq: 1, count: null, autopay: false, note: '', paidUntil: M(-6), createdAt: Date.now(), ...o, category: KINDS[o.kind].cat });
  const plans = [
    P({ name: 'Maaş', kind: 'maas', dir: 'income', amount: 68000, dueDay: 1, start: M(-30) }),
    P({ name: 'Konut kredisi', kind: 'kredi', amount: 12450, dueDay: 5, start: M(-30), count: 120, autopay: true }),
    P({ name: 'İhtiyaç kredisi', kind: 'kredi', amount: 3280, dueDay: 12, start: M(-9), count: 24 }),
    P({ name: 'Kredi kartı ekstresi', kind: 'kart', amount: 16000, dueDay: 20, start: M(-30) }),
    P({ name: 'Site aidatı', kind: 'aidat', amount: 1850, dueDay: 10, start: M(-30) }),
    P({ name: 'Elektrik', kind: 'elektrik', amount: 980, dueDay: 18, start: M(-30) }),
    P({ name: 'Su', kind: 'su', amount: 430, dueDay: 22, start: M(-30) }),
    P({ name: 'Doğalgaz', kind: 'dogalgaz', amount: 1400, dueDay: 25, start: M(-30) }),
    P({ name: 'Ev interneti', kind: 'internet', amount: 549, dueDay: 14, start: M(-30), autopay: true }),
    P({ name: 'Kasko', kind: 'sigorta', amount: 14200, dueDay: 15, freq: 12, start: M(-7) }),
  ];
  s.plans = plans;
  const tx = [];
  const add = (type, amount, category, date, note, planId, period) => tx.push({ id: uid(), type, amount: Math.round(amount), category, date, note, planId, period, createdAt: Date.now() });
  for (let k = -5; k <= 0; k++) {
    const m = M(k);
    for (const p of plans) {
      const o = occBase(p, m);
      if (!o || o.due >= t0) continue;
      if (p.name === 'Su' && k === -1) continue; // örnek gecikmiş fatura
      if (p.name === 'İhtiyaç kredisi' && k === 0) continue;
      const amt = p.variable ? p.amount * (0.75 + r() * 0.5) : p.amount;
      add(p.dir, amt, p.category, o.due, planTitle(p, o.index), p.id, m);
    }
    const [y, mm] = m.split('-').map(Number);
    for (let d = 1; d <= daysIn(y, mm); d++) {
      const date = `${m}-${pad(d)}`;
      if (date > t0) break;
      if (r() < 0.32) add('expense', 250 + r() * 1600, 'Market', date, r() < 0.5 ? 'Haftalık alışveriş' : '');
      if (r() < 0.22) add('expense', 120 + r() * 700, 'Yeme-içme', date, '');
      if (r() < 0.18) add('expense', 60 + r() * 500, 'Ulaşım', date, r() < 0.4 ? 'Akaryakıt' : '');
      if (r() < 0.05) add('expense', 300 + r() * 1500, 'Eğlence', date, '');
      if (r() < 0.04) add('expense', 600 + r() * 2500, 'Giyim', date, '');
      if (r() < 0.025) add('expense', 200 + r() * 1200, 'Sağlık', date, 'Eczane');
    }
    if (k === -2) add('income', 7500, 'Ek gelir', `${m}-16`, 'Serbest iş');
  }
  s.transactions = tx;
  s.demo = true;
}

/* ================= ödeme planı hesapları ================= */
const planTitle = (p, i) => p.name + (p.count ? ` (${i}/${p.count})` : '');
function occIndex(p, m) {
  const d = monthDiff(p.start, m);
  const f = +p.freq || 1;
  if (d < 0 || d % f) return 0;
  const i = d / f + 1;
  if (p.count && i > p.count) return 0;
  return i;
}
function occBase(p, m) {
  const i = occIndex(p, m);
  if (!i) return null;
  const [y, mm] = m.split('-').map(Number);
  return { index: i, due: `${m}-${pad(Math.min(+p.dueDay || 1, daysIn(y, mm)))}` };
}
let txIdx = new Map();
function rebuildIdx() {
  txIdx = new Map();
  for (const t of state.transactions) if (t.planId && t.period) txIdx.set(t.planId + '|' + t.period, t);
}
function occ(p, m) {
  const b = occBase(p, m);
  if (!b) return null;
  const key = p.id + '|' + m;
  const ov = state.overrides[key] || {};
  const tx = txIdx.get(key);
  const t0 = today();
  let status;
  if (tx) status = 'paid';
  else if (p.paidUntil && m <= p.paidUntil) status = 'prepaid';
  else if (ov.skip) status = 'skipped';
  else if (b.due < t0) status = 'overdue';
  else if (dayDiff(t0, b.due) <= state.settings.remindDays) status = 'soon';
  else status = 'upcoming';
  const amount = tx ? tx.amount : (ov.amount ?? +p.amount);
  return { plan: p, month: m, index: b.index, due: b.due, key, tx, status, amount, estimated: !tx && p.variable && ov.amount == null };
}
const planById = id => state.plans.find(p => p.id === id);
function occByKey(key) {
  const [id, m] = key.split('|');
  const p = planById(id);
  return p ? occ(p, m) : null;
}
const occsInMonth = m => state.plans.map(p => occ(p, m)).filter(Boolean).sort((a, b) => a.due.localeCompare(b.due) || a.plan.name.localeCompare(b.plan.name, 'tr'));
function overdueBefore(m, back = 36) {
  const out = [];
  for (let k = 1; k <= back; k++) for (const o of occsInMonth(addMonths(m, -k))) if (o.status === 'overdue') out.push(o);
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
const isOpen = o => o.status === 'overdue' || o.status === 'soon' || o.status === 'upcoming';
const isDone = o => o.status === 'paid' || o.status === 'prepaid';
function planStats(p) {
  let paid = 0, paidAmt = 0, remaining = 0, remAmt = 0, next = null;
  if (p.count) {
    for (let i = 1; i <= p.count; i++) {
      const o = occ(p, addMonths(p.start, (i - 1) * (+p.freq || 1)));
      if (!o) continue;
      if (isDone(o)) { paid++; paidAmt += o.amount; }
      else if (o.status !== 'skipped') { remaining++; remAmt += o.amount; if (!next) next = o; }
    }
  } else {
    const cm = thisMonth();
    for (let k = -36; k <= 24 && !next; k++) {
      const o = occ(p, addMonths(cm, k));
      if (o && isOpen(o)) next = o;
    }
  }
  return { paid, paidAmt, remaining, remAmt, next };
}

/* ================= arayüz durumu ================= */
const ui = {
  tab: 'ozet', period: 'month', anchor: today(), type: 'all', cat: 'all', showTable: false,
  payMonth: thisMonth(), payView: 'list', payYear: new Date().getFullYear(),
  txScope: 'month', txMonth: thisMonth(), txType: 'all', txCat: 'all', txQ: '',
};

/* ================= dönem hesapları ================= */
function periodRange(period, anchor) {
  const d = parseD(anchor);
  if (period === 'day') return { start: anchor, end: anchor, label: `${dateLabel(anchor)}, ${WDAYS[d.getDay()]}`, short: dateShort(anchor) };
  if (period === 'week') {
    const s = weekStart(d), e = addDays(s, 6);
    const lbl = s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}` : `${dateShort(ymd(s))} – ${dateShort(ymd(e))} ${e.getFullYear()}`;
    return { start: ymd(s), end: ymd(e), label: lbl, short: dateShort(ymd(s)) };
  }
  if (period === 'year') return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31`, label: String(d.getFullYear()), short: String(d.getFullYear()) };
  const m = ymOf(d);
  return { start: `${m}-01`, end: `${m}-${pad(daysIn(d.getFullYear(), d.getMonth() + 1))}`, label: monthLabel(m), short: monShort(m) };
}
function shiftAnchor(period, anchor, n) {
  const d = parseD(anchor);
  if (period === 'day') return ymd(addDays(d, n));
  if (period === 'week') return ymd(addDays(d, 7 * n));
  if (period === 'year') return `${d.getFullYear() + n}-01-01`;
  return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1));
}
const TREND_N = { day: 14, week: 12, month: 12, year: 5 };
const TREND_TITLE = { day: 'Son 14 gün', week: 'Son 12 hafta', month: 'Son 12 ay', year: 'Son 5 yıl' };
function sumRange(list, s, e) {
  let inc = 0, exp = 0, n = 0;
  for (const t of list) if (t.date >= s && t.date <= e) { n++; if (t.type === 'income') inc += t.amount; else exp += t.amount; }
  return { inc, exp, n };
}
function filteredTx() {
  return state.transactions.filter(t => (ui.type === 'all' || t.type === ui.type) && (ui.cat === 'all' || t.category === ui.cat));
}
function allCategories(type) {
  if (type === 'income') return state.categories.income;
  if (type === 'expense') return state.categories.expense;
  return [...new Set([...state.categories.expense, ...state.categories.income])];
}

/* ================= ortak parçalar ================= */
function segHtml(act, options, current, extra = '') {
  return `<div class="seg ${extra}" role="group">${Object.entries(options).map(([v, l]) =>
    `<button type="button" class="${String(v) === String(current) ? 'on' : ''}" aria-pressed="${String(v) === String(current)}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function navHtml(act, label, opts = {}) {
  return `<div class="period-nav">
    <button type="button" class="icon-btn" data-act="${act}" data-v="-1" aria-label="Önceki">${ICON.left}</button>
    <strong>${esc(label)}</strong>
    <button type="button" class="icon-btn" data-act="${act}" data-v="1" aria-label="Sonraki" ${opts.nextDisabled ? 'disabled' : ''}>${ICON.right}</button>
  </div>`;
}
function catSelect(id, type, current) {
  return `<select id="${id}" class="auto" data-change="${id}" aria-label="Kategori">
    <option value="all">Tüm kategoriler</option>
    ${allCategories(type).map(c => `<option ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('')}
  </select>`;
}
function dueText(o) {
  if (o.status === 'paid') return `${o.plan.dir === 'income' ? 'Alındı' : 'Ödendi'} · ${dateShort(o.tx.date)}`;
  if (o.status === 'prepaid') return `Son gün ${dateShort(o.due)}`;
  if (o.status === 'skipped') return `${dateShort(o.due)} · bu dönem atlandı`;
  const d = dayDiff(today(), o.due);
  if (d === 0) return `Bugün son gün`;
  if (d < 0) return `${dateShort(o.due)} · ${-d} gün gecikti`;
  return `${dateShort(o.due)} · ${d} gün kaldı`;
}
function occRow(o, opts = {}) {
  const p = o.plan;
  const bits = [dueText(o)];
  if (opts.showMonth) bits.unshift(monthLabel(o.month));
  if (p.count) bits.push(`Taksit ${o.index}/${p.count}`);
  if (p.autopay && !isDone(o)) bits.push('Talimatlı');
  const action = isDone(o)
    ? `<span class="pay-done" title="${statusLabel(o.status, p.dir)}">${ICON.check}</span>`
    : o.status === 'skipped'
      ? `<span class="pay-done"></span>`
      : `<button type="button" class="btn sm pay-btn ${o.status === 'overdue' ? 'primary' : ''}" data-act="quickpay" data-key="${o.key}">${p.dir === 'income' ? 'Alındı' : 'Öde'}</button>`;
  return `<li class="row">
    <button type="button" class="row-main" data-act="occ" data-key="${o.key}">
      <span class="mono ${p.dir === 'income' ? 'income' : ''}">${esc(initials(p.name))}</span>
      <span class="row-text"><b>${esc(p.name)}</b><small>${esc(bits.join(' · '))}</small></span>
      <span class="row-amt"><b class="${o.estimated ? 'est' : ''}">${o.estimated ? '≈ ' : ''}${money(o.amount)}</b>
        <span class="pill ${o.status}">${statusLabel(o.status, p.dir)}</span></span>
    </button>${action}</li>`;
}

/* ================= ÖZET ================= */
function renderOzet() {
  const el = $('#view-ozet');
  const r = periodRange(ui.period, ui.anchor);
  const pr = periodRange(ui.period, shiftAnchor(ui.period, ui.anchor, -1));
  const list = filteredTx();
  const cur = sumRange(list, r.start, r.end), prev = sumRange(list, pr.start, pr.end);
  const net = cur.inc - cur.exp;
  const rate = cur.inc > 0 ? net / cur.inc : null;
  const delta = (a, b) => {
    if (!b) return '';
    const p = Math.round((a - b) / b * 100);
    return `${p > 0 ? '▲' : p < 0 ? '▼' : '='} %${Math.abs(p)} önceki döneme göre`;
  };
  const days = dayDiff(r.start, r.end) + 1;
  const avgTxt = ui.period === 'year' ? `aylık ort. ${money(Math.round(cur.exp / 12))}` : ui.period === 'day' ? `${cur.n} kayıt` : `günlük ort. ${money(Math.round(cur.exp / days))}`;
  let hint = '';
  if (!cur.n) hint = 'Bu dönemde kayıt yok. Sağ alttaki “+” ile ya da “Yeni kayıt” düğmesiyle ilk kaydını ekle.';
  else if (ui.type === 'all' && cur.inc === 0 && cur.exp > 0) hint = 'Bu dönemde yalnızca gider kaydı var. Dengeyi görmek için gelirini de ekle.';

  el.innerHTML = `
  <div class="page-title">
    <div><div class="eyebrow">Genel durum</div><h1>Paranın nereye gittiğini gör.</h1>
      <p>Gelir ve giderlerini günlük, haftalık, aylık ya da yıllık izle.</p></div>
  </div>
  <div class="card">
    <div class="toolbar">
      ${segHtml('period', { day: 'Günlük', week: 'Haftalık', month: 'Aylık', year: 'Yıllık' }, ui.period)}
      ${segHtml('type', { all: 'Hepsi', income: 'Gelir', expense: 'Gider' }, ui.type)}
      ${catSelect('f-cat', ui.type, ui.cat)}
      <span class="spacer"></span>
      ${navHtml('shift', r.label)}
    </div>
    <div class="kpis">
      <div class="kpi"><div class="eyebrow"><i class="dot inc"></i>Gelir</div><div class="kpi-val">${money(cur.inc)}</div><small>${delta(cur.inc, prev.inc) || 'Seçili dönem'}</small></div>
      <div class="kpi"><div class="eyebrow"><i class="dot exp"></i>Gider</div><div class="kpi-val">${money(cur.exp)}</div><small>${delta(cur.exp, prev.exp) || avgTxt}</small></div>
      <div class="kpi ${net < 0 ? 'neg' : net > 0 ? 'pos' : ''}"><div class="eyebrow">Fark</div><div class="kpi-val">${money(net, { sign: true })}</div><small>Gelir eksi gider</small></div>
      <div class="kpi"><div class="eyebrow">Birikim oranı</div><div class="kpi-val">${rate == null ? '–' : '%' + trNum(rate * 100, 0)}</div><small>Farkın gelire oranı</small></div>
    </div>
    ${hint ? `<div class="hint">${hint}</div>` : ''}
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-head">
        <div><h2>${TREND_TITLE[ui.period]}: gelir ve gider</h2><p>Son dönem seçili dönemdir. Çubuğun üzerine gel ya da dokun.</p></div>
        <div class="legend">
          ${ui.type !== 'expense' ? '<span><i class="dot inc"></i>Gelir</span>' : ''}
          ${ui.type !== 'income' ? '<span><i class="dot exp"></i>Gider</span>' : ''}
          ${ui.type === 'all' ? '<span><i class="dot net"></i>Fark</span>' : ''}
          <button type="button" class="btn ghost sm" data-act="toggleTable">${ui.showTable ? 'Grafik' : 'Tablo'}</button>
        </div>
      </div>
      <div id="trend" class="chart"></div>
    </div>
    <div class="card">
      <div class="card-head"><div><h2>Yaklaşan ve geciken ödemeler</h2><p>Önümüzdeki 14 gün ve ödenmemiş geçmiş dönemler</p></div>
        <button type="button" class="btn ghost sm" data-act="tab" data-tab="odemeler">Tümü</button></div>
      ${attentionHtml()}
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-head"><div><h2>${ui.type === 'income' ? 'Gelir kaynakları' : 'Paranın gittiği yerler'}</h2><p>${esc(r.label)} · kategoriye dokunarak filtrele</p></div>
        ${ui.cat !== 'all' ? `<button type="button" class="btn ghost sm" data-act="clearCat">Filtreyi kaldır</button>` : ''}</div>
      ${categoryHtml(r)}
    </div>
    <div class="card">
      <div class="card-head"><div><h2>Önümüzdeki 6 ay</h2><p>Düzenli gelir ve ödeme planlarına göre tahmin</p></div></div>
      ${forecastHtml()}
    </div>
  </div>`;
  drawTrend();
}

function trendBuckets() {
  const n = TREND_N[ui.period], list = filteredTx(), out = [];
  for (let k = n - 1; k >= 0; k--) {
    const r = periodRange(ui.period, shiftAnchor(ui.period, ui.anchor, -k));
    const s = sumRange(list, r.start, r.end);
    out.push({ label: r.short, full: r.label, inc: s.inc, exp: s.exp, sel: k === 0 });
  }
  return out;
}
function niceStep(range, ticks = 4) {
  const raw = range / ticks, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
function barPath(x, y0, y1, w) {
  const h = Math.abs(y0 - y1);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}
function drawTrend() {
  const el = $('#trend');
  if (!el) return;
  const B = trendBuckets(), mode = ui.type;
  const showInc = mode !== 'expense', showExp = mode !== 'income', showNet = mode === 'all';
  if (ui.showTable) {
    el.innerHTML = `<div class="scroll-x"><table class="tbl"><thead><tr><th>Dönem</th>${showInc ? '<th>Gelir</th>' : ''}${showExp ? '<th>Gider</th>' : ''}${showNet ? '<th>Fark</th>' : ''}</tr></thead><tbody>
      ${B.slice().reverse().map(b => `<tr><td>${esc(b.full)}</td>${showInc ? `<td>${money(b.inc)}</td>` : ''}${showExp ? `<td>${money(b.exp)}</td>` : ''}${showNet ? `<td class="${b.inc - b.exp < 0 ? 'neg' : ''}">${money(b.inc - b.exp, { sign: true })}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>`;
    return;
  }
  if (!B.some(b => b.inc || b.exp)) { el.innerHTML = '<div class="empty-chart">Bu aralıkta gösterilecek kayıt yok.</div>'; return; }
  const W = Math.max(300, el.clientWidth || 600), H = W < 480 ? 230 : 270;
  const m = { t: 14, r: 6, b: 28, l: 58 };
  const vals = [0];
  B.forEach(b => { if (showInc) vals.push(b.inc); if (showExp) vals.push(b.exp); if (showNet) vals.push(b.inc - b.exp); });
  let max = Math.max(...vals), min = Math.min(...vals);
  if (max === min) max = min + 1;
  const step = niceStep(max - min);
  const yMax = Math.ceil(max / step) * step, yMin = Math.floor(min / step) * step;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const y = v => m.t + ih * (1 - (v - yMin) / (yMax - yMin));
  const gw = iw / B.length, nb = (showInc ? 1 : 0) + (showExp ? 1 : 0);
  const bw = Math.max(3, Math.min(22, (gw * 0.72 - 2 * (nb - 1)) / nb));
  const y0 = y(0);
  let svg = '';
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    const yy = y(v).toFixed(1);
    svg += `<line class="${Math.abs(v) < step / 2 ? 'zero' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text x="${m.l - 8}" y="${+yy + 4}" text-anchor="end">${compact(v)}</text>`;
  }
  const every = Math.ceil(36 / gw);
  B.forEach((b, i) => {
    const gx = m.l + gw * i, cx = gx + gw / 2;
    let x = cx - (nb * bw + (nb - 1) * 2) / 2;
    svg += `<rect class="hit" data-i="${i}" x="${gx}" y="${m.t}" width="${gw}" height="${ih}"/><rect class="hover-band" data-band="${i}" x="${gx + 1}" y="${m.t}" width="${gw - 2}" height="${ih}" rx="6" pointer-events="none"/>`;
    if (showInc) { svg += `<path class="b-inc" pointer-events="none" d="${barPath(x, y0, y(b.inc), bw)}"/>`; x += bw + 2; }
    if (showExp) svg += `<path class="b-exp" pointer-events="none" d="${barPath(x, y0, y(b.exp), bw)}"/>`;
    if ((B.length - 1 - i) % every === 0) svg += `<text class="${b.sel ? 'sel' : ''}" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  if (showNet) {
    const pts = B.map((b, i) => [m.l + gw * i + gw / 2, y(b.inc - b.exp)]);
    svg += `<polyline class="net" pointer-events="none" points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>`;
    svg += pts.map(p => `<circle class="net-dot" pointer-events="none" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"/>`).join('');
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${TREND_TITLE[ui.period]} gelir ve gider grafiği">${svg}</svg><div class="tip" hidden></div>`;
  const tip = $('.tip', el);
  const show = e => {
    const r = e.target.closest('.hit');
    if (!r) return;
    const i = +r.dataset.i, b = B[i];
    $$('.hover-band', el).forEach(h => h.classList.toggle('on', +h.dataset.band === i));
    tip.innerHTML = `<b>${esc(b.full)}</b>${showInc ? `<div><span><i class="dot inc"></i>Gelir</span><span>${money(b.inc)}</span></div>` : ''}${showExp ? `<div><span><i class="dot exp"></i>Gider</span><span>${money(b.exp)}</span></div>` : ''}${showNet ? `<div><span><i class="dot net"></i>Fark</span><span>${money(b.inc - b.exp, { sign: true })}</span></div>` : ''}`;
    tip.hidden = false;
    const scale = el.clientWidth / W;
    const cx = (m.l + gw * i + gw / 2) * scale;
    const half = tip.offsetWidth / 2;
    tip.style.left = Math.min(Math.max(cx, half), el.clientWidth - half) + 'px';
    tip.style.top = (m.t * scale + 4) + 'px';
  };
  const svgEl = $('svg', el);
  svgEl.addEventListener('pointermove', show);
  svgEl.addEventListener('pointerdown', show);
  svgEl.addEventListener('pointerleave', () => { tip.hidden = true; $$('.hover-band', el).forEach(h => h.classList.remove('on')); });
}
function attentionHtml() {
  const t0 = today(), lim = ymd(addDays(new Date(), 14)), cm = thisMonth();
  const items = [...overdueBefore(cm)];
  for (const m of [cm, addMonths(cm, 1)]) for (const o of occsInMonth(m)) if (isOpen(o) && (o.status === 'overdue' || o.due <= lim)) items.push(o);
  items.sort((a, b) => a.due.localeCompare(b.due));
  if (!state.plans.length) return `<div class="empty"><b>Henüz ödeme planı yok</b>Kredi, kart, aidat ve faturalarını ekle; tarihi yaklaşınca burada görünsün.<br><button type="button" class="btn primary" data-act="newPlan">Ödeme planı ekle</button></div>`;
  if (!items.length) return `<div class="empty"><b>Her şey yolunda</b>Önümüzdeki 14 günde bekleyen ödeme yok.</div>`;
  const shown = items.slice(0, 7);
  const total = items.filter(o => o.plan.dir === 'expense').reduce((s, o) => s + o.amount, 0);
  return `<ul class="list">${shown.map(o => occRow(o, { showMonth: o.month !== cm && o.due < t0 })).join('')}</ul>
    <p class="muted small" style="margin:10px 6px 0">${items.length > shown.length ? `+${items.length - shown.length} ödeme daha · ` : ''}Toplam ödenecek: <b>${money(total)}</b></p>`;
}
function categoryHtml(r) {
  const type = ui.type === 'income' ? 'income' : 'expense';
  const by = {};
  for (const t of state.transactions) if (t.type === type && t.date >= r.start && t.date <= r.end) by[t.category] = (by[t.category] || 0) + t.amount;
  let rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<div class="empty"><b>Bu dönemde ${type === 'income' ? 'gelir' : 'gider'} yok</b>Kayıt ekledikçe kategorilere göre dağılım burada görünür.</div>`;
  const total = rows.reduce((s, x) => s + x[1], 0), max = rows[0][1];
  if (rows.length > 9) { const rest = rows.slice(8).reduce((s, x) => s + x[1], 0); rows = [...rows.slice(0, 8), ['Diğer kategoriler', rest]]; }
  return `<ul class="catbars ${type}">${rows.map(([c, v]) => `<li><button type="button" ${c === 'Diğer kategoriler' ? 'disabled' : `data-act="setCat" data-v="${esc(c)}"`} aria-pressed="${ui.cat === c}">
    <span class="lbl">${esc(c)}</span><span class="val num">${money(v)}<small>%${trNum(v / total * 100, 0)}</small></span>
    <span class="track"><span class="fill" style="width:${Math.max(1.5, v / max * 100).toFixed(1)}%"></span></span></button></li>`).join('')}</ul>`;
}
function forecastHtml() {
  if (!state.plans.length) return `<div class="empty"><b>Tahmin için plan gerekli</b>Maaşını ve düzenli ödemelerini eklediğinde önümüzdeki ayların dengesi burada görünür.</div>`;
  const cm = thisMonth(), rows = [];
  for (let k = 0; k < 6; k++) {
    const m = addMonths(cm, k);
    let inc = 0, exp = 0;
    for (const o of occsInMonth(m)) { if (o.status === 'skipped') continue; if (o.plan.dir === 'income') inc += o.amount; else exp += o.amount; }
    rows.push({ m, inc, exp });
  }
  return `<div class="scroll-x"><table class="tbl"><thead><tr><th>Ay</th><th>Gelir</th><th>Ödemeler</th><th>Kalan</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${monthLabel(r.m)}</td><td>${money(r.inc)}</td><td>${money(r.exp)}</td><td class="${r.inc - r.exp < 0 ? 'neg' : 'pos'}">${money(r.inc - r.exp, { sign: true })}</td></tr>`).join('')}
  </tbody></table></div><p class="muted small" style="margin:10px 0 0">Değişken tutarlı faturalar (≈) son girilen tutarla hesaplanır.</p>`;
}

/* ================= ÖDEMELER ================= */
function renderOdemeler() {
  const el = $('#view-odemeler');
  const head = `<div class="page-title">
    <div><div class="eyebrow">Düzenli ödemeler</div><h1>Ödemeler</h1><p>Kredi, kart, aidat ve faturaların; geçmiş ve gelecek aylarıyla.</p></div>
    <button type="button" class="btn primary" data-act="newPlan">${ICON.plus.replace('<svg', '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"')}Ödeme planı ekle</button>
  </div>
  <div class="toolbar">${segHtml('payView', { list: 'Aylık liste', year: 'Yıllık tablo', plans: 'Planlar' }, ui.payView)}</div>`;
  let body;
  if (ui.payView === 'year') body = payYearHtml();
  else if (ui.payView === 'plans') body = plansHtml();
  else body = payListHtml();
  el.innerHTML = head + body;
}
function payListHtml() {
  const m = ui.payMonth, cm = thisMonth();
  const occs = occsInMonth(m);
  const exp = occs.filter(o => o.plan.dir === 'expense'), inc = occs.filter(o => o.plan.dir === 'income');
  const live = exp.filter(o => o.status !== 'skipped');
  const total = live.reduce((s, o) => s + o.amount, 0);
  const paid = live.filter(isDone).reduce((s, o) => s + o.amount, 0);
  const late = live.filter(o => o.status === 'overdue');
  const prior = m === cm ? overdueBefore(cm) : [];
  const nav = `<div class="toolbar">${navHtml('payShift', monthLabel(m))}${m !== cm ? `<button type="button" class="btn ghost sm" data-act="payToday">Bu aya dön</button>` : ''}</div>`;
  if (!state.plans.length) return `<div class="card">${nav}<div class="empty"><b>Henüz ödeme planı yok</b>Kredi taksiti, kredi kartı, aidat, kira, elektrik, su, doğalgaz, internet gibi düzenli ödemelerini bir kez ekle; her ay otomatik olarak listelensin.<br><button type="button" class="btn primary" data-act="newPlan">İlk planı ekle</button></div></div>`;
  return `<div class="card">
    <div class="card-head" style="margin-bottom:12px">${nav}</div>
    <div class="sumstrip">
      <div><span class="eyebrow">Bu ay ödenecek</span><b>${money(total)}</b></div>
      <div><span class="eyebrow">Ödenen</span><b>${money(paid)}</b></div>
      <div><span class="eyebrow">Kalan</span><b>${money(total - paid)}</b></div>
      <div><span class="eyebrow">Geciken</span><b>${late.length + prior.length} ödeme</b></div>
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${total ? Math.round(paid / total * 100) : 0}" aria-label="Ödenen oran"><i style="width:${total ? (paid / total * 100).toFixed(1) : 0}%"></i></div>
  </div>
  ${prior.length ? `<div class="card"><div class="list-head"><h2>Önceki aylardan kalan</h2><span>${money(prior.reduce((s, o) => s + o.amount, 0))}</span></div><ul class="list">${prior.map(o => occRow(o, { showMonth: true })).join('')}</ul></div>` : ''}
  <div class="card">
    <div class="list-head"><h2>Ödemeler</h2><span>${exp.length} kalem</span></div>
    ${exp.length ? `<ul class="list">${exp.map(o => occRow(o)).join('')}</ul>` : '<div class="empty">Bu ay planlı ödeme yok.</div>'}
    ${inc.length ? `<div class="list-head"><h2>Gelirler</h2><span>${money(inc.reduce((s, o) => s + o.amount, 0))}</span></div><ul class="list">${inc.map(o => occRow(o)).join('')}</ul>` : ''}
  </div>`;
}
function payYearHtml() {
  const y = ui.payYear, cm = thisMonth();
  const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`);
  const plans = state.plans.filter(p => months.some(m => occIndex(p, m)))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'tr') : a.dir === 'income' ? 1 : -1));
  const nav = navHtml('yearShift', String(y));
  if (!plans.length) return `<div class="card"><div class="toolbar">${nav}</div><div class="empty"><b>${y} yılında plan yok</b>Ödeme planı eklediğinde her ayın durumu bu tabloda görünür.</div></div>`;
  const totals = months.map(() => ({ all: 0, paid: 0 }));
  const rows = plans.map(p => `<tr><td><b>${esc(p.name)}</b><small>${p.dir === 'income' ? 'Gelir' : esc(KINDS[p.kind]?.label || 'Ödeme')}${p.count ? ` · ${p.count} taksit` : ''}</small></td>
    ${months.map((m, i) => {
      const o = occ(p, m);
      if (!o) return '<td><span class="ycell none" aria-hidden="true"></span></td>';
      if (p.dir === 'expense' && o.status !== 'skipped') { totals[i].all += o.amount; if (isDone(o)) totals[i].paid += o.amount; }
      const mark = isDone(o) ? '✓' : o.status === 'overdue' ? '!' : o.status === 'skipped' ? '–' : '';
      return `<td><button type="button" class="ycell ${o.status}" data-act="occ" data-key="${o.key}" title="${esc(p.name)} · ${monthLabel(m)} · ${statusLabel(o.status, p.dir)} · ${money(o.amount)}">${o.estimated ? '≈' : ''}${compact(o.amount)}<i>${mark}${p.count ? ` ${o.index}/${p.count}` : ''}</i></button></td>`;
    }).join('')}</tr>`).join('');
  return `<div class="card">
    <div class="card-head"><div class="toolbar">${nav}</div><p>Hücreye dokunarak ödendi işaretle ya da tutarı düzenle.</p></div>
    <div class="scroll-x"><table class="ytable">
      <thead><tr><th>Ödeme</th>${months.map(m => `<th class="${m === cm ? 'cur' : ''}">${MON_S[+m.slice(5) - 1]}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Aylık ödeme toplamı</td>${totals.map(t => `<td>${t.all ? compact(t.all) : '–'}<small>${t.all ? (t.paid >= t.all ? 'tamamı ödendi' : `kalan ${compact(t.all - t.paid)}`) : ''}</small></td>`).join('')}</tr></tfoot>
    </table></div>
    <div class="ykey">
      <span><i style="background:var(--good-soft);border:1px solid var(--good)"></i>Ödendi</span>
      <span><i style="background:var(--crit-soft);border:1px solid var(--crit)"></i>Gecikti</span>
      <span><i style="background:var(--warn-soft);border:1px solid var(--warn)"></i>Yaklaşıyor</span>
      <span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>Bekliyor</span>
      <span>≈ tahmini tutar</span>
    </div>
  </div>`;
}
function plansHtml() {
  if (!state.plans.length) return `<div class="card"><div class="empty"><b>Henüz ödeme planı yok</b>Düzenli ödeme ve gelirlerini ekle.<br><button type="button" class="btn primary" data-act="newPlan">Ödeme planı ekle</button></div></div>`;
  const sorted = state.plans.slice().sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'tr') : a.dir === 'income' ? 1 : -1));
  let monthlyExp = 0, monthlyInc = 0;
  const cards = sorted.map(p => {
    const s = planStats(p);
    const finished = p.count && !s.remaining;
    const perMonth = +p.amount / (+p.freq || 1);
    if (!finished) { if (p.dir === 'income') monthlyInc += perMonth; else monthlyExp += perMonth; }
    const sched = `${FREQS[p.freq] || 'Her ay'}, ayın ${p.dueDay}. günü`;
    const left = p.count
      ? `<div><span>Kalan</span><b>${s.remaining} taksit</b></div><div><span>Kalan tutar</span><b>${money(s.remAmt)}</b></div>`
      : `<div><span>Yıllık tutar</span><b>${p.variable ? '≈ ' : ''}${money(perMonth * 12)}</b></div><div><span>Sonraki</span><b>${s.next ? dateLabel(s.next.due) : '–'}</b></div>`;
    return `<button type="button" class="plan" data-act="editPlan" data-id="${p.id}">
      <div class="plan-top"><span class="mono ${p.dir === 'income' ? 'income' : ''}">${esc(initials(p.name))}</span>
        <span class="row-text"><b>${esc(p.name)}</b><small>${esc(sched)}</small></span>
        <span class="row-amt"><b>${p.variable ? '≈ ' : ''}${money(+p.amount)}</b>${finished ? '<span class="pill paid">Bitti</span>' : p.autopay ? '<span class="tag">Talimatlı</span>' : ''}</span></div>
      ${p.count ? `<div class="progress" style="margin:0" aria-label="${s.paid}/${p.count} taksit ödendi"><i style="width:${(s.paid / p.count * 100).toFixed(1)}%"></i></div>` : ''}
      <div class="plan-meta">${p.count ? `<div><span>Ödenen</span><b>${s.paid}/${p.count} taksit</b></div><div><span>Sonraki</span><b>${s.next ? dateLabel(s.next.due) : '–'}</b></div>` : ''}${left}</div>
    </button>`;
  }).join('');
  return `<div class="card"><div class="sumstrip">
      <div><span class="eyebrow">Plan sayısı</span><b>${state.plans.length}</b></div>
      <div><span class="eyebrow">Aylık ödemeler</span><b>${money(Math.round(monthlyExp))}</b></div>
      <div><span class="eyebrow">Aylık gelirler</span><b>${money(Math.round(monthlyInc))}</b></div>
      <div><span class="eyebrow">Aylık kalan</span><b>${money(Math.round(monthlyInc - monthlyExp), { sign: true })}</b></div>
    </div></div>
    <div class="plans">${cards}</div>`;
}

/* ================= KAYITLAR ================= */
function renderKayitlar() {
  const el = $('#view-kayitlar');
  el.innerHTML = `<div class="page-title">
    <div><div class="eyebrow">Hareketler</div><h1>Kayıtlar</h1><p>Tüm gelir ve gider kayıtların, gün gün.</p></div>
    <button type="button" class="btn" data-act="exportCsv">CSV olarak indir</button>
  </div>
  <div class="card">
    <div class="toolbar">
      ${segHtml('txScope', { month: 'Aylık', all: 'Tümü' }, ui.txScope)}
      ${ui.txScope === 'month' ? navHtml('txShift', monthLabel(ui.txMonth)) : ''}
      <span class="spacer"></span>
      ${segHtml('txType', { all: 'Hepsi', income: 'Gelir', expense: 'Gider' }, ui.txType)}
      ${catSelect('f-txcat', ui.txType, ui.txCat)}
      <input type="search" id="f-q" placeholder="Not veya kategori ara" value="${esc(ui.txQ)}" style="max-width:240px" aria-label="Ara">
    </div>
  </div>
  <div class="card" id="txList"></div>`;
  renderTxList();
}
function txFilter() {
  const q = ui.txQ.trim().toLocaleLowerCase('tr-TR');
  return state.transactions.filter(t =>
    (ui.txScope === 'all' || t.date.startsWith(ui.txMonth)) &&
    (ui.txType === 'all' || t.type === ui.txType) &&
    (ui.txCat === 'all' || t.category === ui.txCat) &&
    (!q || `${t.note || ''} ${t.category}`.toLocaleLowerCase('tr-TR').includes(q))
  ).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}
function renderTxList() {
  const el = $('#txList');
  if (!el) return;
  const list = txFilter();
  if (!list.length) { el.innerHTML = `<div class="empty"><b>Kayıt bulunamadı</b>${state.transactions.length ? 'Filtreleri değiştirmeyi dene.' : 'İlk gelir ya da giderini ekleyerek başla.'}<br><button type="button" class="btn primary" data-act="add">Yeni kayıt</button></div>`; return; }
  const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const groups = new Map();
  for (const t of list.slice(0, 600)) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  let html = `<div class="sumstrip" style="margin-bottom:14px">
    <div><span class="eyebrow">Kayıt</span><b>${list.length}</b></div>
    <div><span class="eyebrow">Gelir</span><b>${money(inc)}</b></div>
    <div><span class="eyebrow">Gider</span><b>${money(exp)}</b></div>
    <div><span class="eyebrow">Fark</span><b>${money(inc - exp, { sign: true })}</b></div></div>`;
  for (const [d, items] of groups) {
    const dayNet = items.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    html += `<div class="list-head"><h2 style="font-size:14px">${dateLabel(d)} · ${WDAYS[parseD(d).getDay()]}</h2><span>${money(dayNet, { sign: true })}</span></div><ul class="list">`;
    html += items.map(t => `<li class="row"><button type="button" class="row-main" data-act="editTx" data-id="${t.id}">
      <span class="mono ${t.type === 'income' ? 'income' : 'exp'}">${esc(initials(t.category))}</span>
      <span class="row-text"><b>${esc(t.category)}</b><small>${esc(t.note || (t.type === 'income' ? 'Gelir' : 'Gider'))}${t.planId ? ' · düzenli ödeme' : ''}</small></span>
      <span class="row-amt"><b>${t.type === 'income' ? '+' : '−'}${money(t.amount)}</b></span></button></li>`).join('');
    html += '</ul>';
  }
  if (list.length > 600) html += `<p class="muted small">İlk 600 kayıt gösteriliyor. Daha azı için ay ya da kategori seç.</p>`;
  el.innerHTML = html;
}

/* ================= AYARLAR ================= */
function renderAyarlar() {
  const el = $('#view-ayarlar');
  const s = state.settings;
  const catBlock = type => `<div class="field"><span>${type === 'income' ? 'Gelir kategorileri' : 'Gider kategorileri'}</span>
    <div class="catedit">${state.categories[type].map(c => `<span>${esc(c)}<button type="button" data-act="delCat" data-type="${type}" data-v="${esc(c)}" aria-label="${esc(c)} kategorisini sil">${ICON.close.replace('<svg', '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"')}</button></span>`).join('')}</div>
    <form class="inline-add" data-form="addCat" data-type="${type}"><input type="text" id="newcat-${type}" placeholder="Yeni kategori" maxlength="30" required><button class="btn" type="submit">Ekle</button></form></div>`;
  el.innerHTML = `<div class="page-title"><div><div class="eyebrow">Tercihler</div><h1>Ayarlar</h1><p>Görünüm, kategoriler ve yedekleme.</p></div></div>
  <div class="settings">
    <div class="card">
      <h2>Genel</h2>
      <div class="setting"><div><b>Para birimi</b><p>Tutarlar bu birimle gösterilir.</p></div>
        <select id="s-cur" data-change="s-cur">${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${k === s.currency ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Tema</b><p>Sistem, cihazının ayarını izler.</p></div>
        <select id="s-theme" data-change="s-theme">${Object.entries({ system: 'Sistem', light: 'Açık', dark: 'Koyu' }).map(([k, v]) => `<option value="${k}" ${k === s.theme ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="setting"><div><b>Yaklaşan ödeme uyarısı</b><p>Son ödeme gününe bu kadar gün kala “Yaklaşıyor” olarak işaretlenir.</p></div>
        <select id="s-remind" data-change="s-remind">${[1, 2, 3, 5, 7, 10, 14].map(n => `<option value="${n}" ${n === +s.remindDays ? 'selected' : ''}>${n} gün önce</option>`).join('')}</select></div>
    </div>
    <div class="card">
      <h2>Yedekleme</h2>
      <p class="muted small">Verilerin yalnızca bu cihazda saklanır. Düzenli olarak yedek al; yedeği başka bir cihaza aktarabilirsin.</p>
      <div class="btn-col">
        <button type="button" class="btn" data-act="exportJson">Yedeği indir (JSON)</button>
        <button type="button" class="btn" data-act="showBackup">Yedeği metin olarak göster / kopyala</button>
        <button type="button" class="btn" data-act="importJson">Yedekten geri yükle</button>
        <button type="button" class="btn" data-act="exportCsv">Kayıtları CSV olarak indir (Excel)</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <div class="card">
      <h2>Kategoriler</h2>
      ${catBlock('expense')}
      ${catBlock('income')}
    </div>
    <div class="card">
      <h2>Veriler</h2>
      <p class="muted small">${state.transactions.length} kayıt · ${state.plans.length} ödeme planı${state.demo ? ' · örnek veriler yüklü' : ''}</p>
      <div class="btn-col">
        <button type="button" class="btn" data-act="loadDemo">Örnek verileri yükle</button>
        <button type="button" class="btn danger" data-act="wipe">Tüm verileri sil</button>
      </div>
      <p class="muted small" style="margin-top:16px">Kasa Defteri 1.0 · Veriler cihazında kalır, hiçbir sunucuya gönderilmez.</p>
    </div>
  </div>`;
}

/* ================= pencereler ================= */
const sheet = $('#sheet');
function openSheet(html, onMount) {
  sheet.innerHTML = `<div class="sheet-inner">${html}</div>`;
  if (!sheet.open) { try { sheet.showModal(); } catch { sheet.setAttribute('open', ''); } }
  onMount && onMount(sheet);
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', e => {
  if (e.target === sheet) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});
function ask(title, msg, ok = 'Sil', danger = true) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; res(v); } };
    openSheet(`<div class="sheet-head"><h3>${esc(title)}</h3></div><p style="margin:0;color:var(--ink-2)">${msg}</p>
      <div class="sheet-actions"><button type="button" class="btn ghost" data-r="0">Vazgeç</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`,
    el => $$('[data-r]', el).forEach(b => b.addEventListener('click', () => { fin(b.dataset.r === '1'); closeSheet(); })));
    sheet.addEventListener('close', () => fin(false), { once: true });
  });
}
let toastTimer;
function toast(msg, actionLabel, fn) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) $('button', t).onclick = () => { t.classList.remove('show'); fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 2600);
}
function bindAmount(input) {
  input.addEventListener('blur', () => { const n = parseAmount(input.value); if (n > 0) input.value = amountInputValue(n); });
}
const sym = () => SYMBOL[state.settings.currency] || '';

/* ---- kayıt formu (yeni / düzenle) ---- */
function txSheet(tx) {
  const edit = !!tx;
  let type = tx?.type || 'expense';
  let cat = tx?.category || null;
  const plan = tx?.planId ? planById(tx.planId) : null;
  openSheet(`<form class="form" id="txForm" novalidate>
    <div class="sheet-head"><div><h3>${edit ? 'Kaydı düzenle' : 'Yeni kayıt'}</h3><p>${edit ? '' : 'Enter ile kaydet'}</p></div>
      <button type="button" class="icon-btn" data-close aria-label="Kapat">${ICON.close}</button></div>
    <div class="seg wide" id="f-type">
      <button type="button" data-v="expense"><i class="dot exp"></i>Gider</button>
      <button type="button" data-v="income"><i class="dot inc"></i>Gelir</button></div>
    <label class="amount-field"><span class="cur">${esc(sym())}</span><input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Tutar" value="${tx ? amountInputValue(tx.amount) : ''}"></label>
    <div class="field"><span>Kategori</span><div class="chips" id="f-cats"></div></div>
    <div class="row2">
      <label class="field"><span>Tarih</span><input type="date" id="f-date" value="${tx?.date || today()}" required></label>
      <label class="field"><span>Not</span><input type="text" id="f-note" placeholder="İsteğe bağlı" maxlength="80" value="${esc(tx?.note || '')}"></label>
    </div>
    ${plan ? `<p class="note-box">Bu kayıt <b>${esc(plan.name)}</b> planının ${monthLabel(tx.period)} ödemesidir. Silersen o ay “ödenmedi” görünür.</p>` : ''}
    ${edit ? '' : `<label class="check"><input type="checkbox" id="f-rec"><span>Her ay tekrarlar<small>Maaş, kira, abonelik gibi. Ödeme planı olarak eklenir; sonraki aylarda Ödemeler’de görünür.</small></span></label>`}
    <p class="err" id="f-err" hidden></p>
    <div class="sheet-actions">
      ${edit ? '<button type="button" class="btn ghost grow" id="f-del" style="color:var(--crit)">Sil</button>' : ''}
      <button type="submit" class="btn primary block" style="flex:1">${edit ? 'Değişiklikleri kaydet' : 'Kaydet'}</button>
    </div></form>`, el => {
    const amt = $('#f-amount', el);
    bindAmount(amt);
    const drawType = () => $$('#f-type button', el).forEach(b => b.classList.toggle('on', b.dataset.v === type));
    const drawCats = () => {
      const cats = state.categories[type].slice();
      if (tx && tx.type === type && !cats.includes(tx.category)) cats.push(tx.category);
      if (!cats.includes(cat)) cat = type === 'expense' ? (cats.includes('Market') ? 'Market' : cats[0]) : cats[0];
      $('#f-cats', el).innerHTML = cats.map(c => `<button type="button" class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    };
    drawType(); drawCats();
    $('#f-type', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.v; drawType(); drawCats(); });
    $('#f-cats', el).addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.c; drawCats(); });
    setTimeout(() => amt.focus(), 50);
    if (edit) $('#f-del', el).addEventListener('click', async () => {
      if (!(await ask('Kayıt silinsin mi?', `${esc(tx.category)} · ${money(tx.amount)} kalıcı olarak silinecek.`))) { txSheet(tx); return; }
      state.transactions = state.transactions.filter(t => t.id !== tx.id);
      commit('Kayıt silindi');
    });
    $('#txForm', el).addEventListener('submit', e => {
      e.preventDefault();
      const amount = parseAmount(amt.value);
      const date = $('#f-date', el).value;
      const err = $('#f-err', el);
      if (!(amount > 0)) { err.textContent = 'Tutarı gir (ör. 1.250 ya da 1250,50).'; err.hidden = false; amt.focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = 'Geçerli bir tarih seç.'; err.hidden = false; return; }
      const note = $('#f-note', el).value.trim();
      if (edit) {
        Object.assign(tx, { type, amount, category: cat, date, note });
        commit('Kayıt güncellendi');
        return;
      }
      const t = { id: uid(), type, amount, category: cat, date, note, createdAt: Date.now() };
      if ($('#f-rec', el).checked) {
        const kind = Object.entries(KINDS).find(([, k]) => k.cat === cat && (k.dir || 'expense') === type)?.[0] || (type === 'income' ? 'gelir' : 'diger');
        const p = { id: uid(), name: note || cat, kind, dir: type, category: cat, amount, variable: false, dueDay: +date.slice(8), freq: 1, start: date.slice(0, 7), count: null, autopay: false, note: '', paidUntil: null, createdAt: Date.now() };
        state.plans.push(p);
        Object.assign(t, { planId: p.id, period: date.slice(0, 7), note: note || cat });
      }
      state.transactions.push(t);
      commit('Kaydedildi', 'Geri al', () => { state.transactions = state.transactions.filter(x => x.id !== t.id); if (t.planId) state.plans = state.plans.filter(p => p.id !== t.planId); commit('Geri alındı'); });
    });
  });
}

/* ---- ödeme planı formu ---- */
function planSheet(p) {
  const edit = !!p;
  const cm = thisMonth();
  const d = p ? { ...p } : { dir: 'expense', kind: 'kredi', name: '', amount: '', variable: false, dueDay: new Date().getDate(), freq: 1, start: cm, count: null, autopay: false, note: '', paidUntil: null, category: 'Kredi' };
  openSheet(`<form class="form" id="planForm" novalidate>
    <div class="sheet-head"><div><h3>${edit ? 'Ödeme planını düzenle' : 'Yeni ödeme planı'}</h3><p>Her ay (ya da seçtiğin aralıkla) otomatik listelenir.</p></div>
      <button type="button" class="icon-btn" data-close aria-label="Kapat">${ICON.close}</button></div>
    <div class="seg wide" id="p-dir"><button type="button" data-v="expense"><i class="dot exp"></i>Ödeme</button><button type="button" data-v="income"><i class="dot inc"></i>Düzenli gelir</button></div>
    <div class="row2">
      <label class="field"><span>Tür</span><select id="p-kind"></select></label>
      <label class="field"><span>Ad</span><input type="text" id="p-name" maxlength="40" placeholder="ör. Konut kredisi" value="${esc(d.name)}"></label>
    </div>
    <label class="amount-field"><span class="cur">${esc(sym())}</span><input id="p-amount" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Tutar" value="${d.amount ? amountInputValue(+d.amount) : ''}"></label>
    <label class="check"><input type="checkbox" id="p-var" ${d.variable ? 'checked' : ''}><span>Tutar her ay değişiyor<small>Fatura ve kart ekstresi gibi. Girdiğin tutar tahmin olarak kullanılır; her ay gerçek tutarı öderken girersin.</small></span></label>
    <div class="row2">
      <label class="field"><span>Son ödeme günü</span><input type="number" id="p-day" min="1" max="31" value="${d.dueDay}"><small>Ayın kaçında? (31 = ay sonu)</small></label>
      <label class="field"><span>Sıklık</span><select id="p-freq">${Object.entries(FREQS).map(([k, v]) => `<option value="${k}" ${+k === +d.freq ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>İlk ödeme ayı</span><input type="month" id="p-start" value="${d.start}" placeholder="YYYY-AA"></label>
      <label class="field"><span>Taksit / ödeme sayısı</span><input type="number" id="p-count" min="1" max="600" placeholder="Süresiz" value="${d.count || ''}"><small id="p-endtxt">Boş bırakırsan süresiz devam eder.</small></label>
    </div>
    <label class="field"><span>Kategori</span><select id="p-cat"></select></label>
    <label class="check" id="p-pastwrap"><input type="checkbox" id="p-past" ${d.paidUntil || !edit ? 'checked' : ''}><span>Bu aydan önceki dönemleri ödenmiş say<small>Devam eden bir krediyi sonradan ekliyorsan işaretle; geçmiş taksitler “gecikti” görünmez.</small></span></label>
    <label class="check"><input type="checkbox" id="p-auto" ${d.autopay ? 'checked' : ''}><span>Otomatik ödeme talimatı var<small>Hatırlatma amaçlı etiket.</small></span></label>
    <p class="err" id="p-err" hidden></p>
    <div class="sheet-actions">
      ${edit ? '<button type="button" class="btn ghost grow" id="p-del" style="color:var(--crit)">Planı sil</button>' : ''}
      <button type="submit" class="btn primary block" style="flex:1">${edit ? 'Kaydet' : 'Planı ekle'}</button>
    </div></form>`, el => {
    let dir = d.dir;
    const kindSel = $('#p-kind', el), catSel = $('#p-cat', el), name = $('#p-name', el), amt = $('#p-amount', el);
    bindAmount(amt);
    const drawDir = () => {
      $$('#p-dir button', el).forEach(b => b.classList.toggle('on', b.dataset.v === dir));
      const ks = kindsFor(dir);
      if (!ks.some(([k]) => k === d.kind)) d.kind = ks[0][0];
      kindSel.innerHTML = ks.map(([k, v]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${v.label}</option>`).join('');
      const cats = state.categories[dir].slice();
      if (!cats.includes(d.category)) d.category = cats.includes(KINDS[d.kind].cat) ? KINDS[d.kind].cat : cats[cats.length - 1];
      catSel.innerHTML = cats.map(c => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
    };
    const endTxt = () => {
      const c = +$('#p-count', el).value, st = $('#p-start', el).value, f = +$('#p-freq', el).value;
      const a = parseAmount(amt.value);
      const t = $('#p-endtxt', el);
      if (c > 0 && /^\d{4}-\d{2}$/.test(st)) t.textContent = `Son ödeme: ${monthLabel(addMonths(st, (c - 1) * f))}${a > 0 ? ` · Toplam ${money(a * c)}` : ''}`;
      else t.textContent = 'Boş bırakırsan süresiz devam eder.';
      $('#p-pastwrap', el).hidden = !(/^\d{4}-\d{2}$/.test(st) && st < cm);
    };
    drawDir(); endTxt();
    $('#p-dir', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; dir = b.dataset.v; drawDir(); });
    kindSel.addEventListener('change', () => {
      const prevLabel = KINDS[d.kind].label;
      d.kind = kindSel.value;
      const k = KINDS[d.kind];
      if (!name.value.trim() || name.value === prevLabel) name.value = k.label;
      if (state.categories[dir].includes(k.cat)) { d.category = k.cat; catSel.value = k.cat; }
      $('#p-var', el).checked = !!k.variable;
    });
    if (!edit && !name.value) name.value = KINDS[d.kind].label;
    ['#p-count', '#p-start', '#p-freq', '#p-amount'].forEach(s => $(s, el).addEventListener('input', endTxt));
    if (edit) $('#p-del', el).addEventListener('click', async () => {
      const n = state.transactions.filter(t => t.planId === p.id).length;
      if (!(await ask('Plan silinsin mi?', `<b>${esc(p.name)}</b> planı silinecek. Daha önce yapılmış ${n} ödeme kaydı Kayıtlar’da normal gider olarak kalır.`, 'Planı sil'))) { planSheet(p); return; }
      state.plans = state.plans.filter(x => x.id !== p.id);
      state.transactions.forEach(t => { if (t.planId === p.id) { delete t.planId; delete t.period; } });
      for (const k of Object.keys(state.overrides)) if (k.startsWith(p.id + '|')) delete state.overrides[k];
      commit('Plan silindi');
    });
    $('#planForm', el).addEventListener('submit', e => {
      e.preventDefault();
      const err = $('#p-err', el);
      const fail = m => { err.textContent = m; err.hidden = false; };
      const amount = parseAmount(amt.value);
      const nm = name.value.trim();
      const day = Math.round(+$('#p-day', el).value);
      const start = $('#p-start', el).value.trim();
      const countV = $('#p-count', el).value.trim();
      if (!nm) return fail('Plana bir ad ver.');
      if (!(amount > 0)) return fail('Tutarı gir.');
      if (!(day >= 1 && day <= 31)) return fail('Ödeme günü 1 ile 31 arasında olmalı.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)) return fail('İlk ödeme ayını YYYY-AA biçiminde gir (ör. 2026-10).');
      const count = countV ? Math.round(+countV) : null;
      if (countV && !(count >= 1)) return fail('Taksit sayısı en az 1 olmalı.');
      const past = $('#p-past', el).checked && start < cm;
      const obj = {
        name: nm, kind: kindSel.value, dir, category: catSel.value, amount, variable: $('#p-var', el).checked,
        dueDay: day, freq: +$('#p-freq', el).value, start, count, autopay: $('#p-auto', el).checked,
        paidUntil: past ? addMonths(cm, -1) : null,
      };
      if (edit) { Object.assign(p, obj); commit('Plan güncellendi'); }
      else { state.plans.push({ id: uid(), note: '', createdAt: Date.now(), ...obj }); commit('Plan eklendi'); }
    });
  });
}

/* ---- tek dönem (ödeme) penceresi ---- */
function occSheet(key) {
  const o = occByKey(key);
  if (!o) return;
  const p = o.plan, inc = p.dir === 'income';
  const verb = inc ? 'Alındı' : 'Ödendi';
  const info = `<dl class="kv">
      <dt>Dönem</dt><dd>${monthLabel(o.month)}${p.count ? ` · Taksit ${o.index}/${p.count}` : ''}</dd>
      <dt>Son ödeme günü</dt><dd>${dateLabel(o.due)}</dd>
      <dt>Durum</dt><dd><span class="pill ${o.status}">${statusLabel(o.status, p.dir)}</span></dd>
      <dt>Tutar</dt><dd>${o.estimated ? '≈ ' : ''}${money(o.amount)}</dd>
      ${o.tx ? `<dt>${inc ? 'Alınma' : 'Ödeme'} tarihi</dt><dd>${dateLabel(o.tx.date)}</dd>` : ''}
    </dl>`;
  let body;
  if (o.status === 'paid') {
    body = `${info}<div class="sheet-actions"><button type="button" class="btn ghost grow" data-act="editPlan" data-id="${p.id}">Planı düzenle</button>
      <button type="button" class="btn" id="o-undo">${inc ? 'Alınmadı' : 'Ödenmedi'} olarak işaretle</button></div>`;
  } else if (o.status === 'prepaid') {
    body = `${info}<p class="note-box">Bu dönem, plan eklenirken “önceki dönemleri ödenmiş say” seçildiği için ödenmiş kabul ediliyor.</p>
      <div class="sheet-actions"><button type="button" class="btn" data-act="editPlan" data-id="${p.id}">Planı düzenle</button></div>`;
  } else {
    body = `${info}<form class="form" id="o-form" novalidate>
      <label class="amount-field"><span class="cur">${esc(sym())}</span><input id="o-amount" inputmode="decimal" autocomplete="off" aria-label="Tutar" value="${amountInputValue(o.amount)}"></label>
      ${o.estimated ? '<p class="muted small" style="margin:-6px 0 0">Tahmini tutar. Faturadaki gerçek tutarı yaz.</p>' : ''}
      <div class="row2">
        <label class="field"><span>${inc ? 'Alınma' : 'Ödeme'} tarihi</span><input type="date" id="o-date" value="${today()}"></label>
        <label class="field"><span>Not</span><input type="text" id="o-note" maxlength="80" placeholder="İsteğe bağlı"></label>
      </div>
      <p class="err" id="o-err" hidden></p>
      <button type="submit" class="btn primary block">${verb} olarak işaretle</button>
      <div class="sheet-actions">
        <button type="button" class="btn ghost grow" data-act="editPlan" data-id="${p.id}">Planı düzenle</button>
        <button type="button" class="btn sm" id="o-setamt">Yalnızca tutarı kaydet</button>
        <button type="button" class="btn sm" id="o-skip">${o.status === 'skipped' ? 'Atlamayı geri al' : 'Bu dönemi atla'}</button>
      </div></form>`;
  }
  openSheet(`<div class="sheet-head"><div style="display:flex;gap:12px;align-items:center"><span class="mono ${inc ? 'income' : ''}">${esc(initials(p.name))}</span><div><h3>${esc(p.name)}</h3><p>${esc(KINDS[p.kind]?.label || '')} · ${esc(p.category)}</p></div></div>
    <button type="button" class="icon-btn" data-close aria-label="Kapat">${ICON.close}</button></div>${body}`, el => {
    const undo = $('#o-undo', el);
    if (undo) undo.addEventListener('click', () => {
      const tx = o.tx;
      state.transactions = state.transactions.filter(t => t.id !== tx.id);
      commit(`${inc ? 'Alınmadı' : 'Ödenmedi'} olarak işaretlendi`, 'Geri al', () => { state.transactions.push(tx); commit('Geri alındı'); });
    });
    const form = $('#o-form', el);
    if (!form) return;
    const amt = $('#o-amount', el);
    bindAmount(amt);
    const ov = () => (state.overrides[o.key] = state.overrides[o.key] || {});
    const cleanOv = () => { const v = state.overrides[o.key]; if (v && v.amount == null && !v.skip) delete state.overrides[o.key]; };
    form.addEventListener('submit', e => {
      e.preventDefault();
      const a = parseAmount(amt.value), date = $('#o-date', el).value;
      if (!(a > 0)) { const er = $('#o-err', el); er.textContent = 'Tutarı gir.'; er.hidden = false; return; }
      markPaid(o, a, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(), $('#o-note', el).value.trim());
    });
    $('#o-setamt', el).addEventListener('click', () => {
      const a = parseAmount(amt.value);
      if (!(a > 0)) return;
      ov().amount = a; commit('Tutar güncellendi');
    });
    $('#o-skip', el).addEventListener('click', () => {
      if (o.status === 'skipped') { delete ov().skip; cleanOv(); commit('Dönem yeniden takipte'); }
      else { ov().skip = true; commit('Bu dönem atlandı'); }
    });
  });
}
function markPaid(o, amount, date, note) {
  const p = o.plan;
  const tx = { id: uid(), type: p.dir, amount, category: p.category, date, note: note || planTitle(p, o.index), planId: p.id, period: o.month, createdAt: Date.now() };
  state.transactions.push(tx);
  if (state.overrides[o.key]) { delete state.overrides[o.key].amount; if (!state.overrides[o.key].skip) delete state.overrides[o.key]; }
  commit(`${p.name}: ${p.dir === 'income' ? 'alındı' : 'ödendi'}`, 'Geri al', () => { state.transactions = state.transactions.filter(t => t.id !== tx.id); commit('Geri alındı'); });
}

/* ---- yedekleme ---- */
function download(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { toast('İndirme başlatılamadı. Yedeği metin olarak kopyalayabilirsin.'); }
}
function backupText() { return JSON.stringify({ app: 'kasa-defteri', exportedAt: new Date().toISOString(), ...state }, null, 2); }
function csvText() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Tarih', 'Tür', 'Kategori', 'Tutar', 'Not', 'Ödeme planı', 'Dönem'].join(';')];
  for (const t of state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([t.date, t.type === 'income' ? 'Gelir' : 'Gider', q(t.category), String(t.amount).replace('.', ','), q(t.note), q(t.planId ? planById(t.planId)?.name : ''), t.period || ''].join(';'));
  }
  return '﻿' + rows.join('\r\n');
}
function importData(text) {
  let data;
  try { data = JSON.parse(text); } catch { toast('Dosya okunamadı: geçerli bir JSON yedeği değil.'); return; }
  if (!data || !Array.isArray(data.transactions)) { toast('Bu dosya bir Kasa Defteri yedeği gibi görünmüyor.'); return; }
  ask('Yedek geri yüklensin mi?', `Yedekte ${data.transactions.length} kayıt ve ${(data.plans || []).length} ödeme planı var. Şu anki verilerin bununla değiştirilecek.`, 'Geri yükle', false).then(ok => {
    if (!ok) return;
    delete data.app; delete data.exportedAt;
    state = normalize(data);
    commit('Yedek geri yüklendi');
  });
}

/* ================= olaylar ================= */
function commit(msg, actionLabel, fn) {
  save();
  closeSheet();
  render();
  if (msg) toast(msg, actionLabel, fn);
}
const actions = {
  tab: a => setTab(a.dataset.tab),
  add: () => txSheet(),
  period: a => { ui.period = a.dataset.v; render(); },
  type: a => { ui.type = a.dataset.v; if (ui.cat !== 'all' && !allCategories(ui.type).includes(ui.cat)) ui.cat = 'all'; render(); },
  shift: a => { ui.anchor = shiftAnchor(ui.period, ui.anchor, +a.dataset.v); render(); },
  toggleTable: () => { ui.showTable = !ui.showTable; render(); },
  setCat: a => { ui.cat = ui.cat === a.dataset.v ? 'all' : a.dataset.v; render(); },
  clearCat: () => { ui.cat = 'all'; render(); },
  payView: a => { ui.payView = a.dataset.v; render(); },
  payShift: a => { ui.payMonth = addMonths(ui.payMonth, +a.dataset.v); render(); },
  payToday: () => { ui.payMonth = thisMonth(); render(); },
  yearShift: a => { ui.payYear += +a.dataset.v; render(); },
  occ: a => occSheet(a.dataset.key),
  quickpay: a => {
    const o = occByKey(a.dataset.key);
    if (!o) return;
    if (o.estimated) occSheet(o.key); else markPaid(o, o.amount, today(), '');
  },
  newPlan: () => planSheet(),
  editPlan: a => { const p = planById(a.dataset.id); if (p) planSheet(p); },
  editTx: a => { const t = state.transactions.find(x => x.id === a.dataset.id); if (t) txSheet(t); },
  txScope: a => { ui.txScope = a.dataset.v; render(); },
  txShift: a => { ui.txMonth = addMonths(ui.txMonth, +a.dataset.v); render(); },
  txType: a => { ui.txType = a.dataset.v; if (ui.txCat !== 'all' && !allCategories(ui.txType).includes(ui.txCat)) ui.txCat = 'all'; render(); },
  exportCsv: () => download(`kasa-defteri-kayitlar-${today()}.csv`, csvText(), 'text/csv;charset=utf-8'),
  exportJson: () => download(`kasa-defteri-yedek-${today()}.json`, backupText(), 'application/json'),
  showBackup: () => {
    openSheet(`<div class="sheet-head"><div><h3>Yedek (metin)</h3><p>Kopyalayıp güvenli bir yerde sakla. Geri yüklemek için aşağıdaki alana yapıştırıp “Bu metinden geri yükle”ye bas.</p></div>
      <button type="button" class="icon-btn" data-close aria-label="Kapat">${ICON.close}</button></div>
      <textarea id="b-text" spellcheck="false" aria-label="Yedek metni">${esc(backupText())}</textarea>
      <div class="sheet-actions"><button type="button" class="btn ghost grow" id="b-restore">Bu metinden geri yükle</button><button type="button" class="btn primary" id="b-copy">Kopyala</button></div>`, el => {
      const ta = $('#b-text', el);
      $('#b-copy', el).addEventListener('click', () => {
        const fallback = () => { ta.focus(); ta.select(); toast('Metin seçildi; kopyalamak için Ctrl+C / Kopyala kullan.'); };
        try { navigator.clipboard.writeText(ta.value).then(() => toast('Yedek panoya kopyalandı'), fallback); } catch { fallback(); }
      });
      $('#b-restore', el).addEventListener('click', () => importData(ta.value));
    });
  },
  importJson: () => $('#importFile').click(),
  delCat: async a => {
    const { type, v } = a.dataset;
    if (state.categories[type].length <= 1) { toast('En az bir kategori kalmalı.'); return; }
    if (!(await ask('Kategori silinsin mi?', `“${esc(v)}” listeden kaldırılacak. Bu kategorideki eski kayıtlar değişmez.`, 'Kaldır'))) return;
    state.categories[type] = state.categories[type].filter(c => c !== v);
    commit('Kategori kaldırıldı');
  },
  loadDemo: async () => {
    if (state.transactions.length || state.plans.length) {
      if (!(await ask('Örnek veriler yüklensin mi?', 'Mevcut kayıtların ve planların örnek verilerle değiştirilecek. Önce yedek almanı öneririz.', 'Örnekleri yükle'))) return;
    }
    const s = emptyState(state.settings); state = s; seedDemo(state); commit('Örnek veriler yüklendi');
  },
  clearDemo: async () => {
    if (!(await ask('Örnek veriler temizlensin mi?', 'Tüm örnek kayıtlar ve planlar silinir; kendi verilerinle boş bir deftere başlarsın.', 'Temizle ve başla'))) return;
    state = emptyState(state.settings); commit('Defter hazır. İlk kaydını ekleyebilirsin.');
  },
  wipe: async () => {
    if (!(await ask('Tüm veriler silinsin mi?', 'Bütün kayıtlar, ödeme planları ve kategoriler silinir. Bu işlem geri alınamaz.', 'Hepsini sil'))) return;
    state = emptyState(state.settings); commit('Tüm veriler silindi');
  },
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a || a.disabled) return;
  const fn = actions[a.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(a, e);
});
document.addEventListener('change', e => {
  const id = e.target.dataset?.change;
  if (!id) {
    if (e.target.id === 'importFile') {
      const f = e.target.files[0];
      if (f) { const r = new FileReader(); r.onload = () => importData(r.result); r.readAsText(f); }
      e.target.value = '';
    }
    return;
  }
  const v = e.target.value;
  if (id === 'f-cat') ui.cat = v;
  else if (id === 'f-txcat') ui.txCat = v;
  else if (id === 's-cur') { state.settings.currency = v; save(); }
  else if (id === 's-theme') { state.settings.theme = v; applyTheme(); save(); }
  else if (id === 's-remind') { state.settings.remindDays = +v; save(); }
  render();
});
document.addEventListener('input', e => {
  if (e.target.id === 'f-q') { ui.txQ = e.target.value; renderTxList(); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form="addCat"]');
  if (!f) return;
  e.preventDefault();
  const type = f.dataset.type, inp = $('input', f), v = inp.value.trim().replace(/\s+/g, ' ');
  if (!v) return;
  if (state.categories[type].some(c => c.toLocaleLowerCase('tr-TR') === v.toLocaleLowerCase('tr-TR'))) { toast('Bu kategori zaten var.'); return; }
  state.categories[type].push(v);
  commit('Kategori eklendi');
});

/* ================= çizim ================= */
const TABS = ['ozet', 'odemeler', 'kayitlar', 'ayarlar'];
function setTab(t) {
  if (!TABS.includes(t)) t = 'ozet';
  ui.tab = t;
  if (location.hash !== '#' + t) { try { history.replaceState(null, '', '#' + t); } catch { /* yoksay */ } }
  render();
  window.scrollTo({ top: 0 });
}
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function render() {
  rebuildIdx();
  $$('.tabs button').forEach(b => { if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  TABS.forEach(t => { $('#view-' + t).hidden = t !== ui.tab; });
  $('#banner').innerHTML = state.demo
    ? `<div class="banner"><p><b>Örnek verileri görüyorsun.</b> Uygulamayı denemen için hazırlandı; kendi kayıtlarına başlamak için örnekleri temizle.</p><button type="button" class="btn primary sm" data-act="clearDemo">Örnekleri temizle ve başla</button></div>`
    : '';
  ({ ozet: renderOzet, odemeler: renderOdemeler, kayitlar: renderKayitlar, ayarlar: renderAyarlar })[ui.tab]();
}
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (ui.tab === 'ozet') drawTrend(); }, 150); });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== ui.tab && TABS.includes(t)) setTab(t); });
document.addEventListener('keydown', e => {
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !sheet.open && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); txSheet(); }
});
// Gün değişince (uygulama açık kalırsa) durumları tazele
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); if (!sheet.open) render(); } }, 60000);

/* ================= başlat ================= */
const raw = store.read();
if (raw) { try { state = normalize(JSON.parse(raw)); } catch { state = null; } }
if (!state) { state = emptyState(); seedDemo(state); save(); }
applyTheme();
ui.tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ozet';
render();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.self === window.top) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
