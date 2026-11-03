// GangSheet – upload ürünleri (2 tanınan uygulama, 5 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://www.gangsheet.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'GangSheet',
  domain: 'gangsheet.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('uv-dtf-transfers', "UV DTF Transfers By Size", gsStudio()),
    p('uv-dtf-gang-sheets', "UV DTF Gang Sheets", pageCheck()),
    p('dtf-transfers-size', "DTF Transfers By Size", gsStudio()),
    p('free-dtf-gang-sheet-builder', "Free DTF Gang Sheet Builder", pageCheck()),
    p('custom-printing', "Custom Printing - Gang Sheet", pageCheck()),
    p('glitter-dtf-gang-sheet-builder', "Glitter DTF Gang Sheet Builder", pageCheck()),
    p('uv-dtf-gang-sheet-builder', "Build Your Own UV DTF Gang Sheets", pageCheck()),
  ],
};
