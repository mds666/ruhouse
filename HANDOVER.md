# Rubbish House / 垃圾房子 交接文档

更新时间：2026-11-21  
交接包版本：1.0

---

## 1. 项目是什么

垃圾房子（Rubbish House / ruhouse）是一个匿名租房避雷网站。

用户可以：

- 匿名发布房间记录
- 上传房间照片
- 写房间异味、霉斑、漏水、身体反应
- 点赞、评论
- 按城市区域、地铁站、公交站等关键词搜索
- 绑定邮箱，换设备后找回自己的记录

管理员可以：

- 审核帖子
- 通过、退回、删除帖子
- 审核被举报评论
- 查看已注册邮箱
- 删除邮箱账号（帖子保留）

所有公开内容必须经过管理员审核。  
网站固定文案：

> 垃圾房子是一个帮后来者避坑的地方，不是用来曝光或攻击任何人的工具。

---

## 2. 线上地址

| 项目 | 地址 |
| --- | --- |
| 正式网站 | https://cozy-dodol-24777a.netlify.app |
| 管理员后台 | https://cozy-dodol-24777a.netlify.app/admin.html |
| 排行榜 | https://cozy-dodol-24777a.netlify.app/leaderboard.html |
| 避雷墙 | https://cozy-dodol-24777a.netlify.app/wall.html |
| GitHub 仓库 | https://github.com/mds666/ruhouse |
| Netlify 项目 | https://app.netlify.com/projects/cozy-dodol-24777a/overview |
| Supabase 项目 | https://supabase.com/dashboard/project/qmfqncpoqpdofskolqix |
| Supabase SQL Editor | https://supabase.com/dashboard/project/qmfqncpoqpdofskolqix/sql/new |

关键 ID：

- Netlify Site ID：`3d14f127-1804-4ffb-af45-b298e8fd750a`
- GitHub 分支：`main`
- Supabase project ref：`qmfqncpoqpdofskolqix`

旧备份站 `cozy-dodol-24777a-old.netlify.app` 可以在确认不再需要后删除。

---

## 3. 技术结构

这是一个无打包器的静态多页面站：

- HTML + CSS + 原生 JavaScript ES Module
- Supabase：Postgres、Auth、Storage
- Netlify：静态托管、Git 自动部署、Netlify Function
- 没有 React / Vue / Next.js
- 没有 npm 前端依赖；Supabase JS 使用本地 vendor 文件

### 页面

| 文件 | 作用 |
| --- | --- |
| `index.html` | 首页 |
| `wall.html` | 避雷墙 + 关键词搜索 |
| `post.html` | 帖子详情、点赞、评论、评论举报 |
| `submit.html` | 发布 / 修改帖子 |
| `me.html` | 个人中心、审核进度、邮箱绑定 |
| `admin.html` | 管理员审核台、邮箱列表与删除 |
| `rules.html` | 规则、隐私、奖励 |
| `leaderboard.html` | 点赞 + 评论排行榜 |

### 目录

```text
rubbish-house/
├─ *.html
├─ styles.css
├─ config.js
├─ js/
│  ├─ core.js
│  ├─ home.js
│  ├─ wall.js
│  ├─ post.js
│  ├─ submit.js
│  ├─ me.js
│  ├─ admin.js
│  ├─ leaderboard.js
│  └─ rules.js
├─ assets/
│  ├─ favicon.svg
│  └─ vendor/supabase.js
├─ netlify/
│  └─ functions/
│     └─ admin-delete-user.mjs
├─ supabase/
│  ├─ schema.sql
│  └─ add-admin.sql
├─ netlify.toml
├─ build.mjs
├─ server.mjs
├─ README.md
├─ SUPABASE_SETUP.md
├─ HANDOVER.md
└─ TEST-REPORT.md
```

---

## 4. 部署方式

### GitHub → Netlify 自动部署

当前正式网站已经绑定 GitHub：

```text
GitHub mds666/ruhouse
        ↓ push main
Netlify 自动构建
        ↓
node build.mjs
        ↓
发布 dist/
```

`netlify.toml`：

```toml
[build]
  command = "node build.mjs"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

### 手动更新

1. 修改 `rubbish-house/` 下的源代码
2. 提交并 push 到 `mds666/ruhouse` 的 `main`
3. Netlify 自动构建并发布

不要用旧的 ZIP 上传方式覆盖正式站。

### 本地预览

```bash
cd rubbish-house
node server.mjs
```

打开：http://127.0.0.1:4173

本地预览不会运行 Netlify Function，因此管理员删除邮箱功能只能在正式站测试。

---

## 5. 环境变量

### Netlify

在 Netlify 项目：

**Manage → Keys and secrets**

变量名：

```text
SUPABASE_SERVICE_ROLE_KEY
```

值：

- 使用 Supabase 的 legacy `service_role` JWT
- 不要用 anon / publishable
- 不要用新的 `sb_secret_...`（当前 Netlify Function 使用 legacy service_role JWT）
- 必须配置在 **Live app** 上下文
- 勾选 **Contains secret values**
- Live app 的值保存后，重新部署一次

当前已经在 Netlify 配好并验证。  
交接包不包含这个 key。

### Supabase Auth URL

**Authentication → URL Configuration**

Site URL：

```text
https://cozy-dodol-24777a.netlify.app
```

Redirect URLs：

```text
https://cozy-dodol-24777a.netlify.app/**
http://localhost:4173/**
https://cozy-dodol-24777a.netlify.app/me.html
```

否则邮箱确认链接会跳到 localhost。

### 公开配置

`config.js` 只包含 Supabase URL 和 publishable key，可以公开。

---

## 6. 数据库

完整脚本：

```text
supabase/schema.sql
```

在 Supabase SQL Editor 全选运行。  
脚本是幂等的，可以重复运行。

### 表

- `rh_posts`：帖子
- `rh_votes`：点赞
- `rh_comments`：评论
- `rh_comment_reports`：评论举报
- `rh_admins`：管理员名单

### 重要 RPC

公开：

- `rh_list_posts`
- `rh_get_post`
- `rh_list_comments`
- `rh_add_comment`
- `rh_cast_vote`
- `rh_create_post`
- `rh_update_post`
- `rh_delete_my_post`

个人：

- `rh_list_my_posts`
- `rh_get_my_post`

管理员：

- `rh_admin_list_posts`
- `rh_admin_stats`
- `rh_admin_review_post`
- `rh_admin_delete_post`
- `rh_admin_list_reported_comments`
- `rh_admin_review_comment`

评论举报：

- `rh_report_comment(p_comment_id, p_reason)`
- 举报后自动下架，管理员通过后恢复并设置 `is_immune = true`
- 同一匿名身份 24 小时最多举报 5 次

服务端辅助：

- `rh_has_private_address`
- `rh_enforce_private_text`
- `rh_recount_post_stats`
- `rh_recount_post_stats` 已授予 `service_role` 执行权限

### 权限

- 所有公开表启用 RLS
- anon / authenticated 不能直接读写基础表
- 所有读写通过 SECURITY DEFINER RPC
- `rh_admins` 显式授予 service_role：
  - select
  - insert
  - update
  - delete
- 这是 Netlify Function 校验管理员和防止删除管理员所必需的

### 数据保留规则

- 删除邮箱账号时：Auth 用户删除
- 帖子 `user_id` 自动变成 NULL，帖子保留公开
- 评论 `user_id` 自动变成 NULL，评论保留
- 点赞记录被删除，并通过 `rh_recount_post_stats` 重算
- `schema.sql` **不会**删除 `user_id IS NULL` 的帖子
- 不要恢复旧的“删除 user_id IS NULL 示例”逻辑，否则会误删已删除账号留下的帖子

---

## 7. 管理员删除邮箱

后台入口：

`/admin.html` 最底部 → **已注册邮箱**

后台会：

- 列出 Auth 邮箱账号
- 显示注册时间、最后登录、邮箱是否确认
- 标记当前账号、管理员
- 普通账号可删除
- 管理员和当前账号不可删除

删除接口：

```text
POST /.netlify/functions/admin-delete-user
GET  /.netlify/functions/admin-delete-user
```

安全逻辑：

- 校验调用者 Supabase 登录状态
- 校验调用者在 `rh_admins`
- 只允许管理员
- 不能删除当前登录账号
- 不能删除其他管理员
- 删除 Auth 用户
- 帖子/评论保留
- 点赞级联删除
- 调用 `rh_recount_post_stats` 重算计数
- 返回 warning 时说明计数刷新失败

### 行为说明

删除邮箱后：

- 该邮箱不能登录
- 帖子继续公开
- 帖子不再属于个人中心
- 用户下次访问会生成新的匿名身份
- 不能恢复原邮箱绑定

这是“删除账号、帖子保留”的方案，不是无损解绑。  
Supabase 不支持把永久邮箱账号直接降级回原匿名身份。

---

## 8. 邮箱绑定

个人中心「绑定邮箱」：

- 使用 Supabase Auth `updateUser`
- 将当前匿名身份升级为邮箱账号
- 用户 ID 不变，已有帖子保留
- 发送确认邮件
- 确认后可用邮箱 + 密码登录
- 换设备可找回帖子

如果用户已经有邮箱账号，用「已有邮箱账号？登录」。

注意：

- Supabase 免费邮件有发送频率限制
- 邮件确认链接依赖 URL Configuration
- 如果更换域名，必须同步更新 Site URL / Redirect URLs

---

## 9. 隐私与审核

### 允许

- 城市区域
- 最近的地铁站、公交站
- 房间内部情况
- 身体反应
- 中性描述

### 禁止

- 小区、楼盘名
- 具体路名、门牌号
- 楼栋、房号、房间号、房间名
- 房东姓名、电话、微信、身份证
- 手机号、身份证号
- 曝光或攻击个人

### 服务端

- `rh_enforce_private_text` 触发器检查帖子标题、正文、评论
- 支持“10号线”这类地铁线路编号，不误判为门牌号
- 客户端也有输入检查，但服务端才是最终防线

### 管理员审核

- 新帖 `pending`
- 修改后重新 `pending`
- 通过 `approved`
- 不通过 `rejected`
- 所有公开列表只显示 approved

---

## 10. 搜索和排行榜

### 搜索

`wall.html` 顶部搜索框检索：

- 标题
- 正文
- 标签
- 作者标签

用户可在正文写：

```text
北京朝阳 · 地铁10号线双井站
```

当前没有独立的位置字段，位置写在正文中。  
如果以后要做城市/站点结构化筛选，需要新增字段和 RPC。

### 排行榜

`leaderboard.html`

- 每月独立结算，只统计当月发布的已审核帖子
- 按作者标签合并
- 总分 = 点赞数 + 评论数
- 同分依次比较点赞、评论、帖子数
- 奖励周期：2026-11 至 2027-08，共 10 个月
- 每月总奖金 200 元：第一名 90 元、第二名 60 元、第三名 50 元
- 10 个月总奖金 2000 元
- 规则见 `rules.html`

---

## 11. 测试结果

完整测试记录见 `TEST-REPORT.md`。

最近一次线上交叉测试：

- 27 项全部通过
- 管理员邮箱列表：通过
- 删除普通邮箱账号：通过
- 删除后 Auth 404：通过
- 帖子保留且公开：通过
- 点赞/评论计数保留：通过
- 被删除用户的点赞被移除并重算：通过
- 评论举报、下架、管理员恢复、免举报：通过
- 管理员、自己、普通用户权限拦截：通过
- 无登录调用返回 401：通过
- 临时测试数据清理：通过

---

## 12. 已知限制

1. Supabase 不支持永久邮箱账号无损降级为匿名；当前只能删除账号、保留帖子。
2. 当前地点写在帖子正文里，不是独立城市/站点字段。
3. 评论举报是“一人举报即下架”，通过 24 小时 5 次限频降低滥用；没有多举报人阈值。
4. 奖励按月度结算，周期为 2026-11 至 2027-08；排行榜已按月份切换，不再是累计榜。
5. Legacy service_role key 计划 2027 年初退役，届时需要升级 Netlify Function 以支持新的 secret key。
6. 匿名身份按浏览器保存，清空浏览器数据会生成新身份。
7. 邮箱确认依赖 Supabase 邮件服务，免费额度有限。
8. 管理员删除邮箱后，原用户无法再编辑自己的旧帖子。

---

## 13. 运维清单

### 新管理员

1. Supabase Authentication → Users 创建邮箱用户
2. 复制用户 UUID
3. 编辑 `supabase/add-admin.sql` 的邮箱
4. 在 SQL Editor 运行
5. 让管理员登录 `/admin.html`

### 重新部署

- push GitHub `main`
- 等待 Netlify 构建
- 或在 Netlify 触发部署

### 更新 service_role key

1. Supabase → Settings → API Keys → Legacy API keys
2. 复制 `service_role` JWT
3. Netlify → Manage → Keys and secrets
4. 更新 `SUPABASE_SERVICE_ROLE_KEY` 的 Live app 值
5. 保存并重新部署

### 数据库备份

建议在 Supabase：

- Database → Backups
- 确认每日备份
- 重大改动前手动导出

### 监控

- Netlify Deploys 检查构建失败
- Supabase Logs 检查 Auth / PostgREST 错误
- 管理员后台定期处理待审核和被举报内容

---

## 14. 安全与凭据

已经使用过但不应留在项目里的凭据：

- GitHub 临时 PAT
- Netlify 临时 PAT
- Supabase service_role key

处理建议：

- GitHub 和 Netlify 的临时 token 可以撤销
- service_role key 只存在 Netlify 环境变量
- 不要提交到 Git
- 不要放进 HTML/JS
- 不要把 key 写进交接包

交接包已排除：

- `.tmp/`
- `.deploy/`
- 本地 service key 文件
- node_modules
- Git 历史
- 任何 token / 密钥

---

## 15. 交接验收

建议接手人按顺序检查：

1. 打开正式站首页
2. 打开避雷墙，搜索“地铁”
3. 发布一条测试帖
4. 管理员后台审核通过
5. 用另一个账号点赞、评论
6. 举报评论
7. 管理员恢复评论并确认免举报
8. 个人中心绑定测试邮箱
9. 管理员后台查看邮箱列表
10. 删除测试邮箱
11. 确认帖子保留、邮箱不能再登录
12. 清理测试数据

完成后，网站即可正常交接。
