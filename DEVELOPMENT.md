# Emberwild 開發與修改說明

本 Repository 為《餘燼荒野 · Emberwild》主遊戲專案。GitHub Repository 是目前版本的唯一最新版來源。
過去對話中的附件只作歷史參考；除非使用者明確指定附件版本，否則不得以舊附件覆蓋 Repository 的最新內容。

## Branch 角色

- `main`：正式穩定版本。只接受已確認發布的正式遊戲修改，以及正式環境必要的設定。
- `chatgpt-dev`：GPT／開發修改的預設工作分支。所有尚未確認發布的遊戲功能、修正、UI 或數值修改都先提交到此分支。
- 不得為了讓 ahead/behind 歸零而重寫歷史、強制覆蓋分支，或把未測試內容直接帶入 `main`。

## 修改前的版本基準

每次修改前必須：

1. 讀取目標 branch 的最新 commit SHA。
2. 讀取要修改檔案的最新 blob SHA／內容。
3. 確認 branch 在寫入前沒有被其他修改推進；若 SHA 已變更，重新讀取並重新套用修改。
4. 以 GitHub Repository 的最新內容為基準，不以舊對話附件作為最新版。

## 開發流程

1. 所有遊戲修改預設只提交至 `chatgpt-dev`。
2. Push `chatgpt-dev` 後，由該分支的 workflow 只發出 `workflow_dispatch`；真正的 Pages 部署固定從 `main` context 執行。這個 dispatch 不會建立或修改 `main` commit。
3. 在 Preview 測試並確認修改。
4. 確認正式發布後，才用正常 commit／merge 將已測試的遊戲修改發布到 `main`。
5. 不得直接將未測試的 `chatgpt-dev` 內容發布至 `main`。
6. 不使用 reset、force push、rebase 或刪除既有歷史來整理分支差異。

## GitHub Pages 與 Preview

- GitHub Pages 的 publishing source 應設定為 **GitHub Actions**，避免舊的 branch-source Pages build 與自訂 workflow 同時部署。
- `.github/workflows/deploy-preview.yml` 的部署工作同時讀取 `main` 與 `chatgpt-dev`，組成單一 Pages artifact：
  - 網站根目錄 `/` 使用 `main/index.html`，永遠代表正式版。
  - `/preview/` 使用 `chatgpt-dev/index.html`，代表測試版。
- Preview 的「測試版本」標示只在部署階段寫入 `_site/preview/index.html`；不得修改 `chatgpt-dev/index.html` 原始遊戲檔案。
- Preview deployment 永遠不得 commit、push 或以其他方式修改 `main`。
- Preview 部署產物不得形成任何 `main` commit，也不得存在於開發 branch 的 Git 歷史中。
- 每次部署 artifact 都同時包含正式版根頁與 Preview，因此更新 Preview 不會用測試版取代正式網站根頁。

## 正式發布

正式發布只處理已確認的遊戲差異。不要因為 `main` 與 `chatgpt-dev` 的 commit 數量或 ahead/behind 顯示不同，就直接整枝 merge 或覆蓋。
發布前應先比較實際 `index.html` 內容，辨識哪些差異是已測試遊戲修改，哪些只是部署／文件歷史。

## 《龍息深淵》秒數戰鬥與資料契約（v0.017）

`chatgpt-dev` 使用 `EmberwildSecondsCombat` 作為線上、背景與離線探索的共同驅動器。`seconds-timeline.js` 使用整數微秒排程；畫面更新不推進時間。掉落、傷害、職業／裝備來源與死亡事件沿用現有處理器。

## 明確時間與資源

唯一技能來源仍為 `skillSystem.definitions`。新增 `timing`：`cooldownSeconds`、`mpCost`、`castSeconds`、`actionCostSeconds`、`durationSeconds`、`bossDurationSeconds`、`tickIntervalSeconds`、`priority`、`condition`，以及選用的 `minTargets`、`requiredTargetStatusId`。冷卻與 MP 並存。舊 positional cooldown/duration 只供既有資料投影與舊格式驗證，秒數排程不讀取它們。

`balanceSettings.combat.seconds` 保存共同時間、MP、職業基礎間隔、治療門檻及 3／4／5 隻群怪權重。怪物、狀態、信物及戰鬥消耗品分別在既有定義加入 `timing`，沒有第二份技能資料庫。

初始移植基準來自原 pacing：6 秒完整輪次分成 3 秒基礎行動；既有職業速度再直接縮放間隔。舊持續效果以 6 秒參考期轉換、控制以 3 秒參考行動轉換，最低間隔由原 1.5 秒可視行動間隔的五分之一得出 0.3 秒。這些數值均可由平衡器調整，並非一回合等於一秒。

MP 採 100 點標準池，完整自然恢復為十個原參考期（60 秒）。主動成本依既有技能倍率平方根、範圍與控制性質分配 8～25 點預算；被動／原本免費的觸發技能成本維持零。新職業差異與個別技能後續調整皆寫在同一 timing 定義中。

## 事件順序與跨場狀態

相同時間先結算 DOT／HOT，再處理週期事件，然後到期、施法完成、角色行動；相同階段維持定義順序。死亡佇列會在週期傷害與後續階段間清算。每位角色同時只能執行一個主動行動。治療／增益優先，待命技能保留就緒狀態。普通攻擊免 MP。持續控制中週期事件照常執行。

英雄 MP、普攻進度、主動冷卻與觸發內部冷卻跨遭遇保留；敵人依新遭遇取得自己的時軸。狩獵模式變更只影響下一場一般遭遇，BOSS／任務仍使用關卡配置。既有機率及每隻獎勵完全沿用。

## 存檔與離線

離線快照版本 3 內含完整秒數時軸、角色資源、效果、施法、事件序號與 ID 序號。舊回合游標安全捨棄，敵人 HP、rewarded、裝備與進度保留；舊剩餘時間依明確基準一次轉換。已完成的獎勵不重發。離線跳到下一個實際事件，分批存檔，不使用另一套戰鬥公式或抽樣收益。

現實時間加倍券、抗性／增幅藥水仍由原離線時間帳本消耗；戰鬥倍速只縮短模擬事件的現實等待。

## 初始四職業資源模擬

固定亂數、現行地圖與裝備、單怪模式自動探索 600 秒。沒有修改傷害、HP、經濟或掉落設定；結果是此種起始配置的比較，不代表所有養成與地圖的最終平衡。

| 職業 | 擊殺 | 結束等級 | 主動／普攻 | 觀測最低 MP | 結束 HP | 持續探索 |
|---|---:|---:|---:|---:|---:|---|
| 戰士 | 61 | 8 | 29／170 | 84.00 | 84／84 | 是 |
| 法師 | 147 | 10 | 53／159 | 85.27 | 66／66 | 是 |
| 弓箭手 | 116 | 9 | 46／182 | 91.24 | 74／74 | 是 |
| 牧師 | 90 | 9 | 47／141 | 87.35 | 78／78 | 是 |

8 小時 LV59 單人重播，以完整規則執行兩次，各擊殺 10,402 隻；掉落、經驗、金錢及消耗完全一致，計算約 63～70 秒。高等差造成零經驗／金錢，仍依原規則獨立生成材料與寶石。未使用舊版抽樣戰鬥公式。

## 平衡器

秒數／MP 頁直接編輯 canonical timing，支援技能、狀態、怪物、信物、藥水、職業、MP 與群怪權重。機制索引可複用 timing 積木。秒數／MP 發布須確認目標分支具有 `combatTimingVersion:1`，不能把新資料送入尚未升級的正式版。舊格式資料可明確移植；未知版本、負數、無效連動引用會拒絕。

## 平衡設計器來源

平衡／設計器不放在此公開 Repository。
其原始碼位於 Private Repository：`Horios/Emberwild-Balance`，主要檔案為 `balance-editor.html`。
修改平衡器時同樣先讀取該 Repository 的最新 branch／檔案 SHA，不以舊附件作為最新版。

## 裝備技能教學與第一孔規則（追加）

沿用 `story` 任務階段、條件、領獎交易與存檔：`skill_equipment_intro` 接在 `goddess_intro` 後，四階段為 `equipment_gift`、`equip_skill`、`gem_skill`、`gem_base`。一般裝備獎勵範本 `initiation_charm` 生成啟程護符，附帶共用觸發技能 `tutorial_echo`（追擊），固定兩孔；兩顆獎勵均為一階赤焰石（0）。第一孔技能效果 +2%，第二孔攻擊 +2。只有第一孔能切換模式，選擇保存在裝備實例，未啟用時全部回到基礎效果。

選用既有任務輔助技能：戰吼 `job0-support0`、奧術共鳴 `job1-support0`、鷹眼指引 `job2-support0`、晨光祝福 `job3-support0`。四招都是一級、無二轉／精通門檻、職業特色直觀的第一招輔助技能，且不與三招初始主動重複。各職業 ID 由任務獎勵資料設定，永久解鎖沿用角色 acquiredSkillIds；保留舊存檔已取得的技能。

任務未完成前禁止出售／分解該獎勵裝備；遺失時沿用任務交易補發，預設最多兩次，寶石僅補足已領階段且實際缺少的數量。裝備範本、條件、孔位、各職業技能獎勵、補發上限與提示皆可在既有任務編輯器調整。新增行為測試：`tests/skill-equipment-tutorial.test.cjs`。
