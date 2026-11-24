"""Locate one empty native checkbox in the observed small Turnstile widget.

This recognizes the ordinary UI control, not CAPTCHA pictures or answers.
Input is a cropped widget PNG; output contains geometry only.
"""
import io
import json
import sys
from PIL import Image


def locate(data):
    im = Image.open(io.BytesIO(data)).convert('RGB')
    width, height = im.size
    if not 250 <= width <= 600 or not 50 <= height <= 95:
        return None
    px = im.load()
    dark = lambda x, y: max(px[x, y]) < 170
    candidates = []
    for x in range(4, 42):
        for y in range(3, height - 18):
            if not dark(x, y):
                continue
            for side in range(18, min(29, height - y - 1) + 1):
                if x + side >= width:
                    continue
                edges = [(x + t, y) for t in range(2, side - 1)]
                edges += [(x + t, y + side) for t in range(2, side - 1)]
                edges += [(x, y + t) for t in range(2, side - 1)]
                edges += [(x + side, y + t) for t in range(2, side - 1)]
                if sum(dark(a, b) for a, b in edges) / len(edges) < .94:
                    continue
                interior = [px[a, b] for a in range(x + 3, x + side - 2)
                            for b in range(y + 3, y + side - 2)]
                if not interior or sum(min(p) >= 230 for p in interior) / len(interior) < .95:
                    continue
                candidates.append({'x': x + side / 2, 'y': y + side / 2, 'side': side})
    if not candidates:
        return None
    first = max(candidates, key=lambda c: c['side'])
    if any(abs(c['x'] - first['x']) > 3 or abs(c['y'] - first['y']) > 3
           for c in candidates):
        return None
    return first


if __name__ == '__main__':
    data = sys.stdin.buffer.read(1000001)
    if len(data) > 1000000:
        raise SystemExit('widget_image_too_large')
    print(json.dumps({'checkbox': locate(data)}))
