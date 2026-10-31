module.exports.config = {
    name: 'يوتيوب', aliases: ['youtube', 'yt'],
    description: 'ابحث في يوتيوب وأعطيك الروابط',
    usage: 'يوتيوب <كلمة البحث>', category: 'media', cooldown: 10, adminOnly: false
};

module.exports.run = async ({ api, event, args, helpers, deco, utils }) => {
    const query = args.join(' ').trim();
    if (!query) return utils.throwError('يوتيوب', event.threadID, event.messageID);
    let items;
    try { items = await utils.getYoutube(query, 'search'); }
    catch (e) { return helpers.reply(api, event, deco.errorBox('تعذر البحث الآن، حاول لاحقًا')); }
    const videos = (items || []).filter(v => v && v.id && v.title).slice(0, 5);
    if (!videos.length) return helpers.reply(api, event, deco.warning('لا توجد نتائج'));
    const lines = videos.map((v, i) =>
        `${i + 1}. ${v.title}\n   ⏱️ ${(v.length && v.length.simpleText) || '—'}\n   🔗 https://www.youtube.com/watch?v=${v.id}`);
    return helpers.reply(api, event, deco.infoBox(`🎬 نتائج: ${query}`, lines.join('\n\n')));
};
