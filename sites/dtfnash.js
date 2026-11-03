// DTF Nash – upload ürünleri (7 tanınan uygulama, 5 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://dtfnash.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'DTF Nash',
  domain: 'dtfnash.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('custom-dtf-transfers', "Custom DTF Transfers By Size", gsStudio()),
    p('dtf-gang-sheet', "DTF Gang Sheet | Upload & Print Custom DTF Transfers", uploadStudio()),
    p('glitter-dtf-transfers-builder', "Glitter DTF Transfers Gang Sheet Builder", pageCheck()),
    p('uv-dtf-transfers-by-size', "UV DTF Transfers By Size", gsStudio()),
    p('glitter-dtf-transfers', "Glitter DTF Transfers Gang Sheets", uploadStudio()),
    p('gang-sheet-builder-1', "DTF Gang Sheet Builder", pageCheck()),
    p('glow-dark-dtf-transfers', "Glow In The Dark DTF - Transfers By Size", gsStudio()),
    p('custom-uv-dtf-transfer', "Custom UV DTF Gang Sheets - Upload UV Transfer", uploadStudio()),
    p('uv-dtf-gang-sheet', "UV DTF Gang Sheet Builder", pageCheck()),
    p('glow-in-the-dark-dtf-gang-sheets', "Glow In The Dark - DTF Gang Sheets", uploadStudio()),
    p('glitter-dtf-transfers-by-size', "Glitter DTF Transfers By Size", pageCheck()),
    p('glow-in-the-dark-dtf', "Glow In The Dark DTF Gang Sheet Builder", pageCheck()),
  ],
};
