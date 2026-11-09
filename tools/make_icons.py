#!/usr/bin/env python3
"""Generate every app icon from one square HD logo.

Usage: python3 tools/make_icons.py path/to/logo.png
Writes to the repo root (GitHub Pages serves the site from there).
Needs Pillow (pip install pillow).
"""
import os
import sys

from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = Image.open(sys.argv[1]).convert("RGBA")
w, h = src.size
if w != h:  # crop to a centred square
    s = min(w, h)
    src = src.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
# Flatten onto the brand colour: iOS shows transparency as black.
bg = Image.new("RGBA", src.size, (0x0B, 0x13, 0x2B, 255))
src = Image.alpha_composite(bg, src).convert("RGB")


def size(n):
    return src.resize((n, n), Image.LANCZOS)


out = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-maskable-512.png": 512,
}
for name, n in out.items():
    size(n).save(os.path.join(root, name), optimize=True)
size(48).save(os.path.join(root, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
print("wrote", ", ".join(list(out) + ["favicon.ico"]))
