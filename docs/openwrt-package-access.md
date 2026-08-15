# OpenWrt 软件包查询：调研记录

## 2026-08-15

OpenWrt `rpcd` 的公开源码在 `sys.c` 中定义了 `rpc-sys` 对象的 `packagelist` 方法，并接受布尔参数 `all`。因此，已登录的 LuCI/ubus 会话可以优先使用 `rpc-sys.packagelist` 读取设备提供的软件包清单，无需将 SSH 密码转发到云端。

官方 OpenWrt 软件包文档页面当前受到 Anubis 防护，无法通过自动化浏览访问。项目实现必须把 `rpc-sys.packagelist` 视为能力探测：接口不可用或设备版本不支持时应显示明确说明，绝不以伪造软件包替代。

应用内交互将保持只读的软件包查询，SSH 终端不再采用外部应用 URL。完整交互式 SSH 需要本机原生 SSH/PTTY 能力；在当前 Expo 运行时中不能安全地通过云端代理访问手机局域网内的私有路由器地址。

候选原生库 `@marcomueglich/react-native-ssh-client` 提供密码或私钥认证、远程命令、PTY 交互 Shell 和 XTERM 终端类型，但当前仅支持 Android。该库需通过原生构建纳入 APK，不能在 Expo Go 或 Web 预览中运行。项目可据此实现 Android 的应用内 SSH 控制；iOS 将以明确的不可用提示保护用户体验。

来源：

1. https://github.com/openwrt/rpcd/blob/master/sys.c
2. https://openwrt.org/packages/start
3. https://www.npmjs.com/package/@marcomueglich/react-native-ssh-client
4. https://github.com/MarcoMueglich/react-native-ssh-client
