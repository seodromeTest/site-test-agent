# Site test agent – çalışma notları (Claude için)

Bu dosya her yeni oturumda okunur. Kullanıcıyla Türkçe konuş. Bütün saatler **Berlin saati** ile konuşulur.

## Ne yapıyor
16 Shopify sitesini gerçek tarayıcıyla (Playwright: Chrome, Firefox, Safari/WebKit) test eder, sonucu Make üzerinden
seodrome@gmail.com'a mail atar (HTML tablo + Excel eki). Sipariş verilmez, ödeme yapılmaz.

## Zincir
1. **Make** testi başlatır: HTTP isteği ile GitHub `workflow_dispatch` (workflow id 404380259, ref `main`).
   Make bağlantısı "GitHub site-test" (id 14720969, API key = `Bearer <fine-grained token>`, sadece api.github.com).
   Token: GitHub'da `make-site-test`, sadece bu repo, Actions: Read and write. **3 Şubat 2027'de sona eriyor** (yenile).
2. **GitHub Actions** (`.github/workflows/site-tests.yml`) testi çalıştırır: `node run.js --mode full|hourly`.
   Süre sınırı 355 dk. Sonuçlar Artifacts'te 14 gün (`sonuclar-<mod>-<run id>`: Excel, HTML, JSON, hata ekran görüntüleri).
3. Test bitince sonuç **Make webhook**'una gider (secret `MAKE_WEBHOOK_URL`), Make senaryosu 10051850
   "Site Test Agent – Rapor ve Acil Uyarı" Gmail ile maili atar (Excel ekli rota dahil).

Make senaryoları (team 1840541, saat dilimi Berlin):
- 10116955 "Site testi – Haftalık genel test": **her pazartesi 05:30 Berlin**, mode=full. Aktif.
- 10109223 "Site testi – GitHub'da genel testi başlat (elle)": on-demand, istenince hemen genel test.
- 10051850 mail senaryosu. 10044058 eski Make-only link testi: kapalı, kullanılmıyor.
- Saatlik kontrol için Make senaryosu henüz YOK (aşağıya bak).

## Kurallar (kullanıcının koyduğu)
- Kullanıcının onayı olmadan test başlatma. Gün içinde (yük/bot koruması) test yapılmaz; tam testler gece/haftalık.
  Tek site denemeleri `inputs.sites` ile yapılır: o zaman `NO_MAIL` açılır, mail gitmez.
- Şifre/anahtar sohbete yazılmaz; GitHub secrets veya Make bağlantısı kullanılır.
- **Bir oturumun (tarayıcı context'i) içinde asenkron/paralel işlem yok.** Adımlar kesinlikle sıralı; her adım
  sayfanın başlattığı veri istekleri (fetch/xhr/document) bitene kadar bekler (`log.settle`). Paralellik sadece farklı
  oturumları aynı anda simüle etmek için kullanılabilir. Hata tespiti oturum kaydı (konsol + ağ) üzerinden, hatanın
  oluştuğu adıma yazılarak yapılır (`lib.js` sessionLog/diagnose, `run.js` step).
- Ekran görüntüsü sadece hata olursa alınır.
- Merge/PR: değişiklikler `kurulum` dalında yapılır, PR açılır, **kullanıcı birleştirir** (otomatik merge engelli).
- Commit/PR metinlerinde model adı yazılmaz.

## Dosyalar
- `run.js` ana akış: core (ana sayfa→arama→ürün→sepete ekle→sepet→checkout butonu) + upload akışları, tekrar deneme,
  genel kontrol, Firefox/Safari, rapor, Excel, webhook. Yavaşlatma (bot/hız sınırı için): sepete ekleyen akışlar arası
  20–30 sn, siteler arası 60 sn (`NO_PACE=1` ile kapatılır). Süre güvenliği: 300 dk dolunca genel kontrol ve tarayıcı
  testleri atlanır, rapor yine gider. Bot koruması (`botBlock: 'challenge'`) ve Shopify hız sınırı (`'ratelimit'`, 429)
  "test edilemedi" sayılır, site hatası sayılmaz.
- `apps.js` upload uygulamaları: Upload Studio, GS uploader, GS Studio (i2s, PressCheck), Build a Gang Sheet
  (dripapps), Everyday upload aracı (`ssMatrix`, beden/adet tablosu + baskı alanları, Avada en az adet kuralı),
  Everyday ürün taraması (`ssLayoutScan`), `pageCheck` (uygulaması test edilmeyen ürün: sadece sayfa açılıyor mu).
- `genel.js` genel kontrol: masaüstü menü hover, mobil hamburger, banner/slider, tüm ana sayfa linkleri (tek tek),
  boş koleksiyon (yönlendirmeyi takip eder), footer, sosyal medya, diğer siteler, chat, mobil taşma.
- `detay.js` her kontrol için rapor satırı (mail ve Excel aynı satırları kullanır). `report.js` mail HTML.
  `excel.js` Excel. `lib.js` tarayıcı oturumu, pop-up gizleme, oturum kaydı, teşhis.
- `sites/*.js` 16 site (fastdtf* önce çalışır). `fixtures/` test görselleri. `matrix.js` dosya türü matrisi
  (ayrı araç, gece testinde yok; hâlâ paralel çalışıyor, sıralıya çevrilmeli).
- Yerel çalıştırma: `node run.js --mode full --sites <site> --only <akış-id,...>` (argümanlar boşlukla). Bu
  ortamda node `fetch` dışarı çıkamıyor; "Baskı dosyası erişilebilir" adımı yerelde hep "fetch failed" verir, GitHub'da çalışır.

## Kullanıcının onayladığı istisnalar (hata sayılmaz)
Rehber linki yeni sekmede açılıyor; materyal kartları koleksiyona gidiyor; Ask a question / Delivery & Return / Share
sadece bilgi; By Size düşük çözünürlük uyarısı vermiyor; Facebook = facebook.com/FastDTFPrint, Instagram = @fastdtftransfer.

## Bilinen açık bulgular (6 Kasım 2026)
DTF Nash "Custom DTF Transfers By Size": GS Studio sepete ekleyemiyor, `POST /cart/add.js → 422 Cannot find variant`
(3 tarayıcıda). DTF Nash sayfasında "Unexpected token '}'" JS hatası, YouTube @dtfnash 404. Gangsheet.com ana sayfa
"Blank Apparel" sekmesinde tema örnek kartları (/admin'e gidiyor). Everyday "Same Day" menüsü boş koleksiyon
(/collections/rush-orders). Kullanıcı ekibe iletti.

## Sıradaki iş: saatlik kontrol (onaylanan plan)
- Her saat, her sitede: ana sayfa (süre ölçümü) + core akış + **sırayla değişen tek bir upload ürünü** (her saat
  bir sonraki ürün; tüm ürünler gün içinde birkaç kez test edilir, siteye yük saatte ~1 yükleme).
- Saatlik testte olmayacak: linkler, menüler, footer, sosyal medya, mobil, Firefox/Safari, Everyday taraması.
- Hata olursa 2 dk bekleyip tekrar dene; iki deneme de başarısızsa "ACİL" mail, düzelince "Düzeldi"; sorun sürdükçe
  her saat tekrar mail yok (durum `results/state.json`, Actions cache ile taşınıyor).
- Make kullanımı: saatlik test webhook'u **sadece mail gidecekse** göndermeli (şu an her turda gönderiyor).
  Saatlik başlatma senaryosu ayda ~730 Make işlemi; kullanıcı Make planının sınırını kontrol edecek.
- Genel test sırasında saatlik turlar sıraya girer (concurrency group), araya düşenler atlanır; sorun değil.
- Upload uygulamalarının yükleme/depolama sınırları kullanıcıya soruldu (saatte ~16 yükleme ≈ günde ~380 dosya).
- Gündüz deneme yok: kod hazırlanır, gece tek tur denenir, sonra Make'te saatlik senaryo kurulur
  (10116955'in kopyası, `inputs.mode=hourly`).

## Diğer bekleyenler
Login testi (ayrı test Gmail hesabı + uygulama şifresi GitHub secret olarak; henüz yok). Carousel "View Options"
doğru ürünü açıyor mu. Uygulaması test edilmeyen ürünler (pageCheck). Depo herkese açık: Actions dakikaları ücretsiz
ama raporlar herkese görünür (gizliye alınırsa ayda 2.000 dk sınırı).
