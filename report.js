// Test sonucundan mail konusu ve HTML gövdesi üretir (Make bu metni olduğu gibi gönderir).
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
  const core = s.flows.find(f => f.id === 'core');
  const uploads = s.flows.filter(f => f.id !== 'core');
  const upOk = uploads.filter(f => f.ok).length;
  return `<tr>
    ${td(`<b>${esc(s.domain)}</b>`)}
    ${td(core ? (core.ok ? `<span style="color:${C.ok}">✅</span>` : `<span style="color:${C.bad}">❌ ${esc(core.steps.find(x => !x.ok)?.name)}</span>`) : '—')}
    ${td(uploads.length ? `<span style="color:${upOk === uploads.length ? C.ok : C.bad};font-weight:600">${upOk}/${uploads.length}</span>` : `<span style="color:${C.muted}">upload yok</span>`)}
    ${td(s.links ? `<span style="color:${s.links.ok ? C.ok : C.bad}">${s.links.broken.length} kırık / ${s.links.total}</span>` : '<span style="color:#6e7781">—</span>')}
    ${td(core?.homepageMs ? sec(core.homepageMs) : '—', 'white-space:nowrap')}
  </tr>`;
}

function siteDetail(s) {
  const links = s.links;
  return `<h3 style="margin:24px 0 6px">${s.ok ? '✅' : '⚠️'} ${esc(s.name)} <span style="font-weight:400;color:${C.muted};font-size:14px">– ${esc(s.domain)}</span></h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr style="background:${C.soft};text-align:left"><th style="padding:8px 10px">Test / adımlar</th><th style="padding:8px 10px">Durum</th><th style="padding:8px 10px">Sepette</th><th style="padding:8px 10px">Süre</th></tr>
    ${s.flows.map(flowRow).join('')}
  </table>
  ${links ? `<div style="font-size:13px;margin-top:8px"><b>Site içi linkler:</b> ${links.total} link kontrol edildi, ${links.broken.length ? `<span style="color:${C.bad}">${links.broken.length} kırık</span>` : `<span style="color:${C.ok}">kırık link yok</span>`}${links.error ? ` (${esc(links.error)})` : ''}
    ${links.broken.length ? `<ul style="margin:4px 0 0 18px;padding:0">${links.broken.map(b => `<li><span style="color:${C.bad}">${esc(b.status)}</span> – ${esc(b.url)}</li>`).join('')}</ul>` : ''}</div>` : ''}`;
}

function build(run) {
  const { newFailures, recovered, ongoing } = run.alert;
  const isFull = run.mode === 'full';
  const badSites = run.sites.filter(s => !s.ok);
  const byFlow = list => {
    const sites = [...new Set(list.map(x => x.site))];
    return sites.length === 1 ? `${sites[0]} – ${list.map(x => shortTitle(x.flow)).join(', ')}` : `${sites.length} sitede ${list.length} sorun`;
  };

  let subject;
  if (newFailures.length) subject = `🚨 ACİL: ${byFlow(newFailures)} çalışmıyor`;
  else if (isFull) subject = badSites.length
    ? `⚠️ Genel site testi – ${run.sites.length} siteden ${badSites.length}'${badSites.length === 1 ? 'inde' : 'sinde'} sorun var`
    : `✅ Genel site testi – ${run.sites.length} sitede sorun yok`;
  else if (recovered.length) subject = `✅ Düzeldi: ${byFlow(recovered)}`;
  else subject = run.ok ? '✅ Saatlik kontrol – sorun yok' : `⚠️ Saatlik kontrol – devam eden sorun: ${byFlow(ongoing)}`;
  if (run.demo) subject = `[TEST – bilerek bozuldu] ${subject}`;

  const li = items => `<ul style="margin:6px 0 0 18px;padding:0">${items.join('')}</ul>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2328;max-width:780px">
  ${run.demo ? `<div style="background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-weight:600">🧪 Bu bir TEST uyarısıdır. Uyarı sistemini denemek için bir ürün bilerek var olmayan bir adrese yönlendirildi. Sitede gerçek bir sorun yok.</div>` : ''}
  ${newFailures.length ? `<div style="background:#ffebe9;border:1px solid #ff8182;border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:700;color:${C.bad}">🚨 Yeni sorun tespit edildi</div>
    ${li(newFailures.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)}</li>`))}
    <div style="font-size:12px;color:${C.muted};margin-top:8px">Test iki kez denedi, ikisinde de başarısız oldu. Hata ekran görüntüsü ekte. Sorun devam ettiği sürece tekrar mail gelmez; düzelince "Düzeldi" maili gelir.</div>
  </div>` : ''}
  ${recovered.length ? `<div style="background:#dafbe1;border:1px solid #4ac26b;border-radius:8px;padding:14px 16px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:700;color:${C.ok}">✅ Düzelen sorunlar</div>
    ${li(recovered.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)} <span style="color:${C.muted};font-size:12px">(sorun başlangıcı: ${fmtDate(x.since)})</span></li>`))}
  </div>` : ''}
  ${ongoing.length ? `<div style="background:#fff8c5;border:1px solid #d4a72c;border-radius:8px;padding:12px 16px;margin-bottom:16px">
    <b>Devam eden sorunlar:</b>
    ${li(ongoing.map(x => `<li><b>${esc(x.site)}</b> – ${esc(x.flow)} <span style="color:${C.muted};font-size:12px">(${fmtDate(x.since)} tarihinden beri)</span></li>`))}
  </div>` : ''}

  <h2 style="margin:0 0 4px">${isFull ? 'Genel site testi' : 'Saatlik kontrol'}</h2>
  <div style="color:${C.muted};font-size:13px;margin-bottom:14px">${fmtDate(run.startedAt)} · ${run.sites.length} site · Süre: ${sec(run.ms)} · gerçek tarayıcı (Chrome)</div>

  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr style="background:${C.soft};text-align:left"><th style="padding:8px 10px">Site</th><th style="padding:8px 10px">Ana fonksiyonlar</th><th style="padding:8px 10px">Upload akışları</th><th style="padding:8px 10px">Linkler</th><th style="padding:8px 10px">Ana sayfa</th></tr>
    ${[...badSites, ...run.sites.filter(s => s.ok)].map(siteSummaryRow).join('')}
  </table>

  ${[...badSites, ...run.sites.filter(s => s.ok)].map(siteDetail).join('')}

  <p style="font-size:12px;color:${C.muted};margin-top:24px;border-top:1px solid ${C.line};padding-top:10px">
  <b>Ana fonksiyonlar:</b> ana sayfa, arama, ürün sayfası, Add to cart, sepet sayfası ve Checkout butonu.
  <b>Upload akışları:</b> test görseli yüklenir, sepete eklenir, sepette dosya linkinin oluştuğu ve açıldığı doğrulanır.
  ${isFull ? '<b>Linkler:</b> ana sayfadaki tüm site içi linkler tek tek açılır. ' : ''}
  Sipariş verilmez, ödeme yapılmaz. Hata gören test otomatik olarak bir kez daha denenir.</p>
</div>`;

  const shotFlow = (newFailures.length || isFull || run.demo)
    && run.sites.flatMap(s => s.flows.map(f => ({ ...f, domain: s.domain }))).find(f => !f.ok && f.screenshot);
  return {
    kind: newFailures.length ? 'alert' : recovered.length ? 'recovered' : isFull ? 'report' : 'ok',
    subject, html,
    sendEmail: isFull || newFailures.length > 0 || recovered.length > 0 || run.demo,
    screenshotName: shotFlow ? `hata-${shotFlow.domain}-${shotFlow.id}.jpg` : '',
    screenshot: shotFlow ? shotFlow.screenshot : '',
  };
}

module.exports = { build };
