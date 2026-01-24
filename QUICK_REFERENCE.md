# ⚡ Quick Reference - Edison Trading Bot

**Быстрая справка для разработчиков. Все необходимые команды и файлы в одном месте.**

---

## 🎯 БЫСТРЫЙ СТАРТ (5 минут)

### 1. Сборка и тесты
```bash
npm run build           # Полная сборка (main + web-server + web-client)
npm test               # Запустить все тесты
npm test -- position   # Запустить конкретный тест
```

### 2. Запуск бота
```bash
npm start              # Запустить бота (если доступно)
npm run backtest-v5    # Запустить V5 backtest
```

### 3. Git操作
```bash
git status             # Статус изменений
git commit -m "msg"    # Создать коммит
git push               # Отправить на remote
```

---

## 📁 ОСНОВНЫЕ ФАЙЛЫ

### 🔴 КРИТИЧНЫЕ (ВАЖНО!)
| Файл | Назначение | TP фикс? |
|------|-----------|---------|
| `src/services/websocket-manager.service.ts` | WebSocket обработка | ✅ YES |
| `src/services/position-exiting.service.ts` | Выход из позиций | ✅ YES |
| `src/orchestrators/exit.orchestrator.ts` | Логика выхода (state machine) | ✅ YES |

### 🟢 КОНФИГ
| Файл | Назначение |
|------|-----------|
| `config.json` | Основной конфиг бота |
| `strategies/json/simple-levels.strategy.json` | Стратегия (TP: 0.5%, 1%, 1.5%) |
| `settings.json` | Claude Code settings |

### 🔵 АРХИТЕКТУРА
| Компонент | Файл |
|-----------|------|
| Main service | `src/services/trading-orchestrator.service.ts` |
| Entry decisions | `src/orchestrators/entry.orchestrator.ts` |
| Exit decisions | `src/orchestrators/exit.orchestrator.ts` |
| Signal filtering | `src/orchestrators/filter.orchestrator.ts` |

### 📊 ТЕСТЫ (Где TP фикс?)
```
src/__tests__/
├── services/
│   ├── position-exiting.functional.test.ts     ← TP фикс тесты
│   └── position-exiting.integration.test.ts    ← TP фикс тесты
├── orchestrators/
│   ├── entry.orchestrator.test.ts
│   ├── exit.orchestrator.test.ts
│   └── filter-strategy.test.ts
└── indicators/
    ├── ema.indicator-new.test.ts
    ├── rsi.indicator-new.test.ts
    └── ...
```

---

## 🔒 КРИТИЧНЫЙ TP BUG FIX (Session 27)

### ПРОБЛЕМА
```
После выполнения TP1:
WebSocket → entryPrice="" → parseFloat("") = NaN
↓
TakeProfitManager.entryPrice = NaN
↓
Позиция орфанирована (не управляется)
↓
ПОТЕРЯ ДЕНЕГ
```

### РЕШЕНИЕ
**Файлы:** `websocket-manager.service.ts` + `position-exiting.service.ts`

```typescript
// БЫЛО (неправильно):
const price = parseFloat(entryPrice ?? avgPrice ?? "0");
// Проблема: parseFloat("") = NaN, не падает!

// СТАЛО (правильно):
const price = parseFloat(entryPrice?.trim?.() || avgPrice || "0");
// 1. Проверить empty string
// 2. Validate parseFloat
// 3. Правильная цепочка fallback
```

### ТЕСТЫ
- **Functional:** `position-exiting.functional.test.ts` (9 тестов)
- **Integration:** `position-exiting.integration.test.ts` (7 тестов)
- **Status:** ✅ All passing

---

## 🏗️ АРХИТЕКТУРА (TL;DR)

```
┌─────────────────────────────────────┐
│     WebSocket → Market Data         │
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Entry Orchestrator               │
│  (Ranking signals by confidence)    │
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Exit Orchestrator                │
│  (State: OPEN → TP1 → TP2 → CLOSED) │ ← TP FIX HERE!
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Position Lifecycle Service       │
│  (Manage position state)            │ ← TP FIX HERE!
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Action Queue + Event Bus         │
│  (Execute trades)                   │
└──────────┬──────────────────────────┘
           │
           ↓
┌─────────────────────────────────────┐
│    Exchange API (Bybit/Binance)     │
│  (Real trades)                      │
└─────────────────────────────────────┘
```

---

## 📊 АНАЛИЗАТОРЫ (28 штук)

### Основные (используются часто)
| Анализатор | Назначение |
|-----------|-----------|
| LEVEL_ANALYZER_NEW | Уровни поддержки/сопротивления |
| BREAKOUT_ANALYZER_NEW | Пробои уровней |
| TREND_DETECTOR_ANALYZER_NEW | Определение тренда |
| EMA_ANALYZER_NEW | Пересечение EMA |
| RSI_ANALYZER_NEW | Чрезмерная покупка/продажа |

### Продвинутые
| Анализатор | Назначение |
|-----------|-----------|
| DIVERGENCE_ANALYZER_NEW | Дивергенции |
| VOLATILITY_SPIKE_ANALYZER_NEW | Скачки волатильности |
| ORDER_BLOCK_ANALYZER_NEW | Блоки ордеров |
| LIQUIDITY_SWEEP_ANALYZER_NEW | Ликвидность (sweep) |

---

## ⚙️ ТИПИЧНЫЕ ЗАДАЧИ

### Задача: Запустить тесты для TP фикса
```bash
npm test -- position-exiting
```

### Задача: Изменить TakeProfit
```json
// strategies/json/simple-levels.strategy.json
"takeProfits": [
  {"level": 1, "percent": 0.5, "sizePercent": 33},   // Изменить тут
  {"level": 2, "percent": 1.0, "sizePercent": 33},
  {"level": 3, "percent": 1.5, "sizePercent": 34}
]
```

### Задача: Добавить новый анализатор
```bash
# 1. Создать файл
src/analyzers/my-analyzer-new.ts

# 2. Реализовать IAnalyzer interface
export class MyAnalyzerNew implements IAnalyzer {
  analyze(candles: Candle[], config: any): Signal | null {
    // Ваша логика
  }
}

# 3. Добавить в registry (если нужно)
src/services/analyzer-registry.service.ts
```

### Задача: Запустить backtest
```bash
npm run backtest-v5 -- --symbol XRPUSDT --days 30
```

---

## 🚨 РЕШЕНИЕ ПРОБЛЕМ

### Проблема: Tests failing
```bash
npm test 2>&1 | head -50    # Увидеть первые ошибки
npm test -- --verbose      # Подробный вывод
```

### Проблема: Build error
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Проблема: TypeScript error
```bash
npm run build 2>&1 | grep "error TS"    # Увидеть все TS ошибки
```

### Проблема: WebSocket не подключается
Проверить:
- `config.json` → `exchange.apiKey` + `exchange.apiSecret`
- `src/services/websocket-manager.service.ts` (добавлены TP фиксы!)
- Логи WebSocket

---

## 📈 CURRENT STATE

| Компонент | Статус | Комментарий |
|-----------|--------|-----------|
| Phase 14 | ✅ Complete | V5 backtest only |
| TP Bug Fix | ✅ Fixed | Critical security patch |
| Multi-Strategy | ✅ Working | Phase 10 complete |
| Live Trading | ✅ Ready | Phase 9 complete |
| Tests | ✅ 2618 passing | All green |
| Build | ✅ SUCCESS | TypeScript clean |

---

## 🔗 ПОЛНАЯ ДОКУМЕНТАЦИЯ

- **ARCHITECTURE_QUICK_START.md** — Обзор архитектуры
- **ARCHITECTURE_BLUEPRINT.md** — Полный blueprint
- **CLAUDE.md** — История и фазы (минимизирован)
- **PHASE_15_ARCHITECTURE_PLAN.md** — Планы на будущее

---

## 💡 KEY TAKEAWAYS

1. **TP Bug Fix = CRITICAL** — Прочитать `position-exiting.service.ts` (lines 50-100)
2. **TakeProfit уже оптимизирован** — 0.5%, 1%, 1.5% для быстрого тестирования
3. **settings.json** — Русский язык, MCP включен, AutoCompact 85%
4. **Build = SUCCESS** — Все компилируется, все тесты passing

---

**Last Updated:** 2026-01-24 (Session 27)
**Status:** Production Ready ✅

*Этот файл обновляется при каждом новом session. Используйте для быстрого поиска информации!*
