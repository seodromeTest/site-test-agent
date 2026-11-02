// Bir matris sonucundan (results/matrix-*.json) referans tablosu üretir:
//   referans/<site>.json – karşılaştırma için makine tarafından okunan referans
//   referans/<site>.md   – GitHub'da okunabilir tablo
// Kullanım: node referans.js <matrix-sonucu.json> <site-dosyası-adı>   (ör. fastdtftransfer)
const fs = require('fs');
const path = require('path');

const [src, siteName] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(src, 'utf8'));
const site = require(`./sites/${siteName}`);
const flows = site.flows.filter(f => d.cells.some(c => c.akis === f.id));
const by = new Map(d.cells.map(c => [`${c.akis}|${c.dosya}`, c]));

const base = { site: d.site, kaynak: d.startedAt, onaylandi: false, hucreler: {} };
for (const c of d.cells) {
  const o = c.okunan || {}, sp = c.sepet || {};
  base.hucreler[`${c.akis}|${c.dosya}`] = Object.fromEntries(Object.entries({
    durum: c.durum, olcu: o.olcu, dpi: o.dpi, varyant: o.varyant, fiyat: o.fiyat,
    sepetVaryant: sp.varyant, sepetFiyat: sp.fiyat, hata: c.hata,
  }).filter(([, v]) => v));
}

const QC = { 'No low-resolution images.': 'düşük çözünürlük', 'No semi transparent pixels detected.': 'yarı saydam piksel' };
const cell = c => {
  if (!c) return '';
  if (c.durum === 'desteklenmiyor') return '— desteklenmiyor';
  const o = c.okunan || {}, sp = c.sepet || {};
  const warn = [...new Set([
    ...(c.uygulamaUyarilari || []),
    ...(o.uyarilar || []).filter(u => /Background detected/.test(u)).map(() => 'Background detected'),
    ...(c.kaliteKontrol || []).filter(k => !k.gecti).map(k => QC[k.madde] || k.madde),
  ])];
  return [
    o.olcu && `**${o.olcu}** @${o.dpi || '?'}dpi`,
    o.varyant,
    (sp.fiyat || o.fiyat) && `$${sp.fiyat || o.fiyat}`,
    warn.length && `⚠️ ${warn.join(', ')}`,
    c.durum === 'hata' && `❌ ${String(c.hata || '').replace(/\|/g, '/')}`,
  ].filter(Boolean).join('<br>');
};

// Her ürün grubu (aynı dosyaları kullanan ürünler) ayrı tablo
const groups = [];
for (const f of flows) {
  const files = d.files.filter(file => by.has(`${f.id}|${file}`));
  const g = groups.find(x => x.files.join() === files.join());
  g ? g.flows.push(f) : groups.push({ files, flows: [f] });
}
const md = [
  `# Referans tablosu – ${site.domain}`, '',
  `Kaynak: GitHub'da çalışan dosya matrisi (${d.startedAt.slice(0, 16).replace('T', ' ')} UTC). **Onay bekliyor.**`, '',
  'Her hücre: uygulamanın okuduğu ölçü ve DPI · seçilen varyant · sepete giden fiyat · uyarılar.',
  'Her ürüne sadece uygun dosyalar yüklenir: gang sheet ürünlerine hazır gang sheet, By Size ve Builder\'a tek tek tasarımlar.', '',
  ...groups.flatMap(g => [
    `| Dosya | ${g.flows.map(f => f.title).join(' | ')} |`,
    `|---|${g.flows.map(() => '---').join('|')}|`,
    ...g.files.map(file => `| \`${file}\` | ${g.flows.map(f => cell(by.get(`${f.id}|${file}`))).join(' | ')} |`),
    '',
  ]),
  `Onaylandıktan sonra \`referans/${siteName}.json\` bu tablonun makine tarafından okunan halidir; matris sonuçları bununla karşılaştırılır.`,
];
fs.mkdirSync(path.join(__dirname, 'referans'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'referans', `${siteName}.json`), JSON.stringify(base, null, 1));
fs.writeFileSync(path.join(__dirname, 'referans', `${siteName}.md`), md.join('\n') + '\n');
console.log(`${Object.keys(base.hucreler).length} hücre → referans/${siteName}.md`);
