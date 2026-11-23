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
  // 20 Kasım: test kaynaklı (engellenen TikTok vb.) ve Shopify/Cloudflare olağan mesajları raporda görünmesin
  await deneme('Test kaynaklı ve Shopify/Cloudflare olağan mesajlar ayıklanır (20 Kasım)', () => {
    for (const e of [
      { kind: 'jserror', text: "Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https://analytics.tiktok.com/i18n/pixel/shopify.js' failed to load." },
      { kind: 'jserror', text: 'Failed to fetch' },
      { kind: 'jserror', text: `Failed to read a named property 'document' from 'Window': Blocked a frame with origin "null" from accessing a cross-origin frame.` },
      { kind: 'console', text: "Connecting to 'data:,' violates the following Content Security Policy directive: \"connect-src 'self'\"" },
      { kind: 'console', text: "Fetch API cannot load data:,. Refused to connect because it violates the document's Content Security Policy." },
      { kind: 'console', text: '%c%d font-size:0;color:transparent NaN' },
      { kind: 'console', text: "Framing 'https://www.google.com/' violates the following report-only Content Security Policy directive" },
      { kind: 'console', text: 'Permissions policy violation: compute-pressure is not allowed in this document.' },
    ]) assert.ok(isNoise(e), e.text);
  });
  await deneme('Kontrol: sitelerin gerçek JS/konsol hataları ayıklanmaz (20 Kasım değerlendirmesi)', () => {
    for (const e of [
      { kind: 'jserror', text: "Unexpected identifier 't'" },                       // FastDTF Supply cart recovery
      { kind: 'jserror', text: "Unexpected token '^'" },                            // DTF Bank telefon formatı
      { kind: 'jserror', text: 'Unexpected end of input' },                         // DTF Bank şema scripti
      { kind: 'jserror', text: "Identifier 'LinkedinScript' has already been declared" }, // Eagle
      { kind: 'jserror', text: "Cannot read properties of null (reading 'removeChild')" }, // DTF Print House
      { kind: 'console', text: "Refused to execute script from 'https://app.dripappsserver.com/shopify/script/builder-button?shop=x' because its MIME type ('') is not executable" },
      { kind: 'console', text: 'TypeError: Failed to fetch' },                     // konsoldaki fetch hatası (sayfa yakalamış) görünür kalır
    ]) assert.ok(!isNoise(e), e.text);
  });
  await deneme('Teşhis: sepete ekleme reddi en önde gösterilir', () => {
    const t = diagnose([{ t: 1, kind: 'console', level: 'error', text: 'x' },
      { t: 2, kind: 'network', level: 'warning', method: 'POST', url: 'https://dtfnash.com/cart/add.js', status: 422, text: 'Cannot find variant', type: 'fetch' }], 'dtfnash.com');
    assert.match(t[0], /cart\/add\.js → HTTP 422/);
  });

  // Saatlik test (19 Kasım): liste, ürün sırası ve uyarı seviyeleri
  const { severity, alertState } = require('./uyari');
  const SAATLIK = require('./saatlik');
  const fs = require('fs');
  await deneme('saatlik.js: her ürün kendi sitesinde testi olan bir akış (pageCheck değil); gangsheet.com testten çıkarıldı', () => {
    const sites = fs.readdirSync(`${__dirname}/sites`).map(f => require(`./sites/${f}`));
    for (const u of SAATLIK.upload) {
      const url = new URL(u), site = sites.find(s => new URL(s.base).hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, ''));
      assert.ok(site, `site yok: ${u}`);
      const f = site.flows.find(x => x.id === url.pathname.split('/products/')[1]);
      assert.ok(f && !f.noCart, `testi olan akış yok: ${u}`);
    }
    // gangsheet.com 19 Kasım'da kullanıcının isteğiyle testten tamamen çıkarıldı
    assert.ok(!sites.some(x => x.domain === 'gangsheet.com'), 'gangsheet.com testte olmamalı');
  });
  await deneme('Dosya türleri: saatlik listedeki her ürünün kabul ettiği türler tanımlı, her tür için 300 DPI/vektör dosya var (23 Kasım)', () => {
    for (const u of SAATLIK.upload) {
      const url = new URL(u), key = url.hostname.replace(/^www\./, '') + '/' + url.pathname.split('/products/')[1];
      const kabul = SAATLIK.formatlar[key];
      assert.ok(kabul && kabul.length, `formatlar yok: ${key}`);
      for (const ext of kabul) {
        assert.ok(SAATLIK.FORMAT_SIRASI.includes(ext), `${key}: bilinmeyen tür ${ext}`);
        for (const d of ['gangsheet', 'builder'])
          assert.ok(fs.readdirSync(`${__dirname}/fixtures/formatlar/${d}`).some(f => f.endsWith('.' + ext)), `fixtures/formatlar/${d}: ${ext} yok`);
      }
    }
  });
  await deneme('Dosya türleri: Arizona Cloudlift sadece PNG; Eagle builder SVG almaz; Chili builder PSD almaz', () => {
    assert.deepEqual(SAATLIK.formatlar['dtftransferarizona.com/dtf-gang-sheet'], ['png']);
    assert.ok(!SAATLIK.formatlar['eagledtfprint.com/build-dtf-gang-sheet'].includes('svg'));
    assert.ok(!SAATLIK.formatlar['chilitransfers.com/dtf-gang-sheet-builder'].includes('psd'));
  });
  await deneme('Mail: uyarıda test dosyası adı görünür', () => {
    const { build } = require('./report');
    const r = build({ mode: 'hourly', startedAt: '2026-11-23T10:00:00Z', ms: 1, sites: [], ok: false, alert: { newFailures: [{ site: 'a.com', flow: 'Y (Build a Gang Sheet)', level: 'uyari', dosya: 'builder_10x10in_300dpi.pdf', step: 'Upload' }], recovered: [], ongoing: [] } });
    assert.match(r.html, /test dosyası: builder_10x10in_300dpi\.pdf/);
  });
  await deneme('Kapsam: saatlik sonuç ürün × türe yazılır; tabloda geçti/takıldı/bekliyor/bilinen/kabul etmiyor (23 Kasım)', () => {
    const K = require('./kapsam');
    const t = '2026-11-23T11:40:00Z';
    const k = K.kaydet({}, [{ domain: 'dtfprintdepot.com', flows: [
      { id: 'anasayfa', ok: true, steps: [] },
      { id: 'uv-dtf-gang-sheet', file: 'builder_10x10in_300dpi.psd', ok: true, steps: [{ name: 'Upload', ok: true }] },
      { id: 'gang-sheet-builder-1', file: 'builder_10x10in_300dpi.pdf', ok: false, steps: [{ name: 'Upload', ok: false, error: 'zaman aşımı' }] }] }], t);
    assert.deepEqual(Object.keys(k), ['dtfprintdepot.com/uv-dtf-gang-sheet', 'dtfprintdepot.com/gang-sheet-builder-1']);
    const satir = id => K.tablo(k).find(r => r.url.includes('dtfprintdepot.com/products/' + id)).hucreler;
    assert.equal(satir('uv-dtf-gang-sheet').psd.durum, 'ok');
    assert.equal(satir('gang-sheet-builder-1').pdf.durum, 'hata');
    assert.equal(satir('uv-dtf-gang-sheet').png.durum, 'bekliyor');
    assert.equal(satir('uv-dtf-gang-sheet').ai.durum, 'bilinen');   // builder AI: bilinen sorun
    assert.equal(satir('uv-dtf-gang-sheet').webp.durum, 'yok');     // Print Depot builder webp kabul etmiyor
    const toplam = K.tablo({}).reduce((n, r) => n + Object.values(r.hucreler).filter(h => h.durum === 'bekliyor').length, 0);
    assert.equal(toplam, Object.values(SAATLIK.formatlar).reduce((n, v) => n + v.length, 0));
  });
  const flow = (steps, extra = {}) => ({ ok: !steps.some(s => !s.ok), steps, title: 'X', id: 'x', ...extra });
  const ok = n => ({ name: n, ok: true }), bad = (n, error = 'hata') => ({ name: n, ok: false, error });
  await deneme('Seviye: sepete ekleme / sepet / checkout / ana sayfa → ACİL', () => {
    for (const n of ['Sepete ekle', 'Save & Add to Cart', 'Sepet doğrulama', 'Checkout', 'Checkout butonu', 'Ana sayfa', 'Sayfa açılıyor', 'Add to cart butonu', 'Baskı dosyası erişilebilir'])
      assert.equal(severity(flow([bad(n)])), 'acil', n);
  });
  await deneme('Seviye: upload aracı (yükleme, builder) sorunlu → Uyarı; test ürünü stokta yok → Uyarı', () => {
    for (const n of ['Upload', 'Builder açılıyor', "Görseli sheet'e yerleştir"]) assert.equal(severity(flow([ok('Sayfa açılıyor'), bad(n)])), 'uyari', n);
    assert.equal(severity(flow([bad('Ürün sayfası', 'Test ürünlerinin hiçbiri stokta değil')])), 'uyari');
    assert.equal(severity(flow([bad('Zaman aşımı (son başarılı adım: Sayfa açılıyor)')])), 'uyari');
    assert.equal(severity(flow([bad('Zaman aşımı (son başarılı adım: Sepete ekle)')])), 'acil');
  });
  await deneme('Seviye: bot koruması / hız sınırı → site hatası değil (engel)', () =>
    assert.equal(severity(flow([bad('Sepete ekle')], { botBlock: 'ratelimit' })), 'engel'));
  const tur = (flows, domain = 'a.com') => [{ domain, flows }];
  const T1 = '2026-11-19T01:00:00Z', T2 = '2026-11-19T02:00:00Z';
  await deneme('Durum: yeni sorun → mail; sürerse tekrar mail yok; düzelince "Düzeldi"', () => {
    const f = flow([bad('Checkout')], { id: 'core' });
    const r1 = alertState(tur([f]), {}, T1);
    assert.equal(r1.newFailures.length, 1); assert.equal(r1.newFailures[0].level, 'acil');
    const r2 = alertState(tur([f]), r1.now, T2);
    assert.equal(r2.newFailures.length, 0); assert.equal(r2.ongoing.length, 1); assert.equal(r2.ongoing[0].since, T1);
    const r3 = alertState(tur([flow([ok('Checkout')], { id: 'core' })]), r2.now, T2);
    assert.equal(r3.recovered.length, 1); assert.deepEqual(r3.now, {});
  });
  await deneme('Durum: uyarıdan acile yükselince tekrar mail', () => {
    const r1 = alertState(tur([flow([bad('Upload')])]), {}, T1);
    const r2 = alertState(tur([flow([bad('Sepete ekle')])]), r1.now, T2);
    assert.equal(r2.newFailures.length, 1); assert.equal(r2.newFailures[0].level, 'acil');
  });
  await deneme('Durum: bot koruması 1-2 saat mail yok, 3. saatte "test edilemiyor", sonra tekrar yok', () => {
    const f = flow([bad('Sepete ekle')], { botBlock: 'challenge' });
    let st = {};
    for (let h = 1; h <= 4; h++) {
      const r = alertState(tur([f]), st, T1); st = r.now;
      assert.equal(r.newFailures.length, h === 3 ? 1 : 0, `saat ${h}`);
    }
    const r = alertState(tur([flow([ok('Sepete ekle')])]), st, T2);
    assert.equal(r.recovered.length, 1);
  });
  await deneme('Durum: bu saat sırası gelmeyen ürünün sorunu silinmez; eski biçimli kayıt yok sayılır', () => {
    const st = { 'a.com/y': { level: 'uyari', since: T1, site: 'a.com', flow: 'Y' }, 'a.com/core': { since: T1 } };
    const r = alertState(tur([flow([ok('Ana sayfa')], { id: 'anasayfa' })]), st, T2);
    assert.ok(r.now['a.com/y']); assert.ok(!r.now['a.com/core']); assert.equal(r.recovered.length, 0);
  });
  await deneme('Durum: ana sayfa 15 sn üstü → Uyarı, normale dönünce Düzeldi', () => {
    const r1 = alertState(tur([flow([ok('Ana sayfa')], { id: 'anasayfa', homepageMs: 21000 })]), {}, T1);
    assert.equal(r1.newFailures.length, 1); assert.equal(r1.newFailures[0].level, 'uyari');
    const r2 = alertState(tur([flow([ok('Ana sayfa')], { id: 'anasayfa', homepageMs: 3000 })]), r1.now, T2);
    assert.equal(r2.recovered.length, 1);
  });
  await deneme('Mail: ACİL konusu ve seviye; sadece uyarı varsa "Uyarı" konusu', () => {
    const { build } = require('./report');
    const run = (nf) => ({ mode: 'hourly', startedAt: T1, ms: 1000, sites: [], ok: false, alert: { newFailures: nf, recovered: [], ongoing: [] } });
    const a = build(run([{ site: 'a.com', flow: 'Ana fonksiyonlar (sepete ekle, checkout)', level: 'acil' }, { site: 'a.com', flow: 'Y (Upload)', level: 'uyari' }]));
    assert.match(a.subject, /^🚨 ACİL/); assert.equal(a.level, 'acil'); assert.ok(a.sendEmail);
    const u = build(run([{ site: 'a.com', flow: 'Y (Upload)', level: 'uyari' }]));
    assert.match(u.subject, /^⚠️ Uyarı/);
    const n = build(run([]));
    assert.ok(!n.sendEmail);
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
