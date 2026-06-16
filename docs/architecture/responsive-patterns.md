# Responsive patterns — breakpoint-level shells

Разные UX-сценарии на уровне breakpoint, не только CSS-классы.

---

## Breakpoints

| Shell    | Width        | Описание |
|----------|--------------|----------|
| desktop  | ≥ 1024px     | Боковая навигация, все панели |
| tablet   | 768–1023px   | Drawer для каналов, right panel collapsed |
| mobile   | < 768px      | Bottom nav, right panel hidden |

Определяются в `hooks/useBreakpointShell.ts` (TABLET_MIN, DESKTOP_MIN).

---

## Слоты (AppShell)

Все слоты всегда смонтированы; видимость через состояние `visible | collapsed | hidden` (CSS).

| Слот             | Назначение |
|------------------|------------|
| left-nav         | Список серверов (72px) |
| channel-sidebar  | Вкладки Servers/DMs, список каналов, VoiceMiniPanel, user panel |
| main             | Чат / голос / placeholder |
| right-panel      | ParticipantList (только server channels) |
| voice-footer     | Резерв (пока не используется) |

---

## Компоненты

- **AppShell** — корневой layout с пятью слотами и `slotState`.
- **DesktopShell** — все слоты visible (по умолчанию).
- **TabletShell** — right-panel collapsed по умолчанию.
- **MobileShell** — right-panel hidden по умолчанию.

Страница приложения передаёт `data-shell={shell}` на корневой контейнер; полная миграция на передачу контента в слоты — следующий шаг.

---

## Правила

1. Не размонтировать слоты — только менять классы (visible/collapsed/hidden).
2. Выбор shell по `useBreakpointShell()`.
3. Состояние правой панели: `visible` только при `activeTab === 'servers' && selectedChannelId`.
