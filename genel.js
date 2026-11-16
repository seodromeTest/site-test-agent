// Genel testte ana sayfanın tamamı: menü (masaüstü + mobil), banner/slider, içerik linkleri ve kartlar,
// koleksiyonların boş olup olmadığı, footer, sosyal medya, diğer sitelere linkler, canlı destek (chat).
// Çıktı: rapor satırları { bolum, kontrol, adres, sonuc, durum } – detay.js bunları site tablosuna ekler.
const { devices } = require('playwright');
const { withTimeout, newPage, gotoOk, CHALLENGE_TEXT } = require('./lib');

const SOCIAL = [
  [/facebook\.com|fb\.com/i, 'Facebook'], [/instagram\.com/i, 'Instagram'], [/tiktok\.com/i, 'TikTok'],
  [/youtube\.com|youtu\.be/i, 'YouTube'], [/pinterest\./i, 'Pinterest'], [/linkedin\.com/i, 'LinkedIn'],
  [/twitter\.com|(^|\/\/|\.)x\.com/i, 'X (Twitter)'], [/threads\.net/i, 'Threads'], [/yelp\.com/i, 'Yelp'],
  [/google\.com\/maps|g\.page|goo\.gl\/maps/i, 'Google Maps'], [/wa\.me|whatsapp/i, 'WhatsApp'],
];
const socialName = u => SOCIAL.find(([re]) => re.test(u))?.[1];
const path = u => { try { const x = new URL(u); return x.pathname + x.search; } catch (e) { return u; } };

// Bir adresin durumu (sunucu tarafından; tarayıcının CORS kısıtı yok)
async function status(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000),
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } });
      r.body?.cancel().catch(() => {});
      if (r.status >= 500 || r.status === 429) { if (attempt === 0) { await new Promise(x => setTimeout(x, 3000)); continue; } }
      return { code: r.status, final: r.url, challenge: r.headers.get('cf-mitigated') === 'challenge' || (r.status === 403 && /cloudflare/i.test(r.headers.get('server') || '')) };
    } catch (e) {
      // http:// adresi bazı ağlarda çözülemiyor: https ile bir kez dene
      if (/^http:\/\//.test(url)) { url = url.replace(/^http:/, 'https:'); continue; }
      if (attempt === 1) return { code: 'hata', err: e.cause?.code || e.name };
    }
  }
}

// Ekranda gerçekten görünen ve tıklanabilen (üstü kapalı olmayan) link/butonlar: açılan menü/pencere bunları artırır
const onScreen = page => page.evaluate(() => {
  const all = r => [...r.querySelectorAll('a, button, summary, [role=button], iframe, input, textarea')]
    .concat([...r.querySelectorAll('*')].filter(e => e.shadowRoot).flatMap(e => all(e.shadowRoot)));
  const out = [];
  for (const e of all(document)) {
    const b = e.getBoundingClientRect();
    if (b.width < 2 || b.height < 2 || b.right <= 0 || b.bottom <= 0 || b.left >= innerWidth || b.top >= innerHeight) continue;
    const x = Math.min(Math.max(b.left + b.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(b.top + b.height / 2, 1), innerHeight - 1);
    const root = e.getRootNode();
    const hit = (root.elementFromPoint ? root : document).elementFromPoint(x, y);
    if (hit && (hit === e || e.contains(hit) || hit.contains(e) || e.parentElement?.contains(hit))) out.push(e.tagName + '|' + (e.href || e.src || (e.innerText || '').trim().slice(0, 30)));
  }
  return out;
}).catch(() => []);
const newOnes = (before, after) => after.filter(x => !before.includes(x)).length;

// Sıralı çalıştır: linkler tek tek, biri bitmeden diğeri başlamaz (paralel istek yok)
async function pool(items, n, fn) {
  const out = [];
  for (const it of items) out.push(await fn(it));
  return out;
}

// "Sorun" sadece sitenin gerçekten hatalı cevap verdiği durumlar (404/410, 5xx, bağlantı yok, boş sayfa).
// Hız sınırı (429) ve güvenlik doğrulaması test sunucusundan kaynaklı: "Kontrol edilemedi" (durum yapilmadi).
const KONTROL_EDILEMEDI = {
  challenge: 'Kontrol edilemedi: sayfa güvenlik doğrulaması (Cloudflare) istedi; test sunucusundan kaynaklı, site hatası değil, elle açılabilir',
  ratelimit: 'Kontrol edilemedi: site çok fazla istek dedi (HTTP 429); test yükünden kaynaklı, site hatası değil',
};
const linkResult = (st, { external, social } = {}) => {
  // Dış siteler (sosyal medya vb.) otomatik erişimi engelliyor: adres doğruysa başarılı say, elle açılabilir
  if (external && (st.challenge || [400, 401, 403, 405, 429, 999].includes(st.code)))
    return { durum: 'ok', sonuc: `Adres doğru; ${social || 'site'} otomatik erişime izin vermiyor (${st.challenge ? 'güvenlik doğrulaması' : 'HTTP ' + st.code}), elle açılabilir` };
  if (st.challenge) return { durum: 'yapilmadi', sonuc: KONTROL_EDILEMEDI.challenge };
  if (st.code === 'hata') return { durum: 'hata', sonuc: `Sorun: sayfa açılmıyor (${st.err || 'bağlantı hatası'})` };
  if (st.code === 404 || st.code === 410) return { durum: 'hata', sonuc: `Sorun: sayfa bulunamadı (HTTP ${st.code})` };
  if (st.code === 429) return { durum: 'yapilmadi', sonuc: KONTROL_EDILEMEDI.ratelimit };
  if (st.code >= 400) return { durum: 'hata', sonuc: `Sorun: sayfa açılmıyor (HTTP ${st.code})` };
  return { durum: 'ok', sonuc: 'Açıldı' };
};

// Koleksiyonda ürün var mı: sayı, 0 = boş, null = bilinmiyor (sayfa açılamadı vb. – "boş" denmez)
const htmlHasProducts = async u => {
  const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!r.ok) { r.body?.cancel().catch(() => {}); return null; }
  const html = await r.text();
  return /href="[^"]*\/products\/[^"]+"/.test(html.replace(/<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, ''));
};
async function koleksiyonUrunSayisi(u) {
  try {
    // Shopify'ın marka/tür sayfaları (/collections/vendors?q=…, /collections/types?q=…) ürünleri adresteki
    // q parametresine göre listeler: products.json ile sayılamaz, sayfanın kendisine bakılır
    if (/\/collections\/(vendors|types)\/?$/.test(new URL(u).pathname)) {
      const has = await htmlHasProducts(u);
      return has === false ? 0 : null;
    }
    // Eski koleksiyon adresi yeni koleksiyona yönlendirilmiş olabilir: ürünleri yönlendirilen adresten say
    const page = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    page.body?.cancel().catch(() => {});
    const final = new URL(page.url || u); final.search = ''; final.hash = '';
    const j = await fetch(final.href.replace(/\/$/, '') + '/products.json?limit=1', { signal: AbortSignal.timeout(20000) }).then(r => r.json());
    let n = Array.isArray(j.products) ? j.products.length : null;
    // products.json bazı mağazalarda kapalı/filtreli: boş görünürse sayfanın kendisine bak. Açılamazsa bilinmiyor.
    if (n === 0) {
      const has = await htmlHasProducts(u);
      if (has !== false) n = null;
    }
    return n;
  } catch (e) { return null; }
}

// Masaüstü menü öğesi: başlığın üzerine gel, alt menü açılıyor mu (görünen yeni link sayısı; 0 = açılmadı)
async function menuDene(page, li, maxMs = 4000) {
  await page.mouse.move(5, 600).catch(() => {});
  // Önceki alt menünün kapanma animasyonu bitsin
  await page.waitForTimeout(1200);
  const before = await onScreen(page);
  // li'nin ortası değil, menü başlığının kendisi (bazı temalarda li alt menüyle birlikte büyük bir kutu)
  const head = li.locator('a, summary, button').filter({ visible: true }).first();
  await ((await head.count()) ? head : li).hover().catch(() => {});
  // Bazı temalarda alt menü gecikmeli/animasyonla açılıyor: maxMs'ye kadar bekle
  let visibleSub = 0;
  for (const end = Date.now() + maxMs; Date.now() < end && visibleSub < 2;) {
    await page.waitForTimeout(400);
    visibleSub = newOnes(before, await onScreen(page));
  }
  // Yedek kontrol: menü öğesinin kendi alt menüsündeki linkler ekranda görünür ve tıklanabilir mi
  if (visibleSub < 2) visibleSub = Math.max(visibleSub, await li.evaluate(el => [...el.querySelectorAll('ul a, [class*=mega] a, [class*=dropdown] a, details a')].filter(a => {
    const r = a.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.top < 0 || r.bottom > innerHeight) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (a.contains(hit) || hit.contains(a));
  }).length).catch(() => 0));
  // Üzerine gelince açılmıyorsa tıklayarak açılan menü olabilir
  const summary = li.locator('summary, button').first();
  let clicked = false;
  if (visibleSub < 2 && await summary.count()) { await summary.click().catch(() => {}); clicked = true; await page.waitForTimeout(800 + maxMs / 4); visibleSub = newOnes(before, await onScreen(page)); }
  if (clicked) await summary.click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.move(5, 600).catch(() => {});
  return visibleSub < 2 ? 0 : visibleSub;
}
const MENU_LI = 'header nav > ul > li, header .header__inline-menu > ul > li, header [class*=menu] > ul > li';
const menuAdi = async li => (await li.innerText().catch(() => '')).split('\n')[0].trim().slice(0, 40);

// Masaüstü menünün tamamı (açık ana sayfada): her alt menülü öğe için satır
async function masaustuMenu(page, add) {
  const topItems = await page.locator(MENU_LI).filter({ visible: true }).all().catch(() => []);
  for (const li of topItems.slice(0, 10)) {
    const name = await menuAdi(li);
    const hasSub = await li.locator('ul, [class*=mega], [class*=dropdown], details').count().catch(() => 0);
    if (!hasSub || !name) continue;
    const n = await menuDene(page, li);
    add('Ana menü (masaüstü)', `"${name}" menüsü üzerine gelince alt menü açılıyor mu`, '', n ? `Açıldı (${n} alt link)` : 'Sorun: alt menü açılmadı', n ? 'ok' : 'hata', { tur: 'menu', menu: name });
  }
}

// Telefonda hamburger menü: açılınca görünen yeni öğe sayısı (null = buton yok)
const BURGER = [
  'header [aria-label*="menu" i]:is(button, summary, a, [role=button])', 'header summary[aria-controls*="menu" i]', 'header .header__icon--menu',
  'header button[class*=menu i]', 'header [class*=hamburger i]', 'header [class*=menu-toggle i]', 'header [class*=mobile-menu] button',
  'header [data-action*=menu i]', 'header [class*=drawer] summary', '[class*=header] [aria-label*="menu" i]',
  '[class*=nav-toggle i]', 'button[class*=mobile-menu i]', 'button[class*=mobile-nav i]', '[class*=menu-toggle i]', '[class*=hamburger i]', '[class*=header] [class*=menu-icon i]', '[class*=header] [class*=burger i]',
].join(', ');
async function mobilMenuDene(mp, saniye = 4) {
  const burger = mp.locator(BURGER).filter({ visible: true }).first();
  if (!(await burger.count())) return null;
  const before = await onScreen(mp);
  await burger.click({ timeout: 8000 }).catch(() => {});
  let n = 0;
  for (let i = 0; i < saniye && n <= 2; i++) { await mp.waitForTimeout(1000); n = newOnes(before, await onScreen(mp)); }
  return n;
}

// Slider ileri oku: slayt değişiyor mu (null = ok yok, 'olculemedi' = alan ölçülemedi)
async function sliderDene(page, bekle = 1800) {
  const next = page.locator(['[class*=slideshow] button[class*=next]', '[class*=slider] button[class*=next]', 'slideshow-component button[name=next]',
    '[class*=slideshow] .flickity-prev-next-button.next', '[class*=banner] [class*=next]', '.swiper-button-next', '[class*=slideshow] [aria-label*="next" i]']
    .map(x => x + ':not([disabled]):not(.swiper-button-disabled)').join(', ')).filter({ visible: true }).first();
  if (!(await next.count().catch(() => 0))) return null;
  // Slider alanının ekran görüntüsü oka basmadan önce ve sonra karşılaştırılır
  const box = await next.evaluateHandle(b => { let el = b; while (el.parentElement && el.getBoundingClientRect().height < 200) el = el.parentElement; return el; });
  await next.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  const img = () => box.asElement().screenshot({ type: 'jpeg', quality: 40, timeout: 10000 }).catch(() => null);
  const before = await img();
  await next.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(bekle);
  const after = await img();
  if (!before) return 'olculemedi';
  return !!(after && !before.equals(after));
}

async function genelKontrol(browser, site) {
  const rows = [];
  // ek: ikinci kontrol için bilgi (tur: link | koleksiyon | menu | mobil | slider | gorsel)
  const add = (bolum, kontrol, adres, sonuc, durum, ek = {}) => rows.push({ bolum, kontrol, adres, sonuc, durum, ...ek });
  const origin = new URL(site.base).origin;
  const host = new URL(site.base).hostname.replace(/^www\./, '');
  const isInternal = u => { try { return new URL(u).hostname.replace(/^www\./, '') === host; } catch (e) { return false; } };

  // ---------- Masaüstü: ana sayfadaki tüm linkleri bölgelere ayır ----------
  const { ctx, page } = await newPage(browser);
  let found;
  try {
    await gotoOk(page, site.base + '/', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    found = await page.evaluate(() => {
      const txt = a => (a.innerText || a.getAttribute('aria-label') || a.title || a.querySelector('img')?.alt || '').trim().replace(/\s+/g, ' ').slice(0, 70);
      const region = a => {
        if (a.closest('footer, [class*=footer], [id*=footer]')) return 'footer';
        if (a.closest('header, [class*=header], [id*=header], nav, [class*=announcement]')) return 'header';
        if (a.closest('[class*=slideshow], [class*=slider], [class*=banner], [class*=hero], [class*=carousel-banner], slideshow-component')) return 'banner';
        return 'main';
      };
      const seen = new Map();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href.split('#')[0];
        if (!/^https?:/.test(href) || /\/account|customer_authentication|\/cart(\/|$)|\/checkout|\/search$|\/admin(\/|$)/.test(href) && !/\/admin/.test(href)) continue;
        if (/google\.[a-z.]+\/maps\/contrib|review-images\.judgeme|judgeme\.imgix|cdn\.shopify\.com|\.(jpe?g|png|webp|gif)(\?|$)/i.test(href)) continue;
        const r = region(a), key = r + '|' + href, t = txt(a);
        if (!seen.has(key)) seen.set(key, { href, text: t, region: r, newTab: a.target === '_blank' });
        else if (!seen.get(key).text && t) seen.get(key).text = t;
      }
      // Banner görselleri yüklenmiş mi
      const bannerImgs = [...document.querySelectorAll('[class*=slideshow] img, [class*=slider] img, [class*=banner] img, [class*=hero] img, slideshow-component img')]
        .filter(i => !i.closest('header, footer') && i.getClientRects().length && i.getBoundingClientRect().left >= 0 && i.getBoundingClientRect().left < innerWidth && i.loading !== 'lazy')
        .slice(0, 12).map(i => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0, alt: i.alt }));
      // Kırık görseller (tüm ana sayfa)
      const brokenImgs = [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src) && !/^data:/.test(i.src) && i.loading !== 'lazy').map(i => i.currentSrc || i.src).slice(0, 10);
      return { links: [...seen.values()], bannerImgs, brokenImgs };
    });

    // ---------- Masaüstü menü: üst menü öğeleri ve açılır alt menüler ----------
    await masaustuMenu(page, add);

    // ---------- Banner / slider: ileri oku slaytı değiştiriyor mu ----------
    const sl = await sliderDene(page);
    if (sl !== null) add('Banner / slider', 'Slider ileri oku slaytı değiştiriyor mu', '', sl === true ? 'Slayt değişti' : sl === false ? 'Sorun: oka basınca slayt değişmedi' : 'Slider alanı ölçülemedi',
      sl === true ? 'ok' : sl === false ? 'hata' : 'bilgi', { tur: 'slider' });
  } catch (e) {
    add('Ana sayfa', 'Ana sayfa genel kontrolü', site.base, `Sorun: ${e.message.split('\n')[0].slice(0, 150)}`, 'hata');
  } finally {
    await withTimeout(ctx.close(), 15000, 'close').catch(() => {});
  }
  if (!found) return rows;

  // ---------- Banner görselleri ----------
  if (found.bannerImgs.length) {
    const bad = found.bannerImgs.filter(i => !i.ok);
    add('Banner / slider', `Banner görselleri yükleniyor mu (${found.bannerImgs.length} görsel)`, '', bad.length ? `Sorun: ${bad.length} görsel yüklenmedi` : 'Hepsi yüklendi', bad.length ? 'hata' : 'ok',
      { tur: 'gorsel', srcs: bad.map(i => i.src) });
  }
  for (const src of found.brokenImgs) add('Ana sayfa görselleri', 'Görsel yükleniyor mu', src, 'Sorun: görsel yüklenmedi', 'hata', { tur: 'gorsel', srcs: [src] });

  // ---------- Tüm linkleri kontrol et (iç linkler + dış linkler) ----------
  const unique = [...new Set(found.links.map(l => l.href))];
  const st = new Map(await pool(unique, 4, async u => [u, await status(u)]));

  // Koleksiyonlar boş mu
  const collections = [...new Set(unique.filter(u => isInternal(u) && /\/collections\/[^/?]+\/?$/.test(new URL(u).pathname) && !/\/collections\/all\/?$/.test(new URL(u).pathname)))];
  const counts = new Map(await pool(collections, 4, async u => [u, await koleksiyonUrunSayisi(u)]));

  const BOLUM = { header: 'Ana menü linkleri', banner: 'Banner / slider linkleri', main: 'Ana sayfa içerik linkleri (kartlar, butonlar, metin içi)', footer: 'Footer linkleri' };
  const socialRows = [], sisterRows = [];
  for (const region of ['header', 'banner', 'main', 'footer']) {
    for (const l of found.links.filter(x => x.region === region)) {
      const s = st.get(l.href);
      const soc = socialName(l.href);
      const ext = !isInternal(l.href);
      const r = linkResult(s, { external: ext, social: soc });
      if (soc) { socialRows.push({ l, r, soc }); continue; }
      if (ext) { sisterRows.push({ l, r }); continue; }
      let sonuc = r.sonuc, durum = r.durum;
      if (/\/admin(\/|$)/.test(new URL(l.href).pathname)) { add(BOLUM[region], l.text || path(l.href), l.href, 'Sorun: link mağaza yönetim paneline (/admin) gidiyor – tema örnek (placeholder) içeriği yayında kalmış', 'hata'); continue; }
      if (durum === 'ok' && s.final && !isInternal(s.final)) sonuc = `Açıldı (başka siteye yönlendiriyor: ${s.final})`;
      let tur = 'link';
      if (durum === 'ok' && counts.get(l.href) === 0) { sonuc = 'Sorun: koleksiyon açılıyor ama içinde ürün yok'; durum = 'hata'; tur = 'koleksiyon'; }
      else if (durum === 'ok' && counts.get(l.href) > 0) sonuc = 'Açıldı, koleksiyonda ürün var';
      if (l.newTab && durum === 'ok') sonuc += ' · yeni sekmede açılıyor';
      add(BOLUM[region], l.text || path(l.href), l.href, sonuc, durum, { tur });
    }
  }
  // Sosyal medya (aynı hesap birden fazla yerde olabilir: bir kez yaz)
  const socSeen = new Set();
  for (const { l, r, soc } of socialRows) {
    if (socSeen.has(l.href)) continue; socSeen.add(l.href);
    add('Sosyal medya', `${soc} (${l.region === 'footer' ? 'footer' : l.region === 'header' ? 'üst kısım' : 'sayfa içi'})`, l.href, r.sonuc, r.durum, { tur: 'link', dis: true });
  }
  if (!socialRows.length) add('Sosyal medya', 'Sosyal medya linkleri', '', 'Ana sayfada sosyal medya linki bulunamadı', 'bilgi');
  const extSeen = new Set();
  for (const { l, r } of sisterRows) {
    if (extSeen.has(l.href)) continue; extSeen.add(l.href);
    add('Diğer sitelere linkler', l.text || new URL(l.href).hostname, l.href, r.sonuc, r.durum, { tur: 'link', dis: true });
  }

  // ---------- Mobil: hamburger menü ve chat ----------
  const { ctx: m, page: mp } = await newPage(browser, { ...devices['iPhone 13'], locale: 'en-US' });
  try {
    // Geçici 5xx'te bir kez daha dene
    await gotoOk(mp, site.base + '/', { waitUntil: 'load' }).catch(async () => { await mp.waitForTimeout(5000); await gotoOk(mp, site.base + '/', { waitUntil: 'load' }); });
    await mp.waitForTimeout(2500);
    const n = await mobilMenuDene(mp);
    if (n === null) add('Mobil menü', 'Telefonda menü (hamburger) butonu var mı', '', 'Sorun: menü butonu bulunamadı', 'hata', { tur: 'mobil' });
    else add('Mobil menü', 'Telefonda menü (hamburger) butonu menüyü açıyor mu', '', n > 2 ? `Menü açıldı (${n} yeni öğe görünüyor)` : 'Sorun: menü açılmadı', n > 2 ? 'ok' : 'hata', { tur: 'mobil' });
    // Mobilde yatay taşma
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
    add('Mobil görünüm', 'Telefonda sayfa yana taşıyor mu', '', overflow > 5 ? `Sorun: sayfa ${overflow}px yana taşıyor (yatay kaydırma çıkıyor)` : 'Taşma yok', overflow > 5 ? 'hata' : 'ok');
  } catch (e) {
    add('Mobil menü', 'Telefon görünümü', site.base, `Sorun: ${e.message.split('\n')[0].slice(0, 150)}`, 'hata');
  } finally {
    await withTimeout(m.close(), 15000, 'close').catch(() => {});
  }

  // ---------- Canlı destek (chat) ----------
  const { ctx: c2, page: cp } = await newPage(browser);
  try {
    await gotoOk(cp, site.base + '/', { waitUntil: 'load' });
    await cp.waitForTimeout(6000);
    const chat = await cp.evaluate(() => {
      const names = [['shopify-chat', 'Shopify Inbox'], ['#tidio-chat', 'Tidio'], ['iframe[title*=tawk i]', 'Tawk.to'], ['#gorgias-chat-container', 'Gorgias'],
        ['#launcher, iframe#launcher', 'Zendesk'], ['.intercom-launcher, #intercom-container', 'Intercom'], ['.crisp-client', 'Crisp'], ['#hubspot-messages-iframe-container', 'HubSpot'],
        ['[id*=chat-widget], [class*=chat-widget]', 'Chat'], ['iframe[title*=chat i]', 'Chat']];
      return names.find(([sel]) => document.querySelector(sel))?.[1] || null;
    });
    if (!chat) add('Canlı destek (chat)', 'Chat butonu var mı', '', 'Ana sayfada chat butonu bulunamadı', 'bilgi');
    else {
      const btn = cp.getByRole('button', { name: /chat|message|help|support/i }).filter({ visible: true }).last();
      let opened = false;
      if (await btn.count().catch(() => 0)) {
        // Açılan pencere: görünen link/iframe/metin artar ya da buton "açık" durumuna geçer
        const before = await onScreen(cp);
        await btn.click({ timeout: 8000 }).catch(() => {});
        await cp.waitForTimeout(3500);
        opened = newOnes(before, await onScreen(cp)) > 0 || (await btn.getAttribute('aria-expanded').catch(() => null)) === 'true' || cp.frames().some(f => /shopify-chat|inbox|tidio|tawk|gorgias|zendesk|intercom|crisp/.test(f.url()));
      }
      add('Canlı destek (chat)', `Chat butonu (${chat}) tıklanınca pencere açılıyor mu`, '', opened ? 'Chat penceresi açıldı' : 'Chat butonu görünüyor; pencerenin açıldığı otomatik doğrulanamadı', opened ? 'ok' : 'bilgi');
    }
  } catch (e) {
    add('Canlı destek (chat)', 'Chat kontrolü', '', `Kontrol edilemedi: ${e.message.split('\n')[0].slice(0, 120)}`, 'bilgi');
  } finally {
    await withTimeout(c2.close(), 15000, 'close').catch(() => {});
  }

  // ---------- İkinci kontrol: "Sorun" çıkan her satır rapora girmeden başka yöntemle bir kez daha denenir ----------
  await ikinciKontrol(browser, site, rows);

  // Bölüm sırası: menüler, banner, içerik, footer, sosyal, diğer siteler, mobil, chat
  const order = ['Ana menü (masaüstü)', 'Ana menü linkleri', 'Mobil menü', 'Mobil görünüm', 'Banner / slider', 'Banner / slider linkleri', 'Ana sayfa görselleri',
    'Ana sayfa içerik linkleri (kartlar, butonlar, metin içi)', 'Footer linkleri', 'Sosyal medya', 'Diğer sitelere linkler', 'Canlı destek (chat)', 'Ana sayfa'];
  return rows.sort((a, b) => order.indexOf(a.bolum) - order.indexOf(b.bolum));
}

// Rapora girmeden ikinci kontrol. Gerçek tarayıcıyla, ilk kontrolden farklı yöntemle ve daha uzun bekleyerek:
// - link: sayfa tarayıcıda açılıyor mu (ilk kontrol sunucudan fetch ile yapılıyor)
// - koleksiyon: sayfa tarayıcıda açılınca ürün kartı görünüyor mu
// - menu / mobil / slider: aynı işlem daha uzun beklemeyle
// - gorsel: görsel dosyası tekrar istenince geliyor mu
// Çalışıyorsa satır "Not" (bilgi) olur; hız sınırı / doğrulama sayfasıysa "Kontrol edilemedi"; sonuç aynıysa "Sorun" kalır
// ve "ikinci kontrolde de doğrulandı" yazar. Her deneme ayrı oturumda, sırayla (oturum içinde paralel işlem yok).
async function ikinciKontrol(browser, site, rows) {
  const hatalar = rows.filter(r => r.durum === 'hata' && r.tur);
  if (!hatalar.length) return;
  const not = (r, msg) => { r.durum = 'bilgi'; r.sonuc = `Not: ${msg}`; r.ikinci = 'gecti'; };
  const ayni = r => { r.sonuc += ' (ikinci kontrolde de doğrulandı)'; r.ikinci = 'dogrulandi'; };
  const edilemedi = (r, tip) => { r.durum = 'yapilmadi'; r.sonuc = KONTROL_EDILEMEDI[tip]; r.ikinci = 'edilemedi'; };
  const ilk = r => r.sonuc.replace(/^Sorun: /, '');
  for (const r of hatalar) {
    const mobil = r.tur === 'mobil';
    const { ctx, page } = await newPage(browser, mobil ? { ...devices['iPhone 13'], locale: 'en-US' } : undefined);
    try {
      if (r.tur === 'link' || r.tur === 'koleksiyon') {
        const resp = await page.goto(r.adres, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
        await page.waitForTimeout(3000);
        const code = resp?.status() ?? 0;
        const metin = await page.evaluate(() => document.title + ' ' + (document.body?.innerText || '').slice(0, 3000)).catch(() => '');
        if (code === 429) { edilemedi(r, 'ratelimit'); continue; }
        if (CHALLENGE_TEXT.test(metin) || (code === 403 && /cloudflare/i.test(resp?.headers()?.server || ''))) { edilemedi(r, 'challenge'); continue; }
        if (r.tur === 'koleksiyon') {
          const n = await page.evaluate(() => new Set([...(document.querySelector('main, #MainContent, [role=main]') || document.body).querySelectorAll('a[href*="/products/"]')]
            .filter(a => !a.closest('header, footer, [class*=header], [class*=footer]')).map(a => a.pathname.replace(/^.*\/products\//, ''))).size).catch(() => 0);
          if (code && code < 400 && n > 0) not(r, `ilk kontrolde koleksiyon boş göründü; tarayıcıyla açılınca ${n} ürün görünüyor`);
          else ayni(r);
        } else if (code && code < 400) not(r, `ilk kontrolde açılmadı (${ilk(r)}); tarayıcıyla tekrar açılınca açıldı`);
        else if (r.dis && [400, 401, 403, 405, 999].includes(code)) not(r, `ilk kontrolde açılmadı (${ilk(r)}); site otomatik erişime izin vermiyor (HTTP ${code}), adres elle kontrol edilebilir`);
        else ayni(r);
      } else if (r.tur === 'menu') {
        await gotoOk(page, site.base + '/', { waitUntil: 'load' });
        await page.waitForTimeout(3000);
        let li = null;
        for (const x of await page.locator(MENU_LI).filter({ visible: true }).all().catch(() => [])) if (await menuAdi(x) === r.menu) { li = x; break; }
        const n = li ? await menuDene(page, li, 8000) : 0;
        if (n) not(r, `ilk denemede alt menü açılmadı; ikinci denemede açıldı (${n} alt link)`); else ayni(r);
      } else if (r.tur === 'mobil') {
        await gotoOk(page, site.base + '/', { waitUntil: 'load' });
        await page.waitForTimeout(4000);
        const n = await mobilMenuDene(page, 8);
        if (n !== null && n > 2) not(r, `ilk denemede menü açılmadı; ikinci denemede açıldı (${n} yeni öğe)`); else ayni(r);
      } else if (r.tur === 'slider') {
        await gotoOk(page, site.base + '/', { waitUntil: 'load' });
        await page.waitForTimeout(3000);
        const sl = await sliderDene(page, 4000);
        if (sl === true) not(r, 'ilk denemede slayt değişmedi; ikinci denemede (daha uzun beklemeyle) değişti'); else ayni(r);
      } else if (r.tur === 'gorsel') {
        let gelen = 0;
        for (const src of r.srcs || []) {
          const res = await page.request.get(src, { timeout: 20000 }).catch(() => null);
          if (res && res.ok() && /image\//.test(res.headers()['content-type'] || '')) gelen++;
        }
        if (r.srcs?.length && gelen === r.srcs.length) not(r, 'görsel ilk yüklemede gelmedi; tekrar istenince geldi (geçici)'); else ayni(r);
      }
    } catch (e) {
      ayni(r);
    } finally {
      await withTimeout(ctx.close(), 15000, 'close').catch(() => {});
    }
  }
}

module.exports = { genelKontrol, linkResult, koleksiyonUrunSayisi, masaustuMenu, ikinciKontrol, KONTROL_EDILEMEDI };
