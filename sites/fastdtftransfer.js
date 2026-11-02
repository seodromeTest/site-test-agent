// FastDTF Transfer – test edilecek upload akışları.
// Her akış: ürün sayfasını aç → test görselini yükle → sepete ekle → sepeti doğrula.
const path = require('path');
const BASE = 'https://www.fastdtftransfer.com';
// Builder dosya adını kısaltarak gösteriyor: adın ilk kısmıyla eşleştir
const fileLabel = file => new RegExp(path.basename(file).slice(0, 10).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

// matrix.js için: uygulamanın yükleme sonrası gösterdiği metinden ölçü/varyant/fiyat/uyarıları çıkar
const between = (t, a, b) => { const i = t.indexOf(a); if (i < 0) return ''; const j = t.indexOf(b, i); return t.slice(i, j < 0 ? undefined : j); };
const WARN = /low|resolution|warn|exceed|too (large|wide|big|small)|wider|background|upscale|error|fail|not supported|unsupported|invalid|reject|unavailable|could not/i;
const warnLines = t => [...new Set(t.split('\n').map(l => l.trim()).filter(l => l && l.length < 200 && WARN.test(l)))].slice(0, 6);
// GS Studio arayüzü shadow DOM içinde: görünen metni oradan topla
const shadowText = page => page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.shadowRoot)
  .map(e => [...e.shadowRoot.children].map(c => c.innerText || '').join('\n')).join('\n'));

module.exports = {
  name: 'FastDTF Transfer',
  domain: 'fastdtftransfer.com',
  base: BASE,
  // Saatlik ana fonksiyon testi: arama + normal ürünle sepete ekle + checkout
  core: { search: 'film', products: ['uv-dtf-a-b-film-roll-24-325', 'dtf-printhead-cleaning-solution-500ml'] },
  flows: [
    {
      id: 'upload-gang-sheet',
      title: 'Upload a DTF Gang Sheet (Upload Studio)',
      url: `${BASE}/products/upload-a-dtf-gang-sheet`,
      expectProduct: 'Upload a DTF Gang Sheet',
      fileProp: 'Print Ready',
      accepts: /\.(png|jpe?g|webp|tiff?|psd|pdf|ai|eps|svg)$/i,
      async read(page) {
        const t = between(await page.evaluate(() => document.body.innerText), 'YOUR FILES', 'Order note');
        const m = t.match(/W ([\d.]+)" x L ([\d.]+)" · ([\d.]+"x[\d.]+")/);
        const price = t.match(/1 × [\d.]+"x[\d.]+"\n\$([\d.,]+)/) || t.match(/whole-sheet cop\w*\n\$([\d.,]+)/);
        return { olcu: m && `${m[1]}" × ${m[2]}"`, dpi: t.match(/\n(\d+) DPI\n/)?.[1], varyant: m?.[3], fiyat: price?.[1], uyarilar: warnLines(t) };
      },
      async run(page, step, file, notes, hooks = {}) {
        await step('Upload', async () => {
          await page.locator('input.ump__input').setInputFiles(file);
          await page.getByText(/ready ·/i).first().waitFor({ timeout: 120000 });
        });
        await hooks.afterUpload?.();
        await step('Sepete ekle', async () => {
          await page.getByRole('button', { name: /^add to cart$/i }).filter({ visible: true }).first().click();
        });
      },
    },
    {
      id: 'custom-dtf-transfer',
      title: 'Custom DTF Transfer (GS Studio upload)',
      url: `${BASE}/products/custom-dtf-transfer`,
      expectProduct: 'Upload a DTF Gang Sheet',
      fileProp: 'Uploaded File',
      accepts: /\.(png|jpe?g|webp|psd|pdf|ai|eps|svg)$/i,
      async read(page) {
        const t = between(await page.evaluate(() => document.body.innerText), 'Fast Upload', 'By checking this box');
        const m = t.match(/Size Matched\n(.+?) at (\d+) DPI/);
        return { olcu: m?.[1], dpi: m?.[2], dosyaDpi: t.match(/File DPI\n(\d+)/)?.[1], varyant: t.match(/Variant\n(.+)/)?.[1],
          fiyat: t.match(/Price\n\$([\d.,]+)/)?.[1], uyarilar: warnLines(t) };
      },
      async run(page, step, file, notes, hooks = {}) {
        await step('Upload', async () => {
          await page.locator('#gs-file-input').setInputFiles(file);
          await page.getByText('Upload Complete').waitFor({ timeout: 120000 });
        });
        await hooks.afterUpload?.();
        await step('Onay kutusu', async () => {
          await page.getByText(/you have full rights/i).first().click();
        });
        await step('Sepete ekle', async () => {
          await page.getByRole('button', { name: /^add to cart$/i }).filter({ visible: true }).first().click();
        });
      },
    },
    {
      id: 'dtf-transfers-by-size',
      title: 'DTF Transfers By Size (GS Studio)',
      url: `${BASE}/products/dtf-transfers-by-size`,
      expectProduct: 'DTF Transfers By Size',
      fileProp: '_Print Ready',
      accepts: /\.(png|jpe?g|webp|svg)$/i,
      async read(page) {
        const t = await shadowText(page);
        const card = between(t, 'Your images', 'Add more images') || t;
        // Genişlik/yükseklik inputlarda: değerleri shadow DOM'dan oku
        const vals = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.shadowRoot)
          .flatMap(e => [...e.shadowRoot.querySelectorAll('input')]).filter(i => i.offsetParent && /^[\d.]+$/.test(i.value)).map(i => i.value));
        return { olcu: vals.length >= 2 ? `${vals[0]}" × ${vals[1]}"` : null, dpi: card.match(/(\d+) DPI/)?.[1],
          fiyat: card.match(/\$([\d.]+) each/)?.[1], uyarilar: warnLines(card) };
      },
      async run(page, step, file, notes, hooks = {}) {
        await step('Upload', async () => {
          const input = page.locator('input[type=file]').first();
          // GS Studio'nun scriptleri yüklenemezse upload alanı yerine "Could not load Image to Sheet" yazıyor
          const loadErr = page.getByText(/Could not load Image to Sheet/i).first();
          await input.or(loadErr).first().waitFor({ state: 'attached', timeout: 60000 });
          if (await loadErr.count()) throw new Error('Upload alanı yüklenemedi: ' + (await loadErr.innerText()).slice(0, 160));
          await input.setInputFiles(file);
          // Fiyat hesaplanamazsa uygulama "Pricing is unavailable" ya da "Too many requests" (hız sınırı) gösteriyor
          // ve Add to cart kapanıyor. Hız sınırında uygulamanın kendi Retry butonuyla 2 kez tekrar dene.
          const priced = page.getByText(/\$[0-9.]+ each/).filter({ visible: true }).first();
          const noPrice = page.getByText(/Pricing is unavailable/i).filter({ visible: true }).first();
          const tooMany = page.getByText(/Too many requests/i).filter({ visible: true }).first();
          for (let attempt = 0; ; attempt++) {
            await priced.or(noPrice).or(tooMany).waitFor({ timeout: 120000 });
            if (await priced.isVisible()) break;
            const msg = (await tooMany.isVisible()) ? 'Too many requests (uygulamanın hız sınırı)' : 'Pricing is unavailable right now';
            if (attempt >= 2) throw new Error(`Uygulama "${msg}" dedi – fiyat hesaplanamadı, Add to cart kapalı`);
            notes.push(`Uygulama "${msg}" uyarısı verdi, 30 sn bekleyip Retry'a basıldı`);
            await page.waitForTimeout(30000);
            await page.getByRole('button', { name: /^retry$/i }).filter({ visible: true }).first().click().catch(() => {});
          }
        });
        await hooks.afterUpload?.();
        await step('Sepete ekle', async () => {
          await page.getByRole('button', { name: /add to cart/i }).filter({ visible: true }).first().click();
          // GS Studio sepeti doğrulayamazsa "Shopify did not return a cart that GS-STUDIO could verify" diyor
          const cartErr = page.getByText(/did not return a cart|Nothing new was added/i).filter({ visible: true }).first();
          await page.waitForURL(/\/cart/, { timeout: 15000 }).catch(() => {});
          if (await cartErr.isVisible()) throw new Error('Uygulama "Shopify did not return a cart that GS-STUDIO could verify. Nothing new was added." dedi – sepete eklenemedi');
        });
      },
    },
    {
      id: 'gang-sheet-builder',
      fixture: 'builder', // builder için özel test görseli (fixtures/builder/)
      title: 'Free DTF Gang Sheet Builder (Build a Gang Sheet)',
      url: `${BASE}/products/free-dtf-gang-sheet-builder`,
      expectProduct: 'Free DTF Gang Sheet Builder',
      fileProp: '_Print Ready File',
      accepts: /\.(png|jpe?g|webp|tiff?|psd|pdf|ai|eps|svg)$/i,
      async read(page) {
        const frame = page.frames().find(f => f.url().includes('dripappsserver.com/builder'));
        if (!frame) return { uyarilar: ['Builder açılmadı'] };
        const t = await frame.evaluate(() => document.body.innerText);
        const w = t.match(/\nWidth\n([\d.]+) in/), h = t.match(/\nHeight\n([\d.]+) in/);
        return { olcu: w && h && `${w[1]}" × ${h[1]}"`, dpi: t.match(/Resolution\n(\d+) dpi/)?.[1], varyant: t.match(/\n(\d+"x\d+")\n/)?.[1],
          uyarilar: warnLines(between(t, 'Drag & drop', 'Show Overlapping')) };
      },
      async run(page, step, file, notes, hooks = {}) {
        const fr = page.frameLocator('iframe[src*="dripappsserver.com/builder"]');
        await step('Builder açılıyor', async () => {
          await page.getByText('Build your own Gang Sheet', { exact: true }).first().click();
          await fr.getByText('Start a Brand New Gang Sheet').click({ timeout: 60000 });
        });
        await step('Upload', async () => {
          await fr.locator('input[type=file]').first().setInputFiles(file);
          await fr.getByText(fileLabel(file)).first().waitFor({ timeout: 90000 });
        });
        await step('Görseli sheet\'e yerleştir', async () => {
          // Yükleme arka planda sürerken tıklama işe yaramıyor: yerleşene kadar tekrar dene.
          // Her başarılı tıklama bir kopya daha eklediği için "en az 1 görsel" yeterli.
          const placed = fr.getByText(/^[1-9]\d* Images?$/).first();
          const deadline = Date.now() + 90000;
          await page.waitForTimeout(3000);
          while (!(await placed.isVisible())) {
            if (Date.now() > deadline) throw new Error('Görsel sheet\'e yerleştirilemedi');
            await fr.getByText(fileLabel(file)).first().click().catch(() => {});
            await page.waitForTimeout(6000);
          }
        });
        await hooks.afterUpload?.();
        if (await fr.getByText(/reporting Failed to Add to Cart/i).count()) {
          notes.push('Builder üst bandında "Shopify is reporting Failed to Add to Cart errors" uyarısı görünüyor.');
        }
        await step('Save & Add to Cart', async () => {
          await fr.getByRole('button', { name: 'Save & Add to Cart' }).click();
          await fr.getByText('Confirmation').waitFor({ timeout: 30000 });
          // Kalite kontrolü: her madde yeşil (geçti) ya da kırmızı (kaldı) ikonla gösteriliyor
          const checks = await fr.locator('div.flex.items-center.space-x-2.text-sm').evaluateAll(els => els.map(e =>
            ({ madde: e.innerText.trim(), gecti: !!e.querySelector('.text-green-500') })));
          await hooks.onQualityCheck?.(checks);
          const anyway = fr.getByText('Print Anyway');
          if (await anyway.isVisible()) await anyway.click();
          await fr.getByText(/you have full rights/i).click();
          await fr.getByRole('button', { name: /Add to Cart & Exit/i }).click();
        });
      },
    },
  ],
};
