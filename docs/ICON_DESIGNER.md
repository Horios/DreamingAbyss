# Lucide 圖標設計與遊戲顯示

此修改擴充私人平衡器原有的「圖示製作器」及遊戲 `__EMBERWILD_SKILL_ICONS`，不建立第二個編輯器或圖標資料目錄。只提交兩個 Repository 的 `chatgpt-dev`，不改變角色、怪物、技能、裝備數值、戰鬥公式或技能觸發。

## 使用方式

1. 開啟私人 `Horios/DreamingAbyss-BalanceEditor` 的 `balance-editor.html`，切到「圖示製作器」。
2. 在 Lucide 圖庫搜尋英文名稱，或選用途分類；每頁最多 60 個縮圖。點擊圖標直接替換選取圖層；沒有自製圖示時，會建立一筆原有的 `skillIcons` 定義。
3. 修改名稱、顏色、尺寸、SVG 線粗、整體旋轉、透明度、發光顏色／強度，以及動畫、週期、節奏。一般、深色、淺色及 16 px 預覽立即更新。
4. 原有基本圖形、內建圖示、八層組合、拖曳、複製、刪除與可編輯範本繼續可用。「清除選取圖層圖標」保留該層的空白識別，避免重新匯入時自動補回圖案。
5. 從技能頁開啟製作器，再用「套用至目前技能」。技能繼續使用 `iconType=custom:<id>`；不用在技能裡重複保存外觀。
6. 使用既有測試／正式 JSON 匯出按鈕。測試版遊戲在選項的「載入 JSON」讀取同一份文件；已指定的圖標會顯示於目前隊伍的技能名稱旁。原有技能圖標與夥伴技能頁也使用同一渲染器。

## 本地圖庫與授權

- 固定官方 npm 套件 **`lucide-static@1.53.0`**，納入 **1,869 個原始名稱**的 SVG node 資料；不使用 Emoji、字型替代或 CDN。
- 官方來源：https://lucide.dev/icons/ 、https://github.com/lucide-icons/lucide 。
- 原始 `icon-nodes.json` SHA-256：`9f6707e56950a20355d33674f38064e878cdef3fb1d46e1761c896583ef00876`。
- npm tarball integrity：`sha512-xddbAP/qViJOeURl46uiTwmX6hn79PcaHW4xDQcM/bCiO1wd1eYE6hIVXr1dko14aK5HAadZNmAqaEWusc8q1A==`。
- 完整 ISC 授權及 Feather 衍生圖標的 MIT 授權保存在 `licenses/LUCIDE-LICENSE.txt`，也包含於本地 JS 檔及單檔平衡器的嵌入註解。
- `js/ui/lucide-catalog.js` 約 442 KiB，隨 `js/` 部署，只載入一次。SVG 標記依需建立並以名稱快取；圖庫分類為名稱與官方 tags 的搜尋索引，允許同一圖標出現在多個用途。

更新資源必須先確認版本／授權，使用產生器重新生成，不能手動逐個改圖標。目前產生器限制版本為 1.53.0：

```sh
npm pack lucide-static@1.53.0 --ignore-scripts
tar -xzf lucide-static-1.53.0.tgz
node tools/build-lucide-catalog.cjs /path/to/package
node tools/sync-icon-resources.cjs /path/to/Emberwild-Balance/balance-editor.html
```

設計器的 `lucide-catalog-v1`、`skill-icon-library-v1`、`skill-icons-shared-style` 與遊戲的對應檔案保持逐字一致；測試會驗證一致性。私人平衡器保持單檔，不需複製額外的圖庫或 CSS。

## JSON 模型與相容性

沿用根目錄 `skillIcons`（最多 100 筆），每筆最多 8 層。圖標來源編碼在原有 `layers[].icon`：既有名稱為內建圖示，`lucide:<原名>` 為 Lucide，`none` 為明確空白。基本圖形繼續保存其幾何參數。整體外觀只放在同一筆定義的可選 `appearance`。

```json
{
  "id": "icon_1",
  "name": "火焰印記",
  "layers": [{"kind":"icon","icon":"lucide:flame","x":0,"y":0,"scale":1,"rotation":0}],
  "appearance": {
    "color":"#fa7312", "size":64, "strokeWidth":3.4,
    "rotation":45, "opacity":0.6,
    "glowColor":"#0aafee", "glowStrength":8,
    "effect":"float", "effectDuration":1.25, "effectTiming":"linear"
  }
}
```

`size` 為 8～128 px；`strokeWidth` 為 0.4～10（Lucide 原生 24×24 座標）；`rotation` 為 −180～180 度；`opacity` 為 0～1；`glowStrength` 為 0～24 px；`effectDuration` 為 0.15～30 秒。`color=""` 沿用圖層色調。自訂顏色與線粗會套用整個組合，各圖層的位置／比例／旋轉繼續獨立存在。

舊 JSON 沒有 `skillIcons` 時正常載入空目錄；沒有 `appearance` 的圖示維持原本 SVG 輸出。未知但格式合法的 Lucide 名稱會保留識別並顯示安全的魔法預設圖標，方便未來版本重新辨識；缺少的自訂 ID 使用原有 fallback。清除圖標會顯示空白。

不保存 SVG HTML、搜尋字串、分類、分頁、選取圖層或 DOM 狀態。遊戲匯入會驗證外觀欄位、數值範圍、顏色、動畫名稱與參數；渲染器也獨立限制內容，不能透過 JSON 插入 HTML、事件屬性、外部連結或 CSS URL。產生器只接受白名單 SVG 幾何節點／屬性。

## 共用特效與效能

呼吸使用原有 `tr-gallery-breathe`；閃爍、不規則閃爍、亮度脈衝、浮動、震動、科技故障、彩色變化及心跳縮放，使用原有文字特效的 `tr-*` keyframes。只有旋轉新增 `ew-icon-spin`。原有 `text-rarity.css` 與文字設計器效果定義保持原樣。

SVG 不提供文字填色流光、字距、文字揭露、文字描邊等選項。發光以 SVG `drop-shadow` 處理。SVG 的固定旋轉、動畫及發光放在不同層，避免 transform/filter 互相覆蓋。共用 CSS 只讓已設定的 SVG 動畫通過遊戲原有全域停用動畫規則，不改變其他 UI 的動畫行為。

動畫完全使用 CSS，沒有輪詢、持續 JavaScript 重畫或額外計時器；減少動態效果偏好會停用動畫並保留固定外觀。切頁只綁定當前 DOM，沒有新增全域事件監聽器。瀏覽每頁建立至多 60 個縮圖，清單縮圖使用固定尺寸且不播放動畫。

旋轉與色相循環必須連續變化，對這兩種效果停用單步分段節奏，以免 0／360 度相同而看起來沒有動畫；匯入與安全渲染也使用相同限制。

## 驗證

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
EMBERWILD_BALANCE_ROOT=/path/to/Emberwild-Balance npm run test:icons
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
EMBERWILD_BALANCE_ROOT=/path/to/Emberwild-Balance npm test
```

專項檢查包含完整圖庫／安全節點、所有舊圖標及各種圖層的 SVG 輸出指紋、兩邊嵌入內容一致性、有效遊戲匯入／匯出／存檔重載及平衡資料不變。Chromium 實際操作全部分類、大小寫搜尋、32 頁完整瀏覽、選取／清除、所有外觀欄位、每個動畫、降動畫偏好、多次切頁、複製／刪除、既有文字設計器、技能套用、真正下載與重新匯入 JSON、目前隊伍技能 UI、戰鬥及存檔重載、錯誤名稱與舊 JSON。離線模式驗證單檔 HTML 沒有外部 script／stylesheet 依賴。

2026-10-08 驗證結果：`npm run test:icons` **17／17 通過**；最終完整 `npm test` **223／223 通過**，無失敗或跳過，包含原有 206 項回歸。32 頁／1,869 個縮圖的完整 Chromium 瀏覽約 1.6～1.8 秒，瀏覽過程沒有資源請求。另依現有 Pages 工作流程組裝本地部署目錄，確認正式根頁逐位元保留 `main` HTML／舊圖示，Preview 使用開發版圖庫及獨立存檔鍵，實際顯示指定 `zap` SVG 與旋轉動畫；兩端無瀏覽器錯誤。上述時間為本次雲端 Chromium 的觀測值。

此雲端 Chromium 管理政策禁止 `file://` 導航，因此未驗證在使用者電腦直接雙擊檔案的行為；瀏覽器測試由本地檔案提供同一份 HTML，並啟用離線模式。僅執行 Chromium，尚未在 Firefox／Safari 實機測試。雲端網路政策也不允許直接存取公開 Pages 網域；以本地部署目錄及 GitHub Actions 結果交叉確認正式根頁／Preview 分離及新資源路徑。

## 修改檔案

| Repository | 檔案 | 用途 |
| --- | --- | --- |
| Emberwild | `index.html` | 載入本地圖庫與 SVG 共用 CSS |
| Emberwild | `js/ui/lucide-catalog.js`、`licenses/LUCIDE-LICENSE.txt` | 固定官方 SVG node 資料、分類索引與完整授權 |
| Emberwild | `js/ui/skill-icon-library.js` | 擴充原有圖層／共用安全渲染／外觀與動畫參數 |
| Emberwild | `css/skill-icons.css` | SVG 動畫適配、固定比例與減少動態效果 |
| Emberwild | `js/skills/mastery-core.js` | 原有 JSON 驗證、匯出、保存識別的必要支援 |
| Emberwild | `js/ui/mastery-ui.js`、`js/ui/team-builds.js` | 原有技能圖示與目前隊伍 UI 的顯示支援 |
| Emberwild | `tools/build-lucide-catalog.cjs`、`tools/sync-icon-resources.cjs` | 可重現產生及同步共享資源 |
| Emberwild | `tests/skill-icons.test.cjs`、`tests/skill-icons.browser.test.cjs`、`package.json`、`tests/README.md` | 資料契約、實際操作與回歸驗證 |
| Emberwild | `docs/ICON_DESIGNER.md` | 模型、使用、授權及驗證說明 |
| Emberwild-Balance | `balance-editor.html` | 擴充現有製作器並嵌入相同資源，保持單檔離線功能 |
| Emberwild-Balance | `DEVELOPMENT.md` | 共用資源與測試維護說明 |
