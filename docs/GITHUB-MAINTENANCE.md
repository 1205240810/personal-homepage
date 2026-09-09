# GitHub 维护与版本恢复

公开仓库：[1205240810/personal-homepage](https://github.com/1205240810/personal-homepage)。`main` 保存当前网站和独立学习案例；根目录的 `origin` 指向 GitHub。公开历史已清除实名、未确认草稿与私藏档案数据；完整原始历史保留在单独的私有备份中。

清理后的提交编号与原仓库不同。旧工作副本应先在本地备份未提交修改，再重新克隆公开仓库并逐项迁入需要保留的修改；不要把旧分支或旧标签推回公开仓库。

## 一次日常修改

先确认当前工作区没有未处理的修改，再同步远端并开一个短分支：

```sh
git status
git switch main
git pull --ff-only origin main
git switch -c codex/update-reading-notes
```

修改文章时保持已发布的 `id`、`slug` 不变。修改项目、场景或小游戏前，先阅读 [维护说明](MAINTENANCE.md) 中对应的文件入口。内容或功能变化时同步更新 README；暂未实现的想法写入设计记录，不能当作已上线功能。

```sh
npm run check
npm run build
git diff --stat
git diff
git status --short
```

核对文件，按本次实际修改指定路径提交。例如仅新增一篇文章：

```sh
git add content/posts/my-note.md
git commit -m "docs: 新增工程阅读笔记"
git push -u origin codex/update-reading-notes
```

然后在 GitHub 发起 Pull Request，说明修改原因、实际效果和检查结果。简单维护也可由本人直接提交 `main`；这里未配置自动合并或自动部署。

修改 Node 部署相关代码时，另外运行 `npm run build:node` 并检查服务端页面和接口；`npm run start:node` 运行该构建产物。

## 修改教学案例

案例有独立依赖，首次需在其目录运行 `npm ci`。之后可从仓库根目录检查：

```sh
npm run check:forest
npm run build:forest
```

修改场景节点、地面或障碍时，先在案例目录执行 `npm run maps`，将更新后的 `public/maps/*.json` 一起提交。不要用根目录的地图生成命令更新案例。

主站和案例各自的锁文件应随依赖变更提交。不要复制 `node_modules`，也不要让案例引用根目录的别名或服务端接口。

## 查看和运行历史版本

两处历史标签用于定位经过隐私清理的历史快照，不随新开发移动。清理改变了提交编号，因此文档通过标签引用版本：

| 标签 | 版本 |
| --- | --- |
| [`archive/forest-courtyard`](https://github.com/1205240810/personal-homepage/tree/archive/forest-courtyard) | 林间小院 |
| [`archive/river-journey`](https://github.com/1205240810/personal-homepage/tree/archive/river-journey) | 后来的河谷漫游 |

只想看代码，可以在 GitHub 的标签选择器切换，或使用：

```sh
git show archive/forest-courtyard:lib/world/registry.ts
git log --oneline --all
```

想对照完整旧站，使用另一个工作目录，保留当前主站的文件状态：

```sh
git worktree add --detach ../personal-homepage-forest-original archive/forest-courtyard
```

历史快照仍带有当时的站点配置和依赖，并不保证独立运行条件与今天相同。学习和动手修改优先使用已适配的 `examples/forest-courtyard/`；不要把旧快照直接覆盖到当前 `main`，也不要随意重新发布旧快照中的托管配置。

## 源码保存与网站发布

GitHub 保存公开源码和清理后的历史，网站另行部署。`git push` 不会改变当前线上版本，也不会改变原 Sites 站点仅所有者可访问的设置。本仓库未配置 GitHub Actions 部署；本地检查命令是当前的维护入口。

主站的 `.openai/hosting.json` 关联现有 Sites 托管项目。为另一个人复制项目时，应建立自己的托管配置，不能使用原项目身份。默认 `npm run build` 输出 Worker 版本；`npm run build:node` 输出独立 Node 版本，适合自有服务器。两种目标的构建目录会相互覆盖，发布前必须重新运行对应命令。

Node 版本关闭私藏接口，不依赖原 Sites 身份环境。Sites 私藏室另需本地密文、本人身份配置和独立密钥，详见 [私藏室维护](PRIVATE-VAULT.md)。学习案例只输出静态文件，且没有这些配置。

## 提交范围

- 可以提交：已审核的公开文章、源码、美术、公开来源记录、锁文件。
- 不提交：博客后台原始备份、私人原文、私藏密文 `lib/private-vault/archive.encrypted.json`、未确认草稿 `content/drafts/*.md`、密码和密钥、`.env*`、`.dev.vars*`、依赖、构建产物。
- 草稿与私藏数据仅在维护者本地保存，不属于公开源码。`.gitignore` 不会清除已经提交的文件或历史记录；误提交时应先停止推送并检查历史，不能只删除当前文件后继续公开。

根 `.gitignore` 与案例的独立目录边界已经覆盖以上本地产物。提交前仍需通过 `git status` 和差异确认实际文件，尤其是新增加的数据目录。
