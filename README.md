# Broomball · 学院冠军赛

以足球游戏的球队配合为核心，保留扫帚飞行、四大学院和魔法门环。默认入口是根目录 `index.html`，用 Chrome 或 Edge 打开即可离线游玩。依赖、场景和女性英语解说均已随项目保存，无需联网。

本轮重设计针对浏览器版。`project.godot` 是此前的原生版本，尚未同步此次球队控制、转播镜头和声音改动。

## 新的比赛方式

- **4 对 4**：每队三名追球手、一名守门员。己方队友向两侧拉开接应，对手会逼抢和传球。
- **球队控制**：J / T 向高亮队友短传，K / Z 向队友前方送直塞。传球目标按方向、距离与封堵选择。短传送到队友可接的手前；直塞按实际跑动方向和本次飞行时间内可达距离计算，不再固定向前12米。球路出手后固定，近身即可被拦截；接球采用短暂收球过渡，不瞬移球员，完成后自动控制我方接球队员。C 可手动切换到最接近球的己方追球手。
- **进攻选择**：低亮度点状弧线和球员标签标明接应目标，选择同时考虑方向、距离与对手封堵。WASD 按屏幕方向移动，与鼠标瞄准分开；鼠标只选择传射方向，← / → 可作为瞄准备用。白色短线显示当前方向。
- **射门**：按住 F 蓄力，松开出手；鼠标左键或屏幕按钮快速射门。战术或近景镜头中朝向蓝门且在 38 米内时辅助瞄准，训练与正式比赛操作一致。实际穿过门环得 10 分。
- **攻防转换**：按住 B 或屏幕逼抢按钮接近持球对手并抢断；逼抢温和跟随高度，Space / Q 可手动覆盖；Shift 冲刺、魔法控制和守门员扑救仍可使用。进球后短暂停顿，由失球方重新开球。
- **固定我方视角**：约31°略俯视，始终跟随当前我方操控球员。对手持球、传球飞远或射门都不会把主镜头带走；接球换控或手动 C 切人时，只平滑转到另一位我方球员。附近有效接应者决定视野宽度。V 切我方近景，按住 Tab 临时查看全场；橙色球位提示和雷达显示远处球。小窗口也固定显示我方球员面容。球场有756名带头、身体、手脚和围巾的观众，用12组实例绘制。
- **女性英语**：65 段完整赛事解说、13 段咒语使用 HeyGen Voice 的 Joanna 自然英式女声录音；另有 3 段兼容提示，共 81 个 WAV，全部在本地离线播放，保留原始录音与字词时间戳。开场、控球、传球、射门、进球、倒计时、结算和训练共用一个播报通道，避免互相打断。N 切换语音，暂停面板可调音量；回退合成也只允许女性英语。来源见 `assets/voice/VOICE.md`。

标准赛 180 秒，挑战赛 150 秒，按终场分数决胜；此次球队玩法不使用飞贼提前终结比赛。训练无计时、无对手干扰，依次完成飞行、升降、拾球、短传、射门和施法六步；实际接球和进球才推进训练。

## 操作

| 操作 | 按键 |
| --- | --- |
| 屏幕上 / 左 / 下 / 右 | W / A / S / D |
| 传射方向 | 移动鼠标；← / → 备用瞄准 |
| 短传 / 向持球队友要球 | J |
| 直塞 | K |
| 切换控制队员 | C |
| 蓄力射门 | 按住 F，松开射门 |
| 快速射门 | 鼠标左键 / 屏幕射门按钮 |
| 逼抢 | 按住 B / 屏幕逼抢按钮 |
| 冲刺 / 急停 | Shift / X |
| 上升 / 下降 | Space / Q |
| 咒语 | R 或鼠标右键 |
| 切换战术技能 | 1 / 2 / 3 |
| 我方战术 / 我方近景 | V |
| 临时全场总览 | 按住 Tab，松开恢复 |
| 训练高级俯仰 | I / O |
| 暂停 / 说明 | Esc / H |

**S 专用于后退，J / K 负责传球。** 后退速度为巡航的 65%，保持朝向瞄准方向；后退时不冲刺、不消耗冲刺体力。松开移动键自动制动。短传、直塞、射门、切人和按住逼抢都有屏幕按钮；文字与可用状态随球权更新。Cmd / Ctrl / Alt 组合键不触发游戏动作。训练与标准赛巡航速度 22、冲刺 36；挑战赛为 28 / 48。冲刺消耗体力，X 急停优先于冲刺。暂停时可调整训练跟随视角灵敏度和减少镜头动态，设置保存在本机。

## 学院和技能

可选择格兰芬多、斯莱特林、拉文克劳、赫奇帕奇和对手学院。队服、比分和结算随选择同步，每个学院可选择三名角色，共十二种外观；每个角色有独立发型、脸部与配色细节，制服增加领口、领带、围巾、披风滚边、手套和骑行靴。保留统一的三种战术技能，避免换学院改变操作习惯。

| 技能 | 效果 | 冷却 |
| --- | --- | --- |
| 1 · 除你武器 | 36 米内缴械；防守锁定持球者，进攻化解逼抢或封堵 | 7 秒 |
| 2 · 昏昏倒地 | 32 米内截停持球者、压制传球线拦截者；冻结逼近的游走球 3.2 秒 | 9 秒 |
| 3 · 盔甲护身 | 保护 36 米内持球 / 接球队友，或自己，持续 4 秒 | 12 秒 |

正式比赛按当前球权、逼抢距离和传球路线选择技能目标，屏幕标明这次施法会做什么；仍可瞄准有效对手主动压制。防守持球者在射程外时提示靠近，无目标不消耗冷却。1 / 2 / 3 只选择战术技能，C 负责切换实际球员；选择技能不会让球员变成另一人。护盾绑定实际身体，传球或切人后仍留在被保护球员身上。训练保留准星瞄准。三种技能冷却独立，暂停冻结比赛计时。结算展示进球、射门、抢断、传球成功数、控球率和模式本机最高分。

## 首页三维角色展示

首页改为紧凑的比赛大厅：学院、球员、模式和开始按钮在1440、1280、800宽度均可直接看见；装备库单独展开。右侧约半屏展示实际游戏角色，可拖动或用独立工具栏旋转、查看面容。学院、人物、扫帚或升级等级变化会同步更新模型和信息。哈利使用上传的完整 GLB，其他角色使用重做的三维人物与上传扫帚；预览使用与比赛相同的角色工厂。可切换全身 3D 与面容近景，查看眼睛、眼镜、发型和脸部轮廓。进入比赛后首页停止渲染；比赛左侧用同一套真实三维模型显示当前操控者与持球者的正面脸部特写（宽屏可显示对方持球者，窄屏固定我方），限 8 帧每秒；暂停与菜单中停止更新。

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

在当前球队版上整合 `main`（已包含 `update1`）的合理功能：学院角色、扫帚工坊、升级、队伍装备、赛后奖金、对手装备预算、自然转弯，以及完整句子解说和设置。保留当前 4 对 4、J 短传、K 直塞、C 切人、六步训练和计时决胜。

默认使用上传扫帚，可切换原 Lux 扫帚或经典扫帚。标准赛胜 / 平 / 负奖励 120 / 70 / 40 金币，挑战赛 ×1.5；训练和中途退出无奖金。升级实际提高巡航与冲刺速度；对手也按比赛奖金升级装备。

## 开发验证

当前球队玩法验收：

```text
node tests/browser-camera-controls.cjs
node tests/browser-pass-feel.cjs
node tests/browser-player-portraits.cjs
node tests/browser-tactical-roster.cjs
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

`tests/browser-experience.cjs`、`tests/browser-houses-novice.cjs` 是此前单人追球版的体验脚本，包含旧飞贼和回传预期；当前以球队验收脚本为准。历史验证保存在 `docs/validation/`。最新我方镜头、传球与大厅验收见 `docs/validation/home-team-controls-and-passing.md`；前轮战术视野和十二角色展示验收见 `docs/validation/tactical-roster-homepage.md`；前轮近景与自然配音验收见 `docs/validation/rider-presence-and-natural-voice.md`；分支整合记录见 `docs/validation/2026-11-14-final-integration.md`；前轮球队重设计见 `docs/validation/2026-11-14-teamplay-redesign.md`。

请保留 `index.html`、`game-environment.js`、`game-houses.js`、`game-presentation.css`、`game-menu.css`、`game-character-art.js`、`game-character-preview.js`、`game-player-portraits.js`、`game-match-skills.js`、`game-voice.js`、`game-passing.js`、`game-crowd.js`、`game-models.js`、`game-brooms.js`、`game-school-magic.js`、`game-commentary*.js`、`assets/` 和 `vendor/` 的相对位置。

Three.js 使用 MIT 许可证，见 `vendor/THREE-LICENSE.txt`。
