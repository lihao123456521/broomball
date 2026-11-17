# 声音调整与分支整合

日期：2026-11-17

## 分支核对与取舍

更新远端引用后，核对所有本地分支和 `origin` 分支。整合前 `main` 为 `6fad3df`；以下分支的末端提交均已包含在其祖先历史中，无需重复应用：

| 分支 | 末端提交 | 已保留的合理部分 |
| --- | --- | --- |
| `codex/gameplay-logic-fixes` | `5a8dc1d` | 帧时间、进球与重新开球规则、上传模型、离线女声解说的整合基础 |
| `codex/tactical-roster-preview` | `06ff1b3` | 学院与角色选择、可见的 3D 球员展示 |
| `codex/possession-camera-skills` | `1fc9b96` | 球权感知、可辨识球员面容和身份展示 |
| `codex/home-team-controls` | `7f7a0cd` | 镜头跟随我方球员、可达传球和简化首页 |
| `codex/core-football-rebuild` | `5ce063b` | 4 对 4、真实持球人自动换控、WASD/E/R/F 核心操作、固定低弧线传球 |
| `codex/ball-contact-tolerance` | `4cba84e` | 身体、手部与扫帚触球检测，相对运动连续判定和贴身抢断容错 |
| `origin/codex/gameplay-logic-fixes` | `7dc4a60` | 已包含于本地同名分支及 `main` |
| `origin/update1` | `91633cc` | 学院角色、角色外观和模型资源；旧装备与魔法玩法保留在历史中 |

唯一未合并的远端分支为 `origin/feat/gameplay-visual-overhaul`，末端提交 `715f6ff`，相对整合前的 `main` 为 0 个落后、2 个新增提交：

- `d3ac354`：高自由球与对方高传球的自动高度追踪；传球期间 E/R/F 预输入；接球后一脚配合；进攻拉开与防守分工；球路拖尾、接球光环、人物动作、草纹和材质反射；移开中央解说字幕。
- `715f6ff`：F 预判冲刺逼抢与队友协同抢断；精彩进球可跳过的庆祝；冻结比赛计时的庆祝镜头；分学院观众反应和减少动态效果的处理。

这两次提交延续当前核心玩法，整体纳入整合。原有单振荡器提示音与合成噪声欢呼由此次声音调整接管。代码没有恢复已经被核心重构主动移除的魔法技能、装备商城、手动升降、额外比赛视角和旧组合键，避免重新引入相互冲突的操作体系。

## 验证范围

当前玩法的回归入口为：

```text
node tests/team-control.cjs
node tests/passing-trajectory.cjs
node tests/browser-core-match.cjs
node tests/browser-ball-contact.cjs
node tests/browser-core-presentation.cjs
node tests/browser-gameplay-overhaul.cjs
node tests/browser-pressure-celebration.cjs
```

上述脚本覆盖自动换控、可达传球、实际触球、拦截、预输入与一脚射门、逼抢、庆祝冻结/暂停/跳过、减少动态效果及界面布局。历史技能版和旧键位测试不是当前核心玩法的验收要求。

`tests/browser-commentary-audio.cjs` 本次改为当前比赛入口：真实点击开赛并完成倒计时；通过 HTTP 解码全部 65 段 WAV；检查常规播报不截断句子、进球优先替换、实时音量调整、解说期间音效压低与恢复、暂停与重开清理声音、800×600 音量控件可达，以及 `file://` 离线录音播放。该测试观察真实浏览器媒体与 AudioContext，不替换音频或语音合成实现。

## 声音改动

- 81 段现有 Joanna 录音按片段做恒定衰减和不足 4ms 的首尾淡入淡出；不裁剪、不改变语速音调，不重新生成声音。10ms 窗口、−45 dBFS 测量门限下的活跃语音 RMS 范围由 7.07 dB 收窄至 0.31 dB，目标 −20 dBFS；原始 WAV 哈希保持不变。
- 常规解说保持原有至少 12 秒播报间隔，句子自然结束后另留白 1 秒；同一句常规台词跨事件 key 至少间隔 24 秒。进球和终场仍可及时打断过时信息。
- 声音状态正确标示 Joanna / en-GB，备用合成优先使用同口音女声并保持原始音高。
- 传接球用低频碰撞和过滤气流替代固定音高提示；欢呼采用较柔和的缓起包络。解说可听时音效总线降至 40%，以 20ms 时间常数压低、240ms 时间常数恢复。它们仍是程序合成音效，不是真人观众采样。
- 暂停、重开、回首页立即清理音效；恢复和重新开赛在同一调用内恢复声音状态并唤醒 AudioContext，避免首帧漏声。
- 暂停面板提供可保存的解说音量滑块；保留当前三键玩法和音频的离线可用性。

## 本次验证结果

macOS、本机 Chrome、仓库外 Playwright。浏览器音频用真实 HTMLAudioElement 和 AudioContext，音效使用 OfflineAudioContext 渲染到 PCM。通过结果如下：

| 脚本 | 检查数 |
| --- | ---: |
| `team-control.cjs` | 22 |
| `passing-trajectory.cjs` | 2 |
| `browser-core-match.cjs` | 14 |
| `browser-ball-contact.cjs` | 7 |
| `browser-core-presentation.cjs` | 3 |
| `browser-gameplay-overhaul.cjs` | 7 |
| `browser-pressure-celebration.cjs` | 9 |
| `commentary-engine.cjs` | 20 |
| `browser-match-audio.cjs` | 6 |
| `browser-commentary-audio.cjs` | 11 |
| `natural-voice.py` | 4 组，覆盖全部 81 段与两次隔离重导入 |

合计 105 项/组检查通过。`git diff --check` 与变更 JavaScript 语法检查通过。

`natural-voice.py` 验证原件哈希、逐样本仅恒定衰减和边缘淡出、无削波、时长/文本/声线元数据一致、重导入字节一致。真实音频测试覆盖全部 65 段解码、正常倒计时、整句播放、关键事件替换、音效避让、静音/开关与音量持久化、暂停与重开、同步恢复后立即播放、800×600 和 file://。

一次浏览器启动在沙箱内被系统阻止，改为获准的本机测试；后续一次自动审批服务额度失败导致音频测试未执行，用户要求继续后重新获准并完成。继续时本机服务已结束，首次请求连接失败，重启仅绑定 127.0.0.1 的测试服务后全项通过。这些失败不计入通过数。

数值与自动播放验证不能替代主观听音。试听文件为 `tests/artifacts/natural-commentary-preview.wav`，由实际运行用的开场、进球和终场录音组成；截图与结构化结果位于 `tests/artifacts/`，均为本机验证产物、不进入提交。

