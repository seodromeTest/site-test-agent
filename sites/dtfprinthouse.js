// DTF Print House – upload ürünleri (2 tanınan uygulama, 4 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://dtfprinthouse.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'DTF Print House',
  domain: 'dtfprinthouse.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  // Mağazada giyim ve gang sheet dışında normal ürün yok: otomatik seçim bulamıyor, test ürünü sabit
  core: { search: 'dtf', products: ['q-tees-economical-tote-qtb', 'unisex-heavy-cotton-tm-t-shirt'] },
  flows: [
    p('custom-dtf-transfers-by-size', "Custom DTF Transfers by Size", gsStudioBasic()),
    p('upload-uv-dtf-transfer', "Upload UV DTF Gang Sheet -  Custom UV DTF Transfer", pageCheck()),
    p('uv-dtf-transfers-size', "UV DTF Transfers by Size", gsStudioBasic()),
    p('create-uv-dtf-gang-sheet', "Create UV DTF Gang Sheet- Custom UV DTF", pageCheck()),
    p('upload-gang-sheet', "Upload DTF Gang Sheet – Custom Transfer Printing", pageCheck()),
    p('dtf-gang-sheet', "DTF Gang Sheet - Create Custom Transfer Sheets", pageCheck()),
  ],
};
