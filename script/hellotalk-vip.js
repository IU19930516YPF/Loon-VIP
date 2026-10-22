// HelloTalk VIP 改写 · v13（铭牌佩戴 + 余额 + 首页HT币 + 兑换假成功）
// v13（2026-10-21）：顶部 $request 取值加 typeof 保护——手动运行/无请求上下文
// 时不再 ReferenceError，安静走请求分支 $done 放行（bbdanci v1.0.3 同款保护）。
// 在 v9（抓包实测版）基础上修复「我的铭牌」两个问题，依据 wear-logo 前端源码
// （ali-global-statics.hellotalk8.com/base/ui/static/index-CHjsyzR8EO.js 的
//  NameplateItem 组件 + index-Dzkw5OoTO9.js 的 vipLogo store）实测字段语义：
//  1) NaN 小时：前端用 item.remain_time（秒）算剩余时长，remain_time===-1 显示「永久」，
//     缺失则 undefined/3600 = NaN。目录项（vip_logo_list）根本没有归属字段，
//     v9 直接克隆 → 每项缺 expire_at / remain_time / reserve_end_time / is_wear / coins。
//     v10 克隆时补齐全部归属字段：remain_time=-1（永久）、expire_at/reserve_end_time=2099、
//     coins=0、is_wear、status（佩戴中=1，其余=2）。
//  2) 点「立即佩戴」没反应：佩戴是服务器动作 POST /virtual_business/v1/h5/use_backpack_props
//     {props_id, props_type:29}，服务器校验背包所有权；伪造的铭牌不在服务器背包里 → 请求被拒，
//     前端 catch 只记日志不弹提示 → 看上去没反应。v10 两段配合（仅本地显示层）：
//     - http-request 截获 use_backpack_props，把 props_id 存入 $persistentStore；
//     - http-response 把该接口响应改成成功 {code:0,status:0,msg:"ok",data:{}}，
//       前端随即本地切换 currentLogo 并重拉 user_vip_logo；
//     - user_vip_logo 改写时按存下的 props_id 标记佩戴中（无记录时默认「四葉草」id=171）。
//     注意：服务器端资料（别人看到的铭牌、原生 userinfo）不会变，重启后以服务器为准。
//  3) HT币/钻石余额（v11 新增，依据 2026-10-20 第二份抓包）：全包唯一带余额的接口是
//     GET /virtual_pay/v1/live_voice/settle_center/user_virtual_info（与首充礼包、钻石兑VIP
//     列表同批调用，即 HT币账户页的数据来源）。其 data 五个余额字段
//     total_diamond / remain_diamond / total_amount / remain_amount / user_virtual_val
//     一律改 999999；兑换比例类常数（usd_to_diamond、diamond_to_coin、min_* 等）不动，
//     以免破坏页面逻辑。同批抓包另证实：佩戴失败是 HTTP 200 + body code=100001，
//     正是 v10 伪造成功响应能对症处理的情况（非 HTTP 层拒绝）。
//  4) v12 新增（依据 2026-10-20 第三份抓包 + 用户 17:38 截图）：
//     - 首页（我页）左上角 HT币数字来源是 GET /virtual_pay/v1/query_user_virtual_val/{uid}
//       的 data.virtual_val（/profile/v2/me 里没有任何 coin/balance 字段）；改 999999。
//     - 兑换（settle_center/redeem_coin、redeem_vip）是带 sign 签名的服务器动作，
//       真实余额不足必被拒（err_coins_not_enough / err_vip_card_not_enough），真兑换做不到；
//       v12 仅把失败响应在本地改成成功（status:0），让 App 显示兑换成功——纯显示层，
//       币不会真到账、花不出去，服务器余额不变。
//     - 头像旁铭牌在「我」页/侧边栏不显示：那两处读的是 /profile/v2/userinfo（protobuf），
//       本 JSON 脚本改不了，属硬限制。

const URL = (typeof $request !== "undefined" && $request && $request.url) || "";
const EXP_SEC = 4102358400;     // 2099-12-31 00:00:00 UTC
const EXP_MS = 4102358400000;
const DATE_STR = "2099-12-31";
const DAYS_LEFT = 26735;
const WORN_KEY = "htvip_worn_props_id";

// ---------- 请求阶段（无 $response）：只处理佩戴请求，记录 props_id 后放行 ----------
if (typeof $response === "undefined") {
  try {
    if (/use_backpack_props/.test(URL)) {
      let pid = null;
      const rb = (typeof $request !== "undefined" && $request && $request.body) || "";
      try { const j = JSON.parse(rb); if (j && j.props_id != null) pid = Number(j.props_id); } catch (e) {}
      if (pid == null && rb) { const m = String(rb).match(/props_id["'=: ]+(\d+)/); if (m) pid = Number(m[1]); }
      if (pid == null) { const m2 = URL.match(/props_id=(\d+)/); if (m2) pid = Number(m2[1]); }
      if (pid != null && typeof $persistentStore !== "undefined") {
        $persistentStore.write(String(pid), WORN_KEY);
        console.log("HTVIP v12 WORN RECORDED: props_id=" + pid);
      }
    }
  } catch (e) {}
  $done({});
} else {
  // ---------- 响应阶段 ----------
  let body = $response.body;
  console.log("HTVIP v12 RUN: " + URL);

  // 佩戴接口：直接伪造成功（前端据此本地切换并重拉列表）
  if (/use_backpack_props/.test(URL)) {
    console.log("HTVIP v12 WEAR FAKE-SUCCESS");
    $done({ body: JSON.stringify({ code: 0, status: 0, msg: "ok", data: {} }) });
  } else if (/settle_center\/redeem_(coin|vip)/.test(URL)) {
    // 兑换接口：服务器必拒（真实余额不足+请求带签名），本地改成成功仅供 App 显示；
    // 币不会真到账，服务器余额不变。
    console.log("HTVIP v12 REDEEM FAKE-SUCCESS: " + URL);
    $done({ body: JSON.stringify({ status: 0, msg: "success", data: null }) });
  } else if (!body) {
    $done({});
  } else {
    try {
      let obj = JSON.parse(body);
      let changed = false;

      function setF(o, key, val) {
        if (o && typeof o === "object" && key in o && o[key] !== val) {
          console.log("SET " + key + ": " + JSON.stringify(o[key]) + " -> " + JSON.stringify(val));
          o[key] = val;
          changed = true;
        }
      }

      const data = obj && obj.data;
      let targeted = false;

      if (data && typeof data === "object") {
        if (/vip_attribute/.test(URL)) {
          targeted = true;
          setF(data, "is_vip", true);
          setF(data, "is_vip_plus", true);
        } else if (/vip_status/.test(URL)) {
          targeted = true;
          setF(data, "vip_status", 1);
          setF(data, "vip_plus_status", 1);
          setF(data, "vip_type", 2);
          setF(data, "expire_ts", EXP_SEC);
          setF(data, "plus_expire_ts", EXP_SEC);
        } else if (/vip_info/.test(URL)) {
          targeted = true;
          setF(data, "vip_expire", EXP_SEC);
          setF(data, "vip_type", 2);
          setF(data, "last_vip_type", 2);
          setF(data, "vip_plus_type", 2);
          setF(data, "vip_plus_expire", EXP_SEC);
          setF(data, "vip_stat", 1);
          setF(data, "visitor_expire_ts", EXP_SEC);
          setF(data, "learn_language_expire_ts", EXP_SEC);
          setF(data, "teach_language_expire_ts", EXP_SEC);
        } else if (/user_virtual_info/.test(URL)) {
          // HT币账户页余额来源（抓包唯一余额接口）：五个余额字段全改 999999，比例常数不动
          targeted = true;
          setF(data, "total_diamond", 999999);
          setF(data, "remain_diamond", 999999);
          setF(data, "total_amount", 999999);
          setF(data, "remain_amount", 999999);
          setF(data, "user_virtual_val", 999999);
          console.log("HTVIP v12 BALANCE SET: diamond/coin fields -> 999999");
        } else if (/query_user_virtual_val/.test(URL)) {
          // 首页（我页）左上角 HT币数字来源：data.virtual_val
          targeted = true;
          setF(data, "virtual_val", 999999);
          console.log("HTVIP v12 VIRTUAL_VAL SET: -> 999999");
        } else if (/user_vip_logo/.test(URL)) {
          targeted = true;
          setF(data, "vip_type", 2);
          const list = Array.isArray(data.vip_logo_list) ? data.vip_logo_list : [];

          // 决定佩戴中的铭牌：优先 $persistentStore 记录的 props_id，否则默认「四葉草」
          let wornId = null;
          try {
            if (typeof $persistentStore !== "undefined") {
              const saved = $persistentStore.read(WORN_KEY);
              if (saved != null && saved !== "") wornId = Number(saved);
            }
          } catch (e) {}
          let worn = null;
          if (wornId != null) {
            for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === wornId) { worn = list[i]; break; }
          }
          if (!worn) {
            for (let i = 0; i < list.length; i++) if (list[i] && list[i].name === "四葉草") { worn = list[i]; break; }
          }
          if (!worn && list.length > 0) worn = list[0];

          // 克隆目录项 → 补齐「已拥有」归属字段（字段集对齐前端默认铭牌样本与组件用法）
          if (Array.isArray(data.user_vip_logo_list) && list.length > 0) {
            data.user_vip_logo_list = list.map(function (src) {
              const it = JSON.parse(JSON.stringify(src));
              const isWorn = worn && it.id === worn.id;
              it.status = isWorn ? 1 : 2;              // 1=佩戴中（按钮置灰显示「佩戴中」），2=已拥有未佩戴
              it.is_wear = !!isWorn;                   // 前端点击守卫/状态判断用
              it.expire_at = EXP_SEC;                 // status!=2 时的日期显示字段（秒）
              it.reserve_end_time = EXP_SEC;          // status==2 时的日期显示字段（秒）
              it.remain_time = -1;                     // -1 = 永久（前端显示 unlimitedDays），杜绝 NaN
              it.coins = 0;                            // 归属对象字段（默认铭牌样本含此字段）
              return it;
            });
            changed = true;
            console.log("PLATE INJECT v12: " + list.length + " nameplates, worn id=" + (worn ? worn.id : -1));
          }

          if (worn) {
            setF(data, "vip_logo", worn.vip_logo || "");
            setF(data, "vip_logo_anim", worn.vip_logo_anim || "");
            setF(data, "is_default_vip_logo", false);
            console.log("PLATE EQUIP: " + worn.name + " id=" + worn.id);
          }
        }
      }

      if (!targeted) {
        // ---------- 通用深度遍历（其他接口，逻辑同 v9） ----------
        const AGGRO = /vip|member|privilege|profile|\/user|userinfo|myinfo/i.test(URL);
        function isExpiryKey(k) {
          return /expir|valid|until|due|deadline/.test(k) || /end_(time|date|at|day)/.test(k) || k === "end" || k === "exp";
        }
        function fixValue(path, key, val) {
          const k = key.toLowerCase();
          let nv = val;
          if (typeof val === "boolean") {
            nv = /expired|is_expire|has_expired|out_of_date/.test(k) ? false : true;
          } else if (typeof val === "number") {
            if (isExpiryKey(k)) nv = val > 1e11 ? EXP_MS : EXP_SEC;
            else if (/status|state/.test(k)) nv = 1;
            else if (/is|has|flag/.test(k)) nv = 1;
            else if (/level|grade/.test(k)) nv = Math.max(val, 1);
            else if (/type|kind/.test(k)) nv = val < 2 ? 2 : val;
            else if (/attr/.test(k)) nv = val === 0 ? 1 : val;
            else if (/days|remain|left/.test(k)) nv = DAYS_LEFT;
          } else if (typeof val === "string") {
            if (isExpiryKey(k) && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val)) {
              nv = val.replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/, DATE_STR);
            } else if (isExpiryKey(k) && /^\d{10}$/.test(val)) {
              nv = String(EXP_SEC);
            } else if (isExpiryKey(k) && /^\d{13}$/.test(val)) {
              nv = String(EXP_MS);
            } else if (/status|state/.test(k) && /^(0|false|no|none|expired)$/i.test(val)) {
              nv = "1";
            } else if (val.trim() === "VIP") {
              nv = "VIP+";
            }
          } else if (Array.isArray(val)) {
            if (/attr|rights|privilege|benefit/.test(k) && val.length === 0) nv = [1, 2, 3, 4, 5];
          }
          if (nv !== val) console.log("FIXED " + path + ": " + JSON.stringify(val) + " -> " + JSON.stringify(nv));
          return nv;
        }
        function walk(node, inVip, path) {
          if (Array.isArray(node)) {
            node.forEach(function (n, i) { walk(n, inVip, path + "[" + i + "]"); });
            return;
          }
          if (node && typeof node === "object") {
            Object.keys(node).forEach(function (key) {
              const k = key.toLowerCase();
              const active = inVip || /vip/i.test(key) || (AGGRO && isExpiryKey(k));
              if (active) {
                const nv = fixValue(path + key, key, node[key]);
                if (nv !== node[key]) { node[key] = nv; changed = true; }
              }
              walk(node[key], inVip || /vip/i.test(key), path + key + ".");
            });
          }
        }
        walk(obj, false, "");
      }

      if (changed) {
        console.log("URL: " + URL + " => body rewritten");
        $done({ body: JSON.stringify(obj) });
      } else {
        $done({});
      }
    } catch (e) {
      $done({});
    }
  }
}
