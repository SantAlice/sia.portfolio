#!/usr/bin/env python3
"""Store a deployment receipt separately from application and server files."""
from datetime import datetime, timezone
import base64
import json
import os
from pathlib import Path
import socket
import urllib.error
import urllib.request

repo = os.environ['GITHUB_REPOSITORY']
diagnose = os.environ.get('DIAGNOSE_ONLY') == 'true'
target_run = (str(json.loads(Path('deploy/diagnose-request.json').read_text())['run_id'])
              if diagnose else os.environ['GITHUB_RUN_ID'])
if not target_run.isdigit():
    raise RuntimeError('Invalid diagnostic run ID.')
branch = 'deployment-status'
base = f'https://api.github.com/repos/{repo}'
token = os.environ['GH_STATUS_TOKEN']


def api(path, method='GET', data=None):
    request = urllib.request.Request(
        base + path, method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Authorization': 'Bearer ' + token,
                 'Accept': 'application/vnd.github+json',
                 'Content-Type': 'application/json',
                 'User-Agent': 'sia-portfolio-deployment'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


try:
    previous = api('/git/ref/heads/' + branch)['object']['sha']
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
    previous = None

tree_payload = {}
if previous:
    existing = api('/contents/latest.json?ref=' + branch)
    old_receipt = json.loads(base64.b64decode(existing['content']))
    if old_receipt.get('kind') != 'sia.portfolio-deployment-receipt':
        raise RuntimeError('Refusing to replace an unmanaged deployment-status branch.')
    tree_payload['base_tree'] = api('/git/commits/' + previous)['tree']['sha']

receipt = {'kind': 'sia.portfolio-deployment-receipt',
           'status': os.environ['DEPLOYMENT_RESULT'],
           'sha': os.environ['GITHUB_SHA'],
           'run_id': os.environ['GITHUB_RUN_ID'],
           'run_url': f'https://github.com/{repo}/actions/runs/' + os.environ['GITHUB_RUN_ID'],
           'recorded_at': datetime.now(timezone.utc).isoformat()}
if diagnose:
    receipt['kind'] = 'sia.portfolio-deployment-diagnostic'
    receipt['for_run_id'] = target_run
if receipt['status'] != 'success':
    try:
        jobs = api('/actions/runs/' + target_run + '/jobs?per_page=100')['jobs']
        receipt['errors'] = []
        for job in jobs:
            if job['name'] != 'server' or not job.get('check_run_url'):
                continue
            check_id = job['check_run_url'].rsplit('/', 1)[-1]
            annotations = api('/check-runs/' + check_id + '/annotations?per_page=100')
            receipt['errors'].extend(item['message'] for item in annotations
                                     if item.get('annotation_level') == 'failure')
            receipt['failed_steps'] = [s['name'] for s in job.get('steps', [])
                                       if s.get('conclusion') == 'failure']
            receipt['server_diagnostics'] = {a['title']: a['message'] for a in annotations
                if a.get('title') in ['Public DNS', 'Portfolio checks passed', 'Existing sites before deployment']}
    except urllib.error.HTTPError as error:
        receipt['diagnostic_error'] = error.code
if diagnose:
    receipt['dns'] = {}
    for host in ['anastasia.pics', 'www.anastasia.pics', 'api.github.com']:
        try:
            receipt['dns'][host] = sorted({r[4][0] for r in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})
        except socket.gaierror as error:
            receipt['dns'][host] = str(error)
    try:
        with urllib.request.urlopen('https://data.iana.org/rdap/dns.json', timeout=20) as response:
            bootstrap = json.load(response)
        service = next(urls[0] for zones, urls in bootstrap['services'] if 'pics' in zones)
        with urllib.request.urlopen(service.rstrip('/') + '/domain/anastasia.pics', timeout=20) as response:
            domain = json.load(response)
        receipt['registration'] = {
            'status': domain.get('status', []),
            'nameservers': [n.get('ldhName') for n in domain.get('nameservers', [])],
            'events': domain.get('events', [])}
    except Exception as error:
        receipt['registration_error'] = str(error)
tree_payload['tree'] = [
    {'path': 'diagnostics.json' if diagnose else 'latest.json', 'mode': '100644', 'type': 'blob',
     'content': json.dumps(receipt, indent=2) + '\n'}]
tree = api('/git/trees', 'POST', tree_payload)
commit = api('/git/commits', 'POST', {
    'message': 'Record deployment ' + os.environ['GITHUB_SHA'][:12],
    'tree': tree['sha'], 'parents': [previous] if previous else []})
if previous:
    api('/git/refs/heads/' + branch, 'PATCH', {'sha': commit['sha']})
else:
    api('/git/refs', 'POST', {'ref': 'refs/heads/' + branch, 'sha': commit['sha']})
print('Deployment receipt saved:', receipt['status'], receipt['sha'])
