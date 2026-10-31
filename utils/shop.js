/**
 * نظام المتجر المركزي
 * يحفظ بيانات المتجر والعناصر والحقيبة
 */
const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHOP_FILE = path.join(DATA_DIR, 'shop.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');

fs.ensureDirSync(DATA_DIR);

/* ═══ قائمة العناصر ═══ */
const ITEMS = {
    // أدوات
    "سيف_خشبي":     { name: "سيف خشبي",       price: 100,  emoji: "🗡️",  type: "أدوات",  desc: "أداة قتال بسيطة" },
    "سيف_حديدي":    { name: "سيف حديدي",      price: 500,  emoji: "⚔️",  type: "أدوات",  desc: "أداة قتال قوية" },
    "درع_جلدي":     { name: "درع جلدي",       price: 300,  emoji: "🛡️",  type: "أدوات",  desc: "حماية من الهجمات" },
    "قوس_وسهم":     { name: "قوس وسهم",       price: 400,  emoji: "🏹",  type: "أدوات",  desc: "قتال عن بعد" },

    // زينة
    "تاج_ذهب":      { name: "تاج ذهبي",       price: 2000, emoji: "👑",  type: "زينة",   desc: "رمز الفخامة" },
    "خاتم_الماس":   { name: "خاتم الماس",     price: 3000, emoji: "💍",  type: "زينة",   desc: "أغلى خاتم" },
    "نظارة_شمس":    { name: "نظارة شمسية",    price: 800,  emoji: "🕶️",  type: "زينة",   desc: "أناقة عالية" },
    "قلادة_ذهب":    { name: "قلادة ذهبية",    price: 1500, emoji: "📿",  type: "زينة",   desc: "زينة فاخرة" },

    // طعام
    "بيتزا":        { name: "بيتزا",          price: 50,   emoji: "🍕",  type: "طعام",   desc: "يعيد 20 طاقة" },
    "برجر":         { name: "برجر",           price: 40,   emoji: "🍔",  type: "طعام",   desc: "يعيد 15 طاقة" },
    "قهوة":         { name: "قهوة",           price: 20,   emoji: "☕",  type: "طعام",   desc: "يعيد 10 طاقة" },
    "كيك":          { name: "كيك",            price: 30,   emoji: "🍰",  type: "طعام",   desc: "حلوى لذيذة" },

    // صناديق
    "صندوق_عادي":   { name: "صندوق عادي",     price: 200,  emoji: "📦",  type: "صناديق", desc: "يفتح عنصراً عشوائياً" },
    "صندوق_ذهبي":   { name: "صندوق ذهبي",     price: 1000, emoji: "🎁",  type: "صناديق", desc: "عناصر نادرة" },

    // حيوانات أليفة
    "قطة":          { name: "قطة",            price: 600,  emoji: "🐱",  type: "حيوانات", desc: "صديقة لطيفة" },
    "كلب":          { name: "كلب",            price: 700,  emoji: "🐶",  type: "حيوانات", desc: "صديق وفي" },
    "تنين":         { name: "تنين صغير",      price: 5000, emoji: "🐉",  type: "حيوانات", desc: "نادر جداً" },

    // سيارات
    "دراجة":        { name: "دراجة",          price: 300,  emoji: "🚲",  type: "مركبات", desc: "تنقل سريع" },
    "سيارة":        { name: "سيارة",          price: 1500, emoji: "🚗",  type: "مركبات", desc: "مركبة عادية" },
    "لامبورغيني":   { name: "لامبورغيني",     price: 10000,emoji: "🏎️",  type: "مركبات", desc: "أسرع سيارة" },
    "طائرة":        { name: "طائرة خاصة",     price: 25000,emoji: "✈️",  type: "مركبات", desc: "للأثرياء" },

    // منازل
    "شقة":          { name: "شقة",            price: 3000, emoji: "🏢",  type: "عقارات", desc: "مسكن بسيط" },
    "فيلا":         { name: "فيلا",           price: 15000,emoji: "🏡",  type: "عقارات", desc: "مسكن فخم" },
    "قصر":          { name: "قصر",            price: 50000,emoji: "🏰",  type: "عقارات", desc: "مسكن ملكي" }
};

/* ═══ قراءة/كتابة الملفات ═══ */
function loadJSON(file, def = {}) {
    try { if (fs.existsSync(file)) return fs.readJsonSync(file); } catch (_) {}
    return def;
}

function saveJSON(file, data) {
    try { fs.writeJsonSync(file, data, { spaces: 2 }); } catch (_) {}
}

/* ═══ الحقيبة ═══ */
function getInventory(userID) {
    const all = loadJSON(INVENTORY_FILE);
    return all[String(userID)] || {};
}

function saveInventory(userID, inv) {
    const all = loadJSON(INVENTORY_FILE);
    all[String(userID)] = inv;
    saveJSON(INVENTORY_FILE, all);
}

function addItem(userID, itemKey, qty = 1) {
    const inv = getInventory(userID);
    inv[itemKey] = (inv[itemKey] || 0) + qty;
    saveInventory(userID, inv);
}

function removeItem(userID, itemKey, qty = 1) {
    const inv = getInventory(userID);
    if (!inv[itemKey] || inv[itemKey] < qty) return false;
    inv[itemKey] -= qty;
    if (inv[itemKey] <= 0) delete inv[itemKey];
    saveInventory(userID, inv);
    return true;
}

/* ═══ عرض المتجر ═══ */
function listShop(category = null) {
    const result = [];
    for (const [key, item] of Object.entries(ITEMS)) {
        if (category && item.type !== category) continue;
        result.push({ key, ...item });
    }
    return result;
}

function getCategories() {
    return [...new Set(Object.values(ITEMS).map(i => i.type))];
}

function getItem(itemKey) {
    return ITEMS[itemKey] || null;
}

module.exports = {
    ITEMS,
    listShop,
    getItem,
    getCategories,
    getInventory,
    saveInventory,
    addItem,
    removeItem
};
