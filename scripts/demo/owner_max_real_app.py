"""Private owner demo using the real API and Web on a separate localhost database.

The MAX export and resulting database must stay outside Git. No source item is
converted to a monetary transaction or measured work volume by inference.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import hmac
import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import sys
import threading
import time
import uuid
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from starlette.requests import Request
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, Text, UniqueConstraint, insert, select


class ArchiveReviewInput(BaseModel):
    decision: Literal["fakel", "not_fakel", "insufficient"]
    reason: str = Field(min_length=10, max_length=1000)
    expected_revision: int = Field(ge=0)


ARCHIVE_REVIEWS = Table(
    "owner_archive_reviews", MetaData(),
    Column("id", String(36), primary_key=True),
    Column("client_report_id", String(36), nullable=False),
    Column("source_message_id", String(120), nullable=False),
    Column("decision", String(24), nullable=False),
    Column("reason", Text, nullable=False),
    Column("actor_id", String(36), nullable=False),
    Column("revision", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("client_report_id", "revision", name="uq_owner_archive_review_revision"),
)


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
CHAT_URLS = {"ps-fakel": "https://web.max.ru/-76453902973661", "andrey": "https://web.max.ru/259079697"}
NAMESPACE = uuid.UUID("bc111c78-323d-4ae2-a262-8920b0811053")
MATERIAL_TERMS = (("Блоки ФБС", r"фбс|\bблок"), ("Щебень", r"щеб"),
                  ("Арматура", r"арматур"), ("Провод", r"провод"),
                  ("Сетка", r"сетк"), ("Бетон", r"бетон"),
                  ("Краска", r"краск|покрас"), ("Изолятор", r"изолятор"),
                  ("Швеллер", r"швеллер"))


def private_root(path: Path) -> Path:
    path = path.resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError("Customer data cannot be written inside the repository")
    return path


def prepare_bundle(archive: Path, bundle_path: Path, site_ids: dict[str, str]) -> int:
    from app.import_reports import read_bundle

    raw = (archive / "data.js").read_text(encoding="utf-8").strip()
    prefix = "window.OWNER_DEMO_DATA = "
    if not raw.startswith(prefix):
        raise ValueError("Invalid archive data format")
    data = json.loads(raw[len(prefix):].rstrip(";"))
    items = []
    for row in data["reports"]:
        key = row["id"]
        site = "mixed" if row.get("other_site_mentioned") else "fakel"
        work = [{"type": text[:200], "description": text[:2000]} for text in row["work"] if text.strip()]
        is_work = bool(work)
        work_text = "\n".join(row["work"])
        material_mentions = [{"name": name, "direction": "mentioned"}
                             for name, pattern in MATERIAL_TERMS if re.search(pattern, work_text, re.I)]
        source_ref = f"{CHAT_URLS[row['chat']]}#snapshot-{key.split(':', 1)[1]}"
        report = {"client_report_id": str(uuid.uuid5(NAMESPACE, key)),
                  "site_id": site_ids[site], "work_date": row["work_date"],
                  "kind": "work" if is_work else "no_work",
                  "work_entries": work,
                  "no_work_reason": None if is_work else ("; ".join(row.get("notes") or []) or "В исходном отчёте работы не перечислены"),
                  "required_photo_ids": [],
                  "crew": "; ".join(row["crew"])[:1000] or None,
                  "materials": material_mentions or None,
                  "incidents": [{"description": note[:2000]} for note in row.get("notes", [])] or None,
                  "next_shift_plans": [p[:500] for p in row.get("plans", [])][:30] or None}
        # The source preserves equipment and expense text. Its schema cannot
        # express unknown equipment ownership or ambiguous cash operations.
        items.append({"source_ref": source_ref,
                      "source": {"source_ref": source_ref, "text": row["body"],
                                 "message_date": row["message_date"]},
                      "data": report, "photos": []})
    bundle_path.write_text(json.dumps({"format_version": 1, "reports": items}, ensure_ascii=False), encoding="utf-8")
    read_bundle(bundle_path)
    return len(items)


def copy_archive(source: Path, target: Path) -> None:
    if target.exists():
        return
    target.mkdir(parents=True)
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        if relative.name in ("start.py", "ОТКРЫТЬ.cmd", "build-report.json"):
            continue
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(path, destination)
        except OSError:
            shutil.copy2(path, destination)


def build_archive_context(archive: Path) -> tuple[dict, dict]:
    raw = (archive / "data.js").read_text(encoding="utf-8").strip()
    data = json.loads(raw[len("window.OWNER_DEMO_DATA = "):].rstrip(";"))
    messages = {item["id"]: item for item in data["messages"]}
    photos = {item["id"]: item for item in data["media"] if item["kind"] == "photo" and item.get("file")}
    context = {}
    for report in data["reports"]:
        rid = str(uuid.uuid5(NAMESPACE, report["id"]))
        related = []
        for photo in photos.values():
            photo_message = messages.get(photo["message_id"])
            if photo["message_id"] == report["id"]:
                relation = "same_message"
            elif (photo_message and photo_message["chat"] == report["chat"]
                  and photo["message_date"] == report["work_date"]):
                relation = "same_work_date"
            else:
                continue
            related.append({"id": photo["id"], "relation": relation,
                            "message_date": photo["message_date"],
                            "message_id": photo["message_id"]})
        context[rid] = {"source_message_id": report["id"],
                        "other_site_mentioned": bool(report.get("other_site_mentioned")),
                        "photos": related}
    return context, photos


def create_owner_app(root: Path, archive_source: Path, web_source: Path):
    from fastapi import Request, HTTPException
    from fastapi.responses import JSONResponse, FileResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.testclient import TestClient
    from sqlalchemy import select, func

    from app.main import create_app, User, Site, Assignment, Report, hash_password
    from app.import_reports import read_bundle, import_bundle

    root = private_root(root)
    archive_source = archive_source.resolve()
    root.mkdir(parents=True, exist_ok=True)
    if not (archive_source / "data.js").is_file():
        raise ValueError("Build the private MAX archive first")
    source_hash = hashlib.sha256((archive_source / "data.js").read_bytes()).hexdigest()
    fingerprint_file = root / "import-source.sha256"
    if fingerprint_file.exists() and fingerprint_file.read_text(encoding="ascii").strip() != source_hash:
        raise ValueError("MAX archive changed; use a new private demo directory for a fresh import")
    web = root / "web"
    shutil.copytree(web_source, web, dirs_exist_ok=True)
    archive = root / "archive"
    copy_archive(archive_source, archive)
    archive_context, archive_photos = build_archive_context(archive)
    photos = root / "report-photos"
    photos.mkdir(exist_ok=True)
    db_file = root / "owner-demo.db"
    os.environ["WEB_DIR"] = str(web)
    os.environ["UPLOAD_DIR"] = str(photos)
    api = create_app(database_url="sqlite:///" + db_file.as_posix(), storage=str(photos), initialize=True)
    with api.state.db() as db:
        ARCHIVE_REVIEWS.create(bind=db.get_bind(), checkfirst=True)

    credential_file = root / "credentials.json"
    if credential_file.exists():
        credentials = json.loads(credential_file.read_text(encoding="utf-8"))
    else:
        credentials = {"manager_login": "owner", "manager_password": secrets.token_urlsafe(24),
                       "importer_login": "max-import", "importer_password": secrets.token_urlsafe(24)}
        credential_file.write_text(json.dumps(credentials, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(credential_file, 0o600)
        except OSError:
            pass

    @api.middleware("http")
    async def protect_archive(request: Request, call_next):
        if request.url.path.startswith("/archive"):
            auth = request.headers.get("Authorization", "")
            try:
                scheme, value = auth.split(" ", 1)
                entered = base64.b64decode(value, validate=True).decode("utf-8") if scheme.lower() == "basic" else ""
                login, password = entered.split(":", 1)
            except (ValueError, UnicodeError, binascii.Error):
                login = password = ""
            if not (hmac.compare_digest(login, credentials["manager_login"]) and
                    hmac.compare_digest(password, credentials["manager_password"])):
                return JSONResponse({"detail": "Требуется вход руководителя"}, status_code=401,
                                    headers={"WWW-Authenticate": 'Basic realm="MAX Archive"', "Cache-Control": "no-store"})
        response = await call_next(request)
        if request.url.path.startswith("/archive"):
            response.headers["Cache-Control"] = "private, no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    api.mount("/archive", StaticFiles(directory=archive, html=True), name="owner-archive")
    @api.get("/owner-demo-info")
    def owner_demo_info():
        return {"archive_path": "/archive/", "notice": "Исторические отчёты MAX · локальная база"}
    def demo_manager(request: Request):
        with api.state.db() as db:
            user = api.state.current_user(request, db)
            if user.role != "manager" or user.login != credentials["manager_login"]:
                raise HTTPException(403, "Manager role required")
            return user.id

    @api.get("/api/v1/owner-demo/context")
    def owner_demo_context(request: Request):
        demo_manager(request)
        return {"reports": archive_context, "source": "MAX", "historical": True}

    def review_view(row):
        created_at = row["created_at"]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return {"id": row["id"], "client_report_id": row["client_report_id"],
                "source_message_id": row["source_message_id"], "decision": row["decision"],
                "reason": row["reason"], "actor": "Владелец",
                "revision": row["revision"], "created_at": created_at.isoformat()}

    @api.get("/api/v1/owner-demo/reconciliation")
    def owner_demo_reconciliation(request: Request):
        demo_manager(request)
        with api.state.db() as db:
            rows = db.execute(select(ARCHIVE_REVIEWS).order_by(ARCHIVE_REVIEWS.c.client_report_id,
                                                               ARCHIVE_REVIEWS.c.revision)).mappings().all()
        result = {rid: [] for rid, item in archive_context.items() if item["other_site_mentioned"]}
        for row in rows:
            if row["client_report_id"] in result:
                result[row["client_report_id"]].append(review_view(row))
        return JSONResponse(result, headers={"Cache-Control": "private, no-store"})

    @api.post("/api/v1/owner-demo/reconciliation/{client_report_id}")
    def owner_demo_record_reconciliation(client_report_id: str, payload: ArchiveReviewInput, request: Request):
        actor_id = demo_manager(request)
        item = archive_context.get(client_report_id)
        if not item or not item["other_site_mentioned"]:
            raise HTTPException(404, "Archive record requiring reconciliation not found")
        reason = payload.reason.strip()
        if len(reason) < 10:
            raise HTTPException(422, "Reason must contain at least 10 characters")
        with api.state.db() as db:
            engine = db.get_bind()
        with engine.connect() as connection:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            try:
                latest = connection.execute(select(ARCHIVE_REVIEWS.c.revision)
                    .where(ARCHIVE_REVIEWS.c.client_report_id == client_report_id)
                    .order_by(ARCHIVE_REVIEWS.c.revision.desc()).limit(1)).scalar()
                revision = latest or 0
                if revision != payload.expected_revision:
                    raise HTTPException(409, "Archive review changed; reload and try again")
                row = {"id": str(uuid.uuid4()), "client_report_id": client_report_id,
                       "source_message_id": item["source_message_id"], "decision": payload.decision,
                       "reason": reason, "actor_id": actor_id, "revision": revision + 1,
                       "created_at": datetime.now(timezone.utc)}
                connection.execute(insert(ARCHIVE_REVIEWS).values(**row))
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        return JSONResponse(review_view(row), headers={"Cache-Control": "private, no-store"})

    @api.get("/api/v1/owner-demo/photos/{photo_id}")
    def owner_demo_photo(photo_id: str, request: Request):
        demo_manager(request)
        item = archive_photos.get(photo_id)
        if not item:
            raise HTTPException(404, "Photo not found")
        file = (archive / item["file"]).resolve()
        if archive not in file.parents or not file.is_file():
            raise HTTPException(404, "Photo not found")
        return FileResponse(file, media_type="image/jpeg",
                            headers={"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"})
    web_mount = next(route for route in api.router.routes if route.name == "web")
    api.router.routes.remove(web_mount)
    api.router.routes.append(web_mount)

    with api.state.db() as db:
        existing = db.scalar(select(User.id).limit(1))
        if not existing:
            owner = User(login=credentials["manager_login"], password_hash=hash_password(credentials["manager_password"]), role="manager")
            importer = User(login=credentials["importer_login"], password_hash=hash_password(credentials["importer_password"]), role="foreman")
            sites = {"fakel": Site(name="ПС Факел · по истории чата"),
                     "mixed": Site(name="Объект требует сверки · упомянуто ПС Пущино")}
            db.add_all([owner, importer, *sites.values()])
            db.flush()
            db.add_all(Assignment(user_id=user.id, site_id=site.id) for user in (owner, importer) for site in sites.values())
            db.commit()
        site_ids = {"fakel": db.scalar(select(Site.id).where(Site.name == "ПС Факел · по истории чата")),
                    "mixed": db.scalar(select(Site.id).where(Site.name == "Объект требует сверки · упомянуто ПС Пущино"))}
        count_before = db.scalar(select(func.count()).select_from(Report))
    if any(not value for value in site_ids.values()):
        raise ValueError("Unexpected site state in private database")
    bundle_path = root / "import-bundle.json"
    expected = prepare_bundle(archive, bundle_path, site_ids)
    if count_before < expected:
        bundle, bundle_root = read_bundle(bundle_path)
        with TestClient(api) as client:
            login = client.post("/api/v1/auth/login", json={"login": credentials["importer_login"], "password": credentials["importer_password"]})
            login.raise_for_status()
            token = login.json()["access_token"]
            try:
                def request(method, path, **kwargs):
                    return client.request(method, "/api/v1/" + path, **kwargs)
                import_bundle(bundle, bundle_root, request, token)
            finally:
                client.post("/api/v1/auth/logout", headers={"Authorization": "Bearer " + token})
    with api.state.db() as db:
        count_after = db.scalar(select(func.count()).select_from(Report))
    if count_after != expected:
        raise ValueError(f"Report count mismatch: {count_after} != {expected}")
    fingerprint_file.write_text(source_hash + "\n", encoding="ascii")

    return api, credentials, count_after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    import uvicorn
    api, credentials, count = create_owner_app(args.root, args.archive, ROOT / "web" / "dist")
    listener = socket.socket()
    listener.bind(("127.0.0.1", args.port))
    listener.listen(128)
    url = f"http://127.0.0.1:{listener.getsockname()[1]}"
    server = uvicorn.Server(uvicorn.Config(api, host="127.0.0.1", port=0, workers=1,
                                          proxy_headers=False, log_level="warning"))
    def ready():
        while not server.started and not server.should_exit:
            time.sleep(0.1)
        if server.started:
            (args.root / "running.json").write_text(json.dumps({"url": url}), encoding="utf-8")
            print(f"Кабинет владельца: {url} · импортировано {count} отчётов", flush=True)
            print(f"Логин и пароль: {args.root / 'credentials.json'}", flush=True)
            print(f"Архив MAX: {url}/archive/ (тот же логин и пароль)", flush=True)
            if not args.no_browser:
                webbrowser.open(url)
    threading.Thread(target=ready, daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        listener.close()
        (args.root / "running.json").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
