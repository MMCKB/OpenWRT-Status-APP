# OpenWrt 扩展管理功能研究记录

## GitHub Release 固件检查与下载

GitHub 官方 Releases 接口可列出仓库的已发布版本。对公开仓库，请求无需鉴权；响应包含 `tag_name`、`name`、`body`、`published_at` 以及每个发布资产的名称、字节大小、`browser_download_url` 和可选 `digest`。应用应只接受规范的 GitHub 仓库或 Release 链接，解析出 `owner/repo` 后查询公开 Release，而不把用户输入直接作为下载命令执行。[1]

固件下载应使用 Release 资产的 `browser_download_url`。GitHub 官方文档说明，该地址可用于客户端二进制下载；公开资源不要求访问令牌。实现中将仅允许 `https` 地址、展示发布版本、说明、资产名称及大小，并要求用户选择资产和两次确认后才会下载到手机、上传至路由器并调用既有受控固件升级流程。下载完成后若 Release 提供 SHA-256 digest，将显示该值并用于信息比对；缺少 digest 时不得伪称已验证。

| 边界 | 设计决定 |
|---|---|
| 仓库访问 | 首版仅支持公开 GitHub 仓库，不要求或保存 GitHub Token。 |
| 链接输入 | 接受 `github.com/owner/repo`、`/releases`、`/releases/latest` 或具体 Release 链接；解析失败时拒绝请求。 |
| 资产选择 | 不自动猜测设备机型；用户必须在资产列表中明确选择 `.bin` 固件。 |
| 风险控制 | 下载、上传、执行 `sysupgrade` 分为独立步骤；执行前显示目标路由器和固件文件名并进行最终确认。 |
| 兼容性 | 不承诺任意第三方固件与路由器型号兼容；应用仅传递用户选定的 Release 资产。 |

## 来源

[1] GitHub Docs, REST API endpoints for releases: https://docs.github.com/en/rest/releases/releases

[2] GitHub Docs, REST API endpoints for release assets: https://docs.github.com/en/rest/releases/assets

## 弱信号设备与 Docker 容器管理

OpenWrt 官方无线工具文档说明，`iwinfo` 是其无线信息库的命令行入口，在 AP 模式可通过 `iwinfo <interface> assoclist` 获取已关联的客户端。弱信号页面将以运行时关联表中的 MAC 地址、信号值和噪声值为基础，计算信噪比并按风险排序；如果驱动未返回关联表或信号字段，则明确显示“当前无线驱动未报告”，而不展示虚构结果。[3]

OpenWrt 软件包数据库记录 `dockerd` 为 Docker CE Engine，并列出 `containerd`、iptables、veth 与防火墙组件等依赖。容器管理页面因此先执行 Docker CLI 可用性检测，只有路由器实际安装并运行 Docker 时才展示容器列表、资源与日志；不主动安装 Docker，也不对不存在的容器执行命令。[4]

| 功能 | 运行时探测 | 受控操作边界 |
|---|---|---|
| 弱信号设备 | `iwinfo <设备> assoclist` 与现有无线/客户端信息交叉归并 | 仅分析与跳转到现有无线管理，不更改无线配置。 |
| Docker | `command -v docker`、`docker info` 与 `docker ps` | 仅对解析到的容器 ID 允许查看日志、start/stop/restart；每次状态变更均需确认。 |
| 性能基准 | BusyBox `ping`、系统负载与接口状态 | 有界次数与超时，避免长时间占用路由器 CPU 或带宽。 |

[3] OpenWrt Wiki, Wireless Utilities: https://openwrt.org/docs/guide-user/network/wifi/wireless-tool/wireless.utilities

[4] OpenWrt Wiki, package: dockerd: https://openwrt.org/packages/pkgdata/dockerd
