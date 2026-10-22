# 地城 Beta

手機為主嘅 idle 地城遊戲（Three.js + TypeScript）。計劃見 `docs/計劃.md`。

**網上玩：** https://<your-username>.github.io/<repo-name>/ （GitHub Pages，每次 push 去 `main` 自動更新）

- 唔掂螢幕 = 🤖 自動駕駛，角色自己行、自己打
- 掂住螢幕拖動（電腦用滑鼠拖，或者 WASD / 方向鍵）= 🎮 自己操控，放手 2 秒後變返自動
- 存檔喺每個人自己嘅瀏覽器（設定頁可以匯出 / 匯入）

## Credits
- 3D 角色、武器同地城模型：[KayKit](https://kaylousberg.com) by Kay Lousberg，CC0（授權檔喺 `src/assets/models/`）

## 改 code 同開發
要先裝 [Node.js](https://nodejs.org)（22 或以上）。喺呢個資料夾開 terminal：

```
npm install            # 第一次先要
npm run dev            # 開發模式；手機同電腦連同一個 Wi-Fi，用手機開佢顯示嘅 Network 網址
npm run build          # 砌 PWA 版本去 dist/，可以放上 GitHub Pages / Cloudflare Pages
npm run build:single   # 砌單一 HTML 檔去 dist-single/index.html（雙擊就玩到，但冇 PWA）
npm run artifact       # 砌 Claude artifact 版本去 artifact/（頁面 + 原始碼備份清單 files.json）
```

PWA（加到手機主畫面、離線都玩到）只會喺用 https 網址開嘅時候生效。每次出新版本，記得改 `public/sw.js` 入面嘅 `VERSION`，手機先會攞新版。

## 檔案分佈
| 檔案 | 做咩 |
|---|---|
| `src/sim/config.ts` | 敵人、難度、經驗、商店、離線收益嘅數字 |
| `src/sim/classes.ts` | 4 個基礎職業嘅屬性同攻擊方式 |
| `src/sim/awakening.ts` | 16 個覺醒職業：加成同招牌技 |
| `src/sim/skills.ts` | 技能板（3 塊板 × 輸出 / 坦克 / 控制三條路）、解鎖規則、重置 |
| `src/sim/abilities.ts` | 技能板自動技能同招牌技點樣放 |
| `src/sim/ultimates.ts` | 終極技（天罰聖環、雷神之怒、御劍術等 8 個）|
| `src/sim/gear.ts` | 裝備、武器類型、稀有度、傳說特殊詞綴、武器 / 飾品技能（連擊、斬殺、狂風、吸血）、寶箱、強化（會失敗）、重抽、交換、分解 |
| `src/sim/worldboss.ts` | 世界 Boss、有名傳說、獎勵計算 |
| `src/sim/cards.ts` | 升級強化卡（有啲只限某個職業） |
| `src/sim/stats.ts` | 屬性計算規則（+% 先加，× 後乘；防禦 100 = 傷害減半） |
| `src/sim/sim.ts` | 遊戲邏輯（純計算，冇畫面）。之後做合作時，主機就係跑呢個 |
| `src/sim/autopilot.ts` | 自動駕駛點樣行（近戰同遠程唔同） |
| `src/render/renderer.ts` | Three.js 畫面，只讀遊戲狀態，唔會改佢 |
| `src/ui/home.ts` | 主頁五個分頁、覺醒畫面、技能樹、裝備詳情 |
| `src/main.ts` | 戰鬥介面、結算、離線收益、主循環 |
| `src/ui/onboarding.ts` | 新手提示同新手任務 |
| `src/cloud.ts` | Claude artifact 雲端存檔同下載 |
| `scripts/make-artifact.mjs` | 將單一 HTML 轉成 artifact 頁面，列出要備份嘅原始碼 |
| `src/save.ts` | 存檔、裝備、寶箱入袋、離線收益計算 |
| `public/` | PWA 檔案：manifest、service worker、圖示 |

## 有咩
4 個職業（戰士近戰斬擊、弓手射箭、魔法師爆炸火球、死靈法師暗影彈 + 召喚骷髏）、白貓式技能板（靈魂 + 符文解鎖）、第 5 級地城通關後覺醒（16 個覺醒職業，各有招牌技同覺醒板）、10 個裝備位（包括兩隻戒指同項鍊）、4 種稀有度、銀箱 / 金箱（通關先入袋）、武器類型（覺醒後副武器會變）、傳說特殊詞綴、武器 / 飾品技能（連擊、斬殺、狂風、吸血）、強化（+7 起會失敗，有保底）、重抽詞綴、5 換 1 交換、鎖定、自動分解、按稀有度分解、世界 Boss（每日 3 次）同 9 件有名傳說、8 個終極技（💎 靈晶解鎖）、離線收益（最多 8 小時）、PWA。

## 未有
套裝、合作模式、排行榜、真正嘅 3D 模型（而家用簡單形狀）。
