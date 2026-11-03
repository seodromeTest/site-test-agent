// Upload uygulamaları: her biri, bir ürün sayfasında test akışını (run) ve matris için sonuç okuyucuyu (read) tanımlar.
// Site dosyaları ürünleri bu uygulamalarla eşler: product(handle, başlık, uygulama).
// Her akış: ürün sayfasını aç → test görselini yükle → sepete ekle (sepet doğrulaması run.js / matrix.js'de).
const path = require('path');

// Builder dosya adını kısaltarak gösteriyor: adın ilk kısmıyla eşleştir
const fileLabel = file => new RegExp(path.basename(file).slice(0, 10).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

// matrix.js için: uygulamanın yükleme sonrası gösterdiği metinden ölçü/varyant/fiyat/uyarıları çıkar
const between = (t, a, b) => { const i = t.indexOf(a); if (i < 0) return ''; const j = t.indexOf(b, i); return t.slice(i, j < 0 ? i + 1500 : j); };
const WARN = /\blow\b|low-res|resolution|warn|exceed|too (large|wide|big|small)|wider|background|upscale|error|fail|not supported|unsupported|invalid|reject|unavailable|could not/i;
const warnLines = t => [...new Set(t.split('\n').map(l => l.trim()).filter(l => l && l.length < 200 && WARN.test(l)))].slice(0, 6);
// GS Studio arayüzü shadow DOM içinde: görünen metni oradan topla
const shadowText = page => page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.shadowRoot)
  .map(e => [...e.shadowRoot.children].map(c => c.innerText || '').join('\n')).join('\n'));

// Upload Studio: hazır gang sheet yükleme, ölçüye göre sheet boyutunu kendisi seçer
const uploadStudio = () => ({
  appName: 'Upload Studio',
  fixture: 'gangsheet',
  fileProp: 'Print Ready',
  accepts: /\.(png|jpe?g|webp|tiff?|psd|pdf|ai|eps|svg)$/i,
  matrixFiles: /^gangsheet_/, // hazır gang sheet yükleme ürünü
  async read(page) {
    const t = between(await page.evaluate(() => document.body.innerText), 'YOUR FILES', 'Order note');
    const m = t.match(/W ([\d.]+)" x L ([\d.]+)" · ([\d.]+"x[\d.]+")/);
    const price = t.match(/1 × [\d.]+"x[\d.]+"\n\$([\d.,]+)/) || t.match(/whole-sheet cop\w*\n\$([\d.,]+)/);
    return { olcu: m && `${m[1]}" × ${m[2]}"`, dpi: t.match(/\n(\d+) DPI\n/)?.[1], varyant: m?.[3], fiyat: price?.[1], uyarilar: warnLines(t) };
  },
  async run(page, step, file, notes, hooks = {}) {
    await step('Upload', async () => {
      await page.locator('input.ump__input').setInputFiles(file);
      const failed = page.getByText(/Upload failed/i).first();
      await page.getByText(/ready ·/i).first().or(failed).waitFor({ timeout: hooks.uploadTimeout || 120000 });
      if (await failed.isVisible()) {
        const size = (await page.evaluate(() => document.body.innerText)).match(/MEASURED SIZE\n(W [\d.]+" x L [\d.]+")/)?.[1];
        throw new Error(`Uygulama "Upload failed" dedi${size ? ` (ölçülen: ${size}, sınır 22.5")` : ' (ölçü okunamadı)'}`);
      }
    });
    await hooks.afterUpload?.();
    await step('Sepete ekle', async () => {
      await page.getByRole('button', { name: /^add to cart$/i }).filter({ visible: true }).first().click();
    });
  },
});

// GS uploader (#gs-file-input): hazır gang sheet yükleme, ölçüye göre varyantı eşler
const gsUploader = () => ({
  appName: 'GS uploader',
  fixture: 'gangsheet',
  fileProp: 'Uploaded File',
  accepts: /\.(png|jpe?g|webp|psd|pdf|ai|eps|svg)$/i,
  matrixFiles: /^gangsheet_/, // hazır gang sheet yükleme ürünü
  async read(page) {
    const t = between(await page.evaluate(() => document.body.innerText), 'Fast Upload', 'By checking this box');
    const m = t.match(/Size Matched\n(.+?) at (\d+) DPI/);
    return { olcu: m?.[1], dpi: m?.[2], dosyaDpi: t.match(/File DPI\n(\d+)/)?.[1], varyant: t.match(/Variant\n(.+)/)?.[1],
      fiyat: t.match(/Price\n\$([\d.,]+)/)?.[1], uyarilar: warnLines(t) };
  },
  async run(page, step, file, notes, hooks = {}) {
    await step('Upload', async () => {
      await page.locator('#gs-file-input').setInputFiles(file);
      await page.getByText('Upload Complete').waitFor({ timeout: hooks.uploadTimeout || 120000 });
    });
    await hooks.afterUpload?.();
    await step('Onay kutusu', async () => {
      // Düşük DPI'lı dosyada "below our recommended DPI" onayı da isteniyor; işaretlenmezse sepete eklenmiyor
      const dpiAgree = page.locator('#gs-sd-dpi-agree-check');
      if (await dpiAgree.count() && await dpiAgree.locator('xpath=ancestor::label[1]').isVisible().catch(() => false)) {
        notes.push('Uygulama düşük DPI uyarısı verdi, onaylandı');
        hooks.onWarning?.('Düşük DPI onayı istendi');
        await dpiAgree.locator('xpath=ancestor::label[1]').click();
      }
      await page.getByText(/you have full rights/i).first().click();
    });
    await step('Sepete ekle', async () => {
      await page.getByRole('button', { name: /^add to cart$/i }).filter({ visible: true }).first().click();
    });
  },
});

// GS Studio (By Size): her görsel ayrı transfer, fiyat seçilen ölçüye göre.
// Basic ürünlerde aynı arayüz bir pencerede açılıyor ve kendi dosya alanını kullanıyor (input seçicisi).
const gsStudio = ({ input = 'input[type=file]' } = {}) => ({
  appName: 'GS Studio',
  fixture: 'genel',
  fileProp: '_Print Ready',
  accepts: /\.(png|jpe?g|webp|svg)$/i,
  matrixFiles: /^(tasarim|builder)_/, // tek tek tasarım: müşteri ve builder dosyaları
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
      const fileInput = page.locator(input).first();
      // GS Studio'nun scriptleri yüklenemezse upload alanı yerine "Could not load Image to Sheet" yazıyor
      const loadErr = page.getByText(/Could not load Image to Sheet/i).first();
      await fileInput.or(loadErr).first().waitFor({ state: 'attached', timeout: 60000 });
      if (await loadErr.count()) throw new Error('Upload alanı yüklenemedi: ' + (await loadErr.innerText()).slice(0, 160));
      await fileInput.setInputFiles(file);
      // Fiyat hesaplanamazsa uygulama "Pricing is unavailable" ya da "Too many requests" (hız sınırı) gösteriyor
      // ve Add to cart kapanıyor. Hız sınırında uygulamanın kendi Retry butonuyla 2 kez tekrar dene.
      const priced = page.getByText(/\$[0-9.]+ each/).filter({ visible: true }).first();
      const noPrice = page.getByText(/Pricing is unavailable/i).filter({ visible: true }).first();
      const tooMany = page.getByText(/Too many requests|server is busy/i).filter({ visible: true }).first();
      for (let attempt = 0; ; attempt++) {
        await priced.or(noPrice).or(tooMany).waitFor({ timeout: 120000 });
        if (await priced.isVisible()) break;
        const msg = (await tooMany.isVisible()) ? (await tooMany.innerText()).trim().slice(0, 80) : 'Pricing is unavailable right now';
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
});

// Build a Gang Sheet (dripapps builder): müşteri tasarımları sheet'e yerleştirip sepete ekler
const builder = () => ({
  appName: 'Build a Gang Sheet',
  fixture: 'builder', // builder için özel test görseli (fixtures/builder/)
  fileProp: '_Print Ready File',
  accepts: /\.(png|jpe?g|webp|psd|pdf|ai|eps|svg)$/i, // builder'ın desteklediği formatlarda TIFF yok
  matrixFiles: /^(tasarim|builder)_/, // tek tek tasarım: müşteri ve builder dosyaları
  async read(page) {
    const frame = page.frames().find(f => f.url().includes('dripappsserver.com/builder'));
    if (!frame) return { uyarilar: ['Builder açılmadı'] };
    const t = await frame.evaluate(() => document.body.innerText);
    const w = t.match(/\nWidth\n([\d.]+) in/), h = t.match(/\nHeight\n([\d.]+) in/);
    return { olcu: w && h && `${w[1]}" × ${h[1]}"`, dpi: t.match(/Resolution\n(\d+) dpi/)?.[1], varyant: t.match(/\n(\d+"x\d+")\n/)?.[1],
      fiyat: t.match(/Price:\s*\$([\d.,]+)/)?.[1],
      uyarilar: warnLines(between(t, 'Drag & drop', 'Show Overlapping')) };
  },
  async run(page, step, file, notes, hooks = {}) {
    const fr = page.frameLocator('iframe[src*="dripappsserver.com/builder"]');
    await step('Builder açılıyor', async () => {
      // Buton metni ürüne göre değişebilir; birebir metinle ara (regex ^…$ bu butonla eşleşmiyor)
      const btn = ['Build your own Gang Sheet', 'Build Gang Sheet', 'Create Gang Sheet', 'Start Building']
        .map(t => page.getByText(t, { exact: true })).reduce((a, b) => a.or(b));
      await btn.first().click();
      await fr.getByText('Start a Brand New Gang Sheet').click({ timeout: 60000 });
    });
    await step('Upload', async () => {
      await fr.locator('input[type=file]').first().setInputFiles(file);
      await fr.getByText(fileLabel(file)).first().waitFor({ timeout: hooks.uploadTimeout || 90000 });
    });
    await step('Görseli sheet\'e yerleştir', async () => {
      // Yükleme arka planda sürerken tıklama işe yaramıyor: yerleşene kadar tekrar dene.
      // Her başarılı tıklama bir kopya daha eklediği için "en az 1 görsel" yeterli.
      const placed = fr.getByText(/^[1-9]\d* Images?$/).first();
      const deadline = Date.now() + 90000;
      await page.waitForTimeout(3000);
      // Yarı saydam pikselli görsellerde "Transparent Warning" penceresi çıkıyor: uyarıyı not et, Continue ile devam et
      const transparentWarn = fr.getByText(/^(Transparent|Background) Warning$/);
      while (!(await placed.isVisible())) {
        if (Date.now() > deadline) throw new Error('Görsel sheet\'e yerleştirilemedi');
        if (await transparentWarn.isVisible()) {
          const title = (await transparentWarn.innerText()).trim();
          notes.push(`Builder "${title}" penceresi açtı (görselde ${/Background/.test(title) ? 'arka plan' : 'yarı saydam pikseller'} var)`);
          hooks.onWarning?.(title);
          await fr.getByRole('button', { name: /^continue$/i }).click().catch(() => {});
          await page.waitForTimeout(3000);
          continue;
        }
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
});

// Upload uygulaması henüz test edilmeyen ürünler: sadece sayfanın açıldığı ve doğru ürünün göründüğü kontrol edilir
const pageCheck = () => ({
  appName: 'sayfa kontrolü – uygulama henüz testte değil',
  noCart: true,
  accepts: /$^/,
  matrixFiles: /$^/,
  async run(page, step, file, notes) {
    await step('Ürün sayfası', async () => {
      const h1 = (await page.locator('h1').first().innerText({ timeout: 20000 }).catch(() => '')).trim();
      if (!h1) throw new Error('Sayfada ürün başlığı görünmüyor');
      notes.push(`Upload uygulaması henüz otomatik testte değil; sayfa açılıyor ("${h1.slice(0, 60)}")`);
    });
  },
});

// Bir ürün sayfasını bir uygulamayla eşle. id = ürün handle'ı, expectProduct = sepetteki ürün başlığı.
const product = (base, handle, title, app) => ({
  id: handle,
  title: `${title} (${app.appName})`,
  url: `${base}/products/${handle}`,
  expectProduct: title,
  ...app,
});

module.exports = { uploadStudio, gsUploader, gsStudio, builder, pageCheck, product };
