"""Operator view of this CRS process. No secrets and no public listener changes."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import urllib.request
from pathlib import Path


def hold_path() -> Path | None:
    raw = os.environ.get('CRS_HOLD_FILE', '').strip()
    if not raw:
        return None
    return Path(raw)


def accepting() -> bool:
    path = hold_path()
    if path is None or not path.is_file():
        return True
    try:
        payload = json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, json.JSONDecodeError):
        return True
    return payload.get('stopped') is not True


def set_accepting(enabled: bool) -> None:
    path = hold_path()
    if path is None:
        raise RuntimeError('CRS_HOLD_FILE is not configured')
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'stopped': not enabled}, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)


def vpn_from_route(text: str) -> bool:
    """A second default route is the tunnel. Adapter names alone are not enough."""
    defaults = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 4 and parts[0] == '0.0.0.0' and parts[1] == '0.0.0.0':
            defaults.append(parts)
    return len(defaults) >= 2


def _route_text() -> str:
    if os.name != 'nt':
        return ''
    try:
        completed = subprocess.run(
            ['route', 'print', '-4'],
            capture_output=True, text=True, timeout=5, check=False,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
    except (OSError, subprocess.TimeoutExpired):
        return ''
    return completed.stdout or ''


def _addresses() -> list[str]:
    found: list[str] = []
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET, socket.SOCK_STREAM)
    except OSError:
        infos = []
    for info in infos:
        address = info[4][0]
        if address.startswith('127.') or address.startswith('169.254.'):
            continue
        if address not in found:
            found.append(address)
    return found


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(('127.0.0.1', port), 0.4):
            return True
    except OSError:
        return False


def _router_address() -> str | None:
    """Ask the LAN gateway for its WAN address. Failure leaves the field empty."""
    probe = (
        'M-SEARCH * HTTP/1.1\r\n'
        'HOST: 239.255.255.250:1900\r\n'
        'MAN: "ssdp:discover"\r\n'
        'MX: 1\r\n'
        'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n'
    ).encode()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(1.2)
    try:
        sock.sendto(probe, ('239.255.255.250', 1900))
        packet = sock.recv(4096).decode('utf-8', 'replace')
    except OSError:
        return None
    finally:
        sock.close()
    location = ''
    for line in packet.splitlines():
        if line.lower().startswith('location:'):
            location = line.split(':', 1)[1].strip()
    if not location.startswith('http://'):
        return None
    try:
        with urllib.request.urlopen(location, timeout=1.2) as response:
            description = response.read(200_000).decode('utf-8', 'replace')
    except (OSError, ValueError):
        return None
    marker = 'urn:schemas-upnp-org:service:WANIPConnection:'
    start = description.find(marker)
    if start < 0:
        return None
    control = description.find('<controlURL>', start)
    close = description.find('</controlURL>', control)
    if control < 0 or close < 0:
        return None
    control_url = description[control + len('<controlURL>'):close].strip()
    if control_url.startswith('/'):
        host = location.split('/', 3)
        control_url = host[0] + '//' + host[2] + control_url
    body = (
        '<?xml version="1.0"?>'
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"'
        ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
        '<s:Body><u:GetExternalIPAddress xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1"/>'
        '</s:Body></s:Envelope>'
    ).encode()
    request = urllib.request.Request(control_url, data=body, method='POST')
    request.add_header('Content-Type', 'text/xml; charset="utf-8"')
    request.add_header('SOAPAction', '"urn:schemas-upnp-org:service:WANIPConnection:1#GetExternalIPAddress"')
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            answer = response.read(100_000).decode('utf-8', 'replace')
    except (OSError, ValueError):
        return None
    tag = '<NewExternalIPAddress>'
    begin = answer.find(tag)
    end = answer.find('</NewExternalIPAddress>', begin)
    if begin < 0 or end < 0:
        return None
    address = answer[begin + len(tag):end].strip()
    octets = address.split('.')
    if len(octets) != 4 or not all(part.isdigit() and 0 <= int(part) <= 255 for part in octets):
        return None
    return address


def _release() -> str | None:
    state = os.environ.get('CRS_STATE_FILE', '').strip()
    if state:
        try:
            payload = json.loads(Path(state).read_text(encoding='utf-8-sig'))
            sha = str(payload.get('sha') or '').strip()
            if sha:
                return sha
        except (OSError, json.JSONDecodeError):
            pass
    root = os.environ.get('CRS_RELEASE_ROOT', '').strip()
    if root:
        return Path(root).name or None
    return None


def _disks() -> list[dict]:
    import shutil
    rows = []
    targets = [('Данные', os.environ.get('UPLOAD_DIR', ''))]
    backup = os.environ.get('CRS_BACKUP_DIR', '').strip()
    if backup:
        targets.append(('Резервные копии', backup))
    seen = set()
    for label, raw in targets:
        if not raw:
            continue
        path = Path(raw)
        anchor = path.anchor
        if not anchor or anchor in seen:
            continue
        seen.add(anchor)
        try:
            usage = shutil.disk_usage(path if path.exists() else anchor)
        except OSError:
            continue
        free_gb = round(usage.free / 1024 / 1024 / 1024, 1)
        rows.append({'label': label, 'free_gb': free_gb, 'low': usage.free < 5 * 1024 ** 3})
    return rows


def router_is_public(address: str | None) -> bool:
    if not address:
        return False
    parts = address.split('.')
    if address.startswith(('10.', '127.', '192.168.', '169.254.', '0.')):
        return False
    if parts[0] == '100' and parts[1].isdigit() and 64 <= int(parts[1]) <= 127:
        return False
    second = parts
    if second[0] == '172' and second[1].isdigit() and 16 <= int(second[1]) <= 31:
        return False
    return True


def status() -> dict:
    router = _router_address()
    return {
        'accepting': accepting(),
        'services': {
            'postgres': _port_open(5432),
            'api': _port_open(8000),
            'https': _port_open(8443),
        },
        'release': _release(),
        'lan': _addresses(),
        'vpn_active': vpn_from_route(_route_text()),
        'router_address': router,
        'router_public': router_is_public(router),
        'local_https': 'https://127.0.0.1:8443',
        'disks': _disks(),
        'control_ready': hold_path() is not None,
    }
