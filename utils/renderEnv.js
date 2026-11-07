/**
 * ☁️ تحديث متغير FB_COOKIE في Render تلقائيًا بعد «رفع كوكيز» (من الأمر أو اللوحة).
 * يعمل فقط إذا وُجد RENDER_API_KEY. معرّف الخدمة يأخذه من RENDER_SERVICE_ID (تضبطه Render تلقائيًا)
 * أو ضعه يدويًا. ملاحظة: تعديل المتغيرات في Render يعيد تشغيل الخدمة.
 * لا يُستدعى للتحديث التلقائي الدوري، فقط عند الرفع اليدوي، حتى لا تُعاد الخدمة كل فترة.
 */
const axios = require('axios');

const enabled = () => !!(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID);

async function update(state, key) {
    if (!enabled()) return { skipped: true };
    const name = key || 'FB_COOKIE';
    const url = `https://api.render.com/v1/services/${encodeURIComponent(process.env.RENDER_SERVICE_ID)}/env-vars/${encodeURIComponent(name)}`;
    const res = await axios.put(url, { value: JSON.stringify(state) }, {
        headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 20000, validateStatus: () => true
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    throw new Error(`Render ${res.status}: ${JSON.stringify(res.data).slice(0, 150)}`);
}

module.exports = { update, enabled };
