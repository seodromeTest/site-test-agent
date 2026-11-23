// Saatlik kontrol listesi (kullanıcının verdiği liste, 19 Kasım 2026).
// - upload: saatlik testte upload'u denenecek ürünler. Her saat her siteden SIRADAKİ bir ürün test edilir
//   (ör. 8 ürünü olan sitede her ürün 8 saatte bir). Ürün sitenin sites/<site>.js dosyasında bir akış olarak
//   tanımlı olmalı (aynı handle). Adresteki ?variant=… olduğu gibi kullanılır.
// - Bu listede ürünü olmayan siteler: saatlik testte ana sayfa + normal bir ürünle Add to cart → sepet → checkout.
// - haric: saatlik testte hiç olmayan siteler.
// Her ürünün yükleme alanının kabul ettiği dosya türleri (23 Kasım taraması: sayfadaki dosya alanı `accept` ve builder'ın
// "Supported formats" yazısı). Saatlik testte ürünün her turunda bunlardan SIRADAKİ tek dosya yüklenir
// (fixtures/formatlar/gangsheet|builder/, hepsi 300 DPI ya da vektör). Sıra: FORMAT_SIRASI.
const FORMAT_SIRASI = ['png', 'jpg', 'pdf', 'svg', 'psd', 'ai', 'eps', 'webp', 'tif'];
// Builder ai/eps de kabul ettiğini söylüyor ama 23 Kasım ilk turunda (5 sitede) test ai/eps dosyası seçilince builder hiçbir
// şey yapmadı (yükleme isteği yok, hata mesajı yok). Gerçek Illustrator/EPS dosyasıyla doğrulanana kadar builder sırasında yok.
const BUILDER = ['png', 'jpg', 'svg', 'psd', 'pdf'];
const BUILDER_WEBP = [...BUILDER, 'webp'];
const GS_UPLOADER = ['png', 'jpg', 'svg', 'psd', 'ai', 'eps', 'pdf', 'webp'];
const formatlar = {
  'dtftransferohio.com/premium-dtf-gang-sheets': ['png', 'jpg', 'webp', 'svg', 'pdf', 'tif', 'psd', 'ai', 'eps'], // Cloudlift
  'dtftransferohio.com/uv-dtf-gang-sheets-ohio': ['png', 'jpg', 'webp', 'svg', 'pdf', 'tif', 'psd', 'ai', 'eps'],  // Cloudlift
  'dtftransferohio.com/gang-sheet-builder-dtf-build': BUILDER,
  'dtftransferohio.com/uv-dtf-gang-sheet-builder': BUILDER,
  'dtfprintdepot.com/gang-sheet-builder-1': BUILDER,
  'dtfprintdepot.com/uv-dtf-gang-sheet': BUILDER,
  'dtfnash.com/gang-sheet-builder-1': BUILDER_WEBP,
  'dtfnash.com/uv-dtf-gang-sheet': BUILDER_WEBP,
  'legendtransfers.com/dtf-gang-sheet': GS_UPLOADER,
  'legendtransfers.com/glitter-dtf-transfer-custom-gang-sheet-upload': GS_UPLOADER,
  'legendtransfers.com/glow-in-the-dark-dtf-gang-sheet': GS_UPLOADER,
  'legendtransfers.com/uv-dtf-gang-sheet-2': GS_UPLOADER,
  'legendtransfers.com/online-dtf-gang-sheets-builder': BUILDER,
  'legendtransfers.com/online-glitter-gang-sheet-builder': BUILDER,
  'legendtransfers.com/online-glow-dark-gang-sheet': BUILDER,
  'legendtransfers.com/online-uv-gang-sheet-builder': BUILDER,
  'fastdtftransfer.com/custom-dtf-transfer': GS_UPLOADER,
  'fastdtftransfer.com/uv-dtf-gang-sheets': GS_UPLOADER,
  'fastdtftransfer.com/glitter-dtf-gang-sheets': GS_UPLOADER, // sayfa taramada okunamadı: sitedeki diğer GS uploader'larla aynı
  'fastdtftransfer.com/glow-in-the-dark-dtf-gang-sheets': GS_UPLOADER,
  'fastdtftransfer.com/free-dtf-gang-sheet-builder': BUILDER_WEBP,
  'fastdtftransfer.com/uv-dtf-gang-sheets-1': BUILDER_WEBP,
  'fastdtftransfer.com/glitter-dtf-transfer-gang-sheet-builder': BUILDER_WEBP,
  'fastdtftransfer.com/dtf-gang-sheet-builder': BUILDER_WEBP,
  'dtftransferarizona.com/dtf-gang-sheet': ['png'],     // Cloudlift: sadece PNG kabul ediyor
  'dtftransferarizona.com/uv-dtf-gang-sheet-1': ['png'], // Cloudlift: sadece PNG
  'dtftransferarizona.com/dtf-gang-sheet-builder': BUILDER_WEBP,
  'dtftransferarizona.com/uv-dtf-gang-sheet': BUILDER_WEBP,
  'customprintaz.com/dtf-gang-sheet-builder': BUILDER, // sayfa taramada okunamadı: sitedeki diğer builder'la aynı
  'customprintaz.com/uv-dtf-gang-sheet': BUILDER,
  'eagledtfprint.com/dtf-gang-sheet-upload': ['png', 'jpg', 'svg', 'psd', 'ai', 'eps', 'pdf'],        // GS uploader, webp yok
  'eagledtfprint.com/uv-dtf-gang-sheet': ['png', 'jpg', 'svg', 'psd', 'ai', 'eps', 'pdf'],
  'eagledtfprint.com/glitter-dtf-gang-sheets': ['png', 'jpg', 'svg', 'psd', 'ai', 'eps', 'pdf'],
  'eagledtfprint.com/upload-your-glow-in-the-dark-dtf-gang-sheet': ['png', 'jpg', 'svg', 'psd', 'ai', 'eps', 'pdf'],
  'eagledtfprint.com/build-dtf-gang-sheet': ['png', 'jpg', 'psd', 'pdf'],               // builder, svg yok (ai/eps geçici olarak yok, yukarıda)
  'eagledtfprint.com/uv-gang-sheet-builder': ['png', 'jpg', 'psd', 'pdf'],
  'eagledtfprint.com/glitter-dtf-gang-sheet-builder': ['png', 'jpg', 'psd', 'pdf'],
  'eagledtfprint.com/glow-dark-dtf-gang-sheet': ['png', 'jpg', 'psd', 'pdf'],
  'chilitransfers.com/dtf-gang-sheet-builder': ['png', 'jpg', 'svg', 'pdf'],           // builder, psd yok (ai/eps geçici olarak yok)
  'chilitransfers.com/uv-dtf-gang-sheet-builder': ['png', 'jpg', 'svg', 'pdf'],
};

module.exports = {
  FORMAT_SIRASI,
  formatlar,
  haric: [],
  upload: [
    'https://www.dtftransferohio.com/products/premium-dtf-gang-sheets',
    'https://www.dtftransferohio.com/products/gang-sheet-builder-dtf-build',
    'https://www.dtftransferohio.com/products/uv-dtf-gang-sheets-ohio',
    'https://www.dtftransferohio.com/products/uv-dtf-gang-sheet-builder',
    'https://dtfprintdepot.com/products/gang-sheet-builder-1',
    'https://dtfprintdepot.com/products/uv-dtf-gang-sheet',
    'https://dtfnash.com/products/gang-sheet-builder-1',
    'https://dtfnash.com/products/uv-dtf-gang-sheet',
    'https://legendtransfers.com/products/dtf-gang-sheet',
    'https://legendtransfers.com/products/online-dtf-gang-sheets-builder?variant=49424053076241',
    'https://legendtransfers.com/products/glitter-dtf-transfer-custom-gang-sheet-upload',
    'https://legendtransfers.com/products/online-glitter-gang-sheet-builder?variant=51528231682321',
    'https://legendtransfers.com/products/glow-in-the-dark-dtf-gang-sheet',
    'https://legendtransfers.com/products/online-glow-dark-gang-sheet?variant=51528242954513',
    'https://legendtransfers.com/products/uv-dtf-gang-sheet-2',
    'https://legendtransfers.com/products/online-uv-gang-sheet-builder?variant=49938631295249',
    'https://www.fastdtftransfer.com/products/custom-dtf-transfer',
    'https://www.fastdtftransfer.com/products/free-dtf-gang-sheet-builder',
    'https://www.fastdtftransfer.com/products/uv-dtf-gang-sheets',
    'https://www.fastdtftransfer.com/products/uv-dtf-gang-sheets-1',
    'https://www.fastdtftransfer.com/products/glitter-dtf-transfer-gang-sheet-builder',
    'https://www.fastdtftransfer.com/products/glitter-dtf-gang-sheets',
    'https://www.fastdtftransfer.com/products/dtf-gang-sheet-builder',
    'https://www.fastdtftransfer.com/products/glow-in-the-dark-dtf-gang-sheets',
    'https://www.dtftransferarizona.com/products/dtf-gang-sheet?variant=48201499967540',
    'https://www.dtftransferarizona.com/products/dtf-gang-sheet-builder?variant=46401154514996',
    'https://www.dtftransferarizona.com/products/uv-dtf-gang-sheet-1?variant=46401192624180',
    'https://www.dtftransferarizona.com/products/uv-dtf-gang-sheet?variant=46401164607540',
    'https://customprintaz.com/products/dtf-gang-sheet-builder',
    'https://customprintaz.com/products/uv-dtf-gang-sheet',
    'https://eagledtfprint.com/products/dtf-gang-sheet-upload',
    'https://eagledtfprint.com/products/build-dtf-gang-sheet',
    'https://eagledtfprint.com/products/uv-dtf-gang-sheet',
    'https://eagledtfprint.com/products/uv-gang-sheet-builder',
    'https://eagledtfprint.com/products/glitter-dtf-gang-sheets',
    'https://eagledtfprint.com/products/glitter-dtf-gang-sheet-builder',
    'https://eagledtfprint.com/products/upload-your-glow-in-the-dark-dtf-gang-sheet',
    'https://eagledtfprint.com/products/glow-dark-dtf-gang-sheet',
    'https://www.chilitransfers.com/products/dtf-gang-sheet-builder',
    'https://www.chilitransfers.com/products/uv-dtf-gang-sheet-builder',
  ],
};
