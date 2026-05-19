# GitHub 替换包说明

把这个文件夹里的文件上传到 GitHub 仓库根目录，覆盖同名文件即可。

需要上传的文件：

- `index.html`
- `style.css`
- `app.js`
- `importer.js`
- `parser.js`
- `storage.js`
- `templates.js`

## 本地存档不会丢

训练记录、导入计划、动作库、热身库都保存在浏览器 `localStorage` 里。

这版代码保留了原来的存储键：

```js
const KEY='xuhui_training_v2_dailygrid';
```

只要你：

1. 继续用同一个浏览器打开同一个 GitHub Pages 地址；
2. 不清空浏览器网站数据；
3. 不改 `app.js` 里的 `KEY`；

原来的本地存档就会继续读取。

这版新增了 `actualDates` / `actualDate` 字段，用来锁定“实际训练发生日期”。旧日志只有 `date` 字段时，会自动补一份 `actualDate`，不会删除旧字段。

## 上传前建议

在旧页面里先点一次「总存档导出」或「导出周期备份」，留一个 JSON 备份。这个不是因为替换会清空，而是防止浏览器、手机系统或 GitHub Pages 缓存带来的意外。

## 替换后如果页面没有变化

浏览器可能缓存了旧文件。可以刷新几次，或在地址后加：

```text
?v=20260520
```

例如：

```text
https://xuhuiiii666.github.io/-/?v=20260520
```
