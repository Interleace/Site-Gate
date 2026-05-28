#!/usr/bin/env python3
"""Minimal PNG icons for Site Gate extension."""
import struct
import zlib
from pathlib import Path

def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def write_png(path: Path, size: int, rgb: tuple[int, int, int]) -> None:
    r, g, b = rgb
    raw = b""
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            # dark red gate bar in center third
            if size // 3 <= x < 2 * size // 3 and size // 3 <= y < 2 * size // 3:
                raw += bytes((180, 60, 60))
            else:
                raw += bytes((20, 20, 24))
    compressed = zlib.compress(raw, 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", ihdr)
    png += png_chunk(b"IDAT", compressed)
    png += png_chunk(b"IEND", b"")
    path.write_bytes(png)

out = Path(__file__).resolve().parent.parent / "icons"
out.mkdir(exist_ok=True)
write_png(out / "icon48.png", 48, (180, 60, 60))
write_png(out / "icon128.png", 128, (180, 60, 60))
print("icons written")
