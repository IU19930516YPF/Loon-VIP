// 喜马拉雅 会员本地改写 v1.0.1（2026-10-22，豆包维护）
// 机制依据：对 WeiGiegie/666 的 ximalaya.js 做反混淆分析后确认——原版是纯本地响应改写：
//   翻 isFree/isPaid 旗标、删 activityInfo 付费推广块、download 接口从原响应里挖出真实 playUrl 重包成已授权。
// 本版做同样的事，但：不改昵称/头像、不植入任何品牌；只动响应里已存在的字段，任何异常原样放行。
// 硬边界（先说清）：权益若被服务器复核（单独购买的专辑、儿童会员等）本地改写过不去；
//   音频地址以服务器下发响应里已有的为准，服务器没给的变不出来。
// v1.0.1 修复：v1.0.0 真机 home 接口 changed=6 但个人页不显示会员——原版 home 处理是「定向改
//   vipInfo 子对象的具体字段」（含一个 S3/S5 开头字符串改 S1 的操作），v1.0.0 只在「带 isVip 的
//   对象」里找到期字段，目标对象没命中。本版改为：定位所有名字含 vip/svip 的子对象，整体套用
//   会员字段集（旗标置 true、到期推 999 天、S[35]→S1、剩余天数 999），并打印命中的字段路径
//   [XMLY] vipfields: ... 供日志校准。
// 校准方式：用完 App 后回 Loon 日志列表，找 Script Type 为 HTTP-RESPONSE 的本脚本记录，
//   里面有 [XMLY] v1.0.1 handler=xxx changed=N 字样即改写有落地；CRON 记录不算数。

const VERSION = "v1.0.1";
const EXPIRE_MS = Date.now() + 999 * 86400000; // 会员到期：自今天起 999 天（毫秒）
const EXPIRE_S = Math.floor(EXPIRE_MS / 1000);

// 手动运行/CRON 上下文没有 $request/$response：安静退出，不报错
if (typeof $request === "undefined" || typeof $response === "undefined") {
  console.log("[XMLY] 这是 http-response 改写脚本，靠喜马拉雅的请求触发，不要手动运行。判断是否生效：用完 App 后回日志列表找 Script Type 为 HTTP-RESPONSE 的本脚本记录。");
  $done({});
} else try {
  const url = ($request && $request.url) || "";
  const body = $response && $response.body;
  if (!body) { $done({}); }
  else {
    const handler = route(url);
    let obj = null;
    try { obj = JSON.parse(body); } catch (e) { obj = null; }

    if (!obj || typeof obj !== "object") {
      // 非 JSON 兜底：只做原版同款的两个正则翻面，其余不动
      const nb = body
        .replace(/"isFree":(true|false|null|\d+)/g, '"isFree":true')
        .replace(/"isPaid":(true|false|null|\d+)/g, '"isPaid":false');
      if (nb !== body) {
        console.log(`[XMLY] ${VERSION} handler=${handler} regexflip`);
        $done({ body: nb });
      } else { $done({}); }
    } else {
      let changed = 0;
      changed += walk(obj);
      if (handler === "playpage" || handler === "download") {
        changed += ensureTrack(obj);
      }
      if (handler === "home") {
        changed += patchVip(obj);
      }
      if (changed > 0) {
        console.log(`[XMLY] ${VERSION} handler=${handler} changed=${changed}`);
        $done({ body: JSON.stringify(obj) });
      } else {
        console.log(`[XMLY] ${VERSION} handler=${handler} nochange`);
        $done({});
      }
    }
  }
} catch (e) {
  console.log("[XMLY] error: " + (e && e.message));
  $done({});
}

function route(u) {
  if (u.indexOf("mobile-user/v2/homePage") !== -1) return "home";
  if (u.indexOf("product/detail/v1") !== -1) return "product";
  if (u.indexOf("v1/album/track/ts") !== -1) return "album";
  if (u.indexOf("mobile-playpage/track/v4/baseInfo/ts") !== -1) return "playpage";
  if (u.indexOf("mobile-playpage/playpage/track/qualityAndEffect") !== -1) return "quality";
  if (u.indexOf("mobile/download/v2/track") !== -1) return "download";
  if (u.indexOf("decorationDetails/page") !== -1) return "skin";
  if (u.indexOf("mobile-album/album/plant/grass") !== -1) return "grass";
  if (u.indexOf("mobile-playpage/playpage/tabs/v2") !== -1) return "tabs";
  return "other";
}

// 通用深遍历：只翻已存在的权益旗标 + 删付费推广块（activityInfo / extraInfo）
function walk(o) {
  if (!o || typeof o !== "object") return 0;
  let n = 0;
  if (Array.isArray(o)) {
    for (const it of o) n += walk(it);
    return n;
  }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (k === "activityInfo" || k === "extraInfo") { delete o[k]; n++; continue; }
    if (k === "isPaid" && v !== false) { o[k] = false; n++; continue; }
    if (k === "isFree" && v !== true) { o[k] = true; n++; continue; }
    if (k === "isAuthorized" && v !== true) { o[k] = true; n++; continue; }
    // 原版 trackInfo 把 isVipFree 设 false：走「免费」路径而非「VIP 免费」路径，避免二次 VIP 校验
    if (k === "isVipFree" && v !== false) { o[k] = false; n++; continue; }
    if (k === "vipFreeType" && typeof v === "number" && v !== 1) { o[k] = 1; n++; continue; }
    if (k === "isVip" && v !== true) { o[k] = true; n++; continue; }
    if ((k === "isSvip" || k === "isSVIP" || k === "svip") && typeof v === "boolean" && v !== true) { o[k] = true; n++; continue; }
    n += walk(v);
  }
  return n;
}

// playpage/download：找到 trackInfo / albumInfo 时，缺失的授权字段补齐（原版重构响应就是这个形状）
function ensureTrack(root) {
  let n = 0;
  const visit = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(visit); return; }
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (k === "trackInfo" && v && typeof v === "object" && !Array.isArray(v)) {
        if (v.isFree !== true) { v.isFree = true; n++; }
        if (v.isAuthorized !== true) { v.isAuthorized = true; n++; }
        if (v.isPaid !== false) { v.isPaid = false; n++; }
        if (v.isVipFree !== false) { v.isVipFree = false; n++; }
      }
      if (k === "albumInfo" && v && typeof v === "object" && !Array.isArray(v)) {
        if (v.isPaid !== false) { v.isPaid = false; n++; }
        if (typeof v.vipFreeType === "number" && v.vipFreeType !== 1) { v.vipFreeType = 1; n++; }
        if (typeof v.status === "number" && v.status !== 1) { v.status = 1; n++; }
      }
      visit(v);
    }
  };
  visit(root);
  return n;
}

// home：定位所有「名字含 vip/svip 的子对象」（vipInfo / userVipInfo / svipInfo 等），
// 对其直接字段整体套用会员字段集；同时记录命中的字段路径打日志，供下一轮校准。
// 这是 v1.0.1 的关键修复：v1.0.0 只在带 isVip 的对象里找 expire 字段，没命中真正的会员信息块。
function patchVip(root) {
  let n = 0;
  const hits = [];
  const applySet = (o, path) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      const lk = k.toLowerCase();
      if (typeof v === "boolean" && /^is/.test(k) && v !== true) { o[k] = true; n++; hits.push(path + "." + k); continue; }
      if (typeof v === "number" && /(expire|endtime|deadline|validuntil)/.test(lk)) {
        const nv = v > 1e11 ? EXPIRE_MS : (v > 1e9 ? EXPIRE_S : v);
        if (nv !== v) { o[k] = nv; n++; hits.push(path + "." + k); }
        continue;
      }
      if (typeof v === "number" && /(remaindays|vipdays|memberdays|leftdays|totaldays)/.test(lk) && v !== 999) { o[k] = 999; n++; hits.push(path + "." + k); continue; }
      // 原版 home 有一步把 S3/S5 开头的字符串改成 S1 开头（疑为会员档位编码），照做
      if (typeof v === "string" && /^S[35]/.test(v)) { o[k] = "S1" + v.slice(2); n++; hits.push(path + "." + k); continue; }
      if (typeof v === "number" && /(type|status|level|grade)/.test(lk) && v === 0) { o[k] = 1; n++; hits.push(path + "." + k); continue; }
    }
  };
  const visit = (o, path) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((it, i) => visit(it, path + "[" + i + "]")); return; }
    for (const k of Object.keys(o)) {
      const v = o[k];
      const lk = k.toLowerCase();
      if (v && typeof v === "object" && !Array.isArray(v) && /(^|[^a-z])(s?vip)/.test(lk)) {
        applySet(v, path + "." + k);
      }
      visit(v, path + "." + k);
    }
  };
  visit(root, "$");
  if (hits.length) console.log("[XMLY] vipfields: " + hits.slice(0, 12).join(","));
  return n;
}
