# AutoMate - 网页认证自动登录助手

> 一次配置，开机后自动完成所有网页认证登录。

## 项目背景

每天我们都需要手动登录多个网页认证页面——校园 WiFi 认证、学习通、教务系统、公司 OA、路由器管理页等。每次都要重复输入固定的账号密码，繁琐且容易出错。

**AutoMate** 解决这个问题：配置一次账号密码后，应用会在开机后（或手动触发时）自动打开各登录页面。配对浏览器扩展后，扩展会在默认浏览器中识别已配置的登录表单、填入凭据并提交。所有凭据使用 AES-256-GCM 加密存储，仅限本机解密。

## 功能清单

- **平台管理**：添加、编辑、删除登录平台配置，支持按分组管理
- **登录系统管理**：将多个平台归入同一登录系统，共享登录入口与凭据；支持自定义图标、颜色、形状
- **双模式登录**：「网络登录」连 WiFi 并完成 Portal 认证；「网页登录」在默认浏览器中自动登录网页服务
- **浏览器扩展自动填充**：配对一次后，访问已配置的登录页时扩展自动填写凭据并提交，无需手动操作
- **批量登录**：一键执行所有平台登录，或开机/唤醒后自动执行
- **定时调度**：每个平台可单独设置星期几自动登录
- **健康检查与自动重登**：定期检查各平台登录状态，掉线自动重新登录
- **WiFi 诊断**：实时显示信号强度、下载速率、延迟、互联网连通性；支持一键测速
- **错误分类提示**：登录失败时区分"账号密码错误"、"验证码拦截"、"网络不可达"
- **表单自动识别**：智能匹配常见的账号/密码输入框和提交按钮，也支持自定义 CSS 选择器
- **系统托盘**：最小化到托盘，托盘图标随登录状态变色（绿/灰/红/黄）
- **开机自启**：可设置系统开机自动启动
- **数据加密**：AES-256-GCM 加密，密钥绑定机器特征，换电脑无法解密
- **配置迁移**：导出/导入配置 JSON，方便换电脑迁移
- **扩展配对自愈**：扩展会话失效时自动解除配对并提示重新配对

## 支持场景

| 场景 | 说明 |
|------|------|
| 校园 WiFi 认证 | 自动连接校园 WiFi 并完成 Portal 认证 |
| 学习通 / 教务系统 | 自动登录在线学习平台和教务系统 |
| 公司 OA | 自动登录企业办公系统 |
| 路由器管理页 | 自动登录路由器管理界面 |
| 任意表单登录页 | 只要页面有账号/密码输入框和提交按钮即可适配 |

## 技术栈

| 技术 | 用途 |
|------|------|
| **Electron** | 桌面应用主进程、默认浏览器启动、系统托盘、开机自启 |
| **Chrome/Edge MV3 扩展** | 默认浏览器登录表单自动填充，通过本机回环服务与 AutoMate 配对 |
| **Vue 3 + Vite** | 渲染进程前端 UI |
| **Pinia** | 状态管理 |
| **Vue Router** | 页面路由 |
| **electron-store** | 本地配置持久化 |
| **Node.js crypto** | AES-256-GCM 加密 |
| **netsh** | Windows WiFi 连接与诊断 |

## 项目结构

```
AutoMate/
├── package.json                # 项目配置与依赖
├── main.js                     # Electron 主进程（窗口、托盘、IPC、自启）
├── preload.js                  # contextBridge 暴露 IPC 接口
├── index.html                  # Vue HTML 入口
├── vite.config.js              # Vite 构建配置
├── CSDN参赛文章.md             # CSDN 参赛文章
├── browser-extension/          # Chrome/Edge 自动填充扩展
│   ├── background.js           # 扩展主逻辑（表单检测、填充、提交、结果检测）
│   ├── options.js              # 配对与设置页逻辑
│   ├── options.html/css        # 扩展设置页 UI
│   └── manifest.json           # MV3 清单
├── electron/
│   ├── autoLogin.js            # 登录调度引擎（双模式分发）
│   ├── networkLogin.js         # 网络登录（WiFi + Portal 认证）
│   ├── browserBridge.js        # 回环服务（127.0.0.1:32147）
│   ├── crypto.js               # AES-256-GCM 加密/解密
│   ├── netUtils.js             # WiFi 诊断（netsh 解析）
│   ├── network.js              # 网络连通性检测与测速
│   ├── platformCredentials.js  # 凭据解析（平台/分组/登录系统继承）
│   ├── loginIntentQueue.js     # 登录意图队列
│   ├── platformWorkflow.js     # 平台工作流验证
│   ├── cdpLogin.js             # CDP 浏览器控制（备用引擎）
│   ├── wsClient.js             # 手写 WebSocket 客户端（CDP 通信）
│   └── tray.js                 # 系统托盘（动态图标、右键菜单）
├── src/
│   ├── main.js                 # Vue 入口
│   ├── App.vue                 # 主布局（侧边栏 + 状态栏）
│   ├── router/index.js         # 路由配置
│   ├── store/index.js          # Pinia store
│   ├── styles/global.css       # 全局样式
│   ├── lib/platformForm.mjs    # 平台表单工具
│   ├── components/
│   │   └── ExtensionSetupWizard.vue  # 扩展配对向导
│   └── views/
│       ├── Home.vue            # 首页概览（平台卡片列表）
│       ├── AddPlatform.vue     # 添加/编辑平台
│       ├── Settings.vue        # 设置页（自启、检查间隔、导入导出）
│       ├── Wifi.vue            # WiFi 诊断（信号、测速、延迟）
│       ├── GroupManagement.vue # 网页管理（分组 + 登录系统）
│       ├── LoginSystems.vue    # 登录系统编辑器
│       └── Help.vue            # 帮助页
└── test/                       # 单元测试（39 个）
```

## 使用方法

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发模式（同时运行 Vite 和 Electron）
npm run dev
```

### 生产构建

```bash
# 构建前端 + 启动 Electron
npm run build

# 打包安装程序（NSIS .exe）
npm run dist

# 国内镜像加速
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npm run dist
```

### 基本操作

1. **添加平台**：点击侧边栏「添加平台」，填写平台名称、登录网址、账号、密码
2. **可选 WiFi**：如需先连 WiFi 再登录，填写 WiFi 名称（仅 Windows）
3. **高级选项**：表单自动识别失败时，可自定义 CSS 选择器
4. **登录系统**：将多个平台归入同一登录系统，共享登录入口与凭据
5. **一键登录**：首页或托盘菜单点击「全部登录」
6. **开机自启**：设置页开启「开机自启动」
7. **状态检查**：设置页配置定期检查间隔（15/30/60 分钟）
8. **WiFi 诊断**：WiFi 管理页查看信号强度、测速、延迟
9. **配置迁移**：设置页导出/导入 JSON 配置文件

### 默认浏览器扩展

首次启动时，AutoMate 会显示扩展安装指引。也可以随时在「设置」页重新打开：

1. 在 Chrome 或 Edge 中打开扩展管理页，启用开发者模式并加载 AutoMate 的 `browser-extension` 文件夹。
2. 在扩展详情中打开扩展选项，将 AutoMate 显示的一次性配对码粘贴并配对。
3. 完成后，AutoMate 从开机登录或手动触发登录都会打开系统默认浏览器；直接访问已配置的登录网址也会自动填充，无需点击扩展按钮。

扩展安装时会请求所有网站的访问权限，以避免今后每新增一个网站都重新授权。凭据桥接仅返回与已配置登录网址匹配的站点凭据，并且需要 AutoMate 正在运行。CAPTCHA、多因素验证以及浏览器安全检查仍可能需要手动完成。

## 数据安全

- 所有账号密码使用 **AES-256-GCM** 加密后存储到本地
- 加密密钥由本机特征（主机名、平台、架构、用户名、MAC 地址）派生，**换电脑无法解密**
- 密码明文仅在登录执行时短暂存在于内存中，使用后立即清除
- **不收集、不上传任何用户数据**，完全本地运行

## 登录状态颜色

| 颜色 | 状态 | 说明 |
|------|------|------|
| 🟢 绿色 | 已登录 | 登录成功 |
| ⚪ 灰色 | 未登录 | 尚未登录或状态未知 |
| 🔴 红色 | 登录失败 | 登录未成功 |
| 🟡 黄色 | 登录中 | 正在执行登录操作 |

## 开源协议

[MIT](LICENSE)
