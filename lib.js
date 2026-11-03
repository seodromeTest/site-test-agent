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
  await ctx.route(/klaviyo\.com|pinterest\.com|clarity\.ms|doubleclick\.net|google-analytics|googletagmanager|analytics\.google|merchant-center-analytics|facebook\.(com|net)|tiktok|bing\.com/, route => route.abort());
  const page = await ctx.newPage();
  // Pazarlama pop-up'ları testi bloklamasın
  await page.addLocatorHandler(page.locator('button.klaviyo-close-form').first(), async l => { await l.click({ force: true, timeout: 3000 }).catch(() => {}); }, { noWaitAfter: true });
  await page.addInitScript(() => {
    const s = document.createElement('style');
    // Judge.me kartları ve Klaviyo e-posta pop-up'ı ("Sign Up & Get 20% Off") butonların önünü kapatıyor
    s.textContent = '.jdgm-popup-card{display:none!important}'
      + ' div[role=dialog][aria-label="POPUP Form"],div.needsclick[class*="kl-private-reset-css"][role=dialog]{display:none!important}';
    document.documentElement.appendChild(s);
  });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message.slice(0, 200)));
  page.setDefaultTimeout(45000);
  return { ctx, page, jsErrors };
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

module.exports = { withTimeout, shot, getCart, escRe, newPage, gotoOk };
