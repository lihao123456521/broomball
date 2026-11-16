# 手感、参与感与画面优化验证

日期：2026-11-16

分支：`feat/gameplay-visual-overhaul`

## 范围

本轮只修改当前浏览器核心版（根目录 `index.html` 及其运行资源），不改动原始 GLB、不同步 Godot 原型，也不恢复历史技能键位。

目标是解决三类体验问题：

1. 高低球和对方传球中难以碰到球。
2. 传球飞行期间输入无效，队友跑位重复，连续参与感不足。
3. 材质、飞行动作和球路反馈不清晰，中央字幕遮挡比赛。

## 实现摘要

- 自由球使用 0.16 秒球路预测自动追踪高度，垂直追踪上限由 6 提高到 11.5 米/秒；对方传球中也启用防守高度追踪。
- 保留身体、手部、扫帚端点和相对运动扫掠触球，不增加远程吸附或瞬移。
- 队友传球飞行期间可缓冲 E/R/F。E/R 在真实接球后一脚出球；F 支持接球后蓄力或提前松开后的快速射门。预输入有过期时间，失球、截球、暂停和重开会清理。
- 进攻队友拉开宽度并避开附近防守人；防守队友分为压迫和球门保护两层。对方无球队员会盯防接应点。
- 赛后增加触球与一脚配合统计，HUD 显示预输入状态。
- 增加鬼飞球短拖尾、近身光环、传射挥臂和接球音效。
- 草地增加程序纹理；角色材质区分布料、皮革和金属；上传模型启用环境反射与各向异性过滤；人物随加速和传射调整姿态。
- 解说字幕移至左下信息区，小屏隐藏，避免遮挡中央球路。

## 自动化验证

运行环境：Windows、Node.js 22、本机 Chrome、Playwright（安装在仓库外），通过 `file://` 加载，阻断并断言没有外部网络请求。

| 脚本 | 结果 |
| --- | --- |
| `node tests/team-control.cjs` | 22 项通过 |
| `node tests/passing-trajectory.cjs` | 2 项通过 |
| `node tests/browser-core-match.cjs` | 14 项通过 |
| `node tests/browser-ball-contact.cjs` | 7 项通过 |
| `node tests/browser-core-presentation.cjs` | 3 项通过 |
| `node tests/browser-gameplay-overhaul.cjs` | 7 项通过 |

合计 55 项检查通过。修改过的运行脚本和新增测试均通过 `node --check`。

新增浏览器检查覆盖：

- 高自由球预测升降和真实接球。
- 对方高传球中的防守高度追踪。
- 短传途中预输入直塞，并完成两次真实传球与自动换控。
- 接球前按住 F，接球后才蓄力，松开只射门一次。
- 接球前快速点按 F，接球后只产生一次快速射门。
- 对方截球清空预输入，不产生迟发或幽灵射门。
- 球路拖尾、接触光环、环境反射和预输入 HUD 均存在于真实渲染场景。

## 画面证据

- `tests/artifacts/core-presentation-attack-1280.png`：进攻与队友接应。
- `tests/artifacts/core-presentation-pause-800.png`：800×600 暂停帮助。
- `tests/artifacts/core-presentation-natural-30s.png`：30 秒自然比赛与防守布局。
- `tests/artifacts/gameplay-overhaul-buffered-pass.png`：传球中的预输入、球标和左下解说位置。
- `tests/artifacts/gameplay-overhaul-browser.json`：新增检查的状态证据。

`tests/artifacts/` 已被 `.gitignore` 排除；上述文件用于本机复核，不进入提交。

## 未做事项

- 未改动上传模型的几何或原始贴图，只优化运行材质和渲染。
- 未改变计分、180 秒赛制、三键核心操作和现有换控规则。
- 未运行已明确标记为历史技能版/旧键位版的测试；当前核心回归全部运行。
- 未合并到 `main`，未创建合并请求或合并提交。
