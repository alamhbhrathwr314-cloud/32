/**
 * ◈ ───『 ⚙️ إعدادات كيرا 』─── ◈
 * المطور: 𝐚𝐲𝐦𝐚𝐧
 * الوصف: دوال مساعدة للوصول للإعدادات
 */

module.exports = {
    /**
     * 👑 الحصول على أيدي المطور
     * @returns {Array} مصفوفة أيديات المطورين
     */
    getAdmins: function() {
        return global.config.ADMINBOT || [61593336733810];
    },

    /**
     * 👤 الحصول على أيدي المطور الأول
     * @returns {String} أيدي المطور الأول
     */
    getFirstAdmin: function() {
        const admins = this.getAdmins();
        return admins[0] || '';
    },

    /**
     * 👑 المطور الرئيسي (أول أيدي في ADMINBOT): لا يُسحب ولا يُعدَّل بأي أمر
     * @returns {String}
     */
    getOwner: function() {
        return String(module.exports.getFirstAdmin());
    },

    /**
     * 👑 هل هو المطور الرئيسي؟
     * @param {String} userID - أيدي المستخدم
     * @returns {Boolean}
     */
    isOwner: function(userID) {
        const owner = module.exports.getOwner();
        return !!owner && owner === String(userID);
    },

    /**
     * ✅ التحقق من كون المستخدم مطور (الرئيسي، أو مطور في config.json، أو ممنوح الصلاحية بأمر صلاحية)
     * @param {String} userID - أيدي المستخدم
     * @returns {Boolean} true إذا كان مطور
     */
    isAdmin: function(userID) {
        const id = String(userID);
        if (module.exports.getAdmins().some(a => String(a) === id)) return true;
        try { return require('./permissions').isSub(id); } catch (e) { return false; }
    },

    /**
     * 🔤 الحصول على البادئة
     * @returns {String} البادئة المستخدمة
     */
    getPrefix: function() {
        return global.config.PREFIX || '.';
    },

    /**
     * 🤖 الحصول على اسم البوت
     * @returns {String} اسم البوت
     */
    getBotName: function() {
        return global.config.BOTNAME || 'ℝ𝕖𝕞𝕠';
    },

    /**
     * 👨‍💻 الحصول على اسم المطور
     * @returns {String} اسم المطور
     */
    getAdminName: function() {
        return global.config.ADMIN_NAME || 'إلامہٰ۫۬بہٰ۫۬رآطہٰ۫۬ور ۦٰ ۦٰ';
    },

    /**
     * 🔗 الحصول على رابط المطور
     * @returns {String} رابط فيسبوك المطور
     */
    getAdminLink: function() {
        return global.config.FACEBOOK_ADMIN || 'https://www.facebook.com/profile.php?id=61593336733810';
    },

    /**
     * 🌐 الحصول على اللغة
     * @returns {String} رمز اللغة
     */
    getLanguage: function() {
        return global.config.language || 'ar';
    }
};
