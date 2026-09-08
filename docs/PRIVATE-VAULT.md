# 私藏室维护

入口位于旧纸库左侧书柜旁，或直接访问 `/vault`。锁门前只显示中性说明；通过本站主人 ChatGPT 身份和独立密码两项检查后，可进入第五张地图并阅读私人记录。刷新探索页面会回到门外，重新检查会话；不会从 localStorage 恢复解锁。

## 数据边界

2026-09-08 官方备份共79篇，74篇属于已核验公开清单。额外5篇全部保持私藏，其中4篇源权限为 OwnerByUser，1篇未在公开列表出现。该记录不因源权限字段为 Anonymous 就推断成已发布。3条短记录的原始占位正文也保留，不补写。

- 原始ZIP、SQLite、私文JSON、密码与密钥位于被Git忽略的 `content/backups/cnblogs-official-2026-09-08/`，不放 public，不上传原始备份。
- `lib/private-vault/archive.encrypted.json` 只有AES-256-GCM密文、随机IV和版本。标题、时间、权限、源地址、正文都在密文内。
- 私文不经过 `compile-content.mjs`、公开 `contentSource`、草稿预览、RSC props或文章静态页面。所有正文通过 `/api/vault/records` 服务端鉴权后返回；没有私密图片/附件，此次不启用R2。
- 五篇原始记录中3篇只有占位符，另1篇是短说明；正文按源数据保存。官方备份不含标签表，因此不编造私文标签。

## 权限与秘密

生产运行时使用 Sites secrets：`MECHA_VAULT_SECRET`（独立数据密钥、会话密钥、pepper、salt和密码派生记录），`MECHA_VAULT_OWNER_ID`（平台转发的本站专用主人ID）。密码为24随机字节编码，不复用博客园或ChatGPT密码。PBKDF2-SHA256 100,000轮适配Workers上限，配合高熵密码与平台本人权限；不支持任意短密码。

首次发布保持owner ID缺失，所有内容接口与正常登录均503。仅在原站owner-private外层不变时访问 `/api/vault/identity` 读取本人正常登录会话的平台ID；由维护者将其精确写入owner secret，再部署同一个版本应用新环境。owner配置后identity端点固定404。不能自动认领首个访问者，也不能用account ID、邮箱、客户端传入的身份或bypass token代替该身份验证。

服务端每个私密请求都校验平台本人ID和HMAC会话。cookie为HttpOnly、SameSite=Strict，HTTPS使用Secure和__Host前缀，两小时到期。退出会清除浏览器cookie与界面内存；无D1会话表，所以不承诺撤销已复制的会话token，其最多仍有效两小时，且必须同时来自同一平台本人账号。紧急作废所有会话可以轮换sessionKey。内存尝试计数仅用于缓冲误输，平台本人身份才是访问边界。

所有API返回no-store、noindex、no-referrer；POST/DELETE要求同源。后续主页公开时仍必须保留私藏室的本人ID检查和ChatGPT顶层登录入口，不得只留下密码或隐藏按钮。

## 更新与验证

`scripts/seal-private-content.mjs` 读取审核过的备份记录，清理HTML后加密。它会生成新的独立密码与密钥；更新时应显式安排轮换，并同步更新Sites secrets。不要在普通文章维护中随意运行它。原始文始终留在忽略目录中，修改后的内容先人工核对权限和数量。

本地 `.dev.vars` 被忽略，仅使用Sites开发模拟身份local_seedy。开发服务仅绑定127.0.0.1。`node scripts/check-private-vault.mjs` 从忽略备份读取本地密码，仅测试本机接口且不打印私人内容。生产发布后单独核验真实身份、密钥生效、Secure cookie、正确/错误密码及未登录拒绝。打包前检查客户端/公开索引/源码暂存不存在私文ID、标题、正文或秘密。
