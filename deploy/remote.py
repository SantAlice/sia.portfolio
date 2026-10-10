#!/usr/bin/env python3
"""Inspect/deploy only anastasia.pics, preserving existing Nginx hosts."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import socket
import sys
import time
import urllib.request
from urllib.parse import urlparse

import paramiko

HOST = '135.106.163.207'
DOMAIN = 'anastasia.pics'
BASE = '/var/www/anastasia.pics'
CONFIG = '/etc/nginx/sites-available/zz-anastasia.pics'
ENABLED = '/etc/nginx/sites-enabled/zz-anastasia.pics'
MARKER = '# Managed for anastasia.pics only'
operation = sys.argv[1] if len(sys.argv) > 1 else ''
if operation not in {'inspect', 'deploy', 'verify'}:
    raise SystemExit('Choose inspect, deploy or verify.')
password = os.environ.get('ANASTASIA_DEPLOY_PASSWORD')
if not password:
    raise SystemExit('Missing encrypted deployment secret.')

def notice(title, message):
    message = str(message).replace(password, '[redacted]').replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::notice title={title}::{message}', flush=True)

class PortfolioHostKeyPolicy(paramiko.MissingHostKeyPolicy):
    def missing_host_key(self, client, hostname, key):
        # Pinned from the first successful authorized inspection/deployment.
        if key.get_fingerprint().hex() != 'd12bcf338fdef24e4a00a8008f7354e6':
            raise paramiko.SSHException('Server SSH host key changed; inspect before continuing.')
        client.get_host_keys().add(hostname, key.get_name(), key)


client = paramiko.SSHClient()
client.set_missing_host_key_policy(PortfolioHostKeyPolicy())

def run(command, timeout=60, required=True):
    _, out, err = client.exec_command('set -e\n' + command, timeout=timeout)
    output, error = out.read().decode(errors='replace'), err.read().decode(errors='replace')
    code = out.channel.recv_exit_status()
    if required and code:
        raise RuntimeError(f'Command failed ({code}): {command}\n{error}\n{output}')
    return output

def write(sftp, path, text):
    with sftp.file(path, 'w') as target:
        target.write(text)

def snapshot():
    return run("find /etc/nginx -type f ! -name zz-anastasia.pics -exec sha256sum {} + | sort")

def old_sites():
    results = {}
    for host in ['aaautomation.space', 'vancelot3d.space']:
        results[host] = run(shlex.join(['bash', '-o', 'pipefail', '-c', f'curl --silent --show-error --fail --max-time 20 --resolve {host}:443:127.0.0.1 https://{host}/ | sha256sum']))
    return results

def verify_portfolio():
    tls = run(f"grep -q 'listen 443 ssl;' {CONFIG} && echo yes || true").strip() == 'yes'
    scheme, port = ('https', 443) if tls else ('http', 80)
    base = f'{scheme}://{DOMAIN}'
    checks = [('/', 200), ('/robots.txt', 200), ('/sitemap.xml', 200),
              ('/analytics-config.json', 200),
              ('/public/img/chrome-flower-frames/frame-01.webp', 200),
              ('/public/img/chrome-flower-frames/frame-64.webp', 200),
              ('/public/video/hero.mp4', 206),
              ('/public/video/chrome-flower-scrub.mp4', 206)]
    for path, expected in checks:
        args = ['curl', '--silent', '--show-error', '--max-time', '20',
                '--resolve', f'{DOMAIN}:{port}:127.0.0.1',
                '-o', '/dev/null', '-w', '%{http_code}']
        if expected == 206:
            args.extend(['-H', 'Range: bytes=0-1023'])
        status = run(shlex.join(args + [base + path])).strip()
        if status != str(expected):
            raise RuntimeError(f'{path}: expected HTTP {expected}, received {status}')
    notice('Portfolio checks passed', 'HTML, SEO files, analytics configuration, mobile frames and video Range requests passed over ' + scheme.upper())
    if tls:
        for source, port in [(f'http://{DOMAIN}', 80), (f'http://www.{DOMAIN}', 80),
                             (f'https://www.{DOMAIN}', 443)]:
            host = urlparse(source).hostname
            headers = run(shlex.join(['curl', '--silent', '--show-error', '--max-time', '20',
                                      '--resolve', f'{host}:{port}:127.0.0.1', '-I', source + '/']))
            if ' 301 ' not in headers or 'location: https://anastasia.pics/' not in headers.lower():
                raise RuntimeError('Canonical redirect failed: ' + source)
        with urllib.request.urlopen(base + '/', timeout=30) as response:
            html = response.read().decode('utf-8')
            if response.status != 200 or 'Анастасия Куликова' not in html:
                raise RuntimeError('Public HTTPS portfolio check failed.')
        expected_config = json.loads(Path('analytics-config.json').read_text())
        with urllib.request.urlopen(base + '/analytics-config.json', timeout=30) as response:
            if json.load(response) != expected_config:
                raise RuntimeError('Public analytics configuration differs from the release.')
        local_html = Path('index.html').read_text()
        for tag in re.findall(r'<meta name="(?:google-site-verification|yandex-verification)" content="[^"]*">', local_html):
            if tag not in html:
                raise RuntimeError('Public HTML is missing a site verification tag.')
        for path in Path('.').glob('yandex_*.html'):
            if not re.fullmatch(r'yandex_[0-9a-f]{16}\.html', path.name):
                continue
            with urllib.request.urlopen(base + '/' + path.name, timeout=30) as response:
                if response.read().decode('utf-8') != path.read_text():
                    raise RuntimeError('Public Yandex verification file differs from the release.')
        notice('Analytics and verification files checked', 'Public analytics IDs, site-verification meta tags and Yandex HTML files match the release.')
        notice('Public HTTPS and redirects verified', 'Public domain serves the portfolio with a trusted certificate; HTTP and www redirect permanently to https://anastasia.pics/.')
        notice('Certificate details', run('openssl x509 -in /etc/letsencrypt/live/anastasia.pics/fullchain.pem -noout -dates -issuer -ext subjectAltName'))
        notice('Certificate renewal timers', run("systemctl list-timers --all --no-pager | grep -E 'certbot|acme' || true"))

def config(tls=False):
    locations = '''
    root /var/www/anastasia.pics/current;
    index index.html;
    charset utf-8;
    access_log /var/log/nginx/anastasia.pics.access.log;
    error_log /var/log/nginx/anastasia.pics.error.log;
    location ^~ /.well-known/acme-challenge/ { root /var/www/anastasia.pics/acme; }
    location = /analytics-config.json { add_header Cache-Control "no-store"; try_files $uri =404; }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location / { try_files $uri $uri/ =404; }
    location ~ /\\. { deny all; }
    location ~* \\.(?:css|js|woff2?|ttf|webp|jpg|jpeg|png|svg|mp4)$ { expires 7d; try_files $uri =404; }
'''
    if not tls:
        return MARKER + '\nserver {\n    listen 80;\n    listen [::]:80;\n    server_name anastasia.pics www.anastasia.pics;\n' + locations + '}\n'
    cert = '/etc/letsencrypt/live/anastasia.pics'
    return MARKER + f'''
server {{
    listen 80;
    listen [::]:80;
    server_name anastasia.pics www.anastasia.pics;
    location ^~ /.well-known/acme-challenge/ {{ root {BASE}/acme; }}
    location / {{ return 301 https://anastasia.pics$request_uri; }}
}}
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.anastasia.pics;
    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
    return 301 https://anastasia.pics$request_uri;
}}
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name anastasia.pics;
    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
''' + locations + '}\n'

try:
    client.connect(HOST, username='root', password=password, port=22,
                   timeout=15, auth_timeout=15, banner_timeout=15,
                   allow_agent=False, look_for_keys=False)
    key = client.get_transport().get_remote_server_key()
    notice('SSH host fingerprint', key.get_fingerprint().hex())
    if operation == 'inspect':
        commands = [
            ('Capacity', 'df -h /; free -m'),
            ('Nginx routing', "nginx -T 2>/dev/null | awk '/^[[:space:]]*(server_name|listen|root|ssl_certificate|proxy_pass)[[:space:]]/'"),
            ('DNS', 'timeout 10 getent ahostsv4 anastasia.pics; timeout 10 getent ahostsv4 www.anastasia.pics'),
        ]
        for label, command in commands:
            notice(label, run(command, required=False))
    elif operation == 'verify':
        verify_portfolio()
        notice('Existing sites respond', old_sites())
    else:
        release = Path(sys.argv[2])
        if not release.is_file():
            raise RuntimeError('Missing local release archive.')
        before = snapshot()
        sites_before = old_sites()
        notice('Existing sites before deployment', sites_before)
        # Abort if this domain is already managed somewhere else.
        routing = run('nginx -T 2>/dev/null')
        if DOMAIN in routing and MARKER not in routing:
            raise RuntimeError('Domain already exists in an unmanaged Nginx configuration.')
        free = int(run("df --output=avail -B1 /var/www | tail -1").strip())
        if free < release.stat().st_size + 800_000_000:
            raise RuntimeError('Insufficient free disk space for a safe release.')
        stamp = time.strftime('%Y%m%d%H%M%S', time.gmtime())
        folder = f'{BASE}/releases/{stamp}'
        sftp = client.open_sftp()
        config_before = None
        link_before = None
        for path in [CONFIG, ENABLED]:
            try:
                sftp.lstat(path)
            except FileNotFoundError:
                continue
            if path == CONFIG:
                with sftp.file(path) as source:
                    config_before = source.read().decode()
                if not config_before.startswith(MARKER):
                    raise RuntimeError('Refusing to overwrite an existing unmanaged host.')
            elif sftp.readlink(path) != CONFIG:
                raise RuntimeError('Enabled host belongs to another configuration.')
        try:
            link_before = sftp.readlink(f'{BASE}/current')
        except FileNotFoundError:
            # A pre-existing directory must never be replaced.
            if run(f'test -e {BASE}/current && echo exists || true').strip():
                raise RuntimeError('Current path is not a managed symlink.')
        if config_before is None and run(f'test -e {BASE} && echo exists || true').strip():
            raise RuntimeError('Site directory already exists without a managed host.')
        run(f'mkdir -p {folder} {BASE}/acme/.well-known/acme-challenge')
        archive = f'{BASE}/releases/{stamp}.tar.gz'
        notice('Release upload', f'{release.stat().st_size // 1024 // 1024} MB')
        sftp.put(str(release), archive)
        digest = hashlib.sha256(release.read_bytes()).hexdigest()
        if run(f'sha256sum {archive}').split()[0] != digest:
            raise RuntimeError('Release checksum mismatch.')
        run(f'tar -xzf {archive} --no-same-owner -C {folder}; chmod -R a+rX {folder}; rm {archive}', timeout=180)
        tls = bool(config_before and 'listen 443 ssl;' in config_before)
        # DNS must point here before requesting a certificate.
        domains = [DOMAIN, 'www.' + DOMAIN]
        dns = {}
        for host in domains:
            try:
                dns[host] = sorted({row[4][0] for row in socket.getaddrinfo(host, 80, proto=socket.IPPROTO_TCP)})
            except socket.gaierror:
                dns[host] = []
        notice('Public DNS', dns)
        try:
            run(f'ln -s {folder} {BASE}/current.next; mv -Tf {BASE}/current.next {BASE}/current')
            write(sftp, CONFIG, config(tls))
            run(f'ln -sf {CONFIG} {ENABLED}; nginx -t && systemctl reload nginx')
            html = run('curl --fail --silent --show-error --max-time 20 -H "Host: anastasia.pics" http://127.0.0.1/')
            if 'Анастасия Куликова' not in html:
                raise RuntimeError('New HTTP host does not serve the portfolio.')
            if all(dns[host] == [HOST] for host in domains):
                run(f'certbot certonly --webroot -w {BASE}/acme --cert-name {DOMAIN} -d {DOMAIN} -d www.{DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring', timeout=180)
                write(sftp, CONFIG, config(True))
                run('nginx -t && systemctl reload nginx')
                run('curl --fail --silent --show-error --max-time 20 --resolve anastasia.pics:443:127.0.0.1 https://anastasia.pics/ > /dev/null')
                tls = True
            if snapshot() != before or old_sites() != sites_before:
                raise RuntimeError('Existing host configuration or responses changed; reverting new host.')
            verify_portfolio()
            notice('Existing sites verified', 'Both site responses and all pre-existing Nginx configuration files match the baseline.')
            notice('Deployment result', 'https://anastasia.pics/ is live' if tls else 'HTTP release installed. HTTPS awaits DNS A records for anastasia.pics and www.anastasia.pics pointing to 135.106.163.207.')
        except Exception:
            if config_before is None:
                run(f'rm -f {ENABLED} {CONFIG}')
            else:
                write(sftp, CONFIG, config_before)
            if link_before:
                run(f'ln -s {shlex.quote(link_before)} {BASE}/current.rollback; mv -Tf {BASE}/current.rollback {BASE}/current')
            else:
                run(f'rm -f {BASE}/current')
            run('nginx -t && systemctl reload nginx')
            raise
        finally:
            sftp.close()
except Exception as exc:
    detail = str(exc).replace(password, '[redacted]').replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error title=Server operation failed::{type(exc).__name__}: {detail}', flush=True)
    raise SystemExit(1)
finally:
    client.close()
