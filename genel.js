// Genel testte ana sayfanın tamamı: menü (masaüstü + mobil), banner/slider, içerik linkleri ve kartlar,
// koleksiyonların boş olup olmadığı, footer, sosyal medya, diğer sitelere linkler, canlı destek (chat).
// Çıktı: rapor satırları { bolum, kontrol, adres, sonuc, durum } – detay.js bunları site tablosuna ekler.
const { devices } = require('playwright');
const { withTimeout, newPage, gotoOk } = require('./lib');

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

// Sınırlı paralellikle çalıştır
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const linkResult = (st, { external, social } = {}) => {
  if (st.challenge) return { durum: 'bilgi', sonuc: 'Sayfa güvenlik doğrulaması (Cloudflare "Just a moment") istiyor; otomatik açılamadı, elle kontrol edilebilir' };
  if (st.code === 'hata') return { durum: 'hata', sonuc: `Sorun: sayfa açılmıyor (${st.err || 'bağlantı hatası'})` };
  if (st.code === 404 || st.code === 410) return { durum: 'hata', sonuc: `Sorun: sayfa bulunamadı (HTTP ${st.code})` };
  if (external && [400, 401, 403, 405, 429, 999].includes(st.code))
    return { durum: 'ok', sonuc: `Adres doğru${social ? '' : ''}; ${social || 'site'} otomatik erişime izin vermiyor (HTTP ${st.code}), elle açılabilir` };
  if (st.code >= 400) return { durum: 'hata', sonuc: `Sorun: sayfa açılmıyor (HTTP ${st.code})` };
  return { durum: 'ok', sonuc: 'Açıldı' };
};

async function genelKontrol(browser, site) {
  const rows = [];
  const add = (bolum, kontrol, adres, sonuc, durum) => rows.push({ bolum, kontrol, adres, sonuc, durum });
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
    const topItems = await page.locator('header nav > ul > li, header .header__inline-menu > ul > li, header [class*=menu] > ul > li').filter({ visible: true }).all().catch(() => []);
    let dropdownOk = 0, dropdownTried = 0;
    for (const li of topItems.slice(0, 10)) {
      const name = (await li.innerText().catch(() => '')).split('\n')[0].trim().slice(0, 40);
      const hasSub = await li.locator('ul, [class*=mega], [class*=dropdown], details').count().catch(() => 0);
      if (!hasSub || !name) continue;
      dropdownTried++;
      await page.mouse.move(5, 600).catch(() => {});
      // Önceki alt menünün kapanma animasyonu bitsin
      await page.waitForTimeout(1200);
      const before = await onScreen(page);
      // li'nin ortası değil, menü başlığının kendisi (bazı temalarda li alt menüyle birlikte büyük bir kutu)
      const head = li.locator('a, summary, button').filter({ visible: true }).first();
      await ((await head.count()) ? head : li).hover().catch(() => {});
      // Bazı temalarda alt menü gecikmeli/animasyonla açılıyor: 4 sn'ye kadar bekle
      let visibleSub = 0;
      for (const end = Date.now() + 4000; Date.now() < end && visibleSub < 2;) {
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
      if (visibleSub < 2 && await summary.count()) { await summary.click().catch(() => {}); clicked = true; await page.waitForTimeout(800); visibleSub = newOnes(before, await onScreen(page)); }
      if (visibleSub < 2) visibleSub = 0;
      if (visibleSub) dropdownOk++;
      add('Ana menü (masaüstü)', `"${name}" menüsü üzerine gelince alt menü açılıyor mu`, '', visibleSub ? `Açıldı (${visibleSub} alt link)` : 'Sorun: alt menü açılmadı', visibleSub ? 'ok' : 'hata');
      if (clicked) await summary.click().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.mouse.move(5, 600).catch(() => {});
    }

    // ---------- Banner / slider: ileri oku slaytı değiştiriyor mu ----------
    const next = page.locator(['[class*=slideshow] button[class*=next]', '[class*=slider] button[class*=next]', 'slideshow-component button[name=next]',
      '[class*=slideshow] .flickity-prev-next-button.next', '[class*=banner] [class*=next]', '.swiper-button-next', '[class*=slideshow] [aria-label*="next" i]']
      .map(x => x + ':not([disabled]):not(.swiper-button-disabled)').join(', ')).filter({ visible: true }).first();
    if (await next.count().catch(() => 0)) {
      // Slider alanının ekran görüntüsü oka basmadan önce ve sonra karşılaştırılır
      const box = await next.evaluateHandle(b => { let el = b; while (el.parentElement && el.getBoundingClientRect().height < 200) el = el.parentElement; return el; });
      await next.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
      const img = () => box.asElement().screenshot({ type: 'jpeg', quality: 40, timeout: 10000 }).catch(() => null);
      const before = await img();
      await next.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const after = await img();
      const changed = before && after && !before.equals(after);
      add('Banner / slider', 'Slider ileri oku slaytı değiştiriyor mu', '', changed ? 'Slayt değişti' : before ? 'Sorun: oka basınca slayt değişmedi' : 'Slider alanı ölçülemedi', changed ? 'ok' : before ? 'hata' : 'bilgi');
    }
  } catch (e) {
    add('Ana sayfa', 'Ana sayfa genel kontrolü', site.base, `Sorun: ${e.message.split('\n')[0].slice(0, 150)}`, 'hata');
  } finally {
    await withTimeout(ctx.close(), 15000, 'close').catch(() => {});
  }
  if (!found) return rows;

  // ---------- Banner görselleri ----------
  if (found.bannerImgs.length) {
    const bad = found.bannerImgs.filter(i => !i.ok);
    add('Banner / slider', `Banner görselleri yükleniyor mu (${found.bannerImgs.length} görsel)`, '', bad.length ? `Sorun: ${bad.length} görsel yüklenmedi` : 'Hepsi yüklendi', bad.length ? 'hata' : 'ok');
  }
  for (const src of found.brokenImgs) add('Ana sayfa görselleri', 'Görsel yükleniyor mu', src, 'Sorun: görsel yüklenmedi', 'hata');

  // ---------- Tüm linkleri kontrol et (iç linkler + dış linkler) ----------
  const unique = [...new Set(found.links.map(l => l.href))];
  const st = new Map(await pool(unique, 4, async u => [u, await status(u)]));

  // Koleksiyonlar boş mu
  const collections = [...new Set(unique.filter(u => isInternal(u) && /\/collections\/[^/?]+\/?$/.test(new URL(u).pathname) && !/\/collections\/all\/?$/.test(new URL(u).pathname)))];
  const counts = new Map(await pool(collections, 4, async u => {
    try {
      // Eski koleksiyon adresi yeni koleksiyona yönlendirilmiş olabilir: ürünleri yönlendirilen adresten say
      const page = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      page.body?.cancel().catch(() => {});
      const final = new URL(page.url || u); final.search = ''; final.hash = '';
      const j = await fetch(final.href.replace(/\/$/, '') + '/products.json?limit=1', { signal: AbortSignal.timeout(20000) }).then(r => r.json());
      let n = Array.isArray(j.products) ? j.products.length : null;
      // products.json bazı mağazalarda kapalı/filtreli: boş görünürse sayfanın kendisinde ürün linki var mı bak
      if (n === 0) {
        const html = await fetch(u, { signal: AbortSignal.timeout(20000) }).then(r => r.text());
        if (/href="[^"]*\/products\/[^"]+"/.test(html.replace(/<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, ''))) n = null;
      }
      return [u, n];
    } catch (e) { return [u, null]; }
  }));

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
      if (durum === 'ok' && counts.get(l.href) === 0) { sonuc = 'Sorun: koleksiyon açılıyor ama içinde ürün yok'; durum = 'hata'; }
      else if (durum === 'ok' && counts.get(l.href) > 0) sonuc = 'Açıldı, koleksiyonda ürün var';
      if (l.newTab && durum === 'ok') sonuc += ' · yeni sekmede açılıyor';
      add(BOLUM[region], l.text || path(l.href), l.href, sonuc, durum);
    }
  }
  // Sosyal medya (aynı hesap birden fazla yerde olabilir: bir kez yaz)
  const socSeen = new Set();
  for (const { l, r, soc } of socialRows) {
    if (socSeen.has(l.href)) continue; socSeen.add(l.href);
    add('Sosyal medya', `${soc} (${l.region === 'footer' ? 'footer' : l.region === 'header' ? 'üst kısım' : 'sayfa içi'})`, l.href, r.sonuc, r.durum);
  }
  if (!socialRows.length) add('Sosyal medya', 'Sosyal medya linkleri', '', 'Ana sayfada sosyal medya linki bulunamadı', 'bilgi');
  const extSeen = new Set();
  for (const { l, r } of sisterRows) {
    if (extSeen.has(l.href)) continue; extSeen.add(l.href);
    add('Diğer sitelere linkler', l.text || new URL(l.href).hostname, l.href, r.sonuc, r.durum);
  }

  // ---------- Mobil: hamburger menü ve chat ----------
  const { ctx: m, page: mp } = await newPage(browser, { ...devices['iPhone 13'], locale: 'en-US' });
  try {
    // Geçici 5xx'te bir kez daha dene
    await gotoOk(mp, site.base + '/', { waitUntil: 'load' }).catch(async () => { await mp.waitForTimeout(5000); await gotoOk(mp, site.base + '/', { waitUntil: 'load' }); });
    await mp.waitForTimeout(2500);
    const burger = mp.locator([
      'header [aria-label*="menu" i]:is(button, summary, a, [role=button])', 'header summary[aria-controls*="menu" i]', 'header .header__icon--menu',
      'header button[class*=menu i]', 'header [class*=hamburger i]', 'header [class*=menu-toggle i]', 'header [class*=mobile-menu] button',
      'header [data-action*=menu i]', 'header [class*=drawer] summary', '[class*=header] [aria-label*="menu" i]',
      '[class*=nav-toggle i]', 'button[class*=mobile-menu i]', 'button[class*=mobile-nav i]', '[class*=menu-toggle i]', '[class*=hamburger i]', '[class*=header] [class*=menu-icon i]', '[class*=header] [class*=burger i]',
    ].join(', ')).filter({ visible: true }).first();
    if (!(await burger.count())) add('Mobil menü', 'Telefonda menü (hamburger) butonu var mı', '', 'Sorun: menü butonu bulunamadı', 'hata');
    else {
      const before = await onScreen(mp);
      await burger.click({ timeout: 8000 }).catch(() => {});
      let n = 0;
      for (let i = 0; i < 4 && n <= 2; i++) { await mp.waitForTimeout(1000); n = newOnes(before, await onScreen(mp)); }
      const opened = n > 2;
      add('Mobil menü', 'Telefonda menü (hamburger) butonu menüyü açıyor mu', '', opened ? `Menü açıldı (${n} yeni öğe görünüyor)` : 'Sorun: menü açılmadı', opened ? 'ok' : 'hata');
    }
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

  // Bölüm sırası: menüler, banner, içerik, footer, sosyal, diğer siteler, mobil, chat
  const order = ['Ana menü (masaüstü)', 'Ana menü linkleri', 'Mobil menü', 'Mobil görünüm', 'Banner / slider', 'Banner / slider linkleri', 'Ana sayfa görselleri',
    'Ana sayfa içerik linkleri (kartlar, butonlar, metin içi)', 'Footer linkleri', 'Sosyal medya', 'Diğer sitelere linkler', 'Canlı destek (chat)', 'Ana sayfa'];
  return rows.sort((a, b) => order.indexOf(a.bolum) - order.indexOf(b.bolum));
}

module.exports = { genelKontrol };
