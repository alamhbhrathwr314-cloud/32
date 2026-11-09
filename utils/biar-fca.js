/**
 * محوّل biar-fca: يحمّل المكتبة ويُرجع دالة login موحّدة
 * الاستخدام: FCA_MODULE=./fca/biar-fca   (أو اتركه يُكتشف تلقائيًا)
 */
const lib = require('biar-fca');
module.exports = typeof lib === 'function' ? lib : (lib.login || lib.default || lib);
