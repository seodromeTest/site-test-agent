#!/usr/bin/env python3
# Saatlik testte sırayla kullanılan test dosyalarını üretir (hepsi 300 DPI ya da vektör).
#   gangsheet/: hazır gang sheet ürünleri (GS uploader, Cloudlift) – 22" × 24"
#   builder/:   builder ürünleri – 10" × 10" tek tasarım
# Raster: png, jpg, webp, tiff, psd (300 DPI, ölçü pikselden). Vektör: svg, pdf, ai, eps (fiziksel ölçü inç/punto ile).
# Kullanım: python3 fixtures/formatlar/uret.py   (ImageMagick `convert` ve Pillow gerekir)
import os, subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
DPI = 300
SETS = {'gangsheet': (22, 24), 'builder': (10, 10)}
COLORS = [(230, 57, 70), (29, 53, 87), (42, 157, 143), (244, 162, 97), (131, 56, 236), (255, 190, 11)]

def font(px):
    for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(f): return ImageFont.truetype(f, px)
    return ImageFont.load_default()

def raster(w_in, h_in, label):
    """Şeffaf zemin üzerinde düz renkli şekiller + yazı (DTF tasarımı gibi; iyi sıkışır)."""
    W, H = w_in * DPI, h_in * DPI
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cell = 3 * DPI  # 3" × 3" tasarımlar
    k = 0
    for y in range(DPI // 4, H - cell + 1, cell + DPI // 4):
        for x in range(DPI // 4, W - cell + 1, cell + DPI // 4):
            c = COLORS[k % len(COLORS)]; k += 1
            if k % 2: d.ellipse([x, y, x + cell, y + cell], fill=c + (255,))
            else: d.rounded_rectangle([x, y, x + cell, y + cell], radius=DPI // 3, fill=c + (255,))
            d.text((x + cell // 2, y + cell // 2), 'TEST', font=font(DPI // 2), fill=(255, 255, 255, 255), anchor='mm')
    d.text((W // 2, H - DPI // 2), label, font=font(DPI // 4), fill=(0, 0, 0, 255), anchor='mm')
    return im

def svg(w_in, h_in, label):
    shapes = []
    k = 0
    for y in range(0, h_in - 2, 3):
        for x in range(0, w_in - 2, 3):
            r, g, b = COLORS[k % len(COLORS)]; k += 1
            shapes.append(f'<circle cx="{x + 1.6}" cy="{y + 1.6}" r="1.4" fill="rgb({r},{g},{b})"/>' if k % 2 else
                          f'<rect x="{x + 0.2}" y="{y + 0.2}" width="2.8" height="2.8" rx="0.3" fill="rgb({r},{g},{b})"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w_in}in" height="{h_in}in" viewBox="0 0 {w_in} {h_in}">'
            + ''.join(shapes) + f'<text x="{w_in / 2}" y="{h_in - 0.4}" font-size="0.4" text-anchor="middle" font-family="Arial">{label}</text></svg>')

def ps_body(w_in, h_in):
    """PostScript/PDF ortak: punto cinsinden dolgu kareleri ve daireler (vektör)."""
    ops, k = [], 0
    for y in range(0, h_in - 2, 3):
        for x in range(0, w_in - 2, 3):
            r, g, b = [v / 255 for v in COLORS[k % len(COLORS)]]; k += 1
            X, Y, S = (x + 0.2) * 72, (h_in - y - 3 + 0.2) * 72, 2.8 * 72
            ops.append((r, g, b, X, Y, S))
    return ops

def eps(w_in, h_in):
    W, H = w_in * 72, h_in * 72
    lines = ['%!PS-Adobe-3.0 EPSF-3.0', f'%%BoundingBox: 0 0 {W} {H}', f'%%HiResBoundingBox: 0 0 {W} {H}', '%%EndComments']
    for r, g, b, X, Y, S in ps_body(w_in, h_in):
        lines.append(f'{r:.3f} {g:.3f} {b:.3f} setrgbcolor newpath {X:.1f} {Y:.1f} {S:.1f} {S:.1f} rectfill')
    lines += ['showpage', '%%EOF']
    return '\n'.join(lines) + '\n'

def pdf(w_in, h_in, ai=False):
    W, H = w_in * 72, h_in * 72
    content = '\n'.join(f'{r:.3f} {g:.3f} {b:.3f} rg {X:.1f} {Y:.1f} {S:.1f} {S:.1f} re f' for r, g, b, X, Y, S in ps_body(w_in, h_in)).encode()
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W} {H}] /TrimBox [0 0 {W} {H}] /Contents 4 0 R >>'.encode(),
            b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + content + b'\nendstream']
    if ai:  # Illustrator'ın PDF uyumlu .ai dosyası gibi: belge bilgisinde Creator
        objs.append(b'<< /Creator (Adobe Illustrator) /Title (test) >>')
    out, offs = b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f'{i} 0 obj\n'.encode() + o + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offs)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R{" /Info 5 0 R" if ai else ""} >>\nstartxref\n{x}\n%%EOF\n'.encode()
    return out

for name, (w, h) in SETS.items():
    d = os.path.join(ROOT, name); os.makedirs(d, exist_ok=True)
    base = f'{name}_{w}x{h}in_300dpi'
    im = raster(w, h, f'{w}" x {h}" 300 DPI')
    png = os.path.join(d, base + '.png')
    im.save(png, dpi=(DPI, DPI), optimize=True)
    im.convert('RGB').save(os.path.join(d, base + '.jpg'), dpi=(DPI, DPI), quality=90)   # JPG'de şeffaflık yok: beyaz zemin
    # WEBP'nin kendi DPI alanı yok: 300 DPI EXIF'e (XResolution/YResolution, birim inç) yazılır
    ex = Image.Exif(); ex[0x011A] = DPI; ex[0x011B] = DPI; ex[0x0128] = 2
    im.save(os.path.join(d, base + '.webp'), lossless=True, quality=100, exif=ex.tobytes())
    subprocess.run(['convert', png, '-units', 'PixelsPerInch', '-density', str(DPI), '-compress', 'LZW', os.path.join(d, base + '.tif')], check=True)
    subprocess.run(['convert', png, '-units', 'PixelsPerInch', '-density', str(DPI), '-compress', 'RLE', os.path.join(d, base + '.psd')], check=True)
    open(os.path.join(d, base + '.svg'), 'w').write(svg(w, h, f'{w}" x {h}" vektor'))
    open(os.path.join(d, base + '.eps'), 'w').write(eps(w, h))
    open(os.path.join(d, base + '.pdf'), 'wb').write(pdf(w, h))
    open(os.path.join(d, base + '.ai'), 'wb').write(pdf(w, h, ai=True))
print('tamam')
