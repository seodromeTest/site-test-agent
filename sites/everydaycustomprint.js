// Everyday Custom Print – DTF sitesi değil: promosyon/giyim ürünleri satılıyor, istenirse baskı yapılıyor.
// Tüm ürünlerde aynı upload aracı var (beden/adet tablosu + baskı alanları); ürünler sadece sunulan baskı alanlarında ayrılıyor.
// 53 ürün tarandı: 7 farklı baskı alanı düzeni var. Her düzenden bir ürün test edilir ("Ön + arka" düzeninde
// giyim ve promosyon ürünü ayrı ayrı). Mağazaya yeni bir düzen eklenirse "Upload düzeni taraması" bunu raporlar.
const { ssMatrix, ssLayoutScan, ssQuantity, SS_WIDGET, product } = require('../apps');
const BASE = 'https://www.everydaycustomprint.com';
const p = (handle, title, app, label) => ({ ...product(BASE, handle, title, app), title: `${title} (${label})` });

// Mağazada şu an bulunan baskı alanı düzenleri
const KNOWN = [
  'full_front,full_back,left_chest,right_chest,left_sleeve,right_sleeve',
  'full_front,full_back',
  'full_back,left_chest,right_chest,left_sleeve,right_sleeve',
  'full_back,left_chest,right_chest',
  'left_chest,right_chest',
  'full_front',
  'full_front,full_back,left_chest,right_chest',
];

module.exports = {
  name: 'Everyday Custom Print',
  domain: 'everydaycustomprint.com',
  base: BASE,
  // Ana fonksiyonlar: ürünler normal "Add to cart" formuyla değil, upload aracının beden/adet tablosuyla sepete ekleniyor (görselsiz)
  core: {
    search: 'shirt',
    products: ['espresso-bib-apron'],
    async addToCart(page, notes) {
      const w = await ssQuantity(page, notes);
      await w.locator('button.ss-action-btn').filter({ visible: true }).first().click();
    },
  },
  flows: [
    p('hooded-sweatshirt', 'Gildan® Unisex Heavy Blend™ Hooded Sweatshirt',
      ssMatrix({ areas: ['full_front', 'full_back', 'left_chest', 'right_chest', 'left_sleeve', 'right_sleeve'] }), '6 baskı alanı – hepsine yükleme; tişört/sweatshirt düzeni, 16 ürün'),
    p('2018-unisex-performance-mesh-polo', '2018 Unisex Performance Mesh Polo - 100% Polyester', ssMatrix({ areas: ['full_front'] }), 'ön + arka; giyim, 13 ürünlük düzen'),
    p('basic-ceramic-mug', 'Prime Line 11 oz. Basic C Handle Ceramic Mug', ssMatrix({ areas: ['full_front'] }), 'ön + arka; promosyon ürünü, en az adet şartı'),
    p('mens-pique-polo', "CORE365 Men's Resolve CVC Performance Pique Polo", ssMatrix({ areas: ['full_back'] }), 'arka, göğüs, kol; polo düzeni, 13 ürün'),
    p('class-2-vest', 'Unisex 6 Pocket Contrast Class 2 Vest', ssMatrix({ areas: ['left_chest'] }), 'arka + göğüs; yelek düzeni, 6 ürün'),
    p('mens-crown-dress-shirt', "Men's Crown Collection® Broadcloth Woven Dress Shirt", ssMatrix({ areas: ['right_chest'] }), 'sadece göğüs; gömlek düzeni, 2 ürün'),
    p('espresso-bib-apron', 'Espresso Bib Apron', ssMatrix({ areas: ['full_front'] }), 'sadece ön; önlük düzeni, 2 ürün'),
    p('cobbler-apron', 'Cobbler Apron', ssMatrix({ areas: ['full_front'] }), 'ön, arka, göğüs; 1 ürün'),
    { id: 'upload-duzenleri', title: 'Tüm ürünler – upload düzeni taraması', url: `${BASE}/collections/all`, expectProduct: '', ...ssLayoutScan(KNOWN) },
  ],
};
