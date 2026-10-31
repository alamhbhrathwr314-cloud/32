/**
 * خادم صحة صغير: يفتح منفذ PORT ويرد 200 على أي طلب.
 * يلزم فقط عند تشغيل البوت كـ Web Service على Render (يشترط وجود منفذ)، ولا يلزم كـ Background Worker.
 * لا يعمل في وضع Messenger الرسمي (PAGE_ACCESS_TOKEN) لأن ذلك الوضع يفتح المنفذ بنفسه.
 * اختياري: KEEPALIVE_PING=1 يجعل البوت يزور رابطه العام كل 10 دقائق (RENDER_EXTERNAL_URL أو KEEPALIVE_URL).
 */
const http = require('http');

if (!process.env.PAGE_ACCESS_TOKEN) {
    const port = Number(process.env.PORT) || 3000;
    const srv = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('kira-bot is running');
    });
    srv.on('error', e => console.log('keepalive:', e.code || e.message));
    srv.listen(port, '0.0.0.0', () => console.log('keepalive server on port ' + port));

    const url = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (url && process.env.KEEPALIVE_PING === '1') {
        setInterval(() => { require('axios').get(url, { timeout: 15000 }).catch(() => {}); }, 10 * 60 * 1000).unref();
    }
}
