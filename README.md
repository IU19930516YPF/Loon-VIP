# Loon-VIP

Loon 会员本地改写插件合集（自维护）。与去广告仓库 Loon-AdBlock 分开管理：这里只放「会员/VIP 本地改写」类插件。

机制说明：这类插件都是 Loon 本地响应改写——只改 App 收到的数据在本地的显示与客户端判定，不与任何服务器做权益核验之外的交互。凡权益由服务器复核的（单独购买内容、真实余额消费等），本地改写过不去，各插件说明里已逐条写明硬边界。

## 插件订阅

| 插件 | 版本 | 订阅文件 |
|---|---|---|
| 喜马拉雅会员本地改写 | xmly v1.0.1 | plugin/XMLY.plugin |
| 不背单词大会员 | bbdanci v1.0.3 | plugin/BBDanci.plugin |
| 4K影视本地改写 | 4ktv v1.0.1 | plugin/4KTV.plugin |
| HelloTalk VIP | v13 | plugin/HelloTalk.plugin |
| 咸鱼之王温和版 | xyzw-safe v1.0.0 | plugin/XYZW-Safe.plugin |

订阅地址为各文件的 raw 链接（raw.githubusercontent.com/IU19930516YPF/Loon-VIP/main/plugin/<文件名>）。每个插件另有美 VPS 备用订阅（1443 站点对应目录），GitHub 不可达时可用。

## 咸鱼之王温和版说明

订阅文件为 plugin/XYZW-Safe.plugin，脚本本体为 script/xyzw-safe.js，版本 v1.0.0。

与原版的区别：删除原版的金币预览改动；怪物出现数量不改；怪物难度只在原值大于 3 时减 2，绝不降到 1，也不全量改弱。

风险提示：本版只降低触发概率，不是绕过检测。服务器会用真实怪物数据校验战斗结果，高关卡仍有被判定异常战斗、重置关卡甚至更重处罚的风险。主号慎用，建议小号先试；战斗时不要开倍速，不要用脚本连续推主线高关。

## 目录

- `script/`：改写脚本本体，插件经 raw 链接引用（带 ?v= 版本参数，升版时同步改插件里的版本号）。
- `plugin/`：Loon 插件文件（原生语法：http-response/http-request + script-path）。
