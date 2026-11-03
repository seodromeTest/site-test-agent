// DTF Transfer Ohio – upload ürünleri (2 tanınan uygulama, 4 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://www.dtftransferohio.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'DTF Transfer Ohio',
  domain: 'dtftransferohio.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('dtf-transfers-by-size', "DTF Transfers By Size", gsStudio()),
    p('gang-sheet-builder-dtf-build', "Build Your DTF Gang Sheet", pageCheck()),
    p('uv-dtf-transfers-by-size', "UV DTF Transfers By Size", gsStudio()),
    p('premium-dtf-gang-sheets', "DTF Gang Sheets", pageCheck()),
    p('uv-dtf-gang-sheets-ohio', "UV DTF Gang Sheets", pageCheck()),
    p('uv-dtf-gang-sheet-builder', "Build Your UV DTF Gang Sheet", pageCheck()),
  ],
};
