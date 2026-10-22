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

订阅地址为各文件的 raw 链接（raw.githubusercontent.com/IU19930516YPF/Loon-VIP/main/plugin/<文件名>）。每个插件另有美 VPS 备用订阅（1443 站点对应目录），GitHub 不可达时可用。

## 目录

- `script/`：改写脚本本体，插件经 raw 链接引用（带 ?v= 版本参数，升版时同步改插件里的版本号）。
- `plugin/`：Loon 插件文件（原生语法：http-response/http-request + script-path）。
