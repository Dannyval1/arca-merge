#!/usr/bin/env python3
"""Genera atlas BMFont (XML + PNG) de Baloo 2 ExtraBold para Phaser BitmapText."""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / "scripts" / "fonts" / "Baloo2-ExtraBold.ttf"
OUT_DIR = ROOT / "public" / "assets" / "fonts"
FACE = "Baloo2"
SIZE = 64  # px de raster; Phaser escala con setFontSize / scale
PAD = 2
ATLAS = 1024

# Juego completo + textos reales del juego (¡El arca se desbordó!, Récord, Ajustes…)
CHARSET = (
    " !\"#$%&'()*+,-./0123456789:;<=>?@"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "[\\]^_`"
    "abcdefghijklmnopqrstuvwxyz"
    "{|}~"
    "¡¿×·"
    "áéíóúñüÁÉÍÓÚÑÜ"
    "ãõçÃÕÇêôÊÔ"
)


def main() -> None:
    if not FONT_PATH.exists():
        raise SystemExit(f"Falta la fuente: {FONT_PATH}")

    font = ImageFont.truetype(str(FONT_PATH), SIZE)
    ascent, descent = font.getmetrics()
    line_height = ascent + descent + PAD * 2

    glyphs: list[dict] = []
    for ch in CHARSET:
        # Evitar duplicados si el string tiene repeticiones.
        if any(g["ch"] == ch for g in glyphs):
            continue
        bbox = font.getbbox(ch)
        if bbox is None:
            print(f"WARN: sin bbox para {ch!r}")
            continue
        x0, y0, x1, y1 = bbox
        w = max(1, x1 - x0)
        h = max(1, y1 - y0)
        # Advance tipográfico
        advance = font.getlength(ch)
        img = Image.new("RGBA", (w + PAD * 2, h + PAD * 2), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((PAD - x0, PAD - y0), ch, font=font, fill=(255, 255, 255, 255))
        glyphs.append(
            {
                "ch": ch,
                "id": ord(ch),
                "img": img,
                "w": img.size[0],
                "h": img.size[1],
                "xoffset": x0 - PAD,
                "yoffset": y0 - PAD + (ascent - ascent),  # relativo al top del cell
                "xadvance": int(math.ceil(advance)),
                # yoffset AngelCode: distancia desde top de línea hasta top del glyph
                "yoff": y0,
            }
        )

    # Empaquetado fila a fila
    atlas_size = ATLAS
    x = PAD
    y = PAD
    row_h = 0
    packed: list[dict] = []
    for g in glyphs:
        if x + g["w"] + PAD > atlas_size:
            x = PAD
            y += row_h + PAD
            row_h = 0
        if y + g["h"] + PAD > atlas_size:
            atlas_size *= 2
            # Reintentar empaquetado en atlas más grande
            return repack(glyphs, font, ascent, descent, line_height, atlas_size)
        g["x"] = x
        g["y"] = y
        packed.append(g)
        x += g["w"] + PAD
        row_h = max(row_h, g["h"])

    atlas = Image.new("RGBA", (atlas_size, atlas_size), (0, 0, 0, 0))
    for g in packed:
        atlas.paste(g["img"], (g["x"], g["y"]), g["img"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    png_name = "baloo2.png"
    xml_name = "baloo2.xml"
    atlas.save(OUT_DIR / png_name)

    # yoffset en BMFont: desde la línea base hacia arriba suele usarse
    # Phaser: yoffset = offset desde top of line. Usamos g['yoff'] (bbox top).
    lines = [
        '<?xml version="1.0"?>',
        "<font>",
        f'  <info face="{FACE}" size="{SIZE}" bold="1" italic="0" charset="" unicode="1" stretchH="100" smooth="1" aa="1" padding="0,0,0,0" spacing="1,1" outline="0"/>',
        f'  <common lineHeight="{line_height}" base="{ascent}" scaleW="{atlas_size}" scaleH="{atlas_size}" pages="1" packed="0"/>',
        "  <pages>",
        f'    <page id="0" file="{png_name}"/>',
        "  </pages>",
        f'  <chars count="{len(packed)}">',
    ]
    for g in packed:
        lines.append(
            f'    <char id="{g["id"]}" x="{g["x"]}" y="{g["y"]}" width="{g["w"]}" height="{g["h"]}" '
            f'xoffset="{g["xoffset"]}" yoffset="{g["yoff"]}" xadvance="{g["xadvance"]}" page="0" chnl="15"/>'
        )
    lines += ["  </chars>", "</font>", ""]
    (OUT_DIR / xml_name).write_text("\n".join(lines), encoding="utf-8")

    # Verificación de textos reales
    samples = [
        "¡El arca se desbordó!",
        "Récord",
        "Ajustes",
        "Mejor",
        "+100",
        "x8",
        "0123456789",
    ]
    ids = {g["id"] for g in packed}
    print(f"Wrote {OUT_DIR / png_name} ({os.path.getsize(OUT_DIR / png_name)} bytes)")
    print(f"Wrote {OUT_DIR / xml_name} ({len(packed)} glyphs, atlas {atlas_size})")
    for s in samples:
        miss = [c for c in s if ord(c) not in ids and c != "\n"]
        print(f"  check {s!r}: {'OK' if not miss else 'MISSING ' + repr(miss)}")


def repack(glyphs, font, ascent, descent, line_height, atlas_size):
    # Reentrada con atlas más grande — simplificado: fallar claro
    raise SystemExit(f"Atlas {atlas_size} insuficiente; sube ATLAS en el script")


if __name__ == "__main__":
    main()
