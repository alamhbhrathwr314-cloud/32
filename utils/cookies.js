/**
 * ◈ ───『 🍪 محوّل الكوكيز 』─── ◈
 * يقبل الكوكيز بأي صيغة ويحوّلها لصيغة appState التي تفهمها مكتبة الدخول:
 *  1) مصفوفة JSON جاهزة (key/value)
 *  2) تصدير إضافات المتصفح (name/value أو expirationDate)
 *  3) نص عادي:  c_user=100...; xs=...; fr=...
 *  4) كائن بسيط: {"c_user":"...","xs":"..."}
 */
const YEAR = 365 * 24 * 60 * 60 * 1000;

function normalize(c) {
    const key = c.key || c.name;
    if (!key || c.value === undefined || c.value === null) return null;
    let domain = c.domain || '.facebook.com';
    if (/facebook\.com$/.test(domain) && !domain.startsWith('.')) domain = '.' + domain.replace(/^www\./, '');
    let expires = c.expires;
    if (!expires && c.expirationDate) expires = new Date(c.expirationDate * 1000).toUTCString();
    if (!expires) expires = new Date(Date.now() + YEAR).toUTCString();
    const now = new Date().toISOString();
    return {
        key: String(key).trim(),
        value: String(c.value).trim(),
        domain,
        path: c.path || '/',
        hostOnly: false,
        creation: c.creation || now,
        lastAccessed: c.lastAccessed || now,
        expires
    };
}

function fromHeader(text) {
    return text.split(';').map(p => p.trim()).filter(Boolean).map(p => {
        const i = p.indexOf('=');
        return i > 0 ? { key: p.slice(0, i), value: p.slice(i + 1) } : null;
    }).filter(Boolean);
}

/** @returns {Array} appState جاهز، أو يرمي خطأ برسالة عربية واضحة */
function parseCookies(raw) {
    let text = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('ملف الكوكيز فارغ');

    let list;
    try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) list = data;
        else if (data && Array.isArray(data.cookies)) list = data.cookies;
        else if (data && typeof data === 'object') list = Object.entries(data).map(([key, value]) => ({ key, value }));
        else throw new Error('x');
    } catch (e) {
        list = fromHeader(text.replace(/^cookie:\s*/i, ''));
    }

    const state = list.map(normalize).filter(Boolean);
    const keys = state.map(c => c.key);
    if (!keys.includes('c_user') || !keys.includes('xs')) {
        throw new Error('الكوكيز ناقصة: لازم تحتوي على c_user و xs على الأقل');
    }
    return state;
}

module.exports = { parseCookies };
