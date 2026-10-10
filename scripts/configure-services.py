#!/usr/bin/env python3
"""Set public analytics IDs and optional site-verification meta tags."""
import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--google', help='GA4 measurement ID, G-…')
parser.add_argument('--yandex', type=int, help='Yandex Metrika counter ID')
parser.add_argument('--google-verification', help='Google Search Console HTML-tag token')
parser.add_argument('--yandex-verification', help='Yandex Webmaster meta-tag token')
args = parser.parse_args()
if args.google is not None and not re.fullmatch(r'G-[A-Z0-9]+', args.google):
    parser.error('Google measurement ID must look like G-XXXXXXXXXX')
if args.yandex is not None and args.yandex <= 0:
    parser.error('Yandex counter ID must be a positive integer')

config_path = ROOT / 'analytics-config.json'
config = json.loads(config_path.read_text())
if args.google is not None:
    config['googleMeasurementId'] = args.google
if args.yandex is not None:
    config['yandexMetrikaId'] = args.yandex
config_path.write_text(json.dumps(config, indent=2) + '\n')

index_path = ROOT / 'index.html'
content = index_path.read_bytes().decode()
newline = '\r\n' if '\r\n' in content else '\n'
marker = '<!-- Site verification tags are inserted here by scripts/configure-services.py. -->'
for name, value in [('google-site-verification', args.google_verification), ('yandex-verification', args.yandex_verification)]:
    if value is None:
        continue
    tag = '<meta name="' + name + '" content="' + html.escape(value, quote=True) + '">'
    pattern = r'<meta name="' + re.escape(name) + r'" content="[^"]*">'
    if re.search(pattern, content):
        content = re.sub(pattern, lambda _: tag, content)
    else:
        content = content.replace(marker, tag + newline + marker, 1)
index_path.write_bytes(content.encode())
print('Public analytics settings and verification tags updated.')
