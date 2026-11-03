// Alpha DTF Print – upload ürünleri (4 tanınan uygulama, 2 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://alphadtfprint.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'Alpha DTF Print',
  domain: 'alphadtfprint.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('dtf-transfers-by-size', "DTF Transfers By Size", gsStudio()),
    p('gang-sheets', "UV DTF Gang Sheets", uploadStudio()),
    p('gang-sheet-builder', "UV DTF Gang Sheet Builder", pageCheck()),
    p('custom-uv-dtf-transfers', "UV DTF Transfers By Size", gsStudio()),
    p('dtf-gang-sheets', "DTF Gang Sheets", uploadStudio()),
    p('dtf-gang-sheet-builder', "DTF Gang Sheet Builder", pageCheck()),
  ],
};
