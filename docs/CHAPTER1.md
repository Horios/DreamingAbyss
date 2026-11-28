# 第一章：初臨艾斯蘭

v0.150 起，序幕結束後接著播放第一章。劇本是 `story.quests` 中 `id` 為 `chapter1` 的任務，資料檔 `data/balance/systems/story.json`，改完執行 `node scripts/balance-modules.cjs build`。

## 流程

| 場景 | 階段 | 內容 | 推進方式 |
|---|---|---|---|
| 1 林間小道 | `arrival` | 抵達無名密林的旁白 | 在無名密林擊敗 5 隻魔物（本階段起算） |
| 2 突如其來的襲擊 | `ambush` → `ambush_help`／`ambush_ask`／`ambush_what` | 商隊遇襲、三個回應 | 選項 |
| 2 突如其來的襲擊 | `ambush_fight` | 護衛、牧師臨時加入（`allies`） | 任務關卡「商隊遇襲」：林間野狼 ×3 |
| 3 戰鬥結束 | `aftermath` → `alone_*`、`invite` → `invite_*` | 護衛的詢問與同行邀請 | 選項 |
| 3 戰鬥結束 | `caravan` | 自由探索（單怪） | 按「與商隊交談，前往村莊」（`talk`） |
| 4 同行 | `travel` → `talk_*`、`forest_edge` | 艾琳自我介紹、走出森林 | 選項 |
| 5 抵達村莊 | `village` | 商隊謝禮 100 金幣 | 讀完對話 |
| 5 抵達村莊 | `plans` → `plan_*`、`offer` → `join_*` | 艾琳的提議 | 選項 |
| 5 抵達村莊 | `together` | 艾琳加入隊伍（`recruit`），開放商店與委託 | 讀完對話 |

劇本中的「○○」使用夥伴名冊現有的牧師「艾琳」（ID 13）。對話中的 `{player}` 顯示為主角名字。

## 結尾、重看與舊存檔

- 結尾：最後一段完成後播放 `chapter.ending` 一次，按「結束」後記錄 Flag `chapter_end:chapter1`。
- 重看：主線的已完成任務有「重看劇情」，依玩家實際走過的階段與選項播放，不發放任何東西。
- v0.150 之前完成序章的存檔：主線顯示「開始劇情」，按下只設定 `chapter1_start`，不開啟功能限制。

## 資料欄位

- 任務層 `chapter`：`title`、`ending`（結尾的標題、旁白與按鈕文字）、`gate`（功能限制使用的 Flag）、`scenes`（場景編號、名稱、地點）、`openPages`（限制期間開放的頁面）、`allies`（臨時隊友 ID、名稱、範本夥伴）、`companion`（`recruit` 招募的夥伴）、`ui`（按鈕與提示文字）。
- 階段層 `chapter`：`scene`、`hint`（任務橫幅說明）、`action`（`''`、`allies`、`talk`、`recruit`）、`actionLabel`（`talk` 的按鈕文字）。
- 解鎖：階段效果 `unlock` 鍵 `page_<頁面 ID>` 開放頁面（例：`page_shop`、`page_quests`），`feature_hunt_mode` 開放狩獵模式切換，`feature_regions` 開放其他地圖與探索分類。

## 功能限制

Flag `chapter_gate` 開啟時生效。目前開放：荒野探索、戰鬥統計、隊伍編成、技能、裝備與信物、背包、角色能力、主線。第一章完成後再加上商店與委託；其餘頁面維持鎖定，之後的村莊劇情以 `page_<頁面>` 解鎖鍵逐步開放。全部開放時把 `chapter_gate` 設為 `false` 即可。

## 首次進入的教學

商店、委託開放後，第一次進入時由教學系統顯示聚光燈引導（`shop_basics`、`quest_basics`），可在設定 →「教學回顧」重播。
