# 贡献指南

感谢对 OpenWrt 路由器状态项目的改进。提交功能、修复和文档前，请确保改动不会把路由器凭据、私钥、调试 keystore、环境文件或构建产物纳入版本控制。

## 开发前检查

请使用项目锁定的 Node.js 22、pnpm 9.12.0、JDK 21 与 Android 工具链，并在提交前运行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

涉及 Android 原生构建的改动应至少验证目标 ABI；涉及发布流程的改动需同时核验 APK 版本、16KB 对齐和签名。详见 [LOCAL_ANDROID_BUILD.md](LOCAL_ANDROID_BUILD.md) 与 [WINDOWS_FOUR_ABI_BUILD.md](WINDOWS_FOUR_ABI_BUILD.md)。

## 提交准则

请保持改动范围聚焦，使用清晰的提交说明，并为命令解析、数据转换或高风险路由器操作补充对应测试。若修改应用版本，请同步更新 `app.config.ts` 和 `android/app/build.gradle` 中的 `versionName`；版本号不一致时持续集成会拒绝发布。

涉及 SSH、固件升级、防火墙、软件包、Docker、文件操作或远程命令的改动，必须明确输入校验、命令转义、权限影响和用户确认流程。安全问题请遵循 [SECURITY.md](SECURITY.md) 的私密报告渠道，而非公开提交 Issue。
