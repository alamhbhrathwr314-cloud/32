/**
 * ◈ ───『 المتجر الكبير: البيانات والمنطق 』─── ◈
 * - 50 غرضًا في 8 أقسام، وأسعارها تتغيّر يوميًا (ثابتة طوال اليوم UTC).
 * - الشراء بسعر اليوم، والبيع بـ 80% من سعر اليوم.
 * - العقارات والمشاريع تدرّ دخلًا بالساعة (يُحصَّل بـ .تحصيل، بحد أقصى 24 ساعة).
 * - 5 خطط استثمار بنتيجة تُحسم لحظة الاستثمار وتظهر عند الاستحقاق.
 * الحفظ داخل بيانات المستخدم في states (الحقل shop)، ومصفوفة inventory تعرض الأغراض المملوكة.
 */
const states = require('./db/states');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const SELL_RATE = 0.8;
const MAX_BUY = 50;
const MAX_OWNED = 99;
const MAX_ACTIVE_INVEST = 5;

/* ═══════════ الأقسام ═══════════ */
const CATEGORIES = [
    { id: 1, emoji: '🐾', name: 'حيوانات أليفة',   vol: 0.12 },
    { id: 2, emoji: '📱', name: 'إلكترونيات',      vol: 0.10 },
    { id: 3, emoji: '👗', name: 'أزياء وإكسسوارات', vol: 0.12 },
    { id: 4, emoji: '💎', name: 'مجوهرات',         vol: 0.10 },
    { id: 5, emoji: '🚗', name: 'مركبات',          vol: 0.08 },
    { id: 6, emoji: '🏠', name: 'عقارات',          vol: 0.06 },
    { id: 7, emoji: '🏢', name: 'مشاريع وشركات',   vol: 0.08 },
    { id: 8, emoji: '🏺', name: 'تحف ونوادر',      vol: 0.30 }
];

/* ═══════════ الأغراض: [قسم، رمز، اسم، سعر أساسي، معدل الدخل بالساعة (اختياري)] ═══════════ */
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
    // 🏺 تحف ونوادر (أسعارها أكثر تقلبًا)
    [8, '🪙', 'عملة نادرة', 3000], [8, '📮', 'طابع بريدي نادر', 5000], [8, '📜', 'مخطوطة قديمة', 15000],
    [8, '🖼️', 'لوحة فنية', 50000], [8, '🏆', 'كأس ذهبي', 90000], [8, '⏳', 'ساعة رملية أثرية', 150000],
    [8, '☄️', 'نيزك', 250000]
];

const ITEMS = RAW.map((r, i) => ({
    id: i + 1, cat: r[0], emoji: r[1], name: r[2], price: r[3], rate: r[4] || 0,
    vol: CATEGORIES.find(c => c.id === r[0]).vol
}));
const itemById = id => ITEMS.find(i => i.id === Number(id)) || null;
const categoryById = id => CATEGORIES.find(c => c.id === Number(id)) || null;

/* ═══════════ الأسعار اليومية (حتمية: نفس السعر لكل الناس طوال اليوم) ═══════════ */
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

/* ═══════════ البحث بالاسم أو الرقم ═══════════ */
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

/* ═══════════ بيانات المستخدم ═══════════ */
function loadUser(uid) {
    const d = states.getData(String(uid));
    const s = d.shop && typeof d.shop === 'object' ? d.shop : {};
    d.shop = Object.assign({ items: {}, lastCollect: Date.now(), pending: 0, investments: [], spent: 0 }, s);
    return d;
}
/** يحفظ ثم يقرأ ما حُفظ ويقارنه. يرجع true إذا تطابق الحفظ فعلًا */
function saveUser(uid, d) {
    d.inventory = Object.keys(d.shop.items).filter(k => d.shop.items[k] > 0);
    states.saveData(String(uid), d);
    const back = states.getAll()[String(uid)];
    return !!(back && back.shop && back.points === d.points
        && JSON.stringify(back.shop.items) === JSON.stringify(d.shop.items));
}
const snapshot = d => JSON.stringify(d);                                  // لقطة قبل التعديل
const restore = (uid, snap) => states.saveData(String(uid), JSON.parse(snap)); // استرداد عند فشل الحفظ

const owned = (d, item) => d.shop.items[item.id] || 0;
const ownedRate = d => Object.entries(d.shop.items).reduce((s, [id, q]) => s + q * incomePerHour(itemById(id) || { price: 0, rate: 0 }), 0);
const assetsValue = (d, day) => Object.entries(d.shop.items).reduce((s, [id, q]) => { const it = itemById(id); return s + (it ? q * sellNow(it, day) : 0); }, 0);

/** يضيف الدخل المتراكم إلى pending ثم يصفّر العدّاد (يُستدعى قبل أي تغيير في الأغراض المدرّة للدخل) */
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

/* ═══════════ الشراء والبيع والتحصيل ═══════════ */
function buy(d, item, qty, now = Date.now()) {
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_BUY) return { error: `الكمية من 1 إلى ${MAX_BUY}` };
    if (owned(d, item) + qty > MAX_OWNED) return { error: `لا يمكنك امتلاك أكثر من ${MAX_OWNED} من نفس الغرض` };
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
    if (d.shop.items[item.id] <= 0) delete d.shop.items[item.id];
    return { gain, left: have - qty, sold: qty };
}
function collectIncome(d, now = Date.now()) {
    accrue(d, now);
    const amount = Math.floor(d.shop.pending);
    d.shop.pending = 0;
    d.points += amount;
    return { amount, rate: ownedRate(d) };
}

/* ═══════════ الاستثمار ═══════════ */
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

module.exports = {
    CATEGORIES, ITEMS, PLANS, SELL_RATE, MAX_BUY, MAX_OWNED, MAX_ACTIVE_INVEST,
    itemById, categoryById, planById, findItems, findCategory,
    dayIndex, priceNow, sellNow, changePct, incomePerHour, factorToday,
    loadUser, saveUser, snapshot, restore, owned, ownedRate, assetsValue, accrue, pendingNow,
    buy, sell, collectIncome, invest, collectInvestments
};
