// DTF Bank – upload ürünü yok, sadece ana fonksiyonlar test edilir.
module.exports = {
  name: 'DTF Bank',
  domain: 'dtfbank.com',
  base: 'https://www.dtfbank.com',
  // Ana fonksiyon testi: test ürünü otomatik seçilir (stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [],
};
