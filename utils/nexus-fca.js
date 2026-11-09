/**
 * محوّل nexus-fca: يحمّل المكتبة ويُرجع دالة login موحّدة
 * الاستخدام: FCA_MODULE=./fca/nexus-fca   (أو اتركه يُكتشف تلقائيًا)
 */
const lib = require('nexus-fca');
module.exports = typeof lib === 'function' ? lib : (lib.login || lib.default || lib);
