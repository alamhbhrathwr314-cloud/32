/**
 * ◈ ───『 المشغّل الرئيسي لبوت كيرا 』─── ◈
 * يسجّل الدخول بالكوكيز (appstate.json) ويحمّل الأوامر من modules/commands
 */
const fs = require('fs-extra');
const path = require('path');
const log = require('./utils/log');

const config = require('./config.json');
global.config = config;
global.client = { api: null, commands: new Map(), aliases: new Map(), cooldowns: new Map(), startedAt: Date.now() };
global.data = { threadData: new Map() };
global.language = {
    utils: { throwError: '⚠️ استخدام غير صحيح للأمر. اكتب %1اوامر %2 لمعرفة طريقة الاستخدام.' }
};
global.getText = (mod, key, ...args) => {
    let text = (global.language[mod] && global.language[mod][key]) || key;
    args.forEach((a, i) => { text = text.split('%' + (i + 1)).join(a); });
    return text;
};

const utils = require('./utils');
const cfg = require('./utils/config');
const deco = require('./utils/decorations');
const states = require('./utils/db/states');
const users = require('./utils/db/users');
const helpers = require('./utils/helpers');
const power = require('./utils/power');
const { parseCookies } = require('./utils/cookies');
const credLogin = require('./utils/credLogin'); // دخول احتياطي ببيانات الحساب (FB_EMAIL / FB_PASSWORD)
const session = require('./utils/session'); // حفظ الكوكيز المحدّثة (يرفعها cloudSync إلى GitHub)
const autoLeave = require('./utils/autoLeave'); // مغادرة مجموعات «طلبات المراسلة» تلقائيًا
const panel = require('./utils/panel'); // لوحة التحكم الويب (لا تعمل إلا مع PANEL_PASSWORD)

process.on('unhandledRejection', e => log(String(e && e.stack || e), 'error'));
process.on('uncaughtException', e => log(String(e && e.stack || e), 'error'));

/* ─────────── تحميل الأوامر ─────────── */
function loadCommands() {
    const dir = path.join(__dirname, 'modules', 'commands');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        try {
            const cmd = require(path.join(dir, file));
            if (!cmd.config || !cmd.config.name || typeof cmd.run !== 'function') {
                throw new Error('الملف ينقصه config.name أو دالة run');
            }
            const name = cmd.config.name.toLowerCase();
            if (global.client.commands.has(name)) throw new Error('اسم الأمر مكرر');
            global.client.commands.set(name, cmd);
            for (const a of cmd.config.aliases || []) global.client.aliases.set(a.toLowerCase(), name);
            log.loader(`تم تحميل الأمر: ${name}`);
        } catch (e) {
            log.loader(`فشل تحميل ${file}: ${e.message}`, 'error');
        }
    }
    log.loader(`إجمالي الأوامر: ${global.client.commands.size}`);
}

/* ─────────── معالجة الرسائل ─────────── */
const xpCooldown = new Map();
let botID = '';

/** يسجّل المستخدم في Heba_DB/users.json (بدون نص الرسائل) ويجلب اسمه مرة واحدة أسبوعيًا */
function recordUser(api, senderID, threadID) {
    try {
        users.touch(senderID, threadID);
        if (users.needsName(senderID)) {
            helpers.getName(api, String(senderID))
                .then(name => { if (name && !/^مستخدم \d{4}$/.test(name)) users.setName(senderID, name); })
                .catch(() => {});
        }
    } catch (e) {
        log('تعذر تسجيل المستخدم: ' + e.message, 'warn');
    }
}

/** الأوامر التي تصدّر onMessage تستقبل الرسائل العادية (بلا بادئة)، وإن أعادت true توقفنا */
async function runMessageHooks(ctx) {
    for (const cmd of global.client.commands.values()) {
        if (typeof cmd.onMessage !== 'function') continue;
        try {
            if (await cmd.onMessage(ctx)) return true;
        } catch (e) {
            log(`خطأ في معالج الرسائل (${cmd.config.name}): ${e && e.stack || e}`, 'error');
        }
    }
    return false;
}

/** الأوامر التي تصدّر onEvent تستقبل أحداث المجموعة (تغيير الاسم/الكنية/الصورة...) */
async function runEventHooks(api, event) {
    if (power.isOff(event.threadID)) return;          // البوت موقوف في هذه المجموعة
    const ctx = { api, event, helpers, states, deco, cfg, utils };
    for (const cmd of global.client.commands.values()) {
        if (typeof cmd.onEvent !== 'function') continue;
        try { await cmd.onEvent(ctx); }
        catch (e) { log(`خطأ في معالج الأحداث (${cmd.config.name}): ${e && e.stack || e}`, 'error'); }
    }
}

async function handleMessage(api, event) {
    const { senderID, threadID, messageID, body } = event;
    if (!body || String(senderID) === String(botID)) return;

    // موقوف في هذه المجموعة؟ لا نرد على أحد، إلا أمر ايقاف/تشغيل من المطور ليتمكن من إعادة التشغيل
    if (power.isOff(threadID) && !power.isPowerCommand(body, cfg.getPrefix(), cfg.isAdmin(String(senderID)))) return;

    if (panel.isBanned(senderID) && !cfg.isAdmin(String(senderID))) return; // محظور من لوحة التحكم

    recordUser(api, senderID, threadID);
    panel.noteMessage(threadID);

    // خبرة على الرسائل العادية (مرة كل 30 ثانية لكل مستخدم)
    const now = Date.now();
    if (now - (xpCooldown.get(senderID) || 0) > 30000) {
        xpCooldown.set(senderID, now);
        helpers.addXP(senderID, 5 + Math.floor(Math.random() * 11)); // يُسجَّل المستوى بصمت بدون إرسال رسالة
    }

    const prefix = cfg.getPrefix();
    if (!body.startsWith(prefix)) {
        await runMessageHooks({ api, event, helpers, states, deco, cfg, utils }); // رسائل عادية (مثل ردود لعبة الوظائف)
        return;
    }

    const args = body.slice(prefix.length).trim().split(/\s+/);
    const input = (args.shift() || '').toLowerCase();
    if (!input) return;

    const { commands, aliases, cooldowns } = global.client;
    const cmd = commands.get(input) || commands.get(aliases.get(input));
    if (!cmd) return;
    if (panel.isDisabled(cmd.config.name)) return; // عطّلته لوحة التحكم

    const isAdmin = cfg.isAdmin(String(senderID));
    if (cmd.config.adminOnly && !isAdmin) {
        return helpers.reply(api, event, deco.reject('هذا الأمر للمطور فقط'));
    }

    const cdSeconds = cmd.config.cooldown || 0;
    if (cdSeconds && !isAdmin) {
        const key = `${cmd.config.name}:${senderID}`;
        const left = (cooldowns.get(key) || 0) + cdSeconds * 1000 - now;
        if (left > 0) {
            return helpers.reply(api, event, deco.warning(`انتظر ${Math.ceil(left / 1000)} ثانية`));
        }
        cooldowns.set(key, now);
    }

    try {
        log(`${cmd.config.name} ← ${senderID}`, 'CMD');
        panel.noteCommand(cmd.config.name, threadID, senderID);
        await cmd.run({ api, event, args, helpers, states, deco, cfg, utils });
    } catch (e) {
        log(`خطأ في الأمر ${cmd.config.name}: ${e && e.stack || e}`, 'error');
        helpers.reply(api, event, deco.errorBox('حدث خطأ أثناء تنفيذ الأمر'));
    }
}

/* ─────────── تسجيل الدخول ─────────── */
function findFCA() {
    const candidates = [process.env.FCA_MODULE, config.FCA_MODULE, '@dongdev/fca-unofficial', 'biar-fca', 'nexus-fca', 'fca-unofficial', 'ws3-fca'].filter(Boolean);
    for (const name of candidates) {
        try {
            const lib = require(name);
            let version = '?';
            try { version = require(name + '/package.json').version; } catch (e) { /* تجاهل */ }
            log.loader(`مكتبة الدخول: ${name}@${version}`);
            // بعض المكتبات (biar-fca / nexus-fca) تصدّر دالة الدخول داخل كائن
            if (typeof lib !== 'function') lib = lib.login || lib.default || lib;
            return lib;
        } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
    }
    throw new Error('لم أجد مكتبة تسجيل الدخول. نفّذ: npm install');
}

/* ─────────── إعادة الاتصال التلقائي ─────────── */
const num = (name, def) => Number(process.env[name]) || def;
const MIN_DELAY = num('RECONNECT_MIN_MS', 5000);        // أول انتظار قبل إعادة المحاولة
const MAX_DELAY = num('RECONNECT_MAX_MS', 300000);      // أقصى انتظار (5 دقائق)
const MAX_FAILURES = num('RECONNECT_MAX_FAILURES', 5);  // بعدها نتوقف لحماية الحساب
const STABLE_MS = num('RECONNECT_STABLE_MS', 120000);   // اتصال أطول من هذا يُعدّ ناجحًا
const LOGIN_TIMEOUT = num('LOGIN_TIMEOUT_MS', 90000);
const FATAL = /not logged in|checkpoint|login-approval|incorrect|expired|invalid|blocked/i;

const DEBUG_EVENTS = process.env.DEBUG_EVENTS === '1';
let traceLeft = 0; // نسجّل أول 10 أحداث بعد كل اتصال لنتأكد أن الرسائل تصل
function traceEvent(event) {
    if (['presence', 'typ', 'read_receipt'].includes(event.type)) return; // أحداث كثيرة لا تهمنا
    if (!DEBUG_EVENTS && traceLeft <= 0) return;
    traceLeft--;
    const from = event.senderID || event.author || '-';
    const self = String(from) === String(botID) ? ' (من حساب البوت نفسه: يُتجاهل)' : '';
    log(`حدث وارد: ${event.type} | من: ${from}${self} | نص: ${String(event.body || '').slice(0, 40)}`, 'EVT');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errMsg = e => (typeof e === 'string' ? e : (e && (e.error || e.message)) || JSON.stringify(e));

function loginOnce(login, appState) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('انتهت مهلة تسجيل الدخول')), LOGIN_TIMEOUT);
        try {
            login({ appState }, (err, api) => {
                clearTimeout(timer);
                if (err) return reject(new Error(errMsg(err)));
                resolve(api);
            });
        } catch (e) { clearTimeout(timer); reject(e); }
    });
}

/* تبديل الكوكيز يدويًا (أمر رفع كوكيز / لوحة التحكم) */
let pendingState = null;   // كوكيز جديدة بانتظار تسجيل الدخول بها
let wakeUp = null;         // يوقظ الحلقة إن كانت متوقفة تنتظر كوكيز
let dropNow = null;        // يقطع الاتصال الحالي ليعيد الدخول بالكوكيز الجديدة

/** يستمع للرسائل ويرجع (resolve) عند انقطاع الاتصال مع سبب الانقطاع */
function listenUntilDrop(api) {
    return new Promise(resolve => {
        let finished = false, stop;
        const finish = reason => {
            if (finished) return;
            finished = true;
            dropNow = null;
            try { if (typeof stop === 'function') stop(); } catch (e) { /* تجاهل */ }
            resolve(reason);
        };
        dropNow = finish;
        stop = (api.listenMqtt || api.listen).call(api, (e, event) => {
            if (finished) return;
            if (e) return finish(e);
            traceEvent(event);
            if (event.type === 'message' || event.type === 'message_reply') {
                if (String(event.senderID) !== String(botID)) { try { require('./utils/humanize').onIncoming(api, event); } catch (e) { /* تجاهل */ } }
                handleMessage(api, event);
            }
            else if (event.type === 'event') {
                require('./utils/ownerLock').ownerLock(api, event, cfg).catch(e => log(`خطأ في قفل المطور: ${e && e.stack || e}`, 'error'));
                require('./utils/botNick').handleEvent(api, event, cfg).catch(e => log(`خطأ في كنية البوت: ${e && e.stack || e}`, 'error'));
                runEventHooks(api, event);
            }
        });
        if (finished) { try { if (typeof stop === 'function') stop(); } catch (e) { /* تجاهل */ } }
    });
}

function setupSession(api, ctx) {
    api.setOptions({ listenEvents: true, selfListen: false, logLevel: 'silent', updatePresence: false, forceLogin: true });
    try { require('./utils/humanize').wrap(api); } catch (e) { log('تعذر تفعيل السلوك البشري: ' + e.message, 'warn'); }
    global.client.api = api;
    botID = api.getCurrentUserID();
    log.loader(`تم تسجيل الدخول: ${botID} — بانتظار الرسائل...`);
    traceLeft = 10;
    try { require('./utils/botNick').startSweep(() => global.client.api || api); } // ضبط كنية البوت في كل المجموعات (ببطء وفي الخلفية)
    catch (e) { log('تعذر بدء ضبط الكنية: ' + e.message, 'warn'); }
    let fresh = null;
    try { // حفظ الكوكيز المحدّثة
        fresh = api.getAppState();
        if (!ctx.fromEnv && Array.isArray(fresh) && fresh.length) {
            const text = JSON.stringify(fresh, null, 2);
            fs.writeFileSync(ctx.appPath, text);
            ctx.srcHash = session.hash(text);          // ملف المصدر تغيّر بأيدينا، لا يُعدّ تعديلًا يدويًا
        }
    } catch (e) { /* تجاهل */ }
    // حفظ دائم (Heba_DB/fb_cookies.json) + تحديث دوري، وcloudSync يرفعه إلى GitHub فتبقى بعد إعادة النشر
    session.setProvider(() => { try { return api.getAppState(); } catch (e) { return null; } }, () => ctx.srcHash);
    if (!pendingState && Array.isArray(fresh) && fresh.length) session.save(fresh, 'login', ctx.srcHash); // لا نكتب فوق كوكيز رُفعت للتو
    autoLeave.start(api, cfg, (m, t) => log(m, t || 'LEAVE'));
    clearInterval(ctx.refreshTimer);
    ctx.refreshTimer = setInterval(() => session.flushNow(), Math.max(1, num('COOKIE_SAVE_MIN', 15)) * 60 * 1000);
    ctx.refreshTimer.unref();
    return Array.isArray(fresh) && fresh.length ? fresh : null;
}

/**
 * يبقي البوت شغالًا: عند أي انقطاع يعيد تسجيل الدخول بانتظار متزايد (5ث، 10ث، 20ث...).
 * إن تكرر فشل الدخول/الجلسة MAX_FAILURES مرات متتالية يتوقف، لأن الكوكيز غالبًا انتهت
 * والاستمرار بالمحاولة قد يعرّض الحساب للحظر.
 */
async function runWithAutoReconnect(appState, ctx) {
    const login = findFCA();
    let failures = 0;
    let delay = MIN_DELAY;
    const CRED_MAX = num('FB_LOGIN_MAX_TRIES', 2);   // محاولات الدخول ببيانات الحساب لكل تشغيل (لحماية الحساب)
    let credTries = 0;

    for (;;) {
        if (pendingState) {                          // كوكيز جديدة وصلت (أمر رفع كوكيز أو اللوحة)
            appState = pendingState; pendingState = null;
            failures = 0; delay = MIN_DELAY;
            log.loader('تم استلام كوكيز جديدة، جارٍ الدخول بها...');
        }
        const startedAt = Date.now();
        let problem, counted = false;
        try {
            log.loader('جارٍ تسجيل الدخول إلى فيسبوك...');
            let api;
            if (appState) api = await loginOnce(login, appState);
            else { credTries++; log.loader(`الدخول ببيانات الحساب (محاولة ${credTries}/${CRED_MAX})...`); api = await credLogin.login(login, { timeout: LOGIN_TIMEOUT * 2, log }); }
            appState = setupSession(api, ctx) || appState;
            global.client.connectedAt = Date.now();                          // لأمر «حالة»
            global.client.logins = (global.client.logins || 0) + 1;
            const drop = pendingState ? 'تجديد الكوكيز يدويًا' : await listenUntilDrop(api);
            problem = errMsg(drop);
            counted = FATAL.test(problem);          // انقطاع عابر لا يُحسب، أما خطأ الجلسة فيُحسب
        } catch (e) {
            problem = errMsg(e);
            counted = true;                          // فشل تسجيل الدخول يُحسب
        }

        if (Date.now() - startedAt > STABLE_MS) { failures = 0; delay = MIN_DELAY; } // كان الاتصال مستقرًا
        if (counted) failures++;
        log(`انقطع الاتصال: ${problem}`, 'warn');

        // الكوكيز انتهت: نجرّب الدخول ببيانات الحساب (محدود المحاولات)، وإلا ننتظر كوكيز جديدة
        if (appState && credLogin.has() && credTries < CRED_MAX && /not logged in|expired|invalid|login|checkpoint/i.test(problem)) {
            log('الكوكيز لم تعد صالحة، سأجرّب الدخول ببيانات الحساب', 'warn');
            appState = null; failures = 0;
        }
        if (!appState && credTries >= CRED_MAX) failures = MAX_FAILURES;

        if (failures >= MAX_FAILURES) {
            // لا نغلق العملية (حتى تبقى اللوحة شغّالة ويمكنك إرسال كوكيز جديدة منها)، فقط ننتظر
            log(`تكرر الفشل ${failures} مرات متتالية، أوقفت المحاولة. جدّد الكوكيز من لوحة التحكم (أو غيّر FB_COOKIE).`, 'error');
            if (!pendingState) await new Promise(r => { wakeUp = r; });
            wakeUp = null;
            continue;
        }
        if (pendingState) continue;                  // وصلت كوكيز جديدة أثناء الانقطاع: ادخل بها فورًا
        log.loader(`إعادة المحاولة بعد ${Math.round(delay / 1000)} ثانية (فشل متتالٍ: ${failures}/${MAX_FAILURES})`);
        await sleep(delay);
        delay = Math.min(delay * 2, MAX_DELAY);
    }
}

function start() {
    loadCommands();

    // الوضع الرسمي (Messenger Platform): يُفعَّل بوجود PAGE_ACCESS_TOKEN، بدون كوكيز
    if (process.env.PAGE_ACCESS_TOKEN) {
        log.loader('الوضع الرسمي: Messenger Platform (بدون كوكيز)');
        const extra = (process.env.ADMIN_PSIDS || '').split(',').map(x => x.trim()).filter(Boolean);
        config.ADMINBOT = [...(config.ADMINBOT || []), ...extra]; // الأدمن هنا يُعرَّف بأيدي PSID
        botID = process.env.PAGE_ID || '';
        const official = require('./utils/official');
        global.client.api = official.start({ onMessage: (api, event) => handleMessage(api, event) });
        return;
    }

    const appPath = path.join(__dirname, config.APPSTATE_PATH || 'appstate.json');
    // الأولوية لمتغير البيئة FB_COOKIE (مناسب للاستضافة)، ثم ملف appstate.json
    const fromEnv = process.env.FB_COOKIE || process.env.APPSTATE || '';
    let rawCookies = String(fromEnv || '').trim();
    if (!rawCookies && fs.existsSync(appPath)) rawCookies = fs.readFileSync(appPath, 'utf8');
    rawCookies = String(rawCookies || '').trim();
    if (/^(\[\s*\]|\{\s*\})$/.test(rawCookies)) rawCookies = '';   // ملف فارغ أو [] أو {} = لا توجد كوكيز

    // الكوكيز المحفوظة (أحدث) تتقدّم على المصدر الأصلي، إلا إن غيّرتَ المصدر بنفسك (FB_COOKIE جديد مثلًا)
    const srcHash = rawCookies ? session.hash(rawCookies) : '';
    const saved = session.load();
    const useSaved = !!saved && (!rawCookies || saved.srcHash === srcHash);
    if (!rawCookies && !useSaved && !credLogin.has()) {
        log('لا توجد كوكيز: أضف متغير FB_COOKIE أو ضع ملف appstate.json بجانب main.js، أو أضف FB_EMAIL و FB_PASSWORD للدخول ببيانات الحساب', 'error');
        process.exit(1);
    }
    let appState = null;
    if (!rawCookies && !useSaved) {
        log.loader('لا توجد كوكيز: سأسجّل الدخول ببيانات الحساب (FB_EMAIL / FB_PASSWORD)');
    } else if (useSaved) {
        appState = saved.state;
        log.loader(`الكوكيز المحفوظة (${saved.origin}) من ${saved.savedAt}`);
    } else {
        try { appState = parseCookies(rawCookies); }
        catch (e) {
            if (!credLogin.has()) { log('مشكلة في الكوكيز: ' + e.message, 'error'); process.exit(1); }
            log('مشكلة في الكوكيز: ' + e.message + ' — سأجرّب الدخول ببيانات الحساب', 'warn');
            appState = null;
        }
        if (saved) log.loader('اكتشفت كوكيز جديدة في المصدر (FB_COOKIE/appstate.json)، سأستعملها بدل المحفوظة');
    }

    const ctx = { appPath, fromEnv, srcHash };
    // يرفع الكوكيز المحفوظة إلى GitHub ثم يحدّث FB_COOKIE في Render (إن ضُبط RENDER_API_KEY؛ تحديثه يعيد تشغيل الخدمة)
    async function publishCookies(state) {
        const out = { pushed: 0, render: 'skipped' };
        try { out.pushed = Number(await require('./utils/cloudSync').pushChanges()) || 0; } catch (e) { /* تجاهل */ }
        if (ctx.fromEnv) {                           // الكوكيز ليست من المتغير: لا حاجة لتعديل Render
            try {
                const r = await require('./utils/renderEnv').update(state);
                out.render = r && r.ok ? 'ok' : 'skipped';
                if (out.render === 'ok') log.loader('تم تحديث FB_COOKIE في Render');
            } catch (e) { out.render = 'failed'; log('تعذّر تحديث FB_COOKIE في Render: ' + e.message, 'warn'); }
        }
        return out;
    }

    // يحفظ كوكيز الحساب الحالية كما هي في الجلسة الشغّالة (بدون لصق من المطور): أمر «حفظ كوكيز»
    global.client.saveLiveCookies = async () => {
        const api = global.client.api;
        if (!api || typeof api.getAppState !== 'function') throw new Error('البوت غير متصل بفيسبوك الآن');
        const state = api.getAppState();
        if (!session.valid(state)) throw new Error('تعذّر قراءة كوكيز الجلسة الحالية');
        session.save(state, 'manual', ctx.srcHash);
        const r = await publishCookies(state);
        return { count: state.length, ...r };
    };

    // كوكيز جديدة يلصقها المطور (الأمر أو اللوحة): تُحفظ ويعيد البوت الدخول بها
    global.client.applyCookies = (state, origin) => {
        if (!session.valid(state)) throw new Error('الكوكيز ناقصة: لازم c_user و xs');
        session.save(state, origin || 'upload', ctx.srcHash);
        pendingState = state;
        session.setProvider(null);                              // لا نسمح للجلسة القديمة بالكتابة فوق الجديدة
        if (wakeUp) { const w = wakeUp; wakeUp = null; w(); }   // كان متوقفًا ينتظر
        else if (dropNow) setTimeout(() => { if (dropNow) dropNow('تجديد الكوكيز يدويًا'); }, 1500); // بعد إرسال رد التأكيد
        publishCookies(state).catch(() => {});
    };

    setInterval(() => {}, 1 << 30); // يمنع انتهاء العملية بصمت
    runWithAutoReconnect(appState, ctx);
}

start();
