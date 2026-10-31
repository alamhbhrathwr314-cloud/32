/**
 * ◈ ───『 ✨ زخارف كيرا ✨ 』─── ◈
 * المطور: 𝐚𝐲𝐦𝐚𝐧
 * الوصف: زخارف جاهزة للرسائل
 */

module.exports = {
    // ═══════════════════════════════════
    // العناوين الرئيسية
    // ═══════════════════════════════════
    
    title: function(text) {
        return `◈ ───『 ${text} 』─── ◈`;
    },

    kiraTitle: function() {
        return `◈ ───『 ✨ ريـــمـو ✨ 』─── ◈`;
    },

    // ═══════════════════════════════════
    // تنبيهات وحماية
    // ═══════════════════════════════════
    
    protection: function(text) {
        return `╭─────╼🚫╾─────╮\n   ${text}\n╰─────╼🚫╾─────╯`;
    },

    warning: function(text) {
        return `⚠️━━━━━━━━━━━━━━⚠️\n  ${text}\n⚠️━━━━━━━━━━━━━━⚠️`;
    },

    reject: function(text) {
        return `⛔ ══════ ${text} ══════ ⛔`;
    },

    // ═══════════════════════════════════
    // نجاح وتنفيذ
    // ═══════════════════════════════════
    
    success: function(text) {
        return `✅━━━━━━━━━━━━━━✅\n   ${text}\n✅━━━━━━━━━━━━━━✅`;
    },

    successLine: function(text) {
        return `✨ ════ ${text} ════ ✨`;
    },

    complete: function(text) {
        return `🌸『 ${text} 』🌸`;
    },

    // ═══════════════════════════════════
    // أوامر وفئات
    // ═══════════════════════════════════
    
    commandBox: function(text) {
        return `╭──『 ⚙️ ${text} 』──╮`;
    },

    category: function(icon, text) {
        return `⟪ ${icon} ${text} ⟫`;
    },

    games: function() {
        return this.category('🕹️', 'الـعـاب');
    },

    tools: function() {
        return this.category('🛠️', 'أدوات');
    },

    media: function() {
        return this.category('🎬', 'وسائط');
    },

    // ═══════════════════════════════════
    // فواصل
    // ═══════════════════════════════════
    
    separator: function() {
        return `◈ ────────────── ◈`;
    },

    line: function() {
        return `━━━━━━━━━━━━━━━━━━━━`;
    },

    doubleLine: function() {
        return `════════════════════`;
    },

    dashedLine: function() {
        return `────────────────────`;
    },

    starSeparator: function() {
        return `『 ✦ 』──────────『 ✦ 』`;
    },

    // ═══════════════════════════════════
    // رسائل خاصة
    // ═══════════════════════════════════
    
    kiraMessage: function(text) {
        return `💌 ───『 ${text} 』─── 💌`;
    },

    kiraWhisper: function(text) {
        return `🌙『 ${text}… 』🌙`;
    },

    kiraLove: function(text) {
        return `💖『 ${text} 』💖`;
    },

    // ═══════════════════════════════════
    // دخول وخروج
    // ═══════════════════════════════════
    
    exit: function() {
        return `🚪━━━━━━ خروج ━━━━━━🚪`;
    },

    welcome: function() {
        return `🎉━━━━━━ ترحيب ━━━━━━🎉`;
    },

    protection_header: function() {
        return `🛡️━━━━━━ حماية ━━━━━━🛡️`;
    },

    // ═══════════════════════════════════
    // دوال مركبة
    // ═══════════════════════════════════
    
    box: function(content, icon = '✨') {
        return `${this.kiraTitle()}\n${this.separator()}\n${icon} ${content}\n${this.separator()}`;
    },

    errorBox: function(error) {
        return `${this.warning('خطأ')}\n${error}\n${this.line()}`;
    },

    infoBox: function(title, content) {
        return `${this.title(title)}\n${this.separator()}\n${content}\n${this.separator()}`;
    }
};
