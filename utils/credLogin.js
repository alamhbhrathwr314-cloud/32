/**
 * ◈ ───『 الدخول إلى فيسبوك ببيانات الحساب 』─── ◈
 * يُستعمل كخيار احتياطي حين لا توجد كوكيز، أو حين تنتهي صلاحية الكوكيز.
 *
 * المتغيرات (في Render/Railway فقط، لا تضعها في الكود ولا في GitHub):
 *   FB_EMAIL        البريد أو رقم الهاتف بالصيغة الدولية (مثال: 2499XXXXXXXX بدون + ولا مسافات)
 *   FB_PASSWORD     كلمة السر
 *   FB_2FA_SECRET   (اختياري) المفتاح السري للتحقق بخطوتين (TOTP) إن كان مفعّلًا على الحساب
 *   FB_LOGIN_MAX_TRIES  أقصى عدد محاولات دخول ببيانات الحساب لكل تشغيل (افتراضي 2)
 *
 * بعد نجاح الدخول تُحفظ الكوكيز الجديدة تلقائيًا، وتُستعمل في المرات القادمة بدل كلمة السر.
 */
const crypto = require('crypto');

const ident = () => String(process.env.FB_EMAIL || process.env.FB_PHONE || '').trim();
const pass = () => String(process.env.FB_PASSWORD || '');
const has = () => !!(ident() && pass());

/** رمز TOTP (RFC 6238): 6 أرقام، خطوة 30 ثانية، HMAC-SHA1 */
function totp(secret, now = Date.now()) {
    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = String(secret).toUpperCase().replace(/[\s=-]/g, '');
    let bits = '';
    for (const ch of clean) {
        const v = ALPHA.indexOf(ch);
        if (v < 0) throw new Error('FB_2FA_SECRET غير صالح (يجب أن يكون Base32)');
        bits += v.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
    const h = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
    const o = h[h.length - 1] & 0xf;
    const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
    return String(code).padStart(6, '0');
}

const errText = e => (typeof e === 'string' ? e : (e && (e.error || e.message)) || JSON.stringify(e));

/** يسجّل الدخول ويرجع api. loginFn هي دالة login من مكتبة fca */
function login(loginFn, { timeout = 180000, log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('انتهت مهلة تسجيل الدخول')), timeout);
        const finish = (err, api) => { clearTimeout(timer); err ? reject(err) : resolve(api); };
        const cb = (err, api) => {
            if (!err) return finish(null, api);
            if (err.error === 'login-approval' && typeof err.continue === 'function') {
                const secret = process.env.FB_2FA_SECRET;
                if (!secret) return finish(new Error('login-approval: الحساب عليه تحقق بخطوتين، أضف FB_2FA_SECRET أو استعمل الكوكيز'));
                try { log('الحساب يطلب رمز التحقق بخطوتين، جارٍ إدخاله تلقائيًا', 'warn'); return err.continue(totp(secret)); }
                catch (e) { return finish(e); }
            }
            finish(new Error(errText(err)));
        };
        try { loginFn({ email: ident(), password: pass() }, cb); } catch (e) { finish(e); }
    });
}

module.exports = { has, login, totp };
