# hydrachs 中小学教师研修脚本 Patch

一个用于国家智慧教育平台的浏览器用户脚本补丁，主要用于改进登录体验、自动展开指定研修课程目录、辅助进入学习视频、显示学习进度，并在多账号切换时隔离各账号的进度数据。

## 功能特性

- 自动处理登录页弱密码提醒弹窗。
- 密码输入框默认明文显示，并解除粘贴限制。
- 自动勾选登录政策/协议复选框。
- 在课程列表页和播放详情页自动展开指定章节。
- 点击 hydrachs 脚本面板中的 `准备刷课` 后，等待 4 秒刷新页面。
- 视频播放完成出现 `再学一遍` 后，自动切换到当前课程白名单中的下一个视频。
- 当前课程白名单全部学完后，自动跳转到下一个课程页面。
- 左下角显示学习进度 Panel。
- 进度 Panel 中的课程标题可点击，直接跳转到对应课程页面。
- 按账号隔离学习进度，切换账号时不会串用上一个账号的数据。

## 学习课程内容

下列课程最终学时为 11 学时。

| 顺序 | 标题 | 视频数 |
|---|---|---:|
| 1 | 大力弘扬教育家精神 | 8 |
| 2 | 数智素养提升 | 8 |
| 3 | 科学素养提升 | 1 |
| 4 | 心理健康教育能力提升 | 1 |
| 5 | 学科美育教学改革专题培训 | 5 |

## 前置依赖

本脚本是 Patch 脚本，依赖 hydrachs 的 `国家智慧中小学刷课公开版` 脚本提供能力。请先安装 hydrachs 原脚本，再安装本 Patch：

- hydrachs 暑期教师研修脚本下载地址：[https://s4.fnnas.net/s/94300283165348b2bb](https://s4.fnnas.net/s/94300283165348b2bb)
- hydrachs 个人主页：[https://space.bilibili.com/15344563](https://space.bilibili.com/15344563)

## 使用方法

1. 安装浏览器用户脚本管理器，例如 Tampermonkey 或 ScriptCat。
2. 安装并启用 hydrachs 的 `国家智慧中小学刷课公开版` 脚本。
3. 安装 [hydrachs-smartedu-studying-patch.user.js](https://raw.githubusercontent.com/XavierWang3P/hydrachs-smartedu-studying-patch/refs/heads/main/hydrachs-smartedu-studying-patch.user.js) 脚本，并启用。
4. 打开 [2026 年暑假研修课程](https://basic.smartedu.cn/training/dc6d78f2-bad8-4d09-b8da-0d758803dbe4) 页面。
5. 点击 hydrachs 控制面板里的 `准备刷课`。脚本会等待 4 秒，刷新页面并进入视频学习页。
6. 当前视频完成后，脚本会自动进入下一个白名单视频。当前课程全部完成后，脚本会跳转到下一个课程页面。

## 学习进度 Panel

页面左下角会显示一个学习进度面板，包含：

- 当前账号。
- 5 个课程的视频完成进度。
- 研修课程的总学时进度。
- 每个专题的已学习、已认定学时。
- 每个课程标题的快捷跳转链接。
- 菜单按钮：设置账号别名、刷新学时进度、清除当前账号进度、清除所有账号进度。


## 多账号隔离

进度根据课程目录中的 `已学完` 状态同步，并保存到浏览器 `localStorage`。脚本会优先从页面用户名 DOM 中识别账号，识别到的用户名会作为进度存储命名空间。不同账号会使用不同的本地进度数据，互不影响。

如果页面无法识别用户名，可以点击进度 Panel 菜单中的 `设置账号别名`，手动输入账号标识。留空则恢复自动识别。

## 自定义课程

课程配置位于脚本中的 `autoExpandCourseConfigs`：

```js
{
    displayTitle: '课程显示名称',
    courseId: '课程 ID',
    sectionTitles: [
        '需要自动展开的章节标题'
    ],
    resourceTitles: [
        '需要自动播放的视频标题'
    ]
}
```

字段说明：

- `displayTitle`：进度 Panel 中显示的课程标题。
- `courseId`：课程 URL 中的 `courseId`。
- `sectionTitles`：需要自动展开的目录章节标题。
- `resourceTitles`：允许自动播放和自动切换的视频白名单。

调整数组顺序即可调整课程完成后的自动跳转顺序。

## 常用参数

脚本中有几个可按需修改的延迟参数：

```js
const prepareStudyDelayMs = 4000;
const autoNextVideoClickDelayMs = 100;
const autoNextVideoCooldownMs = 2000;
```

- `prepareStudyDelayMs`：点击 `准备刷课` 后等待原脚本读取课程列表的时间。
- `autoNextVideoClickDelayMs`：检测到视频完成后，点击下一个视频的延迟。
- `autoNextVideoCooldownMs`：自动切换后的防重复触发冷却时间。

## 数据存储

脚本仅使用浏览器本地存储：

- `sessionStorage`：保存当前视频状态、刷新后进入视频的临时状态。
- `localStorage`：按账号保存学习进度和手动账号标识。

脚本本身不向第三方服务器上传任何数据。

## 注意事项

- 必须先启用 hydrachs 的 `国家智慧中小学刷课公开版` 脚本，本 Patch 才能配合 `准备刷课` 面板工作。
- 本脚本依赖国家智慧教育平台当前页面 DOM 结构，平台改版后可能需要更新选择器。
- 如进度显示异常，可刷新课程页让脚本重新读取目录状态。
- 如多账号进度串扰，请确认页面右上角用户名是否正常显示，或使用 Panel 的 `账号` 按钮手动设置账号标识。
- 请遵守平台规则和所在单位的学习要求，本脚本仅用于改善个人学习页面操作体验。

## License

MIT License
