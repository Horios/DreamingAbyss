# 成長曲線驗證

這個基準版本原本沒有可執行的自動測試套件；本次加入純公式測試、完整頁面整合測試，以及實際三人隊模擬。完整結果與有效載入來源見 `../docs/PROGRESSION_REDESIGN.md`。

使用 Node.js 20 以上，先安裝依賴與 Chromium：

```sh
npm ci
npx playwright install --with-deps chromium
```

整合測試需要對應的私有平衡器開發版本。預設位置為同層 `../Emberwild-Balance/balance-editor.html`；也可指定其他路徑：

```sh
EMBERWILD_BALANCE_ROOT=/absolute/path/Emberwild-Balance npm test
npm run test:simulation
node tests/collect-progression.cjs /tmp/progression-rows.json
```

只有純公式測試時可執行 `npm run test:unit`。已有 Chromium／Chrome 的環境，可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定瀏覽器執行檔。

- 整合測試載入 `index.html` 的完整 script 順序，檢查最終的 `stats`、怪物生成、BOSS／突破關卡、EXP 分配、設計器欄位、JSON 往返、舊存檔重載與恢復預設。
- 夥伴透過真正的招募流程取得固定配點與技能；沒有另外建造模擬版戰鬥 AI。
- 主模擬使用六種隊伍、七個等級、三種難度、3／6 普通怪、單菁英、同級 BOSS，以及 LV30 突破關卡，共 522 組，每組 24 個固定種子。模擬呼叫真正的 `pacedRound()`，停用藥水、EXP 與畫面更新，以便固定比較等級。每場上限 70 回合。
- 普通／困難／地獄分別採 T2 +0／T5 +5／T9 +10，同等級地區裝備，移除可選詞綴、寶石與 BOSS 專屬裝。玩家配置可用的 1 級技能，熟練度設定為足以滿足解鎖門檻；夥伴保留既有固定技能配置。這是完成基本養成的比較基準，並不代表所有配裝的保證勝率。
- 另用真正的創角、新手禮包與原始 3～6 隻隨機遭遇，每隊抽樣 256 場驗證 LV1。`--ungeared` 保留同地區 T1 +0 裝備，以量測高難度的養成需求。
- 模擬有瀏覽器錯誤、新手隊伍敗場、正常養成隊伍敗場，或平均超過 25 回合時會回傳失敗。低養成探索用的 `--ungeared` 容許敗場，仍禁止瀏覽器錯誤。

原始統計另存於 `../docs/progression-battles.csv`、`../docs/progression-curves.csv` 與 `../docs/progression-xp.csv`。CSV 的回合、HP 壓力等為固定種子平均值，人物與怪物的 HP／攻擊／防禦仍是整數。

`npm run test:boosts` 驗證限時道具與戰報。測試載入完整遊戲，使用瀏覽器可控制的現實時鐘推進既有 `tick()` 定時器，確認戰鬥倍速與倍速券已移除，並檢查任意百分比與分鐘、同名刷新、多來源加算、真正獎勵／掉落判定、商店購買、設計器操作與 JSON 匯出、戰鬥／戰報暫停、五種事件篩選及存檔重載。推進十秒，確認掛機時間與實際行動。限時券按現實時間到期，離線不增加掛機時間。

限時道具契約在 `js/items/timed-boosts.js`，設計器的 `timed-boost-schema-v1` 必須嵌入完全相同內容。`items[].bonusPercent`、`durationMinutes` 與既有 `shopSettings.randomOffers.entries` 是編輯、匯出、匯入及遊戲實際生效的共同來源。

`npm run test:potions` 不需要 Chromium：契約測試驗證抗性／屬性增幅藥水的個別百分比、小數分鐘、一次性遷移、效果快照及商店下架；執行測試依 `index.html` 的實際順序在 Node VM 載入完整遊戲與平衡器，驗證 JSON 匯出／匯入、玩家／敵方普攻／敵方技能傷害、同類刷新、存檔失敗回復、戰鬥回合獨立、暫停／候補到期、生命上限回復、舊存檔重載與離線到期。此測試使用最小 DOM 替身與可控制現實時鐘，不能代替瀏覽器版面或互動驗證。完整執行測試需要上述私有平衡器檔案，缺少時會標記跳過；契約測試永遠執行，且納入 `test:unit`。

`npm run test:journal` 不需要私有平衡器，使用完整頁面與瀏覽器真正的捲動事件，驗證只顯示經驗／物品且沒有新獎勵時，完整重繪與戰報局部重繪都持續停在最新訊息。另檢查手動查看舊紀錄的垂直／水平位置、戰報暫停與恢復，以及實際 2× 戰鬥期間的捲動穩定性。這組回歸測試也包含在 `npm test` 與 `test:integration`。

`npm run test:companions` 驗證夥伴名冊、現役上限、上陣限制、養成／裝備 UID 保存、實際角色導向換裝、七種評級、可調軟警告、動態夥伴與專屬技能，包含真正重新整理讀檔和平衡器 JSON 下載。來源、相容性與 14% 成長差距依據見 `../docs/COMPANION_ROSTER.md`。設計器 `companion-model-v1` 必須與遊戲 `js/character/companion-model.js` 完全相同。

`tests/shared-levels.test.cjs` 同時納入完整測試與夥伴測試：驗證只有主角累積 EXP、主角未上陣、1～3 人原有經驗量與限時增益、全名冊的固定配點／技能／自動二轉、晚招募與動態夥伴成長、LV30／60 上限、不同等級舊存檔與裝備／寶石保存、主角名稱及探索經驗條、升級卷軸與寫入失敗回復，以及實際開發工具操作。

`npm run test:tokens` 驗證夥伴裝備內化與單一信物。包括實際成長、十件信物戰鬥、正式擊殺掉落、機率／冷卻／持續、待結算與冪等遷移、寫入失敗回復、主角修改前 16 組快照、UID 所有權、真正 Chromium 換裝／手機寬度／重新整理，以及設計器操作、實際 JSON 下載與檔案匯入。詳細欄位、數值與限制見 `../docs/COMPANION_TOKENS.md`。新夥伴不再生成五件普通裝備，舊夥伴普通裝備完整保留於共用背包／待結算。

`npm run test:teams` 驗證自由轉職、獨立空白／複製／改名方案、永久與配置分離、等級推導 AP／SP、實際技能取得職業精通、二轉與元素精通門檻、一次性材料、免費確認洗點、共享 UID／信物／寶石與強制處置、所有核心入口的探索鎖定、停止與切換重置所有戰鬥狀態、v1／v2／v3 遷移、缺失引用修復及保存失敗回復。Chromium 另外操作真實按鈕／原生確認、下載／檔案匯入、重新整理、設計器欄位及 Preview 存檔隔離。測試 fixture 才新增技能或設定解鎖門檻，不改出貨技能。資料結構與限制見 `../docs/TEAM_BUILDS.md`；同樣納入完整 `npm test`。

Lucide 圖示製作器與遊戲渲染的專項驗證：`npm run test:icons`。請設定 `EMBERWILD_BALANCE_ROOT` 及 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`；專項包含實際搜尋／分類／分頁／動畫、JSON 下載往返、遊戲 UI 與保存重載，完整 `npm test` 也包含此項。共用資源更新後使用 `tools/sync-icon-resources.cjs` 同步私人單檔 HTML；模型及授權見 `docs/ICON_DESIGNER.md`。

`npm run test:pages` 驗證頁面歸屬與職業分類：隊伍方案只出現在隊伍編成，夥伴信物管理只出現在裝備與信物；主角能力／技能不受夥伴選取影響，其他職業技能預覽不修改方案；強化頁完整列出穿戴裝備並保留新手裝備與信物的操作限制；BOSS 製作依職業建立裝備並使用共用資源。文字樣式仍可由平衡設計器 JSON 匯入，遊戲只載入顯示與驗證功能。

`npm run test:interface` 驗證主角裝備精簡版面、BOSS 說明與指南在桌面及窄螢幕可完整閱讀、主角及夥伴技能 SVG，以及隊伍與探索角色圖示的選擇、存檔重載與匯入匯出。

## 2026-10-12 發布回歸與 JSON 循環

`npm test` 包含 360 個主／子測試，已更新固定姓名、獨立技能所有權、LV1／3／8 解鎖、數字通知與彈窗流程。`npm run test:balance` 執行六輪 30 欄位模組往返、錯誤輸入原子性、所有平衡器頁面瀏覽及三輪原生 JSON 下載／匯入／交易／重載。

歷史戰鬥模擬的全難度全勝門檻在目前三技夥伴版本不成立。2026-10-12 修正前後各跑 14,064 場：普通難度與新手全勝，67 組困難／地獄情境有敗場，全部統計完全相同。這項結果是已知的平衡現況，不靠修改戰鬥數值來消除測試門檻。完整清單和結果見 `docs/RELEASE_AUDIT_2026-10-12.md`。
