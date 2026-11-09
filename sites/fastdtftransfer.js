// FastDTF Transfer – upload uygulaması olan ürünler. Uygulamaların test adımları apps.js'de.
// Sıra: aynı uygulama arka arkaya gelmesin (GS Studio art arda isteklerde "Too many requests" verebiliyor).
const { uploadStudio, gsUploader, gsStudio, builder, product } = require('../apps');
const BASE = 'https://www.fastdtftransfer.com';
const p = (handle, title, app) => product(BASE, handle, title, app);
// Basic By Size ürünlerinde GS Studio kendi dosya alanını kullanıyor (sayfada yorum formu için başka dosya alanları da var)
const gsStudioBasic = () => gsStudio({ input: '#gsb-i2s-file-input' });

module.exports = {
  name: 'FastDTF Transfer',
  domain: 'fastdtftransfer.com',
  base: BASE,
  // En çok upload ürünü olan site: art arda testte Shopify hız sınırına (429) takılıyor, akışlar arası daha uzun bekle
  slowPace: true,
  // Saatlik ana fonksiyon testi: arama + normal ürünle sepete ekle + checkout
  core: { search: 'film', products: ['uv-dtf-a-b-film-roll-24-325', 'dtf-printhead-cleaning-solution-500ml'] },
  flows: [
    p('dtf-transfers-by-size', 'DTF Transfers By Size', gsStudio()),
    p('upload-a-dtf-gang-sheet', 'Upload a DTF Gang Sheet', uploadStudio()),
    p('custom-dtf-transfer', 'Upload a DTF Gang Sheet', gsUploader()),
    p('free-dtf-gang-sheet-builder', 'Free DTF Gang Sheet Builder', builder()),
    p('basic-dtf-transfers-by-size', 'Basic DTF Transfers By Size', gsStudioBasic()),
    p('uv-dtf-gang-sheets-2', 'UV DTF Gang Sheets', uploadStudio()),
    p('uv-dtf-gang-sheets', 'UV DTF Gang Sheets', gsUploader()),
    p('uv-dtf-transfers', 'UV DTF Transfers By Size', gsStudio()),
    p('uv-dtf-gang-sheets-1', 'Build Your Own UV DTF Gang Sheets', builder()),
    p('basic-uv-dtf-transfers-by-size', 'Basic UV DTF Transfers By Size', gsStudioBasic()),
    p('glitter-dtf-transfer-gang-sheets', 'Glitter DTF Transfer - Gang Sheets', uploadStudio()),
    p('glitter-dtf-gang-sheets', 'Glitter DTF Transfer - Gang Sheets', gsUploader()),
    p('glitter-dtf-transfers-by-size', 'Glitter DTF Transfers  By Size', gsStudio()),
    p('glitter-dtf-transfer-gang-sheet-builder', 'Glitter DTF Transfer - Gang Sheet Builder', builder()),
    p('glow-in-the-dark-dtf-dtf-gang-sheets', 'Glow In The Dark DTF - DTF Gang Sheets', uploadStudio()),
    p('glow-in-the-dark-dtf', 'Glow In The Dark DTF - DTF Transfers  By Size', gsStudio()),
    p('glow-in-the-dark-dtf-gang-sheets', 'Glow In The Dark DTF - DTF Gang Sheets', gsUploader()),
    p('dtf-gang-sheet-builder', 'Glow In The Dark DTF - Gang Sheet Builder', builder()),
  ],
};
