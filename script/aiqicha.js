// 爱企查 VIP 本地改写 v1.0.0（2026-10-26，豆包维护）
// 接口：GET aiqicha.baidu.com/usercenter/getvipinfoajax
// 做法：响应里的 svip 对象 status 0 -> 1、endTime -> 2099-12-31，App 本地显示为 SVIP。
// 仅本地显示生效：查企业高级信息等功能若走服务器校验，仍按真实会员判定，改显示改不出来。
// 其余响应原样放行；任何异常都原样放行，绝不弄坏 App。

// 手动运行/CRON 上下文没有 $request/$response：安静退出，不报错
if (typeof $request === "undefined" || typeof $response === "undefined") {
  console.log("[AiQiCha] 这是 http-response 改写脚本，靠爱企查的请求触发，不要手动运行。判断是否生效：进 App 我的页面看 SVIP 标识，或回日志列表找 Script Type 为 HTTP-RESPONSE 的本脚本记录。");
  $done({});
} else try {
  let body = $response && $response.body;
  if (!body) { $done({}); }
  else {
    let changed = false;

    // 首选：JSON 解析后改 svip（及同形 vip）字段
    try {
      let obj = JSON.parse(body);
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        for (const k of Object.keys(o)) {
          const v = o[k];
          if ((k === "svip" || k === "vip") && v && typeof v === "object" && "status" in v) {
            v.status = 1;
            if ("startTime" in v) v.startTime = "";
            if ("endTime" in v) v.endTime = "2099-12-31";
            changed = true;
          } else if (typeof v === "object") {
            walk(v);
          }
        }
      };
      walk(obj);
      if (changed) {
        console.log("[AiQiCha] rewritten: svip -> 2099-12-31");
        $done({ body: JSON.stringify(obj) });
      }
    } catch (e) {
      // 解析失败走字符串兜底
    }

    // 兜底：原文字符串替换（与上游 litieyin/AD_VIP 同款规则）
    if (!changed) {
      const replaced = body.replace(
        /"svip":\{"status":0,"startTime":"","endTime":""/,
        '"svip":{"status":1,"startTime":"","endTime":"2099-12-31"'
      );
      if (replaced !== body) {
        console.log("[AiQiCha] rewritten (fallback replace)");
        $done({ body: replaced });
      } else {
        $done({});
      }
    }
  }
} catch (e) {
  console.log("[AiQiCha] error: " + e);
  $done({});
}
