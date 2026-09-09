# 私藏室维护

入口位于旧纸库左侧书柜旁，或直接访问 `/vault`。公开仓库仅保留界面与访问控制代码，私藏档案数据不上传 GitHub。缺少数据或必要配置时，入口显示不可用，不影响公开文章。

Sites 版本配置完整后，通过本站主人 ChatGPT 身份和独立密码两项检查，才可进入第五张地图并阅读私人记录。刷新探索页面会回到门外，重新检查会话；不会从 localStorage 恢复解锁。独立 Node 部署关闭此功能，见下文。

## 数据边界

官方备份中不属于已核验公开清单的记录全部保持私藏。不能仅因源权限字段为 Anonymous 就推断记录已发布；原始占位正文按原样保存，不补写。

- 原始ZIP、SQLite、私文JSON、密码与密钥位于被Git忽略的 `content/backups/cnblogs-official-2026-09-08/`，不放 public，不上传原始备份。
- `lib/private-vault/archive.encrypted.json` 只有AES-256-GCM密文、随机IV和版本。标题、时间、权限、源地址、正文都在密文内。**此文件同样被 Git 忽略，并已从公开历史移除**；加密不意味着可以将它上传公开仓库。
- `archive.ts` 可选读取本地密文。公开克隆不含此文件，也能构建；Sites 内容接口在缺少密文时返回503，身份初始化接口返回404。
- 私文不经过 `compile-content.mjs`、公开 `contentSource`、草稿预览、RSC props或文章静态页面。所有正文通过 `/api/vault/records` 服务端鉴权后返回；没有私密图片/附件，此次不启用R2。
- 正文按源数据保存。官方备份不含标签表，因此不编造私文标签。

## Sites 权限与秘密

Sites 运行时使用 secrets：`MECHA_VAULT_SECRET`（独立数据密钥、会话密钥、pepper、salt和密码派生记录），`MECHA_VAULT_OWNER_ID`（平台转发的本站专用主人ID）。密码为24随机字节编码，不复用博客园或ChatGPT密码。PBKDF2-SHA256 100,000轮适配Workers上限，配合高熵密码与平台本人权限；不支持任意短密码。

首次发布保持owner ID缺失，所有内容接口与正常登录均503。仅在原站owner-private外层不变时访问 `/api/vault/identity` 读取本人正常登录会话的平台ID；由维护者将其精确写入owner secret，再部署同一个版本应用新环境。owner配置后identity端点固定404。不能自动认领首个访问者，也不能用account ID、邮箱、客户端传入的身份或bypass token代替该身份验证。

服务端每个私密请求都校验平台本人ID和HMAC会话。cookie为HttpOnly、SameSite=Strict，HTTPS使用Secure和__Host前缀，两小时到期。退出会清除浏览器cookie与界面内存；无D1会话表，所以不承诺撤销已复制的会话token，其最多仍有效两小时，且必须同时来自同一平台本人账号。紧急作废所有会话可以轮换sessionKey。内存尝试计数仅用于缓冲误输，平台本人身份才是访问边界。

Sites 私藏API返回no-store、noindex、no-referrer；POST/DELETE要求同源。后续 Sites 主页公开时仍必须保留私藏室的本人ID检查和ChatGPT顶层登录入口，不得只留下密码或隐藏按钮。

## 独立 Node 部署

`npm run build:node` 将私藏服务端模块替换为 `disabled-server.ts`：状态、登录、退出和记录接口均返回503，身份初始化接口返回404。构建不包含本地密文，也不读取 Sites 私藏 secrets。`/vault` 可以展示中性提示，但不能解锁或返回私人记录。

自有服务器没有 Sites 平台提供的可信身份入口，不能直接信任访客提交的 `oai-authenticated-user-id` 请求头，也不能只复制密钥便恢复私藏室。未来如需在自有服务器启用，应先建立独立的服务端身份验证与数据存储方案，并单独验证访问边界。当前部署只提供公开文章与作品。

## 更新与验证

`scripts/seal-private-content.mjs` 读取审核过的备份记录，清理HTML后加密。它会生成新的独立密码与密钥；更新时应显式安排轮换，并同步更新Sites secrets。不要在普通文章维护中随意运行它。原始文始终留在忽略目录中，修改后的内容先人工核对权限和数量。更新密文后先用 `git check-ignore` 确认其仍被忽略，不使用 `git add -f` 强制提交。

本地 `.dev.vars` 被忽略，仅使用Sites开发模拟身份local_seedy。开发服务仅绑定127.0.0.1。`node scripts/check-private-vault.mjs` 从忽略备份读取本地密码，仅测试本机接口且不打印私人内容。生产发布后单独核验真实身份、密钥生效、Secure cookie、正确/错误密码及未登录拒绝。打包前检查客户端/公开索引/源码暂存不存在私文ID、标题、正文或秘密。
