'use strict';
const origin='https://in.mesl.cloud';
const rules={
 10:['Shadowrocket',['请使用最新版 Shadowrocket，可以在 App Store 里更新。版本太旧（build 2860 以下）只能拿到部分节点。']],
 13:['Surfboard',['适用于 Android 9 及以上系统。','下面的安装包是 64 位（arm64-v8a）版本，只能装在 64 位安卓手机上。','需要 Surfboard 2.27.0 或更高版本，版本太旧拿不到新类型的节点。']],
 28:['节点拓扑结构',['第二、三张图里 类型 一列是测试当时使用的协议，不代表你的客户端现在拿到的协议。现在节点主要使用 anytls 协议，ss（Shadowsocks）协议已弃用。用第三方客户端的，请更新到最新版本，旧版本只能拿到 ss 节点。']],
 34:['Clash Verge',['适用于 macOS 10.15 及以上系统。','需要 Clash Verge 2.0.0 或更高版本，版本太旧拿不到新类型的节点。直接使用下面的安装包即可。']],
 39:['Surge',['请使用最新版 Surge，可以在 App Store 里更新。版本太旧（build 3105 以下）只能拿到部分节点。']],
 53:['Surge For Mac',['请使用最新版 Surge。版本太旧（build 9850 以下）只能拿到部分节点。可以在 Surge 主窗口 更多 → 授权 & 更新 里检查更新。']],
 57:['Mesl For OpenWrt',['OpenWrt 22.03 及以后版本，或 iStoreOS、ImmortalWrt 等基于 OpenWrt 的固件。','网页后台是老版 LuCI 的固件（Lean LEDE、QWRT 等，版本号形如 R25.8.8）也能用，装好后是同样的页面。','路由器 CPU 为 x86_64、ARM64 或 ARMv7。MIPS 架构（如 MediaTek MT7621）暂不支持。','OpenWrt 25 及以后的版本暂时不能安装 .ipk，请用文末的「附：命令行安装」。']],
 62:['Mesl For Android',['安卓手机或平板，Android 9 及以上。更早的系统即使能装上，也可能登录不了。']],
 65:['Mesl For Mac',['macOS 14 及以上。']],
 71:['Mesl For tvOS',['Apple TV，系统为 tvOS 17 及以上。','账号有有效的套餐。']],
 74:['Mesl For Merlin',['固件：koolcenter / koolshare 的 梅林改版固件 或 官改固件，版本 384 或更新，左侧菜单里有 软件中心。','不支持：华硕原厂固件、没有软件中心的官方梅林固件，以及 380 等老版本的梅林改版固件。','JFFS 可用空间约 15 MB。空间不够时，安装过程会直接提示。','插件只接管 IPv4 流量（见「常见问题」里的 IPv6 一条）。']],
 77:['Mesl For Linux',['64 位 x86 电脑（uname -m 显示 x86_64）。','Ubuntu 22.04 及以上、Debian 12 及以上、Fedora 36 及以上等带桌面的系统（需要 GLIBC 2.34 或更高）。','Ubuntu 20.04、Debian 11 等较旧的系统运行不了桌面版，请用命令行版。']],
 8:['Clash Verge',['支持 64 位 Windows 10 及以上系统。']],
 80:['Mesl For Android TV',['Android TV / Google TV 系统的电视或电视盒子，Android 9 及以上。','更早的系统即使能装上，也可能登录不了。','32 位和 64 位系统都能装，电视版安装包里都带了。','系统要带 VPN 功能。部分国产电视和盒子的定制系统去掉了 VPN 功能，装上以后连不上。这类设备可以改用 OpenWrt 或华硕梅林路由器插件，让家里所有设备都走 Mesl，教程见 Mesl For OpenWrt、Mesl For Merlin。']]
};
function extract(snapshot,{prior={}}={}){
 const u=new URL(snapshot.url);if(u.origin!==origin)throw Error('collector_origin_mismatch');const match=u.hash.match(/^#\/docs\/(\d+)$/),rule=match&&rules[match[1]];if(!rule)return null;
 const body=snapshot.body||snapshot.text||'',lines=body.split('\n').map(l=>l.trim()).filter(Boolean);if(lines[0]!=='返回文档'||lines[2]!==rule[0]||!/^更新于 \d{4}-\d{2}-\d{2}$/.test(lines[3]||'')||!rule[1].every(quote=>body.includes(quote)))return null;
 const old=(prior.coreInfo||prior).compatibility||{},observedAt=snapshot.observedAt||snapshot.capturedAt,sourceIds=[snapshot.evidenceId].filter(Boolean),scope=rule[0]+' · '+lines[1]+' · doc/'+match[1],observations=(old.conditionObservations||[]).filter(o=>o.scope!==scope),conditions=rule[1].map(quote=>'MESL站方文档【'+scope+'】称：'+quote);
 for(let i=0;i<rule[1].length;i++)observations.push({scope,quote:rule[1][i],conditions:[conditions[i]],pageUpdatedAt:lines[3].slice(4),observedAt,sourceUrl:snapshot.url,sourceIds});
 return{compatibility:{...old,status:'operator_requirements_observed',summary:old.summary||'MESL官方文档中的逐客户端适用条件；未进行安装、连接或性能实测。',requirements:[...new Set([...(old.requirements||[]),...conditions])],sourceIds:[...new Set([...(old.sourceIds||[]),...sourceIds])],observedAt:old.observedAt||observedAt,conditionObservations:observations,independentlyTested:false}};
}
function expectedHeading(url){const u=new URL(url);if(u.origin!==origin)return null;const id=u.hash.match(/^#\/docs\/(\d+)$/)?.[1];return rules[id]?.[0]||null;}
module.exports={origin,recordIds:['A017'],fields:['compatibility'],rules,expectedHeading,requiresPageUpdatedAt:true,extract};
