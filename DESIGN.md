---
name: "划词助手"
description: "安静、可靠、清晰的 Windows AI 划词工具"
colors:
  canvas: "oklch(97.5% 0.006 255)"
  surface: "oklch(99% 0.004 255)"
  surface-soft: "oklch(95.5% 0.009 255)"
  ink: "oklch(24% 0.02 255)"
  muted: "oklch(49% 0.018 255)"
  line: "oklch(89% 0.012 255)"
  accent: "oklch(57% 0.17 255)"
  accent-soft: "oklch(94% 0.04 255)"
  danger: "oklch(56% 0.18 25)"
typography:
  headline:
    fontFamily: "Segoe UI Variable, Microsoft YaHei UI, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
  title:
    fontFamily: "Segoe UI Variable, Microsoft YaHei UI, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: "Segoe UI Variable, Microsoft YaHei UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Segoe UI Variable, Microsoft YaHei UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0 12px"
---

# Design System: 划词助手

## Overview

**Creative North Star: "安静的桌面工具"**

划词助手服务于用户已经进行中的阅读和写作任务。界面应像桌面边缘的一件精密工具，出现时清楚，使用时直接，完成后退回背景。视觉采用冷中性色与低饱和蓝色强调，默认明亮但不刺眼，深色主题保持同样的信息层级。

系统拒绝渐变、霓虹、玻璃拟态、装饰动画和无意义的卡片。层级主要来自字号、字重、留白与色调，边框只用于分隔，阴影只用于浮动窗口和原生层级。

**Key Characteristics:**

- 冷静、紧凑、可信赖。
- 单一强调色，占每个界面不超过约 10%。
- 主要内容优先，元信息主动退后。
- 标准 Windows 交互优先于品牌化控件。

## Colors

配色以略带蓝色的中性灰为背景，强调蓝只用于主要操作、选中状态、焦点和进度。

### Primary

- **工作蓝**：用于主要按钮、当前选中项、键盘焦点和关键状态，不用于装饰。
- **工作蓝浅层**：用于悬停、选中背景和轻量反馈，必须保持低对比面积。

### Neutral

- **纸面白**：用于主要内容表面，不使用纯白。
- **冷雾背景**：用于应用画布、侧栏和原文等次级区域。
- **墨色文字**：用于标题和正文，不使用纯黑。
- **静音文字**：用于说明、元信息和禁用状态。
- **细线灰**：仅用于真正需要的分隔和控件边界。

**The One Voice Rule.** 强调蓝只表达可操作、已选择或正在进行的状态。任何纯装饰用途都被禁止。

## Typography

**Display Font:** Segoe UI Variable
**Body Font:** Segoe UI Variable
**Label/Mono Font:** Cascadia Code，仅用于代码和技术值

**Character:** 使用 Windows 系统字体获得熟悉、稳定的桌面体验。中文优先回退到 Microsoft YaHei UI，不引入展示字体。

### Hierarchy

- **Headline**（650，24px，1.25）：设置页标题。
- **Title**（650，14px，1.4）：区块标题、窗口标题、设置名称。
- **Body**（400，13px，1.65）：正文、回答和说明，长文本控制在约 72 个字符宽度。
- **Label**（600，12px，1.4）：按钮、字段标签和导航。
- **Metadata**（400，11px，1.4）：字符统计、模型和保存状态，不低于 10px。

**The Reading First Rule.** 结果回答的字号和行高始终高于周围元信息，任何统计信息不得与回答使用相同视觉权重。

## Elevation

系统默认平坦，通过相邻表面的轻微色差表达结构。只有划词工具栏、结果窗口和系统菜单可以使用环境阴影，设置页中的普通区块禁止投影。

### Shadow Vocabulary

- **Floating Tool**：柔和、短距离阴影，用于划词工具栏。
- **Result Window**：比工具栏更宽但更淡的环境阴影，用于结果窗口边缘。

**The Flat by Default Rule.** 如果一个区域不离开文档流，就不得通过阴影表达重要性。

## Components

### Buttons

- **Shape:** 紧凑圆角（6px），高度为 32px、36px 两档。
- **Primary:** 工作蓝底色，纸面白文字，仅用于保存、发送等主要动作。
- **Hover / Focus:** 悬停改变明度，键盘焦点使用 2px 外环，按下状态轻微降低亮度。
- **Secondary / Ghost:** 次要按钮使用浅表面或透明背景，不同时出现边框、阴影和底色。

### Cards / Containers

- **Corner Style:** 只有独立编辑器和浮层使用 10px 圆角。
- **Background:** 普通设置区块直接位于画布上，不包装成卡片。
- **Shadow Strategy:** 文档流容器无阴影。
- **Border:** 一条细线足够，禁止嵌套边框。
- **Internal Padding:** 使用 16px 或 24px。

### Inputs / Fields

- **Style:** 纸面白背景、细线灰边界、6px 圆角、高度 40px。
- **Focus:** 工作蓝边界配合低透明焦点环。
- **Error / Disabled:** 错误同时使用图标、文字和语义色，禁用状态降低对比但保持可读。

### Navigation

侧栏保持稳定宽度。默认项透明，悬停使用浅表面，当前项使用工作蓝浅层和工作蓝文字。导航图标、文字和指示器必须共享同一基线。

### Selection Toolbar

工具栏为唯一的高密度浮动组件。按钮点击区域为 32px，图标为 16px 到 18px；默认状态安静，悬停和键盘焦点清晰。分隔线只用于动作组之间。

## Do's and Don'ts

### Do:

- **Do** 使用字号、字重、留白和色调建立层级。
- **Do** 让回答、动作标签和设置名称成为第一视觉信息。
- **Do** 为默认、悬停、按下、禁用、焦点和加载状态提供一致反馈。
- **Do** 在浅色、深色和 100% 到 200% Windows 缩放下验证界面。
- **Do** 保留 Windows 原生菜单和窗口操作的熟悉行为。

### Don't:

- **Don't** 使用渐变、霓虹、玻璃拟态或大面积高饱和颜色。
- **Don't** 用大量卡片、边框和阴影包装设置内容。
- **Don't** 使用纯黑或纯白。
- **Don't** 将关键说明缩小到难以阅读的字号。
- **Don't** 使用大于 1px 的彩色侧边条强调卡片、列表项或提示。
- **Don't** 为了风格重新发明标准 Windows 控件。
