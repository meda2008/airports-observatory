# 扬帆 A049 路由与备用入口恢复（2026-11-19）

本轮原始队列auth_adapter_changed不是密码被拒：旧run8708a854-bf70-4286-93ce-92abe048342f在/error-page查三个控件均0。内置浏览器实际 /plan 正常到/login，可见同域邮箱/密码表单、记住密码、永久官网yangfanhome.com。没有在内置浏览器输入账号。

当前公开脚本保存在Oracle /collector-state/recovery-sources/yangfan-public-*.json，含原文、URL、SHA和采集时间。没有执行下载的脚本，没有照抄脚本列出的注册/重置/支付操作。表单精确选择器修正实跑d1595124-115f-4337-b016-2f5f299d89cc仍在凭据提交前跳错页。不能当作密码错误。

v131增加lib/blocked-read-origin.cjs：只记录已被拦GET/HEAD/OPTIONS fetch/xhr的origin、资源类型和方法；不导出路径、参数、头或正文，不放行任何请求。76相关检查通过；实跑0a68b593-cd3e-44a7-aa3e-dd1681cef757没有发现此类跨域阻塞，故“未批准API被拦”假说无当前证据，没有据此加域名白名单。

改为先/login的runbfcc6f00-8ca0-4d9a-9a7b-b94a890d7876记录context destroyed并在最终读取恢复正常登录表单，未提交凭据。v132仅对yangfanyun.net读取观察将上下文竞态重试由3增至6；纯读取，不刷新、不重复认证，语义/协议失败不重试，其他来源保持原预算。最终相关检查78/78通过；Oracle部署退出0。实跑3c98d4ab-f6de-43fa-a88f-5c4598b9988f仍在表单读取期间去/error-page，authControls前后不一致、无登录响应，不能宣称已修复完整链路。原失败保留，旧入口已禁用避免再跑。

改查原生永久官网：内置浏览器读取yangfanhome.com可用线路列表，随后站方自动选至 https://a02.yfy02.com/login，显示扬帆云并原生链接返回永久官网。该具体新凭据接收目的地已询问本次授权，等待回复；未向它提交邮箱/密码，未注册/改密/建单/付款。保持候选恢复入口，不能将导航证据当作法律经营主体的历史连续证明。

独立HTTP保存永久页HTML SHA eac33bf1e396e1ccc93c1e1ac2f57436c8e05d0a09956335cd2d0eea2fc60902及备用登录HTML SHA dd96fb78beba59c8a1d95d23f3ad66a4d8669d40acf4635c7d7bbdabe2065f7f，两次200；HTML本身不含候选列表，导航归属依据是上述实际内置浏览器渲染观察，不能声称这些静态HTML哈希单独证明迁移。

本轮没有新报价、没有发布套餐变更。BiuBiu、CyberGuard凭据断点不重试；Oix旧原文明确密码错误，未重试；Kuromis/TAG旧保护页不重复尝试。云图新后台授权仍待用户回复。
