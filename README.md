# Broomball · 学院冠军赛

以足球游戏的球权、跑位和攻防换控为核心的4对4扫帚比赛。当前版本是根目录`index.html`浏览器版：Chrome/Edge直接打开即可，模型、依赖和女性英语赛事解说均离线可用。

## 只保留一套核心操作

| 按键 | 比赛动作 |
| --- | --- |
| W / A / S / D | 按屏幕方向移动 |
| E | 向高亮队友短传 |
| R | 直塞到队友可达的跑动空当 |
| F | 我方持球：按住蓄力、松开射门；对方持球：按住预判冲刺逼抢 |
| Shift | 冲刺 |
| Space | 精彩进球庆祝期间：跳过庆祝 |
| Esc | 暂停 / 继续 |

常用动作集中在左手WASD旁的E、R、F。不需要鼠标瞄准、手动升降、手动切人、切镜头或组合施法。松开方向会自动减速；传射方向以当前方向输入为准，无方向输入时保持球员朝向。屏幕三个动作按钮与键盘完全对应。队友传球飞行期间也可提前按E/R/F：E/R在真实接球后一脚出球，按住F从接球时开始蓄力，提前松开F则在接球后快速射门；对方截球会清空全部预输入。

玩家的24米以上远射、80%以上蓄力射门或一脚射门得分会触发精彩进球庆祝。庆祝时按E挥拳、R滑翔、F全队庆祝，按Space或点击按钮跳过；期间比赛计时暂停，结束后对方开球。普通进球和AI进球只保留短促的观众欢呼，不弹出庆祝选择。

## 按球权自动操控

- 我方持球：操控实际持球人，包含守门员。传球飞行时保持原控人，真实接球后自动接管接球队员。
- 对方刚拿球：立即选择最近可用的我方场上防守队员；连续防守按距离优势和0.35秒锁定防抖，避免左右来回跳。守门员默认留在门前，场上无人可用时才参与防守选人。
- 自由球：选择最有机会争到球的我方队员；我方传球期间保持目标稳定。
- 球员换控只交换控制归属，不移动或瞬移任何实体。球员身份、位置和守门员职责保留；主镜头始终跟随当前我方操控者。
- F的攻防用途由球权决定。失球会取消射门蓄力；逼抢夺球后松开F不会产生幽灵射门，下一次按F才开始射门。

## 比赛与传球

标准/挑战均为180秒，一次进球记1球，终场按比分决胜；失球方重新开球。挑战只提高对方逼抢强度，不改变一套操作。

短传和直塞使用出手时确定的低抛物线，不追踪接收者、不人为蛇形弯曲。直塞根据实际跑动方向、转弯、加速和飞行时间计算可达落点。近身对手也能拦截。触球综合身体、手部和扫帚前后端，贴近持球的球可直接夺球，按住F可扩大逼抢范围；玩家、AI和球都按相对运动轨迹判断，减少擦过漏判。自由球按短时间球路预测自动追踪高度，垂直追踪上限为11.5米/秒，仍不需要手动升降。收球用0.14秒过渡；错失后球继续沿切线飞行。射门、接球、扑救与球门穿越用连续轨迹检测，低帧率不会直接跳过。

按住F逼抢会预判持球人0.28秒后的飞行位置，并在有体力时自动冲刺；自动逼抢每秒消耗17体力，低于手动Shift的27。我方一名防守队友会加速预测压迫，另一名继续保护球门；压迫队友贴近后能实际抢下球权并自动交给玩家控制。

## 配合、反馈与画面

- 进攻时队友横向拉开并避开附近防守人，射门蓄力时前插；防守时一名队友压迫持球人，另一名回收保护球门，不再全员追同一点。
- 传球途中显示预输入状态，赛后统计触球和一脚配合；鬼飞球带短运动拖尾、近身接球变色光环，出球和射门有挥臂及音效反馈。
- 球场使用程序生成的细节草纹，角色区分布料、皮革和金属粗糙度；本地模型启用各向异性过滤与户外环境反射。人物随加速前倾、传射后仰，布料动画遵守“减少动态效果”设置。
- 英语解说字幕移到左下信息区，避免与中央球标、接应标签和动作提示重叠。
- 精彩进球提供挥拳、滑翔和全队三种庆祝，配合专用镜头与队友聚拢；观众按学院区域跳跃、挥手并播放欢呼，减少动态效果时停用跳跃。
- 庆祝期间隐藏比赛动作提示并冻结计时，可立即跳过；重开和返回首页会恢复角色及观众姿态。

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

Joanna 女性英语录音本地播放，逐段温和均衡音量并保留原速、原调和原始录音。常规解说结束后留白 1 秒，同一句常规台词至少间隔 24 秒；进球与终场保留优先级。传接球使用轻柔碰撞与气流音，解说播放时音效自动压低，暂停与返回首页会停止音效。暂停面板可开关解说和调节音量。资产处理见`assets/models/README.md`，声音来源见`assets/voice/VOICE.md`。

## 代码结构

- `index.html`：精简页面入口，无内联游戏引擎。
- `game-audio.js`：本地音效包络、解说避让与暂停释放。
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
node tests/browser-ball-contact.cjs
node tests/browser-core-presentation.cjs
node tests/browser-gameplay-overhaul.cjs
node tests/browser-pressure-celebration.cjs
node tests/commentary-engine.cjs
python3 tests/natural-voice.py
node tests/browser-match-audio.cjs
node tests/browser-commentary-audio.cjs
node tests/passing-trajectory.cjs
```

真实录音验证 `browser-commentary-audio.cjs` 需要先在根目录运行 `python3 -m http.server 8765 --bind 127.0.0.1`；该脚本也单独检查 `file://` 离线播放。

需要Node.js、Playwright和Chromium，可通过`PLAYWRIGHT_MODULE`和`BROWSER_EXECUTABLE`指定本机路径。浏览器时钟在导航前安装，测试真实键盘、传球、换控、抢断、射门、重开、暂停和画面。

历史单人版、技能版及旧键位测试保留作记录，不能作为当前核心玩法的要求。`project.godot`是此前原生原型，本轮核心重构面向浏览器入口。核心重构验收见`docs/validation/core-football-rebuild.md`；触球判定调整见`docs/validation/ball-contact-tolerance.md`；本轮手感、参与感和画面验证见`docs/validation/gameplay-visual-overhaul.md`。

Three.js使用MIT许可证，见`vendor/THREE-LICENSE.txt`。

声音调整与所有分支取舍见 `docs/validation/natural-audio-branch-integration.md`。
