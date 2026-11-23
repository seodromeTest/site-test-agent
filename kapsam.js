// Dosya türü kapsamı: saatlik testte her upload ürününe hangi dosya türü ne zaman yüklendi, sonuç ne oldu.
// Kayıt results/state.json içinde `_kapsam` anahtarında tutulur (uyarı durumuyla aynı Actions cache'i, ayrı dosya yok).
// Haftalık genel test bu kaydı okuyup mailde ve Excel'de "Dosya türleri" tablosu olarak gösterir.
//   _kapsam["<site>/<ürün id>"]["<uzantı>"] = { ok, t (ISO), adim?, hata?, engel? }
const SAATLIK = require('./saatlik');

const host = u => new URL(u).hostname.replace(/^www\./, '');
const urunId = u => new URL(u).pathname.split('/products/')[1].replace(/\/$/, '');
const ext = f => (f.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();

// Saatlik turun sonuçlarını kayda işle (sadece dosya yüklenen upload akışları)
function kaydet(kapsam, sites, startedAt) {
  for (const s of sites) for (const f of s.flows) {
    if (!f.file || f.id === 'anasayfa' || f.id === 'core') continue;
    const e = ext(f.file);
    if (!e) continue;
    const bad = f.steps.find(x => !x.ok);
    const k = `${s.domain.replace(/^www\./, '')}/${f.id}`;
    (kapsam[k] ||= {})[e] = f.ok ? { ok: true, t: startedAt }
      : { ok: false, t: startedAt, adim: bad?.name, hata: (bad?.error || '').slice(0, 160), ...(f.botBlock ? { engel: f.botBlock } : {}) };
  }
  return kapsam;
}

// Bir ürünün bir türdeki hücresi: ok | hata | engel | bekliyor (sırası henüz gelmedi) | bilinen (bilinen sorun, sırada yok) | yok (kabul etmiyor)
function hucre(kapsam, key, e, uygulama) {
  const kabul = SAATLIK.formatlar[key] || [];
  const bilinen = SAATLIK.BILINEN_SORUN[uygulama]?.[e];
  const r = kapsam[key]?.[e];
  if (!kabul.includes(e)) return bilinen ? { durum: 'bilinen', not: bilinen } : { durum: 'yok' };
  if (!r) return { durum: 'bekliyor' };
  if (r.ok) return { durum: 'ok', t: r.t };
  return { durum: r.engel ? 'engel' : 'hata', t: r.t, not: `${r.adim || ''}${r.hata ? ': ' + r.hata : ''}` };
}

// Tablo satırları: saatlik listedeki her ürün, sütunlar FORMAT_SIRASI
function tablo(kapsam = {}) {
  const fs = require('fs'), path = require('path');
  const sites = fs.readdirSync(path.join(__dirname, 'sites')).map(f => require(`./sites/${f}`));
  return SAATLIK.upload.map(u => {
    const site = sites.find(s => host(s.base) === host(u));
    const id = urunId(u), flow = site?.flows.find(f => f.id === id);
    const key = `${host(u)}/${id}`;
    return { site: host(u), urun: flow?.expectProduct || id, uygulama: flow?.appName || '', url: u,
      hucreler: Object.fromEntries(SAATLIK.FORMAT_SIRASI.map(e => [e, hucre(kapsam, key, e, flow?.appName)])) };
  });
}

function ozet(rows) {
  const say = d => rows.reduce((n, r) => n + Object.values(r.hucreler).filter(h => h.durum === d).length, 0);
  return { ok: say('ok'), hata: say('hata'), engel: say('engel'), bekliyor: say('bekliyor'), bilinen: say('bilinen') };
}

const ISARET = { ok: '✅', hata: '❌', engel: '⏸', bekliyor: '⏳', bilinen: '⚠️', yok: '–' };
const tarih = iso => iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// Genel test maili için HTML bölümü
function html(kapsam) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = tablo(kapsam), o = ozet(rows), F = SAATLIK.FORMAT_SIRASI;
  const cell = h => {
    const bg = { ok: '#dafbe1', hata: '#ffebe9', engel: '#f6f8fa', bilinen: '#fff8c5', bekliyor: '#ffffff', yok: '#f6f8fa' }[h.durum];
    const title = h.durum === 'ok' ? `Geçti · ${tarih(h.t)}` : h.not ? `${tarih(h.t)} ${h.not}`.trim() : '';
    return `<td align="center" bgcolor="${bg}" title="${esc(title)}">${ISARET[h.durum]}${h.durum === 'hata' ? `<br><small>${esc((h.not || '').split(':')[0])}</small>` : ''}</td>`;
  };
  let last = null;
  const body = rows.map(r => {
    const head = r.site !== last ? `<tr bgcolor="#f6f8fa"><td colspan="${F.length + 1}"><b>${esc(r.site)}</b></td></tr>` : '';
    last = r.site;
    return `${head}<tr><td>${esc(r.urun)}<br><small><font color="#6e7781">${esc(r.uygulama)}</font></small></td>${F.map(e => cell(r.hucreler[e])).join('')}</tr>`;
  }).join('');
  return `<h3 style="margin:28px 0 4px">📄 Dosya türleri – saatlik testte hangi ürüne hangi tür yüklendi</h3>
  <div style="font-size:13px;margin-bottom:6px">Her upload ürünü, kabul ettiğini söylediği türleri saatlik testte sırayla dener (her turda tek dosya, 300 DPI ya da vektör). Hücre: son denemenin sonucu.
  ✅ ${o.ok} geçti · ❌ ${o.hata} takıldı · ⏳ ${o.bekliyor} sırası henüz gelmedi · ⚠️ ${o.bilinen} bilinen sorun (sırada yok) · – ürün bu türü kabul etmiyor${o.engel ? ` · ⏸ ${o.engel} test edilemedi (bot koruması)` : ''}</div>
  <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;border-color:#d0d7de;font-size:12px">
    <tr bgcolor="#f6f8fa"><th align="left">Ürün</th>${F.map(e => `<th>${e.toUpperCase()}</th>`).join('')}</tr>
    ${body}
  </table>
  ${Object.entries(SAATLIK.BILINEN_SORUN).map(([app, m]) => Object.entries(m).map(([e, t]) => `<div style="font-size:12px;color:#9a6700;margin-top:4px">⚠️ ${esc(app)} – ${e.toUpperCase()}: ${esc(t)}</div>`).join('')).join('')}`;
}

// Genel test Excel'i için sayfa
function excelSayfasi(wb, kapsam) {
  const rows = tablo(kapsam), F = SAATLIK.FORMAT_SIRASI, o = ozet(rows);
  const ws = wb.addWorksheet('Dosya türleri');
  ws.addRow(['Dosya türleri – saatlik testte hangi ürüne hangi tür yüklendi']).font = { bold: true, size: 14 };
  ws.addRow([`✅ ${o.ok} geçti · ❌ ${o.hata} takıldı · ⏳ ${o.bekliyor} sırası henüz gelmedi · ⚠️ ${o.bilinen} bilinen sorun · – kabul etmiyor`]);
  ws.addRow([]);
  const h = ws.addRow(['Site', 'Ürün', 'Uygulama', ...F.map(e => e.toUpperCase()), 'Takılanlar']);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24292F' } }; });
  const FILL = { ok: 'FFDAFBE1', hata: 'FFFFEBE9', engel: 'FFF6F8FA', bilinen: 'FFFFF8C5', bekliyor: 'FFFFFFFF', yok: 'FFF6F8FA' };
  for (const r of rows) {
    const notlar = F.filter(e => ['hata', 'bilinen', 'engel'].includes(r.hucreler[e].durum)).map(e => `${e.toUpperCase()}: ${r.hucreler[e].not || ''}`).join('\n');
    const row = ws.addRow([r.site, { text: r.urun, hyperlink: r.url }, r.uygulama,
      ...F.map(e => `${ISARET[r.hucreler[e].durum]}${r.hucreler[e].t ? ' ' + tarih(r.hucreler[e].t) : ''}`), notlar]);
    F.forEach((e, i) => { row.getCell(4 + i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.hucreler[e].durum] } }; });
    row.alignment = { vertical: 'top', wrapText: true };
  }
  ws.columns = [{ width: 24 }, { width: 40 }, { width: 20 }, ...F.map(() => ({ width: 13 })), { width: 70 }];
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];
  return ws;
}

module.exports = { kaydet, tablo, ozet, hucre, html, excelSayfasi };
