// Legend Transfers – upload ürünleri (12 tanınan uygulama, 4 henüz testi yazılmamış uygulama: sadece sayfa kontrolü).
// Uygulamaların test adımları apps.js'de.
const { uploadStudio, gsUploader, gsStudio, pageCheck, product } = require('../apps');
const BASE = 'https://legendtransfers.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'Legend Transfers',
  domain: 'legendtransfers.com',
  base: BASE,
  // Ana fonksiyon testi: test ürünü otomatik seçilir (upload ürünü olmayan, stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [
    p('glitter-dtf-transfers-by-piece-kopya', "Glitter DTF Transfers by Piece", gsStudio()),
    p('fast-dtf-gang-sheet-upload', "Fast DTF Gang Sheet Upload", uploadStudio()),
    p('dtf-transfer-custom-gang-sheet', "Glitter DTF Transfer Custom Gang Sheet", gsUploader()),
    p('basic-dtf-transfers-by-piece-by-size', "Basic DTF Transfers by Piece - By Size", gsStudioBasic()),
    p('online-glitter-gang-sheet-builder', "Glitter  DTF Transfers - Gang Sheet Builder", pageCheck()),
    p('uv-dtf-transfers-by-piece-1', "DTF Transfers by Piece - By Size", gsStudio()),
    p('fast-uv-gang-sheet-upload', "Fast UV Gang Sheet Upload", uploadStudio()),
    p('dtf-gang-sheet', "Custom DTF Gang Sheet", gsUploader()),
    p('basic-uv-dtf-transfers-by-piece-uv-dtf-sticker', "Basic UV DTF Transfers by Piece - UV DTF Sticker", gsStudioBasic()),
    p('online-dtf-gang-sheets-builder', "Custom Gang Sheet Builder", pageCheck()),
    p('dtf-transfers-by-piece', "Custom Glow in the Dark DTF Transfers by Piece", gsStudio()),
    p('glow-in-the-dark-dtf-gang-sheet', "Glow in the Dark Custom DTF Gang Sheet", gsUploader()),
    p('online-uv-gang-sheet-builder', "UV DTF Sticker - UV GANG SHEET BUILDER", pageCheck()),
    p('dtf-transfers-by-piece-kopya', "UV DTF Transfers by Piece - UV DTF Sticker", gsStudio()),
    p('uv-dtf-gang-sheet-2', "UV DTF Transfers - GANG SHEET", gsUploader()),
    p('online-glow-dark-gang-sheet', "Custom Glow in the Dark Gang Sheet Builder", pageCheck()),
  ],
};
