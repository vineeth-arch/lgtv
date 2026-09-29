#!/usr/bin/env python3
"""Generates the TV app icons (crescent moon on a dark tile) with the Python stdlib only."""
import os
import struct
import sys
import zlib

BG = (17, 24, 39)
FG = (250, 204, 21)
SS = 4  # supersampling factor for smooth edges


def png(path, w, h, rows):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def coverage(x, y, size):
    """1.0 where the crescent is, 0.0 elsewhere (sampled at a sub-pixel point)."""
    c = size / 2.0
    r1 = size * 0.30
    r2 = size * 0.26
    in_moon = (x - c) ** 2 + (y - c) ** 2 <= r1 ** 2
    in_cut = (x - (c + size * 0.13)) ** 2 + (y - (c - size * 0.08)) ** 2 <= r2 ** 2
    return 1.0 if in_moon and not in_cut else 0.0


def render(size):
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            hits = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    hits += coverage(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, size)
            a = hits / (SS * SS)
            row.extend(int(BG[i] * (1 - a) + FG[i] * a) for i in range(3))
        rows.append(row)
    return rows


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tv-app")
    for name, size in (("icon.png", 80), ("largeIcon.png", 130)):
        png(os.path.join(out, name), size, size, render(size))
        print("wrote", os.path.normpath(os.path.join(out, name)))


if __name__ == "__main__":
    sys.exit(main())
