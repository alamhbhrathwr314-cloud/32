/**
 * 🖥️ لوحة تحكم الويب للبوت
 * تعمل على نفس خادم keepalive (نفس المنفذ PORT) ولا تحتاج استضافة ثانية.
 *
 * التفعيل: ضع المتغير PANEL_PASSWORD في الاستضافة (8 أحرف على الأقل).
 *   بدونه تبقى اللوحة معطّلة والخادم يرد كما كان (kira-bot is running).
 *
 * الصفحات:  GET /  ← واجهة اللوحة      /api/*  ← واجهة برمجية (تحتاج دخولًا)
 * الحماية:  كلمة سر + كوكي موقّع (HttpOnly, SameSite=Strict) + حد لمحاولات الدخول + ترويسة X-Panel للطلبات المغيّرة.
 * البيانات: راجع utils/panelData.js
 */
const fs = require('fs');
const path = require('path');
const util = require('util');
const crypto = require('crypto');
const data = require('./panelData');

const PASSWORD = process.env.PANEL_PASSWORD || '';
const ENABLED = PASSWORD.length >= 8;
const PAGE = path.join(__dirname, 'panel.html');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const SECRET = crypto.createHash('sha256').update('kira-panel:' + PASSWORD).digest();

if (PASSWORD && !ENABLED) console.log('panel: PANEL_PASSWORD أقصر من 8 أحرف، اللوحة معطّلة');

/* ─────────── حالة الاتصال (تُستنتج من سطور سجل main.js) ─────────── */
const conn = { state: 'connecting', since: Date.now(), lastDrop: null };
function trackConn(text) {
    if (/تم تسجيل الدخول:/.test(text)) { conn.state = 'online'; conn.since = Date.now(); }
    else if (/انقطع الاتصال:/.test(text)) {
        conn.state = 'offline'; conn.since = Date.now();
        conn.lastDrop = { t: Date.now(), text: text.split('انقطع الاتصال:')[1].trim().slice(0, 200) };
    }
    else if (/أوقفت المحاولة/.test(text)) conn.state = 'stopped';
    else if (/لا توجد كوكيز|مشكلة في الكوكيز/.test(text)) { conn.state = 'stopped'; conn.lastDrop = { t: Date.now(), text: text.slice(0, 200) }; }
    else if (/جارٍ تسجيل الدخول إلى فيسبوك/.test(text) && conn.state !== 'online') conn.state = 'connecting';
}
const COOKIE_WORDS = /checkpoint|login-approval|not logged in|incorrect|expired|invalid|blocked|كوكيز|تحقق/i;

function buildAlert() {
    const drop = conn.lastDrop;
    if (conn.state === 'online') {
        if (drop && Date.now() - drop.t < 30 * 60 * 1000) {
            return { level: 'warn', title: 'حدث انقطاع ثم عاد الاتصال', text: drop.text, minutes: Math.round((Date.now() - drop.t) / 60000), cookie: false };
        }
        return null;
    }
    const starting = conn.state === 'connecting' && Date.now() - conn.since < 150000;
    const cookie = conn.state === 'stopped' || (!!drop && COOKIE_WORDS.test(drop.text));
    return {
        level: starting ? 'info' : 'bad',
        title: starting ? 'جارٍ الاتصال بفيسبوك...' : (conn.state === 'stopped' ? 'توقف البوت عن إعادة المحاولة' : 'البوت غير متصل'),
        text: drop ? drop.text : '', minutes: drop ? Math.round((Date.now() - drop.t) / 60000) : 0, cookie
    };
}

/* ─────────── التقاط السجل (آخر 300 سطر) ─────────── */
const LOG_MAX = 300;
const logs = [];
let logId = 0;
const ANSI = /\u001b\[[0-9;]*m/g;

function installLogCapture() {
    if (!ENABLED || console.__panelCapture) return;
    console.__panelCapture = true;
    for (const level of ['log', 'warn', 'error']) {
        const orig = console[level].bind(console);
        console[level] = (...args) => {
            try {
                const text = args.map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: 1, breakLength: Infinity })))
                    .join(' ').replace(ANSI, '').slice(0, 500);
                logs.push({ id: ++logId, t: Date.now(), l: level, text });
                if (logs.length > LOG_MAX) logs.shift();
                trackConn(text);
            } catch (e) { /* لا نكسر الطباعة الأصلية */ }
            orig(...args);
        };
    }
}
installLogCapture();

/* ─────────── خطافات يستدعيها main.js (تعمل فقط حين تكون اللوحة مفعّلة) ─────────── */
const isDisabled = name => ENABLED && data.disabled.has(String(name).toLowerCase());
const isBanned = id => ENABLED && data.banned.has(String(id));
function noteMessage(threadID) { if (ENABLED) data.noteMessage(threadID); }
function noteCommand(name, threadID, userID) { if (ENABLED) data.noteCommand(name, threadID, userID); }

/* ─────────── الجلسات وكلمة السر ─────────── */
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const safeEq = (a, b) => { const A = Buffer.from(a), B = Buffer.from(b); return A.length === B.length && crypto.timingSafeEqual(A, B); };
const passwordOk = input => crypto.timingSafeEqual(sha(input), sha(PASSWORD));

function makeToken() { const exp = String(Date.now() + SESSION_MS); return `${exp}.${sign(exp)}`; }
function validToken(tok) {
    if (!tok || typeof tok !== 'string') return false;
    const [exp, sig] = tok.split('.');
    if (!exp || !sig || !(Number(exp) > Date.now())) return false;
    return safeEq(sig, sign(exp));
}
function getCookie(req, name) {
    for (const part of String(req.headers.cookie || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return '';
}
const isAuthed = req => validToken(getCookie(req, 'kp'));
const isHttps = req => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const cookieHeader = (req, value, maxAge) =>
    `kp=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

/* حد محاولات الدخول الفاشلة: 5 لكل IP و10 إجمالًا كل 10 دقائق */
const WINDOW = 10 * 60 * 1000;
const fails = new Map();
let allFails = [];
const clientIP = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim();
const recent = arr => arr.filter(t => Date.now() - t < WINDOW);
function loginBlocked(ip) {
    allFails = recent(allFails);
    const mine = recent(fails.get(ip) || []);
    fails.set(ip, mine);
    if (fails.size > 500) fails.clear();
    return mine.length >= 5 || allFails.length >= 10;
}
function recordFail(ip) { const now = Date.now(); allFails.push(now); fails.set(ip, [...recent(fails.get(ip) || []), now]); }

/* ─────────── أدوات HTTP ─────────── */
function baseHeaders(extra) {
    return Object.assign({
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY'
    }, extra);
}
function json(res, code, obj, extra) {
    res.writeHead(code, baseHeaders(Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra)));
    res.end(JSON.stringify(obj));
}
function readRaw(req, max) {
    return new Promise(resolve => {
        let size = 0, dead = false; const chunks = [];
        req.on('data', c => {
            if (dead) return;
            size += c.length;
            if (size > max) { dead = true; chunks.length = 0; resolve(null); } else chunks.push(c);
        });
        req.on('end', () => { if (!dead) resolve(Buffer.concat(chunks)); });
        req.on('error', () => { if (!dead) { dead = true; resolve(null); } });
    });
}
async function readBody(req, max) {
    const buf = await readRaw(req, max || 10240);
    if (!buf) return null;
    try { return JSON.parse(buf.toString('utf8') || '{}'); } catch (e) { return null; }
}
function sendPage(req, res) {
    let html;
    try { html = fs.readFileSync(PAGE, 'utf8'); } catch (e) { res.writeHead(500); return res.end('panel.html مفقود'); }
    const nonce = crypto.randomBytes(16).toString('base64');
    html = html.split('__NONCE__').join(nonce);
    res.writeHead(200, baseHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    }));
    res.end(req.method === 'HEAD' ? undefined : html);
}

/* ─────────── عمليات تحتاج البوت ─────────── */
let broadcasting = false;
const botApi = () => (global.client && global.client.api) || null;

/** يشغّل الأمر اشعار نفسه (فيبقى ربط الردود وفاصل الأمان كما هو). النتيجة تصل المطور على ماسنجر وفي السجل */
async function startBroadcast(text) {
    const cmds = (global.client && global.client.commands) || new Map();
    const cmd = cmds.get('اشعار');
    const api = botApi();
    if (!cmd) throw new Error('أمر اشعار غير محمّل');
    if (!api || conn.state !== 'online') throw new Error('البوت غير متصل بفيسبوك الآن');
    if (typeof api.getThreadList !== 'function') throw new Error('الإرسال الجماعي غير مدعوم في هذا الوضع');
    if (broadcasting) throw new Error('هناك إشعار قيد الإرسال');
    const cfg = require('./config');
    const owner = String(cfg.getOwner() || '');
    if (!owner) throw new Error('لا يوجد مطور رئيسي في config.json');
    const event = { type: 'message', threadID: owner, senderID: owner, messageID: undefined, body: text };
    broadcasting = true;
    console.log(`panel: بدء إشعار جماعي (${text.length} حرفًا)`);
    Promise.resolve(cmd.run({
        api, event, args: [text], helpers: require('./helpers'), states: require('./db/states'),
        deco: require('./decorations'), cfg, utils: require('./index')
    })).catch(e => console.error('panel: فشل الإشعار:', e && e.message))
        .then(() => { broadcasting = false; });
}

function restartSoon() {
    try { data.flushStats(); } catch (e) { /* تجاهل */ }
    console.log('panel: إعادة تشغيل الخدمة بطلب من اللوحة');
    // SIGTERM: إن كان cloudSync مفعّلًا يرفع البيانات ثم يخرج، وإلا تنتهي العملية. ومنصة الاستضافة تعيد تشغيلها.
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 700);
}

/* ─────────── المسارات ─────────── */
const USER_ID = /^\d{5,25}$/;
const THREAD_ID = /^\d{5,25}$/;

async function route(req, res, p, url) {
    const post = req.method === 'POST';

    if (post && p === '/api/login') {
        const ip = clientIP(req);
        if (loginBlocked(ip)) return json(res, 429, { error: 'محاولات كثيرة، حاول بعد 10 دقائق' });
        const body = await readBody(req);
        if (!body || typeof body.password !== 'string' || !passwordOk(body.password)) {
            recordFail(ip);
            return json(res, 401, { error: 'كلمة السر غير صحيحة' });
        }
        return json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, makeToken(), SESSION_MS / 1000) });
    }

    if (!isAuthed(req)) return json(res, 401, { error: 'غير مسجّل' });

    const isUpload = post && p === '/api/images/upload';
    if (post) { // حماية إضافية من الطلبات القادمة من مواقع أخرى
        const jsonType = String(req.headers['content-type'] || '').includes('application/json');
        if (req.headers['x-panel'] !== '1' || (!isUpload && !jsonType)) return json(res, 403, { error: 'طلب مرفوض' });
    }

    if (post && p === '/api/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });

    /* ── الحالة ── */
    if (req.method === 'GET' && p === '/api/status') {
        const c = global.client || {};
        let botID = null;
        try { botID = c.api && c.api.getCurrentUserID ? c.api.getCurrentUserID() : null; } catch (e) { /* تجاهل */ }
        let power = { all: false, exceptions: 0 };
        try { power = require('./power').status(); } catch (e) { /* تجاهل */ }
        let usersN = null;
        try { usersN = require('./db/users').all().length; } catch (e) { /* تجاهل */ }
        return json(res, 200, {
            online: conn.state === 'online', conn: conn.state, botID, name: (global.config && global.config.BOTNAME) || '',
            startedAt: c.startedAt || null, now: Date.now(), alert: buildAlert(),
            commands: c.commands ? c.commands.size : 0, disabled: data.disabled.size, banned: data.banned.size,
            power, users: usersN, groups: data.groupCount(),
            memoryMB: Math.round(process.memoryUsage().rss / 1048576), node: process.version
        });
    }

    /* ── الأوامر ── */
    if (req.method === 'GET' && p === '/api/commands') {
        const list = [...((global.client && global.client.commands) || new Map()).values()].map(cmd => ({
            name: cmd.config.name, description: String(cmd.config.description || ''),
            aliases: cmd.config.aliases || [], category: cmd.config.category || '',
            adminOnly: !!cmd.config.adminOnly, cooldown: cmd.config.cooldown || 0,
            disabled: data.disabled.has(String(cmd.config.name).toLowerCase())
        })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return json(res, 200, { commands: list, prefix: (global.config && global.config.PREFIX) || '.' });
    }
    if (post && p === '/api/commands') {
        const body = await readBody(req);
        const name = body && typeof body.name === 'string' ? body.name.toLowerCase() : '';
        const cmds = (global.client && global.client.commands) || new Map();
        if (!cmds.has(name) || typeof body.disabled !== 'boolean') return json(res, 400, { error: 'أمر غير موجود' });
        if (body.disabled) data.disabled.add(name); else data.disabled.delete(name);
        data.saveSettings();
        console.log(`panel: ${body.disabled ? 'تعطيل' : 'تفعيل'} الأمر ${name}`);
        return json(res, 200, { ok: true, name, disabled: body.disabled });
    }

    /* ── السجل ── */
    if (req.method === 'GET' && p === '/api/logs') {
        const since = Number(url.searchParams.get('since')) || 0;
        return json(res, 200, { logs: logs.filter(l => l.id > since), last: logId });
    }

    /* ── إيقاف/تشغيل الكل ── */
    if (post && p === '/api/power') {
        const body = await readBody(req);
        if (!body || typeof body.off !== 'boolean') return json(res, 400, { error: 'طلب غير صالح' });
        require('./power').setAll(body.off);
        console.log(`panel: ${body.off ? 'إيقاف' : 'تشغيل'} البوت في كل المجموعات`);
        return json(res, 200, { ok: true, power: require('./power').status() });
    }

    /* ── المجموعات ── */
    if (req.method === 'GET' && p === '/api/groups') {
        const api = botApi();
        const stale = Date.now() - data.threadsUpdatedAt() > 6 * 3600 * 1000;
        if (stale && !data.isRefreshing() && api && conn.state === 'online' && typeof api.getThreadList === 'function') {
            data.refreshThreads(api).catch(e => console.error('panel: تعذر جلب المجموعات:', e && e.message));
        }
        return json(res, 200, Object.assign(data.listGroups(require('./power')), { refreshing: data.isRefreshing() }));
    }
    if (post && p === '/api/groups/refresh') {
        const api = botApi();
        if (!api || conn.state !== 'online' || typeof api.getThreadList !== 'function') return json(res, 409, { error: 'البوت غير متصل بفيسبوك الآن' });
        if (data.isRefreshing()) return json(res, 200, { ok: true, refreshing: true });
        data.refreshThreads(api).catch(e => console.error('panel: تعذر جلب المجموعات:', e && e.message));
        return json(res, 200, { ok: true, refreshing: true });
    }
    if (post && p === '/api/groups/power') {
        const body = await readBody(req);
        if (!body || typeof body.id !== 'string' || !THREAD_ID.test(body.id) || typeof body.off !== 'boolean') return json(res, 400, { error: 'طلب غير صالح' });
        require('./power').setThread(body.id, body.off);
        console.log(`panel: ${body.off ? 'إيقاف' : 'تشغيل'} البوت في المجموعة ${body.id}`);
        return json(res, 200, { ok: true, off: require('./power').isOff(body.id) });
    }

    /* ── الإحصاءات ── */
    if (req.method === 'GET' && p === '/api/stats') return json(res, 200, data.getStats());

    /* ── المستخدمون ── */
    if (req.method === 'GET' && p === '/api/users') {
        const q = String(url.searchParams.get('q') || '').slice(0, 60);
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        return json(res, 200, data.listUsers({ q, offset, limit: 30 }));
    }
    if (post && p === '/api/users/points') {
        const body = await readBody(req);
        if (!body || typeof body.id !== 'string') return json(res, 400, { error: 'طلب غير صالح' });
        try {
            const points = data.changePoints(body.id, body.delta);
            console.log(`panel: نقاط ${body.id} ${body.delta > 0 ? '+' : ''}${body.delta} ← ${points}`);
            return json(res, 200, { ok: true, points });
        } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (post && p === '/api/users/ban') {
        const body = await readBody(req);
        if (!body || typeof body.id !== 'string' || !USER_ID.test(body.id) || typeof body.banned !== 'boolean') return json(res, 400, { error: 'طلب غير صالح' });
        if (body.banned && require('./config').isAdmin(body.id)) return json(res, 400, { error: 'لا يمكن حظر مطور' });
        if (body.banned) data.banned.add(body.id); else data.banned.delete(body.id);
        data.saveSettings();
        console.log(`panel: ${body.banned ? 'حظر' : 'فك حظر'} ${body.id}`);
        return json(res, 200, { ok: true, banned: body.banned });
    }

    /* ── إشعار جماعي ── */
    if (post && p === '/api/broadcast') {
        const body = await readBody(req);
        const text = body && typeof body.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 1000) return json(res, 400, { error: 'اكتب نصًا من 1 إلى 1000 حرف' });
        try { await startBroadcast(text); } catch (e) { return json(res, 409, { error: e.message }); }
        return json(res, 200, { ok: true, groups: data.groupCount() });
    }

    /* ── صور الأوامر ── */
    if (req.method === 'GET' && p === '/api/images') return json(res, 200, { images: data.listImages(), maxMB: data.MAX_IMG / 1048576 });
    if (req.method === 'GET' && p === '/api/images/preview') {
        const img = data.imagePreview(url.searchParams.get('key'), url.searchParams.get('i'));
        if (!img) return json(res, 404, { error: 'لا توجد صورة' });
        res.writeHead(200, baseHeaders({ 'Content-Type': img.type, 'Cache-Control': 'private, max-age=30' }));
        return res.end(img.buf);
    }
    if (isUpload) {
        const buf = await readRaw(req, data.MAX_IMG);
        if (!buf) return json(res, 413, { error: 'الصورة أكبر من 6MB' });
        try {
            const count = data.saveImage(String(url.searchParams.get('key') || ''), buf, url.searchParams.get('mode') === 'add');
            console.log(`panel: رفع صورة للأمر ${url.searchParams.get('key')} (${Math.round(buf.length / 1024)}KB)`);
            return json(res, 200, { ok: true, count });
        } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (post && p === '/api/images/reset') {
        const body = await readBody(req);
        try { data.resetImage(body && body.key); return json(res, 200, { ok: true }); }
        catch (e) { return json(res, 400, { error: e.message }); }
    }

    /* ── إعادة التشغيل ── */
    /* ── تجديد كوكيز فيسبوك (بدون تعديل Render) ── */
    if (post && p === '/api/cookies') {
        const body = await readBody(req, 65536);
        const text = body && typeof body.cookies === 'string' ? body.cookies : '';
        if (text.trim().length < 20) return json(res, 400, { error: 'الصق الكوكيز كاملة' });
        const apply = global.client && global.client.applyCookies;
        if (typeof apply !== 'function') return json(res, 409, { error: 'غير متاح في هذا الوضع' });
        let state;
        try { state = require('./cookies').parseCookies(text); } catch (e) { return json(res, 400, { error: e.message }); }
        const api = botApi();
        const newId = String((state.find(c => c.key === 'c_user') || {}).value || '');
        if (api && conn.state === 'online' && typeof api.getCurrentUserID === 'function' && newId && String(api.getCurrentUserID()) !== newId) {
            return json(res, 409, { error: 'الكوكيز لحساب مختلف عن حساب البوت. لتبديل الحساب استعمل الأمر: .رفع كوكيز تبديل' });
        }
        try { apply(state, 'panel'); } catch (e) { return json(res, 400, { error: e.message }); }
        console.log('panel: تم استلام كوكيز جديدة');
        return json(res, 200, { ok: true });
    }

    if (post && p === '/api/restart') { json(res, 200, { ok: true }); restartSoon(); return; }

    return json(res, 404, { error: 'غير موجود' });
}

/** يرجع true إذا عالج الطلب (يستدعيه keepalive.js) */
function handle(req, res) {
    if (!ENABLED) return false;
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return false; }
    const p = url.pathname;
    if ((req.method === 'GET' || req.method === 'HEAD') && p === '/') { sendPage(req, res); return true; }
    if (!p.startsWith('/api/')) return false;
    route(req, res, p, url).catch(e => { console.error('panel:', e && e.message); if (!res.headersSent) json(res, 500, { error: 'خطأ داخلي' }); });
    return true;
}

module.exports = { handle, isDisabled, isBanned, noteMessage, noteCommand, enabled: ENABLED };
