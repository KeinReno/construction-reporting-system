# Локальная работа — 27.10.2026

Рабочая ветка: `feat/mvp-core-bootstrap`, исходный коммит `bc0066f1d2345530977818491cbf1066cd800393`, PR #2. Используются только синтетические данные. SPEC-00 остаётся OPEN; B01–B14 не считаются согласованными.

## Получено и проверено на Windows 11

- Репозиторий клонирован в `C:\Users\Reno\Desktop\CRS`, ветка отслеживает `origin/feat/mvp-core-bootstrap`.
- `web`: `npm ci`, `npm run build`, `npx playwright test --reporter=line` — 7/7 PASS после исправления поиска фильтра автора. До исправления два сценария падали в GitHub Actions на исходном коммите.
- `backend`: первый запуск на глобальном Python дал 50 PASS, 1 SKIP, 1 FAIL: `test_backup_restore_and_corruption`, Windows WinError 5/32 при открытом SQLite-файле. Соединения SQLite в backup/restore теперь явно закрываются; `..\.venv\Scripts\python.exe -m pytest -q` из папки `backend` — 51 PASS, 1 SKIP, 1 предупреждение за 4:30.
- В чистой `.venv` установлен `backend/requirements.lock.txt` и PyInstaller 6.22.3. `python scripts/demo/build_windows_demo.py` собрал `dist/demo/ConstructionReportingDemo.exe` и `construction-windows-demo.zip`. `python scripts/demo/test_frozen_demo.py dist/demo/ConstructionReportingDemo.exe` — PASS: локальный Web/API, вход, шесть отчётов, PNG, точный объём и запрет второго экземпляра.
- `dist/android-debug/app-debug.apk` и `dist/android-demo/app-demo.apk` скачаны из успешных CI workflows текущего исходного коммита; они не собирались локально. Первый — рабочий debug-клиент с настройкой HTTPS; второй — независимое локальное демо без синхронизации. Пакеты и данные различны.

## Продолжение

1. Для Backend использовать `..\.venv\Scripts\python.exe` из папки `backend`; глобальный pytest на этом компьютере требует `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'` из-за постороннего плагина xonsh.
2. Для локальной Android-сборки установить Android SDK 35 и Gradle 8.13; JDK есть. Затем запустить команды из `android/README.md`. Без SDK локальный APK не проверен.
3. Перед коммитом повторить `git diff --check`. После push проверить Web CI нового коммита, так как исходный PR имеет два красных Web job; текущий локальный Playwright прошёл.
4. Для реального рабочего контура нужны решения SPEC-00, параметры Windows/HTTPS, постоянная подпись APK и полевые испытания. Демо EXE и APK не являются такой приёмкой.
