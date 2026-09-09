# GitHub 维护与版本恢复

仓库：[1205240810/personal-homepage](https://github.com/1205240810/personal-homepage)，当前为私有。`main` 保存当前网站和独立学习案例；根目录的 `origin` 指向 GitHub。既有开发提交全部保留。

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

## 修改教学案例

案例有独立依赖，首次需在其目录运行 `npm ci`。之后可从仓库根目录检查：

```sh
npm run check:forest
npm run build:forest
```

修改场景节点、地面或障碍时，先在案例目录执行 `npm run maps`，将更新后的 `public/maps/*.json` 一起提交。不要用根目录的地图生成命令更新案例。

主站和案例各自的锁文件应随依赖变更提交。不要复制 `node_modules`，也不要让案例引用根目录的别名或服务端接口。

## 查看和运行历史版本

两处历史标签用于定位原始快照，不随新开发移动：

| 标签 | 原始提交 | 版本 |
| --- | --- | --- |
| `archive/forest-courtyard` | `archive/forest-courtyard` | 林间小院 |
| `archive/river-journey` | `archive/river-journey` | 后来的河谷漫游 |

只想看代码，可以在 GitHub 的标签选择器切换，或使用：

```sh
git show archive/forest-courtyard:lib/world/registry.ts
git log --oneline --all
```

想对照完整旧站，使用另一个工作目录，保留当前主站的文件状态：

```sh
git worktree add --detach ../personal-homepage-forest-original archive/forest-courtyard
```

原始快照仍带有当时的站点配置和依赖，并不保证独立运行条件与今天相同。学习和动手修改优先使用已适配的 `examples/forest-courtyard/`；不要把旧快照直接覆盖到当前 `main`，也不要随意重新发布旧快照中的托管配置。

## 源码保存与网站发布

GitHub 保存源码和历史，Sites 负责现有网站托管。`git push` 不会改变当前线上版本。本仓库未配置 GitHub Actions 部署；本地检查命令是当前的维护入口。

主站的 `.openai/hosting.json` 关联现有托管项目。为另一个人复制项目时，应建立自己的托管配置，不能使用原项目身份。主站需要 Worker 服务端运行时，私藏室另需本人身份配置和独立密钥，详见 [私藏室维护](PRIVATE-VAULT.md)。学习案例只输出静态文件，且没有这些配置。

## 提交范围

- 可以提交：已审核的公开文章、待核对草稿及其明确状态、源码、美术、来源记录、锁文件、密文档案。
- 不提交：博客后台原始备份、私人原文、密码和密钥、`.env*`、`.dev.vars*`、依赖、构建产物。
- 草稿保留在源码供编辑，正式构建自动排除；GitHub 仓库可见性与网站发布范围是两套独立设置。改变仓库可见性前应重新审阅完整历史和素材授权。

根 `.gitignore` 与案例的独立目录边界已经覆盖以上本地产物。提交前仍需通过 `git status` 和差异确认实际文件，尤其是新增加的数据目录。
