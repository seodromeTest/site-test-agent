// FastDTF Supply – upload ürünü yok, sadece ana fonksiyonlar test edilir.
module.exports = {
  name: 'FastDTF Supply',
  domain: 'fastdtfsupply.com',
  base: 'https://fastdtfsupply.com',
  // İlk stokta olan ürün kullanılır
  core: { search: 'film', products: ['dtf-printhead-cleaning-solution-500ml', 'premium-dtf-ink-set', 'dtf-powder-medium-1-kg-2-2-lb'] },
  flows: [],
};
