# Broomball · 学院冠军赛

以足球游戏的球队配合为核心，保留扫帚飞行、四大学院和魔法门环。默认入口是根目录 `index.html`，用 Chrome 或 Edge 打开即可离线游玩。依赖、场景和女性英语解说均已随项目保存，无需联网。

本轮重设计针对浏览器版。`project.godot` 是此前的原生版本，尚未同步此次球队控制、转播镜头和声音改动。

## 新的比赛方式

- **4 对 4**：每队三名追球手、一名守门员。己方队友向两侧拉开接应，对手会逼抢和传球。
- **球队控制**：S / T 向高亮队友短传，Z 向队友前方送直塞。短传与直塞沿出手时确定的轻微抛物弧线飞行，能被拦截；接球后自动控制接球队员。C 可手动切换到最接近球的己方追球手。
- **进攻选择**：低亮度点状弧线和球员标签标明接应目标，选择同时考虑方向、距离与对手封堵。鼠标在近景或全场镜头中选择进攻方向，← / → 也可转向。白色短线显示当前方向。
- **射门**：按住 F 蓄力，松开出手；鼠标左键或屏幕按钮快速射门。近景或全场镜头中朝向蓝门且在 38 米内时辅助瞄准；训练跟随镜头需准星对准门环。实际穿过门环得 10 分。
- **攻防转换**：B 逼近持球对手，接近后抢断；Shift 冲刺、魔法控制和守门员扑救仍可使用。进球后短暂停顿，由失球方重新开球。
- **清晰的球权信息**：默认近距离骑手镜头，保持角色在画面中清晰可见；传球飞远时不拉远镜头。V 切换全场战术视角并返回近景。显示控球状态、接应队员、传球路线、蓄力和雷达。球场有 756 名带头、身体、手脚和围巾的观众，用 12 组实例绘制。
- **女性英语**：65 段完整赛事解说、13 段咒语使用 HeyGen Voice 的 Joanna 自然英式女声录音；另有 3 段兼容提示，共 81 个 WAV，全部在本地离线播放，保留原始录音与字词时间戳。开场、控球、传球、射门、进球、倒计时、结算和训练共用一个播报通道，避免互相打断。N 切换语音，暂停面板可调音量；回退合成也只允许女性英语。来源见 `assets/voice/VOICE.md`。

标准赛 180 秒，挑战赛 150 秒，按终场分数决胜；此次球队玩法不使用飞贼提前终结比赛。训练无计时、无对手干扰，依次完成飞行、升降、拾球、短传、射门和施法六步；实际接球和进球才推进训练。

## 操作

| 操作 | 按键 |
| --- | --- |
| 前进 / 左右横移 | W / A、D |
| 选择方向 | 近景或全场时移动鼠标；← / → 转向 |
| 短传 / 向持球队友要球 | S 或 T |
| 直塞 | Z |
| 切换控制队员 | C |
| 蓄力射门 | 按住 F，松开射门 |
| 快速射门 | 鼠标左键 / 屏幕射门按钮 |
| 逼抢 | 按住 B |
| 冲刺 / 急停 | Shift / X |
| 上升 / 下降 | Space 或 E / Q 或 Ctrl |
| 咒语 | R 或鼠标右键 |
| 切换战术技能 | 1 / 2 / 3 |
| 近景 / 全场战术镜头 | V |
| 暂停 / 说明 | Esc / H |

**没有后退按键。S 已改为短传。** 松开移动键自动制动，转向后前进可返回防守区域。传球、射门、切人也有可点击按钮。训练与标准赛巡航速度 22、冲刺 36；挑战赛为 28 / 48。冲刺消耗体力，X 急停优先于冲刺。暂停时可调整鼠标灵敏度和减少镜头动态，设置保存在本机。

## 学院和技能

可选择格兰芬多、斯莱特林、拉文克劳、赫奇帕奇和对手学院。队服、比分和结算随选择同步，每个学院可选择三名角色，共十二种外观；保留统一的三种战术技能，避免换学院改变操作习惯。

| 技能 | 效果 | 冷却 |
| --- | --- | --- |
| 1 · 除你武器 | 36 米内使持球对手掉球、短暂受击 | 7 秒 |
| 2 · 昏昏倒地 | 32 米内击晕对手 / 冻结游走球 3.2 秒 | 9 秒 |
| 3 · 盔甲护身 | 4 秒内格挡游走球与抢断 | 12 秒 |

攻击技能需朝向有效目标，无目标不消耗冷却。三种技能冷却独立，暂停冻结比赛计时。结算展示进球、射门、抢断、传球成功数、控球率和模式本机最高分。

## 上传的七个模型

七个原始 GLB 全部保存在 `assets/models/originals/`，游戏实际使用经过减面和贴图缩小的本地版本；加载不依赖网络或微信临时目录。

| 原文件 | 游戏用途 |
| --- | --- |
| `textured.glb` | 学院主堡 |
| `textured (1).glb` | 球场两侧的学院尖塔 |
| `textured (2).glb` | 入口石桥与双塔门楼 |
| `textured (3).glb` | 学院城墙 |
| `textured(1).glb` | 默认比赛扫帚，可在工坊切换 |
| `textured (1)(1).glb` | 场边金色飞贼奖杯及飞贼外观 |
| `textured (2)(1).glb` | 哈利飞行角色 |

运行模型约 19.3 MB、342,684 个三角形；七份原件约 151.4 MB、1,745,052 个三角形。原件未改写。映射、校验和与重建方法见 `assets/models/README.md`。

## 分支整合与装备

在当前球队版上整合 `main`（已包含 `update1`）的合理功能：学院角色、扫帚工坊、升级、队伍装备、赛后奖金、对手装备预算、自然转弯，以及完整句子解说和设置。保留当前 4 对 4、S 短传、Z 直塞、C 切人、六步训练和计时决胜。

默认使用上传扫帚，可切换原 Lux 扫帚或经典扫帚。标准赛胜 / 平 / 负奖励 120 / 70 / 40 金币，挑战赛 ×1.5；训练和中途退出无奖金。升级实际提高巡航与冲刺速度；对手也按比赛奖金升级装备。

## 开发验证

当前球队玩法验收：

```text
node tests/browser-character-presence.cjs
node tests/passing-trajectory.cjs
node tests/browser-refinements.cjs
node tests/browser-branch-integration.cjs
node tests/commentary-engine.cjs
node tests/browser-commentary.cjs
node tests/browser-commentary-audio.cjs
node tests/browser-teamplay.cjs
node tests/browser-smoke.cjs --file
node tests/browser-runtime.cjs
node tests/browser-rules.cjs --file
```

需要 Node.js、Playwright 和 Chromium。可通过 `PLAYWRIGHT_MODULE` 指定 Playwright 模块路径，通过 `BROWSER_EXECUTABLE` 指定浏览器。测试先安装统一虚拟时钟再加载游戏，覆盖真实键盘输入、接球、拦截、进球、训练全流程、暂停、低帧率及离线运行。

`tests/browser-experience.cjs`、`tests/browser-houses-novice.cjs` 是此前单人追球版的体验脚本，包含旧飞贼和回传预期；当前以球队验收脚本为准。历史验证保存在 `docs/validation/`。最新近景与自然配音验收见 `docs/validation/rider-presence-and-natural-voice.md`；分支整合记录见 `docs/validation/2026-11-14-final-integration.md`；前轮球队重设计见 `docs/validation/2026-11-14-teamplay-redesign.md`。

请保留 `index.html`、`game-environment.js`、`game-houses.js`、`game-presentation.css`、`game-voice.js`、`game-passing.js`、`game-crowd.js`、`game-models.js`、`game-brooms.js`、`game-school-magic.js`、`game-commentary*.js`、`assets/` 和 `vendor/` 的相对位置。

Three.js 使用 MIT 许可证，见 `vendor/THREE-LICENSE.txt`。
