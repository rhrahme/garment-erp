#!/usr/bin/env python3
"""Decode QR codes from image files using pyzbar (same lib class as real scanners).

Usage: python3 scripts/decode-qr.py <image1> [image2 ...]
Prints one line per image: PATH\tOK|FAIL\t<decoded payloads>
Exit code 0 only if every image decoded to at least one QR.
"""
import sys
from PIL import Image
from pyzbar.pyzbar import decode, ZBarSymbol

ok_all = True
for path in sys.argv[1:]:
    try:
        img = Image.open(path).convert("L")
    except Exception as e:  # noqa: BLE001
        print(f"{path}\tERROR\t{e}")
        ok_all = False
        continue
    results = decode(img, symbols=[ZBarSymbol.QRCODE])
    if results:
        payloads = ", ".join(r.data.decode("utf-8", "replace") for r in results)
        print(f"{path}\tOK\t{payloads}")
    else:
        print(f"{path}\tFAIL\t<no QR detected>")
        ok_all = False

sys.exit(0 if ok_all else 1)
