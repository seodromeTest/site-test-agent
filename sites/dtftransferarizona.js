// DTF Transfer Arizona – upload ürünleri (2 tanınan uygulama, 4 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://www.dtftransferarizona.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'DTF Transfer Arizona',
  domain: 'dtftransferarizona.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('dtf-transfers-by-size-1', "UV DTF Transfer BY Size", gsStudio()),
    p('uv-dtf-gang-sheet', "UV DTF Gang Sheet Builder", pageCheck()),
    p('dtf-transfers-by-size', "DTF Transfers by Size", gsStudio()),
    p('dtf-gang-sheet-builder', "DTF Gang Sheet Builder", pageCheck()),
    p('uv-dtf-gang-sheet-1', "UV DTF Gang Sheet", pageCheck()),
    p('dtf-gang-sheet', "DTF Gang Sheet", pageCheck()),
  ],
};
