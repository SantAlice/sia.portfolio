#!/usr/bin/env python3
"""Inspect the authorized server via SSH; never print authentication secrets."""
import os
import sys

import paramiko

HOST = '135.106.163.207'
if sys.argv[1:] != ['inspect']:
    raise SystemExit('Only the read-only inspect operation is currently enabled.')
password = os.environ.get('ANASTASIA_DEPLOY_PASSWORD')
if not password:
    raise SystemExit('Missing encrypted deployment secret.')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username='root', password=password, port=22,
               timeout=15, auth_timeout=15, banner_timeout=15,
               allow_agent=False, look_for_keys=False)
commands = [
    ('System and capacity', 'uname -a; df -h /; free -m'),
    ('Listeners', 'ss -lntp'),
    ('Web server programs', 'command -v nginx; command -v apache2; command -v caddy; command -v certbot; command -v docker'),
    ('Virtual host files', 'ls -l /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/apache2/sites-enabled 2>/dev/null'),
    ('Nginx host routing', "if command -v nginx >/dev/null; then nginx -T 2>/dev/null | awk '/^[[:space:]]*(server_name|listen|root|ssl_certificate|proxy_pass)[[:space:]]/'; fi"),
    ('DNS from server', 'getent ahostsv4 anastasia.pics; getent ahostsv4 www.anastasia.pics'),
]
try:
    key = client.get_transport().get_remote_server_key()
    print('SSH host key type:', key.get_name())
    print('SSH host key fingerprint:', key.get_fingerprint().hex())
    for label, command in commands:
        print('\n' + label + ':', flush=True)
        _, stdout, stderr = client.exec_command(command, timeout=30)
        print(stdout.read().decode(errors='replace'), end='')
        error = stderr.read().decode(errors='replace')
        if error:
            print(error, end='')
        print('Command exit:', stdout.channel.recv_exit_status(), flush=True)
finally:
    client.close()
