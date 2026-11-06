# 舊版存檔樣本

`tests/legacy-save-corpus.test.cjs` 會冷啟動讀取這些原始存檔，確認目前版本仍可載入並保留角色、等級、金幣、裝備 UID 與穿戴關係。

| 檔案 | 來源 |
| --- | --- |
| `main-0402f4b-job0.json`～`job3.json` | 正式版 `main` `0402f4b`，以真實 Chromium 建立角色、招募夥伴並自動探索 15 秒後存檔 |
| `main-0402f4b-job2-lv16.json`、`job3-lv16.json` | 同一正式版；LV16、金幣 12345、8 件 T3 裝備（含強化），並已在正式版重新整理驗證可讀取 |

另外沿用既有 fixture：`../legacy-skills-job0～3.json`、`../team-before-companion-skill-pools.json`、`../legacy-progression.json`（6 份）。

這些檔案是玩家存檔的歷史快照，不要為了讓測試通過而修改內容；新增樣本請保留原始位元組。
