# OpenWrt 网络管理功能研究记录

## DHCP 与静态租约

OpenWrt 默认以 `dnsmasq` 提供 IPv4 DHCP/DNS 服务，并使用 `/etc/config/dhcp` 作为配置文件；默认动态租约文件为 `/tmp/dhcp.leases`。静态租约使用 `config host` 区段，关键字段为 `mac`、`ip`、`name` 与可选的 `leasetime`。每条静态租约必须至少指定 MAC、DUID 或名称之一；新增、修改或删除后应在成功校验后执行 `uci commit dhcp` 与 `/etc/init.d/dnsmasq reload`，而不直接拼接用户输入的 shell 文本。

实现时应以 `uci show dhcp` 的受控读取结果作为静态配置的唯一来源，以 `/tmp/dhcp.leases` 的运行时记录作为动态 IPv4 租约来源，并将两者按 MAC 地址归并。IPv6/DUID 信息为补充展示，避免将 DHCPv6 状态误写为 IPv4 静态租约。

## 后续待验证的接口

| 能力 | 候选来源 | 实现前验证点 |
|---|---|---|
| 每设备实时流量 | 现有主机表、ARP 邻居表与 nftables/iptables 计数器 | 默认 OpenWrt 不保证按设备保留流量计数；必须明确“可用时展示，不可用时说明原因”。 |
| 无线扫描与信道占用 | `ubus call iwinfo devices`、`ubus call iwinfo scan` 或 `iwinfo <iface> scan` | 不同无线驱动输出、频段字段与扫描权限不同；须使用 JSON 接口优先、CLI 输出回退。 |

## 无线扫描与信道建议

OpenWrt 官方无线工具说明指出，`iwinfo` 是汇集多来源数据的命令行前端，且被 LuCI 使用；不同无线芯片与驱动支持的工具不同。对于 AP 模式下已关联的无线客户端，文档给出 `iwinfo <interface> assoclist` 和 mac80211 场景的 `iw dev <interface> station dump` 两种读取方式。因此应用应将无线扫描与客户端信息按“能力探测—JSON 优先—CLI 回退—不可用提示”的链路实现，绝不根据固定接口名假设所有路由器都有 `wlan0`。

信道建议将只基于扫描到的同频/相邻信道网络数和信号强度做出保守排序，并清楚提示扫描结果受射频驱动、国家码、双频并发 AP 与设备位置影响。应用配置前须显示将修改的无线设备、信道、带宽和重载操作，待用户确认后才写入 UCI 并重载无线服务。

## 参考资料

1. [OpenWrt：DHCP 与 DNS 配置（/etc/config/dhcp）](https://openwrt.org/docs/guide-user/base-system/dhcp)，访问于 2026-08-17。
2. [OpenWrt：无线工具](https://openwrt.org/docs/guide-user/network/wifi/wireless-tool/wireless.utilities)，访问于 2026-08-17。
