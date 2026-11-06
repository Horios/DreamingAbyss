# 離線快速結算：第一階段盤點（時間與存檔安全）

對照「離線探索與快速收益結算系統完整設計方案 1.0」第十一節第一階段。此階段不改收益數值與戰鬥邏輯，只確認現行時間軸與存檔安全，並記錄後續階段的起點。

程式位置：`js/combat/offline-exploration.js`（以下稱 offline）、`js/balance/published-loader.js`（以下稱 loader）。

## 1. 現行架構摘要

- 探索狀態存在 `party.offlineExploration`：`status`（running／paused／stopped）、`startedAt`、`lastAt`（最後已推進時間）、戰鬥游標 `combat`、`pendingReceipt`（累積中的收益單）、`receipt`（待確認的收益單）、`offlineWindow`（本次離線的 24 小時上限視窗）。
- 前景、背景與冷啟動補算共用同一條時間軸：全部經由 `advance(target)` 從 `lastAt` 推進到目標時間，`lastAt` 只會前進。
- 前景每個 tick 用 `sync()` 推進；背景分頁或 10 秒以上的落差改走 `settle(now,false)`（完整模擬、不建立離線收益單）；冷啟動且存檔為探索中時走 `settle(now,true)`（建立離線收益單）。
- 秒數制戰鬥目前一律以完整事件模擬補算。舊回合制的快速路徑（`tryFast`）在秒數制下以 `seconds-event-model` 原因停用。

## 2. 設計需求對照

| 設計條目 | 現況 | 證據（程式／測試） |
|---|---|---|
| 2.1 探索由存檔狀態決定，不依賴前景 | 已符合 | `continueFromTitle` 依 `status==='running'` 決定補算；`background timers and visibility restoration advance combat without creating offline rewards` |
| 2.2 每段時間只結算一次 | 已符合 | `consumeTo()` 只從 `lastAt` 往後推進；`25-minute real-time and offline replay earn identical rewards`、`simulation can advance past a durable checkpoint, then reload only that checkpoint without duplicate receipts` |
| 2.3 定期保存、隱藏時保存、不依賴關閉事件 | 已符合 | 結算中每 1 秒 `commit()`；`visibilitychange` 隱藏時 `save()`；`pagehide` 僅為額外保存 |
| 4.1 短時間中斷用完整模擬 | 已符合（目前所有時長都用完整模擬） | `one second or an unfinished ten-second encounter preserves cursor without opening any window` |
| 5.2 升級逐段處理 | 已符合（完整模擬逐次擊殺升級） | `offline kills level up immediately and recalculate later monster XP, gold and drop penalties in the same encounter` |
| 5.3 收益視窗顯示有效時間、停止事件、明細 | 大致符合；尚未標示「是否使用快速結算」 | `showReceipt()`；快速模式上線時一併加入 |
| 6.4 背包已滿 | 已符合（超出容量的裝備自動分解，探索依規則停止） | `a full bag preserves owned gear while offline combat continues with auto-salvaged overflow` |
| 7.4 死亡與停止條件 | 已符合 | `normal defeat retries by existing rules, while a failed quest encounter stops with no fabricated rewards`；`pause and stop earn no offline rewards` |
| 8.1 背景計時器節流不重複發獎 | 已符合 | `a live page never adds online battles to an unfinished offline receipt, even after tab visibility changes` |
| 8.3 回歸流程與進度提示 | 已符合 | 超過 1 秒的離線結算先畫出進度再運算；`multi-hour replay paints progress before work and reports simulation cursor against a fixed total` |
| 9.1 原子化提交 | 已符合：隊伍、戰鬥游標、收益單同一次 `setItem` | `receipt, inventory and cursor persist atomically; reload before acknowledgement never grants twice` |
| 9.2 中斷恢復；視窗顯示不等於入帳 | 已符合：收益在結算時入帳，確認視窗只清除收益單 | `interrupted batches continue from their committed cursor`；`acknowledgement write failure retains unread records and grants nothing again` |
| 9.3 多分頁保護 | 已符合：loader 以 Web Locks 取得存檔使用權，失去使用權後不能推進或確認 | `production loader queues a second tab until the owner page hides`；`losing save ownership between uncommitted batches cannot write or acknowledge rewards` |
| 9.4 時間倒退／跳躍 | 已符合：時間早於 `lastAt` 時拒絕結算並保留存檔；超過 24 小時只計 24 小時且不留下欠帳 | `backwards clock and storage failure preserve the last valid save and unsettled time`；`an absence longer than 24 hours gives the same rewards as 24 hours` |
| 12. 掛機時間上限 | 24 小時（`maxOfflineMs`），維持不變 | `interrupted settlement keeps its original cap, skips the excess, then permits a new absence` |

以上測試都在必要 CI 的 Saves／offline-simulation／offline-lifecycle 群組內。

## 3. 第一階段結論

時間與存檔安全的需求在現行程式中已具備且有測試覆蓋，這一階段不需要修改程式。主要差距在效能：

| 情境（新建 LV1 戰士，Chromium 桌面環境） | 目前耗時 |
|---|---|
| 離線 1 小時 | 約 2.3 秒 |
| 離線 8 小時 | 約 16 秒 |
| 離線 24 小時 | 約 36.7 秒（14,474 擊殺） |

設計目標是 24 小時主要計算 1 秒內，需要第二、三階段的效率快照與快速收益引擎。

## 4. 後續階段起點

- 第二階段（只收集，不改收益）：在完整模擬與前景戰鬥中記錄每個「配置＋地圖」鍵的戰鬥時間、擊殺、經驗、金幣、HP／MP 低點、藥水消耗與死亡；鍵值可沿用 `combatKey()`，但需改為秒數制欄位（`skillLoadout`、`passiveEnabled`、MP）。
- 第三階段：秒數制專用的分段收益模型。舊 `tryFast` 只支援單人、無 MP、無觸發技能的回合制情境，不能直接沿用。升級、BUFF 到期、背包滿、HP／藥水門檻仍需切回完整模擬。掉落一律呼叫既有 `rewardGroupKill`，不建立第二套掉落率。
- 驗收：沿用 `tests/offline-fast-validation.cjs` 的 A／B 比較方式（完整模擬對快速模型），經驗與金幣長期平均誤差 5% 以內，稀有掉落比較分布。
