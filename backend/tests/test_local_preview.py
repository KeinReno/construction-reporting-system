import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import pytest
from scripts.windows.local_preview import public_tunnel_url, gateway_command


def test_gateway_banner_never_becomes_customer_url():
    assert public_tunnel_url('Manage keys at https://admin.localhost.run') is None
    assert public_tunnel_url('Documentation: https://localhost.run/docs') is None
    assert public_tunnel_url('https://not-the-app.example') is None
    assert public_tunnel_url('tunnel https://123abc.lhr.life forwarded')=='https://123abc.lhr.life'
    assert public_tunnel_url('1: https://abcdefghijklmnopqrstuvwxyz234567.srv.us/')=='https://abcdefghijklmnopqrstuvwxyz234567.srv.us'
    assert public_tunnel_url('https://abc.srv.us.attacker.example') is None
    assert public_tunnel_url('https://abc.lhr.life.attacker.example') is None


def test_stable_gateway_uses_only_dedicated_key(tmp_path):
    with pytest.raises(ValueError,match='key missing'):
        gateway_command('ssh',tmp_path,58494,'srv.us')
    (tmp_path/'gateway_ed25519').write_text('synthetic-key-placeholder')
    command=gateway_command('ssh',tmp_path,58494,'srv.us')
    assert command[command.index('-i')+1]==str(tmp_path/'gateway_ed25519')
    assert command[-1]=='nomatch@srv.us'
    assert 'IdentityAgent=none' in command
    assert 'IdentitiesOnly=yes' in command
    assert '1:127.0.0.1:58494' in command
    assert 'nokey@localhost.run' not in command
