# site-test-agent

E-ticaret sitelerimizin satış akışlarını gerçek bir tarayıcıyla (Playwright / Chrome) otomatik test eder.
Sonuçlar Make webhook'una gönderilir, Make Gmail ile maili atar.

## Ne test ediliyor?
- **Ana fonksiyonlar** (her site): ana sayfa → arama → ürün sayfası → Add to cart → sepet → Checkout butonu
- **Upload akışları** (upload ürünü olan siteler): test görseli yüklenir → fiyat/ölçü hesaplanır → sepete eklenir →
  sepette baskı dosyası linkinin oluştuğu ve açıldığı doğrulanır
- **Genel testte ayrıca:** ana sayfadaki tüm site içi linkler

Sipariş verilmez, ödeme yapılmaz. Hata gören akış otomatik olarak bir kez daha denenir.

## Zamanlama (GitHub Actions)
| Ne zaman | Tür | Mail |
|---|---|---|
| Her saat (:17) | `hourly` | Sadece yeni sorun (🚨 ACİL) veya düzelme (✅ Düzeldi) olursa |
| Pazartesi 06:07 UTC | `full` | Her zaman genel rapor |

Elle çalıştırmak için: **Actions → Site testleri → Run workflow**.
Sonuçlar ve hata ekran görüntüleri her turun sayfasında **Artifacts** altında 14 gün saklanır.

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
