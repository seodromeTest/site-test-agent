// Bir sitede yapılan her kontrolü alt alta satır olarak üretir (mail tablosu ve Excel aynı satırları kullanır).
// Satır: { bolum, kontrol, adres, sonuc, durum: 'ok' | 'hata' | 'bilgi' | 'yapilmadi' }
// Teknik hata mesajlarını okunur hale getir
const human = e => String(e || 'başarısız')
  .replace(/^locator\.click: Timeout (\d+)ms exceeded\.?/, (_, ms) => `Buton ${ms / 1000} sn içinde tıklanamadı (görünmüyor ya da tepki vermiyor)`)
  .replace(/^locator\.waitFor: Timeout (\d+)ms exceeded\.?/, (_, ms) => `Beklenen alan ${ms / 1000} sn içinde görünmedi`)
  .replace(/^page\.waitForURL: Timeout (\d+)ms exceeded\.?/, (_, ms) => `${ms / 1000} sn içinde sonraki sayfaya geçilmedi`)
  .replace(/^page\.goto: net::(\S+).*/, (_, c) => `Sayfa açılamadı (${c})`)
  .replace(/^(\w+\.)+\w+: /, '');
const sn = ms => (ms == null ? '' : `${(ms / 1000).toFixed(1)} sn`);

const CORE_STEPS = ['Ana sayfa', 'Arama', 'Ürün sayfası', 'Add to cart butonu', 'Sepet sayfası', 'Checkout butonu'];

function coreText(f, s) {
  switch (s.name) {
    case 'Ana sayfa': return ['Ana sayfa açılıyor mu', s.ok ? `Açıldı (${sn(f.homepageMs ?? s.ms)})` : null];
    case 'Arama': return [f.search ? `Arama kutusu: "${f.search}" araması sonuç veriyor mu` : 'Arama sonuç veriyor mu', s.ok ? `Sonuç geldi${f.searchCount ? ` (${f.searchCount} ürün)` : ''}` : null];
    case 'Ürün sayfası': return ['Normal bir ürünün sayfası açılıyor mu', s.ok ? `Açıldı${f.testProduct ? `: ${f.testProduct}` : ''}` : null];
    case 'Add to cart butonu': return ['Add to cart butonu ürünü sepete ekliyor mu', s.ok ? `Sepete eklendi${f.cart ? ` ($${f.cart.price})` : ''}` : null];
    case 'Sepet sayfası': return ['Sepet sayfası açılıyor, ürün görünüyor mu', s.ok ? 'Ürün sepette görünüyor' : null];
    case 'Checkout butonu': return ['Checkout butonu ödeme sayfasına götürüyor mu', s.ok ? (f.checkout || 'Ödeme sayfası açıldı') + ' (sipariş verilmedi)' : null];
    default: return [s.name, null];
  }
}

function uploadText(f, s) {
  switch (s.name) {
    case 'Sayfa açılıyor': return ['Ürün sayfası açılıyor mu', s.ok ? `Açıldı (${sn(s.ms)})` : null];
    case 'Upload': return [`Test dosyası yükleniyor (${f.file || 'görsel'})`, s.ok ? (f.app === 'Everyday upload aracı' ? 'Görsel baskı alanına yüklendi, önizlemesi göründü' : 'Dosya yüklendi, ölçü ve fiyat hesaplandı') : null];
    case 'Adet seçimi': return ['Beden/adet tablosundan adet seçiliyor (en az adet şartı varsa kontrol ediliyor)', s.ok ? 'Adet girildi, toplam fiyat hesaplandı' : null];
    case 'Tüm ürünlerin upload düzeni': return ['Sitedeki tüm ürünlerde upload aracı var mı, baskı alanı düzeni testtekilerle aynı mı', s.ok ? 'Tüm ürünlerde upload aracı var, yeni düzen yok' : null];
    case 'Onay kutusu': return ['Çözünürlük onay kutusu işaretleniyor', s.ok ? 'İşaretlendi' : null];
    case 'Builder açılıyor': return ['Gang sheet builder açılıyor mu', s.ok ? 'Açıldı' : null];
    case "Görseli sheet'e yerleştir": return ['Görsel sheet üzerine yerleştiriliyor', s.ok ? 'Yerleştirildi' : null];
    case 'Save & Add to Cart': return ['Save & Add to Cart butonu', s.ok ? 'Kaydedildi, sepete gönderildi' : null];
    case 'Sepete ekle': return ['Add to cart butonu', s.ok ? 'Tıklandı, sepete gönderildi' : null];
    case 'Sepet doğrulama': return ['Ürün yüklenen dosyayla birlikte sepete düştü mü', s.ok ? `Sepette${f.cart ? `: ${[f.cart.variant, '$' + f.cart.price].filter(Boolean).join(' · ')}` : ''}` : null];
    case 'Baskı dosyası erişilebilir': return ['Sepetteki baskı dosyası linki açılıyor mu', s.ok ? 'Açılıyor' : null];
    case 'Sepet sayfası': return ['Sepet sayfasında ürün görünüyor mu', s.ok ? 'Görünüyor' : null];
    case 'Ürün sayfası': return ['Ürün başlığı ve sayfa içeriği görünüyor mu', s.ok ? 'Görünüyor' : null];
    default: return [s.name, null];
  }
}

function flowRows(f) {
  const isCore = f.id === 'core';
  const bolum = isCore ? 'Ana fonksiyonlar' : f.title;
  // Test sunucusu bot korumasına takıldıysa: site hatası sayma, "test edilemedi" olarak göster
  const BOT = 'Test edilemedi: test sunucusu (GitHub) Shopify/Cloudflare bot korumasına ("Verify you are human") takıldı – site hatası değil, elle kontrol önerilir';
  const rows = f.steps.map(s => {
    const [kontrol, okText] = (isCore ? coreText : uploadText)(f, s);
    return { bolum, kontrol, adres: isCore && s.name === 'Ana sayfa' ? f.url && new URL(f.url).origin + '/' : f.url,
      sonuc: s.ok ? okText || 'Başarılı' : f.botBlock ? BOT : `Sorun: ${human(s.error)}`, durum: s.ok ? 'ok' : f.botBlock ? 'yapilmadi' : 'hata' };
  });
  // Hata sonrası yapılamayan adımlar da görünsün
  if (isCore && !f.ok) for (const name of CORE_STEPS.slice(CORE_STEPS.indexOf(f.steps[f.steps.length - 1]?.name) + 1))
    rows.push({ bolum, kontrol: coreText(f, { name })[0], adres: '', sonuc: 'Yapılamadı (önceki adımda sorun var)', durum: 'yapilmadi' });
  if (!f.ok && !isCore) rows.push({ bolum, kontrol: 'Sonraki adımlar', adres: '', sonuc: 'Yapılamadı (önceki adımda sorun var)', durum: 'yapilmadi' });
  if (f.retried && f.ok) rows.push({ bolum, kontrol: 'Not', adres: '', sonuc: `İlk denemede takıldı (${f.firstAttempt?.step || ''}${f.firstAttempt?.botBlock ? ', bot koruması' : ''}), ikinci denemede geçti`, durum: 'bilgi' });
  for (const n of f.notes || []) rows.push({ bolum, kontrol: 'Not', adres: '', sonuc: n, durum: 'bilgi' });
  return rows;
}

function linkRows(links) {
  if (!links) return [];
  const bolum = 'Ana sayfadaki linkler';
  if (links.error) return [{ bolum, kontrol: 'Link kontrolü', adres: '', sonuc: `Sorun: ${links.error}`, durum: 'hata' }];
  const all = links.all || links.broken.map(b => ({ ...b, text: '' }));
  return all.map(l => {
    const bad = l.status === 'hata' || (l.status >= 400 && l.status !== 429);
    return { bolum, kontrol: l.text || new URL(l.url).pathname, adres: l.url,
      sonuc: bad ? `Sorun: sayfa açılmıyor (${l.status === 'hata' ? 'bağlantı hatası' : 'HTTP ' + l.status})` : l.status === 429 ? 'Açıldı (site yoğun, 429)' : 'Açıldı', durum: bad ? 'hata' : 'ok' };
  });
}

function browserRows(s) {
  if (!s.tarayicilar?.length) return [];
  const rows = [{ bolum: 'Tarayıcı uyumluluğu', kontrol: 'Chrome', adres: '', sonuc: 'Yukarıdaki tüm testler Chrome ile yapıldı. Edge ve Opera da Chrome motoruyla çalışır; bu sonuçlar onlar için de geçerli', durum: 'bilgi' }];
  for (const t of s.tarayicilar) {
    if (t.error) { rows.push({ bolum: `${t.browser}`, kontrol: 'Tarayıcı', adres: '', sonuc: `Sorun: ${t.error}`, durum: 'hata' }); continue; }
    for (const f of t.flows) for (const r of flowRows(f)) rows.push({ ...r, bolum: `${t.browser} – ${r.bolum}` });
  }
  return rows;
}

const siteRows = s => [...s.flows.flatMap(flowRows), ...(s.genel || linkRows(s.links)), ...browserRows(s)];

module.exports = { siteRows };
