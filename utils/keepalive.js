/**
 * خادم صحة صغير: يفتح منفذ PORT ويرد 200 على أي طلب.
 * يلزم فقط عند تشغيل البوت كـ Web Service على Render (يشترط وجود منفذ)، ولا يلزم كـ Background Worker.
 * لا يعمل في وضع Messenger الرسمي (PAGE_ACCESS_TOKEN) لأن ذلك الوضع يفتح المنفذ بنفسه.
 * لوحة التحكم: إن وُجد PANEL_PASSWORD تُعرض الصفحة الرئيسية (/) كلوحة تحكم (راجع utils/panel.js).
 *
 * ⏰ منع نوم Render: يزور البوت رابطه العام (/ping) كل 4 دقائق تلقائيًا (Render ينيّم الخدمة بعد 15 دقيقة بلا زيارات).
 *    - الرابط يؤخذ من KEEPALIVE_URL أو RENDER_EXTERNAL_URL (تضبطه Render تلقائيًا).
 *    - للإيقاف: KEEPALIVE_PING=0   • لتغيير المدة: KEEPALIVE_INTERVAL_MS (بالمللي ثانية، الأدنى 60000)
 *    - ملاحظة: إن نامت الخدمة فعلًا فلن تستيقظ بزيارة من نفسها، لذلك يُفضَّل أيضًا موقع مراقبة خارجي (UptimeRobot وأمثاله).
 */
const http = require('http');
const https = require('https');
const panel = require('./panel'); // لوحة التحكم (تعمل فقط إذا وُجد PANEL_PASSWORD)

if (!process.env.PAGE_ACCESS_TOKEN) {
    const port = Number(process.env.PORT) || 3000;
    const startedAt = Date.now();
    let lastSelfPing = 0;

    const srv = http.createServer((req, res) => {
        const p = String(req.url || '').split('?')[0];
        if (p === '/ping' || p === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
            return res.end('pong');
        }
        if (panel.handle(req, res)) return;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('kira-bot is running');
    });
    srv.on('error', e => console.log('keepalive:', e.code || e.message));
    srv.listen(port, '0.0.0.0', () => console.log('keepalive server on port ' + port));

    const base = String(process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
    const enabled = process.env.KEEPALIVE_PING !== '0' && !!base;

    if (enabled) {
        const interval = Math.max(60000, Number(process.env.KEEPALIVE_INTERVAL_MS) || 4 * 60 * 1000);
        const target = base + '/ping';
        const client = target.startsWith('https') ? https : http;
        let fails = 0;

        const ping = () => {
            const req = client.get(target, { timeout: 15000, headers: { 'User-Agent': 'kira-keepalive' } }, res => {
                res.resume();
                if (res.statusCode >= 200 && res.statusCode < 500) {
                    lastSelfPing = Date.now();
                    if (fails) console.log('keepalive: عادت الزيارة بعد ' + fails + ' فشل');
                    fails = 0;
                } else if (++fails <= 3) console.log('keepalive: رد غير متوقع ' + res.statusCode);
            });
            req.on('timeout', () => req.destroy(new Error('timeout')));
            req.on('error', e => { if (++fails <= 3) console.log('keepalive: فشلت الزيارة: ' + (e.code || e.message)); });
        };

        setTimeout(ping, 30000).unref();             // أول زيارة بعد 30 ثانية من التشغيل
        setInterval(ping, interval).unref();
        console.log(`keepalive: زيارة ${target} كل ${Math.round(interval / 60000)} دقيقة`);
    } else if (process.env.KEEPALIVE_PING !== '0') {
        console.log('keepalive: لا يوجد RENDER_EXTERNAL_URL أو KEEPALIVE_URL، الزيارة الذاتية معطّلة');
    }
}
