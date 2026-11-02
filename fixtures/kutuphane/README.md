# Test dosyası kütüphanesi

Çoklu dosya türü ve auto-match testleri için. Saatlik testler bu klasörü kullanmaz
(onlar `fixtures/genel/` ve `fixtures/builder/` içindeki görselleri kullanır).

Dosya adı: `<grup>_<dpi>_<ölçü>_<özellik>.<uzantı>` — `dpiyok` = dosyada DPI bilgisi yok,
uygulama kendi varsayılanıyla yorumlar.

| Dosya | Piksel | DPI | Baskı ölçüsü | Ne test eder |
|---|---|---|---|---|
| gangsheet_22x48in_300dpi.png | 6600×14381 | 300 | 22.0"×47.9" | Hazır gang sheet, standart |
| gangsheet_22.5x56in_300dpi_sinirda.png | 6750×16800 | 300 | 22.5"×56.0" | Genişlik tam sınırda (max 22.5") |
| builder_72dpi_29.8in_genis.png | 2146×733 | 72 | 29.8"×10.2" | Sınırdan geniş dosya |
| builder_dpiyok_1663x946.png | 1663×946 | – | – | DPI'sız, şeffaf (%41) |
| builder_dpiyok_1774x887.png | 1774×887 | – | – | DPI'sız, şeffaf (%29) |
| builder_25dpi_dusuk.png | 1438×395 | 25 | 57.5"×15.8" | Çok düşük DPI |
| tasarim_dpiyok_1440x1440_seffaf.png | 1440×1440 | – | – | Şeffaf tasarım (%42) |
| tasarim_dpiyok_800x800_arkaplanli.png | 800×800 | – | – | Arka planlı, küçük |
| tasarim_dpiyok_1312x1199_seffaf.png | 1312×1199 | – | – | Şeffaf tasarım (%53) |
| tasarim_dpiyok_2979x2979_arkaplanli.png | 2979×2979 | – | – | Arka planlı, büyük |
| tasarim_dpiyok_2974x4461_arkaplanli.png | 2974×4461 | – | – | Arka planlı, en büyük dosya (20.8 MB) |
| tasarim_dpiyok_2689x4034_seffaf.png | 2689×4034 | – | – | Şeffaf, büyük (%85) |
| tasarim_dpiyok_2995x2976_seffaf.png | 2995×2976 | – | – | Şeffaf, büyük (%25) |
| tasarim_25dpi_626x625_dusuk.png | 626×625 | 25 | 25.0"×25.0" | Küçük ve çok düşük DPI |
| ozel_22.5x9in_300dpi_cmyk.tif | 6750×2700 | 300 | 22.5"×9.0" | TIFF, CMYK renk modu |
| ozel_22.5x10.2in_300dpi_cmyk.tif | 6750×3051 | 300 | 22.5"×10.2" | TIFF, CMYK renk modu |

Kaynak: firmanın Drive klasörü (`test upload/upload dosyalari`). PSD, AI, EPS dosyaları eklenecek.
