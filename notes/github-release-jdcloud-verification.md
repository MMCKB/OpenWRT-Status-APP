# GitHub 指定 Release 标签核验记录

来源：<https://github.com/MMCKB/OpenWRT/releases/tag/JDCloud>（2026-08-18 访问）。

该 URL 是公开仓库 `MMCKB/OpenWRT` 的有效 Release 页面，指定标签为 `JDCloud`。页面列出 8 个资产，其中包含 `immortalwrt-qualcommax-ipq60xx-jdcloud_re-ss-01-squashfs-factory.bin` 与 `immortalwrt-qualcommax-ipq60xx-jdcloud_re-ss-01-squashfs-sysupgrade.bin`。应用应将 `/releases/tag/<标签>` 解析为指定标签，并使用 GitHub API 的 `repos/{owner}/{repo}/releases/tags/{tag}` 端点查询，而不是查询 `/releases/latest`。
