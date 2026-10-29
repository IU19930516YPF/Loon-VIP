// 咸鱼之王 温和版 v1.0.0
// 适用：微信小程序版，配置接口的响应改写。
// 温和改动，与原版的区别：
//   1. 删除原版的金币预览改动，本版不改任何金币相关字段。
//   2. 怪物出现数量不改。
//   3. 怪物难度只在原值大于 3 时减 2，绝不降到 1，也不全量改弱。
// 风险提示，请先读完再用：
//   本版只降低触发概率，不是绕过检测。服务器会用真实怪物数据校验战斗结果，
//   客户端改弱后，伤害、时长、掉血、击杀数仍可能和服务器预期对不上。
//   高关卡仍有被判定异常战斗、重置关卡甚至更重处罚的风险。
//   主号慎用，建议小号先试；战斗时不要开倍速，不要用脚本连续推主线高关。
// 异常处理：响应为空或不是合法 JSON 时原样放行，不报错、不改写。

var body = $response.body;
if (!body) {
    $done({});
} else {
    try {
        let obj = JSON.parse(body);

        // 递归修改函数
        (function modify(node) {
            if (!node || typeof node !== 'object') return;

            // 找到关卡配置对象（包含 monsters 字段）
            if (Array.isArray(node.monsters)) {
                // 修改怪物参数：monster 数组格式为 [怪物ID, 难度等级, 出现数量]
                node.monsters.forEach(wave => {
                    if (Array.isArray(wave)) {
                        wave.forEach(monster => {
                            if (Array.isArray(monster) && monster.length >= 3) {
                                // 难度只在原值大于 3 时减 2，不降到 1
                                if (typeof monster[1] === 'number' && monster[1] > 3) monster[1] = monster[1] - 2;
                                // 出现数量不改
                            }
                        });
                    }
                });
            }

            // 递归遍历所有属性
            for (let key in node) {
                modify(node[key]);
            }
        })(obj);

        $done({ body: JSON.stringify(obj) });
    } catch (e) {
        $done({});
    }
}
