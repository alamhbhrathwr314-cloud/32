/**
 * نظام الوظائف المركزي
 * يحفظ وظيفة كل مستخدم، مرحلته، وخبرته
 */
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

fs.ensureDirSync(DATA_DIR);

/* ═══ قائمة الوظائف ═══ */
const JOBS = {
    "مزارع": {
        name: "مزارع", emoji: "🌾", level: 1,
        baseReward: 50, cooldown: 30,
        desc: "تعمل في الحقل وتجمع المحصول",
        workText: "زرعت وحصدت المحصول"
    },
    "صياد": {
        name: "صياد", emoji: "🎣", level: 1,
        baseReward: 60, cooldown: 30,
        desc: "تصطاد الأسماك من البحر",
        workText: "اصطدت أسماًكاً طازجة"
    },
    "نجار": {
        name: "نجار", emoji: "🪚", level: 2,
        baseReward: 100, cooldown: 45,
        desc: "تصنع الأثاث من الخشب",
        workText: "صنعت كرسياً جميلاً"
    },
    "حداد": {
        name: "حداد", emoji: "⚒️", level: 2,
        baseReward: 120, cooldown: 45,
        desc: "تصنع الأدوات من الحديد",
        workText: "صنعت سيفاً حديدياً"
    },
    "طباخ": {
        name: "طباخ", emoji: "👨‍🍳", level: 3,
        baseReward: 180, cooldown: 60,
        desc: "تطبخ أطباقاً لذيذة",
        workText: "طبخت طبقاً فاخراً"
    },
    "خباز": {
        name: "خباز", emoji: "🥖", level: 3,
        baseReward: 160, cooldown: 60,
        desc: "تخبز الخبز الطازج",
        workText: "خبزت 100 رغيف"
    },
    "تاجر": {
        name: "تاجر", emoji: "💼", level: 4,
        baseReward: 250, cooldown: 90,
        desc: "تبيع وتشتري في السوق",
        workText: "أتممت صفقة رابحة"
    },
    "مهندس": {
        name: "مهندس", emoji: "👷", level: 4,
        baseReward: 300, cooldown: 90,
        desc: "تبني المشاريع الكبيرة",
        workText: "صممت مبنى حديثاً"
    },
    "طبيب": {
        name: "طبيب", emoji: "👨‍⚕️", level: 5,
        baseReward: 400, cooldown: 120,
        desc: "تعالج المرضى",
        workText: "عالجت 5 مرضى"
    },
    "محامي": {
        name: "محامي", emoji: "⚖️", level: 5,
        baseReward: 450, cooldown: 120,
        desc: "تدافع عن الحقوق",
        workText: "كسبت قضية صعبة"
    },
    "مبرمج": {
        name: "مبرمج", emoji: "💻", level: 6,
        baseReward: 600, cooldown: 150,
        desc: "تكتب الأكواد والبرامج",
        workText: "برمجت تطبيقاً ناجحاً"
    },
    "رجل_أعمال": {
        name: "رجل أعمال", emoji: "💼", level: 7,
        baseReward: 900, cooldown: 180,
        desc: "تدير شركة كبرى",
        workText: "أبرمت عقداً بمليون"
    },
    "ملياردير": {
        name: "ملياردير", emoji: "💰", level: 8,
        baseReward: 1500, cooldown: 240,
        desc: "تدير إمبراطورية اقتصادية",
        workText: "ربحت صفقة ضخمة"
    },
    "رئيس": {
        name: "رئيس الدولة", emoji: "👑", level: 10,
        baseReward: 3000, cooldown: 300,
        desc: "تحكم دولة بأكملها",
        workText: "أصدرت قراراً تاريخياً"
    }
};

/* ═══ المراحل ═══ */
const RANKS = [
    { minXP: 0,      name: "مبتدئ",       emoji: "🌱" },
    { minXP: 100,    name: "عامل",        emoji: "🔨" },
    { minXP: 300,    name: "محترف",       emoji: "⭐" },
    { minXP: 700,    name: "خبير",        emoji: "🌟" },
    { minXP: 1500,   name: "أسطورة",      emoji: "💫" },
    { minXP: 3000,   name: "أسطورة خالدة", emoji: "🏆" }
];

/* ═══ قراءة/كتابة الملفات ═══ */
function loadJobs() {
    try { if (fs.existsSync(JOBS_FILE)) return fs.readJsonSync(JOBS_FILE); } catch (_) {}
    return {};
}

function saveJobs(data) {
    try { fs.writeJsonSync(JOBS_FILE, data, { spaces: 2 }); } catch (_) {}
}

/* ═══ دوال المستخدم ═══ */
function getUser(userID) {
    const all = loadJobs();
    return all[String(userID)] || {
        job: null,
        xp: 0,
        totalEarned: 0,
        workCount: 0,
        lastWork: 0,
        joinedAt: Date.now()
    };
}

function saveUser(userID, data) {
    const all = loadJobs();
    all[String(userID)] = data;
    saveJobs(all);
}

function getRank(xp) {
    let rank = RANKS[0];
    for (const r of RANKS) if (xp >= r.minXP) rank = r;
    return rank;
}

function getNextRank(xp) {
    for (const r of RANKS) if (xp < r.minXP) return r;
    return null;
}

/* ═══ العمل ═══ */
function canWork(user) {
    if (!user.job) return { ok: false, msg: "ليس لديك وظيفة! اختر وظيفة أولاً." };
    const job = JOBS[user.job];
    if (!job) return { ok: false, msg: "وظيفتك غير معروفة." };

    const now = Date.now();
    const left = (user.lastWork + job.cooldown * 1000) - now;
    if (left > 0) {
        return { ok: false, msg: `انتظر ${Math.ceil(left / 1000)} ثانية قبل العمل مجدداً.` };
    }

    return { ok: true, job };
}

function doWork(user, userID) {
    const job = JOBS[user.job];

    // ربح عشوائي ±20%
    const variation = 0.8 + Math.random() * 0.4;
    const reward = Math.floor(job.baseReward * variation);

    // XP إضافي
    const xpGain = Math.floor(reward / 10);

    user.xp += xpGain;
    user.totalEarned += reward;
    user.workCount++;
    user.lastWork = Date.now();

    saveUser(userID, user);

    return { reward, xpGain, job, rank: getRank(user.xp) };
}

/* ═══ الوظائف المتاحة حسب المرحلة ═══ */
function availableJobs(userXP) {
    const rank = getRank(userXP);
    const rankIndex = RANKS.indexOf(rank);
    const maxLevel = rankIndex + 2; // يمكنه الوصول لمستوى أعلى بـ2

    return Object.entries(JOBS)
        .filter(([_, j]) => j.level <= maxLevel)
        .map(([key, j]) => ({ key, ...j }));
}

module.exports = {
    JOBS,
    RANKS,
    getUser,
    saveUser,
    getRank,
    getNextRank,
    canWork,
    doWork,
    availableJobs
};
