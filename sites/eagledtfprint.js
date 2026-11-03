// Eagle DTF Print – upload ürünleri (7 tanınan uygulama, 5 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://eagledtfprint.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'Eagle DTF Print',
  domain: 'eagledtfprint.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('uv-dtf-transfer-size', "UV DTF Sticker  By Size", gsStudio()),
    p('dtf-gang-sheet-upload', "Upload Your DTF Gang Sheet", gsUploader()),
    p('build-dtf-gang-sheet', "Build Your DTF Gang Sheet", pageCheck()),
    p('dtf-transfer-size', "DTF Transfer By Size", gsStudio()),
    p('uv-dtf-gang-sheet', "Upload Your UV DTF Sticker Gang Sheet", gsUploader()),
    p('uv-gang-sheet-builder', "Build Your UV DTF Sticker Gang Sheet", pageCheck()),
    p('glow-in-the-dark-dtf-transfers-by-size', "Glow in the Dark DTF Transfers by Size", gsStudio()),
    p('upload-your-glow-in-the-dark-dtf-gang-sheet', "Upload Your Glow in the Dark DTF Gang Sheet", gsUploader()),
    p('glitter-dtf-gang-sheet-builder', "Build Your Glitter DTF Gang Sheet", pageCheck()),
    p('glitter-dtf-gang-sheets', "Upload Your Glitter DTF Gang Sheet", gsUploader()),
    p('glitter-dtf-transfers', "Glitter DTF Transfers By Size", pageCheck()),
    p('glow-dark-dtf-gang-sheet', "Build Your Glow in the Dark DTF Gang Sheet", pageCheck()),
  ],
};
