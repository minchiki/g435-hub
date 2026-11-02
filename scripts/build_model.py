"""Собирает ассеты 3D-модели для hub/ui/assets из оригинального GLB (Sketchfab, CC-BY-4.0).

    python scripts/build_model.py путь/к/fone_logitech_g435.glb [--classmap out.png]

Оригинальная текстура — расцветка Blue & Raspberry. Пиксели делятся на классы по цвету
и области UV, каждый класс красится в цвет расцветки; фактура (ткань, блики) сохраняется
отношением яркости пикселя к средней яркости его класса. Нужны numpy и Pillow.
"""
import io
import json
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "hub" / "ui" / "assets"
SIZE = 2048

CLASSES = ["none", "body", "logo", "band", "spring", "cushion", "inner"]

# Цвета сверены с фотографиями Logitech: G435 Black & Neon Yellow, White & Lilac.
NEON = (205, 240, 25)
LILAC = (156, 170, 234)
PALETTES = {
    "black": {"body": (26, 27, 30), "logo": (40, 41, 45), "band": (30, 31, 34),
              "spring": NEON, "cushion": (34, 35, 38), "inner": (30, 31, 34)},
    "white": {"body": (236, 237, 240), "logo": (222, 223, 228), "band": LILAC,
              "spring": (150, 164, 236), "cushion": LILAC, "inner": LILAC},
}
# Шероховатость по классам. В оригинале ткань почти зеркальная (0.09) и всё слегка
# металлическое — на тёмных расцветках это читается как лакированный пластик.
ROUGHNESS = {"none": 0.6, "body": 0.42, "logo": 0.18, "band": 0.92, "spring": 0.45,
             "cushion": 0.95, "inner": 0.5}
# Отладочные цвета классов для --classmap
DEBUG = {"none": (0, 0, 0), "body": (40, 90, 255), "logo": (0, 255, 255), "band": (160, 60, 255),
         "spring": (255, 255, 0), "cushion": (255, 60, 60), "inner": (0, 255, 80)}


def read_images(src):
    d = Path(src).read_bytes()
    jl = struct.unpack_from("<I", d, 12)[0]
    j = json.loads(d[20:20 + jl])
    blob = d[20 + jl + 8:]
    out = []
    for i in (0, 1):  # baseColor, metallicRoughness
        bv = j["bufferViews"][j["images"][i]["bufferView"]]
        out.append(Image.open(io.BytesIO(blob[bv.get("byteOffset", 0):][:bv["byteLength"]])).convert("RGB"))
    return out


def hsv(rgb):
    """Тон 0..360, насыщенность (HSV), яркость (luma) для массива HxWx3 uint8."""
    c = rgb.astype(np.float32) / 255
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    l = 0.299 * r + 0.587 * g + 0.114 * b
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    h = np.where(d < 1e-6, 0, h)
    return h, s, l


def classify(rgb):
    h, s, l = hsv(rgb)
    hgt, wid = h.shape
    v, u = np.meshgrid((np.arange(hgt) + 0.5) / hgt, (np.arange(wid) + 0.5) / wid, indexing="ij")
    cls = np.full(h.shape, CLASSES.index("cushion"), np.uint8)
    rules = [  # последнее совпадение побеждает — порядок обратный приоритету
        ((u > 0.36) & (u < 0.66) & (v > 0.12) & (v < 0.23), "band"),  # малиновое пятно в ткани оголовья
        ((u < 0.37) & (v < 0.28), "inner"),
        ((h >= 255) & (h < 300), "band"),
        ((h >= 292) & (h < 318) & (s > 0.80), "spring"),
        ((h >= 180) & (h < 252), "body"),
        ((h >= 180) & (h < 205) & (l > 0.35), "logo"),
        ((s < 0.22) | (l < 0.06), "none"),
    ]
    for mask, name in rules:
        cls[mask] = CLASSES.index(name)
    return cls, l


def recolor(rgb, cls, lum, palette):
    out = rgb.astype(np.float32)
    for name, color in palette.items():
        m = cls == CLASSES.index(name)
        if not m.any():
            continue
        k = np.clip(lum[m] / lum[m].mean(), 0.55, 1.35)[:, None]
        out[m] = np.asarray(color, np.float32) * k
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def material_map(cls):
    """glTF metallicRoughness: R — не используется, G — шероховатость, B — металличность (0)."""
    rough = np.array([ROUGHNESS[n] for n in CLASSES], np.float32)[cls]
    img = np.zeros(cls.shape + (3,), np.uint8)
    img[..., 0] = 255
    img[..., 1] = np.round(rough * 255)
    return Image.fromarray(img)


def main():
    args = sys.argv[1:]
    src = Path(args[0])
    base, _ = read_images(src)
    base = base.resize((SIZE, SIZE), Image.LANCZOS)
    rgb = np.asarray(base)
    cls, lum = classify(rgb)

    if "--classmap" in args:
        lut = np.array([DEBUG[n] for n in CLASSES], np.uint8)
        Image.fromarray(lut[cls]).save(args[args.index("--classmap") + 1])
        for i, n in enumerate(CLASSES):
            print(f"{n:8} {int((cls == i).sum()):9} px")
        return

    work = ROOT / "research" / "model"
    work.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    base.save(OUT / "base_blue.jpg", quality=90)
    material_map(cls).save(work / "mr.jpg", quality=92)
    for name, palette in PALETTES.items():
        recolor(rgb, cls, lum, palette).save(OUT / f"base_{name}.jpg", quality=90)
    subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "repack_glb.py"), str(src),
                    str(work / "mr.jpg"), str(OUT / "g435.glb")], check=True)
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:16} {p.stat().st_size // 1024:6} KB")


if __name__ == "__main__":
    main()
