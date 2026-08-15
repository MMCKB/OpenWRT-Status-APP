# 固件升级安全设计依据

应用内固件升级采用 SSH 文件传输至路由器的临时目录，并在执行升级前调用 `sysupgrade -T` 进行路由器侧镜像测试。只有测试成功、目标设备与当前系统信息已展示给用户，并且用户完成明确的二次确认后，才允许调用 `sysupgrade`；应用不会默认保留配置，也不会尝试跳过镜像兼容性校验。

OpenWrt 官方 CLI 升级指南指出，应将升级文件置于路由器的 `/tmp` 临时目录并核验固件校验和；其 sysupgrade 技术参考提供了镜像测试参数。由于官方页面在自动化访问时受挑战页保护，以下链接供人工核对：

- <https://openwrt.org/docs/guide-user/installation/sysupgrade.cli>
- <https://openwrt.org/docs/techref/sysupgrade>

设计同时遵循 Expo DocumentPicker 文档：选择文件时启用 `copyToCacheDirectory`，以确保原生文件系统与上传流程可立即读取该文件。
