# UI 优化验收记录

本目录用于记录本轮 UI 优化前后的关键状态，便于回归设置页、结果页、深浅色主题和高 DPI 显示效果。

## 截图说明

- `before-action-rows-680-light.png`：优化前，680px 宽度下的动作列表。
- `actions-rows-compact-light.png`：优化后，680px 宽度下的动作列表。
- `actions-compact-light.png`：浅色主题的快捷动作页。
- `actions-compact-dark.png`：深色主题的快捷动作页。
- `actions-200-dpi.png`：Windows 200% 缩放下的快捷动作页。
- `history-danger-light.png`：历史记录页的独立危险操作区域。
- `before-result-560-light.png`：优化前的 560px 结果窗口。
- `result-560-dark.png`：优化后的 560px 深色结果窗口。
- `result-min-dark.png`：结果窗口最小尺寸状态。
- `result-source-expanded-dark.png`：展开原文后的结果窗口。

## 验收结果

- 设置窗口在 680px 最小宽度下无横向滚动，动作内容与控制区能够正常换行。
- 结果窗口在 560px 常用宽度和 420px 最小宽度下无横向溢出。
- Windows 100%、125%、150% 和 200% 缩放下均未发现动作行溢出。
- 200% 缩放下，页面 `scrollWidth` 与 `clientWidth` 均为 944px；9 个动作行的 `scrollWidth` 与 `clientWidth` 均为 621px。
- 浅色和深色主题中的正文、次要文字、边框、输入框和禁用态保持可辨识对比度。
- 图标按钮、开关、导航和折叠控件均提供可访问名称或状态属性。

## 回归命令

```powershell
npm test
npm run build
```
