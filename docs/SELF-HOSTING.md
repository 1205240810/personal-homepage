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

将 [Nginx 配置样例](../deploy/nginx.conf.example) 中的 `example.com` 改成测试用公网 IP 或已备案域名。先检查已有站点配置，保留其他业务；若仅有系统默认欢迎页，可以禁用其 `sites-enabled/default` 链接。安装本项目配置：

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

从另一台设备访问 `http://服务器公网IP/`，验证工作台、文章直链、刷新、图片、音乐与探索页。再检查 `/api/vault/session` 为 503、`/api/vault/identity` 为 404；无此服务时不应显示可解锁状态。公网能打开 Nginx 默认页只能证明 80 端口可达，不能算网站部署完成。

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

公网 IP 的 HTTP 地址适合先验证功能。中国内地服务器正式使用域名提供网站服务前，需要完成备案；域名解析到服务器后配置证书和 Nginx HTTPS，再开放 443，并将 HTTP 跳转至 HTTPS。备案要求以 [腾讯云官方说明](https://cloud.tencent.com/document/product/243/19630) 为准。

本仓库的样例仅包含 HTTP 配置，证书和域名需要按实际资源补充。GitHub 公开、服务器公网访问和原 Sites 访问设置是三项独立操作。
