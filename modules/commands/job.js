/**
 * 🎮 لعبة الوظائف — .وظيفة
 * تبدأ بالأمر ثم تكمل برسائل عادية بدون بادئة: رقم الوظيفة، اعمل، حالة، تبديل، الغاء
 * (يعتمد على onMessage الذي يستدعيه main.js للرسائل العادية)
 *
 * التقدّم: 10 مستويات تُحسب من الخبرة. كل ترقية تفتح وظائف جديدة وتعطي مكافأة نقاط.
 */
const fs = require('fs-extra');
const path = require('path');

/* ═══════════ الإعدادات ═══════════ */
const DATA_DIR = path.join(__dirname, '..', '..', 'Heba_DB');
const FILE = path.join(DATA_DIR, 'jobs.json');
const SESSION_TTL = Number(process.env.JOBS_SESSION_TTL_MS) || 10 * 60 * 1000; // تنتهي الجلسة بعد 10 دقائق خمول
const HEAD = '⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬';
const CANCEL = ['الغاء', 'إلغاء', 'stop', 'خروج'];
const LEVEL_BONUS = 50; // مكافأة الترقية = 50 × رقم المستوى الجديد

// level = أدنى مستوى للاعب لتظهر له الوظيفة
const JOBS = {
    "مزارع":       { name: "مزارع",       emoji: "🌾", level: 1,  reward: 50,   cooldown: 30,  desc: "تعمل في الحقل" },
    "صياد":        { name: "صياد",        emoji: "🎣", level: 1,  reward: 60,   cooldown: 30,  desc: "تصطاد الأسماك" },
    "نجار":        { name: "نجار",        emoji: "🪚", level: 2,  reward: 100,  cooldown: 45,  desc: "تصنع الأثاث" },
    "حداد":        { name: "حداد",        emoji: "⚒️", level: 2,  reward: 120,  cooldown: 45,  desc: "تصنع الأدوات" },
    "خباز":        { name: "خباز",        emoji: "🥖", level: 3,  reward: 160,  cooldown: 60,  desc: "تخبز الخبز" },
    "طباخ":        { name: "طباخ",        emoji: "👨‍🍳", level: 3,  reward: 180,  cooldown: 60,  desc: "تطبخ الأطباق" },
    "مهندس":       { name: "مهندس",       emoji: "👷", level: 4,  reward: 300,  cooldown: 90,  desc: "تبني المشاريع" },
    "تاجر":        { name: "تاجر",        emoji: "💼", level: 4,  reward: 250,  cooldown: 90,  desc: "تبيع وتشتري" },
    "طبيب":        { name: "طبيب",        emoji: "👨‍⚕️", level: 5,  reward: 400,  cooldown: 120, desc: "تعالج المرضى" },
    "محامي":       { name: "محامي",       emoji: "⚖️", level: 5,  reward: 450,  cooldown: 120, desc: "تدافع عن الحقوق" },
    "مبرمج":       { name: "مبرمج",       emoji: "💻", level: 6,  reward: 600,  cooldown: 150, desc: "تكتب الأكواد" },
    "رجل_أعمال":   { name: "رجل أعمال",   emoji: "🏢", level: 7,  reward: 900,  cooldown: 180, desc: "تدير شركة" },
    "ملياردير":    { name: "ملياردير",    emoji: "💰", level: 8,  reward: 1500, cooldown: 240, desc: "إمبراطورية اقتصادية" },
    "وزير":        { name: "وزير",        emoji: "🏛️", level: 9,  reward: 2200, cooldown: 270, desc: "تدير وزارة" },
    "رئيس":        { name: "رئيس الدولة", emoji: "👑", level: 10, reward: 3000, cooldown: 300, desc: "تحكم دولة" }
};

// خبرة كل مستوى (المستوى = موضع آخر عتبة وصلتها)
const LEVELS = [
    { xp: 0,    title: "مبتدئ",        emoji: "🌱" },
    { xp: 60,   title: "عامل",         emoji: "🔨" },
    { xp: 150,  title: "ماهر",         emoji: "🛠️" },
    { xp: 300,  title: "محترف",        emoji: "⭐" },
    { xp: 500,  title: "خبير",         emoji: "🌟" },
    { xp: 800,  title: "متميز",        emoji: "💎" },
    { xp: 1200, title: "نخبة",         emoji: "🔥" },
    { xp: 1800, title: "أسطورة",       emoji: "💫" },
    { xp: 2600, title: "عظيم",         emoji: "👑" },
    { xp: 3600, title: "أسطورة خالدة", emoji: "🏆" }
];

/* ═══════════ الحفظ ═══════════ */
fs.ensureDirSync(DATA_DIR);

function load() {
    try { if (fs.existsSync(FILE)) return fs.readJsonSync(FILE); } catch (e) { console.error('jobs: فشل قراءة الملف', e.message); }
    return {};
}
function save(data) {
    try { fs.writeJsonSync(FILE, data, { spaces: 2 }); } catch (e) { console.error('jobs: فشل الحفظ', e.message); }
}
const getUser = id => load()[String(id)] || { job: null, xp: 0, earned: 0, works: 0, lastWork: 0 };
function saveUser(id, u) {
    const all = load();
    all[String(id)] = u;
    save(all);
}

/* ═══════════ المستويات والوظائف ═══════════ */
const levelOf = xp => LEVELS.reduce((lv, l, i) => (xp >= l.xp ? i + 1 : lv), 1);
const infoOf = xp => LEVELS[levelOf(xp) - 1];
const nextLevelOf = xp => LEVELS[levelOf(xp)] || null; // null عند أعلى مستوى
const jobsAtLevel = level => Object.entries(JOBS).filter(([, j]) => j.level === level).map(([key, j]) => ({ key, ...j }));
const availableJobs = xp => Object.entries(JOBS).filter(([, j]) => j.level <= levelOf(xp)).map(([key, j]) => ({ key, ...j }));

/** سطران: المستوى والخبرة مع شريط التقدم */
function levelLines(xp, helpers) {
    const info = infoOf(xp);
    const next = nextLevelOf(xp);
    const lines = [`📊 المستوى: ${levelOf(xp)} — ${info.emoji} ${info.title}`];
    if (next) {
        lines.push(`⭐ الخبرة: ${xp} / ${next.xp}`);
        lines.push(helpers.bar(xp - info.xp, next.xp - info.xp));
    } else {
        lines.push(`⭐ الخبرة: ${xp} (أعلى مستوى 🏆)`);
    }
    return lines;
}

/* ═══════════ الجلسات (في الذاكرة) ═══════════ */
const sessions = new Map(); // "thread:user" → { step, jobs, job, at }

function react(api, emoji, messageID, threadID) {
    if (!messageID || !threadID) return;
    try { // المكتبة الحالية تطلب threadID وقد تُرجع Promise مرفوضًا: نلتقطه حتى لا يظهر خطأ في السجل
        const p = api.setMessageReaction(emoji, messageID, threadID, () => {}, true);
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* غير مدعوم */ }
}

async function showMenu({ api, event, helpers }, user) {
    const jobs = availableJobs(user.xp);
    const next = nextLevelOf(user.xp);

    let text = `${HEAD}\n\n`;
    text += levelLines(user.xp, helpers).join('\n') + '\n';
    text += `💼 وظيفتك: ${user.job && JOBS[user.job] ? JOBS[user.job].name : 'بدون'}\n\n`;
    text += `📋 اختر وظيفة (اكتب الرقم فقط):\n\n`;
    jobs.forEach((j, i) => {
        text += `[${i + 1}] ${j.emoji} ${j.name}${user.job === j.key ? ' ✅' : ''}\n`;
        text += `      💰 ${j.reward} | ⏱️ ${j.cooldown}ث\n`;
    });
    if (next) {
        const upcoming = jobsAtLevel(levelOf(user.xp) + 1);
        text += `\n🔒 المستوى ${levelOf(user.xp) + 1} (عند ${next.xp} خبرة)`;
        if (upcoming.length) text += ` يفتح: ${upcoming.map(j => `${j.emoji} ${j.name}`).join('، ')}`;
        text += '\n';
    }
    text += `\n💡 اكتب رقم الوظيفة للاختيار.\n🛑 للإلغاء: الغاء`;

    sessions.set(`${event.threadID}:${event.senderID}`, { step: 'choose_job', jobs, at: Date.now() });
    return helpers.reply(api, event, text);
}

/* ═══════════ الأمر ═══════════ */
module.exports.config = {
    name: 'وظيفة', aliases: ['عمل', 'وظيفتي'],
    description: 'لعبة الوظائف: اعمل وارتقِ لتفتح وظائف أفضل',
    usage: 'وظيفة', category: 'economy', cooldown: 3, adminOnly: false,
    credits: 'ايمن'
};

module.exports.run = async ctx => {
    const { api, event } = ctx;
    react(api, '💼', event.messageID, event.threadID);
    return showMenu(ctx, getUser(event.senderID)); // استدعاء الأمر مجددًا يعرض القائمة من جديد
};

/* ═══════════ معالج الرسائل العادية (يستدعيه main.js) ═══════════ */
module.exports.onMessage = async ctx => {
    const { api, event, helpers, states } = ctx;
    const { threadID, senderID, messageID, body } = event;
    const key = `${threadID}:${senderID}`;
    const session = sessions.get(key);
    if (!session) return false;

    if (Date.now() - session.at > SESSION_TTL) { sessions.delete(key); return false; }

    const input = String(body || '').trim();
    const say = text => helpers.reply(api, event, text);

    if (CANCEL.includes(input)) {
        sessions.delete(key);
        await say(`${HEAD}\n\n✅ تم إنهاء اللعبة.`);
        return true;
    }

    /* ─── اختيار وظيفة ─── */
    if (session.step === 'choose_job') {
        if (!/^\d{1,3}$/.test(input)) return false; // كلام عادي في المحادثة: نتجاهله بصمت
        const num = parseInt(input, 10);
        if (num < 1 || num > session.jobs.length) {
            await say(`${HEAD}\n\n⚠️ اكتب رقمًا من 1 إلى ${session.jobs.length}.`);
            return true;
        }
        const chosen = session.jobs[num - 1];
        const user = getUser(senderID);
        user.job = chosen.key;
        saveUser(senderID, user);

        session.step = 'work';
        session.job = chosen;
        session.at = Date.now();
        react(api, '✅', messageID, threadID);
        await say(
            `${HEAD}\n\n✅ تم تعيينك في: ${chosen.emoji} ${chosen.name}\n\n` +
            `💰 الراتب: ${chosen.reward}\n⏱️ الانتظار: ${chosen.cooldown}ث\n📝 ${chosen.desc}\n\n` +
            `💡 اكتب (اعمل) للبدء.\n🛑 للإلغاء: الغاء`
        );
        return true;
    }

    /* ─── مرحلة العمل ─── */
    if (session.step === 'work') {
        const user = getUser(senderID);
        const job = JOBS[user.job];
        if (!job) {
            sessions.delete(key);
            await say(`${HEAD}\n\n⚠️ ليس لديك وظيفة. اكتب (وظيفة) للبدء من جديد.`);
            return true;
        }

        if (['حالة', 'معلومات', 'انا'].includes(input)) {
            session.at = Date.now();
            const next = nextLevelOf(user.xp);
            let text = `${HEAD}\n\n${job.emoji} الوظيفة: ${job.name}\n`;
            text += levelLines(user.xp, helpers).join('\n') + '\n';
            text += `💵 إجمالي الأرباح: ${user.earned}\n📈 عدد مرات العمل: ${user.works}\n`;
            if (next) text += `🎯 للترقية للمستوى ${levelOf(user.xp) + 1}: ينقصك ${next.xp - user.xp} خبرة`;
            text += `\n\n💡 اكتب (اعمل) للعمل\n🔄 لتبديل الوظيفة: (تبديل)\n🛑 للخروج: الغاء`;
            await say(text);
            return true;
        }

        if (['تبديل', 'تغيير', 'وظائف'].includes(input)) {
            await showMenu(ctx, user);
            return true;
        }

        if (!['اعمل', 'عمل', 'work'].includes(input)) return false; // أي كلام آخر: نتجاهله بصمت

        session.at = Date.now();
        const now = Date.now();
        const left = user.lastWork + job.cooldown * 1000 - now;
        if (left > 0) {
            await say(`${HEAD}\n\n⏱️ انتظر ${Math.ceil(left / 1000)} ثانية.`);
            return true;
        }

        const levelBefore = levelOf(user.xp);
        const reward = Math.floor(job.reward * (0.8 + Math.random() * 0.4));
        const xpGain = Math.max(3, Math.floor(reward / 8));

        user.xp += xpGain;
        user.earned += reward;
        user.works++;
        user.lastWork = now;
        saveUser(senderID, user);

        // الترقية: مكافأة عن كل مستوى جديد + قائمة الوظائف التي انفتحت
        const levelAfter = levelOf(user.xp);
        let bonus = 0;
        const unlocked = [];
        for (let lv = levelBefore + 1; lv <= levelAfter; lv++) {
            bonus += LEVEL_BONUS * lv;
            unlocked.push(...jobsAtLevel(lv));
        }

        // النقاط تدخل في رصيد البوت العام (نفس نقاط .رصيد و.يومي)
        const wallet = states.getData(String(senderID));
        wallet.points += reward + bonus;
        states.saveData(String(senderID), wallet);

        let text = `⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬\n\n${job.emoji} ${job.name} انتهى من العمل!\n\n`;
        text += `💰 ربحت: ${reward} نقطة\n⭐ خبرة: +${xpGain}\n`;
        text += `💵 رصيدك: ${helpers.fmt(wallet.points)}\n`;

        if (levelAfter > levelBefore) {
            const info = infoOf(user.xp);
            text += `\n🎉 ترقية! وصلت للمستوى ${levelAfter} — ${info.emoji} ${info.title}\n`;
            text += `🎁 مكافأة الترقية: +${helpers.fmt(bonus)} نقطة\n`;
            if (unlocked.length) {
                text += `\n🔓 وظائف جديدة انفتحت لك:\n`;
                text += unlocked.map(j => `   ${j.emoji} ${j.name} — 💰 ${j.reward} | ⏱️ ${j.cooldown}ث`).join('\n');
                text += `\n💡 اكتب (تبديل) لاختيار وظيفة جديدة.`;
            }
            react(api, '🎉', messageID, threadID);
        } else {
            const next = nextLevelOf(user.xp);
            text += next ? `${levelLines(user.xp, helpers)[2]}\n🎯 ينقصك ${next.xp - user.xp} خبرة للترقية\n` : '';
            react(api, '💰', messageID, threadID);
        }
        text += `\n\n💡 اكتب (اعمل) مجددًا بعد ${job.cooldown}ث.`;

        await say(text);
        return true;
    }

    return false;
};
