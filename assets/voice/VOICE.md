# 离线女声

这六段中文语音使用本机 macOS 的 **Tingting（婷婷）女声**离线合成，未调用外部服务。
音频格式为单声道、22,050 Hz、16-bit PCM WAV，播放无需网络或系统语音包。

| 文件 | 语音 |
| --- | --- |
| disarm.wav | 除你武器！ |
| stun.wav | 昏昏倒地！ |
| shield.wav | 盔甲护身！ |
| kickoff.wav | 比赛开始，寻找队友，传切配合。 |
| goal-home.wav | 漂亮的进球！ |
| goal-away.wav | 对方进球，重新组织进攻。 |

`game-voice.js` 优先播放这些音频，其他文本仅使用已知的系统女声，不回退到男声。

生成命令：`say -v Tingting -r 190 -o cue.aiff '语音文本'`，然后使用 `afconvert -f WAVE -d LEI16@22050 -c 1 cue.aiff cue.wav`。
