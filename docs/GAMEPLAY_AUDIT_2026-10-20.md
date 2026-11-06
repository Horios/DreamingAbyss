# 遊玩、掛機與存檔測試方案

基準：`chatgpt-dev`／`24e14b8ebd0fe7e3299e368990c865cdb4374f24`。

目標是找出可重現的遊玩錯誤、重複發獎、時間遺失、進度回退與無法讀檔。只修正已確認問題，不以改動平衡數值讓測試過關。測試通過不代表不存在其他 BUG。

## 測試矩陣

| 範圍 | 操作與邊界 | 必須維持的條件 |
| --- | --- | --- |
| 創角與標題 | 三欄存檔、新建／取消、返回標題、標題頁重新整理 | 不覆蓋其他欄位；標題不補算或跳結算錯誤 |
| 探索控制 | 開始、暫停、恢復、停止、換圖、換難度、空白配隊 | 停止後不產生收益；未結算時間先處理；操作不重置已發獎狀態 |
| 戰鬥 | 四職業、夥伴、主動／被動／觸發、控制與狀態、冷卻、補品 | 使用正式戰鬥程式；HP、資源與數值有效；勝敗只結算一次 |
| 關卡 | 一般遭遇、BOSS、終局、任務關卡、戰敗 | 各自遵循目前勝敗與停止／自動重試規則 |
| 掛機時間 | 1 秒、10 秒、多場、30 秒至 24 小時、倍速邊界 | 按實際時間處理行動事件；與固定隨機來源的持續遊玩一致 |
| 背景生命週期 | 前景→背景→前景、計時器節流、pagehide、冷啟動 | 時間區間不重疊；尚未處理的時間不因儲存而消失 |
| 收益視窗 | 未完成遭遇、零收益、未關閉又離開、連續確認、重載 | 完整戰鬥＋有效收益才顯示；舊內容不變；新收益排隊；確認不發獎 |
| 限時效果 | 同名疊加、獨立來源、停用、暫停、到期時刻、重新讀取 | 現實時間只扣一次；期限不因讀取、視窗或倍速而錯置 |
| 裝備與背包 | 掉落直入背包、滿包、鎖定、篩選、多選、換裝、強化、洗鍊 | 裝備 UID 不重複；鎖定與容量規則保留；材料與金錢收支一致 |
| 任務與交易 | 主／支線、NPC、每日委託、信箱、商店、生活技能 | 獎勵不重領；需求道具確實回收；取消不扣資源；失敗可恢復 |
| 讀檔與遷移 | v1／v2／v3、舊收益、戰鬥中途、匯出／匯入、未知欄位、非法數值 | 合法舊檔不重複遷移；拒絕非法檔案時不替換目前角色 |
| 寫入故障 | 首次寫入失敗、批次中斷、確認失敗、備份失敗、讀取失敗 | 最後有效存檔可恢復；背包、游標、收益與時間原子保存 |
| 多分頁 | 等待鎖、接管、舊分頁晚到的 tick／save、BFCache | 同一存檔只有一個寫入者；失去權限後不推進或確認 |
| 顯示與互動 | 桌面／手機、提醒標記、原生對話框、鍵盤、捲動 | 視覺與真實瀏覽器測試另行記錄，不以 DOM 替身測試代替 |

## 執行順序與判定

1. 驗證分支及檔案雜湊，以相同版本執行既有模型／完整腳本測試。
2. 固定時鐘及隨機來源，對照持續遊玩與離線補算；比較角色、資源、裝備與戰鬥游標。
3. 針對生命週期、存檔故障及操作交錯新增能先重現問題的回歸測試。
4. 將失敗分為遊戲 BUG、過時的測試預期、測試替身問題及環境缺件。不得把跳過或無法執行列為通過。
5. 先修會丟檔、複製獎勵或阻止遊玩的問題，再處理其他已重現錯誤。每項修正只修改直接相關流程。
6. 修正後重跑受影響測試；若共用存檔或戰鬥流程改變，再重跑對應完整類別。
7. 確認平衡 JSON 未修改，只推送測試分支，並核對部署工作流程。

## 已重現並修正

| 問題 | 修正與回歸證據 |
| --- | --- |
| 壞掉的信物戰鬥快照或回合角色引用可能在替換目前隊伍後才失敗 | 載入前驗證快照及技能游標；拒絕讀入時，隊伍物件、資源與進度不變 |
| 結算寫入失敗且主要存檔也無法讀取，錯誤處理再次拋錯 | 保留最近成功寫入的原始存檔供回復；恢復儲存後從該游標繼續，只發一次收益 |
| 切難度先清掉尚未補算的遭遇 | 與換圖沿用同一個「先補算再操作」流程；固定隨機來源對照不切難度的結果 |
| 修改「倍速結束停用增益」會回溯影響先前時間 | 先完成舊設定下的補算，再允許修改；檢查 1 秒倍速／10 秒經驗增益在第 5 秒的剩餘時間 |
| 購買補品或接取任務先發生，之後才補算舊戰鬥 | 商店、強化／洗鍊、物品處置、任務／信箱領獎與自動喝水設定同樣先補算；舊分頁失去存檔權限時禁止這些操作 |
| 延遲 tick 每次走非同步補算，採集／煉金更新被跳過 | 補算結束後執行生活技能 heartbeat，並以正常存檔流程保存；連續 5 次 1001ms tick 仍取得並保存一輪採集及煉金成果 |
| 舊版空白已完成收益紀錄永久占住顯示位置 | 遷移時清除沒有有效收益的已完成紀錄；保留有收益的舊紀錄，新收益照常排隊；不改角色資源 |

已另外重現：穿戴中裝備在補算前強化，會使較早開始的下一場遭遇使用新能力；裝備操作現在也先完成舊時間，再依原有「下場生效」規則處理。

新增回歸測試位於 `tests/gameplay-lifecycle-audit.test.cjs`。每個問題都先重現失敗，再修正並重跑；測試本身的錯字或不穩定抽樣不當作 BUG 證據。

設定匯入儲存失敗的回復流程也已重現故障：匯出格式把物品說明移到圖示目錄，較早的回復匯入器仍需要內嵌說明，因而在恢復 HP／護盾／冷卻前再次拋錯。隊伍層現在先還原說明欄位再保存回復快照，並透過完整匯入流程恢復晚期加入的圖示、顏色等設定；恢復時不重新提交隊伍或存檔。保留原有規則與資源，不修改發布版 JSON。

## 可重跑的檢查

```sh
node tools/run-gameplay-audit.cjs
node --test tests/gameplay-lifecycle-audit.test.cjs
node --test tests/offline-exploration.test.cjs tests/offline-receipts.test.cjs
node --test tests/daily-commissions.test.cjs tests/exploration-controls.test.cjs tests/team-save-compatibility.test.cjs tests/published-loader.test.cjs
```

廣泛檢查工具逐檔執行、限制同時執行數與單檔時間（一般 120 秒、含 24 小時案例的離線檔 600 秒），輸出每檔 TAP 及 `summary.json`。可設定 `EMBERWILD_AUDIT_OUTPUT`、`EMBERWILD_AUDIT_CONCURRENCY`（1–4）、`EMBERWILD_AUDIT_MATCH`。輸出預設在忽略版控的 `.audit-results/`。瀏覽器套件另列為未執行，不能算作通過；私有平衡器缺件仍保留失敗，不隱藏。

測試基礎也調整為在最終載入階段套用發布版 JSON，並模擬正式載入器的讀檔錯誤攔截與 Web Locks。每日委託測試會等候非同步補算；探索控制測試重設獨立案例的時間；隊伍遷移測試只忽略語意相同的「未配戴信物」空值。

## 真實瀏覽器驗收

使用備份測試存檔，記下角色等級／經驗、金錢、裝備 UID、最後結算時間、收益紀錄 ID。桌面與窄螢幕分別執行：

1. 標題停留、重新整理、三欄存檔切換；合法存檔可進入，非法存檔不覆蓋原始位元組。
2. 遭遇中切背景 1 秒／10 秒，再做多場長掛；未完成與零收益不跳視窗，已發獎與顯示紀錄一致。
3. 收益視窗保持開啟，再離開 20 分鐘、重新整理、關閉舊視窗；舊內容不被重設，新收益只顯示一次。
4. 同時採集／煉金，節流計時器；資源在各自原有週期增加，手動停止與返回標題後不再製造產物。
5. 在收益視窗、增益剛到期、背包將滿、BOSS／任務關卡失敗時重複 visibilitychange／pagehide；比對最後已保存游標。
6. 開第二分頁等待接管，關第一分頁後操作第二頁；BFCache 返回舊頁應重新載入，不得出現兩個寫入者。
7. 模擬配額及儲存讀寫拒絕，失敗後恢復權限並重試；原檔、裝備 UID 與總收益不能重複或消失。
8. 檢查手機捲動、對話框焦點、綠色 N 標記與側欄間距。此類項目必須在真實瀏覽器驗證。

## 執行結果

相關回歸以每個案例最後一次結果去除重複，**108 項通過**。這是分批驗證，不能解讀成單次全專案測試全綠。

| 相關套件 | 通過案例 |
| --- | ---: |
| 新增遊玩／生命週期回歸 | 12 |
| 隊伍執行、設定拒絕與失敗回復 | 23 |
| 離線結算（含 30 秒、5 分鐘、1／8／24 小時） | 20 |
| 收益顯示與排隊 | 10 |
| 每日委託 | 6 |
| 探索控制與增益 | 14 |
| 舊隊伍存檔相容 | 3 |
| 正式載入器的隔離測試 | 6 |
| 裝備背包 | 8 |
| 洗鍊粉塵收支 | 6 |

最後的 35 項合併批次曾有 34 通過、1 失敗，失敗為拒絕恢復預設時沒有完整還原晚期圖示設定。修正後，該原失敗與新增設定儲存回復案例均補跑通過（2／2）。沒有把修正前的失敗刪去或列為原始通過。

24 小時補算實際完成 10,038 次擊殺；該案例在此次並行測試環境耗時約 183 秒。它沒有截斷有效掛機時間；正式程式仍分批讓出執行緒。這個數字只代表測試環境結果，不是所有裝置的效能保證。

完整廣泛檢查共 **63 個測試檔**：27 檔通過、31 檔失敗、4 檔超時、1 檔全部跳過；取得完整計數的案例為 **230 通過、69 失敗、3 跳過**。超時檔的 0／0 不代表通過。廣泛檢查執行期間持續修正，最終受影響類別另補跑，不能當成一個不可變版本的完整驗證。

廣泛檢查中的離線與隊伍超時，已各自完整／補跑驗證；**skill-effects 與 story-system 的完整套件仍未核實**。另外 31 個真實瀏覽器測試檔沒有執行：此環境無 Chromium，安裝下載也未成功。手機排版、原生對話框及真實跨分頁互動不得以 DOM 替身結果替代。

未通過項目主要包含私有設計器／發佈服務缺件、舊資料與介面預期、未等待非同步補算，以及留下懸空圖示引用的測試資料。這些失敗仍保留，並未放寬遊戲驗證器或修改平衡 JSON 讓測試過關；也不能據此保證其餘所有問題都已排除。


### 廣泛檢查未通過檔案

逐檔計數、超時及瀏覽器清單也保存在同目錄的 `GAMEPLAY_AUDIT_2026-10-20.results.json`。

| 檔案（tests/） | 結果 | 原因／追蹤 |
| --- | --- | --- |
| `achievements.test.cjs` | failed（4／9 通過） | 部分案例缺私有設計器；另有舊信箱通知文字與新手郵件數量預期。 |
| `balance-github-app.test.cjs` | failed（0／1 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `balance-release-promote.test.cjs` | failed（0／1 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `balance-release-restore.test.cjs` | failed（0／1 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `balance-release-security.test.cjs` | failed（0／1 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `balance-release-service.test.cjs` | failed（0／1 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `balance-roundtrip.test.cjs` | failed（1／2 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `companion-skill-ownership.test.cjs` | failed（5／7 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `companion-skill-toggles.test.cjs` | failed（4／5 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `companion-tokens.test.cjs` | failed（10／13 通過） | 部分缺私有設計器；測試刪除定義後留下圖示引用，驗證器拒絕懸空資料。 |
| `companion-unlocks.test.cjs` | failed（4／5 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `forge-equipped-runtime.test.cjs` | failed（3／5 通過） | 仍比對已調整的信物／裝備介面文字，需更新預期。 |
| `global-item-catalogue.test.cjs` | failed（6／7 通過） | 新增每日兩小時倍速券後，舊品項數量預期未更新。 |
| `icon-canvas-tools.test.cjs` | failed（1／2 通過） | 測試更換圖示清單後留下素材圖示引用。 |
| `inventory-supplies.test.cjs` | failed（2／4 通過） | 仍比對圖示清單中已移到詳細視窗的文字。 |
| `item-descriptions.test.cjs` | failed（0／2 通過） | 舊品項總數及列表文字預期。 |
| `life-products.test.cjs` | failed（5／6 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `life-release-compatibility.test.cjs` | failed（0／1 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `life-skills.test.cjs` | failed（3／13 通過） | 包含已不存在的 process 配方、舊原料／類別／庫存列數，以及未等候非同步補算的案例；新回歸使用發布版實際採集與煉金配方。 |
| `mailbox.test.cjs` | failed（5／7 通過） | 缺私有設計器及未等候非同步讀入／補算。 |
| `material-prices.test.cjs` | failed（0／5 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `named-companions.test.cjs` | failed（2／4 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `navigation-tree.test.cjs` | failed（2／3 通過） | 發布版主線任務分組順序已調整，舊預設陣列未更新。 |
| `offline-exploration.test.cjs` | timeout（0／0 通過） | 廣泛檢查時間上限不足；獨立完整重跑 20 項通過，含 24 小時補算。最終工具已把此檔上限改為 600 秒。 |
| `quest-design.test.cjs` | failed（5／8 通過） | 缺私有設計器及舊獎勵／委託數字預期；新版每日委託 6 項另已通過。 |
| `realtime-stacking.test.cjs` | failed（1／5 通過） | 仍使用已改成 remainingMs 的 expiresAt 欄位及舊效果時間預期。 |
| `skill-effects-editor.test.cjs` | failed（0／3 通過） | 缺少同層私有 Emberwild-Balance 設計器或發佈服務；未驗證此跨專案整合。 |
| `skill-effects.test.cjs` | timeout（0／0 通過） | 超時，未完整核實；先前部分執行另出現早期模組還原警告斷言，需獨立追蹤。 |
| `skill-icons.test.cjs` | failed（3／5 通過） | 缺私有設計器及刪除自訂圖示後留下素材引用。 |
| `speed-boss-progression.test.cjs` | failed（1／2 通過） | 舊同步 tick／增益到期預期未更新。 |
| `starter-mail-items.test.cjs` | failed（6／9 通過） | 測試修改發布資料已不存在的 starterPackItems；冷啟動領信案例未等候補算。 |
| `story-system.test.cjs` | timeout（0／0 通過） | 超時，未完整核實，需獨立追蹤。 |
| `team-plan-management.test.cjs` | failed（7／8 通過） | 舊按鈕 disabled／title 文字匹配。 |
| `team-runtime.test.cjs` | timeout（0／0 通過） | 廣泛檢查超時；後續重現並修正設定回復時說明欄位遷移缺失，最終完整重跑另列。 |
| `utility-navigation.test.cjs` | failed（5／9 通過） | 舊郵件數、每日任務提醒及掃描次數預期。 |

### 修改檔案與範圍

- 正式遊戲程式：`js/combat/offline-exploration.js`、`js/character/team-runtime.js`。
- 回歸／測試替身：`tests/gameplay-lifecycle-audit.test.cjs`、`tests/headless-runtime.cjs`、`tests/daily-commissions.test.cjs`、`tests/exploration-controls.test.cjs`、`tests/team-save-compatibility.test.cjs`、`tests/published-loader.test.cjs`。
- 測試工具及輸出排除：`tools/run-gameplay-audit.cjs`、`.gitignore`。
- 本方案與逐檔結果：`docs/GAMEPLAY_AUDIT_2026-10-20.md`、`docs/GAMEPLAY_AUDIT_2026-10-20.results.json`。

`data/balance.json` 與其他平衡資料沒有修改；不變更 `main`，只提交 `chatgpt-dev`。此報告是已完成的測試與待驗證範圍，不是「所有 BUG 已消除」的宣告。
