/**
 * 🛒 المتجر الكبير — ملف واحد متكامل (البيانات + المنطق + كل الأوامر)
 *
 * الأوامر (كل أمر مستقل، ولا توجد صيغة «.متجر <أمر>»):
 *   .متجر                       الأقسام وحركة السوق      | .متجر <قسم> أو <غرض>
 *   .شراء <غرض>
 *   .بيع <غرض> [كمية|الكل]
 *   .حقيبتي
 *   .تحصيل
 *   .استثمار [خطة مبلغ | سحب | اعمال]
 *   .اعمالي                     مصانعك وشركاتك وعمالها
 *   .وظف <مشروع> [عدد]          توظيف عمال (رسوم توظيف مرة واحدة + راتب بالساعة)
 *   .سرح <مشروع> [عدد|الكل]     تسريح عمال
 *
 * - كل غرض يُشترى مرة واحدة فقط (لا كميات). يمكن بيعه ثم شراؤه من جديد.
 * - المشاريع والشركات (القسم 7) تعمل بالعمال: كل عامل يزيد الإنتاج (بمردود يتناقص تدريجيًا)
 *   ويُخصم راتبه من الدخل كل ساعة، فيزيد الربح الصافي بحسب الإنتاج.
 *
 * - 50 غرضًا في 8 أقسام، أسعارها تتغيّر يوميًا (ثابتة طوال اليوم UTC).
 * - الشراء بسعر اليوم، والبيع بـ 80% منه.
 * - العقارات والمشاريع تدرّ دخلًا بالساعة (يُحصَّل بـ .تحصيل، حد أقصى 24 ساعة).
 * - 5 خطط استثمار، ونتيجة كل استثمار تُحسم لحظة الاستثمار وتظهر عند الاستحقاق.
 * البيانات داخل سجل المستخدم في states (الحقل shop)، والمخزون يظهر في .رصيد.
 */
const os = require('os');
const states = require('../../utils/db/states');

/* ═══════════════════════════ الإعدادات ═══════════════════════════ */
const HOUR = 3600000;
const DAY = 24 * HOUR;
const SELL_RATE = 0.8;        // البيع بـ 80% من سعر اليوم
const MAX_BUY = 1;            // كل غرض يُشترى مرة واحدة فقط
const MAX_OWNED = 1;          // نسخة واحدة من كل غرض
const MAX_ACTIVE_INVEST = 5;  // أقصى عدد استثمارات نشطة

/* ═══════════════════════════ الأقسام والأغراض ═══════════════════════════ */
// vol = أقصى تقلب يومي للسعر
const CATEGORIES = [
    { id: 1, emoji: '🐾', name: 'حيوانات أليفة',    vol: 0.12 },
    { id: 2, emoji: '📱', name: 'إلكترونيات',       vol: 0.10 },
    { id: 3, emoji: '👗', name: 'أزياء وإكسسوارات', vol: 0.12 },
    { id: 4, emoji: '💎', name: 'مجوهرات',          vol: 0.10 },
    { id: 5, emoji: '🚗', name: 'مركبات',           vol: 0.08 },
    { id: 6, emoji: '🏠', name: 'عقارات',           vol: 0.06 },
    { id: 7, emoji: '🏢', name: 'مشاريع وشركات',    vol: 0.08 },
    { id: 8, emoji: '🏺', name: 'تحف ونوادر',       vol: 0.30 }
];

// [قسم، رمز، اسم، سعر أساسي، معدل الدخل بالساعة (اختياري)]
const RAW = [
    // 🐾 حيوانات أليفة
    [1, '🐰', 'أرنب', 400], [1, '🐱', 'قطة', 500], [1, '🐶', 'كلب', 800], [1, '🦜', 'ببغاء', 1200],
    [1, '🐴', 'حصان', 6000], [1, '🦅', 'صقر', 18000], [1, '🦁', 'أسد', 60000],
    // 📱 إلكترونيات
    [2, '🎧', 'سماعات', 800], [2, '📱', 'هاتف', 1500], [2, '⌚', 'ساعة ذكية', 2500], [2, '📷', 'كاميرا', 3000],
    [2, '💻', 'لابتوب', 4000], [2, '🎮', 'بلايستيشن', 6000], [2, '🛸', 'طائرة درون', 9000],
    // 👗 أزياء وإكسسوارات
    [3, '🕶️', 'نظارة شمسية', 600], [3, '👟', 'حذاء رياضي', 900], [3, '👜', 'حقيبة يد', 3500],
    [3, '🤵', 'بدلة رسمية', 5000], [3, '🧥', 'عباءة فاخرة', 7000],
    // 💎 مجوهرات
    [4, '💍', 'خاتم فضة', 2000], [4, '📿', 'قلادة ذهب', 8000], [4, '🕰️', 'ساعة فاخرة', 40000],
    [4, '💎', 'ألماسة', 120000], [4, '👑', 'تاج ملكي', 500000],
    // 🚗 مركبات
    [5, '🚲', 'دراجة هوائية', 1500], [5, '🏍️', 'دراجة نارية', 8000], [5, '🚕', 'سيارة أجرة', 25000, 0.005],
    [5, '🚗', 'سيارة', 30000], [5, '🏎️', 'سيارة رياضية', 150000], [5, '🛥️', 'يخت', 800000], [5, '🛩️', 'طائرة خاصة', 2500000],
    // 🏠 عقارات (دخل إيجار)
    [6, '🏢', 'شقة', 60000, 0.0025], [6, '🏠', 'بيت', 150000, 0.0025], [6, '🏡', 'فيلا', 400000, 0.0025],
    [6, '🏙️', 'برج سكني', 2000000, 0.0025], [6, '🏰', 'قصر', 5000000, 0.0025], [6, '🏝️', 'جزيرة خاصة', 10000000, 0.0025],
    // 🏢 مشاريع وشركات (دخل أعلى)
    [7, '☕', 'مقهى', 40000, 0.005], [7, '🏪', 'متجر تجزئة', 80000, 0.005], [7, '🍽️', 'مطعم', 120000, 0.005],
    [7, '🏭', 'مصنع', 500000, 0.005], [7, '🖥️', 'شركة برمجة', 1200000, 0.005], [7, '🏦', 'بنك', 6000000, 0.005],
    // 🏺 تحف ونوادر (أكثر تقلبًا)
    [8, '🪙', 'عملة نادرة', 3000], [8, '📮', 'طابع بريدي نادر', 5000], [8, '📜', 'مخطوطة قديمة', 15000],
    [8, '🖼️', 'لوحة فنية', 50000], [8, '🏆', 'كأس ذهبي', 90000], [8, '⏳', 'ساعة رملية أثرية', 150000],
    [8, '☄️', 'نيزك', 250000]
];

const ITEMS = RAW.map((r, i) => ({
    id: i + 1, cat: r[0], emoji: r[1], name: r[2], price: r[3], rate: r[4] || 0,
    vol: CATEGORIES.find(c => c.id === r[0]).vol
}));
/* ─── المشاريع والشركات: العمال والإنتاج ─── */
const BIZ_CAP = { 'مقهى': 5, 'متجر تجزئة': 8, 'مطعم': 10, 'مصنع': 20, 'شركة برمجة': 15, 'بنك': 25 }; // أقصى عدد عمال
const WORKER_OUTPUT = 0.40;   // إنتاج أول عامل = 40% من الدخل الأساسي بالساعة
const WORKER_DECAY = 0.95;    // كل عامل بعده ينتج 95% من سابقه (مردود يتناقص)
const WAGE_RATE = 0.10;       // راتب كل عامل بالساعة = 10% من الدخل الأساسي (يُخصم من الربح)
const HIRE_FEE_RATE = 0.02;   // رسوم توظيف العامل (مرة واحدة) = 2% من سعر المشروع
ITEMS.forEach(it => { if (it.cat === 7) { it.biz = true; it.maxWorkers = BIZ_CAP[it.name] || 10; } });
const itemById = id => ITEMS.find(i => i.id === Number(id)) || null;
const categoryById = id => CATEGORIES.find(c => c.id === Number(id)) || null;

/* ═══════════════════════════ الأسعار اليومية (حتمية) ═══════════════════════════ */
function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
}
function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const dayIndex = (now = Date.now()) => Math.floor(now / DAY);
const factorToday = (item, day = dayIndex()) => 1 + (mulberry32(hash(`${item.id}:${day}`))() * 2 - 1) * item.vol;
const priceNow = (item, day) => Math.max(1, Math.round(item.price * factorToday(item, day)));
const sellNow = (item, day) => Math.floor(priceNow(item, day) * SELL_RATE);
const changePct = (item, day) => Math.round((factorToday(item, day) - 1) * 100);
const incomePerHour = item => (item.rate ? Math.round(item.price * item.rate) : 0);
const bizOutput = (item, n) => { let k = 0; for (let i = 0; i < n; i++) k += WORKER_OUTPUT * Math.pow(WORKER_DECAY, i); return Math.round(incomePerHour(item) * k); };
const bizWages = (item, n) => Math.round(incomePerHour(item) * WAGE_RATE * n);
const bizRate = (item, n) => Math.max(0, incomePerHour(item) + bizOutput(item, n) - bizWages(item, n)); // الصافي بالساعة
const hireFee = item => Math.round(item.price * HIRE_FEE_RATE);
const nextWorkerGain = (item, n) => Math.round(incomePerHour(item) * (WORKER_OUTPUT * Math.pow(WORKER_DECAY, n) - WAGE_RATE));

/* ═══════════════════════════ البحث بالاسم أو الرقم ═══════════════════════════ */
const norm = s => String(s || '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '');
const stripAl = s => s.replace(/^ال/, '');

function findItems(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    if (/^\d+$/.test(q)) { const it = itemById(q); return it ? [it] : []; }
    for (const n of [norm(q), stripAl(norm(q))]) {
        if (!n) continue;
        const exact = ITEMS.filter(i => norm(i.name) === n || stripAl(norm(i.name)) === n);
        if (exact.length) return exact;
        const part = ITEMS.filter(i => norm(i.name).includes(n));
        if (part.length) return part;
    }
    return [];
}
function findCategory(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    if (/^\d+$/.test(q)) return categoryById(q);
    const n = norm(q);
    if (n.length < 3) return null;
    return CATEGORIES.find(c => norm(c.name) === n || norm(c.name).includes(n) || stripAl(n) === stripAl(norm(c.name))) || null;
}

/* ═══════════════════════════ بيانات المستخدم ═══════════════════════════ */
function loadUser(uid) {
    const d = states.getData(String(uid));
    const s = d.shop && typeof d.shop === 'object' ? d.shop : {};
    d.shop = Object.assign({ items: {}, lastCollect: Date.now(), pending: 0, investments: [], spent: 0, biz: {} }, s);
    if (!d.shop.biz || typeof d.shop.biz !== 'object') d.shop.biz = {};
    // تنظيف تلقائي: المخزون القديم يُعاد بناؤه من سجل المتجر (يزيل العناصر اليتيمة مثل #25)
    const clean = Object.keys(d.shop.items).filter(k => d.shop.items[k] > 0);
    const cur = Array.isArray(d.inventory) ? d.inventory.map(String) : [];
    if (JSON.stringify([...cur].sort()) !== JSON.stringify([...clean].sort())) {
        d.inventory = clean;
        try { states.saveData(String(uid), d); } catch (e) { /* يُحفظ لاحقًا عند أول عملية */ }
    }
    return d;
}
/** آخر فشل حفظ (يعرضه .فحص لمعرفة السبب الحقيقي) */
const lastSave = { error: null };
const sleepMs = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { /* تجاهل */ } };
/** يحفظ ثم يقرأ ما حُفظ ويقارنه (3 محاولات). يرجع true إذا تطابق الحفظ فعلًا، وإلا يسجّل السبب في lastSave */
function saveUser(uid, d) {
    d.inventory = Object.keys(d.shop.items).filter(k => d.shop.items[k] > 0);
    const want = JSON.stringify(d.shop.items);
    let why = '';
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) sleepMs(60);
        try { states.saveData(String(uid), d); } catch (e) { why = 'فشلت الكتابة: ' + e.message; continue; }
        let back;
        try { back = states.getAll()[String(uid)]; } catch (e) { why = 'فشلت القراءة: ' + e.message; continue; }
        if (!back) why = 'سجلك غير موجود بعد الحفظ';
        else if (back.points !== d.points) why = `الرصيد بعد الحفظ ${back.points} بدل ${d.points}`;
        else if (!back.shop) why = 'حقل shop مفقود بعد الحفظ';
        else if (JSON.stringify(back.shop.items) !== want) why = `الأغراض بعد الحفظ ${JSON.stringify(back.shop.items)} بدل ${want}`;
        else { lastSave.error = null; return true; }
    }
    lastSave.error = { at: Date.now(), why };
    return false;
}
const saveWhy = () => (lastSave.error ? `\nالسبب: ${lastSave.error.why}` : '');
const snapshot = d => JSON.stringify(d);                                       // لقطة قبل التعديل
const restore = (uid, snap) => states.saveData(String(uid), JSON.parse(snap)); // استرداد عند فشل الحفظ

const owned = (d, item) => d.shop.items[item.id] || 0;
const workersOf = (d, item) => ((d.shop.biz && d.shop.biz[item.id] && d.shop.biz[item.id].workers) | 0);
const ownedRate = d => Object.entries(d.shop.items).reduce((s, [id, q]) => {
    const it = itemById(id);
    if (!it) return s;
    if (it.biz) return s + bizRate(it, workersOf(d, it)) + Math.max(0, q - 1) * incomePerHour(it);
    return s + q * incomePerHour(it);
}, 0);
const assetsValue = (d, day) => Object.entries(d.shop.items).reduce((s, [id, q]) => { const it = itemById(id); return s + (it ? q * sellNow(it, day) : 0); }, 0);

/** يضيف الدخل المتراكم إلى pending ثم يصفّر العدّاد (قبل أي تغيير في الأغراض المدرّة للدخل) */
function accrue(d, now = Date.now()) {
    const s = d.shop, rate = ownedRate(d);
    const hours = Math.min(Math.max(0, (now - s.lastCollect) / HOUR), 24);
    if (rate > 0 && hours > 0) s.pending = Math.min(s.pending + Math.floor(rate * hours), rate * 24);
    s.lastCollect = now;
}
/** الدخل المنتظر التحصيل دون تعديل البيانات */
function pendingNow(d, now = Date.now()) {
    const rate = ownedRate(d);
    const hours = Math.min(Math.max(0, (now - d.shop.lastCollect) / HOUR), 24);
    return rate > 0 ? Math.min(d.shop.pending + Math.floor(rate * hours), rate * 24) : d.shop.pending;
}

/* ═══════════════════════════ الشراء والبيع والتحصيل ═══════════════════════════ */
function buy(d, item, qty, now = Date.now()) {
    if (!Number.isInteger(qty) || qty < 1) return { error: 'الكمية غير صحيحة' };
    if (owned(d, item) >= MAX_OWNED) return { error: `تملك ${item.emoji} ${item.name} بالفعل، كل غرض يُشترى مرة واحدة فقط` };
    if (qty > MAX_BUY) return { error: 'كل غرض يُشترى مرة واحدة فقط (بدون كميات)' };
    const cost = priceNow(item, dayIndex(now)) * qty;
    if (d.points < cost) return { error: `رصيدك ${d.points.toLocaleString('en-US')} لا يكفي، المطلوب ${cost.toLocaleString('en-US')}`, cost };
    accrue(d, now);
    d.points -= cost;
    d.shop.items[item.id] = owned(d, item) + qty;
    d.shop.spent += cost;
    return { cost };
}
function sell(d, item, qty, now = Date.now()) {
    const have = owned(d, item);
    if (!have) return { error: 'لا تملك هذا الغرض' };
    if (qty === 'all') qty = have;
    if (!Number.isInteger(qty) || qty < 1) return { error: 'الكمية غير صحيحة' };
    if (qty > have) return { error: `تملك ${have} فقط` };
    accrue(d, now);
    const gain = sellNow(item, dayIndex(now)) * qty;
    d.points += gain;
    d.shop.items[item.id] = have - qty;
    if (d.shop.items[item.id] <= 0) { delete d.shop.items[item.id]; if (d.shop.biz) delete d.shop.biz[item.id]; } // بيع المشروع يُنهي عمله وعماله
    return { gain, left: have - qty, sold: qty };
}
function collectIncome(d, now = Date.now()) {
    accrue(d, now);
    const amount = Math.floor(d.shop.pending);
    d.shop.pending = 0;
    d.points += amount;
    return { amount, rate: ownedRate(d) };
}

/* ═══════════════════════════ العمال (المصانع والشركات) ═══════════════════════════ */
function hire(d, item, n, now = Date.now()) {
    if (!item.biz) return { error: 'العمال للمصانع والشركات فقط (القسم 7)' };
    if (!owned(d, item)) return { error: `لا تملك ${item.emoji} ${item.name}، اشتره أولًا` };
    if (!Number.isInteger(n) || n < 1) return { error: 'عدد العمال غير صحيح' };
    const w = workersOf(d, item);
    if (w + n > item.maxWorkers) return { error: `أقصى عدد عمال في ${item.name} هو ${item.maxWorkers} (لديك ${w})` };
    const cost = hireFee(item) * n;
    if (d.points < cost) return { error: `رسوم التوظيف ${cost.toLocaleString('en-US')} ورصيدك ${d.points.toLocaleString('en-US')}` };
    accrue(d, now);
    d.points -= cost;
    d.shop.biz[item.id] = { workers: w + n };
    return { cost, workers: w + n, net: bizRate(item, w + n) };
}
function fire(d, item, n, now = Date.now()) {
    if (!item.biz) return { error: 'العمال للمصانع والشركات فقط (القسم 7)' };
    const w = workersOf(d, item);
    if (!w) return { error: `لا يوجد عمال في ${item.name}` };
    if (n === 'all') n = w;
    if (!Number.isInteger(n) || n < 1) return { error: 'عدد العمال غير صحيح' };
    if (n > w) return { error: `لديك ${w} عمال فقط` };
    accrue(d, now);
    if (w - n > 0) d.shop.biz[item.id] = { workers: w - n }; else delete d.shop.biz[item.id];
    return { fired: n, workers: w - n, net: bizRate(item, w - n) };
}

/* ═══════════════════════════ الاستثمار ═══════════════════════════ */
const PLANS = [
    { id: 1, emoji: '🏦', name: 'وديعة بنكية',     hours: 2,  min: 100,  max: 500000,  risk: 'بدون مخاطرة', desc: 'ربح ثابت +2%',
      roll: () => 0.02 },
    { id: 2, emoji: '🏘️', name: 'صندوق عقاري',    hours: 6,  min: 1000, max: 5000000, risk: 'منخفضة',      desc: 'ربح من +4% إلى +7%',
      roll: () => 0.04 + Math.random() * 0.03 },
    { id: 3, emoji: '📈', name: 'الأسهم',          hours: 2,  min: 500,  max: 2000000, risk: 'متوسطة',      desc: 'من -12% إلى +18%',
      roll: () => -0.12 + Math.random() * 0.30 },
    { id: 4, emoji: '🪙', name: 'العملات الرقمية', hours: 3,  min: 500,  max: 1000000, risk: 'عالية',       desc: 'خسارة حتى -60% أو ربح حتى +80%',
      roll: () => (Math.random() < 0.5 ? -(0.15 + Math.random() * 0.45) : 0.10 + Math.random() * 0.70) },
    { id: 5, emoji: '🚀', name: 'مشروع ناشئ',      hours: 12, min: 1000, max: 500000,  risk: 'عالية جدًا',  desc: '40% احتمال الفشل (-100%)، وإلا ربح +50% إلى +120%',
      roll: () => (Math.random() < 0.4 ? -1 : 0.5 + Math.random() * 0.7) }
];
const planById = id => PLANS.find(p => p.id === Number(id)) || null;

function invest(d, plan, amount, now = Date.now()) {
    if (d.shop.investments.length >= MAX_ACTIVE_INVEST) return { error: `وصلت للحد الأقصى (${MAX_ACTIVE_INVEST} استثمارات نشطة)` };
    if (!Number.isInteger(amount) || amount < plan.min) return { error: `أقل مبلغ لهذه الخطة ${plan.min.toLocaleString('en-US')}` };
    if (amount > plan.max) return { error: `أقصى مبلغ لهذه الخطة ${plan.max.toLocaleString('en-US')}` };
    if (amount > d.points) return { error: `رصيدك ${d.points.toLocaleString('en-US')} لا يكفي` };
    d.points -= amount;
    d.shop.investments.push({ plan: plan.id, amount, startAt: now, endAt: now + plan.hours * HOUR, pct: plan.roll() });
    return { endAt: now + plan.hours * HOUR };
}
/** يسحب الاستثمارات التي استحقت فقط */
function collectInvestments(d, now = Date.now()) {
    const done = [], keep = [];
    for (const inv of d.shop.investments) (inv.endAt <= now ? done : keep).push(inv);
    d.shop.investments = keep;
    const results = done.map(inv => {
        const payout = Math.max(0, Math.floor(inv.amount * (1 + inv.pct)));
        d.points += payout;
        return { plan: planById(inv.plan), amount: inv.amount, payout, pct: Math.round(inv.pct * 100) };
    });
    return { results, total: results.reduce((s, r) => s + r.payout, 0), invested: results.reduce((s, r) => s + r.amount, 0) };
}

/** كل ما سبق، مُصدَّر للاختبار ولأوامر أخرى (مثل .فحص) */
const S = {
    CATEGORIES, ITEMS, PLANS, SELL_RATE, MAX_BUY, MAX_OWNED, MAX_ACTIVE_INVEST,
    itemById, categoryById, planById, findItems, findCategory,
    dayIndex, priceNow, sellNow, changePct, incomePerHour, factorToday,
    lastSave, loadUser, saveUser, snapshot, restore, owned, ownedRate, assetsValue, accrue, pendingNow,
    buy, sell, collectIncome, invest, collectInvestments,
    workersOf, bizRate, bizOutput, bizWages, hireFee, nextWorkerGain, hire, fire
};

/* ═══════════════════════════════════════════════════════════════════
 *                       الواجهة: ردود الأوامر
 * ═══════════════════════════════════════════════════════════════════ */
const arrow = p => (p > 0 ? `▲${p}%` : p < 0 ? `▼${Math.abs(p)}%` : '▬0%');

const incText = (it, helpers) => it.biz
    ? `🏭 دخل أساسي ${helpers.fmt(incomePerHour(it))}/ساعة + عمال (حتى ${it.maxWorkers})`
    : `🏠 دخل ${helpers.fmt(incomePerHour(it))}/ساعة`;

function itemLine(it, helpers) {
    const price = priceNow(it), inc = incomePerHour(it);
    return `[${it.id}] ${it.emoji} ${it.name}\n`
        + `      💰 ${helpers.fmt(price)} ${arrow(changePct(it))} | بيع ${helpers.fmt(sellNow(it))}`
        + (inc ? `\n      ${incText(it, helpers)}` : '');
}

/* ═══════════ التصفّح بالرد على الرسائل (أقسام ← أغراض ← شراء/بيع) ═══════════ */
const SESSION_TTL = 15 * 60 * 1000;   // الجلسة تنتهي بعد 15 دقيقة
const sessions = new Map();           // معرّف رسالة البوت ← { uid, step, cat, item, at }
function remember(info, data) {
    if (!info || !info.messageID || info.messageID === 'sent') return; // وضع official لا يدعم الرد
    const now = Date.now();
    for (const [k, v] of sessions) if (now - v.at > SESSION_TTL) sessions.delete(k);
    if (sessions.size > 500) sessions.delete(sessions.keys().next().value);
    sessions.set(String(info.messageID), Object.assign({ at: now }, data));
}
const toLatinDigits = t => String(t || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));

function catsView(d, helpers, deco) {
    const lines = CATEGORIES.map(c => `[${c.id}] ${c.emoji} ${c.name}`);
    return deco.infoBox('🛒 المتجر',
        `💰 رصيدك: ${helpers.fmt(d.points)}\n\n${lines.join('\n')}\n\n↩️ رد برقم القسم\n💵 بيع | 💹 استثمار | 🎒 حقيبتي`);
}
function itemsView(cat, helpers, deco) {
    const lines = ITEMS.filter(i => i.cat === cat.id).map(i =>
        `[${i.id}] ${i.emoji} ${i.name} — ${helpers.fmt(priceNow(i))} ${arrow(changePct(i))}${incomePerHour(i) ? ' 🏠' : ''}`);
    return deco.infoBox(`${cat.emoji} ${cat.name}`, `${lines.join('\n')}\n\n↩️ رد برقم الغرض\n⬅️ رجوع`);
}
function itemView(it, d, helpers, deco) {
    const inc = incomePerHour(it);
    return deco.infoBox(`${it.emoji} ${it.name}`, [
        `💰 الشراء: ${helpers.fmt(priceNow(it))} ${arrow(changePct(it))}`,
        `💵 البيع: ${helpers.fmt(sellNow(it))}`,
        inc ? incText(it, helpers) : null,
        `🎒 ${owned(d, it) ? '✅ تملكه' : 'لا تملكه'} | 💼 رصيدك: ${helpers.fmt(d.points)}`,
        '',
        '↩️ رد: شراء | بيع (كل غرض يُشترى مرة واحدة)',
        '⬅️ رجوع'
    ].filter(x => x !== null).join('\n'));
}

/** تنفيذ شراء/بيع كامل مع الحفظ والتحقق (يُستخدم من الرد على الرسائل) */
function txBuy(uid, it, qty, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    const res = buy(d, it, qty);
    if (res.error) return { error: res.error };
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ الشراء فلم يُخصم شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    const inc = incomePerHour(it) * qty;
    return { d, text: `🛍️ اشتريت ${it.emoji} ${it.name}\n💸 ${helpers.fmt(res.cost)} | 💰 رصيدك: ${helpers.fmt(d.points)}`
        + (inc ? `\n🏠 +${helpers.fmt(inc)}/ساعة` : '')
        + (it.biz ? `\n👷 وظّف عمالًا لزيادة الإنتاج: رد على 💹 استثمار ← أعمالي، أو اكتب وظف ${it.id}` : '') };
}
function txSell(uid, it, qty, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    const res = sell(d, it, qty);
    if (res.error) return { error: res.error };
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ البيع فلم يتغير شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    return { d, text: `💵 بعت ${res.sold} × ${it.emoji} ${it.name}\n💰 قبضت: ${helpers.fmt(res.gain)} | رصيدك: ${helpers.fmt(d.points)}\n🎒 المتبقي: ${res.left}` + (it.biz ? '\n⚠️ بيع المشروع أنهى عمل عماله' : '') };
}

/* ═══════════ البيع والاستثمار بالرد ═══════════ */
function sellView(d, helpers, deco, note) {
    const rows = ITEMS.filter(i => owned(d, i) > 0)
        .map(i => `[${i.id}] ${i.emoji} ${i.name} ×${owned(d, i)} — 💵 ${helpers.fmt(sellNow(i))}`);
    return deco.infoBox('💵 البيع', [
        note || null,
        note ? '' : null,
        `💼 رصيدك: ${helpers.fmt(d.points)}`,
        '',
        rows.length ? rows.join('\n') : '🎒 حقيبتك فارغة.',
        '',
        rows.length ? '↩️ رد: رقم [كمية|الكل]  (مثال: 26 الكل)\n🧹 رد: بيع الكل = بيع كل الحقيبة' : null,
        '⬅️ رجوع'
    ].filter(x => x !== null).join('\n'));
}
function bizOwned(d) { return ITEMS.filter(i => i.biz && owned(d, i) > 0); }
function bizListView(d, helpers, deco, note) {
    const list = bizOwned(d);
    const rows = list.map(i => {
        const w = workersOf(d, i);
        return `[${i.id}] ${i.emoji} ${i.name} — 👷 ${w}/${i.maxWorkers} | ✅ ${helpers.fmt(bizRate(i, w))}/ساعة`;
    });
    return deco.infoBox('🏭 أعمالك', [
        note || null,
        note ? '' : null,
        `💰 رصيدك: ${helpers.fmt(d.points)}`,
        '',
        rows.length ? rows.join('\n') : '🏢 لا تملك مصنعًا أو شركة بعد.\n🛒 اشترِ من قسم «مشاريع وشركات»: متجر 7',
        '',
        rows.length ? '↩️ رد برقم المشروع لإدارة عماله\n⚡ أو: وظف <رقم> [عدد] | سرح <رقم> [عدد|الكل]' : null,
        '⬅️ رجوع'
    ].filter(x => x !== null).join('\n'));
}
function bizItemView(it, d, helpers, deco, note) {
    const w = workersOf(d, it), base = incomePerHour(it);
    const out = bizOutput(it, w), wages = bizWages(it, w), net = bizRate(it, w);
    const nextGain = w < it.maxWorkers ? nextWorkerGain(it, w) : null;
    return deco.infoBox(`${it.emoji} ${it.name}`, [
        note || null,
        note ? '' : null,
        `👷 العمال: ${w}/${it.maxWorkers}`,
        `🏗️ الدخل الأساسي: ${helpers.fmt(base)}/ساعة`,
        `📦 إنتاج العمال: +${helpers.fmt(out)}/ساعة`,
        `💸 الرواتب: -${helpers.fmt(wages)}/ساعة (${helpers.fmt(Math.round(base * WAGE_RATE))} لكل عامل)`,
        `✅ الصافي: ${helpers.fmt(net)}/ساعة`,
        '',
        nextGain === null ? '🔒 وصلت للحد الأقصى من العمال'
            : `➕ العامل القادم: رسوم ${helpers.fmt(hireFee(it))} (مرة واحدة)، ويضيف ${nextGain >= 0 ? '+' : ''}${helpers.fmt(nextGain)}/ساعة صافي`,
        `💼 رصيدك: ${helpers.fmt(d.points)}`,
        '',
        '↩️ رد: وظف [عدد] | سرح [عدد|الكل]',
        '⬅️ رجوع'
    ].filter(x => x !== null).join('\n'));
}
function txHire(uid, it, n, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    const r = hire(d, it, n);
    if (r.error) return { error: r.error };
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ التوظيف فلم يُخصم شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    return { text: `👷 وظّفت ${n} في ${it.emoji} ${it.name}\n💸 الرسوم: ${helpers.fmt(r.cost)}\n👷 العمال الآن: ${r.workers}/${it.maxWorkers} | ✅ الصافي: ${helpers.fmt(r.net)}/ساعة` };
}
function txFire(uid, it, n, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    const r = fire(d, it, n);
    if (r.error) return { error: r.error };
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ التسريح فلم يتغير شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    return { text: `🚪 سرّحت ${r.fired} من ${it.emoji} ${it.name}\n👷 العمال الآن: ${r.workers}/${it.maxWorkers} | ✅ الصافي: ${helpers.fmt(r.net)}/ساعة` };
}

function investView(d, helpers, deco, note) {
    const now = Date.now();
    const plans = PLANS.map(x => `[${x.id}] ${x.emoji} ${x.name} — ⏳${x.hours}س | ⚠️ ${x.risk}`);
    const mine = d.shop.investments.map((v, i) => {
        const pl = planById(v.plan);
        return `${i + 1}) ${pl.emoji} ${pl.name} ${helpers.fmt(v.amount)} — ${v.endAt <= now ? '✅ جاهز' : '⏳ ' + helpers.msToTime(v.endAt - now)}`;
    });
    return deco.infoBox('💹 الاستثمار', [
        note || null,
        note ? '' : null,
        `💰 رصيدك: ${helpers.fmt(d.points)}`,
        '',
        plans.join('\n'),
        `[6] 🏭 أعمالي — ${bizOwned(d).length} مشروع (عمال وإنتاج)`,
        mine.length ? `\n📂 استثماراتك (${mine.length}/${MAX_ACTIVE_INVEST}):\n${mine.join('\n')}` : null,
        '',
        '↩️ رد برقم الخطة (6 = أعمالي)' + (mine.length ? ' | سحب' : ''),
        '⬅️ رجوع'
    ].filter(x => x !== null).join('\n'));
}
function planView(plan, d, helpers, deco) {
    return deco.infoBox(`${plan.emoji} ${plan.name}`, [
        `⏳ المدة: ${plan.hours} ساعة`,
        `📊 ${plan.desc}`,
        `⚠️ المخاطرة: ${plan.risk}`,
        `📏 الحدود: ${helpers.fmt(plan.min)} ~ ${helpers.fmt(plan.max)}`,
        `💰 رصيدك: ${helpers.fmt(d.points)}`,
        '',
        '↩️ رد بالمبلغ (5000 أو 5k أو 2m) أو الكل',
        '⬅️ رجوع'
    ].join('\n'));
}
/** 5000 | 5k | 5ك | 2m | 2م | الكل */
function parseAmount(text, plan, d) {
    const t = String(text).replace(/[,،\s]/g, '').toLowerCase();
    if (t === 'الكل') return Math.min(d.points, plan.max);
    const m = /^(\d{1,9}(?:\.\d+)?)([kكmم]?)$/.exec(t);
    if (!m) return NaN;
    const mult = m[2] === 'k' || m[2] === 'ك' ? 1e3 : (m[2] === 'm' || m[2] === 'م' ? 1e6 : 1);
    return Math.floor(parseFloat(m[1]) * mult);
}
/** بيع كل ما في الحقيبة دفعة واحدة */
function txSellAll(uid, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    let total = 0, count = 0;
    for (const it of ITEMS) {
        if (owned(d, it) <= 0) continue;
        const r = sell(d, it, 'all');
        if (!r.error) { total += r.gain; count += r.sold; }
    }
    if (!count) return { error: 'حقيبتك فارغة' };
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ البيع فلم يتغير شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    return { text: `💵 بعت ${count} غرض وقبضت ${helpers.fmt(total)}` };
}
function txInvest(uid, plan, amount, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    const res = invest(d, plan, amount);
    if (res.error) return { error: res.error };
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ الاستثمار فلم يُخصم شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    return { text: `${plan.emoji} استثمرت ${helpers.fmt(amount)} في ${plan.name}\n⏳ الاستحقاق بعد ${plan.hours} ساعة | ⚠️ ${plan.risk}` };
}
function txWithdraw(uid, helpers, p) {
    const d = loadUser(uid), snap = snapshot(d);
    const r = collectInvestments(d);
    if (!r.results.length) {
        const wait = d.shop.investments.length ? Math.min(...d.shop.investments.map(v => v.endAt)) - Date.now() : 0;
        return { error: d.shop.investments.length ? `لا يوجد استثمار جاهز، أقرب موعد بعد ${helpers.msToTime(wait)}` : 'ليس لديك استثمارات' };
    }
    if (!saveUser(uid, d)) { restore(uid, snap); return { error: `تعذّر حفظ السحب فلم يتغير شيء. أرسل ${p}فحص (للمطور).${saveWhy()}` }; }
    const net = r.total - r.invested;
    return { text: r.results.map(x => `${x.plan.emoji} ${helpers.fmt(x.amount)} ➜ ${helpers.fmt(x.payout)} (${x.pct >= 0 ? '+' : ''}${x.pct}%)`).join('\n')
        + `\n${net >= 0 ? '🎉 صافي الربح' : '📉 صافي الخسارة'}: ${net >= 0 ? '+' : ''}${helpers.fmt(net)}` };
}

/* ─── .متجر ─── */
async function showShop({ api, event, helpers, deco, cfg }, args) {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const q = args.join(' ').trim();

    if (!q) {
        const info = await reply(catsView(loadUser(event.senderID), helpers, deco));
        remember(info, { uid: String(event.senderID), step: 'cats' });
        return info;
    }

    const cat = findCategory(q);
    if (cat) {
        const items = ITEMS.filter(i => i.cat === cat.id);
        return reply(deco.infoBox(`${cat.emoji} ${cat.name}`,
            items.map(i => itemLine(i, helpers)).join('\n') + `\n\n🛍️ ${p}شراء <رقم الغرض>`));
    }

    const found = findItems(q);
    if (!found.length) return reply(deco.warning(`لا يوجد قسم أو غرض باسم «${q}»\nاكتب ${p}متجر لعرض الأقسام`));
    if (found.length > 1) {
        return reply(deco.infoBox('🔎 نتائج البحث',
            found.slice(0, 8).map(i => `[${i.id}] ${i.emoji} ${i.name} — 💰 ${helpers.fmt(priceNow(i))}`).join('\n')
            + `\n\n💡 اكتب الرقم أو اسمًا أدق`));
    }
    const it = found[0];
    const d = loadUser(event.senderID);
    const inc = incomePerHour(it);
    return reply(deco.infoBox(`${it.emoji} ${it.name}`, [
        `🔢 الرقم: ${it.id}`,
        `📁 القسم: ${categoryById(it.cat).emoji} ${categoryById(it.cat).name}`,
        `💰 سعر اليوم: ${helpers.fmt(priceNow(it))} ${arrow(changePct(it))}`,
        `💵 سعر البيع: ${helpers.fmt(sellNow(it))}`,
        inc ? incText(it, helpers) : null,
        `🎒 ${owned(d, it) ? '✅ تملكه' : 'لا تملكه'}`,
        '',
        `🛍️ ${p}شراء ${it.id}`
    ].filter(x => x !== null).join('\n')));
}

/* ─── .شراء ─── */
async function doBuy({ api, event, helpers, deco, cfg }, args) {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    let qty = 1; const words = [...args];
    if (words.length > 1 && /^\d{1,3}$/.test(words[words.length - 1])) qty = parseInt(words.pop(), 10);
    const query = words.join(' ').trim();
    if (!query) return reply(deco.warning(`الاستخدام: ${p}شراء <رقم أو اسم الغرض>\nمثال: ${p}شراء قطة\n(كل غرض يُشترى مرة واحدة فقط)\nتصفّح الأغراض بـ ${p}متجر`));

    const found = findItems(query);
    if (!found.length) return reply(deco.warning(`لا يوجد غرض باسم «${query}»\nاكتب ${p}متجر لعرض الأقسام`));
    if (found.length > 1) {
        return reply(deco.infoBox('🔎 أي غرض تقصد؟',
            found.slice(0, 8).map(i => `[${i.id}] ${i.emoji} ${i.name} — 💰 ${helpers.fmt(priceNow(i))}`).join('\n')
            + `\n\n💡 اكتب الرقم: ${p}شراء <الرقم>`));
    }

    const it = found[0];
    const d = loadUser(event.senderID);
    const snap = snapshot(d);
    const res = buy(d, it, qty);
    if (res.error) return reply(deco.errorBox(res.error));
    if (!saveUser(event.senderID, d)) { // لم يُحفظ كما يجب: نسترد النقاط ولا نكمل الشراء
        restore(event.senderID, snap);
        return reply(deco.errorBox(`تعذّر حفظ الشراء في ملف البيانات فلم يُخصم شيء. أرسل ${p}فحص (للمطور) لمعرفة السبب.${saveWhy()}`));
    }
    const inc = incomePerHour(it) * qty;
    return reply(deco.success(
        `🛍️ اشتريت ${it.emoji} ${it.name}\n💸 دفعت: ${helpers.fmt(res.cost)}\n💰 رصيدك: ${helpers.fmt(d.points)}`
        + (inc ? `\n🏠 دخل إضافي: +${helpers.fmt(inc)}/ساعة (اكتب ${p}تحصيل)` : '')
        + (it.biz ? `\n👷 وظّف عمالًا لزيادة الإنتاج: ${p}وظف ${it.id} [عدد]` : '')));
}

/* ─── .بيع ─── */
async function doSell({ api, event, helpers, deco, cfg }, args) {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    let qty = 1; const words = [...args];
    const last = words[words.length - 1];
    if (words.length > 1 && (/^\d{1,3}$/.test(last) || last === 'الكل')) {
        words.pop();
        qty = last === 'الكل' ? 'all' : parseInt(last, 10);
    }
    const query = words.join(' ').trim();
    if (!query) {
        const info = await reply(sellView(loadUser(event.senderID), helpers, deco));
        remember(info, { uid: String(event.senderID), step: 'sell' });
        return info;
    }

    const found = findItems(query);
    if (!found.length) return reply(deco.warning(`لا يوجد غرض باسم «${query}»`));
    const d = loadUser(event.senderID);
    const mine = found.filter(i => owned(d, i) > 0); // عند تعدد النتائج نفضّل ما يملكه المستخدم
    const pool = mine.length ? mine : found;
    if (pool.length > 1) {
        return reply(deco.infoBox('🔎 أي غرض تقصد؟',
            pool.slice(0, 8).map(i => `[${i.id}] ${i.emoji} ${i.name} — تملك ${owned(d, i)}`).join('\n') + `\n\n💡 اكتب الرقم: ${p}بيع <الرقم>`));
    }

    const it = pool[0];
    const snap = snapshot(d);
    const res = sell(d, it, qty);
    if (res.error) return reply(deco.errorBox(res.error));
    if (!saveUser(event.senderID, d)) {
        restore(event.senderID, snap);
        return reply(deco.errorBox(`تعذّر حفظ عملية البيع في ملف البيانات فلم يتغير شيء. أرسل ${p}فحص (للمطور) لمعرفة السبب.${saveWhy()}`));
    }
    return reply(deco.success(
        `💵 بعت ${res.sold} × ${it.emoji} ${it.name}\n💰 قبضت: ${helpers.fmt(res.gain)}\n💼 رصيدك: ${helpers.fmt(d.points)}\n🎒 المتبقي: ${res.left}` + (it.biz ? '\n⚠️ بيع المشروع أنهى عمل عماله' : '')));
}

/* ─── .حقيبتي ─── */
async function showBag({ api, event, helpers, deco, cfg }) {
    const p = cfg.getPrefix();
    const d = loadUser(event.senderID);
    const rows = [];
    for (const c of CATEGORIES) {
        const mine = ITEMS.filter(i => i.cat === c.id && owned(d, i) > 0);
        if (!mine.length) continue;
        rows.push(`${c.emoji} ${c.name}`);
        for (const i of mine) {
            rows.push(`   ${i.emoji} ${i.name} ×${owned(d, i)} — 💵 ${helpers.fmt(sellNow(i) * owned(d, i))}`);
            if (i.biz) rows.push(`      👷 ${workersOf(d, i)}/${i.maxWorkers} | ✅ صافي ${helpers.fmt(bizRate(i, workersOf(d, i)))}/ساعة`);
        }
    }
    const rate = ownedRate(d), pend = pendingNow(d);
    const active = d.shop.investments.length;
    const ready = d.shop.investments.filter(v => v.endAt <= Date.now()).length;

    const lines = [
        `💰 رصيدك: ${helpers.fmt(d.points)}`,
        `🏷️ قيمة أغراضك (بسعر البيع): ${helpers.fmt(assetsValue(d))}`,
        rate ? `🏠 دخلك: ${helpers.fmt(rate)}/ساعة | بانتظار التحصيل: ${helpers.fmt(pend)}` : null,
        active ? `💹 استثمارات نشطة: ${active}${ready ? ` (✅ ${ready} جاهز للسحب)` : ''}` : null,
        ''
    ].filter(x => x !== null);
    lines.push(...(rows.length ? rows : ['🎒 حقيبتك فارغة.', `🛒 ابدأ بـ ${p}متجر`]));

    // عدم تطابق: المخزون يذكر أغراضًا ليست في سجل المتجر (بيانات قديمة أو خلل حفظ)
    const stray = (Array.isArray(d.inventory) ? d.inventory : []).filter(id => !(id in d.shop.items));
    if (stray.length) {
        lines.push('', `⚠️ في "المخزون" ${stray.length} عنصر غير موجود في سجل المتجر (${stray.slice(0, 5).join('، ')})`,
            `ℹ️ اشترِ أو بِع أي غرض مرة واحدة لتصحيح السجل، وإن تكرر الأمر أرسل ${p}فحص.`);
    }
    lines.push('', `🩺 ${os.hostname()} #${process.pid}`); // بصمة النسخة: رقمان مختلفان = نسختان تعملان معًا
    return helpers.reply(api, event, deco.infoBox('🎒 حقيبتك', lines.join('\n')));
}

/* ─── .تحصيل ─── */
async function doCollect({ api, event, helpers, deco, cfg }) {
    const d = loadUser(event.senderID);
    if (!ownedRate(d) && !d.shop.pending) {
        return helpers.reply(api, event, deco.warning(`لا تملك أغراضًا مدرّة للدخل.\nاشترِ عقارًا أو مشروعًا: ${cfg.getPrefix()}متجر 6`));
    }
    const res = collectIncome(d);
    saveUser(event.senderID, d);
    if (!res.amount) return helpers.reply(api, event, deco.warning(`لا يوجد دخل جاهز بعد، دخلك ${helpers.fmt(res.rate)}/ساعة.`));
    return helpers.reply(api, event, deco.success(
        `🏠 قبضت ${helpers.fmt(res.amount)} نقطة\n📈 دخلك: ${helpers.fmt(res.rate)}/ساعة (يتراكم حتى 24 ساعة)\n💰 رصيدك: ${helpers.fmt(d.points)}`));
}

/* ─── .استثمار ─── */
async function doInvest({ api, event, helpers, deco, cfg }, args) {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const d = loadUser(event.senderID);
    const now = Date.now();

    if (BIZ_WORDS.includes(String(args[0] || '').toLowerCase()) || String(args[0]) === '6') { // أعمالي
        const info = await reply(bizListView(d, helpers, deco));
        remember(info, { uid: String(event.senderID), step: 'biz' });
        return info;
    }

    if (['سحب', 'withdraw', 'استلام'].includes(args[0])) { // سحب ما استحق
        const r = collectInvestments(d, now);
        if (!r.results.length) {
            const wait = d.shop.investments.length ? Math.min(...d.shop.investments.map(v => v.endAt)) - now : 0;
            return reply(deco.warning(d.shop.investments.length ? `لا يوجد استثمار جاهز بعد، أقرب موعد بعد ${helpers.msToTime(wait)}` : 'ليس لديك استثمارات.'));
        }
        saveUser(event.senderID, d);
        const net = r.total - r.invested;
        return reply(deco.infoBox('💹 نتائج استثماراتك',
            r.results.map(x => `${x.plan.emoji} ${x.plan.name}: ${helpers.fmt(x.amount)} ➜ ${helpers.fmt(x.payout)} (${x.pct >= 0 ? '+' : ''}${x.pct}%)`).join('\n')
            + `\n\n${net >= 0 ? '🎉 صافي الربح' : '📉 صافي الخسارة'}: ${net >= 0 ? '+' : ''}${helpers.fmt(net)}\n💰 رصيدك: ${helpers.fmt(d.points)}`));
    }

    if (args.length >= 2) { // استثمار جديد
        const plan = planById(args[0]);
        if (!plan) return reply(deco.warning(`رقم الخطة غير صحيح (1 إلى ${PLANS.length})`));
        const amount = args[1] === 'الكل' ? Math.min(d.points, plan.max) : (/^\d{1,9}$/.test(args[1]) ? parseInt(args[1], 10) : NaN);
        const res = invest(d, plan, amount, now);
        if (res.error) return reply(deco.errorBox(res.error));
        saveUser(event.senderID, d);
        return reply(deco.success(
            `${plan.emoji} استثمرت ${helpers.fmt(amount)} في ${plan.name}\n⏳ الاستحقاق بعد ${plan.hours} ساعة\n⚠️ المخاطرة: ${plan.risk}\n💰 رصيدك: ${helpers.fmt(d.points)}\n\nللسحب عند الاستحقاق: ${p}استثمار سحب`));
    }

    const info = await reply(investView(d, helpers, deco));
    remember(info, { uid: String(event.senderID), step: 'inv' });
    return info;
}

/* ─── .اعمالي ─── */
async function doBiz({ api, event, helpers, deco }) {
    const info = await helpers.reply(api, event, bizListView(loadUser(event.senderID), helpers, deco));
    remember(info, { uid: String(event.senderID), step: 'biz' });
    return info;
}

/** يحدد المشروع المقصود من بين ما يملكه المستخدم: [item] أو { msg } */
function pickBiz(d, query, p, cmdWord) {
    const found = findItems(query).filter(i => i.biz);
    if (!found.length) return { msg: `«${query}» ليس مصنعًا أو شركة. المشاريع: ${ITEMS.filter(i => i.biz).map(i => `${i.id}=${i.name}`).join('، ')}` };
    const mine = found.filter(i => owned(d, i) > 0);
    if (!mine.length) return { msg: `لا تملك ${found.map(i => i.name).join(' / ')}. اشتره أولًا: ${p}شراء ${found[0].id}` };
    if (mine.length > 1) return { msg: `أي مشروع؟ ${mine.map(i => `[${i.id}] ${i.name}`).join(' | ')}\n💡 ${p}${cmdWord} <الرقم>` };
    return { item: mine[0] };
}

/* ─── .وظف ─── */
async function doHire({ api, event, helpers, deco, cfg }, args) {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    let n = 1; const words = [...args];
    if (words.length > 1 && /^\d{1,3}$/.test(words[words.length - 1])) n = parseInt(words.pop(), 10);
    const query = words.join(' ').trim();
    if (!query) return doBiz({ api, event, helpers, deco });
    const d = loadUser(event.senderID);
    const pk = pickBiz(d, query, p, 'وظف');
    if (pk.msg) return reply(deco.warning(pk.msg));
    const r = txHire(event.senderID, pk.item, n, helpers, p);
    if (r.error) return reply(deco.errorBox(r.error));
    return reply(deco.success(r.text));
}

/* ─── .سرح ─── */
async function doFire({ api, event, helpers, deco, cfg }, args) {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    let n = 1; const words = [...args];
    const last = words[words.length - 1];
    if (words.length > 1 && (/^\d{1,3}$/.test(last) || last === 'الكل')) { words.pop(); n = last === 'الكل' ? 'all' : parseInt(last, 10); }
    const query = words.join(' ').trim();
    if (!query) return doBiz({ api, event, helpers, deco });
    const d = loadUser(event.senderID);
    const pk = pickBiz(d, query, p, 'سرح');
    if (pk.msg) return reply(deco.warning(pk.msg));
    const r = txFire(event.senderID, pk.item, n, helpers, p);
    if (r.error) return reply(deco.errorBox(r.error));
    return reply(deco.success(r.text));
}

/* ═══════════════════════════ التوجيه: أي أمر كُتب؟ ═══════════════════════════ */
// الكلمات التي تقود لكل إجراء (الاسم الرئيسي + الاختصارات)
const ACTIONS = {
    buy:     ['شراء', 'buy', 'اشتري'],
    sell:    ['بيع', 'sell'],
    bag:     ['حقيبتي', 'حقيبة', 'bag', 'اغراضي'],
    collect: ['تحصيل', 'collect', 'ايجار'],
    invest:  ['استثمار', 'invest', 'استثمر'],
    biz:     ['اعمالي', 'أعمالي', 'شركاتي', 'مصانعي', 'مشاريعي'],
    hire:    ['وظف', 'وظّف', 'توظيف', 'hire'],
    fire:    ['سرح', 'سرّح', 'فصل', 'fire']
};
const BIZ_WORDS = ['اعمال', 'أعمال', 'اعمالي', 'أعمالي', 'شركات', 'شركاتي', 'مصانع', 'مصانعي', 'biz'];
const HANDLERS = { buy: doBuy, sell: doSell, bag: showBag, collect: doCollect, invest: doInvest, biz: doBiz, hire: doHire, fire: doFire };
const BROWSE_WORDS = ['متجر', 'shop', 'المتجر', 'سوق'];
const actionOf = word => Object.keys(ACTIONS).find(k => ACTIONS[k].includes(word)) || null;

module.exports.config = {
    name: 'متجر',
    aliases: [...BROWSE_WORDS.slice(1), ...Object.values(ACTIONS).flat()],
    description: `المتجر الكبير (${ITEMS.length} غرضًا، كل غرض مرة واحدة): شراء وبيع وحقيبتي وتحصيل واستثمار وعمال المصانع والشركات`,
    usage: 'متجر [قسم | غرض | شراء | بيع | حقيبتي | تحصيل | استثمار | اعمالي | وظف | سرح]',
    category: 'economy', cooldown: 1, adminOnly: false
};

/* ═══════════ معالج الردود على رسائل المتجر ═══════════ */
const BACK = ['رجوع', 'القائمة', 'قائمة', 'الأقسام', 'الاقسام', 'back', '0'];
module.exports.onMessage = async ctx => {
    const { api, event, helpers, deco, cfg } = ctx;
    if (event.type !== 'message_reply' || !event.messageReply) return false;
    const key = String(event.messageReply.messageID);
    const s = sessions.get(key);
    if (!s) return false;
    if (Date.now() - s.at > SESSION_TTL) { sessions.delete(key); return false; }
    if (String(event.senderID) !== s.uid) return false;          // الجلسة لصاحبها فقط

    const p = cfg.getPrefix();
    const input = toLatinDigits(event.body).trim();
    if (!input || input.startsWith(p)) return false;             // الأوامر بالبادئة تُعالج كالمعتاد
    const words = input.split(/\s+/);
    const w0 = words[0].toLowerCase();
    const send = async (text, data) => {
        const info = await helpers.reply(api, event, text);
        remember(info, Object.assign({ uid: s.uid }, data));
        return true;
    };
    const showCats = () => send(catsView(loadUser(s.uid), helpers, deco), { step: 'cats' });

    if (BACK.includes(w0)) {
        if (s.step === 'biz' || s.step === 'bizitem') return send(investView(loadUser(s.uid), helpers, deco), { step: 'inv' });
        return showCats();
    }
    if (ACTIONS.bag.includes(w0)) { await showBag(ctx); return true; }

    const isBuy = ACTIONS.buy.includes(w0), isSell = ACTIONS.sell.includes(w0);
    const rest = (isBuy || isSell) ? words.slice(1) : words;
    const parseQty = (arr, allowAll) => {
        const last = arr[arr.length - 1];
        if (allowAll && last === 'الكل') return { qty: 'all', arr: arr.slice(0, -1) };
        if (arr.length && /^\d{1,3}$/.test(last)) return { qty: parseInt(last, 10), arr: arr.slice(0, -1) };
        return { qty: 1, arr };
    };
    const trade = async (it, qty, sellMode, step) => {
        const r = sellMode ? txSell(s.uid, it, qty, helpers, p) : txBuy(s.uid, it, qty, helpers, p);
        if (r.error) return send(deco.errorBox(r.error), { step, item: it.id, cat: s.cat });
        return send(deco.success(r.text + '\n\n↩️ رد: شراء | بيع | رجوع'), { step: 'item', item: it.id, cat: s.cat });
    };

    const alone = words.length === 1;
    if (alone && isSell && s.step !== 'item') return send(sellView(loadUser(s.uid), helpers, deco), { step: 'sell' });
    if (alone && ACTIONS.invest.includes(w0)) return send(investView(loadUser(s.uid), helpers, deco), { step: 'inv' });

    /* ─── البيع ─── */
    if (s.step === 'sell') {
        const view = note => send(sellView(loadUser(s.uid), helpers, deco, note), { step: 'sell' });
        if (isSell && rest.join(' ') === 'الكل') {                       // بيع الكل
            const r = txSellAll(s.uid, helpers, p);
            return view(r.error ? `⚠️ ${r.error}` : r.text);
        }
        const { qty, arr } = parseQty(rest, true);
        const found = arr.length ? findItems(arr.join(' ')) : [];
        if (!found.length) return false;
        const d0 = loadUser(s.uid);
        const mine = found.filter(i => owned(d0, i) > 0);
        const pool = mine.length ? mine : found;
        if (pool.length > 1) return view('🔎 أكثر من نتيجة، رد بالرقم');
        const r = txSell(s.uid, pool[0], qty, helpers, p);
        return view(r.error ? `⚠️ ${r.error}` : r.text);
    }

    /* ─── الأعمال: قائمة المشاريع وإدارة العمال ─── */
    const isHire = ACTIONS.hire.includes(w0), isFire = ACTIONS.fire.includes(w0);
    if (s.step === 'biz' || s.step === 'bizitem') {
        const d0 = loadUser(s.uid);
        const showList = note => send(bizListView(loadUser(s.uid), helpers, deco, note), { step: 'biz' });
        const showItem = (it, note) => send(bizItemView(it, loadUser(s.uid), helpers, deco, note), { step: 'bizitem', item: it.id });
        const parseN = (arr, allowAll) => {
            const last = arr[arr.length - 1];
            if (allowAll && last === 'الكل') return { n: 'all', arr: arr.slice(0, -1) };
            if (arr.length && /^\d{1,3}$/.test(last)) return { n: parseInt(last, 10), arr: arr.slice(0, -1) };
            return { n: 1, arr };
        };
        if (isHire || isFire) {
            const { n, arr } = parseN(words.slice(1), isFire);
            let it = null;
            if (arr.length) {                                    // وظف <مشروع> [عدد]
                const pk = pickBiz(d0, arr.join(' '), p, isHire ? 'وظف' : 'سرح');
                if (pk.msg) return s.step === 'biz' ? showList(`⚠️ ${pk.msg}`) : showItem(itemById(s.item), `⚠️ ${pk.msg}`);
                it = pk.item;
            } else if (s.step === 'bizitem') it = itemById(s.item);   // وظف [عدد] داخل بطاقة المشروع
            if (!it) return showList('⚠️ حدد المشروع: وظف <رقم> [عدد]');
            const r = isHire ? txHire(s.uid, it, n, helpers, p) : txFire(s.uid, it, n, helpers, p);
            return showItem(it, r.error ? `⚠️ ${r.error}` : r.text);
        }
        if (s.step === 'biz' && /^\d{1,2}$/.test(input)) {      // رقم مشروع ← بطاقته
            const it = itemById(input);
            if (it && it.biz && owned(d0, it) > 0) return showItem(it);
            return showList('⚠️ لا تملك هذا المشروع');
        }
        return false;
    }

    /* ─── الاستثمار: اختيار الخطة / السحب ─── */
    if (s.step === 'inv') {
        const view = note => send(investView(loadUser(s.uid), helpers, deco, note), { step: 'inv' });
        if (['سحب', 'withdraw', 'استلام'].includes(w0)) {
            const r = txWithdraw(s.uid, helpers, p);
            return view(r.error ? `⚠️ ${r.error}` : r.text);
        }
        if (input === '6' || BIZ_WORDS.includes(w0)) return send(bizListView(loadUser(s.uid), helpers, deco), { step: 'biz' });
        const plan = /^\d{1,2}$/.test(input) ? planById(input) : null;
        if (!plan) return false;
        return send(planView(plan, loadUser(s.uid), helpers, deco), { step: 'plan', plan: plan.id });
    }

    /* ─── الاستثمار: إدخال المبلغ ─── */
    if (s.step === 'plan') {
        const plan = planById(s.plan);
        if (!plan) return showCats();
        const d0 = loadUser(s.uid);
        const amount = parseAmount(input, plan, d0);
        if (Number.isNaN(amount)) return false;
        const r = txInvest(s.uid, plan, amount, helpers, p);
        if (r.error) return send(deco.errorBox(r.error), { step: 'plan', plan: plan.id });
        return send(investView(loadUser(s.uid), helpers, deco, r.text), { step: 'inv' });
    }

    /* ─── الخطوة 1: الأقسام ─── */
    if (s.step === 'cats') {
        const cat = findCategory(input);
        if (!cat) return false;                                  // كلام عادي: نتجاهله
        return send(itemsView(cat, helpers, deco), { step: 'items', cat: cat.id });
    }

    /* ─── الخطوة 2: قائمة الأغراض ─── */
    if (s.step === 'items') {
        const { qty, arr } = (isBuy || isSell) ? parseQty(rest, isSell) : { qty: 1, arr: rest };
        const found = arr.length ? findItems(arr.join(' ')) : [];
        if (!found.length) return false;
        if (found.length > 1) {
            return send(deco.infoBox('🔎 أي غرض؟', found.slice(0, 8).map(i => `[${i.id}] ${i.emoji} ${i.name} — ${helpers.fmt(priceNow(i))}`).join('\n') + '\n\n↩️ رد بالرقم'), { step: 'items', cat: s.cat });
        }
        const it = found[0];
        if (isBuy) return trade(it, qty, false, 'items');
        if (isSell) return trade(it, qty, true, 'items');
        return send(itemView(it, loadUser(s.uid), helpers, deco), { step: 'item', item: it.id, cat: it.cat });
    }

    /* ─── الخطوة 3: بطاقة الغرض ─── */
    if (s.step === 'item') {
        const it = itemById(s.item);
        if (!it) return showCats();
        if (isSell) return trade(it, parseQty(rest, true).qty, true, 'item');
        if (isBuy) return trade(it, parseQty(rest, false).qty, false, 'item');
        if (input === '1') return trade(it, 1, false, 'item'); // «1» وحده = شراء
        return false;
    }
    return false;
};

module.exports.run = async ctx => {
    const { event, args, cfg } = ctx;
    // نعرف الكلمة التي كتبها المستخدم بعد البادئة (متجر / شراء / بيع ...)
    const prefix = cfg.getPrefix();
    const used = (String(event.body || '').trim().slice(prefix.length).trim().split(/\s+/)[0] || '').toLowerCase();

    const action = actionOf(used);
    const rest = args;
    // «.متجر شراء / بيع / تحصيل ...» لم تعد مدعومة: نعرض المتجر الرئيسي فقط
    if (!action && args.length && actionOf(String(args[0]).toLowerCase())) return showShop(ctx, []);
    return action ? HANDLERS[action](ctx, rest) : showShop(ctx, args);
};

module.exports.S = S;
