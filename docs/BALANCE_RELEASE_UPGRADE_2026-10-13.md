# 平衡資料與發布管理升級

## 狀態

遊戲資料流、私有平衡器發布頁、本機安全服務、Git 版本比較／還原／正式版升級已實作。實際 GitHub App 尚未安裝／提供憑證，因此 App 認證的真實發布、還原及正式版升級仍未完成線上端對端測試。不得把本機 Git 模擬測試說成真實 GitHub API 發布。

程式整合與 Pages 部署可透過既有 GitHub connector 提交；此 connector 的登入不能作為本機服務的 App 私鑰，兩者清楚分離。

## 最終架構

- 公開遊戲 Repository `Horios/DreamingAbyss`：每個 branch 的 `data/balance.json` 是該版本遊戲設計資料的正式來源。`main` 與 `chatgpt-dev` 原有有效數值分別匯出；沒有把測試版數值直接覆寫正式版。
- `data/build.json` 只有版本 metadata，不是第二份平衡資料。Pages artifact 會寫入 branch、來源 commit 與 balance blob SHA。
- `index.html` 先載入共用 document preflight，再由 `published-loader.js` 取得版本 metadata 與 JSON，按原始順序啟動所有遊戲模組。完成最終 validator／apply 後重讀原玩家存檔，保留選取角色與進度。
- `balance-document.js` 負責 schemaVersion、JSON 值與必要結構、有限數值、型別、ID、機率單位及跨系統引用。沿用現有最終 validator。狀態不另維護第二份 enum：直接比對既有最終 normalizer，拒絕非法值被默默改寫。
- `balance-schema.js` 保留怪物／掉落的既有 schema；地圖引用依候選 JSON 的地圖數檢查，道具引用由完整 document 的 items 檢查，避免驗證時誤用上一版 runtime 資料。
- `numeric-compression-formula.js`：既有傷害公式與屬性運算邏輯；數值設定由 JSON 套用。
- `progression-model.js`：成長／EXP／migration 邏輯與 fallback；`progression-runtime.js` 將設定接到角色、存檔及獎勵。
- `balance-runtime.js` 保留既有战報／獎勵包裝，不引入第二份設定。
- 私有 `Horios/DreamingAbyss-BalanceEditor` 保留 `balance-editor.html`，加上 `server/` 安全發布服務與 `PUBLISHING.md`；未公開平衡器 HTML 或 App 金鑰。

## JSON 管理範圍

既有有效 export 全部保留：職業初始值／成長／階梯、主動／觸發／輔助技能、夥伴定義與技能歸属／解鎖／被動、狀態、地圖、怪物與能力、掉落規則、裝備基底／固定效果／詞條池／前後綴／BOSS 詞綴／強化、初始裝備、消耗品與限時增益、商店池、材料售價、戰鬥公式／成長／獎勵／隊伍設定、信物、文字效果、SVG 圖示及 UI 文案。

新增 `lifeSkills`：動作時間、小蟲機率、生活材料購買價格與兩種既有配方的投入。執行、費用、進度與相關說明使用相同設定，保留原來 5000 ms、5%、1 金幣與配方數量。

測試版已有 `balanceSettings.quests.design`，繼續作為每日委託／支線的唯一新設計來源。正式版原有 JSON 尚未含 design，保留 board／side 的舊執行語意；加入只在發布文件含 design 時啟用的現有設計執行器，能解讀測試版 JSON，卻不把正式版當前委託數值／算法提前替換。

## 留在程式的內容與已知資料限制

傷害、回合、狀態、掉落抽選、任務交付、存檔及 UI 執行邏輯仍在 JS；固定職業／部位／寶石／既有道具種類與 storage 身分也仍是程式契約，不能任意新增效果種類而期待執行器自動理解。

JS 仍保留 schema、normalizer、legacy defaults／fallback。正常線上啟動必須取得 JSON，失敗會停止啟動；不會偷偷改用 JS 預設當作線上最新版。舊無 schemaVersion JSON 的缺省欄位以該執行版本的完整基準遷移，不使用使用者最近編輯內容當預設。

仍未 JSON 化的有效設計常數包括成就階梯的 50 隻間距與 1000 隻上限，以及採集固定產出 1 份／固定材料身分。這些目前仍與既有成就 ID／存檔及單一採集執行器綁定。本次沒有重設其機制；不能宣稱所有遊戲數字均已資料化。生活技能新欄位目前使用原始 JSON 頁編輯，沒有額外增加一套配方／成就系統。

Compatibility-only 欄位依 `_reference.legacySettings` 保留說明：舊掉落機率、舊難度詞條數值、舊 BOSS 強度／效果、bossChance、新委託取代後的 board／repeat／side。`progression.statsPerLevel` 在缺少職業獨立成長時才作 fallback；不覆写各職業初始／成長。

## 草稿、來源、匯入與備份

平衡器本機工作區繼續自動儲存。取得線上版本、切換目標、比較歷史都不改寫草稿；只有匯入或明確確認載入版本會替換資料。匯入：parse → version 檢查／migration → 前置檢查 → 原有 normalize／validate → 工作區，自身不發布。

`schema: emberwild-balance-v1` 加 `schemaVersion: 1`。未提供 schemaVersion 的既有文件被明確遷移到 1；未知／未來版本拒絕，不自動降版。保留資料順序、IDs、references、skills、statuses、drops、equipment、world、companions、shop 與 materials 的現有 round-trip 框架。

正式版忽略歷史瀏覽器 balance cache。測試版只有明确匯入／套用並留下目前發布基準 marker 的 override 才跨重載保留；新的線上 JSON 出現時改讀新版，原 override bytes 仍留在瀏覽器供備份，不覆寫平衡器草稿。

玩家存檔不提供平衡設定來源。載入／匯出會移除已知的 balance、balanceSettings、balanceConfig、gameBalance 歷史副本；玩家 EXP 遷移所需的曲線快照與裝備／當日委託等進度快照保留。無效玩家存檔仍能到標題選欄位、查看讀取錯誤並下載未改寫的原始 JSON。

## 認證、發布與版本

本機 Node 服務只 bind `127.0.0.1`。HttpOnly／SameSite session、Origin／Host／CSRF 檢查、固定 repository／branch／檔案路徑。RSA App JWT 與 installation token 全在服務端；token 僅限 Emberwild，Contents write、Actions read。無 PAT、OAuth user scopes、administration、secrets 或 organization 權限。

測試版：驗證 → 讀取固定 SHA → 語意 diff → 具體版本說明 → session 綁定、十分鐘有效的摘要 ticket → 勾選確認 → 再讀 SHA → Git blob/tree/commit → 非 force ref 更新 → 核對線上 blob。

正式版：GitHub chatgpt-dev 的固定 commit 為唯一正常來源，本地資料被忽略；比較 main、显示測試來源 SHA、輸入「正式版」並確認。提交前及 ref 更新前核對來源；commit body 記錄 `Source-Test-Commit`。

還原：只接受該分支可達的歷史版本，驗證／比較／確認後建立 `restore balance data to <sha>` 新 commit。從不 reset／force push／刪除後續 commits。零差異禁止建立 commit。

版本紀錄使用 balance.json 的 Git history，可翻頁、看與父版本的修改、下載、載入與選擇歷史比較基準。不另建版本資料庫。

Commit 完成只顯示「資料已提交，等待部署」。Pages 成功必須核對 build.json 的來源 commit／balance blob；Preview dispatch 的主工作名稱攜帶 preview commit，便於識別部署失敗。讀取 JSON／metadata 使用 no-store，模組 URL 使用部署 commit 做 cache busting。

## 驗證結果

完整回歸實際執行 419 項：418 項通過，1 項無效存檔救援失敗已修正；修正後含該失敗案例的 6 項來源／發布／存檔專項全部通過。沒有尚未修正的測試失敗。App API 授權／rate limit／網路等 9 項安全專項也全部通過。真正網路發布仍待 App 安裝，不能視為已驗收。

GitHub Actions 的 main push、chatgpt-dev request 及 main dispatch 工作均 completed／success，最終部署工作為 https://github.com/Horios/DreamingAbyss/actions/runs/38356601369 。實際從正式版與 `/preview/` 下載 build.json、balance.json、HTML 與 published-loader.js；兩份 JSON 的 Git blob SHA 都與部署 metadata、對應分支檔案一致，loader 也完全一致。

| 線上版本 | 部署來源 commit | 平衡 JSON blob |
|---|---|---|
| main | 0402f4b2b1437a791b30eb0991fd479f77f9b5cf | a40ce39ad28d5dada3a908cce48c756073703c0b |
| chatgpt-dev | 67897a83a470e4491b874b59497e956f7e1ea05e | 6237267f3fa901fb789b9eba287a5a47da4542a5 |

另以 Chromium 實際開啟上述正式版與 `/preview/` 網址；兩頁 BALANCE_READY 為 true、LOAD_ERROR 為空、published JSON 與遊戲最終 exportableBalance() 語意差異皆為 0，pageerror 也皆為空。測試瀏覽器透過執行環境代理連線，僅針對公開網站在測試 context 忽略代理憑證錯誤，未修改產品的 TLS／認證設定。

上述驗證確認程式整合部署；不代表專用 App 的發布、還原及正式版升級已完成真實網路驗收。

實際測試包括：原有全部設定頁；六輪 30 欄位往返；三輪真實表單／下載／匯入／重載；語意新增／修改／刪除與陣列順序；非法 schema／NaN／Infinity／負值／機率／ID／reference；RSA JWT 與 token 權限；401／403／404／409／422／429／網路錯誤；ticket、空 diff、SHA conflict、non-force commit；歷史還原、新 commit 與正式來源固定；真实瀏覽器＋本機 HTTP UI 流程（GitHub API 使用記憶體 Git fixture）；兩分支資料零差異；正式版讀取測試設計零遺失；舊 cache／玩家設計快照隔離；新 JSON 後 override 失效；未知版本停止啟動；無效存檔復原下載；所有原有玩法回歸。

## Checkpoint

| 階段 | 公開遊戲 commit | 私有平衡器 commit |
|---|---|---|
| 1 統一來源 | f9bd82ac9c7db0b99a4b6bc1c1e6449cd2a75c7d | 沿用 5fee833 基準 |
| 2 Schema／驗證／migration | ed5db9e3ed811932bc0d1be8f54410ae4d534af3 | b247ad4a7e51a3648401a4d70fb5f758b340ab58 |
| 3 語意比較 | b36b5ab74584bd61166a7aff824c693c84143007 | b1bce5fc5c69ee56d96ebf48e591c7b8e254514e |
| 4 安全 App／服務 | 6525b30058c01428b39669a95d158118c1227fbf | d9c87f9b178bc14871ff960d40aa0f472c959424 |
| 5 測試版／歷史 | f5b0699f425cdffc3757a5e1d6da3d1291932809 | 273cc820fbf1acde2e009967b87e549aae4667bb |
| 6 還原 | f4801bccdca29bf4baddbc88b09fe9144432c5a7 | 93fd9d742f6f2b69faa1057a8cbc1d8501e79447 |
| 7 正式版升級 | e1d6b31a7af2a965f90045436366868293616a27 | fa4e9632111d25a68d7b5aaceef1ec49b8708f4c |
| 8 回歸修正／資料相容／部署 | 67897a83a470e4491b874b59497e956f7e1ea05e | 481d28f3150db6604658560553471a14b60e05a2 |

八階段 checkpoint 保留在兩個 `balance-release-upgrade` 分支。公開遊戲已整合到 chatgpt-dev（67897a83a470e4491b874b59497e956f7e1ea05e）；正式版僅整合必要資料流與部署配套（0402f4b2b1437a791b30eb0991fd479f77f9b5cf），保留其原數值与其他遊戲差異。私有平衡器 main／chatgpt-dev 都已整合到 481d28f3150db6604658560553471a14b60e05a2。本報告後續文件提交不改變上述階段 checkpoint。

## GitHub 授權核對（2026-10-13）

即時 connector 檢查登入帳號為 Horios；公開 Emberwild 與私有 Emberwild-Balance 都能讀取，Repository metadata 回報帳號 pull／push／admin 等權限，Emberwild collaborator permission 為 admin。這是帳號權限資訊，不代表 connector 具備所有 administration API 能力。既有提交成功也已確認 connector 的程式提交可用。

ChatGPT GitHub App 安裝目前 repository_selection 為 all；未擅自調整使用者的安裝範圍。專用平衡發布 App 的目標範圍仍只限 Horios/DreamingAbyss，服務要求 Contents write 與 Actions read。

本機服務目前沒有設定檔，也没有設定 App ID、Installation ID 或私鑰路徑。不能從這個結果判定使用者帳號下完全沒有其他 GitHub App；只能確認本服務尚未配置其授權。ChatGPT connector 的登入無法交付給本機服務使用，也不把 connector 憑證寫入前端或 repository。

啟用與驗收剩餘發布操作需依私有平衡器 PUBLISHING.md 完成一次性 App 安裝與本機設定。私鑰存放於 repository 以外，勿透過聊天或前端傳送。此後才能實測 App 建立 commit、preview 讀取該次發布、歷史還原產生新 commit、將該測試版來源升級至 main 等完整真實流程。
