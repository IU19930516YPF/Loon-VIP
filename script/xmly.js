// 喜马拉雅 会员本地改写 v1.0.4（2026-10-22，豆包维护）
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
// v1.0.2 修复（依据 2026-10-22 用户真机抓包 481 条逐条 diff）：
//   ① homePage 的 vipInfo 实际只有 {isVip, jumpUrl, status:2, tip:"免费领取7天会员"}，根本没有
//      到期字段可推；个人页那张会员卡另有数据源 mobile-user/my/vip（cardInfo 的 strategyType
//      明写「我的页卡片」），v1.0.1 及所有公开脚本都没覆盖它——这是个人页仍显示促销的真因。
//   ② 本版新增 my/vip handler：每张卡 vipStatus→1、删 EXPIRED/NEVER 的 vipTraitType、清空
//      cardInfo 促销条目；新增会员聚合页 content/v1 handler：userInfo.vipStatus→1、
//      expireDate 推 999 天、VIP_CARD 模块 vipStatus→1 且「已过期」subTitle 改为有效期文案。
//   ③ homePage 的 vipInfo 额外删 tip/jumpUrl（促销文案与购买跳转）；status/vipStatus 数值
//      语义未经证实，本版只打 [XMLY] homediag 日志记录原值，不乱改，等真机结果再校准。
//   播放/专辑侧改写已由抓包 diff 实证无误（isPaid→false、isAuthorized→true 等），本版不动。
// v1.0.3 修复（决定性证据：把上游原脚本在本地沙箱对真机抓包 homePage 原始响应实跑一遍，
//   逐字段 diff 其输出，共 24 处）：个人页昵称旁的「白金V5 / SVIP」徽章由另一组字段驱动——
//   data.vipStatus→4、data.vLogoType→2、userGradeInfo.level→8（图标换 8 级图）、
//   vipInfo/svipInfo/platinumVipInfo 三块 status→4 且新增 level=5；光翻 isVip 不出徽章。
//   本版照此移植（patchHomeBadges）；上游顺带改的昵称/头像（品牌植入）与整删 serviceModule、
//   childTag 翻面一律不学——保留用户本人昵称头像与「我的服务」模块。
// v1.0.4（依据 2026-10-22 第二份抓包 686 条）：v1.0.3 真机结果——白金V5 徽章已出、
//   SVIP 蓝徽章未出；且已核实手机收到的 homePage 改写与上游输出逐字段一致，SVIP 徽章
//   不由 homePage 驱动。本版新增覆盖两个此前没人管的会员状态接口（抓包里均为全 false）：
//   会员中心 user/vip-info/v1（data.vips[] 按 vipType 逐项 vip 旗标，全翻 true）、
//   m 站 vip/check/user（data.isVip→true）。若 App 拼装头部徽章时读这两个接口，SVIP 徽章即出。
//   另：两份抓包（481+686 条，含冷启动）均无底部导航栏配置响应，全局开关
//   mobile_switch_ios 亦无 tab 开关——底部栏为 App 内置写死，改写插件动不了，不在本版范围。
// 校准方式：用完 App 后回 Loon 日志列表，找 Script Type 为 HTTP-RESPONSE 的本脚本记录，
//   里面有 [XMLY] v1.0.1 handler=xxx changed=N 字样即改写有落地；CRON 记录不算数。

const VERSION = "v1.0.6";
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
        const d = obj.data || {};
        const vi = d.vipInfo || {};
        console.log(`[XMLY] homediag vipStatus=${d.vipStatus} vipInfo.status=${vi.status} parentPaidStatus=${d.parentPaidStatus}`);
        changed += patchVip(obj);
        changed += patchHomeBadges(obj);
      }
      if (handler === "myvip") {
        changed += patchMyVip(obj);
      }
      if (handler === "vipagg") {
        changed += patchVipAgg(obj);
      }
      if (handler === "vipinfo") {
        changed += patchVipInfo(obj);
      }
      if (handler === "vipcheck") {
        changed += patchVipCheck(obj);
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
  if (u.indexOf("mobile-user/my/vip") !== -1) return "myvip";
  if (u.indexOf("business-vip-aggregation-channel-web/content") !== -1) return "vipagg";
  if (u.indexOf("business-vip-center-mobile-web/user/vip-info") !== -1) return "vipinfo";
  if (u.indexOf("/vip/check/user/") !== -1) return "vipcheck";
  if (u.indexOf("mobile-user/v2/homePage") !== -1) return "home";
  if (u.indexOf("product/detail/v1") !== -1) return "product";
  if (u.indexOf("v1/album/track/ts") !== -1) return "album";
  if (u.indexOf("mobile-playpage/track/v4/baseInfo/ts") !== -1) return "playpage";
  if (u.indexOf("mobile-playpage/playpage/track/qualityAndEffect") !== -1) return "quality";
  if (u.indexOf("mobile/download/v2/track") !== -1) return "download";
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

// 注：装扮改写（v1.0.5 的 decorationDetails 解锁）已按用户决定于 v1.0.6 撤销——
// 显示层可解锁，但佩戴请求被服务器按真实持有记录复核拒绝（真机报「系统异常」），
// 装扮持有是服务器记账，本地改写授予不了，不要再加回来。

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
      // v1.0.2：vipInfo 里的促销文案与购买跳转直接删，个人页卡片不再露促销
      if ((k === "tip" || k === "jumpUrl") && typeof v === "string") { delete o[k]; n++; hits.push(path + "." + k + "(del)"); continue; }
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

// myvip（mobile-user/my/vip）：个人页会员卡的真实数据源（2026-10-22 抓包实证，
// cardInfo.strategyType 明写「我的页卡片」）。data 是卡数组（VIP/儿童/SVIP/白金）：
// 每卡 vipStatus 0→1、删 EXPIRED/NEVER 的 vipTraitType、清空 cardInfo 促销条目。
// vipStatus=1 的语义属校准假设（0=非会员已由抓包证实），改动全打日志供下一轮定性。
function patchMyVip(root) {
  let n = 0;
  const cards = root && root.data;
  if (!Array.isArray(cards)) { console.log("[XMLY] myvip: data not array, skip"); return 0; }
  cards.forEach((c, i) => {
    if (!c || typeof c !== "object") return;
    if (typeof c.vipStatus === "number" && c.vipStatus !== 1) { c.vipStatus = 1; n++; console.log(`[XMLY] myvip card[${i}] vipType=${c.vipType} vipStatus->1`); }
    if (typeof c.vipTraitType === "string" && /(EXPIRED|NEVER)/.test(c.vipTraitType)) { delete c.vipTraitType; n++; console.log(`[XMLY] myvip card[${i}] vipTraitType(del)`); }
    if (Array.isArray(c.cardInfo) && c.cardInfo.length > 0) { c.cardInfo = []; n++; console.log(`[XMLY] myvip card[${i}] cardInfo cleared`); }
  });
  return n;
}

// vipagg（business-vip-aggregation-channel-web/content/v1）：会员聚合页。
// userInfo 是全站唯一带真 expireDate 的地方：vipStatus 3(过期)→1、expireDate 推 999 天；
// modules 里 VIP_CARD* 卡片同步翻 vipStatus，「已于…过期」的 subTitle 改成有效期文案。
function patchVipAgg(root) {
  let n = 0;
  const d = root && root.data;
  if (!d || typeof d !== "object") return 0;
  const ui = d.userInfo;
  if (ui && typeof ui === "object") {
    if (typeof ui.vipStatus === "number" && ui.vipStatus !== 1) { ui.vipStatus = 1; n++; console.log("[XMLY] vipagg userInfo.vipStatus->1"); }
    if (typeof ui.expireDate === "number" && ui.expireDate !== EXPIRE_MS) { ui.expireDate = EXPIRE_MS; n++; console.log("[XMLY] vipagg userInfo.expireDate->+999d"); }
  }
  if (Array.isArray(d.modules)) {
    const dt = new Date(EXPIRE_MS);
    const ds = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    d.modules.forEach((m, i) => {
      if (!m || typeof m !== "object" || typeof m.moduleType !== "string" || m.moduleType.indexOf("VIP_CARD") === -1) return;
      if (typeof m.vipStatus === "number" && m.vipStatus !== 1) { m.vipStatus = 1; n++; console.log(`[XMLY] vipagg module[${i}].vipStatus->1`); }
      if (typeof m.subTitle === "string" && /过期/.test(m.subTitle)) { m.subTitle = "有效期至 " + ds; n++; console.log(`[XMLY] vipagg module[${i}].subTitle->有效期至 ${ds}`); }
    });
  }
  return n;
}

// vipinfo（business-vip-center-mobile-web/user/vip-info/v1/<uid>）：会员中心的用户会员清单，
// data.vips[] 按 vipType 逐项给 vip 旗标（抓包实测 1/4/5 三项全 false）。全翻 true，
// 与其余接口的改写状态保持一致；App 若拼装头部 SVIP 徽章时读此接口，徽章即出。
function patchVipInfo(root) {
  let n = 0;
  const d = root && root.data;
  if (!d || !Array.isArray(d.vips)) return 0;
  d.vips.forEach((v) => {
    if (v && typeof v === "object" && v.vip === false) { v.vip = true; n++; console.log(`[XMLY] vipinfo vipType=${v.vipType} vip->true`); }
  });
  return n;
}

// vipcheck（m.ximalaya.com/vip/check/user/<uid>）：极简会员校验，data.isVip 翻 true。
function patchVipCheck(root) {
  let n = 0;
  const d = root && root.data;
  if (d && typeof d === "object" && d.isVip === false) { d.isVip = true; n++; console.log("[XMLY] vipcheck isVip->true"); }
  return n;
}

// homebadges（v1.0.3）：个人页昵称旁「白金V5 / SVIP」徽章的驱动字段。
// 依据：上游原脚本对真机抓包 homePage 原始响应的实跑 diff（24 处变化）逐字段核对——
// vipStatus 与三个 *Info.status 的有效值是 4（不是此前假设的 1），徽章还另需
// vLogoType=2、userGradeInfo.level=8 及配套图标、*Info 新增 level=5。
// 只移植徽章相关字段；昵称/头像/serviceModule/childTag 不动（保留用户本人信息与服务模块）。
function patchHomeBadges(root) {
  let n = 0;
  const d = root && root.data;
  if (!d || typeof d !== "object") return 0;
  if (typeof d.vipStatus === "number" && d.vipStatus !== 4) { d.vipStatus = 4; n++; }
  if (typeof d.vLogoType === "number" && d.vLogoType !== 2) { d.vLogoType = 2; n++; }
  const ug = d.userGradeInfo;
  if (ug && typeof ug === "object") {
    if (typeof ug.level === "number" && ug.level !== 8) { ug.level = 8; n++; }
    const icon8 = "https://imagev2.xmcdn.com/storages/25b2-audiofreehighqps/D2/85/GAqhQ6cL8dSjAAAMawOpSwKq.png!xmagick=webp";
    if (typeof ug.icon === "string" && ug.icon !== icon8) { ug.icon = icon8; n++; }
  }
  for (const key of ["vipInfo", "svipInfo", "platinumVipInfo"]) {
    const o = d[key];
    if (!o || typeof o !== "object") continue;
    if (typeof o.status === "number" && o.status !== 4) { o.status = 4; n++; }
    if (o.level !== 5) { o.level = 5; n++; }
  }
  if (n > 0) console.log("[XMLY] homebadges vipStatus=4 vLogoType=2 gradeLevel=8 vipLevel=5");
  return n;
}
