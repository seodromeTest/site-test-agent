// run.js (saatlik/haftalık testler) ve matrix.js (dosya türü matrisi) için ortak yardımcılar.
const withTimeout = (promise, ms, label) => {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label}: ${ms / 1000}s içinde bitmedi`)), ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
};
const shot = async page => (await page.screenshot({ type: 'jpeg', quality: 55 }).catch(() => null))?.toString('base64') || null;
const getCart = page => withTimeout(page.evaluate(() => fetch('/cart.js').then(r => r.json())), 15000, 'Sepet okuma');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// opts: newContext seçenekleri (ör. telefon görünümü için devices['iPhone 13'])
async function newPage(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1366, height: 900 }, locale: 'en-US' });
  // Pazarlama/analitik scriptleri test edilen akışların parçası değil: yüklenmesinler.
  // Klaviyo pop-up'ı ("Sign Up & Get 20% Off") butonların önünü kapatıyor, takip pikselleri de sayfayı yavaşlatıyor.
  const BLOCKED = /klaviyo\.com|pinterest\.com|clarity\.ms|doubleclick\.net|google-analytics|googletagmanager|analytics\.google|merchant-center-analytics|facebook\.(com|net)|tiktok|bing\.com/;
  await ctx.route(BLOCKED, route => route.abort());
  const page = await ctx.newPage();
  const log = sessionLog(page, BLOCKED);
  // Pazarlama pop-up'ları testi bloklamasın
  await page.addLocatorHandler(page.locator('button.klaviyo-close-form').first(), async l => { await l.click({ force: true, timeout: 3000 }).catch(() => {}); }, { noWaitAfter: true });
  await page.addInitScript(() => {
    const s = document.createElement('style');
    // Judge.me kartları ve Klaviyo e-posta pop-up'ı ("Sign Up & Get 20% Off") butonların önünü kapatıyor
    s.textContent = '.jdgm-popup-card{display:none!important}'
      + ' div[role=dialog][aria-label="POPUP Form"],div.needsclick[class*="kl-private-reset-css"][role=dialog]{display:none!important}';
    // Sayfa içindeki bazı boş/sandbox çerçevelerde documentElement yok: orada ekleme yapma (yoksa her sayfada JS hatası üretiyorduk)
    if (document.documentElement) document.documentElement.appendChild(s);
  });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message.slice(0, 200)));
  page.setDefaultTimeout(45000);
  return { ctx, page, jsErrors, log };
}

// Oturum kaydı: bir oturumda olan her şey sırasıyla kaydedilir (konsol, JS hatası, başarısız / 4xx-5xx istek).
// Adımlar sıralı çalıştığı için bir adım sırasında kaydedilen olaylar o adıma aittir: hata teşhisi bunun üzerinden yapılır.
// Bizim engellediğimiz pazarlama/analitik istekleri gürültü sayılır ve kayda girmez.
const ASSET = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|css)(\?|$)/i;
// Sitenin çalışmasıyla ilgisi olmayan, her Shopify sitesinde görülen kayıtlar: analitik/piksel (bir kısmını biz engelliyoruz),
// Shop Pay ön yüklemeleri, piksel sandbox uyarıları. Bunlar teşhiste ve konsol özetinde gösterilmez.
const NOISE = /shop\.app|pay\.shopify|monorail|\/api\/collect|web-pixels|\/wpm\/|\/wpm@|analytics|clarity|pixel|sandboxed environment|Blocked a frame with origin "null"|importScripts|was preloaded using link preload|shopify_pay\/accelerated_checkout|checkout-web\/assets|klaviyo|facebook|tiktok|pinterest|googletagmanager|gtag|doubleclick|bing\.com|_shopify_test|has been rejected for invalid domain|NetworkError when attempting to fetch resource|Unsafe attempt to load URL https:\/\/cdn\.shopify\.com\/shopifycloud\/customer-authentication/i;
const isNoise = e => NOISE.test(e.url || '') || NOISE.test(e.text || '');
const LIFECYCLE = new Set(['fetch', 'xhr', 'document']); // adımın bitmesi beklenen istekler
function sessionLog(page, blocked) {
  const events = [], inflight = new Map();
  const host = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
  const add = e => { if (events.length < 2000 && !isNoise(e)) events.push({ t: Date.now(), ...e }); };
  page.on('console', m => {
    if (!['error', 'warning'].includes(m.type())) return;
    const text = m.text().replace(/\s+/g, ' ').slice(0, 300);
    if (/Failed to load resource/i.test(text)) return; // aynı olay ağ kaydında zaten var
    add({ kind: 'console', level: m.type(), text, url: m.location()?.url || '' });
  });
  page.on('pageerror', e => add({ kind: 'jserror', level: 'error', text: e.message.replace(/\s+/g, ' ').slice(0, 300) }));
  page.on('request', r => { if (!blocked.test(r.url()) && LIFECYCLE.has(r.resourceType()) && !NOISE.test(r.url())) inflight.set(r, Date.now()); });
  page.on('requestfinished', r => inflight.delete(r));
  page.on('requestfailed', r => {
    inflight.delete(r);
    if (blocked.test(r.url())) return;
    const err = r.failure()?.errorText || 'failed';
    if (/ERR_ABORTED/.test(err) && r.resourceType() !== 'fetch' && r.resourceType() !== 'xhr') return; // sayfa değişirken iptal edilen yükleme
    add({ kind: 'network', level: 'error', method: r.method(), url: r.url().slice(0, 300), status: 0, text: err, type: r.resourceType() });
  });
  page.on('response', async r => {
    const st = r.status();
    if (st < 400 || blocked.test(r.url())) return;
    let body = '';
    if (['fetch', 'xhr'].includes(r.request().resourceType())) body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    add({ kind: 'network', level: st >= 500 ? 'error' : 'warning', method: r.request().method(), url: r.url().slice(0, 300), status: st,
      text: body, type: r.request().resourceType(), asset: ASSET.test(r.url()) });
  });
  return {
    events,
    mark: () => events.length,
    since: i => events.slice(i),
    // Adım bitince sayfanın kendi istekleri de bitsin: bir sonraki adım öncekinin arka plan işi sürerken başlamasın.
    // Uzun süren arka plan bağlantıları (canlı sohbet vb.) 8 sn sonra yok sayılır.
    async settle(maxMs = 8000) {
      const end = Date.now() + maxMs;
      let quiet = 0;
      while (Date.now() < end) {
        const now = Date.now();
        const busy = [...inflight.values()].filter(t0 => now - t0 < maxMs).length;
        quiet = busy ? 0 : quiet + 1;
        if (quiet >= 2) return 0;
        await page.waitForTimeout(250).catch(() => {});
      }
      return inflight.size;
    },
    host,
  };
}

// Bir adım sırasındaki olaylardan teşhis: önce aynı sitenin / uygulamanın veri istekleri, sonra JS hataları, sonra konsol
function diagnose(evts, siteHost) {
  const isData = e => e.kind === 'network' && !e.asset && ['fetch', 'xhr', 'document'].includes(e.type);
  const rank = e => (isData(e) && /\/cart\/(add|change|update)|\/apps\/|\/api\//.test(e.url) ? 0 : isData(e) ? 1 : e.kind === 'jserror' ? 2 : e.kind === 'console' && e.level === 'error' ? 3 : e.kind === 'network' && !e.asset ? 4 : 5);
  const useful = evts.filter(e => rank(e) < 5).sort((a, b) => rank(a) - rank(b) || a.t - b.t);
  const fmt = e => e.kind === 'network'
    ? `${e.method} ${e.url.replace(/^https?:\/\//, '').slice(0, 120)} → ${e.status ? 'HTTP ' + e.status : e.text}${e.status && e.text ? ` (${e.text.slice(0, 120)})` : ''}`
    : `${e.kind === 'jserror' ? 'JS hatası' : 'Konsol ' + e.level}: ${e.text.slice(0, 200)}`;
  return [...new Set(useful.map(fmt))].slice(0, 5);
}

// 429 = Shopify hız sınırı: hata değil, bekleyip tekrar dene
async function gotoOk(page, url, opts = {}) {
  for (let attempt = 1; ; attempt++) {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000, ...opts });
    const status = resp ? resp.status() : 0;
    if (status === 429 && attempt < 3) { await page.waitForTimeout(20000); continue; }
    if (status === 0 || (status >= 400 && status !== 429)) throw new Error(`HTTP ${status || 'yanıt yok'}`);
    return status;
  }
}

module.exports = { withTimeout, shot, getCart, escRe, newPage, gotoOk, diagnose };
