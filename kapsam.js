// Dosya türü kapsamı: saatlik testte her upload ürününe hangi dosya türü ne zaman yüklendi, sonuç ne oldu.
// Kayıt results/state.json içinde `_kapsam` anahtarında tutulur (uyarı durumuyla aynı Actions cache'i, ayrı dosya yok).
// Haftalık genel test bu kaydı okuyup mailde ve Excel'de "Dosya türleri" tablosu olarak gösterir.
//   _kapsam["<site>/<ürün id>"]["<uzantı>"] = { ok, t (ISO), adim?, hata?, engel? }
//   _kapsam._turlar = [{ basla, durum: 'basladi'|'tamamlandi', bitis?, dk?, atlanan?, tekrar?, takilan? }] – test aşaması: her saatlik
//   turun kendi durumu (süre aşımıyla kesilen, site atlanan, ikinci denemede geçen) çapraz kontrol Excel'inde raporlanır.
//   _kapsam._tur = { basla (ISO), mail? (ISO) } – çapraz kontrol turu: her ürün × tür en az bir kez denenince
//   (basla'dan sonra) sadece hatalı kombinasyonların Excel'i bir kez mail olarak gider (kullanıcı isteği, 23 Kasım).
const SAATLIK = require('./saatlik');

const host = u => new URL(u).hostname.replace(/^www\./, '');
const urunId = u => new URL(u).pathname.split('/products/')[1].replace(/\/$/, '');
const ext = f => (f.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();

// Saatlik turun sonuçlarını kayda işle (sadece dosya yüklenen upload akışları)
function kaydet(kapsam, sites, startedAt) {
  kapsam._tur ||= { basla: startedAt };
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

// Saatlik turun başı ve sonu (test aşaması raporu için)
function turBasladi(kapsam, basla) {
  (kapsam._turlar ||= []).push({ basla, durum: 'basladi' });
  if (kapsam._turlar.length > 400) kapsam._turlar.splice(0, kapsam._turlar.length - 400);
}
function turBitti(kapsam, basla, sites, ms) {
  const t = (kapsam._turlar ||= []).find(x => x.basla === basla) || (kapsam._turlar.push({ basla }), kapsam._turlar.at(-1));
  const tekrar = [], takilan = [];
  for (const s of sites) for (const f of s.flows) {
    if (f.retried) tekrar.push({ site: s.domain, urun: f.title, dosya: f.file || '', ilk: `${f.firstAttempt?.step || ''}: ${(f.firstAttempt?.error || '').slice(0, 120)}${f.firstAttempt?.botBlock ? ` [${f.firstAttempt.botBlock}]` : ''}`, sonuc: f.ok ? 'ikinci denemede geçti' : 'ikinci denemede de takıldı' });
    if (!f.ok) takilan.push(`${s.domain} – ${f.title}${f.file ? ` (${f.file})` : ''}`);
  }
  Object.assign(t, { durum: 'tamamlandi', bitis: new Date().toISOString(), dk: +(ms / 60000).toFixed(1),
    atlanan: sites.filter(x => x.skipped).map(x => x.domain), tekrar, takilan });
}

// Turların özeti: tamamlanan, yarıda kesilen (başladı ama bitmedi), hiç başlamayan (beklenen saat başında kayıt yok)
function turRaporu(kapsam, simdi = new Date().toISOString()) {
  const basla = kapsam._tur?.basla || '0';
  const turlar = (kapsam._turlar || []).filter(t => t.basla >= basla).sort((a, b) => a.basla.localeCompare(b.basla));
  const satirlar = turlar.map((t, i) => ({ ...t, durumYazi: t.durum === 'tamamlandi'
    ? (t.atlanan?.length ? `Tamamlandı ama ${t.atlanan.length} site süre yetmediği için atlandı` : 'Tamamlandı')
    : (i === turlar.length - 1 && Date.parse(simdi) - Date.parse(t.basla) < 60 * 60000 ? 'Sürüyor' : 'Yarıda kesildi (55 dk süre sınırı ya da iptal)') }));
  // Beklenen ama hiç başlamayan saatler (pazartesi 05–09 saatlik test yok)
  const baslamayan = [];
  for (let i = 1; i < turlar.length; i++) {
    for (let t = Date.parse(turlar[i - 1].basla) + 60 * 60000; t < Date.parse(turlar[i].basla) - 30 * 60000; t += 60 * 60000) {
      const d = new Date(t), gun = d.toLocaleDateString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' });
      const saat = +d.toLocaleString('en-US', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false });
      if (!(gun === 'Mon' && saat >= 5 && saat < 9)) baslamayan.push(new Date(t).toISOString());
    }
  }
  const say = f => satirlar.filter(f).length;
  return { satirlar, baslamayan,
    ozet: { toplam: satirlar.length, tamam: say(t => t.durum === 'tamamlandi' && !t.atlanan?.length), atlanan: say(t => t.atlanan?.length),
      kesilen: say(t => /Yarıda/.test(t.durumYazi)), baslamayan: baslamayan.length,
      tekrar: satirlar.reduce((n, t) => n + (t.tekrar?.length || 0), 0),
      ortDk: (() => { const d = satirlar.filter(t => t.dk); return d.length ? +(d.reduce((n, t) => n + t.dk, 0) / d.length).toFixed(1) : 0; })(),
      enUzunDk: Math.max(0, ...satirlar.map(t => t.dk || 0)) } };
}

// Çapraz kontrol turu bitti mi: saatlik listedeki her ürünün sırada olan her türü, tur başladıktan sonra en az bir kez denendi
function eksikler(kapsam) {
  const basla = kapsam._tur?.basla || '9999';
  const out = [];
  for (const u of SAATLIK.upload) {
    const key = `${host(u)}/${urunId(u)}`;
    for (const e of SAATLIK.formatlar[key] || []) if (!(kapsam[key]?.[e]?.t >= basla)) out.push(`${key} ${e}`);
  }
  return out;
}
const tamamlandi = kapsam => !!kapsam._tur && eksikler(kapsam).length === 0;

// Hatalı kombinasyonlar: son denemede takılanlar + bilinen sorun yüzünden sırada olmayanlar (ör. builder AI/EPS)
function hatalilar(kapsam) {
  const out = [];
  for (const r of tablo(kapsam)) for (const [e, h] of Object.entries(r.hucreler)) {
    if (h.durum === 'hata' || h.durum === 'engel') out.push({ ...r, tur: e, durum: h.durum === 'hata' ? 'Takıldı' : 'Test edilemedi (bot koruması)', t: h.t, aciklama: h.not || '' });
    else if (h.durum === 'bilinen') out.push({ ...r, tur: e, durum: 'Bilinen sorun (sırada yok)', t: '', aciklama: h.not || '' });
  }
  return out;
}

// Çapraz kontrol bitince gönderilen mail: sadece hatalı kombinasyonların Excel'i
async function caprazRapor(kapsam, bitis) {
  const ExcelJS = require('exceljs');
  const rows = hatalilar(kapsam), o = ozet(tablo(kapsam));
  const toplam = Object.values(SAATLIK.formatlar).reduce((n, v) => n + v.length, 0);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Site Test Agent';
  const ws = wb.addWorksheet('Hatalı kombinasyonlar');
  ws.addRow(['Çapraz dosya türü kontrolü – hatalı kombinasyonlar']).font = { bold: true, size: 14 };
  ws.addRow([`${tarih(kapsam._tur.basla)} – ${tarih(bitis)} (Berlin) · ${toplam} ürün × tür kombinasyonu denendi · ${o.ok} geçti · ${o.hata} takıldı · ${o.bilinen} bilinen sorun`]);
  ws.addRow([]);
  const h = ws.addRow(['Site', 'Upload ürünü', 'Uygulama', 'Dosya türü', 'Sonuç', 'Son deneme', 'Açıklama (takıldığı adım / sebep)']);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24292F' } }; });
  for (const r of rows) {
    const row = ws.addRow([r.site, { text: r.urun, hyperlink: r.url }, r.uygulama, r.tur.toUpperCase(), r.durum, tarih(r.t), r.aciklama]);
    row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.durum === 'Takıldı' ? 'FFFFEBE9' : 'FFFFF8C5' } };
    row.alignment = { vertical: 'top', wrapText: true };
  }
  if (!rows.length) ws.addRow(['Hatalı kombinasyon yok: her ürün kabul ettiği her türde geçti.']);
  ws.columns = [{ width: 24 }, { width: 42 }, { width: 20 }, { width: 11 }, { width: 26 }, { width: 13 }, { width: 90 }];
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 7 } };
  // Test aşaması: turların kendi durumu
  const tr = turRaporu(kapsam, bitis);
  const head = (sh, cols) => { const r = sh.addRow(cols); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24292F' } }; }); };
  const wt = wb.addWorksheet('Turlar');
  wt.addRow(['Saatlik turlar (test aşaması)']).font = { bold: true, size: 14 };
  wt.addRow([`${tr.ozet.toplam} tur · ${tr.ozet.tamam} sorunsuz tamamlandı · ${tr.ozet.kesilen} yarıda kesildi · ${tr.ozet.atlanan} turda site atlandı · ${tr.ozet.baslamayan} saat tur hiç başlamadı · ortalama ${tr.ozet.ortDk} dk, en uzun ${tr.ozet.enUzunDk} dk · ${tr.ozet.tekrar} tekrar deneme`]);
  wt.addRow([]);
  head(wt, ['Başlangıç', 'Durum', 'Süre (dk)', 'Atlanan siteler', 'Takılan (iki denemede de)', 'Tekrar deneme']);
  const KES = { 'Tamamlandı': 'FFDAFBE1', 'Sürüyor': 'FFF6F8FA' };
  for (const t of tr.satirlar) {
    const r = wt.addRow([tarih(t.basla), t.durumYazi, t.dk ?? '', (t.atlanan || []).join(', '), (t.takilan || []).join('\n'), t.tekrar?.length || 0]);
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KES[t.durumYazi] || 'FFFFEBE9' } };
    r.alignment = { vertical: 'top', wrapText: true };
  }
  for (const b of tr.baslamayan) {
    const r = wt.addRow([tarih(b), 'Tur hiç başlamadı (sıraya girip iptal edildi ya da Make başlatmadı)', '', '', '', '']);
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8C5' } };
  }
  wt.columns = [{ width: 14 }, { width: 46 }, { width: 10 }, { width: 30 }, { width: 70 }, { width: 13 }];
  wt.views = [{ state: 'frozen', ySplit: 4 }];
  const wr = wb.addWorksheet('Tekrar denemeler');
  wr.addRow(['İlk denemede takılıp 2 dk sonra tekrar denenenler']).font = { bold: true, size: 14 };
  wr.addRow([]);
  head(wr, ['Tur', 'Site', 'Ürün', 'Test dosyası', 'İlk denemede', 'Sonuç']);
  for (const t of tr.satirlar) for (const x of t.tekrar || []) {
    const r = wr.addRow([tarih(t.basla), x.site, x.urun, x.dosya, x.ilk, x.sonuc]);
    r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: /geçti/.test(x.sonuc) ? 'FFFFF8C5' : 'FFFFEBE9' } };
    r.alignment = { vertical: 'top', wrapText: true };
  }
  wr.columns = [{ width: 14 }, { width: 24 }, { width: 44 }, { width: 30 }, { width: 70 }, { width: 24 }];
  wr.views = [{ state: 'frozen', ySplit: 3 }];
  const excel = Buffer.from(await wb.xlsx.writeBuffer());
  const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const takilan = rows.filter(r => r.durum !== 'Bilinen sorun (sırada yok)');
  return {
    kind: 'capraz', sendEmail: true,
    subject: `📄 Çapraz dosya türü kontrolü tamamlandı – ${takilan.length ? `${takilan.length} hatalı kombinasyon` : 'hata yok'}${o.bilinen ? ` (+${o.bilinen} bilinen sorun)` : ''}`,
    html: `<div style="font-family:Arial,sans-serif">
      <h2>Çapraz dosya türü kontrolü tamamlandı</h2>
      <p>${tarih(kapsam._tur.basla)} – ${tarih(bitis)} (Berlin) arasında saatlik testte ${toplam} ürün × dosya türü kombinasyonunun hepsi en az bir kez denendi.<br>
      ✅ ${o.ok} geçti · ❌ ${o.hata} takıldı · ⚠️ ${o.bilinen} bilinen sorun (sırada yok).</p>
      <p><b>Turlar (test aşaması):</b> ${tr.ozet.toplam} tur · ${tr.ozet.tamam} sorunsuz tamamlandı · <b>${tr.ozet.kesilen} yarıda kesildi</b> (süre sınırı) · ${tr.ozet.atlanan} turda site atlandı · ${tr.ozet.baslamayan} saat tur hiç başlamadı · ortalama ${tr.ozet.ortDk} dk, en uzun ${tr.ozet.enUzunDk} dk · ${tr.ozet.tekrar} tekrar deneme.</p>
      <p>Ekteki Excel: "Hatalı kombinasyonlar" (site, upload ürünü, dosya türü, takıldığı adım), "Turlar" (her saatlik turun süresi ve durumu), "Tekrar denemeler" (ilk denemede takılanlar).</p>
      ${takilan.length ? `<ul>${takilan.map(r => `<li><b>${esc(r.site)}</b> – ${esc(r.urun)} – <b>${r.tur.toUpperCase()}</b>: ${esc(r.aciklama)}</li>`).join('')}</ul>` : ''}
    </div>`,
    excelName: `capraz-kontrol-hatalilar-${bitis.slice(0, 10)}.xlsx`, excel: excel.toString('base64'),
  };
}

module.exports = { kaydet, tablo, ozet, hucre, html, excelSayfasi, eksikler, tamamlandi, hatalilar, caprazRapor, turBasladi, turBitti, turRaporu };
