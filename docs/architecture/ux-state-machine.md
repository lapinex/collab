# UX State Machine — Navigation & Voice

Явные состояния и переходы для chat/dm/voice. Все навигационные решения только через `send(event)`.

---

## Состояния (контекст)

Машина не хранит состояние — она получает контекст снаружи (из store) и возвращает обновления.

| Поле | Описание |
|------|----------|
| `activeTab` | `servers` \| `dms` |
| `selectedServerId` | ID выбранного сервера |
| `selectedChannelId` | ID выбранного канала (server) |
| `selectedDMChannelId` | ID выбранного DM |
| `voiceConnectionState` | `disconnected` \| `connecting` \| `connected` \| `reconnecting` |
| `isViewingVoiceChannel` | Текущий канал — голосовой (для правила VOICE_LEFT) |

---

## События

| Событие | Payload | Описание |
|---------|---------|----------|
| `DM_SELECTED` | `dmId` | Пользователь выбрал DM |
| `SERVER_SELECTED` | `serverId` | Пользователь выбрал сервер |
| `CHANNEL_SELECTED` | `channelId` | Пользователь выбрал канал |
| `TAB_SWITCHED` | `tab` | Переключение вкладки servers/dms |
| `VOICE_LEFT` | `textChannelId?` | Пользователь вышел из голосового канала; при `isViewingVoiceChannel` — переключить на text |
| `VOICE_CONNECTING` | — | Голос подключается (не меняет навигацию) |
| `VOICE_CONNECTED` | — | Голос подключён (не меняет навигацию) |
| `VOICE_DISCONNECTED` | — | Голос отключён (не меняет навигацию) |
| `URL_INIT` | `tab`, `serverId`, `channelId`, `dmId` | Инициализация из URL |
| `CLEAR_DM_SELECTION` | — | Очистка выбора DM (при переключении на servers) |

---

## Правила переходов

```
DM_SELECTED          → activeTab=dms, selectedDMChannelId=dmId
SERVER_SELECTED      → activeTab=servers, selectedServerId, selectedChannelId=null
CHANNEL_SELECTED     → activeTab=servers, selectedChannelId
TAB_SWITCHED(servers)→ activeTab=servers, selectedDMChannelId=null
TAB_SWITCHED(dms)    → activeTab=dms
VOICE_LEFT           → если isViewingVoiceChannel && textChannelId: selectedChannelId=textChannelId
                      иначе: игнорировать
URL_INIT             → применить tab, serverId, channelId, dmId из URL
CLEAR_DM_SELECTION   → activeTab=servers, selectedDMChannelId=null
```

---

## Важные правила

1. **Voice disconnect не меняет канал** — только `VOICE_LEFT` с явным `textChannelId` может переключить канал (когда пользователь вышел из голоса и мы показывали голосовой канал).
2. **DM selection не прыгает** — переходы только по явным событиям `DM_SELECTED`, `TAB_SWITCHED`, `URL_INIT`.
3. **Reconnect не сбрасывает** — `VOICE_DISCONNECTED` / `VOICE_CONNECTED` не меняют навигацию.

---

## Интеграция

```ts
import { transition, type UXNavigationEvent, type NavigationContext } from '@/lib/ui-orchestrator/state-machine';

// В page/hook: при событии
const update = transition(context, { type: 'DM_SELECTED', dmId: ch.id });
if (update) {
  if (update.activeTab) setActiveTab(update.activeTab);
  if (update.selectedDMChannelId !== undefined) setSelectedDMChannelId(update.selectedDMChannelId);
  // ...
}
```

Или через хук `useNavigationMachine` (см. Phase C — Orchestrator).
