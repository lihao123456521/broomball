# Broomball · 学院冠军赛

以足球游戏的球权、跑位和攻防换控为核心的4对4扫帚比赛。当前版本是根目录`index.html`浏览器版：Chrome/Edge直接打开即可，模型、依赖和女性英语赛事解说均离线可用。

## 只保留一套核心操作

| 按键 | 比赛动作 |
| --- | --- |
| W / A / S / D | 按屏幕方向移动 |
| E | 向高亮队友短传 |
| R | 直塞到队友可达的跑动空当 |
| F | 我方持球：按住蓄力、松开射门；对方持球：按住逼抢 |
| Shift | 冲刺 |
| Esc | 暂停 / 继续 |

常用动作集中在左手WASD旁的E、R、F。不需要鼠标瞄准、手动升降、手动切人、切镜头或组合施法。松开方向会自动减速；传射方向以当前方向输入为准，无方向输入时保持球员朝向。屏幕三个动作按钮与键盘完全对应。

## 按球权自动操控

- 我方持球：操控实际持球人，包含守门员。传球飞行时保持原控人，真实接球后自动接管接球队员。
- 对方刚拿球：立即选择最近可用的我方场上防守队员；连续防守按距离优势和0.35秒锁定防抖，避免左右来回跳。守门员默认留在门前，场上无人可用时才参与防守选人。
- 自由球：选择最有机会争到球的我方队员；我方传球期间保持目标稳定。
- 球员换控只交换控制归属，不移动或瞬移任何实体。球员身份、位置和守门员职责保留；主镜头始终跟随当前我方操控者。
- F的攻防用途由球权决定。失球会取消射门蓄力；逼抢夺球后松开F不会产生幽灵射门，下一次按F才开始射门。

## 比赛与传球

标准/挑战均为180秒，一次进球记1球，终场按比分决胜；失球方重新开球。挑战只提高对方逼抢强度，不改变一套操作。

短传和直塞使用出手时确定的低抛物线，不追踪接收者、不人为蛇形弯曲。直塞根据实际跑动方向、转弯、加速和飞行时间计算可达落点。近身对手也能拦截。真实接球在持球手附近判定，收球用0.14秒过渡；错失后球继续沿切线飞行。射门、接球、扑救与球门穿越用连续轨迹检测，低帧率不会直接跳过。

首页只做选学院/对手、选队长、选标准/挑战、开赛。12名角色保留实际3D和面容展示。比赛保留比分、控人标记、接应提示、体力、雷达和简洁按键。已移除比赛中的主动魔法、游走球干扰、手动升降、飞贼竞速、装备购买升级、额外镜头模式及分散的旧动作键。

## 七个上传模型

原始GLB保存在`assets/models/originals/`，运行时使用本地优化版本，不依赖微信临时目录。

| 原文件 | 实际用途 |
| --- | --- |
| textured.glb | 学院主堡 |
| textured (1).glb | 学院尖塔 |
| textured (2).glb | 石桥门楼 |
| textured (3).glb | 球场外围城墙 |
| textured(1).glb | 所有球员同速的默认赛用扫帚 |
| textured (1)(1).glb | 场边金色奖杯 |
| textured (2)(1).glb | Harry完整骑乘角色与首页展示 |

现有Joanna自然女性英语录音继续本地播放。暂停面板可开关解说，没有额外比赛快捷键。资产处理见`assets/models/README.md`，声音来源见`assets/voice/VOICE.md`。

## 代码结构

- `index.html`：精简页面入口，无内联游戏引擎。
- `game-core.js`：比赛状态、真实球权、球路碰撞、AI跑位及渲染协调。
- `game-controls.js`：唯一键位定义与移动意图。
- `game-team-control.js`：独立、无渲染依赖的自动换控决策。
- `game-passing.js`：可达接球点与固定低弧线。
- `game-roster.js`：纯球员身份和外观数据，无技能引擎。
- `game-rider-gear.js`：唯一默认GLB扫帚，无商城与升级逻辑。
- `game-core-ui.css` / `game-core-hud.css`：首页与比赛界面。
- `game-character-art.js` / `game-character-preview.js` / `game-player-portraits.js`：真实人物及面部展示。
- `game-models.js` / `game-environment.js` / `game-crowd.js`：上传模型、球场环境和观众。

## 验证

```text
node tests/team-control.cjs
node tests/browser-core-match.cjs
node tests/browser-core-presentation.cjs
node tests/passing-trajectory.cjs
```

需要Node.js、Playwright和Chromium，可通过`PLAYWRIGHT_MODULE`和`BROWSER_EXECUTABLE`指定本机路径。浏览器时钟在导航前安装，测试真实键盘、传球、换控、抢断、射门、重开、暂停和画面。

历史单人版、技能版及旧键位测试保留作记录，不能作为当前核心玩法的要求。`project.godot`是此前原生原型，本轮核心重构面向浏览器入口。最新验收见`docs/validation/core-football-rebuild.md`。

Three.js使用MIT许可证，见`vendor/THREE-LICENSE.txt`。
