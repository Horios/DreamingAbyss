# 交接指令：v0.225 後續

工作分支：`claude/hopeful-hypatia-0lp08r`（Horios/DreamingAbyss）。平衡器 repository 是 `Horios/DreamingAbyss-BalanceEditor`，兩邊用同名分支。
v0.225 已合併 `feature/material-economy-crafting`（v0.224），請以這個分支的最新 commit 為基準。

## 一、刪除測試劇情任務「兩地巡查（測試）」

目前狀態：`data/balance/systems/story.json` 的 `two_regions` 被設成 `hidden: true`，新存檔看不到，舊存檔已接過的仍會顯示。這次要整個刪除。

1. 從 `data/balance/systems/story.json` 移除 `two_regions` 整個任務，執行 `node scripts/balance-modules.cjs build` 重建 `data/balance.json` 與 manifest，再用 `check` 確認一致。
2. 存檔處理：讀檔時清除 `party.story.quests.two_regions` 的紀錄，不發放也不補償它的獎勵。比照 v0.222／v0.223 清除退役欄位的寫法，只刪這一筆，其他任務紀錄保持原樣。
3. 下列測試直接引用 `two_regions`。請改成在測試內建立自己的測試任務（用 `exportableBalance()` 加一個任務後 `applyBalanceConfig`），不要依賴正式資料裡的任務：
   - `tests/story-system.test.cjs`（跨地圖連續任務：擊殺、BOSS 紀錄、每階段重新讀檔）
   - `tests/story-window.test.cjs`
   - `tests/story-window.browser.test.cjs`
   - `tests/fixtures/legacy-skills-job0.json` 到 `job3.json` 裡的 `two_regions` 存檔紀錄。這些檔案可順便用來測試第 2 點的清除行為。
4. 新增一項測試：載入含有 `two_regions` 紀錄的舊存檔後，紀錄已消失，支線頁不再顯示，其他任務進度沒有變。
5. 檢查平衡器的劇情任務編輯器有沒有寫死 `two_regions`，有的話一起移除。

## 二、修正平衡器相關的測試失敗

原因：測試用 `process.env.EMBERWILD_BALANCE_ROOT || path.resolve(root,'../Emberwild-Balance')` 找平衡器，但 repository 已改名為 `DreamingAbyss-BalanceEditor`。路徑不存在時，測試出現 `ENOENT ... /Emberwild-Balance/balance-editor.html`，並連帶出現 `render is not defined`、等待下載逾時等錯誤。

1. 把預設路徑集中到 `tests/runtime.cjs` 的一個共用函式。依序找：`EMBERWILD_BALANCE_ROOT` → `../DreamingAbyss-BalanceEditor` → `../Emberwild-Balance`（舊名相容）。全部找不到時，丟出一行清楚的錯誤訊息。
2. 約 33 個測試檔各自寫了這段路徑（`grep -rl "Emberwild-Balance" tests`），全部改成呼叫共用函式。`tests/README.md` 的說明也一起更新。
3. 確認 CI workflow 把平衡器簽出在哪個路徑，並和第 1 點對齊。
4. 路徑修好後，重跑以下測試。v0.225 時這些都是失敗的，在 v0.224 基準上就已經失敗：
   - `tests/companions-roster.test.cjs`：「Editor and runtime share ratings…」整組
   - `tests/quest-design.browser.test.cjs`：表單匯出匯入、版面、內嵌合約與舊 ID 遷移、六次 JSON 循環
   - `tests/skill-icons.test.cjs`：「standalone designer embeds the exact deployed catalog…」
5. 路徑修好後如果仍失敗，就逐項找出真正原因並修正，不要跳過或停用測試。至少要處理下面兩項：
   - `quest-design`：遊戲端的一般支線 ID 已改成 `slime_gel`／`wolves`／`treant_core`（`js/world/quest-design-model.js`、`data/balance/systems/quests.json`）。平衡器內嵌的合約與預設值要同步，否則「exact same contract」會不符。
   - `skill-icons`：v0.225 在 `js/ui/skill-system-ui.js` 加了依技能名稱分配的圖示（`NAMED_ICONS`），也在 `css/skill-icons.css` 加了樣式。平衡器內嵌的渲染器與共用 CSS 要同步。
6. 這項與平衡器無關，但一起修：`tests/companions-roster.test.cjs`「Replacement compares final stats…」還在檢查 `/前綴|銳眼/`。前綴已在 v0.215 移除，請改成檢查目前裝備比較視窗實際顯示的欄位。

## 完成條件

- `npm test` 全部通過，或者只剩與這兩項無關、而且在 v0.224 基準上同樣失敗的項目。剩下的項目要逐一列出並說明原因。
- 兩個 repository 都推送到 `claude/hopeful-hypatia-0lp08r`。commit 訊息用繁體中文，版本號寫成 v0.226。
- 回報時列出：修改的檔案、每項原本失敗的測試現在的結果，以及舊存檔清除的驗證方式。
