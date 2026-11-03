// Custom Print AZ – upload ürünleri (4 tanınan uygulama, 4 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://customprintaz.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'Custom Print AZ',
  domain: 'customprintaz.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('dtf-transfers-by-size', "DTF - Transfers by Size", gsStudio()),
    p('fast-dtf-gang-sheet-upload', "Fast DTF Gang Sheet Upload", uploadStudio()),
    p('dtf-gang-sheet', "DTF - Upload Gang Sheet", pageCheck()),
    p('uv-dtf-transfers-by-size', "UV DTF - Transfer By Size", gsStudio()),
    p('fast-uv-gang-sheet-upload', "Fast UV Gang Sheet Upload", uploadStudio()),
    p('dtf-gang-sheet-builder', "DTF - Build Gang Sheet", pageCheck()),
    p('uv-dtf-gang-sheet-1', "UV DTF - Upload Gang Sheet", pageCheck()),
    p('uv-dtf-gang-sheet', "UV DTF - Build Gang Sheet", pageCheck()),
  ],
};
