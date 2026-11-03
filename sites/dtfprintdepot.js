// DTF Print Depot – upload ürünleri (4 tanınan uygulama, 8 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://dtfprintdepot.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'DTF Print Depot',
  domain: 'dtfprintdepot.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('uv-dtf-transfers-size', "UV DTF Transfers By Size", gsStudio()),
    p('custom-uv-dtf-transfer', "Custom UV DTF Gang Sheets - Upload UV Transfer", uploadStudio()),
    p('uv-dtf-gang-sheet', "UV DTF Gang Sheet Builder", pageCheck()),
    p('custom-dtf-transfers', "Custom DTF Transfers By Size", gsStudio()),
    p('dtf-gang-sheet', "DTF Gang Sheet ", uploadStudio()),
    p('glitter-size-dtf-transfers', "", pageCheck()),
    p('gang-sheet-builder-1', "DTF Gang Sheet Builder", pageCheck()),
    p('glitter-dtf-transfers', "", pageCheck()),
    p('glitter-dtf-transfers-builder', "", pageCheck()),
    p('glow-dtf', "", pageCheck()),
    p('glow-dark-dtf-gang-sheets', "", pageCheck()),
    p('glow-dark-dtf-gang-sheet', "", pageCheck()),
  ],
};
