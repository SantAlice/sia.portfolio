#!/usr/bin/env python3
"""Build a static release without source archives, credentials or deployment files."""
import argparse
import tarfile
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
files = [ROOT / name for name in ['index.html', 'robots.txt', 'sitemap.xml', 'analytics-config.json']]
files.extend(path for path in ROOT.glob('yandex_*.html')
             if re.fullmatch(r'yandex_[0-9a-f]{16}\.html', path.name))
for folder in ['css', 'js', 'public']:
    files.extend(path for path in (ROOT / folder).rglob('*')
                 if path.is_file() and path.suffix.lower() not in {'.mov', '.zip'})
args.output.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(args.output, 'w:gz', compresslevel=1) as archive:
    for path in sorted(files):
        archive.add(path, arcname=str(path.relative_to(ROOT)), recursive=False)
print(f'Release: {args.output} ({len(files)} files)')
