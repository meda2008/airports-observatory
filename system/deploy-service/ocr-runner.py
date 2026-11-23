"""Local-only ddddocr bridge. Images arrive via stdin, never a remote URL."""
import base64
import contextlib
import importlib.metadata
import io
import json
import hashlib
import math
import sys

def main():
    request = json.loads(sys.stdin.buffer.read(3_000_001))
    encoded = request.get('image', '')
    if not isinstance(encoded, str) or len(encoded) > 2_800_000:
        raise ValueError('image_size_invalid')
    image = base64.b64decode(encoded, validate=True)
    if not image or len(image) > 2_000_000:
        raise ValueError('image_size_invalid')
    from PIL import Image
    with Image.open(io.BytesIO(image)) as im:
        if im.width > 8192 or im.height > 8192 or im.width * im.height > 20_000_000:
            raise ValueError('image_dimensions_invalid')
        clip = request.get('clip')
        if clip is not None:
            viewport = request['viewport']
            vw, vh = float(viewport['width']), float(viewport['height'])
            x, y, w, h = (float(clip[k]) for k in ('x', 'y', 'width', 'height'))
            if not all(math.isfinite(v) for v in (vw, vh, x, y, w, h)) or vw <= 0 or vh <= 0 or x < 0 or y < 0 or w <= 0 or h <= 0 or x+w > vw+1 or y+h > vh+1:
                raise ValueError('crop_bounds_invalid')
            sx, sy = im.width/vw, im.height/vh
            im = im.crop((math.floor(x*sx), math.floor(y*sy), math.ceil((x+w)*sx), math.ceil((y+h)*sy)))
        if im.width > 2048 or im.height > 1024 or im.width * im.height > 1_000_000:
            raise ValueError('crop_dimensions_invalid')
        buffer = io.BytesIO()
        im.save(buffer, format='PNG')
        image = buffer.getvalue()
    image_sha256 = hashlib.sha256(image).hexdigest()
    if request.get('hashOnly') is True:
        print(json.dumps({'imageSha256': image_sha256}))
        return
    # Suppress library banners, never contaminate the JSON protocol.
    with contextlib.redirect_stdout(io.StringIO()):
        import ddddocr
        engine = ddddocr.DdddOcr(show_ad=False)
        text = engine.classification(image)
    print(json.dumps({'text': text, 'engine': 'ddddocr', 'version': importlib.metadata.version('ddddocr'), 'confidence': None, 'imageSha256': image_sha256}))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No input, code, credentials, or image paths in errors.
        print(json.dumps({'error': type(error).__name__}))
        sys.exit(1)
