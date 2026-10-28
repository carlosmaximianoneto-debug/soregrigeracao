#!/usr/bin/env python3
"""Append only the public catalogue hosts; validate and gracefully reload Caddy."""
import hashlib
import os
from pathlib import Path
import subprocess
import time

CONFIG = Path('/etc/caddy/Caddyfile')
BACKUPS = Path('/srv/sorefrigeracao-site/backups')
EXPECTED_BEFORE = 'd1904dd88195d3d6a4baf00b4dfdeeef7783ec053022581caf2ec30a5a2543cf'
MARKER = '# BEGIN SOREFRIGERACAO PUBLIC SITE'
BLOCK = '''
# BEGIN SOREFRIGERACAO PUBLIC SITE
sorefrigeracao.com {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options DENY
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        -Server
    }
    reverse_proxy 127.0.0.1:3190
}

www.sorefrigeracao.com {
    redir https://sorefrigeracao.com{uri} permanent
}
# END SOREFRIGERACAO PUBLIC SITE
'''


def run(*command):
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo.')
    original = CONFIG.read_bytes()
    if MARKER.encode() in original:
        if BLOCK.strip().encode() not in original:
            raise SystemExit('Existing site block differs; review before replacing.')
        print('Proxy site block already installed; unchanged.')
        return
    if hashlib.sha256(original).hexdigest() != EXPECTED_BEFORE:
        raise SystemExit('Caddy changed since audit; review it before installing.')
    if b'sorefrigeracao.com' in original:
        raise SystemExit('Host already configured; refusing duplicate.')
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    backup = BACKUPS / ('Caddyfile.before-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    with backup.open('xb') as file:
        file.write(original)
    backup.chmod(0o600)
    candidate = CONFIG.with_name('Caddyfile.sorefrigeracao-candidate')
    candidate.write_bytes(original.rstrip() + b'\n' + BLOCK.encode())
    candidate.chmod(CONFIG.stat().st_mode & 0o777)
    run('caddy', 'validate', '--config', str(candidate), '--adapter', 'caddyfile')
    if CONFIG.read_bytes() != original:
        raise SystemExit('Caddy changed during preparation; no overwrite performed.')
    os.replace(candidate, CONFIG)
    try:
        run('systemctl', 'reload', 'caddy')
    except subprocess.SubprocessError:
        CONFIG.write_bytes(original)
        run('systemctl', 'reload', 'caddy')
        raise SystemExit('Reload failed; previous Caddy configuration restored.')
    print('Added only sorefrigeracao.com/www; Caddy gracefully reloaded. Backup:', backup)


if __name__ == '__main__':
    main()
