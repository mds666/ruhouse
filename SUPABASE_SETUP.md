# Supabase 升级与管理员设置

当前项目已经改成多页面 + 人工审核模式。  
需要重新运行一次 [schema.sql](supabase/schema.sql)，然后创建管理员账号。

---

## 1. 升级数据库（一次性）

1. 打开 Supabase Dashboard 里的 **SQL Editor**
2. 新建查询
3. 打开 [schema.sql](supabase/schema.sql)，全选复制
4. 粘贴后点击 **Run**

这个脚本会：

- 保持原有 rh_posts / rh_votes / rh_comments
- 增加审核状态、审核说明、更新时间等字段
- 删除之前的 6 条示例记录（user_id IS NULL）
- 新增管理员表 rh_admins
- 新增或更新所有审核 / 个人中心函数
- 保留 Storage 图片桶与上传策略

看到 Success. No rows returned 就可以了。

---

## 2. 创建管理员账号

网站的管理员登录使用 Supabase 邮箱 + 密码，不再使用匿名身份。

### 第一步：创建 Auth 用户

进入：

**Authentication → Users → Add user**

填写：

- 管理员邮箱
- 管理员密码
- 如果页面有 **Auto Confirm User** 选项，打开它

### 第二步：把该用户加入管理员名单

打开 [add-admin.sql](supabase/add-admin.sql)，把里面的邮箱替换成你刚创建的邮箱：

    YOUR_ADMIN_EMAIL@example.com

然后在 SQL Editor 里运行。

运行成功后会返回一条 rh_admins 记录。

### 第三步：登录

打开：

    /admin.html

使用刚才的邮箱、密码登录，就能进入审核台。

> 不要使用 Supabase 的 service_role key 登录。  
> 管理员账号是普通 Auth 用户，通过 rh_admins 表获得审核权限。

---

## 3. 新的用户与审核流程

1. 访客打开网站，自动获得匿名身份
2. 发布记录 → 状态为 **待审核**
3. 管理员在 /admin.html 看到待审核内容
4. 管理员通过 → 记录出现在 /wall.html
5. 管理员不通过 → 填写原因
6. 用户在 /me.html 看到状态和原因
7. 用户修改已通过或待审核的记录 → 自动重新进入待审核
8. 修改期间，记录暂时从公开避雷墙隐藏

---

## 4. 页面

- / 首页
- /wall.html 避雷墙：只显示审核通过的记录
- /post.html?id=... 房间详情、点赞、评论
- /submit.html 发布新记录
- /submit.html?edit=... 修改自己的记录
- /me.html 个人中心：审核状态、修改入口
- /admin.html 管理员审核台
- /rules.html 发帖与审核规则

---

## 5. 安全设计

- 普通访客使用 Supabase Anonymous Sign-In，不收集手机号或邮箱
- rh_posts、rh_votes、rh_comments、rh_admins 都禁止客户端直接读写
- 所有读取和写入经过 SECURITY DEFINER 函数
- rh_admins 不通过前端接口开放，只能由 SQL Editor 添加
- 管理员审核函数会再次校验当前用户是否在管理员名单
- 图片上传策略只允许写入 rooms/<自己的 user id>/
- 图片在浏览器端重新编码为 JPEG，EXIF 定位不会上传

---

## 6. 常见问题

### 登录管理员时提示「审核功能尚未安装」

schema.sql 没有成功执行完。重新执行整个文件。

### 管理员登录提示「这个账号不在管理员名单中」

说明 Auth 用户已经创建，但还没有执行 [add-admin.sql](supabase/add-admin.sql)，或者邮箱写错了。

### 个人中心看不到之前的记录

个人中心绑定的是当前浏览器的匿名身份。清除浏览器数据或换设备后，旧匿名身份无法找回。

### 发布后避雷墙没有出现

这是正常的。新记录默认是待审核，必须由管理员在审核台通过后才会公开。
