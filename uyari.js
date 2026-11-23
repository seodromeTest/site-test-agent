// Saatlik test: uyarı seviyesi ve uyarı durumu (results/state.json, turlar arasında Actions cache ile taşınır).
// Siteye bağlanmadan denenebilsin diye ayrı dosya (denemeler.js).
//
// Seviyeler:
//   acil  – müşteri sipariş veremiyor: ana sayfa / ürün sayfası açılmıyor, Add to cart, sepet, baskı dosyası linki
//           ya da checkout çalışmıyor
//   uyari – site çalışıyor ama upload aracı (yükleme, builder) sorunlu ya da ana sayfa çok yavaş (> 15 sn)
//   engel – test sunucusu bot korumasına / Shopify hız sınırına takıldı: site hatası değil. Aynı kontrol 3 saat
//           üst üste test edilemezse "test edilemiyor" maili gider.
// Her kontrol iki kez denenir (run.js, 2 dk arayla); ikisi de başarısızsa sonuç burada değerlendirilir.
// Sorun sürdükçe her saat tekrar mail gitmez; düzelince "Düzeldi" maili gider.

const SLOW_MS = 15000;
const ENGEL_SAAT = 3;
// Upload aracının kendi adımları: burada takılırsa site çalışıyor ama araç sorunlu → uyarı
const APP_STEPS = new Set(['Builder açılıyor', 'Upload', "Görseli sheet'e yerleştir", 'Onay kutusu', 'Adet seçimi']);

function severity(f) {
  if (f.ok) return null;
  if (f.botBlock) return 'engel';
  const bad = f.steps.find(s => !s.ok);
  if (!bad) return 'acil';
  if (APP_STEPS.has(bad.name)) return 'uyari';
  // Normal test ürünü stokta değilse bu sitenin değil test ürününün sorunu
  if (bad.name === 'Ürün sayfası' && /stokta|uygun test ürünü/i.test(bad.error || '')) return 'uyari';
  // Süre doldu: son başarılı adım yükleme aşamasındaysa araç takıldı (uyarı), sepet aşamasındaysa acil
  const m = bad.name.match(/^Zaman aşımı \(son başarılı adım: (.+)\)$/);
  if (m) return m[1] === 'Sayfa açılıyor' || APP_STEPS.has(m[1]) ? 'uyari' : 'acil';
  return 'acil';
}

// sites: bu turun sonuçları, prev: önceki durum. Döner: yeni durum + mail için listeler.
function alertState(sites, prev, startedAt) {
  // Eski biçimdeki kayıtlar (seviyesiz) yok sayılır
  const old = Object.fromEntries(Object.entries(prev || {}).filter(([, v]) => v && v.level));
  const now = { ...old }; // bu tur test edilmeyen kontrollerin durumu aynen kalır (sırası gelince denenir)
  const newFailures = [], recovered = [], ongoing = [];
  for (const s of sites) for (const f of s.flows) {
    const key = `${s.domain}/${f.id}`, p = old[key], lvl = severity(f);
    const base = { site: s.domain, flow: f.title, ...(f.file ? { dosya: f.file } : {}) };
    const bad = f.steps.find(x => !x.ok);
    if (lvl === 'engel') {
      if (p && p.level !== 'engel') continue; // önceden gerçek sorun vardı; bu tur bilinmiyor, durum aynen kalır
      const count = (p?.count || 0) + 1;
      now[key] = { ...base, level: 'engel', since: p?.since || startedAt, count, alerted: !!p?.alerted || count >= ENGEL_SAAT };
      if (count >= ENGEL_SAAT && !p?.alerted) newFailures.push({ ...base, level: 'engel', since: now[key].since, count });
    } else if (lvl) {
      const fresh = !p || p.level === 'engel';
      const since = fresh ? startedAt : p.since;
      now[key] = { ...base, level: lvl, since, alerted: true };
      const item = { ...base, level: lvl, since, step: bad?.name, error: bad?.error };
      // Yeni sorun ya da uyarıdan acile yükselme → mail; aksi halde devam eden sorun (mail yok)
      if (fresh || (p.level === 'uyari' && lvl === 'acil')) newFailures.push(item); else ongoing.push(item);
    } else if (p) {
      delete now[key];
      if (p.level !== 'engel' || p.alerted) recovered.push({ ...base, level: p.level, since: p.since });
    }
    // Ana sayfa hızı (akış başarılıysa)
    if (f.ok && f.homepageMs != null) {
      const yk = `${s.domain}/yavas`, py = old[yk];
      if (f.homepageMs > SLOW_MS) {
        const flow = `Ana sayfa çok yavaş açılıyor (${(f.homepageMs / 1000).toFixed(1)} sn)`;
        now[yk] = { site: s.domain, flow, level: 'uyari', since: py?.since || startedAt, alerted: true };
        (py ? ongoing : newFailures).push({ site: s.domain, flow, level: 'uyari', since: now[yk].since });
      } else if (py) {
        delete now[yk];
        recovered.push({ site: s.domain, flow: `Ana sayfa hızı normale döndü (${(f.homepageMs / 1000).toFixed(1)} sn)`, level: 'uyari', since: py.since });
      }
    }
  }
  return { now, newFailures, recovered, ongoing };
}

module.exports = { severity, alertState, SLOW_MS, ENGEL_SAAT };
