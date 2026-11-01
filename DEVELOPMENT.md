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

## 《龍息深淵》秒數戰鬥移植進度（v0.015）

本階段僅交付排程核心與換算稽核工具，尚未將遊戲、離線結算或存檔切換到秒數制。`js/combat/seconds-timeline.js` 載入後只註冊 API；不覆寫現有 `pacedRound`、技能、存檔或掉落函式。六階段改版尚未完成，名稱與介面也尚未更換。

核心使用整數微秒排程，公開參數使用秒數；沒有職業或技能平衡預設值。每個角色獨立保留普攻充能、共同動作限制、各技能冷卻與 MP。相同時間先結算週期效果，再移除到期狀態、完成施法，最後按隊伍固定順序行動；技能依優先級及配置順序選擇。週期效果的最後一次 tick 包含到期邊界。主動增益同樣消耗 MP 與行動，觸發效果不改變行動時間。永久效果使用 JSON 可保存的 `null` 期限。條件判斷由純函式 `canUse` 提供；傷害、目標、死亡連鎖與收益仍需沿用既有處理器接通，不能把排程測試視為技能移植驗收。

`node --test tests/seconds-timeline.test.cjs` 驗證排程及中斷續算。`node scripts/audit-seconds-migration.cjs` 讀取目前發布資料與共用技能索引，列出回合換算、MP 與特殊事件的缺口；不寫入平衡資料。`node scripts/audit-seconds-migration.cjs --candidate candidate.json --seconds 28800` 可模擬明確提供的 `{config, actors, statuses?}` 排程與 MP 參數。這是排程與資源模型，尚不能用來判斷傷害、生存或掉落平衡。

啟用前仍須完成：正式時間／MP 參數設計與技能適配、同一核心的線上／離線入口、一次性舊戰鬥快照遷移、離線快速樣本失效處理、主角中央介面、狩獵模式與平衡器同步。不得用本核心的快照直接覆蓋現有角色存檔。

## 平衡設計器來源

平衡／設計器不放在此公開 Repository。
其原始碼位於 Private Repository：`Horios/Emberwild-Balance`，主要檔案為 `balance-editor.html`。
修改平衡器時同樣先讀取該 Repository 的最新 branch／檔案 SHA，不以舊附件作為最新版。

## 裝備技能教學與第一孔規則（追加）

沿用 `story` 任務階段、條件、領獎交易與存檔：`skill_equipment_intro` 接在 `goddess_intro` 後，四階段為 `equipment_gift`、`equip_skill`、`gem_skill`、`gem_base`。一般裝備獎勵範本 `initiation_charm` 生成啟程護符，附帶共用觸發技能 `tutorial_echo`（追擊），固定兩孔；兩顆獎勵均為一階赤焰石（0）。第一孔技能效果 +2%，第二孔攻擊 +2。只有第一孔能切換模式，選擇保存在裝備實例，未啟用時全部回到基礎效果。

選用既有任務輔助技能：戰吼 `job0-support0`、奧術共鳴 `job1-support0`、鷹眼指引 `job2-support0`、晨光祝福 `job3-support0`。四招都是一級、無二轉／精通門檻、職業特色直觀的第一招輔助技能，且不與三招初始主動重複。各職業 ID 由任務獎勵資料設定，永久解鎖沿用角色 acquiredSkillIds；保留舊存檔已取得的技能。

任務未完成前禁止出售／分解該獎勵裝備；遺失時沿用任務交易補發，預設最多兩次，寶石僅補足已領階段且實際缺少的數量。裝備範本、條件、孔位、各職業技能獎勵、補發上限與提示皆可在既有任務編輯器調整。新增行為測試：`tests/skill-equipment-tutorial.test.cjs`。
