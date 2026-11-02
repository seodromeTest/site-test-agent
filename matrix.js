// Dosya türü / auto-match matrisi: fixtures/kutuphane içindeki her dosyayı her upload ürününe yükler,
// uygulamanın okuduğu ölçü, varyant, fiyat ve uyarıları + sepete giden varyant ve fiyatı kaydeder.
// Kullanım: node matrix.js [--site fastdtftransfer] [--only <akış-id>] [--files <ad-parçası,...>]
// Çıktı: results/matrix-<site>-<zaman>.json ve .html (+ her hücre için ekran görüntüsü)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { withTimeout, getCart, newPage, gotoOk } = require('./lib');

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const SITE = arg('site', 'fastdtftransfer');
const ONLY = arg('only');
const FILES = arg('files');
const LIB = path.join(__dirname, 'fixtures', 'kutuphane');
const OUT = path.join(__dirname, 'results');
const SHOTS = path.join(OUT, 'matrix-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const files = fs.readdirSync(LIB).filter(f => !/\.md$/i.test(f)).sort()
  .filter(f => !FILES || FILES.split(',').some(p => f.includes(p)));

async function runCell(browser, site, flow, file) {
  const cell = { dosya: file, akis: flow.id, durum: 'ok', adimlar: [] };
  if (!flow.accepts.test(file)) return { ...cell, durum: 'desteklenmiyor' };
  const { ctx, page } = await newPage(browser);
  const t0 = Date.now();
  const step = async (name, fn) => {
    try { await fn(); cell.adimlar.push(name); } catch (e) { cell.hataAdimi = name; cell.hata = e.message.split('\n')[0].slice(0, 200); throw e; }
  };
  const readOnce = async () => { if (!cell.okunan) cell.okunan = await withTimeout(flow.read(page), 20000, 'Okuma').catch(e => ({ uyarilar: ['Okunamadı: ' + e.message] })); };
  const hooks = {
    afterUpload: async () => {
      await page.waitForTimeout(2000); // uygulamanın ölçü/fiyat hesabını bitirmesi için
      await readOnce();
      await page.screenshot({ path: path.join(SHOTS, `${flow.id}__${file}.jpg`), type: 'jpeg', quality: 50 }).catch(() => {});
    },
    onQualityCheck: checks => { cell.kaliteKontrol = checks; },
    onWarning: w => { (cell.uygulamaUyarilari ||= []).push(w); },
    uploadTimeout: 240000, // büyük dosyalarda (15–20 MB) ölçüm uzun sürebiliyor
  };
  try {
    await withTimeout((async () => {
      await gotoOk(page, flow.url);
      await page.waitForTimeout(3000);
      await flow.run(page, step, path.join(LIB, file), [], hooks);
      // Sepete ne gitti?
      let item;
      const deadline = Date.now() + 25000;
      while (!item && Date.now() < deadline) {
        item = (await getCart(page).catch(() => null))?.items?.find(i => i.product_title.includes(flow.expectProduct));
        if (!item) await page.waitForTimeout(1500);
      }
      if (!item) throw Object.assign(new Error('Ürün sepete düşmedi'), { stepName: 'Sepet' });
      cell.sepet = { varyant: item.variant_title, fiyat: (item.final_line_price / 100).toFixed(2),
        dusukCozunurluk: item.properties?.['_Has Low Resolution'] === 'Yes' || undefined };
    })(), 420000, 'Hücre');
  } catch (e) {
    cell.durum = 'hata';
    if (!cell.hata) { cell.hataAdimi = e.stepName || 'Zaman aşımı'; cell.hata = e.message.split('\n')[0].slice(0, 200); }
    await readOnce().catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, `${flow.id}__${file}.jpg`), type: 'jpeg', quality: 50 }).catch(() => {});
  }
  cell.sn = Math.round((Date.now() - t0) / 1000);
  await withTimeout(ctx.close(), 15000, 'close').catch(() => {});
  return cell;
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function html(site, flows, cells, startedAt) {
  const get = (f, file) => cells.find(c => c.akis === f.id && c.dosya === file);
  const td = c => {
    if (!c) return '<td style="background:#f6f8fa"></td>';
    if (c.durum === 'desteklenmiyor') return '<td style="color:#6e7781;background:#f6f8fa">Desteklenmiyor</td>';
    const o = c.okunan || {};
    const lines = [
      o.olcu && `<b>${esc(o.olcu)}</b>${o.dpi ? ` @ ${esc(o.dpi)} DPI` : ''}`,
      o.varyant && `Varyant: ${esc(o.varyant)}`,
      o.fiyat && `Fiyat: $${esc(o.fiyat)}`,
      c.sepet && `Sepet: ${esc(c.sepet.varyant)} · $${esc(c.sepet.fiyat)}${c.sepet.dusukCozunurluk ? ' · düşük çözünürlük' : ''}`,
      ...(c.uygulamaUyarilari || []).map(u => `<span style="color:#9a6700">⚠ ${esc(u)}</span>`),
      ...(c.kaliteKontrol || []).filter(k => !k.gecti).map(k => `<span style="color:#9a6700">✗ ${esc(k.madde)}</span>`),
      ...(o.uyarilar || []).map(u => `<span style="color:#9a6700">⚠ ${esc(u)}</span>`),
      c.durum === 'hata' && `<span style="color:#cf222e">❌ ${esc(c.hataAdimi)}: ${esc(c.hata)}</span>`,
    ].filter(Boolean);
    return `<td style="vertical-align:top;${c.durum === 'hata' ? 'background:#ffebe9' : ''}">${lines.join('<br>')}</td>`;
  };
  return `<!doctype html><meta charset="utf-8"><title>Dosya matrisi – ${esc(site.domain)}</title>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#1f2328;margin:16px">
<h2>Dosya türü / auto-match matrisi – ${esc(site.name)}</h2>
<p style="color:#6e7781">${esc(startedAt)} · ${files.length} dosya × ${flows.length} ürün. Her hücre: uygulamanın okuduğu ölçü ve DPI, seçtiği varyant ve fiyat, sepete giden varyant ve fiyat, uyarılar.</p>
<table border="1" cellpadding="6" style="border-collapse:collapse;border-color:#d0d7de">
<tr style="background:#f6f8fa"><th>Dosya</th>${flows.map(f => `<th>${esc(f.title)}</th>`).join('')}</tr>
${files.filter(file => cells.some(c => c.dosya === file)).map(file => `<tr><td style="vertical-align:top;white-space:nowrap"><b>${esc(file)}</b></td>${flows.map(f => td(get(f, file))).join('')}</tr>`).join('\n')}
</table></body>`;
}

(async () => {
  const site = require(`./sites/${SITE}`);
  const flows = site.flows.filter(f => f.read && (!ONLY || f.id === ONLY));
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch();
  // Her ürün kendi sırasında, ürünler paralel (aynı uygulamaya art arda yüklemede hız sınırına takılmamak için)
  const cells = (await Promise.all(flows.map(async flow => {
    const out = [];
    // Ürüne uygun olmayan dosyalar (ör. gang sheet ürününe tek tasarım) hiç denenmez
    for (const file of files.filter(f => !flow.matrixFiles || flow.matrixFiles.test(f))) {
      const c = await runCell(browser, site, flow, file);
      out.push(c);
      console.log(`${c.durum === 'ok' ? '✅' : c.durum === 'hata' ? '❌' : '–'} ${flow.id} | ${file} | ${c.okunan?.olcu || ''} ${c.okunan?.varyant || ''} ${c.okunan?.fiyat ? '$' + c.okunan.fiyat : ''}${c.hata ? ' | ' + c.hataAdimi + ': ' + c.hata : ''}`);
    }
    return out;
  }))).flat();
  await browser.close();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const base = path.join(OUT, `matrix-${site.domain}-${stamp}`);
  fs.writeFileSync(base + '.json', JSON.stringify({ site: site.domain, startedAt, files, cells }, null, 1));
  fs.writeFileSync(base + '.html', html(site, flows, cells, startedAt));
  console.log(`Sonuç: ${base}.html`);
})();
