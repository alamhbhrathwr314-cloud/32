/**
 * ⚔️ ديماس — لعبة صيادي البوابات (على طريقة Solo Leveling)
 * رتب E→S ثم قائد وطني، مستويات، توزيع نقاط، بوابات بوحوش وأشرار، مهمة يومية،
 * استخراج جنود الظل، متجر أسلحة وجرعات، وترتيب اللاعبين.
 * البيانات تُحفظ في Heba_DB/demas.json (فيُزامَن مع GitHub تلقائيًا).
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'Heba_DB');
const FILE = path.join(DIR, 'demas.json');
const GATE_CD = 40 * 1000;            // انتظار بين البوابات
const DAILY_CD = 20 * 3600 * 1000;    // المهمة اليومية
const MAX_SHADOWS = 15;
const MAX_POTIONS = 20;
const POTION_PRICE = 80;

/* ═══════════ الحفظ ═══════════ */
fs.mkdirSync(DIR, { recursive: true });
function load() {
    try {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (d && typeof d === 'object' && !Array.isArray(d)) return d;
        throw new Error('صيغة غير متوقعة');
    } catch (e) {
        if (e.code !== 'ENOENT') { // ملف تالف: نحتفظ بنسخة منه بدل أن نفقده
            try { fs.renameSync(FILE, path.join(DIR, `demas.corrupt-${Date.now()}.json.bak`)); } catch (_) { /* تجاهل */ }
            console.error('demas: الملف تالف، حُفظت نسخة منه');
        }
        return {};
    }
}
function save(db) {
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
}

/* ═══════════ البيانات الثابتة ═══════════ */
const RANKS = [
    { k: 'E', min: 1, name: 'رتبة E', emoji: '⚪' },
    { k: 'D', min: 10, name: 'رتبة D', emoji: '🟢' },
    { k: 'C', min: 20, name: 'رتبة C', emoji: '🔵' },
    { k: 'B', min: 35, name: 'رتبة B', emoji: '🟣' },
    { k: 'A', min: 50, name: 'رتبة A', emoji: '🟠' },
    { k: 'S', min: 70, name: 'رتبة S', emoji: '🔴' },
    { k: 'N', min: 100, name: 'قائد وطني', emoji: '👑' }
];
const rankIdx = lvl => RANKS.reduce((r, x, i) => (lvl >= x.min ? i : r), 0);
const rankLabel = lvl => { const r = RANKS[rankIdx(lvl)]; return `${r.emoji} ${r.name}`; };

const GATES = [
    { k: 'E', name: 'كهف الغوبلن', mobs: ['غوبلن', 'ذئب الكهف', 'عنكبوت صغير', 'خفاش مظلم'], boss: 'ملك الغوبلن', hp: 120, atk: 12, xp: 40, gold: 30 },
    { k: 'D', name: 'معبد الأورك', mobs: ['أورك', 'ذئب الظل', 'عفريت', 'حارس حجري'], boss: 'قائد الأورك الأسود', hp: 330, atk: 27, xp: 110, gold: 80 },
    { k: 'C', name: 'قلعة الجليد', mobs: ['دب جليدي', 'فارس هيكل عظمي', 'ساحر مظلم', 'ذئب الصقيع'], boss: 'ساحر الجليد الأسود', hp: 780, atk: 38, xp: 220, gold: 170 },
    { k: 'B', name: 'سرداب فارس الدم', mobs: ['مصاص دماء', 'جندي ملعون', 'غولم الدم', 'ظل قاتل'], boss: 'إيغريس — فارس الدم', hp: 1800, atk: 90, xp: 420, gold: 330 },
    { k: 'A', name: 'عش النمل العملاق', mobs: ['نملة جندي', 'نملة حارسة', 'نملة ساحرة', 'نملة قاتلة'], boss: 'بيرو — ملك النمل', hp: 2800, atk: 135, xp: 800, gold: 650 },
    { k: 'S', name: 'وكر التنين', mobs: ['وحش لافا', 'حارس التنين', 'تنين صغير', 'شبح النار'], boss: 'كاميش — تنين الكارثة', hp: 4800, atk: 200, xp: 1500, gold: 1200 }
];

const WEAPONS = [
    { name: 'بدون سلاح', atk: 0, price: 0 },
    { name: 'خنجر الصياد', atk: 15, price: 250 },
    { name: 'سيف الحديد', atk: 45, price: 1200 },
    { name: 'سيف الفارس', atk: 110, price: 5000 },
    { name: 'خنجر الظل', atk: 260, price: 20000 },
    { name: 'سيف الملك', atk: 600, price: 80000 }
];

const SHADOW_NAMES = ['إيغريس', 'تانك', 'آيرون', 'فانغ', 'بيلين', 'تاسك', 'جيما', 'كايل', 'بارا', 'رين',
    'زيك', 'درايك', 'نوكس', 'سيرو', 'ماغنوس', 'ثور', 'رافن', 'كيرا', 'ليو', 'أبيس'];

const STAT_KEYS = { 'قوة': 'str', 'القوة': 'str', str: 'str', 'سرعة': 'agi', 'السرعة': 'agi', agi: 'agi',
    'حيوية': 'vit', 'الحيوية': 'vit', vit: 'vit', 'ذكاء': 'int', 'الذكاء': 'int', int: 'int',
    '1': 'str', '2': 'agi', '3': 'vit', '4': 'int' };
const STAT_LABEL = { str: '💪 القوة', agi: '⚡ السرعة', vit: '🛡️ الحيوية', int: '🧠 الذكاء' };

const SUB = {
    'ملفي': 'profile', 'حالة': 'profile', 'ملف': 'profile', 'قائمة': 'profile',
    'بوابة': 'gate', 'مغامرة': 'gate', 'دانجن': 'gate', 'رتبة': 'gates', 'بوابات': 'gates',
    'يومية': 'daily', 'مهمة': 'daily',
    'توزيع': 'alloc', 'وزع': 'alloc',
    'ظلال': 'shadows', 'الظلال': 'shadows',
    'متجر': 'shop', 'شراء': 'buy', 'جرعة': 'potion', 'علاج': 'heal', 'مال': 'money',
    'ترتيب': 'top', 'توب': 'top', 'مساعدة': 'help', 'اوامر': 'help'
};

/* ═══════════ الحسابات ═══════════ */
const xpNeed = l => Math.floor(50 * Math.pow(l, 1.4));
const isUnl = u => u.unlimited === true;      // شراء مجاني داخل اللعبة (للمطور أو من يمنحه له)
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const toLatin = s => String(s === undefined || s === null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const num = s => parseInt(toLatin(s), 10);

function newHunter() {
    return {
        level: 1, xp: 0, stats: { str: 10, agi: 10, vit: 10, int: 10 }, points: 0,
        unlimited: false, potions: 1, weapon: 0, shadows: [], wins: 0, losses: 0,
        hp: null, hpAt: Date.now(), lastGate: 0, lastDaily: 0, streak: 0, name: ''
    };
}

function derive(u) {
    const s = u.stats;
    const shadowAtk = u.shadows.reduce((t, x) => t + 5 + x.g * 8, 0);
    return {
        maxHp: Math.round(100 + s.vit * 12 + u.level * 8),
        atk: 5 + s.str * 2.2 + s.agi * 0.8 + u.level * 1.5 + WEAPONS[u.weapon].atk + shadowAtk,
        def: s.agi * 0.5 + s.vit * 0.6,
        crit: Math.min(0.4, 0.05 + s.agi * 0.004),
        dodge: Math.min(0.35, s.agi * 0.003),
        skill: Math.min(0.35, 0.05 + s.int * 0.004),
        xpMul: 1 + Math.min(1, s.int * 0.005),
        shadowAtk
    };
}

/** الصحة الحالية مع التعافي التدريجي (2% من الأقصى كل دقيقة) */
function hpNow(u) {
    const max = derive(u).maxHp;
    if (u.hp === null || u.hp === undefined) return max;
    const mins = Math.max(0, (Date.now() - (u.hpAt || Date.now())) / 60000);
    return Math.min(max, Math.floor(u.hp + max * 0.02 * mins));
}
function setHp(u, v) { u.hp = Math.max(0, Math.round(v)); u.hpAt = Date.now(); }

/** يضيف خبرة ويرقّي المستوى. يعيد أسطر الإشعارات */
function gainXP(u, amount) {
    const lines = [];
    const before = rankIdx(u.level);
    u.xp += amount;
    let ups = 0;
    while (u.xp >= xpNeed(u.level)) { u.xp -= xpNeed(u.level); u.level++; u.points += 5; ups++; }
    if (ups) {
        setHp(u, derive(u).maxHp);
        lines.push(`🎉 ارتقيت إلى المستوى ${u.level} (+${ups * 5} نقطة توزيع)`);
        const after = rankIdx(u.level);
        if (after > before) lines.push(`🎖️ ترقية رتبة! أصبحت الآن: ${rankLabel(u.level)}`);
    }
    return lines;
}

/* ═══════════ القتال ═══════════ */
function fight(u, g) {
    const G = GATES[g], P = derive(u);
    let hp = hpNow(u), potions = u.potions, used = 0, skills = 0, crits = 0;
    const killed = [];
    let bonusGold = 0, bonusXp = 0, event = null, bossName = G.boss, lostTo = null, bossHpPct = 100;

    const enemies = [];
    for (let i = 0; i < 3; i++) enemies.push({ name: pick(G.mobs), hp: G.hp * rand(0.8, 1.2), atk: G.atk * rand(0.9, 1.1), boss: false });
    enemies.push({ name: G.boss, hp: G.hp * 4.5, atk: G.atk * 1.6, boss: true });

    for (let i = 0; i < enemies.length && !lostTo; i++) {
        const e = enemies[i];
        if (e.boss && Math.random() < 0.5) {              // حدث عشوائي قبل مواجهة الزعيم
            const r = Math.random();
            if (r < 0.3) { const x = Math.round(G.gold * 0.4); bonusGold += x; event = `📦 وجدت صندوق كنز: +${x} 💰`; }
            else if (r < 0.55) { const x = Math.round(P.maxHp * 0.12); hp = Math.max(1, hp - x); event = `🕸️ وقعت في فخ: -${x} HP`; }
            else if (r < 0.8) { const x = Math.round(G.xp * 0.3); bonusXp += x; event = `✨ غرفة مخفية: +${x} خبرة`; }
            else { potions = Math.min(MAX_POTIONS, potions + 1); event = '💊 صياد جريح أعطاك جرعة شفاء'; }
        }
        const maxEHp = e.hp;
        let rounds = 0;
        while (e.hp > 0 && hp > 0 && rounds++ < 300) {
            let dmg = P.atk * rand(0.85, 1.15);
            if (Math.random() < P.skill) { dmg *= 2.2; skills++; }
            else if (Math.random() < P.crit) { dmg *= 1.8; crits++; }
            e.hp -= dmg;
            if (e.hp <= 0) break;
            if (Math.random() < P.dodge) continue;
            hp -= Math.max(1, e.atk * rand(0.85, 1.15) - P.def * 0.5);
            if (hp > 0 && hp < P.maxHp * 0.3 && potions > 0) { potions--; used++; hp = Math.min(P.maxHp, hp + P.maxHp * 0.5); }
        }
        if (hp <= 0) { lostTo = e.name; if (e.boss) bossHpPct = Math.max(1, Math.round(e.hp / maxEHp * 100)); }
        else if (!e.boss) killed.push(e.name);
    }
    return { won: !lostTo, lostTo, hp: Math.max(0, hp), potions, used, skills, crits, killed, bonusGold, bonusXp, event, bossName, bossHpPct, maxHp: P.maxHp };
}

/* ═══════════ العرض ═══════════ */
function profileText(u, helpers, name, money) {
    const P = derive(u), hp = hpNow(u), need = xpNeed(u.level), s = u.stats;
    return [
        `👤 ${name || u.name || 'صياد'}`,
        `🎖️ ${rankLabel(u.level)}`,
        `📊 المستوى: ${u.level}   ⭐ ${helpers.fmt(u.xp)}/${helpers.fmt(need)}`,
        helpers.bar(u.xp, need),
        `❤️ الصحة: ${helpers.fmt(hp)}/${helpers.fmt(P.maxHp)}`,
        helpers.bar(hp, P.maxHp),
        `⚔️ قوة الهجوم: ${helpers.fmt(Math.round(P.atk))}`,
        '',
        `${STAT_LABEL.str}: ${s.str}   ${STAT_LABEL.agi}: ${s.agi}`,
        `${STAT_LABEL.vit}: ${s.vit}   ${STAT_LABEL.int}: ${s.int}`,
        `🎯 نقاط للتوزيع: ${u.points}`,
        '',
        `💰 الرصيد: ${money}   💊 الجرعات: ${u.potions}`,
        `🗡️ السلاح: ${WEAPONS[u.weapon].name}`,
        `🌑 جنود الظل: ${u.shadows.length}/${MAX_SHADOWS}`,
        `🏆 انتصارات: ${u.wins}   ☠️ هزائم: ${u.losses}`
    ].join('\n');
}

function helpText(p) {
    return [
        `${p}ديماس — ملفك كصياد`,
        `${p}ديماس بوابة [E|D|C|B|A|S] — ادخل بوابة وقاتل الوحوش والزعيم`,
        `${p}ديماس يومية — المهمة اليومية (خبرة ونقاط)`,
        `${p}ديماس توزيع <قوة|سرعة|حيوية|ذكاء> [عدد|كل] — وزّع نقاطك`,
        `${p}ديماس ظلال — جنود الظل الذين استخرجتهم`,
        `${p}ديماس متجر / شراء <رقم> [عدد] — جرعات وأسلحة`,
        `${p}ديماس جرعة — استعمل جرعة شفاء`,
        `${p}ديماس علاج — علاج كامل برصيدك`,
        `${p}ديماس ترتيب — أقوى الصيادين`,
        '',
        '↩️ الأسهل: ردّ على أي رسالة من اللعبة برقم الخيار لتكمل اللعب بلا كتابة الأمر',
        '💰 المال هو رصيد حسابك نفسه (الظاهر في .رصيد)، تكسبه من البوابات وتنفقه في المتجر',
        '💡 القوة: هجوم | السرعة: تفادي وضربات حرجة | الحيوية: صحة ودفاع | الذكاء: مهارات وخبرة أكثر',
        '⚠️ البوابات الأعلى من رتبتك بدرجة واحدة خطرة لكنها تعطي مكافأة أكبر'
    ].join('\n');
}

/* ═══════════ جلسات الرد (ردّ على رسالة اللعبة لتكمل) ═══════════ */
const SESSION_TTL = 30 * 60 * 1000;
const sessions = new Map(); // معرّف رسالة اللعبة ← { uid, tid, ctx, at }
function remember(info, uid, tid, ctx) {
    if (!info || !info.messageID || info.messageID === 'sent') return;
    const now = Date.now();
    for (const [k, v] of sessions) if (now - v.at > SESSION_TTL) sessions.delete(k);
    sessions.set(String(info.messageID), { uid: String(uid), tid: String(tid), ctx, at: now });
}

function footer(menu) {
    if (menu === 'gate') return '↩️ ردّ بحرف الرتبة: E D C B A S\n[0] القائمة الرئيسية';
    if (menu === 'alloc') return '↩️ ردّ برقم الإحصائية، ويمكنك إضافة العدد أو «كل»\nمثال: 1 5   أو   2 كل\n[0] القائمة الرئيسية';
    if (menu === 'shop') return '↩️ ردّ برقم الغرض والعدد (للجرعات)\nمثال: 1 3   أو   3\n[0] القائمة الرئيسية';
    return [
        '↩️ ردّ على هذه الرسالة برقم:',
        '[1] ⚔️ بوابة   [2] 🎚️ اختيار الرتبة',
        '[3] 📜 يومية   [4] 🎯 توزيع النقاط',
        '[5] 🏪 متجر    [6] 💊 جرعة',
        '[7] 🏥 علاج    [8] 🌑 ظلال',
        '[9] 🏆 ترتيب   [0] 👤 ملفي'
    ].join('\n');
}

const MAIN_NUM = { 1: 'gate', 2: 'gates', 3: 'daily', 4: 'alloc', 5: 'shop', 6: 'potion', 7: 'heal', 8: 'shadows', 9: 'top', 0: 'profile' };
const STAT_WORDS = ['قوة', 'سرعة', 'حيوية', 'ذكاء'];

/** يحوّل ردّ اللاعب إلى (أمر فرعي + وسائط) حسب القائمة التي ردّ عليها */
function routeReply(ctx, w) {
    const first = w[0].toLowerCase();
    if (first === '0') return { sub: 'profile', args: ['ملفي'] };
    if (ctx === 'gate') {
        const idx = GATES.findIndex(x => x.k.toLowerCase() === first);
        const n = parseInt(first, 10);
        if (idx >= 0 || (n >= 1 && n <= 6)) return { sub: 'gate', args: ['بوابة', first] };
    } else if (ctx === 'alloc') {
        if (STAT_KEYS[first]) return { sub: 'alloc', args: ['توزيع', first, w[1]] };
    } else if (ctx === 'shop') {
        const n = parseInt(first, 10);
        if (n >= 1 && n <= WEAPONS.length) return { sub: 'buy', args: ['شراء', first, w[1]] };
    } else if (/^\d$/.test(first) && MAIN_NUM[first]) {
        return { sub: MAIN_NUM[first], args: [first] };
    }
    if (SUB[first]) return { sub: SUB[first], args: w };   // كلمات مثل: بوابة S / يومية / متجر
    return null;
}

/* ═══════════ الأمر ═══════════ */
module.exports.config = {
    name: 'ديماس', aliases: ['demas', 'dimas', 'صياد'],
    description: 'لعبة صيادي البوابات: ارتقِ بالرتب وقاتل الأشرار واستخرج الظلال (تُكمل بالرد على الرسائل)',
    usage: 'ديماس [بوابة|يومية|توزيع|ظلال|متجر|ترتيب|مساعدة]', category: 'games', cooldown: 3, adminOnly: false
};

module.exports.run = async ctx => {
    const args = ctx.args || [];
    const sub = SUB[(args[0] || '').toLowerCase()] || (args[0] ? null : 'profile');
    return execute(ctx, sub, args, 'main');
};

/** الردّ على رسالة من اللعبة يكمل اللعب بلا بادئة */
module.exports.onMessage = async ({ api, event, helpers, deco, cfg, states }) => {
    if (event.type !== 'message_reply' || !event.messageReply || !event.messageReply.messageID) return false;
    const key = String(event.messageReply.messageID);
    const sess = sessions.get(key);
    if (!sess) return false;
    if (Date.now() - sess.at > SESSION_TTL) { sessions.delete(key); return false; }
    if (String(event.threadID) !== sess.tid || String(event.senderID) !== sess.uid) return false;
    const words = toLatin(event.body).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const route = routeReply(sess.ctx, words);
    if (!route) return false;
    await execute({ api, event, helpers, deco, cfg, states }, route.sub, route.args, sess.ctx);
    return true;
};

async function execute(ctx, sub, args, sc) {
    const { api, event, helpers, deco, cfg } = ctx;
    const states = ctx.states || require('../../utils/db/states');
    const uid = String(event.senderID), prefix = cfg.getPrefix();
    // المال = نقاط حسابك نفسها (الظاهرة في .رصيد)، وتُقرأ وتُكتب من سجل الحساب مباشرة
    const bal = () => states.getData(uid).points;
    const addMoney = n => { const d = states.getData(uid); d.points += n; states.saveData(uid, d); };
    const db = load();
    const isNew = !db[uid];
    const u = db[uid] || (db[uid] = newHunter());
    const def = newHunter();                         // ملء الحقول الناقصة (ملفات قديمة)
    for (const k of Object.keys(def)) if (u[k] === undefined) u[k] = def[k];
    try { const n = await helpers.getName(api, uid); if (n && !/^مستخدم \d{4}$/.test(n)) u.name = n; } catch (e) { /* تجاهل */ }

    if (typeof cfg.isAdmin === 'function' && cfg.isAdmin(uid) && !u.unlimited) u.unlimited = true;
    const canAfford = cost => isUnl(u) || bal() >= cost;
    const spend = cost => { if (!isUnl(u)) addMoney(-cost); };
    const moneyText = () => (isUnl(u) ? '♾️ غير محدود' : helpers.fmt(bal()));

    const send = async (text, menu) => {
        const m = menu || 'main';
        const info = await helpers.reply(api, event, `${text}\n\n${footer(m)}`);
        remember(info, uid, event.threadID, m);
    };
    const box = (title, body, menu) => send(deco.infoBox(title, body), menu);
    const err = text => send(deco.errorBox(text), sc);      // الخطأ يبقيك في نفس القائمة لتعيد المحاولة
    const ok = (text, menu) => send(deco.success(text), menu);

    if (sub === null) return err(`أمر غير معروف. اكتب ${prefix}ديماس مساعدة`);

    if (isNew) {
        save(db);
        return box('⚔️ ديماس', `[النظام] تم اختيارك كلاعب!\nأنت الآن صياد بوابات بدرجة E. قاتل وارتقِ لتصبح قائدًا وطنيًا 👑\n\n${profileText(u, helpers, u.name, moneyText())}`);
    }

    switch (sub) {
        case 'profile': {
            save(db);
            return box('⚔️ ملف الصياد', profileText(u, helpers, u.name, moneyText()));
        }

        case 'help': return box('⚔️ دليل ديماس', helpText(prefix));

        case 'gates': {
            save(db);
            const ri = rankIdx(u.level), own = Math.min(5, ri), allowed = Math.min(5, ri + 1);
            const rows = GATES.map((G, i) => {
                const tag = i === own ? ' ← رتبتك' : i === allowed && i > own ? ' ⚠️ خطرة' : i > allowed ? ' 🔒' : '';
                return `${G.k} — ${G.name}${tag}`;
            });
            return box('🎚️ اختر البوابة', rows.join('\n'), 'gate');
        }

        case 'gate': {
            const now = Date.now(), left = u.lastGate + GATE_CD - now;
            if (left > 0) return err(`البوابة التالية تُفتح بعد ${Math.ceil(left / 1000)} ثانية`);
            const ri = rankIdx(u.level), own = Math.min(5, ri);
            let g = own;
            if (args[1]) {
                const a = toLatin(args[1]).toLowerCase();
                const byLetter = GATES.findIndex(x => x.k.toLowerCase() === a);
                const n = num(a);
                g = byLetter >= 0 ? byLetter : (n >= 1 && n <= 6 ? n - 1 : -1);
                if (g < 0) return err('رتبة البوابة: E أو D أو C أو B أو A أو S');
                if (g > Math.min(5, ri + 1)) return err(`رتبتك (${RANKS[ri].name}) لا تسمح بدخول بوابة ${GATES[g].k}`);
            }
            const hp0 = hpNow(u), max = derive(u).maxHp;
            if (hp0 < max * 0.25) return err(`جروحك بليغة (${hp0}/${max}). اضغط [6] للجرعة أو [7] للعلاج`);

            const r = fight(u, g), G = GATES[g];
            u.lastGate = now; u.potions = r.potions;
            const danger = g > ri;
            const lines = [`🌀 بوابة ${G.k} — «${G.name}»${danger ? ' ⚠️ خطرة' : ''}`];
            if (r.killed.length) lines.push(`⚔️ هزمت: ${r.killed.join('، ')}`);
            if (r.event) lines.push(r.event);
            if (r.used) lines.push(`💊 استعملت ${r.used} جرعة تلقائيًا`);

            if (!r.won) {
                u.losses++;
                // الخسارة 10% من رصيدك بحد أقصى 3 أضعاف مكافأة البوابة، فلا تُمسّ مدخراتك الكبيرة
                const lost = isUnl(u) ? 0 : Math.min(Math.floor(bal() * 0.1), G.gold * 3);
                if (lost > 0) addMoney(-lost);
                setHp(u, Math.max(1, Math.round(r.maxHp * 0.1)));
                lines.push(`💀 سقطت أمام «${r.lostTo}»${r.lostTo === r.bossName ? ` (بقي ${r.bossHpPct}% من صحته)` : ''}`);
                if (lost > 0) lines.push(`💸 خسرت ${helpers.fmt(lost)} 💰 من رصيدك`);
                lines.push('[النظام] تم إنقاذك من البوابة. عالج نفسك وعد أقوى.');
                save(db);
                return box('☠️ هزيمة', lines.join('\n'));
            }

            // مكافآت: تقل عند الاستهانة ببوابات أدنى بكثير من رتبتك، وتزيد في البوابات الخطرة
            const diff = ri - g;
            const scale = diff >= 3 ? 0.2 : diff === 2 ? 0.5 : diff === 1 ? 0.8 : 1;
            const dangerMul = danger ? 1.5 : 1;
            const xp = Math.round((G.xp * rand(0.9, 1.1) * derive(u).xpMul + r.bonusXp) * scale * dangerMul);
            const gold = Math.round((G.gold * rand(0.9, 1.1) + r.bonusGold) * scale * dangerMul);
            addMoney(gold); u.wins++;
            setHp(u, r.hp);
            lines.push(`👹 الزعيم «${r.bossName}» سقط!`);
            lines.push('', `🏆 انتصرت!  +${helpers.fmt(xp)} ⭐   +${helpers.fmt(gold)} 💰`);
            if (diff >= 2) lines.push('ℹ️ البوابة أدنى من رتبتك فالمكافأة مخفّضة');
            if (Math.random() < 0.2 && u.potions < MAX_POTIONS) { u.potions++; lines.push('💊 أسقط الزعيم جرعة شفاء'); }

            if (g >= 1 && u.shadows.length < MAX_SHADOWS && Math.random() < Math.min(0.6, 0.2 + u.stats.int * 0.003)) {
                const free = SHADOW_NAMES.filter(n => !u.shadows.some(x => x.name === n));
                if (free.length) {
                    const sh = { name: pick(free), g };
                    u.shadows.push(sh);
                    lines.push('', `🌑 [النظام] استخراج الظل ناجح! انضم «${sh.name}» لجيشك (+${5 + g * 8} هجوم)`);
                }
            }
            lines.push(...gainXP(u, xp));
            lines.push(`❤️ الصحة: ${helpers.fmt(hpNow(u))}/${helpers.fmt(derive(u).maxHp)}`);
            save(db);
            return box('🌀 البوابة', lines.join('\n'));
        }

        case 'daily': {
            const now = Date.now(), left = u.lastDaily + DAILY_CD - now;
            if (left > 0) return err(`المهمة اليومية التالية بعد ${helpers.msToTime(left)}`);
            u.streak = (u.lastDaily && now - u.lastDaily < 48 * 3600 * 1000) ? u.streak + 1 : 1;
            u.lastDaily = now;
            const xp = 40 + u.level * 15, gold = 50 + u.level * 10, pts = 3 + Math.floor(u.streak / 5);
            u.points += pts; addMoney(gold);
            const lines = ['[النظام] المهمة اليومية: 💪 100 ضغط  |  🏋️ 100 بطن  |  🏃 10 كم ركض', '✅ أُنجزت المهمة!',
                `🎁 +${xp} ⭐   +${gold} 💰   +${pts} نقطة توزيع`, `🔥 أيام متتالية: ${u.streak}`, ...gainXP(u, xp)];
            save(db);
            return box('📜 المهمة اليومية', lines.join('\n'));
        }

        case 'alloc': {
            const key = STAT_KEYS[toLatin(args[1] || '').toLowerCase()];
            if (!key) {
                save(db);
                if (u.points <= 0) return box('🎯 توزيع النقاط', 'ليس لديك نقاط للتوزيع الآن.\nتحصل على 5 نقاط مع كل مستوى، ونقاط إضافية من المهمة اليومية.');
                const s = u.stats;
                return box('🎯 توزيع النقاط', [`🎯 نقاطك: ${u.points}`, '',
                    `[1] ${STAT_LABEL.str}: ${s.str}  — هجوم`, `[2] ${STAT_LABEL.agi}: ${s.agi}  — تفادٍ وضربات حرجة`,
                    `[3] ${STAT_LABEL.vit}: ${s.vit}  — صحة ودفاع`, `[4] ${STAT_LABEL.int}: ${s.int}  — مهارات وخبرة`].join('\n'), 'alloc');
            }
            if (u.points <= 0) return err('ليس لديك نقاط للتوزيع. ارتقِ بالمستوى أو أنجز المهمة اليومية');
            let n = args[2] === 'كل' ? u.points : (args[2] ? num(args[2]) : 1);
            if (!Number.isFinite(n) || n <= 0) return err('العدد غير صحيح');
            n = Math.min(n, u.points);
            u.stats[key] += n; u.points -= n;
            save(db);
            return box('🎯 توزيع النقاط', `${STAT_LABEL[key]} +${n} ← ${u.stats[key]}\n🎯 المتبقي: ${u.points}\n⚔️ قوة الهجوم: ${helpers.fmt(Math.round(derive(u).atk))}`, u.points > 0 ? 'alloc' : 'main');
        }

        case 'shadows': {
            save(db);
            if (!u.shadows.length) return box('🌑 جيش الظلال', 'لا ظلال بعد.\nاهزم زعماء البوابات من رتبة D فما فوق، وقد تُستخرج لك ظلال تقاتل معك.');
            const list = u.shadows.map((x, i) => `${i + 1}. ${x.name} — بوابة ${GATES[x.g].k} (+${5 + x.g * 8})`).join('\n');
            return box('🌑 جيش الظلال', `${list}\n\n⚔️ مجموع الهجوم المضاف: ${derive(u).shadowAtk}\n🌑 ${u.shadows.length}/${MAX_SHADOWS}`);
        }

        case 'shop': {
            save(db);
            const lines = [`💰 رصيدك: ${moneyText()}`, '', `[1] 💊 جرعة شفاء (تعيد 50% من الصحة) — ${POTION_PRICE} 💰`];
            for (let i = 1; i < WEAPONS.length; i++) {
                const w = WEAPONS[i];
                lines.push(`[${i + 1}] 🗡️ ${w.name} (+${w.atk} هجوم) — ${helpers.fmt(w.price)} 💰${u.weapon === i ? ' ✅' : u.weapon > i ? ' (أدنى من سلاحك)' : ''}`);
            }
            return box('🏪 المتجر', lines.join('\n'), 'shop');
        }

        case 'buy': {
            const stay = 'shop';
            const id = num(args[1]);
            if (!id || id < 1 || id > WEAPONS.length) return err('اكتب رقم الغرض من المتجر');
            if (id === 1) {
                let n = args[2] ? num(args[2]) : 1;
                if (!Number.isFinite(n) || n <= 0) return err('العدد غير صحيح');
                n = Math.min(n, MAX_POTIONS - u.potions);
                if (n <= 0) return err(`حقيبتك ممتلئة (${MAX_POTIONS} جرعة)`);
                if (!canAfford(n * POTION_PRICE)) return err(`تحتاج ${helpers.fmt(n * POTION_PRICE)} 💰 ورصيدك ${helpers.fmt(bal())} 💰`);
                spend(n * POTION_PRICE); u.potions += n;
                save(db);
                return ok(`اشتريت ${n} جرعة. عندك الآن ${u.potions} 💊 ورصيدك ${moneyText()} 💰`, stay);
            }
            const wi = id - 1, w = WEAPONS[wi];
            if (u.weapon >= wi) return err('عندك هذا السلاح أو أفضل منه');
            if (!canAfford(w.price)) return err(`تحتاج ${helpers.fmt(w.price)} 💰 ورصيدك ${helpers.fmt(bal())} 💰`);
            spend(w.price); u.weapon = wi;
            save(db);
            return ok(`اشتريت «${w.name}» ⚔️ +${w.atk} هجوم`, stay);
        }

        case 'potion': {
            if (u.potions <= 0) return err('ما عندك جرعات. اشترِ من المتجر [5]');
            const max = derive(u).maxHp, hp = hpNow(u);
            if (hp >= max) return err('صحتك ممتلئة');
            u.potions--; setHp(u, Math.min(max, hp + max * 0.5));
            save(db);
            return ok(`💊 شُفيت: ${helpers.fmt(hpNow(u))}/${helpers.fmt(max)} ❤️ (بقي ${u.potions} جرعة)`);
        }

        case 'heal': {
            const max = derive(u).maxHp, hp = hpNow(u), cost = Math.max(20, u.level * 15);
            if (hp >= max) return err('صحتك ممتلئة');
            if (!canAfford(cost)) return err(`العلاج الكامل يكلّف ${helpers.fmt(cost)} 💰 ورصيدك ${helpers.fmt(bal())} 💰. وتتعافى تدريجيًا 2% كل دقيقة`);
            spend(cost); setHp(u, max);
            save(db);
            return ok(`🏥 عولجت بالكامل ❤️ ${helpers.fmt(max)}${isUnl(u) ? '' : ` (-${helpers.fmt(cost)} 💰)`}`);
        }

        case 'money': {
            if (typeof cfg.isAdmin !== 'function' || !cfg.isAdmin(uid)) return err('هذا الأمر للمطور فقط');
            const target = args[1] ? toLatin(args[1]).replace(/\D/g, '') : uid;
            if (!target) return err(`اكتب: ${prefix}ديماس مال [أيدي اللاعب]`);
            const t = db[target];
            if (!t) return err('هذا اللاعب لم يبدأ اللعبة بعد');
            if (cfg.isAdmin(target)) { t.unlimited = true; save(db); return box('♾️ المال', `${t.name || target} مطوّر، فماله غير محدود دائمًا`); }
            t.unlimited = !t.unlimited;
            save(db);
            return box('♾️ المال', `${t.name || target}: ${t.unlimited ? 'أصبح ماله غير محدود ♾️' : 'عاد ماله محدودًا'}`);
        }

        case 'top': {
            save(db);
            const top = Object.entries(db).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp).slice(0, 10);
            const names = await helpers.getNames(api, top.map(([id]) => id));
            const medals = ['🥇', '🥈', '🥉'];
            const lines = top.map(([id, x], i) => `${medals[i] || `${i + 1}.`} ${x.name || names[i]} — م${x.level} ${rankLabel(x.level)} 🌑${x.shadows.length}`);
            return box('🏆 أقوى الصيادين', lines.join('\n'));
        }
    }
}

// للاختبار الداخلي فقط
module.exports.__test = { newHunter, derive, fight, gainXP, xpNeed, rankIdx, GATES, WEAPONS, routeReply };
