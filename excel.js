// Genel test raporu: Özet sayfası + her site için ayrı sayfa (yapılan her kontrol alt alta).
const ExcelJS = require('exceljs');
const { siteRows } = require('./detay');

const DURUM = { ok: '✓ Başarılı', hata: '✗ Sorun', bilgi: 'ℹ Not', yapilmadi: '– Yapılamadı' };
const FILL = { ok: 'FFDAFBE1', hata: 'FFFFEBE9', bilgi: 'FFFFF8C5', yapilmadi: 'FFF6F8FA' };
const fmtDate = iso => new Date(iso).toLocaleString('tr-TR', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' }) + ' (NJ)';

const header = (ws, cols) => {
  const r = ws.addRow(cols);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24292F' } }; });
  return r;
};

async function build(run) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Site Test Agent';

  const oz = wb.addWorksheet('Özet');
  oz.addRow([`Genel site testi – ${fmtDate(run.startedAt)}`]).font = { bold: true, size: 14 };
  oz.addRow([`${run.sites.length} site · gerçek tarayıcı (Chrome) · sipariş verilmez, ödeme yapılmaz`]);
  oz.addRow([]);
  header(oz, ['Site', 'Kontrol', 'Başarılı', 'Sorun', 'Durum', 'Sorunlu kontroller']);
  for (const s of run.sites) {
    const rows = siteRows(s);
    const bad = rows.filter(r => r.durum === 'hata');
    const r = oz.addRow([s.domain, rows.filter(r => r.durum === 'ok' || r.durum === 'hata').length, rows.filter(r => r.durum === 'ok').length,
      bad.length, bad.length ? '✗ Sorun var' : '✓ Sorun yok', bad.map(b => `${b.bolum} → ${b.kontrol}: ${b.sonuc.replace(/^Sorun: /, '')}`).join('\n')]);
    r.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bad.length ? FILL.hata : FILL.ok } };
    r.alignment = { vertical: 'top', wrapText: true };
  }
  oz.columns = [{ width: 26 }, { width: 9 }, { width: 10 }, { width: 8 }, { width: 13 }, { width: 110 }];

  const used = new Set();
  for (const s of run.sites) {
    let name = s.domain.replace(/\.(com|net|us|co)$/, '').slice(0, 31);
    while (used.has(name)) name = name.slice(0, 29) + '_' + used.size;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([`${s.name} – ${s.domain}`]).font = { bold: true, size: 14 };
    ws.addRow([`Genel site testi · ${fmtDate(run.startedAt)} · gerçek tarayıcı (Chrome)`]);
    ws.addRow([]);
    header(ws, ['#', 'Bölüm', 'Kontrol edilen', 'Adres', 'Sonuç', 'Durum']);
    let n = 0;
    for (const r of siteRows(s)) {
      const row = ws.addRow([r.durum === 'ok' || r.durum === 'hata' ? ++n : '', r.bolum, r.kontrol,
        r.adres ? { text: r.adres, hyperlink: r.adres } : '', r.sonuc, DURUM[r.durum]]);
      row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.durum] } };
      row.alignment = { vertical: 'top', wrapText: true };
    }
    ws.columns = [{ width: 5 }, { width: 38 }, { width: 46 }, { width: 50 }, { width: 60 }, { width: 14 }];
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 6 } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { build };
