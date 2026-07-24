<p align="center">
  <img src="resources/icon.png" width="96" height="96" alt="划词助手图标" />
</p>

<h1 align="center">划词助手</h1>

<p align="center">
  一个独立、轻量的 Windows AI 划词工具。
  <br />
  在任意应用中选中文字，即可快速翻译、解释、总结、润色或执行自定义提示词。
</p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows11" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-41-47848F?logo=electron" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-2F855A" />
</p>

## 项目简介

划词助手将 Cherry Studio 中实用的划词交互独立成一个专注的 Windows 桌面应用。应用常驻系统托盘，通过系统原生选区能力监听其他应用中的文本选择，并在选区附近显示悬浮工具条。

它不绑定特定 AI 平台，只要服务兼容 OpenAI Chat Completions API，就可以连接 OpenAI、OpenRouter、Ollama 或其他自建模型服务。

## 功能特点

- **跨应用划词**：支持浏览器、Office、记事本、IDE 等 Windows 应用。
- **快捷 AI 动作**：内置翻译、解释、总结和润色。
- **自定义提示词**：可添加自己的动作名称和提示词。
- **流式结果窗口**：模型输出实时显示，支持复制和重新生成。
- **OpenAI 兼容接口**：API 地址、Key、模型名称均可配置。
- **系统托盘常驻**：关闭设置窗口后继续运行，可选择开机启动。
- **浅色与深色主题**：支持跟随 Windows 系统主题。
- **本地安全存储**：API Key 使用 Electron `safeStorage` 加密后保存。

## 下载与使用

前往 [Releases](https://github.com/v833/windows-selection-assistant/releases/latest) 下载最新版本：

- `划词助手 Setup x.x.x.exe`：Windows 安装器。
- `划词助手 x.x.x.exe`：免安装便携版。

首次运行后：

1. 打开“模型”页面。
2. 填写 OpenAI 兼容 API 地址、API Key 和模型名称。
3. 点击“测试连接”，确认配置可用。
4. 在其他应用中选中文字，通过悬浮工具条执行动作。

> API 地址应包含服务版本路径，例如 `https://api.openai.com/v1`。本地 Ollama 可使用其 OpenAI 兼容地址。

## 隐私说明

- 应用不会收集遥测、使用记录或选区历史。
- 只有点击 AI 动作后，当前选中文本才会发送到你配置的模型接口。
- 复制动作完全在本机执行，不会访问网络。
- API Key 在 Windows 用户目录中加密保存，不会写入项目目录。

## 技术实现

- [Electron](https://www.electronjs.org/)：桌面窗口、托盘与安全存储。
- [React](https://react.dev/)：设置页、悬浮工具条与结果窗口。
- [selection-hook](https://github.com/0xfullex/selection-hook)：跨应用文本选区监听。
- [electron-vite](https://electron-vite.org/)：开发与构建工具链。

全局选区交互参考了 [Cherry Studio](https://github.com/CherryHQ/cherry-studio) 的划词助手功能。本项目为独立实现，不依赖 Cherry Studio 主应用。

## 本地开发

### 环境要求

- Windows 10 或 Windows 11 x64
- Node.js 22 或更高版本
- npm 10 或更高版本

### 启动开发版

```powershell
npm install
npm run dev
```

### 测试与构建

```powershell
npm test
npm run build
npm run dist:win
```

构建产物位于 `release` 目录，包括 NSIS 安装器和便携版。

## 项目结构

```text
src/main       Electron 主进程、选区监听、AI 请求与配置存储
src/preload    安全的 IPC 桥接
src/renderer   设置页、悬浮工具条与结果窗口
src/shared     主进程与渲染器共享类型
tests          AI 请求辅助函数测试
```

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
