// Geçmiş yanlış alarmlar için kalıcı denemeler: test kodu değiştiğinde eski bir yanlış alarm geri gelmesin.
// Her yanlış alarm düzeltildiğinde buraya bir deneme eklenir. Gerçek sorunlar da "kontrol" olarak durur:
// düzeltme gerçek bir sorunu gizlerse yine yakalanır.
//
//   node denemeler.js           çevrimdışı denemeler (siteye bağlanmaz; GitHub'da her PR'da çalışır)
//   node denemeler.js --canli   + canlı denemeler (gerçek sitelere birkaç okuma isteği, sepete ekleme yok)
// Bu ortamda yerel çalıştırmada: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
const assert = require('assert');
const { botFromLog, isNoise, diagnose } = require('./lib');
const { linkResult } = require('./genel');

const CANLI = process.argv.includes('--canli');
let gecen = 0, kalan = 0;
async function deneme(ad, fn) {
  try { await fn(); gecen++; console.log(`  ✓ ${ad}`); }
  catch (e) { kalan++; console.log(`  ✗ ${ad}\n      ${e.message.split('\n')[0]}`); }
}

(async () => {
  console.log('Çevrimdışı denemeler');

  // Link sınıflandırması: "Sorun" sadece gerçek hatalı cevap; hız sınırı / doğrulama = kontrol edilemedi
  await deneme('429 (iç link) Sorun sayılmaz → kontrol edilemedi', () => assert.equal(linkResult({ code: 429 }).durum, 'yapilmadi'));
  await deneme('Cloudflare doğrulaması (iç link) Sorun sayılmaz → kontrol edilemedi', () => assert.equal(linkResult({ code: 403, challenge: true }).durum, 'yapilmadi'));
  await deneme('LinkedIn 999 / doğrulama (dış site) → adres doğru, başarılı', () => {
    assert.equal(linkResult({ code: 999 }, { external: true, social: 'LinkedIn' }).durum, 'ok');
    assert.equal(linkResult({ code: 403, challenge: true }, { external: true, social: 'LinkedIn' }).durum, 'ok');
  });
  await deneme('Kontrol: 404 hâlâ Sorun (iç ve dış link, ör. YouTube @dtfnash)', () => {
    assert.equal(linkResult({ code: 404 }).durum, 'hata');
    assert.equal(linkResult({ code: 404 }, { external: true, social: 'YouTube' }).durum, 'hata');
  });
  await deneme('Kontrol: 500 ve bağlantı hatası hâlâ Sorun', () => {
    assert.equal(linkResult({ code: 503 }).durum, 'hata');
    assert.equal(linkResult({ code: 'hata', err: 'ENOTFOUND' }).durum, 'hata');
  });

  // Firefox'ta sayfa hiç açılamadığında (9 Kasım, fastdtftransfer): oturum kaydından hız sınırı / doğrulama
  const site = 'www.fastdtftransfer.com';
  await deneme('Sayfa açılamadı + siteden 429 → hız sınırı (test edilemedi)', () => assert.equal(botFromLog([
    { kind: 'network', status: 429, url: 'https://www.fastdtftransfer.com/products/dtf-transfers-by-size' },
    { kind: 'network', status: 0, url: 'https://brunhild.challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/i/x' }], site), 'ratelimit'));
  await deneme('Cloudflare doğrulama istekleri → bot koruması (test edilemedi)', () => assert.equal(botFromLog([
    { kind: 'network', status: 401, url: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/pat/x' }], site), 'challenge'));
  await deneme('Kontrol: başka siteden 429 ya da sıradan 404 → bot/hız sınırı sayılmaz', () => {
    assert.equal(botFromLog([{ kind: 'network', status: 429, url: 'https://cdn.example.com/x.js' }], site), false);
    assert.equal(botFromLog([{ kind: 'network', status: 404, url: 'https://www.fastdtftransfer.com/products/yok' }], site), false);
  });

  // Konsol gürültüsü: zararsız mesajlar ayıklanır, gerçek hatalar kalır
  await deneme('Zararsız konsol mesajları ayıklanır (_shopify_test, NetworkError, Safari sprite, Shop Pay, analitik)', () => {
    for (const text of ['Cookie “_shopify_test” has been rejected for invalid domain.', 'TypeError: NetworkError when attempting to fetch resource.',
      'Unsafe attempt to load URL https://cdn.shopify.com/shopifycloud/customer-authentication-web/production/sprite-86bf53.svg from origin',
      "Framing 'https://shop.app/' violates the following Content Security Policy directive", 'Clarity pixel failed to start'])
      assert.ok(isNoise({ text }), text);
  });
  await deneme('Kontrol: gerçek hatalar ayıklanmaz (GS Studio 429, DTF Nash JS hatası, sepet 422)', () => {
    for (const e of [{ text: '[GSB Image to Sheet embed] failed: channel 429' }, { text: "Unexpected token '}'" },
      { url: 'https://dtfnash.com/cart/add.js', text: 'Cannot find variant' }])
      assert.ok(!isNoise(e), JSON.stringify(e));
  });
  await deneme('Teşhis: sepete ekleme reddi en önde gösterilir', () => {
    const t = diagnose([{ t: 1, kind: 'console', level: 'error', text: 'x' },
      { t: 2, kind: 'network', level: 'warning', method: 'POST', url: 'https://dtfnash.com/cart/add.js', status: 422, text: 'Cannot find variant', type: 'fetch' }], 'dtfnash.com');
    assert.match(t[0], /cart\/add\.js → HTTP 422/);
  });

  if (CANLI) {
    console.log('\nCanlı denemeler (okuma istekleri, sepete ekleme yok)');
    const { chromium } = require('playwright');
    const { newPage, gotoOk, botCheck } = require('./lib');
    const { koleksiyonUrunSayisi, masaustuMenu, ikinciKontrol } = require('./genel');

    // Boş koleksiyon kontrolü
    await deneme('Alpha: yönlendirilen eski koleksiyon adresi boş sayılmaz (4 Kasım)', async () =>
      assert.notEqual(await koleksiyonUrunSayisi('https://alphadtfprint.com/collections/dtf-transfer-1'), 0));
    await deneme('Eagle: marka sayfası /collections/vendors?q= boş sayılmaz (16 Kasım)', async () =>
      assert.notEqual(await koleksiyonUrunSayisi('https://eagledtfprint.com/collections/vendors?q=Eagle+DTF+Print'), 0));
    await deneme('Kontrol: Everyday "Same Day" (rush-orders) gerçekten boş → 0', async () =>
      assert.equal(await koleksiyonUrunSayisi('https://www.everydaycustomprint.com/collections/rush-orders'), 0));

    const browser = await chromium.launch();
    try {
      // Shopify sayfalarında challenge-platform scripti her zaman var: normal sayfa bot koruması sayılmaz (4 Kasım)
      await deneme('Normal Shopify sayfası bot koruması sayılmaz (challenge-platform scripti)', async () => {
        const { ctx, page } = await newPage(browser);
        try { await gotoOk(page, 'https://www.fastdtftransfer.com/'); await page.waitForTimeout(3000); assert.equal(await botCheck(page), false); }
        finally { await ctx.close(); }
      });
      // Chili masaüstü menü: hover alt menüyü açıyor (4 Kasım yanlış alarmı)
      await deneme('Chili: masaüstü menülerin alt menüleri açılıyor', async () => {
        const { ctx, page } = await newPage(browser);
        const rows = [];
        try {
          await gotoOk(page, 'https://www.chilitransfers.com/', { waitUntil: 'load' }); await page.waitForTimeout(3000);
          await masaustuMenu(page, (bolum, kontrol, adres, sonuc, durum) => rows.push({ kontrol, durum }));
        } finally { await ctx.close(); }
        assert.ok(rows.length >= 2, `menü öğesi bulunamadı (${rows.length})`);
        const bad = rows.filter(r => r.durum === 'hata');
        assert.equal(bad.length, 0, bad.map(r => r.kontrol).join(', '));
      });
      // İkinci kontrol: yanlış alarmı Not'a çevirir, gerçek sorunu Sorun bırakır
      await deneme('İkinci kontrol: çalışan koleksiyon/sayfa "Sorun" kalmaz, YouTube @dtfnash 404 "Sorun" kalır', async () => {
        const rows = [
          { bolum: 'x', kontrol: 'Eagle marka', adres: 'https://eagledtfprint.com/collections/vendors?q=Eagle+DTF+Print', sonuc: 'Sorun: koleksiyon açılıyor ama içinde ürün yok', durum: 'hata', tur: 'koleksiyon' },
          { bolum: 'x', kontrol: 'Alpha sayfa', adres: 'https://alphadtfprint.com/pages/faq', sonuc: 'Sorun: sayfa açılmıyor (HTTP 503)', durum: 'hata', tur: 'link' },
          { bolum: 'x', kontrol: 'YouTube', adres: 'https://www.youtube.com/@dtfnash', sonuc: 'Sorun: sayfa bulunamadı (HTTP 404)', durum: 'hata', tur: 'link', dis: true },
          { bolum: 'x', kontrol: 'Everyday Same Day', adres: 'https://www.everydaycustomprint.com/collections/rush-orders', sonuc: 'Sorun: koleksiyon açılıyor ama içinde ürün yok', durum: 'hata', tur: 'koleksiyon' },
        ];
        await ikinciKontrol(browser, { base: 'https://example.com' }, rows);
        assert.notEqual(rows[0].durum, 'hata', 'Eagle: ' + rows[0].sonuc);
        assert.notEqual(rows[1].durum, 'hata', 'Alpha: ' + rows[1].sonuc);
        assert.equal(rows[2].durum, 'hata', 'YouTube: ' + rows[2].sonuc);
        assert.equal(rows[3].durum, 'hata', 'Everyday: ' + rows[3].sonuc);
      });
    } finally { await browser.close(); }
  }

  console.log(`\n${gecen} geçti, ${kalan} başarısız`);
  process.exit(kalan ? 1 : 0);
})();
