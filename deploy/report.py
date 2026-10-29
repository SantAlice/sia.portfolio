#!/usr/bin/env python3
"""Store a deployment receipt separately from application and server files."""
from datetime import datetime, timezone
import base64
import json
import os
import urllib.error
import urllib.request

repo = os.environ['GITHUB_REPOSITORY']
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
if receipt['status'] != 'success':
    try:
        jobs = api('/actions/runs/' + os.environ['GITHUB_RUN_ID'] + '/jobs?per_page=100')['jobs']
        receipt['errors'] = []
        for job in jobs:
            if job['name'] != 'server' or not job.get('check_run_url'):
                continue
            check_id = job['check_run_url'].rsplit('/', 1)[-1]
            annotations = api('/check-runs/' + check_id + '/annotations?per_page=100')
            receipt['errors'].extend(item['message'] for item in annotations
                                     if item.get('annotation_level') == 'failure')
    except urllib.error.HTTPError as error:
        receipt['diagnostic_error'] = error.code
tree_payload['tree'] = [
    {'path': 'latest.json', 'mode': '100644', 'type': 'blob',
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
