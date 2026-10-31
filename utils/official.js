/**
 * ◈ ───『 الوضع الرسمي: Messenger Platform 』─── ◈
 * يستقبل رسائل الصفحة عبر Webhook ويرسل الردود عبر Graph API (بدون كوكيز).
 * يُفعَّل تلقائيًا عند وجود PAGE_ACCESS_TOKEN.
 */
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const log = require('./log');

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v23.0'}`;
const MAX_LEN = 1900; // حد ماسنجر 2000 حرف للرسالة

/** تقسيم الرسائل الطويلة عند حدود الأسطر */
function chunk(text) {
    const parts = [];
    let cur = '';
    for (const line of String(text).split('\n')) {
        let l = line;
        while (l.length > MAX_LEN) {
            if (cur) { parts.push(cur); cur = ''; }
            parts.push(l.slice(0, MAX_LEN));
            l = l.slice(MAX_LEN);
        }
        if ((cur ? cur.length + 1 : 0) + l.length > MAX_LEN) { parts.push(cur); cur = l; }
        else cur = cur ? cur + '\n' + l : l;
    }
    if (cur) parts.push(cur);
    return parts.length ? parts : [''];
}

const describe = e => (e.response && e.response.data && JSON.stringify(e.response.data.error || e.response.data)) || e.message;

/** كائن api متوافق مع ما تستعمله الأوامر (sendMessage وgetUserInfo...) */
function createApi(token, pageId) {
    const call = (method, path, data, params = {}) =>
        axios({ method, url: GRAPH + path, params: { access_token: token, ...params }, data });
    return {
        setOptions() {},
        getAppState: () => [],
        getCurrentUserID: () => String(pageId || ''),
        sendMessage(text, threadID, callback) {
            const cb = typeof callback === 'function' ? callback : () => {};
            (async () => {
                try {
                    const body = typeof text === 'string' ? text : (text && text.body) || '';
                    for (const part of chunk(body)) {
                        await call('post', '/me/messages', {
                            recipient: { id: String(threadID) },
                            messaging_type: 'RESPONSE',
                            message: { text: part }
                        });
                    }
                    cb(null, { messageID: 'sent' });
                } catch (e) {
                    log('فشل الإرسال: ' + describe(e), 'error');
                    cb(e);
                }
            })();
        },
        getUserInfo(ids, cb) {
            (async () => {
                const out = {};
                for (const id of [].concat(ids)) {
                    try {
                        const r = await call('get', '/' + id, undefined, { fields: 'name' });
                        if (r.data && r.data.name) out[id] = { name: r.data.name };
                    } catch (e) { /* الاسم غير متاح: يُستعمل بديل */ }
                }
                cb(null, out);
            })();
        }
    };
}

function start({ onMessage }) {
    const token = process.env.PAGE_ACCESS_TOKEN;
    const secret = process.env.APP_SECRET;
    const verifyToken = process.env.VERIFY_TOKEN;
    if (!secret || !verifyToken) {
        log('الوضع الرسمي يحتاج المتغيرين APP_SECRET و VERIFY_TOKEN', 'error');
        process.exit(1);
    }
    const api = createApi(token, process.env.PAGE_ID);

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/webhook') { res.writeHead(200); return res.end('KIRA bot'); } // فحص الصحة

        if (req.method === 'GET') { // تحقق ميتا من الـ Webhook
            if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === verifyToken) {
                res.writeHead(200); return res.end(url.searchParams.get('hub.challenge'));
            }
            res.writeHead(403); return res.end();
        }

        if (req.method !== 'POST') { res.writeHead(405); return res.end(); }

        const chunks = [];
        let size = 0;
        req.on('data', c => { size += c.length; if (size > 1e6) return req.destroy(); chunks.push(c); });
        req.on('end', () => {
            const raw = Buffer.concat(chunks);
            const sig = String(req.headers['x-hub-signature-256'] || '');
            const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
            const valid = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
            if (!valid) { log('رُفض طلب بتوقيع غير صحيح', 'warn'); res.writeHead(403); return res.end(); }

            res.writeHead(200); res.end('EVENT_RECEIVED'); // رد سريع، ثم نعالج
            let body;
            try { body = JSON.parse(raw.toString('utf8')); } catch (e) { return; }
            if (body.object !== 'page') return;
            for (const entry of body.entry || []) {
                for (const m of entry.messaging || []) {
                    if (!m.sender || !m.message || m.message.is_echo || !m.message.text) continue;
                    const id = String(m.sender.id);
                    Promise.resolve(onMessage(api, {
                        type: 'message', senderID: id, threadID: id, messageID: m.message.mid,
                        body: m.message.text, timestamp: m.timestamp, mentions: {}, isGroup: false
                    })).catch(e => log('خطأ معالجة: ' + (e && e.stack || e), 'error'));
                }
            }
        });
    });

    const port = Number(process.env.PORT) || 3000;
    server.listen(port, () => log.loader(`الـ Webhook يعمل على المنفذ ${port} (المسار /webhook)`));
    return api;
}

module.exports = { start, chunk, createApi };
