# 第一次大修交付報告：角色成長與技能／精通系統重構

## 交付範圍

本輪以「等級＋精通＋技能解鎖＋自動戰鬥配置」養成循環為核心，修改測試版 `Horios/DreamingAbyss:chatgpt-dev` 與平衡器 `Horios/DreamingAbyss-BalanceEditor:main`。

正式遊戲 `Emberwild:main` 未合併本輪內容。

## 已完成

### 技能與角色成長

- 角色升級不再取得／使用技能點；舊 `sp` 保留作存檔相容資料。
- 核心技能與輔助技能改為「未學／已學」二元狀態。
- 技能學會後直接使用完整基礎效果，不再以技能等級放大倍率、治療、BUFF、DEBUFF 或觸發率。
- 舊 `powerPerLevel`、`procChancePerLevel`、`effectPerLevel` 在新版正常 UI 停用，匯出時移除；相容層仍可接舊資料。
- 角色 EXP 需求新增可調整倍率，第一階段預設 `1.35×`，先用於 Lv1～10 實測。

### 技能學習條件

核心與輔助技能可分別設定：

- 角色等級。
- 最多三個前置技能；只判斷是否已學會，不要求前置技能等級。
- `mastery`：成功使用時培養的精通。
- `requiredMastery`。
- `requiredMasteryLevel`。
- `weaponTypes`：允許使用的武器類型。

保留多前置技能與循環依賴檢查。另增加不可達條件檢查，例如需求精通等級高於精通上限。

### 通用精通

每名角色保存精通 XP；精通 Lv 由 XP 即時計算，不另外保存等級。

第一版共用曲線：

- `xpBase`
- `xpLinear`
- `xpQuadratic`
- `maxLevel`
- 技能使用 XP。
- 武器普攻 XP。
- 二轉所需精通 Lv。
- 角色 EXP 額外倍率。

精通升級才寫戰鬥紀錄，不逐次 XP 洗版；第一版不提供額外攻擊／治療倍率。

### 四職精通

- 戰士：劍／斧／槌。
- 法師：火／冰／風／暗。
- 弓箭手：弓／弩。
- 牧師：光／暗。

第一批可實測分支已建立：

- 戰士有劍與斧路線。
- 弓箭手有弓與弩路線。
- 法師火與冰都有不依賴既有精通的入口；暗系亦有入口，風系由輔助技能開始培養。
- 牧師光與暗都有入口；「生命泉源」為治療技能且培養暗精通。
- 牧師既有「懲戒」「生命泉源」在第一次 migration 時由光屬性改為暗屬性，使技能元素與暗精通一致。

### 武器類型

正式建立：

- 戰士：`sword`／`axe`／`hammer`
- 弓箭手：`bow`／`crossbow`
- 法師：`staff`／`grimoire`
- 牧師：`prayerBook`／`holyStaff`

既有武器 migration：

| 武器 | weaponType |
|---|---|
| 闊刃劍 | sword |
| 穿甲槍 | sword |
| 汲血斧 | axe |
| 狙擊長弓 | bow |
| 穿雲弩 | crossbow |
| 風羽短弓 | bow |
| 炎晶杖 | staff |
| 霜紋杖 | staff |
| 疾風法器 | grimoire |
| 晨光權杖 | holyStaff |
| 淨化槌 | holyStaff |
| 祈禱法杖 | holyStaff |

實際戰鬥邏輯以 `weaponType` 判斷，不以名稱判斷。名稱表只用於舊資料 migration。

戰士／弓箭手普攻依目前武器取得相應精通；法師／牧師換武器不改變精通方向，精通由技能 `mastery` 決定。

### 自動戰鬥

維持：

- 2 主動槽。
- 2 觸發槽。
- 2 輔助槽。
- 現有冷卻制度。
- 現有自動目標與戰鬥流程。

新增武器使用限制檢查。輔助技能若因武器條件不能使用，不會錯誤消耗冷卻或記錄為已施放。

### 二轉

保留既有等級與資源條件，新增「任一本職主要精通達指定 Lv」條件。

預設精通需求為 Lv4，可由平衡器調整；驗證會阻擋高於精通最高等級的不可達設定。

### UI

技能頁已改為：

- 未學／已學。
- 角色等級需求。
- 前置技能。
- 精通需求。
- 武器需求。
- 未達條件提示。
- 精通名稱、Lv、目前 XP／下一級 XP。

已清理正常介面中的技能點與技能等級殘留說明。

### 存檔與 migration

- 舊核心／輔助技能 Lv>0 轉成已學；Lv0 保持未學。
- 舊技能點保留但停止使用。
- 舊存檔缺 mastery 時自動初始化為 0 XP。
- 新存檔若含 mastery，XP、key 與資料型別會嚴格驗證。
- 武器補上 `weaponType`；新存檔若明確提供不存在的 weaponType 會拒絕。
- mastery 會隨正常存檔、JSON 匯出／匯入保存。
- 修正新版存檔重開順序：mastery 的舊→新學習門檻 migration 現在會在第一次存檔驗證前執行，避免新規則學到的技能被舊門檻誤判為損壞存檔。

### 測試版開發工具

技能頁提供：

- 設定角色 Lv。
- 設定角色 EXP。
- 設定／增減各精通 XP。
- 重置單一角色精通。
- 強制學會／取消核心、輔助技能。
- 快速切換各職業武器類型。
- 對目前正式資料不存在的類型，可生成僅供測試的武器（例如祈禱書）。
- 顯示目前／上一場遭遇取得的精通 XP。
- 最多快速模擬 2000 個戰鬥回合。

### 平衡器

已新增／同步：

- 武器 `weaponType` 選單。
- 技能 `mastery`。
- `requiredMastery`。
- `requiredMasteryLevel`。
- 多選 `weaponTypes`。
- 前置技能取消等級欄位。
- 精通 XP 曲線。
- mastery／weaponType／精通需求／循環依賴／不可達需求驗證。
- 缺 weaponType 的武器警告。
- 舊 JSON migration。
- 匯出時移除停用的技能每級成長欄位。

## 驗證結果

程式層驗收：

- 遊戲 HTML：35 個 script block，全數可通過 JavaScript 語法編譯。
- 平衡器 HTML：19 個 script block，全數可通過 JavaScript 語法編譯。
- 遊戲核心靜態驗收 20/20 通過，包括四職分支、暗系治療、武器 migration、存檔 preload、技能完整效果、輔助武器限制等。
- 平衡器關鍵 schema／UI／validation／clean export 檢查通過。
- `chatgpt-dev` 相對正式 `main` 無落後，修改範圍集中於 `index.html`。

本環境沒有實際 GUI 瀏覽器／長時間人工掛機操作，因此以上是原始碼與資料流層的驗證，不把它誤報為完整人工遊玩驗收。測試版已提供開發工具，可進一步人工跑第一次大修的整條遊玩流程。

## 斷點 Commit

### Emberwild / chatgpt-dev

- `c250ffe` — Add mastery progression and skill learning core
- `98f1fa6` — Add mastery skill UI and test tools
- `efce9df` — Remove legacy skill point UI remnants
- `bbae9f0` — Enable dev weapon type acceptance switching
- `a231e51` — Fix mastery save bootstrap and branch progression
- `4c77eec` — Respect support skill use restrictions
- `1cb8823` — Validate mastery fields in save data
- `a998f7e` — Reject impossible mastery requirements
- `19319eb` — Clean legacy skill-level guide text

### Emberwild-Balance / main

- `799abca` — Add mastery and weapon type editor schema
- `abc82f2` — Align mastery branches and editor migration
- `ab9ea55` — Validate reachable mastery requirements

`02bc2e6` 是一次無內容的空提交，不列為有效修改斷點。

## 刻意尚未修改

這些項目依第一次大修規格保留：

- 不製作手動戰鬥。
- 不製作完整條件式 AI。
- 不增加技能槽。
- 不建立大型技能樹畫面。
- 不讓精通本身提供大量戰鬥倍率。
- 不一次新增大量技能或新的底層戰鬥機制。
- 不重製現有裝備數值與名稱。
- 不直接套用「後期 3～4 天一級」；目前只提供第一階段可調角色 EXP 倍率。
- 不物理刪除所有舊 `sp`／技能等級相容資料，避免破壞舊存檔。
- 仍維持每職 3 個輔助技能的固定結構。

## 第一版仍待實測決定

以下不是缺漏，而是本輪刻意留給實際掛機結果判斷：

- Lv1～8／10 的角色 EXP 曲線最終速度。
- 精通 XP 曲線是否太快／太慢。
- 2／2／2 配置是否已能形成足夠 Build 差異。
- 二轉精通 Lv4 是否能自然達成。
- 是否需要精通被動能力。
- 是否要擴增技能槽或更多技能。
- 戰士槌、牧師正式祈禱書等目前尚無既有正式裝備內容的類型，後續是否補正式裝備與技能。
