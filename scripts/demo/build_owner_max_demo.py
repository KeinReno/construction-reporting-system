"""Build a private, offline owner preview from authorized MAX UI exports.

The input and generated data must stay outside the repository. This tool never
contacts MAX or changes the shared API/database.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import os
from collections import Counter
from datetime import date
from pathlib import Path


MONTHS = {"января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5,
          "июня": 6, "июля": 7, "августа": 8, "сентября": 9,
          "октября": 10, "ноября": 11, "декабря": 12}
WORK_DATE = re.compile(r"(?m)^\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})\s*$")
HOURS = re.compile(r"^\s*[-–]?\s*([А-Яа-яЁё][^\d:]{1,45}?)\s+(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч\.)\b", re.I)
SECTION = re.compile(r"^(?:Работа спец\s*техники|Расходы|Планы на завтра)\s*:?", re.I)
SOURCE_NAMES = {"ps-fakel": "ПС Факел · групповой чат", "andrey": "Андрей · личный чат"}


def iso_message_date(value: str) -> str | None:
    m = re.match(r"^(\d{1,2})\s+([а-яё]+)\s+(20\d{2})$", value.strip(), re.I)
    if not m or m[2].lower() not in MONTHS:
        return None
    try:
        return date(int(m[3]), MONTHS[m[2].lower()], int(m[1])).isoformat()
    except ValueError:
        return None


def report_body(item: dict) -> str | None:
    for segment in item.get("text", []):
        if isinstance(segment, str) and "Состав бригады:" in segment and WORK_DATE.search(segment):
            return segment.strip()
    return None


def parse_report(body: str) -> dict:
    match = WORK_DATE.search(body)
    assert match
    work_date = date(int(match[3]), int(match[2]), int(match[1])).isoformat()
    lines = [line.strip() for line in body[match.end():].splitlines()]
    crew, work, equipment, plans, expenses, notes = [], [], [], [], [], []
    section = "crew"
    for line in lines:
        if not line:
            continue
        if line.lower().startswith("состав бригады"):
            section = "crew"
            continue
        if re.match(r"^работа спец\s*техники", line, re.I):
            section = "equipment"
            continue
        if re.match(r"^расходы", line, re.I):
            section = "expenses"
            tail = line.split(":", 1)[1].strip() if ":" in line else ""
            if tail:
                expenses.append(tail)
            continue
        if re.match(r"^планы на завтра", line, re.I):
            section = "plans"
            tail = line.split(":", 1)[1].strip() if ":" in line else ""
            if tail and tail != "-":
                plans.append(tail)
            continue
        clean = re.sub(r"^\s*[-–]+\s*", "", line).strip()
        if not clean or clean == "-":
            continue
        if section == "crew":
            if line.startswith("-"):
                section = "work"
                work.append(clean)
            elif re.match(r"^(?:на улице|дождь|выходной|работ(?:ы|у) нет)\b", clean, re.I):
                notes.append(clean)
            else:
                crew.append(clean)
        elif section == "work":
            work.append(clean)
        elif section == "equipment":
            h = HOURS.match(clean)
            equipment.append({"text": clean, "hours": float(h[2].replace(",", ".")) if h else None,
                              "type": h[1].strip() if h else None})
        elif section == "expenses":
            expenses.append(clean)
        else:
            plans.append(clean)
    return {"work_date": work_date, "crew": crew, "work": work,
            "equipment": equipment, "plans": plans, "expenses": expenses, "notes": notes}


def build(source_dir: Path, photo_dir: Path, output: Path) -> dict:
    source_dir, photo_dir, output = source_dir.resolve(), photo_dir.resolve(), output.resolve()
    repo = Path(__file__).resolve().parents[2]
    if output == repo or repo in output.parents:
        raise ValueError("Private owner demo cannot be written inside the repository")
    if output == source_dir or output == photo_dir:
        raise ValueError("Output must be a separate directory")
    tiles = json.loads((photo_dir.parent / "tile-refs.json").read_text(encoding="utf-8"))
    if len(tiles) != 321:
        raise ValueError("Expected 321 gallery positions in the primary chat")
    missing = [i for i in range(1, 322) if i not in (56, 86, 133, 232)
               and not (photo_dir / f"ps-fakel-{i:04}.jpg").is_file()]
    if missing:
        raise ValueError(f"Original photos missing at gallery positions: {missing}")
    output.mkdir(parents=True, exist_ok=True)
    output_photos = output / "photos"
    output_photos.mkdir(exist_ok=True)
    messages, reports, media = [], [], []
    by_message = {}
    seen_reports = set()
    for chat in ("ps-fakel", "andrey"):
        rows = json.loads((source_dir / f"{chat}-messages.json").read_text(encoding="utf-8"))
        for row in rows:
            key = f"{chat}:{row['index']}"
            body = report_body(row)
            parsed = parse_report(body) if body else None
            duplicate = False
            if parsed:
                fingerprint = hashlib.sha256(re.sub(r"\s+", " ", body).casefold().encode()).hexdigest()
                duplicate = fingerprint in seen_reports
                seen_reports.add(fingerprint)
            # The direct chat contains unrelated banking offers. Keep its raw export
            # privately, but show only project reports and project context here.
            if chat == "andrey" and not parsed:
                continue
            source_text = body or "\n".join(str(x) for x in row.get("text", [])).strip()
            if source_text == row.get("time"):
                source_text = ""
            entry = {"id": key, "chat": chat, "chat_name": SOURCE_NAMES[chat],
                     "message_date": iso_message_date(row.get("message_date") or ""),
                     "time": row.get("time"), "text": source_text,
                     "report": bool(parsed), "duplicate": duplicate, "media": [],
                     "files": row.get("files", [])}
            messages.append(entry)
            by_message[key] = entry
            if parsed and not duplicate:
                reports.append({"id": key, "chat": chat, "chat_name": SOURCE_NAMES[chat],
                                "message_date": entry["message_date"], "time": entry["time"],
                                "body": body,
                                "other_site_mentioned": bool(re.search(r"ПС\s+Пущино", body, re.I)),
                                **parsed})
    for pos, ref in enumerate(tiles, 1):
        key = f"ps-fakel:{ref['message_index']}"
        if key not in by_message:
            raise ValueError(f"Gallery position {pos} lacks a source message")
        kind = "video" if pos in (56, 86, 133, 232) else "photo"
        file = photo_dir / f"ps-fakel-{pos:04}.jpg"
        if kind == "photo":
            destination = output_photos / file.name
            if not destination.exists() or destination.stat().st_size != file.stat().st_size:
                destination.unlink(missing_ok=True)
                try:
                    os.link(file, destination)
                except OSError:
                    shutil.copy2(file, destination)
        item = {"id": f"media:{pos}", "message_id": key, "position": pos,
                "kind": kind, "file": f"photos/ps-fakel-{pos:04}.jpg" if kind == "photo" else None,
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest() if kind == "photo" else None,
                "message_date": by_message[key]["message_date"],
                "caption": by_message[key]["text"][:250]}
        media.append(item)
        by_message[key]["media"].append(item["id"])
    reports.sort(key=lambda x: (x["work_date"], x["id"]), reverse=True)
    messages.sort(key=lambda x: (x["message_date"] or "", x["time"] or "", x["id"]), reverse=True)
    document_inventory = photo_dir.parent / "document-inventory.json"
    documents = []
    if document_inventory.is_file():
        for doc in json.loads(document_inventory.read_text(encoding="utf-8")):
            key = f"ps-fakel:{doc['message_index']}"
            if key in by_message:
                documents.append({"id": f"document:{doc['ordinal']}", "message_id": key,
                                  "name": re.sub(r"^(?:PDF|DOCX|XLSX)\s+", "", doc["label"]).split(" Скачать •", 1)[0],
                                  "message_date": by_message[key]["message_date"],
                                  "available": False})
    payload = {"title": "ПС Факел", "messages": messages, "reports": reports, "media": media,
               "documents": documents,
               "sources": [{"name": SOURCE_NAMES[k], "url": u} for k, u in
                           (("ps-fakel", "https://web.max.ru/-76453902973661"),
                            ("andrey", "https://web.max.ru/259079697"))]}
    (output / "data.js").write_text("window.OWNER_DEMO_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    shutil.copyfile(Path(__file__).with_name("owner_max_demo.html"), output / "index.html")
    shutil.copyfile(Path(__file__).with_name("run_owner_max_demo.py"), output / "start.py")
    (output / "ОТКРЫТЬ.cmd").write_text('@echo off\r\ncd /d "%~dp0"\r\npy -3 start.py\r\nif errorlevel 1 pause\r\n', encoding="utf-8")
    stats = {"messages_in_preview": len(messages), "reports_unique": len(reports),
             "report_duplicates_excluded": sum(x["duplicate"] for x in messages),
             "original_photos": sum(x["kind"] == "photo" for x in media),
             "videos_not_downloaded": sum(x["kind"] == "video" for x in media),
             "document_metadata_only": len(documents),
             "period_first_work_date": min((x["work_date"] for x in reports), default=None),
             "period_last_work_date": max((x["work_date"] for x in reports), default=None)}
    (output / "build-report.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--photo-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.source_dir, args.photo_dir, args.output), ensure_ascii=False, indent=2))
