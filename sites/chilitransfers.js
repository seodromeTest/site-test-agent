// Chili Transfers – upload ürünleri (4 tanınan uygulama, 2 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://www.chilitransfers.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'Chili Transfers',
  domain: 'chilitransfers.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('dtf-gang-sheet-chili-transfers-1', "DTF Transfers By Size", gsStudio()),
    p('dtf-gang-sheet', "Upload DTF Gang Sheet", uploadStudio()),
    p('dtf-gang-sheet-builder', "DTF Gang Sheet Builder", pageCheck()),
    p('uv-dtf-transfer-by-size', "UV DTF Transfer By Size", gsStudio()),
    p('uv-dtf-gang-sheet', "UV DTF Gang Sheet", uploadStudio()),
    p('uv-dtf-gang-sheet-builder', "UV Gang Sheet Builder", pageCheck()),
  ],
};
