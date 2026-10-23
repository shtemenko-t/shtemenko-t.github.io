"""Фото психолога для сайта: оригинал (до 1280 px по длинной стороне) + сжатые копии.

    python3 -I photo.py исходник.jpg выход/slug.jpg выход/opt

В opt кладутся slug.webp (как оригинал, для страницы профиля) и slug-sm.webp (160 px в ширину, для каталога) —
сайт сам подставляет их вместо оригинала (см. photoImg в friendlypsy/loader.js).
"""
import os
import sys

from PIL import Image, ImageOps

src, dst, optdir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(optdir, exist_ok=True)
slug = os.path.splitext(os.path.basename(dst))[0]

im = ImageOps.exif_transpose(Image.open(src))
if dst.endswith(".png"):
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
else:
    im = im.convert("RGB")
im.thumbnail((1280, 1280), Image.LANCZOS)
im.save(dst, optimize=True, **({"quality": 88} if dst.endswith(".jpg") else {}))

im.save(os.path.join(optdir, f"{slug}.webp"), "WEBP", quality=80, method=6)
sm = im.copy()
sm.thumbnail((160, 10000), Image.LANCZOS)
sm.save(os.path.join(optdir, f"{slug}-sm.webp"), "WEBP", quality=80, method=6)
print(f"фото: {im.size[0]}×{im.size[1]}, каталог: {sm.size[0]}×{sm.size[1]}")
