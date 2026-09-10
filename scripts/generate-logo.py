#!/usr/bin/env python3
"""Generate the musico brand assets (app icon, splash, adaptive icon, favicon).

The mark is "the musico record" — a terracotta vinyl disc with groove rings
and an ivory label carrying an italic serif "m", matching the app's
Warm Editorial Minimalism x Tactile Analog design system (lib/theme.ts).

Requires Pillow + numpy. Run from the repo root: python3 scripts/generate-logo.py
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images")
NEWSREADER_DIR = os.path.join(ROOT, "node_modules", "@expo-google-fonts", "newsreader")
FONT_SEMIBOLD_ITALIC = os.path.join(NEWSREADER_DIR, "600SemiBold_Italic", "Newsreader_600SemiBold_Italic.ttf")
FONT_MEDIUM_ITALIC = os.path.join(NEWSREADER_DIR, "500Medium_Italic", "Newsreader_500Medium_Italic.ttf")

# Palette (mirrors lib/theme.ts)
TERRACOTTA = (217, 119, 54)  # accent
EMBER = (194, 99, 43)  # copper
TERRACOTTA_LIT = (224, 138, 70)  # warm highlight
IVORY = (247, 244, 238)  # text
CHARCOAL = (20, 19, 18)  # background
GLOW = (35, 29, 23)  # warm lift behind the disc on charcoal
INK = (32, 28, 24)  # light-mode text
GROOVE = (70, 30, 8)  # groove shadow on the disc

SS = 4  # supersampling factor for anti-aliased output
GRAD_CAP = 1024  # gradients render smooth well below this; upscaled after


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def radial_gradient(size, inner, outer, inner_radius=0.0):
    """Smooth radial gradient clipped to the outer circle (numpy, fast).

    Rendered at a capped working resolution — perfectly smooth once the
    supersampled composition is downscaled.
    """
    w = min(size, GRAD_CAP)
    r = w / 2
    yy, xx = np.mgrid[0:w, 0:w].astype(np.float64)
    dist = np.sqrt((xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2) / r
    t = np.clip((dist - inner_radius) / max(1e-6, 1.0 - inner_radius), 0, 1)
    inner_a = np.array(inner, dtype=np.float64)
    outer_a = np.array(outer, dtype=np.float64)
    rgb = (inner_a[None, None, :] * (1 - t[..., None]) + outer_a[None, None, :] * t[..., None])
    alpha = np.where(dist <= 1.0, 255, 0).astype(np.uint8)
    im = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8))
    return im if w == size else im.resize((size, size), Image.BICUBIC)


def square_glow(size, inner, outer):
    """Full-square radial glow (unclipped) for charcoal backgrounds."""
    w = min(size, GRAD_CAP)
    r = w / 2
    yy, xx = np.mgrid[0:w, 0:w].astype(np.float64)
    dist = np.sqrt((xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2) / r
    t = np.clip(dist, 0, 1) ** 1.4
    inner_a = np.array(inner, dtype=np.float64)
    outer_a = np.array(outer, dtype=np.float64)
    rgb = (inner_a[None, None, :] * (1 - t[..., None]) + outer_a[None, None, :] * t[..., None])
    alpha = np.full((w, w, 1), 255, dtype=np.uint8)
    im = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8))
    return im if w == size else im.resize((size, size), Image.BICUBIC)


def solid(size, color):
    return Image.new("RGBA", (size, size), color + (255,))


def ring(draw, cx, cy, radius, width, fill):
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=fill,
        width=max(1, int(width)),
    )


def soft_band(draw, cx, cy, disc_r, r_frac, w_frac, peak, center, span, rgb):
    """One soft light/shade band: stacked arcs feathered both radially
    (gaussian across the band) and angularly (sine at the ends), so the
    sweep melts into the grooves with no visible seams.

    Translucent strokes are painted onto the transparent overlay with plain
    Draw (which stamps ink RGB + ink alpha), and layer.alpha_composite does
    the real blending. Layers paint extremes-first so overlapping strokes
    keep the peak alpha at the band center instead of a faint outer ring."""
    # Extremes first, peak (k=0) last — later strokes overwrite overlaps.
    for k in sorted(range(-3, 4), key=lambda k: -abs(k)):
        fall_r = math.exp(-((k / 1.8) ** 2))
        if fall_r < 0.06:
            continue
        rr = disc_r * (r_frac + k * w_frac * 0.45)
        width = max(2, int(disc_r * w_frac * 0.55))
        segs = 26
        for j in range(segs):
            tm = (j + 0.5) / segs
            fall_a = math.sin(math.pi * tm) ** 0.8
            alpha = int(round(peak * fall_r * fall_a))
            if alpha <= 0:
                continue
            a0 = center - span / 2 + span * j / segs
            a1 = center - span / 2 + span * (j + 1) / segs + 0.5
            draw.arc(
                [cx - rr, cy - rr, cx + rr, cy + rr],
                start=a0,
                end=a1,
                fill=rgb + (alpha,),
                width=width,
            )



def groove_fracs():
    """Pressed-vinyl grooves: even spacing with a wider breather every fourth
    ring (track banding), running rim -> dead wax before the label."""
    fracs = []
    r, i = 0.905, 0
    while r >= 0.585:
        fracs.append((r, i))
        r -= 0.030 if (i % 4 != 3) else 0.047
        i += 1
    return fracs


def draw_record(cx, cy, disc_r, label_letter=True):
    """Draw the record mark centered at (cx, cy) with the given disc radius.

    Returns the finished RGBA layer at supersampled resolution.
    """
    layer = Image.new("RGBA", (cx * 2, cy * 2), (0, 0, 0, 0))

    # Disc — warm radial terracotta (lit label side fading to ember at the rim)
    disc = radial_gradient(int(disc_r * 2), TERRACOTTA_LIT, EMBER, inner_radius=0.30)
    layer.alpha_composite(disc, (int(cx - disc_r), int(cy - disc_r)))

    ov = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # Rim — slightly darker edge to seat the disc, plus a light catch on the
    # upper-left so the edge reads at small sizes.
    ring(d, cx, cy, disc_r * 0.965, disc_r * 0.028, GROOVE + (110,))
    soft_band(d, cx, cy, disc_r, 0.962, 0.016, 56, center=218, span=72, rgb=IVORY)

    # Grooves — alternating strong/faint lines with track banding.
    for frac, i in groove_fracs():
        alpha = 64 if i % 2 == 0 else 34
        ring(d, cx, cy, disc_r * frac, disc_r * 0.010, GROOVE + (alpha,))

    # Dead-wax wash — a smooth darker breath between last groove and label.
    ring(d, cx, cy, disc_r * 0.560, disc_r * 0.034, GROOVE + (24,))

    # Lamplight sweep upper-left, melted into the grooves; faint counter-
    # shade lower-right for roundness.
    for r_frac, w_frac, peak in ((0.86, 0.050, 34), (0.70, 0.034, 22)):
        soft_band(d, cx, cy, disc_r, r_frac, w_frac, peak, center=218, span=54, rgb=IVORY)
    for r_frac, w_frac, peak in ((0.84, 0.060, 28), (0.68, 0.040, 18)):
        soft_band(d, cx, cy, disc_r, r_frac, w_frac, peak, center=38, span=56, rgb=GROOVE)

    if label_letter:
        label_r = disc_r * 0.352
        d.ellipse([cx - label_r, cy - label_r, cx + label_r, cy + label_r], fill=IVORY + (255,))
        ring(d, cx, cy, label_r * 0.94, disc_r * 0.012, EMBER + (70,))

    layer.alpha_composite(ov)
    d = ImageDraw.Draw(layer)

    if label_letter:
        font = ImageFont.truetype(FONT_SEMIBOLD_ITALIC, int(disc_r * 0.385))
        d.text((cx, cy * 1.006), "m", font=font, fill=EMBER + (255,), anchor="mm")

    return layer


def downsave(img, name, size=None):
    if size and img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print(f"{name:38s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path):>7,d} B")


def wordmark_layer(font_px, color, with_vinyl_o=True):
    """Render 'musico' (final o as a vinyl ring) on a tight transparent canvas.

    Returns (image, baseline_y) at supersampled resolution.
    """
    font = ImageFont.truetype(FONT_MEDIUM_ITALIC, font_px)
    ascent, descent = font.getmetrics()

    probe = Image.new("RGBA", (8, 8))
    pd = ImageDraw.Draw(probe)
    text_w = int(pd.textlength("music", font=font))
    # Italic glyphs overshoot their advance width on the right; add slack so
    # the drawn "o" never collides with the "c".
    overshoot = int(font_px * 0.10)
    if with_vinyl_o:
        o_d = int(font_px * 0.545)  # outer diameter of the drawn o
        o_stroke = max(int(font_px * 0.105), SS * 2)  # thin ring, reads as vinyl
        total = text_w + overshoot + o_d
    else:
        total = int(pd.textlength("musico", font=font))

    h = ascent + descent
    im = Image.new("RGBA", (total + font_px // 2, h + font_px // 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((0, 0), "music" if with_vinyl_o else "musico", font=font, fill=color + (255,))

    if with_vinyl_o:
        # Center the ring on the x-height middle; round glyphs overshoot the
        # baseline slightly, so the center sits a touch below baseline-middle.
        ox = text_w + overshoot + o_d / 2
        oy = ascent - o_d / 2 + font_px * 0.012
        d.ellipse(
            [ox - o_d / 2, oy - o_d / 2, ox + o_d / 2, oy + o_d / 2],
            outline=color + (255,),
            width=o_stroke,
        )
        # Spindle dot — makes the ring read as a record, not a plain "o".
        dot_r = font_px * 0.045
        d.ellipse(
            [ox - dot_r, oy - dot_r, ox + dot_r, oy + dot_r],
            fill=color + (255,),
        )
    return im, ascent


def make_splash(dark=True):
    W, H = 1200 * SS, 1536 * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    disc_r = 330 * SS
    record = draw_record(disc_r, disc_r, disc_r)
    im.alpha_composite(record, (W // 2 - disc_r, int(540 * SS) - disc_r))

    wm, _ = wordmark_layer(int(172 * SS), IVORY if dark else INK)
    im.alpha_composite(wm, (W // 2 - wm.width // 2, int(1020 * SS)))

    return im.resize((1200, 1536), Image.LANCZOS)


def make_monochrome(S):
    """Material You silhouette: white disc with real groove/label cutouts so
    the themed background shows through as texture."""
    mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(mono)
    cx = cy = S // 2
    R = int(340 * SS)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 255, 255, 255))

    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    for frac in (0.875, 0.79, 0.705, 0.62, 0.55):
        ring(md, cx, cy, R * frac, R * 0.024, 255)
    md.ellipse(
        [cx - R * 0.34, cy - R * 0.34, cx + R * 0.34, cy + R * 0.34],
        fill=255,
    )
    alpha = ImageChops.subtract(mono.split()[3], mask)
    mono.putalpha(alpha)

    # Spindle dot stays solid white at the center.
    d = ImageDraw.Draw(mono)
    d.ellipse(
        [cx - R * 0.185, cy - R * 0.185, cx + R * 0.185, cy + R * 0.185],
        fill=(255, 255, 255, 255),
    )
    return mono


def main():
    for path in (FONT_SEMIBOLD_ITALIC, FONT_MEDIUM_ITALIC):
        if not os.path.exists(path):
            sys.exit(f"missing font: {path}\nrun `npx expo install` / `npm install` first.")
    os.makedirs(OUT, exist_ok=True)

    # ---- App icon (iOS / universal): warm glow + record ----
    S = 1024 * SS
    icon = square_glow(S, GLOW, CHARCOAL)
    record = draw_record(S // 2, S // 2, int(340 * SS))
    icon.alpha_composite(record)
    downsave(icon.convert("RGB"), "icon.png", 1024)

    # ---- Splash (mark + wordmark), light and dark variants ----
    downsave(make_splash(dark=True), "splash-icon-dark.png")
    downsave(make_splash(dark=False), "splash-icon-light.png")

    # ---- Android adaptive icon layers (1024, safe zone <= 66%) ----
    fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fg.alpha_composite(draw_record(S // 2, S // 2, int(312 * SS)))
    downsave(fg, "android-icon-foreground.png", 1024)

    bg = square_glow(S, GLOW, CHARCOAL)
    downsave(bg, "android-icon-background.png", 1024)

    # Monochrome (Material You themed icons): white record silhouette
    downsave(make_monochrome(S), "android-icon-monochrome.png", 1024)

    # ---- Favicon: simplified mini record, bolder for 48px ----
    fav = solid(192 * SS, CHARCOAL)
    d = ImageDraw.Draw(fav)
    cx = cy = 96 * SS
    R = 118 * SS
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=TERRACOTTA + (255,))
    ring(d, cx, cy, R * 0.93, R * 0.05, GROOVE + (90,))
    ring(d, cx, cy, R * 0.70, R * 0.095, GROOVE + (85,))
    d.ellipse([cx - R * 0.40, cy - R * 0.40, cx + R * 0.40, cy + R * 0.40], fill=IVORY + (255,))
    downsave(fav, "favicon.png", 48)

    # ---- Standalone mark on transparent (in-app / docs use) ----
    mark = draw_record(340 * SS, 340 * SS, 340 * SS)
    downsave(mark, "logo-mark.png", 680)

    print("done")


if __name__ == "__main__":
    main()
