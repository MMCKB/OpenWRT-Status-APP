# OpenWrt 管理功能参考

本轮服务控制与防火墙实现遵循 OpenWrt 的初始化脚本与 UCI 配置习惯。应用只对固定服务名执行 `/etc/init.d/<服务> start|stop|restart`，并在写入端口转发配置后执行 `uci commit firewall` 与防火墙重载；所有页面仍在用户确认后才发送写入命令。

## 官方参考

- [OpenWrt Technical Reference — Init Scripts](https://openwrt.org/docs/techref/initscripts)
