# 主角自由轉職、獨立隊伍方案與永久養成

本次修改只提交 `chatgpt-dev`。同一名主角共用等級、EXP、永久解鎖、職業進階、精通、背包與已招募夥伴；每個隊伍保存自己的職業、配點、學習、技能槽、裝備、上場成員及信物。新增隊伍為空白，複製只複製配置，所有配置操作立即保存。

依使用者最後補充，停止探索與安全的方案／職業／配置操作會清除所有戰鬥狀態，重新補滿全名冊生命，清除敵我遭遇、冷卻、護盾、狀態、召喚與戰鬥計時。探索中、已暫停但遭遇尚未結束、回合迭代器仍存在時，核心與 UI 都禁止變更配置，須先按「停止探索並結束遭遇」。現實時間計算的限時券／屬性藥水仍按原始 `expiresAt` 到期，不因切換重新計時。

## 版本與有效來源

| Repository | 修改起點 `chatgpt-dev` | 保留的 `main` |
| --- | --- | --- |
| `Horios/DreamingAbyss` | `8e23d0bba46ba7c2320612aa9ab9f4e4ffa85f55` | `f0df9462e3c191b452160f50b4d373b2df0480b9` |
| `Horios/DreamingAbyss-BalanceEditor` | `014af4975ecdd02981df0d9636319813995491be` | `f33864b55a96f28365d64598a5b213eacdc5a220` |

開始前已檢查 branch／檔案來源與修改狀態，建立 `checkpoint/team-plans-20261008` 本地 checkpoint 並保存 Git archive。提交及推送前再次檢查遠端 SHA；不重寫歷史，不合併 `main`。

`index.html` 的最後載入順序為：既有職業／成長／技能／控制狀態／共用技能 → 標題／操作保護 → 新手裝備 → 夥伴／成長／商店／限時道具／誘發 → 信物 → `team-runtime.js` → `team-references.js` → `team-builds.js`。DOM-free `team-model.js` 在核心程式之前載入。

最終 adapter 使用現有 `stats`、`awardXP`、精通 `gainMastery`、技能槽、穿戴、資源、出售價格、分解獎勵、存檔及遭遇重置函式。沒有第二套戰鬥、背包或獎勵引擎。`interaction-guard.js` 的延後重繪也會呼叫最後的隊伍 DOM 更新，避免操作完成後職業文字或鎖定狀態仍顯示舊資料。

主要檔案：

| 檔案 | 作用 |
| --- | --- |
| `js/character/team-model.js` | 共用 schema、成本／解鎖規則、點數額度、方案／UID／寶石／永久資料驗證 |
| `js/character/team-runtime.js` | 自由轉職、方案操作、永久成長連接、解鎖／學習分離、事務保存、遷移、探索限制及重置 |
| `js/equipment/team-references.js` | 所有方案引用稽核、確認強制出售／分解、批次處理、全方案清理與失敗回復 |
| `js/ui/team-builds.js`、`css/team-builds.css` | 編成、職業、空白引導、技能四種狀態及各職業精通 UI |
| `js/core/core-game.js` | 穩定主角識別、舊檔欄位、啟動原始資料保護與 Preview 存檔隔離 |
| `js/skills/mastery-core.js`、`js/ui/mastery-ui.js` | 沿用精通取得量／曲線，連接永久資料及既有技能 UI |
| `js/combat/battle-statistics.js` | 停止遭遇記為 `abandoned`，保留實得成果，不計為勝利 |
| `js/equipment/economy-salvage.js` | 提供既有資源讀寫，供一次性材料解鎖使用 |
| `js/ui/title-screen.js`、`js/ui/interaction-guard.js` | 存檔隔離提示、遊玩時間與延後繪製一致性 |
| `tests/team-model.test.cjs`、`team-runtime.test.cjs`、`team-builds.browser.test.cjs` | 契約、完整 production scripts 與實際 Chromium 操作驗證 |
| 私有 `balance-editor.html`、`tools/sync-team-schema.cjs` | 同一份契約、有效設定欄位及同步工具 |

## 資料結構

既有外層存檔仍為 `version:3`。新增 `party.buildSystem.version:1`，不把完整 actor 或戰鬥資源複製到方案中。

```js
party.buildSystem = {
  version: 1, activeId: 'team-1', serial: 2,
  permanent: {
    playerKey: 0, abilityCredit: 0, skillCredit: 2,
    classes: { 0: { activated: true, xp: 0, advanced: false } },
    masteries: { sword: 0 },
    unlocks: { '0:core:0': true, '0:support:0': true },
    payments: {},
    gemInstances: {}, gemSerial: 1
  },
  plans: [{
    id: 'team-1', name: '隊伍 1', job: 0, playerActive: true,
    stats: [0, 0, 0], skills: [], supportLevels: [],
    active: [null, null], procSlots: [null, null],
    supportSlots: [null, null], equipped: [null, null, null, null, null],
    sockets: [], companions: [], enlisted: [], tokens: {}
  }]
};
```

這是欄位示意；有職業的 `skills`／`sockets`／`supportLevels` 陣列長度與該職業實際技能數一致。`job:null` 的空白方案有空技能陣列、零配點及空裝備／夥伴／信物配置，可保存但不能探索。

| 全域永久資料 | 所在位置 |
| --- | --- |
| 主角等級、EXP、永久任務、新手成果、共享資源 | 既有 `party.members[0]`／共享資源機制 |
| 職業啟用、職業精通 EXP、職業二轉 | `buildSystem.permanent.classes[job]` |
| 原有武器／元素精通 EXP | `permanent.masteries`，當前 actor 的 mastery 為同一資料的投影 |
| 永久技能解鎖、一次性材料支付成果 | `permanent.unlocks`／`payments`，鍵為 `job:core/support:index` |
| 裝備／信物實體、已招募夥伴及成長 | 既有共用背包、`party.members`、`companionProfiles` 等 |
| 已鑲嵌實體寶石 | `permanent.gemInstances`；方案保存 `gem-N` 引用，背包仍使用既有數量 |

主角新增穩定 `playerId`，與當前 `job` 分離。原有三人編成規則保留，主角可以在後備：`playerActive:false` 時仍允許原有三名夥伴上場。各隊的 `enlisted`／`companions`／`tokens` 獨立，已招募角色始終保留在全域名冊。

點數總額按 `起始額度 + (全域等級 − 1) × 每級額度 + 一次性保留額度` 推導。剩餘額度減去本隊實際投入，不保存另一份會反覆發放的每隊升級紀錄。預設 AP 0／每級 3；恢復精通重構前的 SP 2／每級 2，並以 `teamBuildVersion` 標記一次性遷移。原來創角免費的第一核心／輔助技能折算為一次性 `skillCredit`，保留起始可用點數；標記過的 JSON 若設定 SP 0，會尊重 0。

## 操作與永久規則

- 只使用現有戰士、法師、弓箭手、牧師。自由選職不收費、不加開放條件；二轉仍沿用現有等級／500 金幣／20 鍛鐵／怨念碎片 3 的規則，各職業完成成果永久保存。
- 預設上限 6 份方案，可由同一平衡 JSON 調整 1～12。降低上限保留已存在方案，只限制新增／複製。提供改名，沒有付費解鎖及隱藏的各職業子方案。
- 轉職確認後退回本隊能力與技能投入，清空槽與寶石配置，卸下不符新職業的裝備，保留同隊成員與信物。其他方案及永久成果不變。切換方案直接套用，不再確認。
- 永久解鎖檢查原有等級、二轉、武器／元素精通，加上可設定的職業精通、永久任務與材料。無材料且條件達成時自動永久解鎖；有材料時按下永久解鎖，只支付一次。
- 學習依該技能成本投入本隊 SP；技能效果／精通成長继續使用原有公式。裝配仍為 2 主動／2 觸發／2 輔助槽，不能混裝其他職業技能。
- 技能、能力重置免費且須確認，只清除當前方案投入。寶石複製為引用，最後一份引用解除後才返還一次。
- 職業精通 EXP 沿用實際武器／技能精通取得量及既有曲線，每次 gain 只加入當前已啟用職業。未使用職業保持 0，其他已用職業完整保留；原有精通參與戰鬥的計算繼續使用。
- 同一 UID 可在不同方案引用，同隊禁止重複所有權。單件／批次出售與分解都列出所有受影響方案，取消不動作；確認後獎勵一次、清掉全部引用、不補裝。鎖定及未確認洗鍊仍保留。自動溢出只處理剛取得、尚未配置的新掉落。
- 最後的鍛造導航 renderer 原本覆寫了先前出售入口，此次在最終背包詳情補回出售按鈕，并確認穿戴中裝備可經同一警告出售。

需求範例的「閃電連擊」／電精通在現有分支不存在，所以沒有新增技能。C 類驗收使用真正的法師「餘燼爆發」，在測試 JSON 設火精通 5、二轉及一次性材料，驗證門檻前拒絕、達成後永久解鎖、本隊學習／觸發槽、另一隊洗點及材料只付一次。測試條件不改動出貨預設技能。

## 舊檔、保存與 Preview 保護

目前讀取器允許的單人 `version:1/2` 與全隊 `version:3` 都先經既有遷移及驗證，再轉為第一方案。保留現職、配點、已學習與裝配、全部 UID／資源、名册、上場成員、等級／EXP、進階與精通。舊學習狀態同時轉為永久解鎖及本隊學習，不全部重新鎖定。

原本沒有職業精通總 EXP 欄位，因此將舊主角當前職業所有既有精通 EXP 合計一次作為該職業初始值；武器／元素原值各自保留，其他職業為未使用／0。舊的額外 AP／SP 超過等級公式的部分只記錄一次保留額度。既有寶石只建立一次實體識別，不重複發放。

正常啟動保存原始 bytes 到最後 modules 載入完畢，避免早期讀取器剝掉新增欄位後誤保存。啟動、本機讀檔、JSON 匯入使用相同規則；已遷移 `buildSystem` 只驗證與恢復，不再次遷移。不存在的裝備／信物 UID 清為空欄，其他異常配點、槽、所有權、永久紀錄在替換 live party 前拒絕。方案正規化只保留配置欄，剔除 HP／冷卻等資源快照。

配置、材料解鎖、裝備處置操作先完成記憶體事務，再一次寫入。保存失敗恢復原方案、永久紀錄、資源與角色狀態；取消不扣費。平衡設定先檢查所有方案，拒絕讓配點超額或刪掉已用技能／寶石／永久成果的 JSON，保留原設定。新增技能會補齊所有相關方案陣列；職業／穿戴限制變更會清除不再合法的各隊裝備引用，物品實體保留。平衡與存檔寫入失敗會回復兩者及原商店批次。還原預設沿用完整的既有還原流程，等後續模組補齊技能後再驗證；若仍會破壞永久成果，顯示原因並保留設定，不產生未處理的介面錯誤。

Preview `/preview/` 使用 `emberwild-preview-*` 的本機與 session keys。首次將舊正式版三欄主檔、備份、戰鬥統計、遊玩時間與測試設定複製一次，原 keys 不修改；之後獨立保存。初始化標記在刪除 Preview 欄位後保留，避免下一次開啟又復活舊進度。這項隔離是為保護仍使用舊讀取器的 `main`。

新的多隊伍 JSON 完整成果由此版讀取器保存。舊正式版沒有隊伍功能，不能承諾向後保留新增擴充欄位；勿用舊正式版另存多隊伍 JSON 作唯一備份。原有舊檔可在新版讀取，存檔外層版本保持 3。

## 平衡設計器與取得方式

私有 Repository 的 [balance-editor.html](https://github.com/Horios/DreamingAbyss-BalanceEditor/blob/chatgpt-dev/balance-editor.html) 新增「隊伍配置規則」，使用原 `balanceSettings.progression` 的起始／每級 AP／SP，不新增第二份成長曲線；`teamSettings` 管理方案上限與缺省學習成本。技能頁增加 `learnCost` 及 `unlockConditions.classMasteryLevel/quests/materials`；原有等級、二轉、精通、武器、職業和效果設定繼續生效。

`team-model-v1` script 與公開遊戲 `team-model.js` 字元完全一致；可运行 `node tools/sync-team-schema.cjs /path/to/Emberwild-Balance/balance-editor.html` 同步。正規化更新現有對象的必要欄位，保留舊編輯器事件所持的物件，避免複製信物與夥伴設定失效。真正下載 JSON、檔案匯入與遊戲套用都驗證了有效值，不只比較 UI。

需登入具有權限的 GitHub 帳號，下載私有 `chatgpt-dev` 的單一 `balance-editor.html`，本機開啟後匯出測試 JSON，再於遊戲測試設定入口匯入。此 Repository 沒有 Pages workflow，沒有公開設計器部署。

## 驗證與提交

使用 Node.js、真正 production script 順序及 `/usr/bin/chromium`，沒有以另一份模擬遊戲取代實際程式。

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:teams
node --test tests/team-runtime.test.cjs
```

完整回歸 206 項通過、0 失敗、0 跳過；隊伍套件 40 項通過；最後補測的永久成果／還原設定／商店批次回復由完整 production runtime 的 22 項測試再次通過。驗證摘要另存 `team-builds-test-results.txt`。包含 A～G、新版與 v1／v2／v3 讀檔、主角後備三夥伴、實際普攻／火系施法職業 EXP、二轉一次支付、四種技能狀態、材料只付一次、方案／UID／寶石不複製、原生出售取消／確認、JSON 檔案下載／匯入、重新整理、設計器欄位有效值、Preview 隔離及刪除後不復活。

原有 336 組人物／裝備數值快照與信物重構前 16 組主角快照保持一致；戰鬥公式、成長階梯、獎勵／掉落、限時道具、實際計時與戰報捲動等回歸通過。這次沒有重新執行另一次大規模平衡模擬，也沒有把先前的模擬結果當作本次新增測試。

| Repository | 階段 commit | 內容 |
| --- | --- | --- |
| 遊戲 | `817405827c59472da783d648cecd2b113624caeb` | DOM-free 共同契約與永久／配置資料驗證 |
| 遊戲 | `0ea2e50b55fe3b7b7413416378ef9d7ba9be5902` | 自由職業、方案、技能、引用與 UI 整合 |
| 遊戲 | `aca42c9522058e9e16972614d569ff0c7850102d` | 交叉驗證、全部戰鬥狀態重置、Preview 存檔隔離 |
| 遊戲 | `0037ac0e41b151a2bf6fadf3569d7981e172e200` | 拒絕還原預設時保留永久成果與原商店批次 |
| 私有設計器 | `56be2819dbbe26098318db5229557c4c7fdeaa22` | 共同契約、點數與永久解鎖實際控制項 |

報告／驗證摘要以獨立文件 commit 收尾；最終 branch HEAD 與推送／部署結果見完成回覆。兩個 Repository 都只推送 `chatgpt-dev`，正式分支 SHA 保持本報告開頭的值。

已知限制：舊正式版無多隊伍讀取器；自訂技能已產生永久成果時，不允許以刪除該定義的 JSON 或預設設定抹掉成果，需保留相應定義。本地另依實際 Pages workflow 組出 artifact，檢查 root index SHA256 為 `73d955b1096705bf3b6fe9471068de82ff8d043119cfdfaf25def77710a41b76`、與原 main 完全相同，Preview JS／CSS 齊全，並以 Chromium 啟動部署階段加上標示的預覽頁，沒有瀏覽器錯誤。此環境的網路政策阻擋直接讀取 GitHub Pages 網域，因此公開部署需以 Actions 完成狀態及 checkout 的精確來源 SHA 核對；實際瀏覽器驗證使用同一原始碼與部署路徑的本地頁面，不宣稱已直接打開公開網址。

遊戲 Preview：[https://horios.github.io/DreamingAbyss/preview/](https://horios.github.io/DreamingAbyss/preview/)。Push dev 只 dispatch `main` context 的 Pages workflow；artifact 的根頁取原 `main`，Preview 取此 `chatgpt-dev`，不建立或修改 `main` commit。
