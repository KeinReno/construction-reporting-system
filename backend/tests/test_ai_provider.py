"""Safety, grounding and API gates for optional CRS GPT mode."""
import json

import pytest
from fastapi.testclient import TestClient

from app import ai_provider
from app.main import Assignment, Site, User, create_app, hash_password


def sample():
    return {
        "report_count": 2, "no_work_count": 1, "incident_count": 0,
        "material_count": 0, "period": {"from_date": None, "to_date": None},
        "volumes": [{"site_id": "PRIVATE-ID", "work_type": "Монтаж", "unit": "м",
                     "quantity": "10", "source_report_ids": ["SOURCE-ID"]}],
        "financial_totals_kopecks": {"expense": 10000},
        "equipment_hours": [],
        "material_movements": [], "daily": [],
        "timeline_truncated": False, "source_report_ids": ["SOURCE-ID"],
        "raw_text": "PRIVATE CUSTOMER MESSAGE SHOULD NEVER LEAVE",
    }


def test_external_disabled_by_default(monkeypatch):
    for k in ("CRS_AI_EXTERNAL_ALLOWED", "CRS_AI_DATA_POLICY_APPROVED", "OPENAI_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    assert ai_provider.status()["enabled"] is False
    with pytest.raises(ai_provider.AIUnavailable, match="отключён"):
        ai_provider.answer("Что известно?", sample(), "one-user")


def test_no_raw_text_or_uuids_in_outbound_aggregates():
    data = json.dumps(ai_provider.compact_aggregates(sample()), ensure_ascii=False)
    assert "PRIVATE CUSTOMER" not in data
    assert "PRIVATE-ID" not in data
    assert "SOURCE-ID" not in data
    assert "10" in data


def test_opt_in_requires_both_policy_flags(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "TEST-SECRET")
    monkeypatch.setenv("CRS_AI_EXTERNAL_ALLOWED", "1")
    monkeypatch.delenv("CRS_AI_DATA_POLICY_APPROVED", raising=False)
    assert not ai_provider.status()["enabled"]
    monkeypatch.setenv("CRS_AI_DATA_POLICY_APPROVED", "1")
    assert ai_provider.status()["enabled"]
    monkeypatch.setenv("CRS_AI_MODEL", "not-allowlisted")
    assert not ai_provider.status()["enabled"]


def test_valid_response_is_grounded_and_does_not_return_secrets(monkeypatch):
    ai_provider._calls.clear()
    monkeypatch.setenv("OPENAI_API_KEY", "TEST-SECRET")
    monkeypatch.setenv("CRS_AI_EXTERNAL_ALLOWED", "1")
    monkeypatch.setenv("CRS_AI_DATA_POLICY_APPROVED", "1")
    monkeypatch.setenv("CRS_AI_MODEL", "gpt-6-luna")
    captured = {}

    class Response:
        def raise_for_status(self):
            return None
        def json(self):
            return {"status": "completed", "output": [{"type": "message", "content": [
                {"type": "output_text", "text": "Два отчёта. Без работ: один."}
            ]}]}

    class Client:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
        def __enter__(self):
            return self
        def __exit__(self, *unused):
            return False
        def post(self, url, *, json, headers):
            captured.update({"url": url, "payload": json, "headers": headers})
            return Response()

    monkeypatch.setattr(ai_provider.httpx, "Client", Client)
    result = ai_provider.answer("Что по отчётам?", sample(), "one-user")
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["payload"]["store"] is False
    assert result["answer"] == "Два отчёта. Без работ: один."
    assert result["source_report_ids"] == ["SOURCE-ID"]
    assert "TEST-SECRET" not in json.dumps(result)
    outbound = json.dumps(captured["payload"], ensure_ascii=False)
    assert "PRIVATE CUSTOMER" not in outbound
    assert "SOURCE-ID" not in outbound


def test_manager_gate_and_disabled_api(tmp_path, monkeypatch):
    monkeypatch.delenv("CRS_AI_EXTERNAL_ALLOWED", raising=False)
    monkeypatch.delenv("CRS_AI_DATA_POLICY_APPROVED", raising=False)
    database = "sqlite:///" + str(tmp_path / "ai-test.db")
    api = create_app(database_url=database, storage=str(tmp_path / "uploads"), initialize=True)
    with api.state.db() as db:
        m = User(login="owner", role="manager", password_hash=hash_password("TestPassword123!"))
        f = User(login="foreman", role="foreman", password_hash=hash_password("TestPassword123!"))
        site = Site(name="Synthetic")
        db.add_all([m, f, site])
        db.flush()
        db.add_all([Assignment(user_id=m.id, site_id=site.id),
                    Assignment(user_id=f.id, site_id=site.id)])
        db.commit()
    client = TestClient(api)

    def login(login_name):
        response = client.post("/api/v1/auth/login",
                               json={"login": login_name, "password": "TestPassword123!"})
        assert response.status_code == 200, response.text
        return {"Authorization": "Bearer " + response.json()["access_token"]}

    manager, foreman = login("owner"), login("foreman")
    status = client.get("/api/v1/ai/status", headers=manager)
    assert status.status_code == 200
    assert status.json()["enabled"] is False
    assert client.get("/api/v1/ai/status", headers=foreman).status_code == 403
    response = client.post("/api/v1/ai/chat", headers=manager,
                           json={"question": "Сводка?", "filters": {}})
    assert response.status_code == 503
    assert "отключён" in response.json()["detail"]
    assert client.post("/api/v1/ai/chat", headers=foreman,
                       json={"question": "Сводка?", "filters": {}}).status_code == 403
