# Rubbish House / 垃圾房子

一个只记录房间、不记录地址的匿名租房避雷网站。  
中文名「垃圾房子」，英文名 **Rubbish House**，简称 **ruhouse**。

当前版本是**多页面 + 人工审核**的结构：

- 所有新记录先进入待审核
- 管理员通过后才出现在避雷墙
- 用户可以修改或删除自己的记录
- 管理员可以删除任何记录
- 评论可以被举报；被举报后暂时下架，管理员通过后恢复并获得免举报标记
- 修改后重新审核
- 个人中心可以看到审核状态与未通过原因

---

## 页面

| 页面 | 作用 |
| --- | --- |
| [index.html](index.html) | 首页 |
| [wall.html](wall.html) | 避雷墙，只显示审核通过的记录 |
| [post.html](post.html) | 房间详情、点赞、评论 |
| [leaderboard.html](leaderboard.html) | 点赞 + 评论排行榜 |
| [submit.html](submit.html) | 发布新记录 / 修改自己的记录 |
| [me.html](me.html) | 个人中心与审核进度 |
| [admin.html](admin.html) | 管理员登录与审核台 |
| [rules.html](rules.html) | 发帖、隐私与审核规则 |

---

## 本地预览

在项目目录运行：

    node server.mjs

打开：http://127.0.0.1:4173

当前 [config.js](config.js) 已经填入 Supabase 项目配置。

---

## 数据库升级

完整步骤见 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)。

简要流程：

1. 在 Supabase SQL Editor 执行 [supabase/schema.sql](supabase/schema.sql)
2. 在 Authentication 中创建管理员邮箱 + 密码
3. 修改 [supabase/add-admin.sql](supabase/add-admin.sql) 里的邮箱并执行
4. 打开 /admin.html 登录审核台

> schema.sql 会删除 user_id IS NULL 的旧示例记录。  
> 这是按「先删掉示例」的要求处理的。

---

## 文件结构

    rubbish-house/
    ├─ index.html
    ├─ wall.html
    ├─ post.html
    ├─ submit.html
    ├─ me.html
    ├─ admin.html
    ├─ rules.html
    ├─ leaderboard.html
    ├─ styles.css
    ├─ config.js
    ├─ server.mjs
    ├─ js/
    │  ├─ core.js
    │  ├─ home.js
    │  ├─ wall.js
    │  ├─ post.js
    │  ├─ submit.js
    │  ├─ me.js
    │  ├─ admin.js
    │  └─ rules.js
    ├─ supabase/
    │  ├─ schema.sql
    │  └─ add-admin.sql
    └─ assets/
       ├─ favicon.svg
       └─ vendor/supabase.js

---

## 设计

- 低饱和纸白、墨黑、深松绿色
- 宋体标题 + 无衬线正文
- 多页面结构，避免把所有内容堆在首页
- 首页和避雷墙不使用装饰图片，图片只出现在房间详情和审核台
- 不使用弹窗完成主要发布流程
- 所有公开内容带审核状态与来源说明

---

## 重要限制

- 普通用户的个人中心绑定浏览器里的匿名身份，换设备或清除浏览器数据后无法找回。
- 图片 bucket 是公开的，帖子公开后图片可通过 URL 访问；不要上传带门牌或窗外地标的照片。
- 管理员账号必须由站点维护者在 Supabase Authentication 中创建。
- 正式开放前仍建议补充举报处理、频率限制、内容申诉和备份策略。
