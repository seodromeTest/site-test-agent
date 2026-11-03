// Eagle DTF Supply – upload ürünü yok, sadece ana fonksiyonlar test edilir.
module.exports = {
  name: 'Eagle DTF Supply',
  domain: 'eagledtfsupply.com',
  base: 'https://eagledtfsupply.com',
  // Ana fonksiyon testi: test ürünü otomatik seçilir (stokta ilk ürün)
  core: { search: 'dtf' },
  flows: [],
};
