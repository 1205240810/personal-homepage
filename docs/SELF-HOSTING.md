# 自有服务器部署与更新

主站使用 Node 服务端处理页面、文章接口与直接访问路由，由 Nginx 接收公网请求，systemd 管理进程。本文对应 Ubuntu 24.04 x86_64、Node.js 24.21.0 与 Nginx 1.24；它是操作说明，实际运行状态以服务和公网验证结果为准。

GitHub 推送不会自动更新服务器。每次发布固定一个已审核提交，构建成功后再切换版本。原 Sites 网站独立维护，访问范围仍由 Sites 设置控制。

## 环境与目录

Node 使用官方 Linux x64 包，安装路径为 `/opt/node-v24.21.0-linux-x64`。`node-v24.21.0-linux-x64.tar.xz` 的 SHA-256 应为：

```text
fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
```

下载来源及校验依据：[Node.js 官方校验清单](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt)。升级 Node 时，同时修改 [systemd 服务文件](../deploy/personal-homepage.service) 的路径并重新验证构建与运行。

使用无交互登录权限的系统用户 `mecha` 构建和运行网站。首次准备目录时执行以下命令；用户已经存在则跳过创建用户：

```bash
sudo useradd --system --user-group --home-dir /srv/personal-homepage --shell /usr/sbin/nologin mecha
sudo install -d -o mecha -g mecha /srv/personal-homepage /srv/personal-homepage/builds /srv/personal-homepage/releases
```

```text
/srv/personal-homepage/
├── builds/<shortSHA>/       固定提交的源码、依赖和构建过程
├── releases/<shortSHA>/     dist/standalone 的完整副本
└── current -> releases/...  当前运行版本
```

服务只需要发布目录；不要将源码目录、原始博客备份、草稿、`.dev.vars` 或私藏密文放入对外服务目录。Node 构建已关闭私藏功能，状态、登录、退出和记录接口返回 503，身份初始化接口返回 404，详见 [私藏室说明](PRIVATE-VAULT.md)。

## 构建一个版本

以下命令在服务器 Bash 中分段执行。将提交占位符替换为已审核的完整 SHA；每个版本使用新目录，已有版本不在原地重建：

```bash
mecha_revision='填写审核过的完整提交 SHA'
mecha_short="${mecha_revision:0:7}"
mecha_build="/srv/personal-homepage/builds/$mecha_short"
mecha_release="/srv/personal-homepage/releases/$mecha_short"

sudo -u mecha git clone --no-checkout https://github.com/1205240810/personal-homepage.git "$mecha_build"
sudo -u mecha git -C "$mecha_build" checkout --detach "$mecha_revision"
sudo -u mecha env PATH=/opt/node-v24.21.0-linux-x64/bin:/usr/bin:/bin npm --prefix "$mecha_build" ci
sudo -u mecha env PATH=/opt/node-v24.21.0-linux-x64/bin:/usr/bin:/bin npm --prefix "$mecha_build" run check
sudo -u mecha env PATH=/opt/node-v24.21.0-linux-x64/bin:/usr/bin:/bin npm --prefix "$mecha_build" run build:node
```

### 在腾讯控制台执行长任务

控制台“执行命令”的默认超时为 60 秒，安装依赖和构建应交给后台任务。源码准备好后，可用下面的单次任务替代上面三条 npm 命令；不要同时重复构建：

```bash
mecha_build_unit="personal-homepage-build-$mecha_short"
sudo systemd-run --no-block --unit="$mecha_build_unit" --uid=mecha --gid=mecha \
  --working-directory="$mecha_build" \
  --setenv=PATH=/opt/node-v24.21.0-linux-x64/bin:/usr/bin:/bin \
  --property=Type=oneshot --property=TimeoutStartSec=0 \
  --property=StandardOutput=journal --property=StandardError=journal \
  /bin/bash -c 'npm ci && npm run check && npm run build:node'
sudo journalctl -u "$mecha_build_unit" -n 100 --no-pager
```

任务提交成功不等于构建成功，随后按需读取日志，确认检查、构建和退出状态，再复制发布产物。控制台每次执行使用新的 shell；跨次操作需重新设置路径变量，并填写实际任务名查看日志。

### GitHub 下载缓慢时

内地服务器直接克隆较慢时，可以在本地从 GitHub 官方 codeload 下载**同一个固定提交**的源码包，再上传服务器。在本地终端设置已审核的完整 SHA：

```bash
mecha_revision='填写审核过的完整提交 SHA'
curl --fail --location --output "personal-homepage-$mecha_revision.tar.gz" \
  "https://codeload.github.com/1205240810/personal-homepage/tar.gz/$mecha_revision"
shasum -a 256 "personal-homepage-$mecha_revision.tar.gz"
```

记录 SHA-256。在 Lighthouse 实例详情的“文件管理”中，将源码包上传到服务器 `/tmp/`；操作入口见 [腾讯云文件管理文档](https://cloud.tencent.com/document/product/1207/127300)。服务器上重新设置同一提交及 build 路径变量，然后复核：

```bash
mecha_archive="/tmp/personal-homepage-$mecha_revision.tar.gz"
sha256sum "$mecha_archive"
```

只有与本地 SHA-256 完全一致才继续解包。校验用于确认传输完整性，源码来源仍以固定提交的官方 HTTPS 下载为准。使用新的空 build 目录；若先前克隆已留下文件，另选新目录，避免混入不完整源码：

```bash
sudo install -d -o mecha -g mecha "$mecha_build"
sudo tar -xzf "$mecha_archive" --strip-components=1 --no-same-owner -C "$mecha_build"
sudo chown -R mecha:mecha "$mecha_build"
```

这一步替代 `git clone` 和 `git checkout`，随后仍在服务器执行 `npm ci`、`npm run check`、`npm run build:node`，可使用上述后台任务。源码包没有 `.git`，发布记录应同时保留完整提交 SHA 与源码包校验值。

### 整理与验证发布产物

检查与构建均成功后复制完整产物；不能只复制 `server.js`，也不能使用默认 Worker 构建目录：

```bash
sudo install -d -o mecha -g mecha "$mecha_release"
sudo -u mecha cp -a "$mecha_build/dist/standalone/." "$mecha_release/"
```

先在临时本机端口试运行，保持此终端打开：

```bash
cd "$mecha_release"
sudo -u mecha env NODE_ENV=production HOST=127.0.0.1 PORT=3001 /opt/node-v24.21.0-linux-x64/bin/node server.js
```

另一个终端检查首页、工作台、正文和接口；完成后在试运行终端按 Ctrl+C 停止临时服务：

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/workbench
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/posts/icpc-2022-hefei
curl -i http://127.0.0.1:3001/api/vault/session
curl -i http://127.0.0.1:3001/api/vault/identity
```

前三项应返回 200；后两项分别为 503 和 404。还应检查文章数量、页面图片及浏览器中的目录切换、正文刷新与探索入口。测试通过后再切换 `current`。

## 首次启动与反向代理

以下公网启动步骤用于已完成备案的内地网站；备案前仅在本机或受限内网验证。将 [Nginx HTTP 配置样例](../deploy/nginx.conf.example) 中的 `example.com` 改成已备案域名。先检查已有站点配置，保留其他业务；若仅有系统默认欢迎页，可以禁用其 `sites-enabled/default` 链接。安装本项目配置：

```bash
sudo install -m 644 "$mecha_build/deploy/personal-homepage.service" /etc/systemd/system/personal-homepage.service
sudo install -m 644 "$mecha_build/deploy/nginx.conf.example" /etc/nginx/sites-available/personal-homepage
sudoedit /etc/nginx/sites-available/personal-homepage
sudo ln -s /etc/nginx/sites-available/personal-homepage /etc/nginx/sites-enabled/personal-homepage
sudo nginx -t
```

配置检查通过后，将已验证版本设为当前版本并启动：

```bash
sudo ln -sfn "$mecha_release" /srv/personal-homepage/current.next
sudo mv -Tf /srv/personal-homepage/current.next /srv/personal-homepage/current
sudo systemctl daemon-reload
sudo systemctl enable --now personal-homepage.service
sudo systemctl reload nginx
sudo systemctl status personal-homepage.service --no-pager
```

Nginx 将请求交给 `127.0.0.1:3000`，保留真实 Host 和来源协议，覆盖转发地址并清除平台身份请求头。样例关闭代理缓冲以传递流式响应，不添加 SPA 回退或通用缓存；页面和 API 继续由 Node 处理。配置项依据：[Nginx 官方代理模块文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。

网站的 HTTP 测试只需确认云防火墙和系统防火墙允许 TCP 80；现有规则已允许时不重复修改。3000 仅监听本机，无需向公网开放。原有管理端口规则另行保留。

## 验证、更新与回滚

备案完成且域名解析生效后，从另一台设备访问网站域名（启用 TLS 后使用 `https://你的域名/`），验证工作台、文章直链、刷新、图片、音乐与探索页。再检查 `/api/vault/session` 为 503、`/api/vault/identity` 为 404；无此服务时不应显示可解锁状态。公网能打开 Nginx 默认页只能证明 80 端口可达，不能算网站部署完成。

查看实际进程、监听端口与近期日志：

```bash
sudo systemctl status personal-homepage.service --no-pager
sudo ss -lntp
sudo journalctl -u personal-homepage.service -n 80 --no-pager
sudo tail -n 50 /var/log/nginx/error.log
```

日常更新重复“构建一个版本”的步骤，验证新发布目录后，用上述 `current.next` 与 `mv -Tf` 命令切换链接，再执行：

```bash
sudo systemctl restart personal-homepage.service
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/workbench
```

更新只需重启 Node；仅修改 Nginx 配置时才重新执行 `nginx -t` 和 reload。若修改了服务文件，还需重新安装该文件并执行 `systemctl daemon-reload`。单进程重启会有短暂中断，不承诺无缝发布。

保留上一个已验证的 release。若新版本异常，将 `mecha_rollback` 替换为旧目录后回滚：

```bash
mecha_rollback='/srv/personal-homepage/releases/旧版本短SHA'
sudo ln -sfn "$mecha_rollback" /srv/personal-homepage/current.next
sudo mv -Tf /srv/personal-homepage/current.next /srv/personal-homepage/current
sudo systemctl restart personal-homepage.service
```

回滚前确认目标目录内有完整 `server.js` 及其运行依赖；回滚后重新验证本机和公网页面。构建源码可以在发布稳定后按需清理，当前与上一版运行目录应保留。

## 域名与 HTTPS

正式入口为 [tscjj.com](https://tscjj.com/)，`www` 统一跳转到根域。2026-09-28 已确认备案通过，编号为「晋ICP备2026014170号-1」，HTTPS、公网跳转及包含 Nginx 重载的续期演练均已验证。备案链接由 `components/icp-filing-link.tsx` 统一维护；复制本站部署时应换成自己的备案信息。

**公网 IP 不免备案。** 内地服务器上的网站通过域名或公网 IP 提供服务，都需要完成备案；首次备案审核期间不应提前开放网站解析。备案前可继续在回环地址测试。见 [腾讯云备案场景](https://cloud.tencent.com/document/product/243/18910) 与 [审核要求](https://cloud.tencent.com/document/product/243/19650)。

### 解析与证书验证

以下用 `example.com` 表示自己的已备案域名。先确认腾讯云备案状态正常、接入服务器一致，再添加 `@` 的 A 记录指向服务器公网 IPv4，`www` 的 CNAME 记录指向根域。不要保留指向旧服务器的冲突记录；未配置 IPv6 时不要添加 AAAA。当前本站对应 `@ A 82.156.194.8`、`www CNAME tscjj.com`。

云防火墙与系统防火墙只需放行网站 TCP 80、443；Node 3000 保持回环监听。保留原 SSH、隧道服务及其端口和规则，域名配置无需修改 `sshd_config`。

本站实际域名配置为 `/etc/nginx/sites-available/tscjj-domain`，`personal-homepage` 是保留的旧 IP 站点。后续域名维护只修改 `tscjj-domain`，不覆盖旧 IP 配置，也不要另建包含相同 `server_name` 的已启用站点。其他部署先核对 `sites-enabled` 的链接目标，选择实际域名配置文件。

首次签发前只启用 HTTP：在上述域名站点中将 `server_name` 设为根域和 `www`，加入以下例外路径，保留原反代。此时不要启用引用不存在证书的 443 配置：

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    default_type text/plain;
    try_files $uri =404;
}
```

```bash
sudo install -d -m 755 /var/www/letsencrypt/.well-known/acme-challenge
sudo nginx -t && sudo systemctl reload nginx
printf 'acme-check\n' | sudo tee /var/www/letsencrypt/.well-known/acme-challenge/check
```

从外网访问两个域名的 `http://域名/.well-known/acme-challenge/check`，均应得到 `acme-check`，之后删除此测试文件。安装 Ubuntu 的 Certbot 包并签发，按提示填写维护邮箱和确认服务条款；已安装时不要重复安装不同来源的版本：

```bash
sudo apt-get update
sudo apt-get install certbot
sudo certbot certonly --webroot -w /var/www/letsencrypt \
  --cert-name example.com -d example.com -d www.example.com
sudo certbot certificates
```

这是 [Certbot webroot 验证](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot)，不需要停止 Nginx，也不自动改写站点。确认正式证书同时覆盖两个域名，使用输出中的实际证书路径；证书私钥和 ACME 账户不进入仓库。

### 切换 HTTPS 与回滚

首次从 HTTP 切换前，备份实际域名站点；本站已经完成切换，维护时不要用现有 HTTPS 配置覆盖原 HTTP 回滚备份。以下变量在本站指向 `tscjj-domain`，其他部署应替换为前面核实的实际文件：

```bash
mecha_nginx_site='/etc/nginx/sites-available/tscjj-domain'
sudo cp -an "$mecha_nginx_site" "$mecha_nginx_site.before-https"
```

把 [HTTPS 样例](../deploy/nginx.https.conf.example) 的所有 `example.com` 替换为自己的域名，核对证书路径后覆盖 `$mecha_nginx_site`；沿用它原有的 `sites-enabled` 链接。HTTP 与 HTTPS 两份样例不能同时启用，也不要覆盖旧 IP 站点。**证书文件必须先存在，才能执行 HTTPS 配置检查。**

安装 [代理信任 drop-in](../deploy/personal-homepage-proxy.conf.example)，让 Node 识别 Nginx 提供的 HTTPS 协议。它要求 Node 仅监听 `127.0.0.1`，并由 Nginx 覆盖转发头、清除平台身份头；不可用于直接暴露公网的 Node 服务。

```bash
sudo install -d /etc/systemd/system/personal-homepage.service.d
sudo install -m 644 "$mecha_build/deploy/personal-homepage-proxy.conf.example" \
  /etc/systemd/system/personal-homepage.service.d/https-proxy.conf
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl restart personal-homepage.service
sudo systemctl reload nginx
```

检查主域首页、工作台、文章直链和接口；HTTP 根域、HTTP/HTTPS `www` 应返回 308，并保留原路径及查询参数，例：`http://www.example.com/workbench?from=check` → `https://example.com/workbench?from=check`。ACME 验证路径继续直接由 80 端口服务，供后续续期使用。

若 `nginx -t` 失败，不要 reload，先恢复备份再检查。切换后异常也可将 `$mecha_nginx_site.before-https` 恢复到 `$mecha_nginx_site`，通过 `nginx -t` 后 reload；HTTP 回滚备份不能包含强制 HTTPS 跳转。此时先用全新客户端验证 HTTP，已有浏览器可能缓存 308。仅网站版本异常则按前面的 release 回滚步骤处理，不必改 DNS 或原 SSH 隧道。

### 自动续期

续期后需要先检查 Nginx 配置，再重载证书。**本站已在签发时通过 `--deploy-hook` 注册等价命令，保存在 `/etc/letsencrypt/renewal/tscjj.com.conf` 的 `renew_hook` 中；保持此配置，不再安装全局重载脚本。**

其他尚未配置续期钩子的部署，可安装仓库的 [续期后重载脚本](../deploy/certbot-reload-nginx.sh)。证书级钩子与下面的目录脚本二选一，避免同一次续期重复执行。本站跳过以下安装步骤：

```bash
sudo install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
sudo install -m 755 "$mecha_build/deploy/certbot-reload-nginx.sh" \
  /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
```

以下对应 Ubuntu apt 安装的 `certbot.timer`；使用其他安装方式时先核对实际定时任务，避免重复配置。本站证书名使用 `tscjj.com`，其他部署替换为自己的证书名：

```bash
sudo systemctl enable --now certbot.timer
sudo systemctl list-timers certbot.timer --all
sudo certbot renew --cert-name example.com --dry-run --run-deploy-hooks
```

演练使用测试签发，不替换正式证书；`--run-deploy-hooks` 同时验证重载流程。应确认命令成功结束、查看 `journalctl -u certbot.service` 与 `/var/log/letsencrypt/letsencrypt.log`，再记录验收结果。仅看到 timer 已启用或命令已开始，都不代表续期验证通过。端口 80、DNS 和验证目录需持续可用。参见 [Certbot 续期说明](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)。
