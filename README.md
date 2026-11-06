# site-test-agent

E-ticaret sitelerimizin satış akışlarını gerçek tarayıcılarla (Playwright: Chrome, Firefox, Safari) otomatik test eder.
Sonuçlar Make webhook'una gönderilir, Make Gmail ile maili atar.

## Ne test ediliyor?
- **Ana fonksiyonlar** (her site): ana sayfa → arama → ürün sayfası → Add to cart → sepet → Checkout butonu
- **Upload akışları** (upload ürünü olan siteler): test görseli yüklenir → fiyat/ölçü hesaplanır → sepete eklenir →
  sepette baskı dosyası linkinin oluştuğu ve açıldığı doğrulanır
- **Genel testte ayrıca:** menüler (masaüstü ve mobil), banner, ana sayfadaki tüm linkler, boş koleksiyonlar, footer,
  sosyal medya, diğer siteler, canlı destek; Firefox ve Safari ile ana akış + bir upload ürünü

Sipariş verilmez, ödeme yapılmaz. Hata gören akış otomatik olarak bir kez daha denenir.

## Zamanlama (Make → GitHub Actions)
Testi Make başlatır (GitHub'a `workflow_dispatch` isteği), test GitHub Actions'ta çalışır, mail yine Make'ten gider.
Saatler Berlin saatidir.

| Ne zaman | Tür | Make senaryosu | Mail |
|---|---|---|---|
| Her pazartesi 05:30 | `full` (genel test, ~3 saat) | "Site testi – Haftalık genel test" | Her zaman, Excel ekli |
| İstendiğinde | `full` | "Site testi – GitHub'da genel testi başlat (elle)" | Her zaman |
| Saatlik | `hourly` | henüz kurulmadı | Sadece yeni sorun (ACİL) veya düzelme |

Elle çalıştırmak için: Make'teki "(elle)" senaryosu ya da GitHub'da **Actions → Site testleri → Run workflow**.
`sites` girilirse (tek site denemesi) mail gönderilmez.
Sonuçlar ve hata ekran görüntüleri her turun sayfasında **Artifacts** altında 14 gün saklanır.
Make'in kullandığı GitHub token'ı 3 Şubat 2027'de sona erer; yenilenmezse zamanlanmış testler başlamaz.

## Ayarlar
- **Secret `MAKE_WEBHOOK_URL`**: Settings → Secrets and variables → Actions. Webhook adresi asla koda yazılmaz.
- **Siteler:** `sites/<site>.js` – her sitenin ana fonksiyon ayarı (`core`) ve upload akışları (`flows`).
  Yeni site eklemek için bu klasöre bir dosya ekleyip `run.js`'deki varsayılan `--sites` listesine yazın.
- **Test görselleri:** `fixtures/genel/` (upload ürünleri) ve `fixtures/builder/` (Gang Sheet Builder).
  Bir klasörde birden fazla görsel varsa her turda sıradaki kullanılır; klasör boşsa `fixtures/test-design.png` kullanılır.

## Yerelde / sunucuda çalıştırma
```bash
npm ci && npx playwright install --with-deps chromium
node run.js --mode hourly                      # mail göndermeden
WEBHOOK_URL=... node run.js --mode full        # Make'e gönder
node run.js --sites fastdtftransfer --only dtf-transfers-by-size   # tek akış
```
Docker ile: bkz. `Dockerfile`.
