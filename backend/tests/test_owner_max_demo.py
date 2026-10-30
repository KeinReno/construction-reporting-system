import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.demo.build_owner_max_demo import iso_message_date, parse_report, report_body


def test_work_date_is_distinct_from_message_date():
    item = {"message_date": "25 октября 2026", "text": ["Влад", "29.09.2026\nСостав бригады:\nАндрей\n- монтаж сетки"]}
    report = parse_report(report_body(item))
    assert iso_message_date(item["message_date"]) == "2026-10-25"
    assert report["work_date"] == "2026-09-29"
    assert report["crew"] == ["Андрей"]
    assert report["work"] == ["монтаж сетки"]


def test_weather_is_note_and_unambiguous_equipment_hours_only():
    body = "12.07.2026\nСостав бригады:\nВлад\nНа улице дождь\nРабота спецтехники:\nКран 8,5 часов\nВышка работала\nРасходы: командировочные 11800р\nПланы на завтра:\nмонтаж блоков"
    report = parse_report(body)
    assert report["crew"] == ["Влад"]
    assert report["notes"] == ["На улице дождь"]
    assert report["equipment"][0]["hours"] == 8.5
    assert report["equipment"][1]["hours"] is None
    assert report["expenses"] == ["командировочные 11800р"]
    assert report["plans"] == ["монтаж блоков"]
