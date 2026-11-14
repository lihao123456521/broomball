# 浏览器版运行与进球判定验收 · 2026-11-14

基于远端 `main` 的 `4e343ab6c5a8b45fbf86c02620268a0397db0a73`。本轮修改默认入口 `index.html`；Godot 原生版不在本轮修改范围内。

## 修复行为

- 原先每帧最多推进 0.05 秒，10 FPS 时比赛、冷却和物理速度减半。现在完整消费正常帧间隔，每个物理子步不超过 1/60 秒；60 FPS、10 FPS 和 300ms 帧间隔推进一秒后的计时、护盾、冷却及玩家位移一致。
- 单帧停顿超过 0.5 秒自动暂停，清除按住的输入。开始、重开与恢复比赛重置时间基准，后台停帧不积累到下一次比赛更新。
- 倒计时阶段共用键盘视角输入，支持方向键与 I/K，保持玩家原地不动。
- 移除射门固定 2.4 秒过期。标准赛从中线附近以 24 米/秒出手，2.6 秒后仍沿原轨迹飞行，实际穿门后才得分。
- 门环与球体渲染和判定共用尺寸。门环内孔半径 3.33，球体含缝线外半径 1.1，球心允许偏离门心约 2.23；擦到门环不计分。
- 以球在一帧内的线段检测穿门，射门、传球与自由球按实际穿过的球门计分；反向穿回球场与持球穿门不计分。乌龙球给对方加分，不增加本队进球统计。
- 自由球与传球按进入各接球球径的时间，先结算门线前最早的接球或扑救；球已越过门线后才进入接球范围时，仍按穿门计分。玩家移动以相对轨迹判断，避免低帧率漏接。
- 传球期间记录发球者，守门员不会把自己刚发出的回传立即接回；后场向守门员要球仍有可见飞行过程并能正常接球。
- 进球重置和扑救后立即结束本次球轨迹处理，避免把门前到中线的重置当作球的飞行，错误授予途中玩家球权。

## 自动化结果

macOS，本地 Chrome，Node.js v24.22.1 与 Playwright。以下五套共 56 项检查通过，页面异常为零：

```text
node tests/browser-smoke.cjs --file             # 10 项交互检查
node tests/browser-experience.cjs --file        # 13 项比赛体验检查
node tests/browser-houses-novice.cjs --file     # 14 项学院与接球检查
node tests/browser-runtime.cjs                 # 4 项帧节奏与输入检查
node tests/browser-rules.cjs --file             # 15 项飞行与判定检查
```

按 README 配置 `NODE_PATH` 或 `PLAYWRIGHT_MODULE`，以及 `BROWSER_EXECUTABLE` 后运行。新增 runtime 测试在导航前注入可控的帧回调和时钟，直接执行实际游戏循环；rules 测试使用真实 F/W 键盘事件及场景状态隔离，门环边缘测试从实际渲染网格读取尺寸。

证据与截图写入被 Git 忽略的 `tests/artifacts/`：`runtime.json`、`rules-offline.json`、`interactions-offline.json`、`experience-offline-results.json`、`houses-novice.json` 等。另通过两个新增测试文件的 `node --check` 与 `git diff --check`。

以上为浏览器自动化验证，不代表人工连续游玩验收。
