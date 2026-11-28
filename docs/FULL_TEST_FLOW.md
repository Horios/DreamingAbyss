# 測試版與平衡器的完整測試流程

對象是 `chatgpt-dev`（測試版，Preview）與 `Horios/DreamingAbyss-BalanceEditor`（平衡器）。
CI 的回歸閘門只跑不需要平衡器的檔案；這份流程把兩個倉庫放在一起，跑兩邊全部的自動檢查，
包含 CI 排除的跨倉庫測試。

## 準備

1. 兩個倉庫放在同一層目錄。資料夾名稱不限，流程會自行處理：

   ```text
   <任意目錄>/
   ├── DreamingAbyss/            # 遊戲，checkout chatgpt-dev
   └── Emberwild-Balance/        # 平衡器，checkout main（名稱也可以是 DreamingAbyss-BalanceEditor）
   ```

   測試用相對路徑互相尋找：遊戲測試讀 `../Emberwild-Balance`（平衡器）與 `../Emberwild-main`（正式版），
   平衡器測試讀 `../DreamingAbyss`。缺少時流程會在上層目錄建立，已存在的路徑不會被改動：

   - `Emberwild-Balance`、`DreamingAbyss`：指向實際資料夾的符號連結。
   - `Emberwild-main`：從 `origin/main` 建立的 git worktree，供兩個「正式版程式讀測試版資料」的發布相容測試使用。
     要更新到最新的 main：`git fetch origin main` 後在該目錄 `git checkout --detach origin/main`。

   平衡器在其他位置時用 `EMBERWILD_BALANCE_ROOT` 或 `--editor-root` 指定。

2. 平衡器內嵌一份遊戲檔案並記錄來源 commit。遊戲有新的 commit 時，先在平衡器倉庫同步再測試：

   ```bash
   node scripts/sync-game.cjs
   ```

   同步要求遊戲的 `js`、`css`、`data`、`index.html` 沒有未提交的修改。
   沒有同步時 `editor-contract` 的 `check-game-sync --strict` 與 `editor-headless` 的 `v2-hosting` 會失敗。

3. Node.js 20 以上（平衡器 CI 使用 22）。在遊戲倉庫安裝 Playwright：

   ```bash
   npm ci
   ```

   ```bash
   npx playwright install chromium
   ```

   已經有 Chromium 的環境改用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定執行檔。
   平衡器的瀏覽器測試共用遊戲倉庫的 `node_modules`。

## 執行

```bash
npm run test:full
```

常用參數（`node scripts/full-test.cjs` 後面接）：

| 參數 | 作用 |
|---|---|
| `--list` | 只列出會執行的項目 |
| `--stage game-headless,editor-headless` | 只跑指定階段 |
| `--only <regex>` | 只跑「階段 項目」符合的項目，例如 `--only offline` |
| `--no-browser` | 不跑需要 Chromium 的項目 |
| `--long` | 加跑長時間模擬 |
| `--jobs <n>` | headless 項目的平行數，預設為 CPU 數減一，最多 4 |
| `--browser-jobs <n>` | 瀏覽器項目的平行數，預設 2 |
| `--report <dir>` | 報告位置，預設 `.audit-results/full-test/` |
| `--verbose` | 通過的項目也逐行列出 |

每個項目各自一個行程，逾時會終止整個行程群組。全部跑完才結束。
結束碼 0 表示全部通過；1 表示有項目未通過或缺少必要環境。

## 階段

| 階段 | 位置 | 內容 |
|---|---|---|
| `game-data` | 遊戲 | 平衡模組來源、manifest 雜湊與 `data/balance.json` 一致；全部模組的文件驗證；影響範圍分析；Preview 版號比上一個 commit 多 1 |
| `game-headless` | 遊戲 | `tests/*.test.cjs` 中不開瀏覽器的檔案，以 Node VM 載入完整遊戲。包含讀取 `balance-editor.html` 與 `server/*.cjs` 的跨倉庫測試 |
| `game-browser` | 遊戲 | `*.browser.test.cjs` 與其他透過 `tests/runtime.cjs` 開啟 Chromium 的檔案；設定 `EMBERWILD_PACE_REALTIME=1`，與 CI 的 browser-smoke 相同 |
| `editor-contract` | 平衡器 | `check-game-sync --strict`（平衡器記錄的遊戲 commit 等於受測的遊戲 commit）與 `preview-compatibility`（共用模型、驗證器來源、資料往返） |
| `editor-build` | 平衡器 | `build-online`，產生線上版模組，後面的平衡器測試會讀取 |
| `editor-headless` | 平衡器 | `tests/*.test.mjs`、`tests/*.test.cjs` |
| `editor-browser` | 平衡器 | `tests/*.browser.cjs`、`scripts/audit-seconds-browser.cjs`、`scripts/bench-incremental.cjs`：本機 HTTP 伺服器加 Playwright 操作工作台 |
| `editor-artifact` | 平衡器 | `scripts/build.sh` 之後執行 `validate-artifact.mjs`，確認可部署的 Worker 產物 |
| `long`（`--long`） | 遊戲 | 成長曲線戰鬥模擬、裝備取得模擬、離線加速結算驗證、即時戰鬥驗證 |

判定規則：

- `pass`：結束碼 0，而且沒有略過的測試案例。
- `fail`／`timeout`：結束碼非 0 或超過時間上限。
- `skipped`：行程成功，但有測試案例被略過。這個流程已經提供平衡器與 Chromium，略過代表該案例沒有驗證到，視為未通過。
- `empty`：檔案沒有執行任何測試案例。

## 報告

- `.audit-results/full-test/REPORT.md`：各階段統計、未通過清單、全部項目。
- `.audit-results/full-test/results.json`：同樣內容的機器可讀版本，含兩個倉庫的 commit。
- `.audit-results/full-test/logs/`：每個項目的完整輸出。

`.audit-results/` 已列在 `.gitignore`。

報告另外列出「執行期間被改動的檔案」。平衡器的 `scripts/audit-seconds-browser.cjs` 會重寫
`docs/v2-seconds-coverage.json`（內含遊戲 commit），屬於預期的產生檔，同步遊戲後一併提交。

## 執行時間

2026-11-12 在 4 核心機器上量測（遊戲 v0.122、平衡器 `a14f1b6`，246 個項目、1176 個測試案例）：

| 階段 | 項目 | 各項目秒數合計 |
|---|---|---|
| `game-headless` | 123 | 9178 |
| `game-browser` | 46 | 2141 |
| `editor-headless` | 59 | 1297 |
| `editor-browser` | 9 | 423 |
| 其餘 | 9 | 33 |

headless 平行 3、瀏覽器依序執行時整輪為 103 分鐘。最慢的檔案是 `offline-exploration`（602 秒）、
`legacy-save-corpus`（322 秒）、`story-system`（300 秒）。只改動一部分時用 `--stage` 或 `--only` 縮小範圍。

## 這份流程沒有涵蓋的部分

- 已部署網站：GitHub Pages 的 Preview 由 `scripts/verify-deployment.cjs` 在部署工作中讀回驗證；
  平衡器的 ChatGPT Sites 需要擁有者登入，無法自動驗證。
- 需要 GitHub App 金鑰的實際發布：發布服務的測試使用假的 GitHub API。
- 視覺判斷：版面測試檢查重疊、溢出與可讀性的數值條件，沒有比對截圖。
- 正式發布前仍需人工確認的項目見 `docs/REGRESSION_TESTS.md` 最後一節。
