# ORBIT CHAT-FIRST UI REPORT

Дата: 29 сентября 2026. Версия исходников: 0.6.1.

Обновлён существующий проект. Проверенная среда: production frontend + отдельный production core + настоящий Ollama 0.34.4 / gemma3:4b. Для браузерной проверки заменён только транспорт Tauri. Rust shell и Windows integration новой сборки не запускались.

**Общий статус: интерфейс реализован и проверен в core/browser; нативная приёмка и новый установщик BLOCKED.** Точный сценарий «двойной клик по новому EXE → сразу печатать» не объявляется выполненным.

## Результаты

| Проверка | Статус | Доказательство / граница |
|---|---|---|
| Default Chat | PASS (browser) | Запуск сразу в Chat, без dashboard; native запуск новой сборки NOT VERIFIED |
| COSMO Quick Start | PASS | «Привет» напечатано без клика, Enter отправляет реальный запрос |
| Sidebar | PASS | Навигация, сворачивание, сохранение состояния |
| Recent Chats | PASS | Группы по датам, поиск, переименование, удаление, активный разговор |
| Composer | PASS | Автофокус, Enter, Shift+Enter, ограниченная высота, Stop |
| Streaming UX | PASS | Реальный SSE Ollama и прогрессивное обновление; HTTP abort проверен |
| Chat / Agent / Sense | PASS (UI) | Переключение режимов; Agent для gemma3:4b UNSUPPORTED |
| Context Panel | PASS | Открывается по кнопке; AI, brain, project, Knowledge, Memory, источники; сворачивается при уменьшении окна |
| My AIs | PASS | Существующие создание, редактор, экспорт/импорт и меню сохранены |
| Settings General | PASS (UI) | Выбор AI, восстановление истории; autostart/tray/native notification wiring сохранён, новая native integration NOT VERIFIED |
| Settings Appearance | PASS (implementation) | Dark, акцент, плотность, отключение анимаций, reduced motion; нет ложной Light option |
| AI & Models | PASS (UI/core) | Текущий brain, Test, список providers; расширенные параметры свёрнуты |
| Local AI Settings | PASS | Реальное обнаружение runtime/моделей, Use/Test, установка/загрузка через существующий flow |
| Sense Settings | PASS (UI/core) | Opt-in AI; явный выбор окна, image opt-in, remote consent сохранены |
| Agent Permissions | PASS (regression/UI) | Security tests проходят; screenshot approval — только UI пример, не реальный Agent |
| Knowledge & Memory | PASS | Реальный RAG с источником; настройки памяти используют существующий core API |
| Shortcuts | PASS (in-app) | Новая беседа, palette, settings, Enter/Shift+Enter, Escape; Windows global shortcut registration NOT VERIFIED |
| Privacy & Data | PASS (core/UI) | Local Only на реальном inference; native export dialog не проверен в browser |
| Advanced Settings | PASS (UI) | Endpoints, model IDs, verification, embeddings, logs отделены |
| Real COSMO Chat | PASS | Только настоящая gemma3:4b |
| Real Sense | PASS | Настоящий Windows helper UIA + модель; «Что находится на моём экране?» |
| Vision image path | PASS | Настоящий захват + image-only inference; не извлечённый текст |
| Responsive UI | PASS | 1100×700, 1366×768, 1440×900, 1920×1080, composer видим |
| Accessibility | PASS (targeted keyboard) | Фокус, подписи, dialog focus trap/Escape, без перехвата фокуса диалога; полный screen-reader аудит не проводился |
| Existing Feature Regressions | PASS (automated scope) | 241 тест: 230 PASS, 0 FAIL, 11 SKIP; release tests 3 PASS |
| Windows Build | BLOCKED | Application Control, os error 4551 |
| Installer | NOT PRODUCED | Старый EXE 0.6.0 не выдаётся за обновление |

## Что изменилось

- Стартовая поверхность — текущий AI и его разговор. Последний выбранный conversation ID сохраняется отдельно для AI/проекта. Если предпочтение ещё не записано, открывается последний доступный разговор; удалённый ID безопасно приводит к новому чату.
- Без настроенной модели остаётся обычный Chat с Set Up Local AI / Connect Cloud AI. Основная кнопка настройки получает фокус. После успешного реального теста Local AI setup закрывается и фокус возвращается в composer.
- История защищена проверками AI/project scope. Удаление транзакционное и требует подтверждения. Во время генерации редактирование истории блокируется.
- Чат занимает доступную высоту, сообщения прокручиваются отдельно, composer остаётся видимым. Code blocks сохраняют язык, Copy и горизонтальную прокрутку.
- Настройки разделены на 11 страниц. Только работающие опции показаны как действия. Основной экран не требует знания endpoint/RAG/SSE.
- Сохранены core inference, отмена, Knowledge, Memory, permissions, Undo, профильный редактор и Sense privacy checks.

## Приёмка

Машинные результаты: [chat-first-real-acceptance.json](validation/chat-first-real-acceptance.json).
Скриншоты: [галерея](validation/chat-first-gallery.html).

Реальные проверки: chat, context, restart/history, streaming, cancellation, Knowledge, Local Only, Sense text, vision. Отдельно: ввод без клика, New Chat focus, восстановление sidebar, отсутствие захвата фокуса palette, Shift+Enter, auto-return из настройки, переименование/удаление и смена AI.

Использовалась изолированная тестовая история. Скриншоты содержат публичные тестовые запросы. API-ключи, пользовательские документы и содержимое личной истории в архив не включены. Сетевой журнал содержит метаданные запросов, а не заголовки/тексты.

**Permission screenshot:** синтетический rendering-only пример существующего approval-компонента; команда не выполнялась. Не является Local Agent PASS. Реальная metadata gemma3:4b не подтверждает tools.

## Точные оставшиеся ограничения

1. Windows Application Control блокирует Rust build-script. Политика не изменена, обход не выполнялся. Новый EXE/installer отсутствует; полная desktop definition of done не достигнута.
2. Autostart, tray, Windows notifications, глобальные shortcuts, native file picker/export и credential storage сохраняют прежние native handlers; новое native поведение нельзя подтвердить без сборки.
3. Light/System themes, перевод интерфейса, встроенное удаление моделей, cache-clear и открытие data-folder не добавлены как работающие опции. Удаление моделей явно отмечено недоступным; выполняется средствами runtime.
4. Поиск доступен для чатов, My AIs и команд. Единого cross-library индекса чатов/проектов/Knowledge нет.
5. Agent activity и review доступны отдельной страницей. Chat-first не превращает gemma3:4b в tool-capable Agent.
6. Быстрые переименование/удаление истории используют системные prompt/confirm; сложные permission/diff dialogs сохранены.
7. Browser preferences хранят только настройки представления и opaque conversation IDs. В browser test provider-save bridge проверяет только разрешённый loopback Ollama; это не тест Windows Credential Manager.
8. Форматирование ответов поддерживает существующий простой text/code renderer, а не полную реализацию Markdown.
9. Проверки показывают работоспособность маршрутов и UX, а не гарантированную фактическую точность модели.

## Команды проверки

- npm run typecheck — PASS
- npm run lint — PASS
- npm run format:check — PASS
- npm test — 230 PASS / 11 SKIP / 0 FAIL
- node --test scripts/release-pipeline.test.mjs — 3 PASS
- cargo fmt --manifest-path src-tauri/Cargo.toml --check — PASS
- npm run frontend:build — PASS
- node scripts/chat-first-real-acceptance.mjs gemma3:4b — PASS
- npm run build:desktop — BLOCKED, лог: validation/chat-first-windows-build.log

Пропущенные автоматические проверки не считаются PASS. Политика безопасности остаётся включённой.
