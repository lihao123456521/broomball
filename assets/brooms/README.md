# 扫帚资产与队伍装备

- lux3d-basic.glb：用户通过主办方 Aholo Lux3D 生成的基础扫帚。原始文件保留在 Downloads/broomball3D/textured.glb。
- 网页副本：18,807 三角面，约 1.23 MiB，1024 像素贴图。lux-basic.png 和 classic.png 从实际游戏模型渲染。
- 新款在 game-brooms.js 的 catalog 配置 id、name、description、price、model、image、power；power 默认为 1，可选 rotationY 和 length 对齐模型。每款介绍修改前由用户审核。
- 默认全员使用基础款。玩家可在商店为自己、接应手和守门员配置已拥有装备。己方队友配置按学院保存，同款扫帚共用升级等级。
- 等级最高 3，升级费用 100/200/300，每级提升 3% 巡航和冲刺速度。金币、物品、等级、学院队伍配置存于 broomball-career-v1；旧存档保留金币和升级等级。
- 对手每个学院保存独立预算和四名队员的装备、等级；按对手胜负领取奖金（标准赛 120/70/40，挑战赛 ×1.5），赛后按性价比购买与升级，不透支，下一场生效。训练和退出不结算。
- 未来上架更强扫帚时填写真实模型、图片、价格和 power。已购新款可以供队员配置，对手也会在预算足够且实际性能改善时购买。
- 加载器来自 Three.js r160 官方 GLTFLoader 和 BufferGeometryUtils，已适配本项目 THREE 全局对象；许可见 vendor/THREE-LICENSE.txt。
