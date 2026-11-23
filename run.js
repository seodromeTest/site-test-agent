// Site test çalıştırıcı – birden fazla siteyi test eder, tek rapor üretir.
// Kullanım: node run.js [--mode hourly|full] [--sites fastdtftransfer,fastdtfsupply] [--only <akış-id>] [--fail-demo] [--plan]
//   hourly: saatlik kontrol (liste saatlik.js'de). Upload listesinde ürünü olan sitede: ana sayfa + sıradaki upload
//           ürünü (yükle → Add to cart → sepet → checkout). Diğer sitelerde: ana sayfa + normal ürünle Add to cart →
//           sepet → checkout. Mail sadece durum değişince (ACİL / Uyarı / Düzeldi); Make'e de sadece o zaman gönderilir.
//   full:   tüm upload akışları + arama + genel kontroller + Firefox/Safari; her zaman genel rapor maili
//   --plan: hiçbir siteye bağlanmadan bu saat neyin test edileceğini yazar
// WEBHOOK_URL tanımlıysa sonuç Make webhook'una POST edilir.
const fs = require('fs');
const path = require('path');
const { chromium, firefox, webkit } = require('playwright');

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const MODE = arg('mode', 'hourly');
const HOURLY = MODE === 'hourly';
const SAATLIK = require('./saatlik');
const SITES = (arg('sites') || fs.readdirSync(path.join(__dirname, 'sites')).filter(f => f.endsWith('.js')).sort()
  .sort((a, b) => (b.startsWith('fastdtf') - a.startsWith('fastdtf'))).map(f => f.replace(/\.js$/, ''))
  .filter(n => !HOURLY || !SAATLIK.haric.includes(n)).join(',')).split(',');
const ONLY = arg('only');
const FAIL_DEMO = args.includes('--fail-demo');
const PLAN = args.includes('--plan');
// Saatlik sıra: her saat bir sonraki upload ürünü (saat numarası ürün sayısına bölümünden kalan)
const HOUR = Math.floor(Date.now() / 3600000);
const OUT = path.join(__dirname, 'results');
const STATE = path.join(OUT, 'state.json');
const DEBUG = !!process.env.DEBUG;
fs.mkdirSync(OUT, { recursive: true });

// Test görselleri: fixtures/<grup>/ klasöründen (ör. builder, genel); yoksa fixtures/ kökünden.
// Bir grupta birden fazla görsel varsa her çalıştırmada sıradaki kullanılır.
const listImages = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort().map(f => path.join(dir, f)) : [];
let fixtureIdx = Math.floor(Date.now() / 3600000);
const nextFixture = group => {
  const files = listImages(path.join(__dirname, 'fixtures', group || 'genel'));
  const pool = files.length ? files : listImages(path.join(__dirname, 'fixtures'));
  return pool[fixtureIdx++ % pool.length];
};

const { withTimeout, shot, getCart, escRe, newPage, gotoOk, diagnose, botCheck, botFromLog } = require('./lib');
const { alertState } = require('./uyari');

// Checkout: sepet sayfasında Checkout'a bas, Shopify ödeme sayfasının gerçekten açıldığını doğrula
// (sayfada sipariş özeti / ara toplam görünmeli). Hiçbir bilgi girilmez, sipariş verilmez.
async function checkout(page, result) {
  // Bazı mağazalarda checkout öncesi "Terms and Conditions" onay kutusu zorunlu
  const box = page.locator('label:has-text("agree") input[type=checkbox], input[type=checkbox][id*=agree i], input[type=checkbox][name*=agree i], input[type=checkbox][id*=terms i], input[type=checkbox][name*=terms i], input[type=checkbox][class*=terms i], input[type=checkbox][class*=condition i], terms-conditions input[type=checkbox], [class*=term] input[type=checkbox]').filter({ visible: true }).first();
  if (await box.count()) await box.check({ force: true }).catch(() => {});
  const btn = page.locator('[name=checkout], button:has-text("Checkout"), a:has-text("Checkout"), button:has-text("Check out")').filter({ visible: true }).first();
  // Sıralı: önce tıkla, sonra yönlendirmeyi bekle (waitForURL sayfa zaten oradaysa hemen döner)
  await btn.click();
  await page.waitForURL(/checkouts|authentication|account\./, { timeout: 45000 });
  if (!page.url().includes('/checkouts/')) { result.checkout = 'Müşteri giriş sayfası açıldı'; return; }
  const summary = page.getByText(/^subtotal|order summary/i).filter({ visible: true }).first();
  await summary.waitFor({ timeout: 30000 }).catch(() => { throw new Error('Ödeme sayfası açıldı ama sipariş özeti (ürün ve tutar) görünmedi'); });
  result.checkout = 'Ödeme sayfası açıldı, sipariş özeti görünüyor';
}

// Sadece ana sayfa (saatlik testte upload ürünü olan sitelerde): açılıyor mu, ne kadar sürede
function homeFlow(site) {
  return {
    id: 'anasayfa', title: 'Ana sayfa', url: site.base + '/', direct: true,
    async run(page, step, file, notes, result) {
      await step('Ana sayfa', async () => {
        const s = Date.now();
        await gotoOk(page, site.base + '/', { waitUntil: 'load' });
        result.homepageMs = Date.now() - s;
      });
    },
  };
}

// Ana fonksiyonlar: ana sayfa → arama → ürün + sepete ekle → sepet → checkout
// search: false → arama adımı yok (saatlik test)
function coreFlow(site, { search = true } = {}) {
  return {
    id: 'core', title: search ? 'Ana fonksiyonlar (arama, sepete ekle, checkout)' : 'Ana fonksiyonlar (sepete ekle, checkout)', url: site.base + '/', direct: true, noSearch: !search,
    async run(page, step, file, notes, result) {
      await step('Ana sayfa', async () => {
        const s = Date.now();
        await gotoOk(page, site.base + '/', { waitUntil: 'load' });
        result.homepageMs = Date.now() - s;
      });
      if (search) await step('Arama', async () => {
        result.search = site.core.search;
        await gotoOk(page, `${site.base}/search?q=${encodeURIComponent(site.core.search)}`);
        await page.locator('a[href*="/products/"]').filter({ visible: true }).first().waitFor({ timeout: 20000 });
        result.searchCount = await page.evaluate(() => new Set([...document.querySelectorAll('main a[href*="/products/"], #MainContent a[href*="/products/"]')].map(a => a.pathname)).size).catch(() => 0);
      });
      let product;
      await step('Ürün sayfası', async () => {
        // Test ürünü verilmemişse: stokta, upload gerektirmeyen ilk ürünü seç
        const candidates = site.core.products || await page.evaluate(async skip => {
          // Bölge yolu kullanan mağazalarda (ör. /en-us/) ürün listesi o yolun altında
          const root = window.Shopify?.routes?.root || '/';
          const list = await fetch(`${root}products.json?limit=100`).then(x => x.json()).then(j => (j && j.products) || []).catch(() => []);
          return list.filter(p => !skip.includes(p.handle) && !/gang|upload|builder|by size|by piece|custom|sample|gift card/i.test(p.title)
            && !/bundle|printer|shaker|dryer|press|shirt|hoodie|sweatshirt|tee\b|apparel|gildan|bella|installation/i.test(p.title + ' ' + p.product_type)
            && p.variants.length <= 10 && p.variants.some(v => v.available && +v.price > 0 && +v.price < 150)).slice(0, 3).map(p => p.handle);
        }, site.flows.map(f => f.id));
        // Saatlik testte Add to cart mutlaka denenmeli: uygun ürün yoksa bu sessizce geçilmez (Uyarı)
        if (!candidates.length && HOURLY) throw new Error('Sepete ekleme için uygun test ürünü bulunamadı (site dosyasında core.products verilmeli)');
        if (!candidates.length) { notes.push('Sepete ekleme için uygun test ürünü bulunamadı; sepet ve checkout adımları atlandı'); result.skipCart = true; return; }
        for (const h of candidates) {
          const p = await page.evaluate(h => fetch(`${window.Shopify?.routes?.root || '/'}products/${h}.js`).then(r => r.ok ? r.json() : null).catch(() => null), h);
          if (p && p.available) { product = p; break; }
          notes.push(`Test ürünü stokta yok veya bulunamadı: ${h}`);
        }
        if (!product) throw new Error('Test ürünlerinin hiçbiri stokta değil');
        result.url = `${site.base}/products/${product.handle}`;
        result.testProduct = product.title;
        await gotoOk(page, result.url);
      });
      if (result.skipCart) return;
      await step('Add to cart butonu', async () => {
        // Sayfada önerilen ürünlerin de butonu olabilir: önce ana ürünün formundaki butonu kullan
        // Bazı mağazalarda ürün kendi aracıyla sepete ekleniyor (ör. Everyday: beden/adet tablosu)
        if (site.core.addToCart) {
          await site.core.addToCart(page, notes);
          let item;
          for (const end = Date.now() + 20000; !item && Date.now() < end;) {
            await page.waitForTimeout(1500);
            item = (await getCart(page).catch(() => null))?.items?.find(i => i.product_id === product.id);
          }
          if (!item) throw new Error('Ürün sepete eklenmedi');
          result.cart = { variant: product.title.slice(0, 40), price: (item.final_line_price / 100).toFixed(2) };
          return;
        }
        const ids = product.variants.map(v => `input[name="id"][value="${v.id}"]`).join(',');
        const main = page.locator('form[action*="/cart/add"]').filter({ has: page.locator(ids) })
          .getByRole('button', { name: /add to cart/i }).filter({ visible: true });
        const any = page.getByRole('button', { name: /add to cart/i }).filter({ visible: true });
        const btn = ((await main.count()) ? main : any).first();
        // Sayfa scriptleri hazır olmadan basılan tıklama boşa gidebiliyor: 10 sn'de eklenmezse bir kez daha bas
        await page.waitForTimeout(2000);
        await btn.click();
        const deadline = Date.now() + 20000;
        let item, reclicked = false;
        while (!item && Date.now() < deadline) {
          await page.waitForTimeout(1500);
          item = (await getCart(page).catch(() => null))?.items?.find(i => i.product_id === product.id);
          if (!item && !reclicked && Date.now() > deadline - 10000) { reclicked = true; await btn.click().catch(() => {}); }
        }
        if (!item) throw new Error('Ürün sepete eklenmedi');
        result.cart = { variant: product.title.slice(0, 40), price: (item.final_line_price / 100).toFixed(2) };
      });
      await step('Sepet sayfası', async () => {
        await gotoOk(page, `${site.base}/cart`);
        await page.getByText(new RegExp(escRe(product.title.slice(0, 25)), 'i')).filter({ visible: true }).first().waitFor({ timeout: 20000 });
      });
      await step('Checkout butonu', () => checkout(page, result));
    },
  };
}

async function runFlow(browser, site, flow, demoBreak) {
  const { ctx, page, jsErrors, log } = await newPage(browser);
  const file = flow.fixtureFile || nextFixture(flow.fixture);
  const result = { id: flow.id, title: flow.title, app: flow.appName, url: flow.url, ok: true, steps: [], notes: [], ...(flow.noSearch ? { noSearch: true } : {}) };
  const t0 = Date.now();
  // Adımlar kesinlikle sıralı: bir adım (ve sayfanın o adımda başlattığı istekler) bitmeden sonraki başlamaz.
  // Adım sırasında kaydedilen konsol/ağ olayları o adıma yazılır; hata teşhisi bunlarla yapılır.
  const siteHost = new URL(site.base).hostname;
  const ranges = []; // her adımın oturum kaydındaki aralığı: hata hangi adımda olduysa oraya yazılır
  const CART_STEP = /^(Sepete ekle|Add to cart butonu|Save & Add to Cart)$/;
  const step = async (name, fn) => {
    const s = Date.now(), m = log.mark();
    if (DEBUG) console.log(`  … ${site.domain}/${flow.id}: ${name}`);
    const summary = evts => {
      const c = evts.filter(e => e.kind !== 'network' && e.level === 'error').length, n = evts.filter(e => e.kind === 'network' && !e.asset).length;
      return c || n ? { konsolHata: c, agHata: n } : {};
    };
    // Önceki adımlarda olan hatalar (ör. sepete ekleme isteği reddedildi ama hata bir sonraki adımda fark edildi)
    const earlier = () => ranges.flatMap(r => diagnose(log.events.slice(r.from, r.to), siteHost).map(t => `${r.name} adımında: ${t}`));
    try {
      await fn();
      const pending = await log.settle();
      const evts = log.since(m);
      // Sepete ekleme adımı: tıklamak yetmez, sayfanın gönderdiği sepete ekleme isteği reddedildiyse adım burada başarısız
      if (CART_STEP.test(name)) {
        const rej = evts.find(e => e.kind === 'network' && e.status >= 400 && /\/cart\/add/.test(e.url));
        if (rej) throw new Error(`Sepete ekleme isteği reddedildi: ${rej.method} ${new URL(rej.url).pathname} → HTTP ${rej.status}${rej.text ? ` (${rej.text.slice(0, 160)})` : ''}`);
      }
      ranges.push({ name, from: m, to: log.mark() });
      result.steps.push({ name, ok: true, ms: Date.now() - s, ...summary(evts), ...(pending ? { bekleyenIstek: pending } : {}) });
    } catch (e) {
      await log.settle(4000);
      const evts = log.since(m);
      const tani = [...diagnose(evts, siteHost), ...earlier()].slice(0, 6);
      result.steps.push({ name, ok: false, ms: Date.now() - s, error: e.message.split('\n')[0].slice(0, 300), ...summary(evts), tani });
      throw e;
    }
  };
  const uploadBody = async () => {
    await step('Sayfa açılıyor', async () => {
      const url = demoBreak ? flow.url + '-bozuk-test' : flow.url;
      result.url = url; // mailde gerçekten test edilen adres görünsün
      await gotoOk(page, url);
      await page.waitForTimeout(3000);
    });
    result.file = path.basename(file);
    await flow.run(page, step, file, result.notes, { log });
    if (flow.noCart) return; // sadece sayfa kontrolü
    let item, fileKey;
    await step('Sepet doğrulama', async () => {
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        const cart = await getCart(page).catch(() => null);
        item = cart?.items?.find(i => i.product_title.includes(flow.expectProduct));
        if (item) break;
        await page.waitForTimeout(1500);
      }
      if (!item) throw new Error(`Ürün sepete düşmedi (${flow.expectProduct})`);
      // fileProp '*': özellik adı mağazaya göre değişiyor, değerinde dosya linki olan özellik aranır (Cloudlift)
      fileKey = flow.fileProp === '*' ? Object.keys(item.properties || {}).find(k => /https?:\/\//.test(String(item.properties[k]))) : flow.fileProp;
      if (!fileKey || !item.properties?.[fileKey]) throw new Error(`Sepette yüklenen dosya bilgisi yok (${flow.fileProp === '*' ? 'dosya linki olan özellik' : flow.fileProp})`);
      // Birden fazla baskı alanına yüklendiyse hepsi sepette olmalı
      const missing = (flow.extraProps || []).filter(k => !item.properties?.[k]);
      if (missing.length) throw new Error(`Sepette bazı baskı alanlarının dosyası yok: ${missing.join(', ')}`);
      result.cart = { variant: item.variant_title, price: (item.final_line_price / 100).toFixed(2) };
    });
    await step('Baskı dosyası erişilebilir', async () => {
      // Değer bazen linkin kendisi, bazen linki içeren bir metin: ilk linki al
      const fileUrl = String(item.properties[fileKey]).match(/https?:\/\/[^\s"'<>,]+/)?.[0];
      if (!fileUrl) throw new Error(`Sepetteki dosya bilgisinde link yok (${fileKey})`);
      const res = await fetch(fileUrl, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
      res.body?.cancel().catch(() => {});
      if (res.status >= 400) throw new Error(`Dosya linki HTTP ${res.status}`);
    });
    await step('Sepet sayfası', async () => {
      // Bazı uygulamalar (ör. builder) sepete ekledikten sonra kendisi /cart'a yönlendiriyor: çakışmasın
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      if (!new URL(page.url()).pathname.startsWith('/cart')) {
        await gotoOk(page, `${site.base}/cart`).catch(async e => {
          if (!/interrupted by another navigation|ERR_ABORTED/.test(e.message)) throw e;
          await page.waitForLoadState('domcontentloaded').catch(() => {});
        });
      }
      // Bazı ürün adlarında çift boşluk var; sayfada tek boşluk olarak görünüyor
      const name = new RegExp(escRe(flow.expectProduct).replace(/\s+/g, '\\s+'), 'i');
      await page.getByText(name).filter({ visible: true }).first().waitFor({ timeout: 20000 });
    });
    // Saatlik testte upload ürünüyle checkout'a kadar gidilir (sipariş verilmez)
    if (HOURLY) await step('Checkout', () => checkout(page, result));
  };
  try {
    // Hiçbir akış 4 dakikadan uzun sürmesin
    await withTimeout(flow.direct ? flow.run(page, step, file, result.notes, result) : uploadBody(), flow.timeoutMs || (HOURLY && !flow.direct ? 300000 : 240000), 'Akış');
  } catch (e) {
    result.ok = false;
    if (!result.steps.some(s => !s.ok)) {
      const last = result.steps.length ? result.steps[result.steps.length - 1].name : '-';
      result.steps.push({ name: `Zaman aşımı (son başarılı adım: ${last})`, ok: false, error: e.message.split('\n')[0] });
    }
    result.screenshot = await withTimeout(shot(page), 15000, 'shot').catch(() => null);
    // Test sunucusu (GitHub, veri merkezi IP'si) Shopify/Cloudflare bot korumasına takılmış olabilir:
    // sayfada "Verify you are human" ya da sepet isteği challenge dönüyorsa bu site hatası değildir
    // Test sunucusu (GitHub, veri merkezi IP'si) bot korumasına ya da Shopify hız sınırına takılmış olabilir:
    // önce sayfanın kendisine, sayfa hiç açılamadıysa oturum kaydına bakılır (lib.js botCheck / botFromLog)
    result.botBlock = (await botCheck(page)) || botFromLog(log.events, siteHost);
  }
  result.ms = Date.now() - t0;
  if (jsErrors.length) result.jsErrors = [...new Set(jsErrors)].slice(0, 5);
  // Akış boyunca konsola düşen hatalar (başarılı akışlarda da raporda bilgi olarak görünür)
  // Sayfanın kendi JS hataları da (ör. bozuk script) burada görünsün; testin engellediği scriptlerin hataları kayda girmez (lib.js NOISE)
  const konsol = [...new Set(log.events.filter(e => (e.kind === 'console' && e.level === 'error') || e.kind === 'jserror')
    .map(e => (e.kind === 'jserror' ? 'JS hatası: ' : '') + e.text.slice(0, 160)))];
  if (konsol.length) result.konsol = konsol.slice(0, 5);
  await withTimeout(ctx.close(), 15000, 'close').catch(() => {});
  return result;
}

// Ana sayfadaki tüm site içi linkler (sadece full modda)
async function linkCheck(browser, site) {
  const { ctx, page } = await newPage(browser);
  try {
    await gotoOk(page, site.base + '/');
    const links = await withTimeout(page.evaluate(async () => {
      const texts = new Map();
      for (const a of document.querySelectorAll('a[href]')) {
        const h = a.href.split('#')[0], t = (a.innerText || a.getAttribute('aria-label') || a.title || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!texts.get(h) && t) texts.set(h, t); else if (!texts.has(h)) texts.set(h, '');
      }
      const links = [...texts.keys()].filter(h => h.startsWith(location.origin) && !/\/account|customer_authentication|\/cart|\/checkout/.test(h));
      const broken = [], all = [];
      for (const l of links) {
        // 5xx/429 geçici olabilir: bekleyip bir kez daha dene
        let status;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { status = (await fetch(l, { redirect: 'follow' })).status; } catch (e) { status = 'hata'; }
          if (status !== 'hata' && status < 429) break;
          await new Promise(r => setTimeout(r, 3000));
        }
        all.push({ url: l, text: texts.get(l), status });
        if (status === 'hata' || (status >= 400 && status !== 429)) broken.push({ url: l, status });
        await new Promise(r => setTimeout(r, 300));
      }
      return { total: links.length, broken, all };
    }), 600000, 'Link kontrolü');
    return { ...links, ok: links.broken.length === 0 };
  } catch (e) {
    return { ok: false, total: 0, broken: [], error: e.message.split('\n')[0] };
  } finally {
    await withTimeout(ctx.close(), 15000, 'close').catch(() => {});
  }
}

// Genel testte bot korumasına takılmamak için yavaş git: sepete ekleyen akışlar arasında 20–30 sn,
// siteler arasında 60 sn bekle (müşteri gibi). Hızlı deneme için NO_PACE=1.
const PACE = MODE === 'full' && !process.env.NO_PACE;
// Süre güvenliği: GitHub işi 355 dk'da keser ve o zaman mail hiç gitmez. 300 dk dolunca genel kontrol ve
// tarayıcı testleri atlanır, rapor yine gönderilir (atlananlar raporda "süre yetmedi" olarak görünür).
const RUN_START = Date.now();
// Saatlik test bir sonraki saat başlamadan bitmeli: 45 dk dolunca kalan siteler atlanır
const BUDGET_MS = +(process.env.BUDGET_MIN || (HOURLY ? 45 : 300)) * 60000;
const overBudget = () => Date.now() - RUN_START > BUDGET_MS;
const SKIP_ROW = (bolum, adres) => ({ bolum, kontrol: 'Kontrol', adres, sonuc: 'Yapılamadı: testin toplam süre sınırı doldu (rapor gönderilebilsin diye atlandı)', durum: 'yapilmadi' });
const rest = (min, max) => PACE ? new Promise(r => setTimeout(r, min * 1000 + Math.random() * (max - min) * 1000)) : Promise.resolve();
// Saatlik testte kısa aralar (siteye yük az: sitede saatte 1 sepete ekleme)
const hourlyRest = (min, max) => HOURLY && !process.env.NO_PACE ? new Promise(r => setTimeout(r, min * 1000 + Math.random() * (max - min) * 1000)) : Promise.resolve();
// Saatlik testte başarısız akış 2 dk sonra tekrar denenir (geçici aksaklık ACİL mail sayılmasın)
const retryWait = r => HOURLY && !process.env.NO_PACE ? 120 : PACE ? (r.botBlock ? 120 : 45) : (r.botBlock ? 60 : 0);

// Saatlik testte ürünün bu turda yükleyeceği dosya: ürünün kabul ettiği türlerden (saatlik.js formatlar) SIRADAKİ.
// Ürün sitede n ürün arasında n saatte bir sıraya girer; o ürünün kaçıncı turu = saat no / n. Her turda bir sonraki tür.
// --format <uzantı> ile deneme için tür zorlanabilir (ürün o türü kabul etmiyorsa sıradaki kullanılır).
let formatTurn = 1;
function formatFile(site, flow, id) {
  const host = new URL(site.base).hostname.replace(/^www\./, '');
  const kabul = SAATLIK.formatlar[`${host}/${id}`];
  if (!kabul) throw new Error(`saatlik.js: ${host}/${id} için kabul edilen dosya türleri (formatlar) yok`);
  const dir = path.join(__dirname, 'fixtures', 'formatlar', flow.fixture === 'builder' ? 'builder' : 'gangsheet');
  const files = SAATLIK.FORMAT_SIRASI.filter(ext => kabul.includes(ext))
    .map(ext => fs.readdirSync(dir).find(f => f.endsWith('.' + ext))).filter(Boolean);
  if (!files.length) throw new Error(`fixtures/formatlar: ${host}/${id} için dosya yok`);
  const zorla = arg('format') && files.find(f => f.endsWith('.' + arg('format')));
  return path.join(dir, zorla || files[formatTurn % files.length]);
}

// Saatlik testte bu sitede test edilecek akışlar (saatlik.js). prev: önceki saatlerin uyarı durumu.
function hourlyFlows(site, prev = {}) {
  const host = new URL(site.base).hostname.replace(/^www\./, '');
  formatTurn = Math.floor(HOUR / Math.max(1, SAATLIK.upload.filter(u => new URL(u).hostname.replace(/^www\./, '') === host).length));
  const list = SAATLIK.upload.filter(u => new URL(u).hostname.replace(/^www\./, '') === host).map(u => {
    const id = new URL(u).pathname.split('/products/')[1].replace(/\/$/, '');
    const flow = site.flows.find(f => f.id === id);
    if (!flow) throw new Error(`saatlik.js: ${site.domain} sitesinde "${id}" ürünü sites/ dosyasında tanımlı değil`);
    if (flow.noCart) throw new Error(`saatlik.js: ${site.domain} "${id}" ürününün uygulaması henüz testte değil (pageCheck)`);
    return { ...flow, url: u, fixtureFile: formatFile(site, flow, id) }; // adres saatlik listedeki gibi (varyantlı olabilir)
  });
  if (!list.length) return [coreFlow(site, { search: false })];
  // Deneme: --only verilmişse sıraya bakılmaz, listedeki o ürünler test edilir (ör. --only anasayfa,dtf-gang-sheet)
  if (ONLY) return [homeFlow(site), ...list];
  const pick = [list[HOUR % list.length]];
  // Sorunu olan (uyarı maili gitmiş) ürünler düzelene kadar her saat ayrıca denenir: "Düzeldi" maili geç kalmasın
  for (const f of list) {
    const st = prev[`${site.domain}/${f.id}`];
    if (pick.length < 3 && !pick.includes(f) && st && st.level !== 'engel') pick.push(f);
  }
  return [homeFlow(site), ...pick];
}

async function testSite(browser, site, isFirstSite, prev) {
  const flows = [];
  const all = (HOURLY ? hourlyFlows(site, prev) : [coreFlow(site), ...site.flows]).filter(f => !ONLY || ONLY.split(',').includes(f.id));
  for (const [k, flow] of all.entries()) {
    // Çok upload ürünü olan ve hız sınırına takılan sitelerde (site dosyasında slowPace) daha uzun ara
    if (k > 0) await (HOURLY ? hourlyRest(10, 20) : flow.noCart ? rest(3, 6) : site.slowPace ? rest(45, 60) : rest(20, 30));
    const demoBreak = FAIL_DEMO && isFirstSite && flow === all.find(f => f.id !== 'core');
    let r = await runFlow(browser, site, flow, demoBreak);
    // Geçici bir aksaklığı hata saymamak için başarısız akışı bir kez tekrar dene
    if (!r.ok && !demoBreak) {
      const first = r.steps.find(s => !s.ok);
      // İlk denemedeki takılmanın ekran görüntüsünü sakla (geçici aksaklık mı, gerçek sorun mu incelemek için)
      if (r.screenshot) fs.writeFileSync(path.join(OUT, `ilk-deneme-${site.domain}-${flow.id}-${Date.now()}.jpg`), Buffer.from(r.screenshot, 'base64'));
      console.log(`  ↻ ${site.domain}/${flow.id} ilk denemede takıldı (${first?.name}: ${first?.error}), tekrar deneniyor`);
      // Bot korumasına takıldıysa biraz bekle (koruma kısa süreli)
      await new Promise(res => setTimeout(res, retryWait(r) * 1000));
      const retry = await runFlow(browser, site, flow, false);
      retry.retried = true;
      retry.firstAttempt = { step: first?.name, error: first?.error, botBlock: r.botBlock };
      r = retry;
    }
    flows.push(r);
    const bad = r.steps.find(s => !s.ok);
    console.log(`${r.ok ? '✅' : '❌'} ${site.domain} – ${r.title} (${(r.ms / 1000).toFixed(1)}s)` + (bad ? ` → ${bad.name}: ${bad.error}` : ''));
  }
  // Genel testte ana sayfanın tamamı: menü, banner, linkler, koleksiyonlar, footer, sosyal medya, mobil menü, chat
  let genel = null, links = null;
  if (MODE === 'full' && (!ONLY || ONLY.split(',').includes('genel')) && overBudget()) {
    genel = [SKIP_ROW('Genel kontroller (menü, linkler, footer, mobil)', site.base)];
  } else if (MODE === 'full' && (!ONLY || ONLY.split(',').includes('genel'))) {
    // Linkler artık tek tek (sıralı) kontrol edildiği için büyük sitelerde süre uzun: 30 dk sınır
    genel = await withTimeout(require('./genel').genelKontrol(browser, site), 1800000, 'Genel kontrol')
      .catch(e => [{ bolum: 'Ana sayfa', kontrol: 'Genel kontrol', adres: site.base, sonuc: `Sorun: ${e.message.split('\n')[0]}`, durum: 'hata' }]);
    const bad = genel.filter(r => r.durum === 'hata');
    const linkRows = genel.filter(r => r.adres && /link|Sosyal|Diğer/.test(r.bolum));
    links = { total: linkRows.length, broken: linkRows.filter(r => r.durum === 'hata').map(r => ({ url: r.adres, status: r.sonuc })), ok: !bad.length };
    console.log(`${bad.length ? '⚠️' : '✅'} ${site.domain} – genel kontrol: ${genel.length} satır, ${bad.length} sorun`);
    for (const b of bad) console.log(`     ✗ ${b.bolum} | ${b.kontrol} | ${b.adres} | ${b.sonuc}`);
  }
  return { name: site.name, domain: site.domain, base: site.base, flows, links, genel, ok: flows.every(f => f.ok || f.botBlock) && (!links || links.ok) };
}

(async () => {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  // Önceki saatlerin uyarı durumu (saatlik test): hangi kontrol şu an sorunlu, ne zamandan beri, mail gitti mi
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  // Dosya türü kapsamı aynı dosyada (_kapsam): uyarı durumundan ayrı tutulur (kapsam.js)
  const kapsam = prev._kapsam || {};
  delete prev._kapsam;

  if (PLAN) {
    for (const name of SITES) {
      const site = require(`./sites/${name}`);
      const fl = HOURLY ? hourlyFlows(site, prev) : [coreFlow(site), ...site.flows];
      console.log(`${site.domain}: ${fl.map(f => f.direct ? f.title : `${f.title} → ${f.url}${f.fixtureFile ? ` [${path.basename(f.fixtureFile)}]` : ''}`).join(' | ')}`);
    }
    return;
  }

  const browser = await chromium.launch();
  const sites = [];
  for (const [i, name] of SITES.entries()) {
    const site = require(`./sites/${name}`);
    if (HOURLY && overBudget()) {
      console.log(`– ${site.domain}: saatlik süre sınırı doldu, atlandı`);
      sites.push({ name: site.name, domain: site.domain, base: site.base, flows: [], skipped: true, ok: true });
      continue;
    }
    if (i > 0) await (HOURLY ? hourlyRest(10, 15) : rest(60, 60));
    sites.push(await testSite(browser, site, i === 0, prev));
  }
  await browser.close();

  // Tarayıcı uyumluluğu (genel test): Firefox ve Safari motoru (WebKit) – her sitede ana akış + bir upload ürünü.
  // Edge ve Opera Chrome motoruyla (Chromium) çalışır; Chrome sonuçları onlar için de geçerli.
  if (MODE === 'full' && (!ONLY || ONLY.split(',').includes('tarayici'))) {
    // Firefox ve Safari sırayla (aynı anda değil) ve yavaş: bot korumasına takılmamak için
    for (const [type, label] of [[firefox, 'Firefox'], [webkit, 'Safari (WebKit)']]) await (async () => {
      let b;
      try { b = await type.launch(); } catch (e) {
        for (const s of sites) (s.tarayicilar ||= []).push({ browser: label, error: 'Tarayıcı başlatılamadı: ' + e.message.split('\n')[0].slice(0, 150) });
        return;
      }
      for (const [i, name] of SITES.entries()) {
        const site = require(`./sites/${name}`);
        if (overBudget()) { (sites[i].tarayicilar ||= []).push({ browser: label, error: 'Yapılamadı: testin toplam süre sınırı doldu (rapor gönderilebilsin diye atlandı)', skipped: true }); continue; }
        const out = [];
        for (const flow of [coreFlow(site), site.flows.find(f => !f.noCart)].filter(Boolean)) {
          await (site.slowPace ? rest(90, 120) : rest(20, 30));
          let r = await runFlow(b, site, flow, false).catch(e => ({ id: flow.id, title: flow.title, url: flow.url, ok: false, steps: [{ name: 'Başlatma', ok: false, error: e.message.split('\n')[0] }], notes: [] }));
          if (!r.ok) {
            const first = r.steps.find(s => !s.ok);
            await new Promise(res => setTimeout(res, retryWait(r) * 1000));
            const retry = await runFlow(b, site, flow, false).catch(() => null);
            if (retry) { retry.retried = true; retry.firstAttempt = { step: first?.name, error: first?.error, botBlock: r.botBlock }; r = retry; }
          }
          delete r.screenshot; // rapor küçük kalsın
          out.push(r);
          const bad = r.steps.find(s => !s.ok);
          console.log(`${r.ok ? '✅' : '❌'} [${label}] ${site.domain} – ${r.title}` + (bad ? ` → ${bad.name}: ${bad.error}` : ''));
        }
        (sites[i].tarayicilar ||= []).push({ browser: label, flows: out });
        if (out.some(f => !f.ok && !f.botBlock)) sites[i].ok = false;
      }
      await withTimeout(b.close(), 30000, 'close').catch(() => {});
    })();
  }

  // Saatlik test: önceki duruma göre yeni sorunlar (ACİL / Uyarı), düzelenler ve devam edenler
  const { now, newFailures, recovered, ongoing } = HOURLY ? alertState(sites, prev, startedAt) : { now: prev, newFailures: [], recovered: [], ongoing: [] };
  const K = require('./kapsam');
  const gercekTur = HOURLY && !FAIL_DEMO && !ONLY && !arg('sites');
  if (HOURLY) K.kaydet(kapsam, sites, startedAt);
  // Çapraz kontrol: her ürün × tür en az bir kez denendiyse hatalıların Excel'i bir kez mail olarak gider
  let capraz = null;
  if (gercekTur && K.tamamlandi(kapsam) && !kapsam._tur.mail) {
    capraz = await K.caprazRapor(kapsam, new Date().toISOString());
    fs.writeFileSync(path.join(OUT, capraz.excelName), Buffer.from(capraz.excel, 'base64'));
    console.log(`Çapraz kontrol tamamlandı: ${capraz.subject}`);
  } else if (HOURLY) console.log(`Çapraz kontrol: ${K.eksikler(kapsam).length} kombinasyon henüz denenmedi`);
  if (gercekTur) fs.writeFileSync(STATE, JSON.stringify({ ...now, _kapsam: kapsam }, null, 1));

  const run = {
    mode: MODE, startedAt, ms: Date.now() - t0, demo: FAIL_DEMO, sites, ...(MODE === 'full' ? { kapsam } : {}),
    ok: sites.every(s => s.ok),
    critical: sites.some(s => s.flows.some(f => !f.ok)),
    alert: { newFailures, recovered, ongoing },
  };
  const stamp = startedAt.replace(/[:.]/g, '-');
  const file = path.join(OUT, `${MODE}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(run, null, 1));

  const report = require('./report').build(run);
  fs.writeFileSync(file.replace(/\.json$/, '.html'), report.html);
  console.log(`Sonuç: ${run.ok ? 'SORUN YOK' : 'SORUN VAR'} · mail: ${report.sendEmail ? report.subject : 'gönderilmeyecek'} → ${file}`);

  // Genel testte ayrıntılı Excel raporu (Özet + her site ayrı sayfa) maile eklenir
  if (MODE === 'full') {
    const xlsx = await require('./excel').build(run).catch(e => { console.log('Excel oluşturulamadı: ' + e.message); return null; });
    if (xlsx) {
      report.excelName = `site-test-raporu-${startedAt.slice(0, 10)}.xlsx`;
      report.excel = xlsx.toString('base64');
      fs.writeFileSync(path.join(OUT, report.excelName), xlsx);
    }
  }

  // Saatlik testte Make'e sadece mail gidecekse gönderilir (Make işlem sayısı boşa harcanmasın)
  if (process.env.WEBHOOK_URL && !process.env.NO_MAIL && (MODE === 'full' || report.sendEmail)) {
    const payload = { ...report, mode: MODE, ok: run.ok, critical: run.critical, startedAt, alert: run.alert, alertLevel: report.level };
    const r = await fetch(process.env.WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    console.log(`Make webhook: HTTP ${r.status}`);
  }
  // Çapraz kontrol maili (ayrı mail, Excel ekli → Make mail senaryosunun Excel yolu)
  if (capraz && process.env.WEBHOOK_URL && !process.env.NO_MAIL) {
    const r = await fetch(process.env.WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...capraz, mode: 'capraz', startedAt }) });
    console.log(`Make webhook (çapraz kontrol): HTTP ${r.status}`);
    if (r.ok) { kapsam._tur.mail = new Date().toISOString(); fs.writeFileSync(STATE, JSON.stringify({ ...now, _kapsam: kapsam }, null, 1)); }
  }
})();
