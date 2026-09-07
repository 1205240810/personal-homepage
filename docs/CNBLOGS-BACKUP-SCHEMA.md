# 博客园官方备份 schema：已确认与未知

只查看官方公开来源，无账号请求，无站点修改。

## 可以确认的 SQLite 字段

官方仓库 `cnblogs/vscode-cnb`，固定提交 `3838c373338ad5a1376cb6223000e6e2b61d4890`。

[官方 SQLite reader](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/src/service/blog-export/blog-export-post.store.ts) 将 Sequelize 模型绑定到表 **`blog_Content`**：

| SQLite 列 | 模型字段 | 已知用途 |
| --- | --- | --- |
| `Id` | id | 文章源 ID、主键 |
| `Title` | title | 原标题 |
| `BlogId` | blogId | 源博客 ID |
| `DateAdded` | datePublished | 原始日期 |
| `DateUpdated` | dateUpdated | 更新日期 |
| `IsMarkdown` | isMarkdown | 正文格式布尔值 |
| `AccessPermission` | accessPermission | 访问权限数值 |
| `EntryName` | entryName | 可空名称 |
| `PostType` | postType | ORM 枚举为 `BlogPost` 或 `Article` |
| `Body` | body | 完整原始正文 |

官方阅读器按 `IsMarkdown` 把 Body 作为 Markdown 或 HTML 打开：[查看正文实现](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/src/cmd/blog-export/view-post.ts)。因此不能把所有 Body 都当 HTML 或都当 Markdown。

上面的 reader 自己仅列 `BlogPost` 且 limit=1000。这个界面限制不应复制到全量迁移工具。`Article` 需要在导入报告中明确列出并根据用户内容范围处理。另一个 ExportPost TypeScript type 却写了 `BlogPost | Message`，与 ORM 不完全一致，故运行时应检查实际 PostType，未知类型进入报告，不能静默丢弃。

## 访问权限与发布状态

[官方 Post 模型](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/src/model/post.ts) 定义：

- 0：undeclared，界面显示所有人。
- 8：authenticated，仅登录用户。
- 268435456：owner，仅自己。
- 134217728：private。

[官方权限选择控件](https://github.com/cnblogs/vscode-cnb/blob/3838c373338ad5a1376cb6223000e6e2b61d4890/ui/post-cfg/components/select/PermissionSelect.tsx) 印证前三项。

**AccessPermission=0 不能单独证明已发布。** 官方 Post 模型还有独立 `isDraft`、`isPublished` 和 `password`，但 SQLite reader 未映射这些字段。原备份里是否另有这些列尚不明确。

## 尚不能确认

- 官方 JSON 备份的根对象、大小写和文章数组字段。官方文章仅确认支持 JSON/XML，没有公布 wire schema。
- SQLite 中标签、分类及其关联表的名称和列。官方 reader 没有读取它们。
- DateAdded/DateUpdated 在实际备份里的时区和序列化精度。
- 密码访问、草稿和删除文章在备份中的完整表示。
- 本次用户实际备份是否与上述当前官方客户端 schema 相同。

已检查官方 vscode-cnb 当前树、官方 CLI 树和 BlogServer 仓库；没有找到可确认以上未知项的导出器实现。

## 足够保守的 importer

可以基于上述已知列实现 **SQLite 只读提取**，先检查表和列，再写一个站点目录外的待核对文章包与数量报告；缺少必需列时报告差异。保留每条原始记录及 sourceId，不覆盖备份。

对于已知三篇 ID，保留已有稳定 slug、来源、标签和发布状态。对新记录，不根据 AccessPermission 单独发布；无法确认状态时保留为待核对草稿。非公开访问记录不进入公开文章包。未知标签 schema 用报告说明，不伪称标签保留完整。

在没有真实用户备份之前，JSON 导入只宜明示为自有规范化格式，不能称为「博客园官方 JSON 格式导入器」。

备份格式能力来源：[博客园官方备份公告](https://www.cnblogs.com/cmt/p/17240655.html)。
