# Site test agent – çalışma notları (Claude için)

Bu dosya her yeni oturumda okunur. Kullanıcıyla Türkçe konuş. Bütün saatler **Berlin saati** ile konuşulur.

## Ne yapıyor
15 Shopify sitesini gerçek tarayıcıyla (Playwright: Chrome, Firefox, Safari/WebKit) test eder, sonucu Make üzerinden
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
  (dripapps), Cloudlift upload (filepond), Everyday upload aracı (`ssMatrix`, beden/adet tablosu + baskı alanları, Avada en az adet kuralı),
  Everyday ürün taraması (`ssLayoutScan`), `pageCheck` (uygulaması test edilmeyen ürün: sadece sayfa açılıyor mu).
- `genel.js` genel kontrol: masaüstü menü hover, mobil hamburger, banner/slider, tüm ana sayfa linkleri (tek tek),
  boş koleksiyon (yönlendirmeyi takip eder), footer, sosyal medya, diğer siteler, chat, mobil taşma.
- `detay.js` her kontrol için rapor satırı (mail ve Excel aynı satırları kullanır). `report.js` mail HTML.
  `excel.js` Excel. `lib.js` tarayıcı oturumu, pop-up gizleme, oturum kaydı, teşhis. `saatlik.js` saatlik liste,
  `uyari.js` saatlik uyarı seviyesi ve durumu.
- `sites/*.js` 15 site (fastdtf* önce çalışır). `fixtures/` test görselleri. `matrix.js` dosya türü matrisi
  (ayrı araç, gece testinde yok; hâlâ paralel çalışıyor, sıralıya çevrilmeli).
- Yerel çalıştırma: `node run.js --mode full --sites <site> --only <akış-id,...>` (argümanlar boşlukla). Bu ortamda
  node `fetch` için `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` gerekir (yoksa "fetch failed").

## Kullanıcının onayladığı istisnalar (hata sayılmaz)
Rehber linki yeni sekmede açılıyor; materyal kartları koleksiyona gidiyor; Ask a question / Delivery & Return / Share
sadece bilgi; By Size düşük çözünürlük uyarısı vermiyor; Facebook = facebook.com/FastDTFPrint, Instagram = @fastdtftransfer.

## Bilinen açık bulgular (6 Kasım 2026)
DTF Nash "Custom DTF Transfers By Size": GS Studio sepete ekleyemiyor, `POST /cart/add.js → 422 Cannot find variant`
(3 tarayıcıda). DTF Nash sayfasında "Unexpected token '}'" JS hatası, YouTube @dtfnash 404. Gangsheet.com ana sayfa
"Blank Apparel" sekmesinde tema örnek kartları (/admin'e gidiyor). Everyday "Same Day" menüsü boş koleksiyon
(/collections/rush-orders). Kullanıcı ekibe iletti. 16 Kasım testinde hâlâ: DTF Nash, Everyday (Gangsheet bulgusu: site 19 Kasım'da testten çıkarıldı).
Eagle'daki "boş koleksiyon" (/collections/vendors?q=Eagle+DTF+Print) yanlış alarmdı, PR #18 ile düzeltildi.

## Saatlik kontrol (19 Kasım: kod hazır ve canlı denendi; Make senaryosu bekliyor)
- Liste `saatlik.js` (kullanıcının verdiği 40 URL, 9 site). gangsheet.com 19 Kasım'da kullanıcının isteğiyle testten tamamen çıkarıldı (haftalık ve saatlik).
- Listede ürünü olan sitede her saat: ana sayfa (süre) + **sıradaki tek upload ürünü** (saat no % ürün sayısı):
  yükle → Add to cart → sepet doğrulama + baskı dosyası linki → sepet sayfası → **checkout** (ödeme sayfası açılıyor,
  sipariş özeti görünüyor; bilgi girilmez). Builder ürünlerinde sonuna kadar (Save & Add to Cart) gidilir.
- Listede ürünü olmayan 6 sitede (alpha, dtfbank, dtfprinthouse, eagledtfsupply, fastdtfsupply, everyday): ana sayfa →
  normal ürün → Add to cart → sepet → checkout (arama yok).
- Saatlik testte olmayan: arama, linkler, menüler, footer, sosyal medya, mobil, Firefox/Safari, Everyday taraması.
- Hata → 2 dk sonra tekrar; ikisi de başarısızsa seviye (`uyari.js`): **ACİL** (ana sayfa/ürün sayfası, Add to cart,
  sepet, baskı dosyası linki, checkout), **Uyarı** (upload aracı: yükleme/builder; ana sayfa > 15 sn), bot koruması/429
  site hatası değil, 3 saat üst üste test edilemezse "Test edilemiyor". Sorun sürdükçe mail yok; düzelince "Düzeldi".
  Sorunlu ürün düzelene kadar her saat ayrıca denenir. Durum `results/state.json` (Actions cache); genel test dokunmaz.
- Make'e (webhook) sadece mail gidecekse gönderilir; payload'da `alertLevel` (acil/uyari/engel/duzeldi).
- Süre: 45 dk dolunca kalan siteler atlanır; iş 55 dk'da kesilir; saatlik turda sadece Chrome kurulur.
- `node run.js --mode hourly --plan` siteye bağlanmadan bu saatin planını yazar.
- Builder ürünlerinin hepsi aynı uygulama (Build a Gang Sheet, dripapps; buton `#gs-builder-btn`, metni mağazaya göre
  değişir). Mağazaya göre farklılıklar (hepsi `apps.js` builder'da): başlangıç ekranı olmadan doğrudan düzenleyici
  (Ohio, Custom Print AZ) → görsel "Auto Build" paneline düşer, Apply; Ohio'da ardından "Preview" → Continue;
  PressCheck kalite penceresi (DTF Nash, Eagle, Ohio) → "Add to Builder"; hak onayı metni farklı (Ohio: "By checking this box…").
- Ohio ve Arizona hazır sheet ürünleri **Cloudlift upload** (filepond, `_cl-upload[]`; sepette değeri link olan özellik
  aranır, `fileProp: '*'`). Ohio'da yükleme alanı sepet formunun dışında; çerez penceresi otomatik reddedilir (`lib.js`).
- DTF Print House'ta normal ürün otomatik bulunamıyordu (hepsi giyim/gang sheet): `core.products` sabit (tote, tişört).
  Saatlik testte uygun ürün yoksa Add to cart sessizce atlanmaz (Uyarı).
- Canlı denemeler (19 Kasım gündüz, kullanıcı onayıyla, mailsiz): 15 sitelik tam tur **30 dk** (4 hatalı akışın 2 dk
  bekleyip tekrarı dahil; hatasız tahmini 18–20 dk). Düzeltmelerden sonra Ohio, Custom Print AZ, DTF Nash, Eagle, Arizona,
  DTF Print House ürünleri ayrıca denendi: hepsi yükleme → sepet → baskı dosyası → checkout geçti.
- Deneme için `--only <ürün-id,...>`: saatlik modda sıraya bakmadan o ürünler test edilir (`sites` ile birlikte: mailsiz).
- Bu değişiklikle listedeki builder ve Cloudlift ürünleri haftalık genel testte de artık gerçekten test ediliyor
  (önce pageCheck). Legend'in eski adresi `dtf-transfer-custom-gang-sheet` açılmıyor → `glitter-dtf-transfer-custom-gang-sheet-upload`.
- Sıradaki: PR birleşince Make'te saatlik senaryo (10116955'in kopyası, `inputs.mode=hourly`). Make planı sınırı (ayda ~730 başlatma) ve upload
  uygulamalarının yükleme/depolama sınırları (saatte ~9 yükleme ≈ günde ~216, 24'ü builder kaydı) kullanıcıda.
- Genel test sırasında saatlik turlar sıraya girer (concurrency group), araya düşenler atlanır; sorun değil.

## Yanlış alarmları azaltma (16 Kasım, yapıldı)
- "Sorun" sadece gerçek hatalı cevap (404/410, 5xx, bağlantı yok, boş koleksiyon, reddedilen sepet isteği). Hız sınırı (429)
  ve güvenlik doğrulaması = "Kontrol edilemedi" (durum `yapilmadi`), sorun sayılmaz. Dış siteler (sosyal medya) otomatik
  erişimi engelliyorsa (999, 403, doğrulama) adres doğru sayılır. (`genel.js` linkResult)
- İkinci kontrol (`genel.js` ikinciKontrol): genel kontrolde "hata" çıkan her satır, test sonunda gerçek tarayıcıyla, ayrı
  oturumda, daha uzun beklemeyle tekrar denenir (link, koleksiyon, menü, mobil menü, slider, görsel). Çalışıyorsa "Not"
  (bilgi), aynıysa "ikinci kontrolde de doğrulandı". /admin linki ve mobil taşma tekrar denenmez (kesin sonuç).
- Kalıcı denemeler: `denemeler.js`. Çevrimdışı kısım her PR'da GitHub'da çalışır (`.github/workflows/denemeler.yml`).
  Canlı kısım (`--canli`, gerçek sitelere okuma istekleri) kod değişince PR açmadan önce elle çalıştırılır.
  **Her yeni yanlış alarm düzeltildiğinde buraya bir deneme eklenir**; gerçek sorunlar da kontrol olarak durur.
- Her haftalık rapordan sonra kullanıcı yazınca yeni bulgular incelenir; yanlış alarm → düzeltme + deneme.

## Diğer bekleyenler
Login testi (ayrı test Gmail hesabı + uygulama şifresi GitHub secret olarak; henüz yok). Carousel "View Options"
doğru ürünü açıyor mu. Uygulaması test edilmeyen ürünler (pageCheck). Depo herkese açık: Actions dakikaları ücretsiz
ama raporlar herkese görünür (gizliye alınırsa ayda 2.000 dk sınırı).
