// Test sonucundan mail konusu ve HTML gövdesi üretir (Make bu metni olduğu gibi gönderir).
const { siteRows } = require('./detay');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sec = ms => `${(ms / 1000).toFixed(1)} sn`;
const fmtDate = iso => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
const shortTitle = t => t.split(' (')[0];

const C = { ok: '#1a7f37', bad: '#cf222e', warn: '#9a6700', muted: '#6e7781', line: '#d0d7de', soft: '#f6f8fa' };
const badge = ok => ok
  ? `<span style="color:${C.ok};font-weight:600">✅ Çalışıyor</span>`
  : `<span style="color:${C.bad};font-weight:600">❌ Sorun var</span>`;
const td = (html, extra = '') => `<td style="padding:8px 10px;border-bottom:1px solid ${C.line};vertical-align:top;${extra}">${html}</td>`;

function flowRow(f) {
  const failed = f.steps.find(s => !s.ok);
  const stepsTxt = f.steps.map(s => `${s.ok ? '✓' : '✗'} ${esc(s.name)}`).join(' → ');
  return `<tr>
    ${td(`<div style="font-weight:600">${esc(f.title)}</div>
      <div style="font-size:12px"><a href="${esc(f.url)}" style="color:#0969da">${esc(f.url.replace(/^https:\/\/(www\.)?/, ''))}</a></div>
      <div style="font-size:12px;color:${C.muted};margin-top:4px">${stepsTxt}</div>
      ${f.checkout ? `<div style="font-size:12px;color:${C.muted}">Checkout: ${esc(f.checkout)}</div>` : ''}
      ${failed ? `<div style="font-size:13px;color:${C.bad};margin-top:6px"><b>Takıldığı adım:</b> ${esc(failed.name)}<br><span style="font-size:12px">${esc(failed.error)}</span></div>` : ''}
      ${f.retried && f.ok ? `<div style="font-size:12px;color:${C.warn};margin-top:4px">↻ İlk denemede takıldı (${esc(f.firstAttempt?.step)}), ikinci denemede geçti</div>` : ''}
      ${f.notes?.length ? `<div style="font-size:12px;color:${C.warn};margin-top:4px">ℹ️ ${f.notes.map(esc).join('<br>ℹ️ ')}</div>` : ''}`)}
    ${td(badge(f.ok), 'white-space:nowrap')}
    ${td(f.cart ? `${esc(f.cart.variant)}<br>$${esc(f.cart.price)}` : '—', 'white-space:nowrap;font-size:13px')}
    ${td(sec(f.ms), 'white-space:nowrap;font-size:13px')}
  </tr>`;
}

function siteSummaryRow(s) {
  const core = s.flows.find(f => f.id === 'core') || s.flows.find(f => f.id === 'anasayfa');
  const uploads = s.flows.filter(f => !f.direct && f.id !== 'core' && f.id !== 'anasayfa');
  const upOk = uploads.filter(f => f.ok || f.botBlock).length;
  return `<tr>
    ${td(`<b>${esc(s.domain)}</b>`)}
    ${td(core ? (core.ok ? `<span style="color:${C.ok}">✅</span>` : `<span style="color:${C.bad}">❌ ${esc(core.steps.find(x => !x.ok)?.name)}</span>`) : '—')}
    ${td(uploads.length ? `<span style="color:${upOk === uploads.length ? C.ok : C.bad};font-weight:600">${upOk}/${uploads.length}</span>` : `<span style="color:${C.muted}">upload yok</span>`)}
    ${td(s.genel ? (n => `<span style="color:${n ? C.bad : C.ok}">${n ? n + ' sorun' : 'sorun yok'} / ${s.genel.filter(x => x.durum === 'ok' || x.durum === 'hata').length} kontrol</span>`)(s.genel.filter(x => x.durum === 'hata').length)
      : s.links ? `<span style="color:${s.links.ok ? C.ok : C.bad}">${s.links.broken.length} kırık / ${s.links.total}</span>` : '<span style="color:#6e7781">—</span>')}
    ${td((s.tarayicilar || []).length ? s.tarayicilar.map(t => {
        const bad = t.error ? 1 : (t.flows || []).filter(f => !f.ok && !f.botBlock).length;
        return `${esc(t.browser.replace(' (WebKit)', ''))} ${bad ? `<span style="color:${C.bad}">❌</span>` : `<span style="color:${C.ok}">✅</span>`}`;
      }).join('<br>') : '<span style="color:#6e7781">—</span>', 'white-space:nowrap')}
    ${td(core?.homepageMs ? sec(core.homepageMs) : s.skipped ? 'süre yetmedi' : '—', 'white-space:nowrap')}
    ${td((rows => { const n = rows.filter(r => r.durum === 'hata').length, k = rows.filter(r => r.durum === 'ok' || r.durum === 'hata').length;
        return `<span style="color:${n ? C.bad : C.ok};font-weight:600">${n ? n + ' sorun' : 'sorun yok'}</span> / ${k} kontrol`; })(siteRows(s)), 'white-space:nowrap')}
  </tr>`;
}

// Site site, yapılan her kontrol alt alta (mail iletildiğinde de okunabilsin diye sade, satır içi stil)
const ICON = { ok: '✓', hata: '✗', bilgi: 'ℹ', yapilmadi: '–' };
const COLOR = { ok: C.ok, hata: C.bad, bilgi: C.warn, yapilmadi: C.muted };
function siteDetail(s) {
  const all = siteRows(s);
  const linkRowsAll = all.filter(r => r.bolum === 'Ana sayfadaki linkler');
  const rows = all.filter(r => r.bolum !== 'Ana sayfadaki linkler');
  const bad = all.filter(r => r.durum === 'hata').length;
  const checks = all.filter(r => r.durum === 'ok' || r.durum === 'hata').length;
  let last = null, n = 0;
  const body = rows.map(r => {
    let head = '';
    if (r.bolum !== last) {
      last = r.bolum;
      const flow = s.flows.find(f => f.title === r.bolum);
      head = `<tr bgcolor="#f6f8fa"><td colspan="3"><b>${esc(r.bolum)}</b>${flow && flow.id !== 'core' && flow.id !== 'anasayfa' ? ` <a href="${esc(flow.url)}">${esc(flow.url.replace(/^https:\/\/(www\.)?/, ''))}</a>` : ''}</td></tr>`;
    }
    const num = r.durum === 'ok' || r.durum === 'hata' ? ++n : '';
    const adr = r.adres && !s.flows.some(f => f.title === r.bolum) ? `<br><small><font color="${C.muted}">${esc(r.adres.replace(/^https?:\/\/(www\.)?/, '').slice(0, 90))}</font></small>` : '';
    return `${head}<tr><td>${num}</td><td>${esc(r.kontrol)}${adr}</td><td><font color="${COLOR[r.durum]}">${ICON[r.durum]} ${esc(r.sonuc)}</font></td></tr>`;
  }).join('');
  // Linkler: her biri ayrı satır yerine tek hücrede alt alta (mail boyutu küçük kalsın)
  const linkBad = linkRowsAll.filter(r => r.durum === 'hata');
  const linkCell = linkRowsAll.length ? `<tr bgcolor="#f6f8fa"><td colspan="3"><b>Ana sayfadaki linkler</b> – ${linkRowsAll.length} link tek tek açıldı, ${linkBad.length ? `<font color="${C.bad}"><b>${linkBad.length} sorunlu</b></font>` : `<font color="${C.ok}">hepsi açılıyor</font>`}</td></tr>
    ${linkBad.map(r => `<tr><td>${++n}</td><td>${esc(r.kontrol)}<br><small>${esc(r.adres)}</small></td><td><font color="${C.bad}">✗ ${esc(r.sonuc)}</font></td></tr>`).join('')}
    <tr><td></td><td colspan="2"><small>${linkRowsAll.filter(r => r.durum !== 'hata').map(r => `<font color="${C.ok}">✓</font> ${esc(r.kontrol)} <font color="${C.muted}">${esc(r.adres.replace(/^https:\/\/[^/]+/, ''))}</font>`).join('<br>')}</small></td></tr>` : '';
  return `<h3 style="margin:28px 0 4px">${s.ok ? '✅' : '⚠️'} ${esc(s.name)} <font color="${C.muted}" style="font-weight:400;font-size:14px">– ${esc(s.domain)}</font></h3>
  <div style="font-size:13px;margin-bottom:6px">${checks} kontrol yapıldı · ${bad ? `<font color="${C.bad}"><b>${bad} sorun</b></font>` : `<font color="${C.ok}"><b>sorun yok</b></font>`}</div>
  <table border="1" cellpadding="5" cellspacing="0" width="100%" style="border-collapse:collapse;border-color:#d0d7de;font-size:13px">
    <tr align="left"><th width="28">#</th><th>Kontrol edilen</th><th>Sonuç</th></tr>
    ${body}${linkCell}
  </table>`;
}

function build(run) {
  const { newFailures, recovered, ongoing } = run.alert;
  const isFull = run.mode === 'full';
  const badSites = run.sites.filter(s => !s.ok);
  const byFlow = list => {
    const sites = [...new Set(list.map(x => x.site))];
    return sites.length === 1 ? `${sites[0]} – ${list.map(x => shortTitle(x.flow)).join(', ')}` : `${sites.length} sitede ${list.length} sorun`;
  };

  // Saatlik: ACİL (sipariş akışı bozuk) > Uyarı (upload aracı / yavaşlık) > test edilemiyor (bot koruması)
  const acil = newFailures.filter(x => x.level === 'acil' || !x.level);
  const uyari = newFailures.filter(x => x.level === 'uyari');
  const engel = newFailures.filter(x => x.level === 'engel');
  const level = isFull ? 'rapor' : acil.length ? 'acil' : uyari.length ? 'uyari' : engel.length ? 'engel' : recovered.length ? 'duzeldi' : 'ok';
  let subject;
  if (acil.length && !isFull) subject = `🚨 ACİL: ${byFlow(acil)} çalışmıyor`;
  else if (uyari.length && !isFull) subject = `⚠️ Uyarı: ${byFlow(uyari)}`;
  else if (engel.length && !isFull) subject = `⏸️ Test edilemiyor (${engel[0].count || 3} saattir): ${byFlow(engel)}`;
  else if (isFull) subject = badSites.length
    ? `⚠️ Genel site testi – ${run.sites.length} siteden ${badSites.length}'${badSites.length === 1 ? 'inde' : 'sinde'} sorun var`
    : `✅ Genel site testi – ${run.sites.length} sitede sorun yok`;
  else if (recovered.length) subject = `✅ Düzeldi: ${byFlow(recovered)}`;
  else subject = run.ok ? '✅ Saatlik kontrol – sorun yok' : `⚠️ Saatlik kontrol – devam eden sorun: ${byFlow(ongoing)}`;
  if (run.demo) subject = `[TEST – bilerek bozuldu] ${subject}`;

  const li = items => `<ul style="margin:6px 0 0 18px;padding:0">${items.join('')}</ul>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2328;max-width:780px">
  ${run.demo ? `<div style="background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-weight:600">🧪 Bu bir TEST uyarısıdır. Uyarı sistemini denemek için bir ürün bilerek var olmayan bir adrese yönlendirildi. Sitede gerçek bir sorun yok.</div>` : ''}
  ${acil.length ? `<div style="background:#ffebe9;border:1px solid #ff8182;border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:700;color:${C.bad}">🚨 ACİL – müşteri sipariş veremiyor olabilir</div>
    ${li(acil.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)}${x.dosya ? ` <span style="font-size:12px">(test dosyası: ${esc(x.dosya)})</span>` : ''}${x.step ? `<br><span style="font-size:12px">Takıldığı adım: ${esc(x.step)}${x.error ? ` – ${esc(x.error)}` : ''}</span>` : ''}</li>`))}
    <div style="font-size:12px;color:${C.muted};margin-top:8px">Test 2 dk arayla iki kez denedi, ikisinde de başarısız oldu. Hata ekran görüntüsü ekte. Sorun devam ettiği sürece tekrar mail gelmez; düzelince "Düzeldi" maili gelir.</div>
  </div>` : ''}
  ${uyari.length ? `<div style="background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:700;color:${C.warn}">⚠️ Uyarı – site çalışıyor, bir parçası sorunlu</div>
    ${li(uyari.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)}${x.dosya ? ` <span style="font-size:12px">(test dosyası: ${esc(x.dosya)})</span>` : ''}${x.step ? `<br><span style="font-size:12px">Takıldığı adım: ${esc(x.step)}${x.error ? ` – ${esc(x.error)}` : ''}</span>` : ''}</li>`))}
    <div style="font-size:12px;color:${C.muted};margin-top:8px">Upload aracı (yükleme / builder) çalışmıyor ya da ana sayfa çok yavaş. Sorun sürdükçe tekrar mail gelmez; düzelince "Düzeldi" maili gelir.</div>
  </div>` : ''}
  ${engel.length ? `<div style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:700">⏸️ Test edilemiyor</div>
    ${li(engel.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)} <span style="color:${C.muted};font-size:12px">(${esc(x.count)} saattir)</span></li>`))}
    <div style="font-size:12px;color:${C.muted};margin-top:8px">Test sunucusu (GitHub) birkaç saattir sitenin bot korumasına ya da Shopify hız sınırına takılıyor. Bu bir site hatası değil ama bu süre boyunca site kontrol edilemedi; elle bakılması önerilir.</div>
  </div>` : ''}
  ${recovered.length ? `<div style="background:#dafbe1;border:1px solid #4ac26b;border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:700;color:${C.ok}">✅ Düzelen sorunlar</div>
    ${li(recovered.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)}${x.level === 'engel' ? ' (yeniden test edilebiliyor)' : ''} <span style="color:${C.muted};font-size:12px">(sorun başlangıcı: ${fmtDate(x.since)})</span></li>`))}
  </div>` : ''}
  ${ongoing.length ? `<div style="background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:12px 16px;margin-bottom:16px">
    <b>Devam eden sorunlar:</b>
    ${li(ongoing.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)} <span style="color:${C.muted};font-size:12px">(${fmtDate(x.since)} tarihinden beri)</span></li>`))}
  </div>` : ''}

  <h2 style="margin:0 0 4px">${isFull ? 'Genel site testi' : 'Saatlik kontrol'}</h2>
  <div style="color:${C.muted};font-size:13px;margin-bottom:14px">${fmtDate(run.startedAt)} · ${run.sites.length} site · Süre: ${run.ms >= 3600000 ? `${Math.floor(run.ms / 3600000)} sa ${Math.round(run.ms % 3600000 / 60000)} dk` : run.ms >= 60000 ? `${Math.round(run.ms / 60000)} dk` : sec(run.ms)} · gerçek tarayıcı (${run.sites.some(x => x.tarayicilar?.length) ? 'Chrome, Firefox, Safari' : 'Chrome'})</div>

  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr style="background:${C.soft};text-align:left"><th style="padding:8px 10px">Site</th><th style="padding:8px 10px">Ana fonksiyonlar</th><th style="padding:8px 10px">Upload akışları</th><th style="padding:8px 10px">Genel kontroller</th><th style="padding:8px 10px">Firefox / Safari</th><th style="padding:8px 10px">Ana sayfa</th><th style="padding:8px 10px">Toplam (tüm kontroller)</th></tr>
    ${[...badSites, ...run.sites.filter(s => s.ok)].map(siteSummaryRow).join('')}
  </table>

  ${[...badSites, ...run.sites.filter(s => s.ok)].map(siteDetail).join('')}

  <p style="font-size:12px;color:${C.muted};margin-top:24px;border-top:1px solid ${C.line};padding-top:10px">
  ${isFull ? '<b>Ana fonksiyonlar:</b> ana sayfa, arama, ürün sayfası, Add to cart, sepet sayfası ve Checkout (ödeme sayfası açılıyor, sipariş özeti görünüyor).' : '<b>Saatlik kontrol:</b> her sitede ana sayfa; upload listesindeki sitelerde her saat sıradaki upload ürünü yüklenip sepete eklenir ve checkout açılır, diğer sitelerde normal bir ürünle Add to cart, sepet ve checkout denenir.'}
  <b>Upload akışları:</b> test görseli yüklenir, sepete eklenir, sepette dosya linkinin oluştuğu ve açıldığı doğrulanır.
  ${isFull ? '<b>Genel kontroller:</b> ana menü (masaüstünde alt menüler, telefonda hamburger menü), banner/slider, ana sayfadaki tüm linkler ve kartlar, koleksiyonların boş olup olmadığı, footer, sosyal medya, diğer sitelere linkler, canlı destek ve telefonda yana taşma. "Sorun" çıkan her satır rapora girmeden gerçek tarayıcıyla ikinci kez kontrol edilir: çalışıyorsa "Not" olur, sonuç aynıysa "ikinci kontrolde de doğrulandı" yazar. Hız sınırı ya da güvenlik doğrulaması yüzünden kontrol edilemeyenler "Kontrol edilemedi" olarak ayrı yazılır, sorun sayılmaz. ' : ''}
  Sipariş verilmez, ödeme yapılmaz. Hata gören test otomatik olarak bir kez daha denenir.</p>
</div>`;

  const shotFlow = (newFailures.length || isFull || run.demo)
    && run.sites.flatMap(s => s.flows.map(f => ({ ...f, domain: s.domain }))).find(f => !f.ok && f.screenshot);
  return {
    kind: newFailures.length ? 'alert' : recovered.length ? 'recovered' : isFull ? 'report' : 'ok',
    level, subject, html,
    sendEmail: isFull || newFailures.length > 0 || recovered.length > 0 || run.demo,
    // Ekran görüntüsü yoksa alanlar hiç gönderilmez: Make mail senaryosu (10051850) yolu "screenshot exist / notexist" ile seçiyor
    ...(shotFlow ? { screenshotName: `hata-${shotFlow.domain}-${shotFlow.id}.jpg`, screenshot: shotFlow.screenshot } : {}),
  };
}

module.exports = { build };
