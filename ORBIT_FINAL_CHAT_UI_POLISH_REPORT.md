# ORBIT 0.6.1 — FINAL CHAT UI POLISH

Дата: 29 сентября 2026.

Точечная полировка текущего chat-first интерфейса завершена в доступной production frontend/core среде. Архитектура не менялась; Pilot и новые крупные функции не добавлялись.

## Изменения

- Исправлена подсветка Settings: только текущий раздел имеет цветной фон и левую границу. Hover не выглядит выбранным. Добавлена регрессионная проверка всех 11 разделов, включая наведение на другой пункт.
- Оставлен один компактный заголовок: AI selector, модель/статус, режимы и Context. Внутренние New chat / Conversation удалены; история и её меню находятся в sidebar.
- User messages ограничены по ширине и прижаты вправо; сокращены отступы. Улучшена типографика длинных ответов.
- Markdown: абзацы, headings, bold/italic, списки, ссылки, blockquotes, inline/fenced code, GFM tables. Code blocks имеют язык, Copy и горизонтальную прокрутку.
- Сырой HTML отбрасывается; dangerouslySetInnerHTML не используется. Разрешены только http/https/mailto ссылки. Javascript/data/file/protocol-relative URLs блокируются; картинки из Markdown не загружаются автоматически.
- Убрано постоянное сообщение о передаче контекста. Выбранные файлы отображаются компактными удаляемыми chips. Автоматические RAG-источники остаются в Context; фиктивных кнопок удаления Knowledge/Sense не добавлено.
- Composer, disabled Send, фокус, empty state и recent chat hierarchy отполированы.
- Settings при 1100px автоматически сужает глобальную навигацию до иконок, не меняя сохранённое предпочтение sidebar.
- В AI & Models добавлены Current brain и Providers. Local AI показывает runtime, реальные модели и явные Chat/Vision/Agent capabilities; endpoint остаётся в Advanced.
- Rename/Delete используют ORBIT Modal вместо prompt/confirm. Работают Enter, Escape, focus trap, ошибки и блокировка повторной отправки. Destructive стиль применяется только к Delete.
- Ready/Offline/Needs setup приведены к общей форме; непроверенное соединение честно показано как Not tested.

## Приёмка

| Проверка | Результат |
|---|---|
| Реальный Ollama / gemma3:4b | PASS |
| Привет без клика в composer + Enter | PASS |
| Настоящий ответ с heading/list/code/table | PASS |
| Подсветка 11 Settings sections + отличимый hover | PASS |
| Settings без горизонтального overflow при 1100×700 / 1366×768 | PASS |
| New / Active / Settings / Collapsed в 4 размерах | PASS |
| Rename Enter / Escape / Delete / focus trap | PASS |
| Markdown семантика и безопасность | 4 PASS |
| Core regression | 230 PASS, 0 FAIL, 11 SKIP |
| Typecheck / lint / format / frontend build | PASS |

Размеры снимков: 1100×700, 1366×768, 1440×900, 1920×1080. Дополнительно сохранены Rename, Delete и детальный Markdown-ответ.

Результаты: [final-polish-acceptance.json](validation/final-polish-acceptance.json).
Галерея: [final-polish-gallery.html](validation/final-polish-gallery.html).

## Проверяемая среда и ограничения

Production frontend и отдельный production core работают с настоящим локальным Ollama. Браузерный адаптер заменяет только Tauri transport. Модель и ответы не подменялись fixture.

Новая native Windows-сборка остаётся BLOCKED ранее подтверждённой Application Control policy (4551). В этом UX-проходе политика не изменялась, повторный Rust build не требовался. Новый EXE/installer не произведён; установленная старая версия автоматически не обновлена.

Windows-specific autostart, tray, notifications, credential manager и global shortcut registration в browser acceptance не проверяются. Их существующие обработчики сохранены. Sense/Knowledge/Agent архитектура не менялась; этот проход не заявляет новую real Agent/Sense приёмку.

Расход памяти runtime не показан: текущий UI discovery API не возвращает проверенный показатель. Light/localization/model removal не выдаются за реализованные возможности.

Markdown реализован через [react-markdown](https://github.com/remarkjs/react-markdown) и [remark-gfm](https://github.com/remarkjs/remark-gfm), с отключённым raw HTML и дополнительным ограничением URLs. Проверки безопасности запускают сам компонент, а не копию его логики.

## Воспроизведение

- npm run typecheck
- npm run lint
- npm run format:check
- npm test
- node --test scripts/markdown-rendering.test.mjs
- npm run frontend:build
- node scripts/final-polish-acceptance.mjs gemma3:4b

Последняя команда требует уже работающий Ollama с gemma3:4b и использует изолированную тестовую историю. Исторические UI-harness предыдущих этапов не являются приёмкой нового расположения элементов.
