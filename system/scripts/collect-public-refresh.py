"""Bounded public GET capture. No login, cookies, orders, or inferred prices."""
import concurrent.futures
import datetime
import hashlib
import html
from html.parser import HTMLParser
import ipaddress
import json
import pathlib
import re
import socket
import threading
import urllib.parse
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'catalog/refresh/2026-10-26/batch-pages'
OUT.mkdir(parents=True, exist_ok=True)
RAW = OUT / 'raw'
RAW.mkdir(exist_ok=True)
CATALOG = json.loads((ROOT / 'catalog/catalog.v1.json').read_text(encoding='utf-8-sig'))
utc = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
started = utc()
MAX_BYTES = 2 * 1024 * 1024
lock = threading.Lock()
captured = {}

def safe_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('not a public unauthenticated HTTP URL')
    if parsed.port and parsed.port not in (80, 443):
        raise ValueError('nonstandard port not collected')
    if parsed.query or parsed.fragment:
        raise ValueError('query or fragment not admitted by batch collector')
    if parsed.hostname.lower() == 'localhost':
        raise ValueError('private address not collected')
    for address in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(address[4][0]).is_global:
            raise ValueError('nonpublic resolved address not collected')
    return urllib.parse.urlunsplit(parsed)

class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.text = []; self.links = []; self.title = []; self.in_title = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'noscript'): self.skip += 1
        if tag == 'title': self.in_title = True
        if tag == 'a' and attrs.get('href'): self.links.append(attrs['href'])
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'): self.skip = max(0, self.skip - 1)
        if tag == 'title': self.in_title = False
    def handle_data(self, data):
        if self.in_title: self.title.append(data)
        if not self.skip and data.strip(): self.text.append(data.strip())

def capture(url, role):
    source_id = 'R20261026-' + hashlib.sha256(url.encode()).hexdigest()[:20]
    result = {'id': source_id, 'url': url, 'role': role, 'requestedAt': utc(), 'capturedAt': None,
              'status': None, 'sha256': None, 'snapshotRelativePath': None, 'redirects': [], 'error': None}
    response = None
    try:
        current = url
        for _ in range(6):
            safe_url(current)
            response = requests.get(current, headers={'User-Agent': 'Airports-public-evidence/1.0', 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.5'},
                                    timeout=(5, 12), allow_redirects=False, stream=True)
            if response.status_code in (301, 302, 303, 307, 308):
                target = urllib.parse.urljoin(current, response.headers.get('Location', ''))
                # Retain navigation metadata; never submit a login/checkout request.
                result['redirects'].append({'url': current, 'status': response.status_code, 'target': target})
                response.close(); current = target
                continue
            break
        else: raise ValueError('redirect limit reached')
        result['finalUrl'] = current
        result['status'] = response.status_code
        result['headers'] = {k.lower(): v for k, v in response.headers.items() if k.lower() in ('content-type', 'date', 'etag', 'last-modified', 'content-encoding')}
        payload = bytearray()
        for chunk in response.iter_content(65536):
            payload.extend(chunk)
            if len(payload) > MAX_BYTES:
                result['bodyTruncated'] = True
                break
        body = bytes(payload)
        target = RAW / (source_id + '.body')
        target.write_bytes(body)
        result.update({'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body), 'snapshotRelativePath': target.relative_to(ROOT).as_posix(),
                       'bodyRepresentation': 'HTTP response body after content decoding; exact retained bytes'})
        encoding = response.encoding if response.encoding and response.encoding.lower() not in ('iso-8859-1', 'ascii') else 'utf-8'
        text = body.decode(encoding, errors='replace')
        page = Page(); page.feed(text)
        visible = re.sub(r'\s+', ' ', html.unescape(' '.join(page.text)))
        result['title'] = ' '.join(page.title)[:180]
        result['visibleCharacters'] = len(visible)
        if response.status_code >= 400: state = 'http_error'
        elif re.search(r'just a moment|checking your browser|verify you are human|captcha|attention required', visible, re.I): state = 'challenge_or_access_control'
        elif re.search(r'<script', text, re.I) and len(visible) < 150: state = 'javascript_shell_not_rendered'
        elif re.search(r'登录|登入|sign in|log in', visible, re.I) and not re.search(r'[$¥￥]\s*\d|\d\s*(?:元|USD|CNY)', visible, re.I): state = 'login_or_limited_public_content'
        else: state = 'public_response_needs_content_review'
        result['contentStatus'] = state
        result['priceHints'] = list(dict.fromkeys(re.findall(r'.{0,45}(?:[$¥￥]\s*\d[\d,.]*|\d[\d,.]*\s*(?:元|USD|CNY)).{0,70}', visible)))[:12]
        result['paymentHints'] = list(dict.fromkeys(re.findall(r'.{0,45}(?:支付宝|微信支付|Alipay|WeChat Pay|PayPal|credit cards?|Visa|Mastercard|USDT|Bitcoin|加密货币).{0,70}', visible, re.I)))[:8]
        result['discoveredLinks'] = []
        origin = urllib.parse.urlsplit(current)
        for link in page.links:
            target_url = urllib.parse.urljoin(current, link)
            target_parts = urllib.parse.urlsplit(target_url)
            if target_parts.hostname != origin.hostname or target_parts.query or target_parts.fragment: continue
            if re.search(r'(?:login|register|logout|checkout|order|cart|buy|subscribe|payment/|invite|auth)', target_parts.path, re.I): continue
            if re.search(r'(?:pricing|prices?|plans?|packages?|faq|billing|help|payment|套餐|价格|支付)', target_parts.path, re.I):
                if target_url != current and target_url not in result['discoveredLinks']: result['discoveredLinks'].append(target_url)
        (RAW / (source_id + '.text.txt')).write_text(visible, encoding='utf-8')
    except Exception as error:
        result['error'] = type(error).__name__ + ': ' + str(error).split('\n')[0][:350]
        result.setdefault('contentStatus', 'request_failed_not_service_status')
    finally:
        if response is not None: response.close()
        result['capturedAt'] = utc()
        (RAW / (source_id + '.metadata.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        with lock: captured[url] = result
    return result

groups = {}
for record in CATALOG['catalog']:
    if record.get('officialUrl'): groups.setdefault(record['officialUrl'], []).append(record['id'])
print(json.dumps({'phase': 'root_requests', 'records': len(CATALOG['catalog']), 'uniqueCandidateUrls': len(groups), 'startedAt': started}), flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    futures = {executor.submit(capture, url, 'candidate_root'): url for url in groups}
    for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
        future.result()
        if index % 25 == 0: print(json.dumps({'rootsCompleted': index, 'totalRoots': len(groups)}), flush=True)
descendants = sorted({url for result in list(captured.values()) for url in result.get('discoveredLinks', [])[:2] if url not in captured})
print(json.dumps({'phase': 'observed_public_links', 'urls': len(descendants)}), flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
    list(executor.map(lambda url: capture(url, 'linked_public_information'), descendants))
items = []
for record in CATALOG['catalog']:
    root = captured.get(record.get('officialUrl'))
    sources = [root] if root else []
    if root: sources.extend(captured[url] for url in root.get('discoveredLinks', [])[:2] if url in captured)
    items.append({'recordId': record['id'], 'name': record['name'], 'candidateUrl': record.get('officialUrl'),
                  'identityStatus': 'candidate_domain_operator_unverified', 'sourceIds': [source['id'] for source in sources],
                  'checkedAt': max((source['capturedAt'] for source in sources), default=None),
                  'collectionStatus': root['contentStatus'] if root else 'missing_candidate_url',
                  'offerStatus': 'not_structurally_verified', 'paymentStatus': 'not_structurally_verified',
                  'limitation': '取得公开响应不等于已确认经营主体、当前标价或支付渠道；线索待逐字段复核。'})
document = {'schemaVersion': 'airports-refresh-collection.v1', 'startedAt': started, 'completedAt': utc(),
            'scope': 'all215_legacy_candidate_urls_plus_at_most2_observed_same_host_information_links',
            'notPerformed': ['login', 'registration', 'order_creation', 'payment', 'cookie_access', 'service_probe'],
            'sources': list(captured.values()), 'items': items}
(OUT / 'collection.json').write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'phase': 'done', 'sources': len(captured), 'records': len(items), 'completedAt': document['completedAt']}), flush=True)
