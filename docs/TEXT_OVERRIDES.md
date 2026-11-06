# 畫面文字覆寫（textOverrides）

v0.119 起，平衡資料 JSON 可用 `textOverrides` 修改遊戲畫面上的任何固定文字。遊戲端由 `js/ui/text-overrides.js` 套用；平衡器的開發者模式負責「在遊戲畫面上點字修改」。

## 資料格式

```json
"textOverrides": {
  "version": 1,
  "entries": [
    { "source": "荒野探索", "text": "夢境探索" },
    { "source": "金幣 {#}", "text": "夢幣 ×{#}" }
  ]
}
```

- `source`：畫面上的原文。前後空白與連續空白會合併成一個。原文裡的數字一律寫成 `{#}`，代表任意數字；`text` 裡的 `{#}` 依序填回原本的數字。
- 同一句原文在所有頁面、彈窗一起修改。
- 欄位省略或 `entries` 為空時沒有任何覆寫，也不會執行掃描。
- 限制：最多 3000 筆；原文最長 400 字元、新文字最長 2000 字元；原文不可重複、不可含數字（請用 `{#}`）；`version` 必須為 1。違反時整份資料拒絕套用。

## 套用範圍

- 會修改：文字內容、`placeholder`、`title`、`aria-label`。遊戲重繪、換頁、開啟彈窗後都會重新套用；移除覆寫會還原原文。
- 不會修改：輸入框與文字區的內容、`script`／`style`，以及標有 `data-text-override="off"` 的區塊。
- 以「完整原文」比對一個文字片段。畫面上被標籤切開的文字（例如「生命上限 <b>78</b>」）需分別以「生命上限」等片段設定。
- 玩家自行輸入的名稱若與某句原文完全相同，也會被替換。

## 平衡器使用的介面

- `EmberwildBalanceDocument.textOverridesVersion === 1`：目標遊戲支援此功能；發布前應檢查。
- `EmberwildTextOverrides.originalOf(node, attribute?)`：取得某個文字節點或屬性的遊戲原文（未覆寫前的文字）。
- `EmberwildTextOverrides.templateOf(text)`：把原文的數字換成 `{#}`，作為 `source`。
- `EmberwildTextOverrides.preview({version:1, entries})`：只在目前頁面預覽，不寫入資料。
- 正式套用沿用 `validateBalanceConfig`／`applyBalanceConfig`／`exportableBalance`。

## 效能

覆寫生效時，每次畫面更新只掃描新加入的節點；完整掃描 800 個元素、302 筆覆寫約 0.6ms。

測試：`tests/text-overrides.browser.test.cjs`。
