package com.app.openwrtstatusapp.core.commands

import java.net.URI

/** 平移自 lib/openwrt-luci-system.ts 的命令构建函数,输出与 TS 版逐字一致。 */
object LuciSystemCommands {
    private val shell = Shell

    // ---------- 启动项 ----------

    fun buildStartupSnapshotCommand(): String =
        "for link in /etc/rc.d/S*; do [ -L \"\$link\" ] || continue; target=\$(readlink \"\$link\"); " +
            "name=\$(basename \"\$target\"); printf 'STARTUP|%s|enabled\\n' \"\$name\"; done; " +
            "for file in /etc/init.d/*; do [ -x \"\$file\" ] || continue; name=\$(basename \"\$file\"); " +
            "[ -e \"/etc/rc.d/S\"*\"\$name\" ] || printf 'STARTUP|%s|disabled\\n' \"\$name\"; done | sort -t'|' -k2,2"

    fun buildStartupActionCommand(service: String, shouldEnable: Boolean): String {
        if (!shell.serviceRegex().matches(service)) throw IllegalArgumentException("服务名称不合法。")
        return "[ -x /etc/init.d/$service ] || { echo '服务未安装。'; exit 2; }; " +
            "/etc/init.d/$service ${if (shouldEnable) "enable" else "disable"}; " +
            "echo '$service 已${if (shouldEnable) "加入" else "移出"}开机启动。'"
    }

    // ---------- LED ----------

    fun buildLedSnapshotCommand(): String =
        "uci -q show system | awk -F= '/=led\$/{section=\$1; sub(/^system\\./,\"\",section); " +
            "print \"LED|\" section \"|name|\" section} " +
            "/^system\\.[^.]+\\.(name|sysfs|trigger|delayon|delayoff|dev|mode)=/{key=\$1; " +
            "sub(/^system\\.[^.]+\\./,\"\",key); value=\$2; gsub(/\\047/,\"\",value); split(\$1,p,\".\"); " +
            "print \"LED|\" p[2] \"|\" key \"|\" value}'"

    fun buildLedCapabilitiesSnapshotCommand(): String =
        "for led in /sys/class/leds/*; do [ -d \"\$led\" ] || continue; name=\$(basename \"\$led\"); " +
            "printf 'LEDCAP|device|%s\\n' \"\$name\"; [ -r \"\$led/trigger\" ] || continue; " +
            "tr ' ' '\\n' < \"\$led/trigger\" | tr -d '[]' | awk '/^[A-Za-z0-9_.:-]+\$/ { print \"LEDCAP|trigger|\" \$0 }'; done; " +
            "ip -o link 2>/dev/null | awk -F': ' '{name=\$2; sub(/@.*/, \"\", name); " +
            "if (name ~ /^[A-Za-z0-9_.:-]+\$/) print \"LEDCAP|netdev|\" name}' | sort -u"

    fun buildSaveLedCommand(settings: LedSetting): String {
        shell.assertSection(settings.section)
        shell.assertValue(settings.name, "LED 名称")
        shell.assertValue(settings.sysfs, "LED 设备")
        shell.assertValue(settings.trigger, "LED 触发器")
        assertLedIntervals(settings.trigger, settings.delayOn, settings.delayOff)
        assertLedNetdev(settings.trigger, settings.netdevDevice, settings.netdevMode)
        val base = "system.${settings.section}"
        val timerWrites =
            if (settings.trigger == "timer")
                "${shell.uciSet("$base.delayon", settings.delayOn)}; ${shell.uciSet("$base.delayoff", settings.delayOff)};"
            else "${shell.uciDelete("$base.delayon")}; ${shell.uciDelete("$base.delayoff")};"
        val netdevWrites =
            if (settings.trigger == "netdev")
                "${shell.uciSet("$base.dev", settings.netdevDevice)}; ${shell.uciSet("$base.mode", settings.netdevMode)};"
            else "${shell.uciDelete("$base.dev")}; ${shell.uciDelete("$base.mode")};"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo 'LED 配置不存在。'; exit 2; }; " +
            "existing=\$(uci -q get ${shell.quote("$base.name")}); " +
            "if uci -q show system | sed -n \"s/^system\\.[^.]*\\.name='\\(.*\\)'\$/\\1/p\" " +
            "| grep -Fx ${shell.quote(settings.name)} | grep -Fvx \"\$existing\" >/dev/null; " +
            "then echo 'LED 名称已存在。'; exit 2; fi; " +
            "${shell.uciSet("$base.name", settings.name)}; ${shell.uciSet("$base.sysfs", settings.sysfs)}; " +
            "${shell.uciSet("$base.trigger", settings.trigger)}; $timerWrites $netdevWrites " +
            "${shell.uciDelete("$base.color")}; ${shell.uciDelete("$base.default")}; uci commit system; " +
            "([ -x /etc/init.d/led ] && /etc/init.d/led restart) || /etc/init.d/system reload; echo 'LED 设置已保存并重新加载。'"
    }

    fun buildAddLedCommand(settings: LedSetting): String {
        shell.assertValue(settings.name, "LED 名称")
        shell.assertValue(settings.sysfs, "LED 设备")
        shell.assertValue(settings.trigger, "LED 触发器")
        assertLedIntervals(settings.trigger, settings.delayOn, settings.delayOff)
        assertLedNetdev(settings.trigger, settings.netdevDevice, settings.netdevMode)
        val timerWrites =
            if (settings.trigger == "timer")
                "uci set \"system.\$section.delayon=${settings.delayOn}\"; uci set \"system.\$section.delayoff=${settings.delayOff}\";"
            else ""
        val netdevWrites =
            if (settings.trigger == "netdev")
                "uci set \"system.\$section.dev=${settings.netdevDevice}\"; uci set \"system.\$section.mode=${settings.netdevMode}\";"
            else ""
        return "if uci -q show system | sed -n \"s/^system\\.[^.]*\\.name='\\(.*\\)'\$/\\1/p\" " +
            "| grep -Fx ${shell.quote(settings.name)} >/dev/null; then echo 'LED 名称已存在。'; exit 2; fi; " +
            "section=\$(uci add system led); uci set \"system.\$section.name=${settings.name}\"; " +
            "uci set \"system.\$section.sysfs=${settings.sysfs}\"; uci set \"system.\$section.trigger=${settings.trigger}\"; " +
            "$timerWrites $netdevWrites uci commit system; " +
            "([ -x /etc/init.d/led ] && /etc/init.d/led restart) || /etc/init.d/system reload; echo 'LED 已新增并重新加载。'"
    }

    private fun assertLedIntervals(trigger: String, delayOn: String, delayOff: String) {
        if (trigger != "timer") return
        for ((label, value) in listOf("开启时间" to delayOn, "关闭时间" to delayOff)) {
            if (!Regex("^\\d{1,8}$").matches(value) || value.toInt() < 1) {
                throw IllegalArgumentException("${label}必须为正整数毫秒。")
            }
        }
    }

    private fun assertLedNetdev(trigger: String, device: String, mode: String) {
        if (trigger != "netdev") return
        if (!shell.ledOptionRegex().matches(device)) {
            throw IllegalArgumentException("网络设备活动必须选择有效的网络设备。")
        }
        if (!Regex("^(link|tx|rx|link tx|link rx|tx rx|link tx rx)$").matches(mode)) {
            throw IllegalArgumentException("网络设备活动触发方式不合法。")
        }
    }

    fun buildDeleteLedCommand(section: String): String {
        shell.assertSection(section)
        val base = "system.$section"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo 'LED 配置不存在。'; exit 2; }; " +
            "${shell.uciDelete(base)}; uci commit system; " +
            "([ -x /etc/init.d/led ] && /etc/init.d/led restart) || /etc/init.d/system reload; echo 'LED 已删除。'"
    }

    // ---------- 挂载点 ----------

    fun buildMountSnapshotCommand(): String =
        "uci -q show fstab | awk -F= '/=mount\$/{section=\$1; sub(/^fstab\\./,\"\",section); " +
            "print \"MOUNT|\" section \"|section|\" section} " +
            "/^fstab\\.[^.]+\\.(target|device|uuid|fstype|enabled|enabled_fsck)=/{key=\$1; " +
            "sub(/^fstab\\.[^.]+\\./,\"\",key); value=\$2; gsub(/\\047/,\"\",value); split(\$1,p,\".\"); " +
            "print \"MOUNT|\" p[2] \"|\" key \"|\" value}'; " +
            "awk '{print \"MOUNTED|\" \$2 \"|\" \$1 \"|\" \$3}' /proc/mounts 2>/dev/null; " +
            "swapon --noheadings --raw --output NAME 2>/dev/null | awk 'NF {print \"SWAP|\" \$1}'"

    fun buildMountActionCommand(section: String, shouldEnable: Boolean): String {
        shell.assertSection(section)
        val base = "fstab.$section"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; " +
            "cp /etc/config/fstab /etc/config/fstab.app-backup.\$(date +%s); " +
            "${shell.uciSet("$base.enabled", if (shouldEnable) "1" else "0")}; uci commit fstab; " +
            "/etc/init.d/fstab restart; block mount 2>/dev/null || true; " +
            "echo '挂载点已${if (shouldEnable) "启用" else "停用"}。'"
    }

    private fun assertMountPoint(settings: MountPoint) {
        shell.assertValue(settings.target, "挂载路径")
        shell.assertValue(settings.device, "设备或 UUID")
        shell.assertValue(settings.fstype, "文件系统类型")
        if (!settings.target.startsWith("/")) throw IllegalArgumentException("挂载路径必须以 / 开头。")
    }

    private fun mountWrites(base: String, settings: MountPoint): String =
        listOf(
            shell.uciSet("$base.target", settings.target),
            shell.uciSet("$base.device", settings.device),
            shell.uciSet("$base.fstype", settings.fstype),
            shell.uciSet("$base.enabled", if (settings.enabled) "1" else "0"),
            shell.uciSet("$base.enabled_fsck", if (settings.enabledFsck) "1" else "0"),
        ).joinToString("; ")

    fun buildAddMountCommand(settings: MountPoint): String {
        assertMountPoint(settings)
        return "section=\$(uci add fstab mount); ${mountWrites("fstab.\$section", settings)}; " +
            "uci commit fstab; /etc/init.d/fstab restart; block mount 2>/dev/null || true; echo '挂载点已新增。'"
    }

    fun buildSaveMountCommand(settings: MountPoint): String {
        shell.assertSection(settings.section)
        assertMountPoint(settings)
        val base = "fstab.${settings.section}"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; " +
            "${mountWrites(base, settings)}; uci commit fstab; /etc/init.d/fstab restart; " +
            "block mount 2>/dev/null || true; echo '挂载点已保存。'"
    }

    fun buildDeleteMountCommand(section: String): String {
        shell.assertSection(section)
        val base = "fstab.$section"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '挂载点配置不存在。'; exit 2; }; " +
            "${shell.uciDelete(base)}; uci commit fstab; /etc/init.d/fstab restart; echo '挂载点已删除。'"
    }

    fun buildGenerateMountConfigCommand(): String =
        "block detect > /etc/config/fstab; uci commit fstab; /etc/init.d/fstab restart; " +
            "echo '已根据已连接设备生成挂载配置。'"

    fun buildMountConnectedDevicesCommand(): String =
        "block mount; echo '已尝试挂载已连接的设备与交换分区。'"

    fun buildAutoMountUnconfiguredCommand(): String =
        "block mount; swapon -a 2>/dev/null || true; echo '已尝试自动挂载未配置的磁盘分区和交换分区。'"

    // ---------- SSH(Dropbear) ----------

    fun buildSshAccessSnapshotCommand(): String =
        "[ -x /etc/init.d/dropbear ] && echo 'SSH|installed|yes' || echo 'SSH|installed|no'; " +
            "uci -q show dropbear 2>/dev/null | awk -F= '/=dropbear\$/{section=\$1; sub(/^dropbear\\./,\"\",section); " +
            "print \"SSHINSTANCE|\" section \"|section|\" section} " +
            "/^dropbear\\.[^.]+\\.(Port|Interface|PasswordAuth|RootPasswordAuth|GatewayPorts|enable)=/{key=\$1; " +
            "sub(/^dropbear\\.[^.]+\\./,\"\",key); value=\$2; gsub(/\\047/,\"\",value); split(\$1,p,\".\"); " +
            "print \"SSHINSTANCE|\" p[2] \"|\" key \"|\" value}'"

    fun buildSaveSshAccessCommand(settings: SshAccessSettings): String {
        shell.assertPort(settings.port, "SSH 端口")
        return "[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; " +
            "cp /etc/config/dropbear /etc/config/dropbear.app-backup.\$(date +%s); " +
            "${shell.uciSet("dropbear.@dropbear[0].Port", settings.port)}; " +
            "${shell.uciSet("dropbear.@dropbear[0].PasswordAuth", if (settings.passwordAuth) "on" else "off")}; " +
            "${shell.uciSet("dropbear.@dropbear[0].RootPasswordAuth", if (settings.rootPasswordAuth) "on" else "off")}; " +
            "uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 管理权限已保存。'"
    }

    private fun assertDropbearInstance(settings: DropbearInstance) {
        shell.assertPort(settings.port, "SSH 端口")
        if (settings.listenInterface.isNotBlank()) shell.assertValue(settings.listenInterface, "监听接口")
    }

    private fun dropbearInstanceWrites(base: String, settings: DropbearInstance): String {
        val interfaces = settings.listenInterface.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        return listOf(
            shell.uciSet("$base.Port", settings.port),
            shell.uciDelete("$base.Interface"),
            *interfaces.map { item -> "uci add_list ${shell.quote("$base.Interface=$item")}" }.toTypedArray(),
            shell.uciSet("$base.PasswordAuth", if (settings.passwordAuth) "on" else "off"),
            shell.uciSet("$base.RootPasswordAuth", if (settings.rootPasswordAuth) "on" else "off"),
            shell.uciSet("$base.GatewayPorts", if (settings.gatewayPorts) "on" else "off"),
            shell.uciSet("$base.enable", if (settings.enabled) "1" else "0"),
        ).joinToString("; ")
    }

    fun buildSaveSshInstanceCommand(settings: DropbearInstance): String {
        shell.assertSection(settings.section)
        assertDropbearInstance(settings)
        val base = "dropbear.${settings.section}"
        return "[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; " +
            "uci -q get ${shell.quote(base)} >/dev/null || { echo 'SSH 实例不存在。'; exit 2; }; " +
            "${dropbearInstanceWrites(base, settings)}; uci commit dropbear; /etc/init.d/dropbear restart; " +
            "echo 'SSH 实例已保存。'"
    }

    fun buildAddSshInstanceCommand(settings: DropbearInstance): String {
        assertDropbearInstance(settings)
        return "[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; " +
            "section=\$(uci add dropbear dropbear); ${dropbearInstanceWrites("dropbear.\$section", settings)}; " +
            "uci commit dropbear; /etc/init.d/dropbear restart; echo 'SSH 实例已新增。'"
    }

    fun buildSshInstanceActionCommand(section: String, shouldEnable: Boolean): String {
        shell.assertSection(section)
        val base = "dropbear.$section"
        return "[ -x /etc/init.d/dropbear ] || { echo 'Dropbear 未安装。'; exit 2; }; " +
            "uci -q get ${shell.quote(base)} >/dev/null || { echo 'SSH 实例不存在。'; exit 2; }; " +
            "${shell.uciSet("$base.enable", if (shouldEnable) "1" else "0")}; uci commit dropbear; " +
            "/etc/init.d/dropbear restart; echo 'SSH 实例已${if (shouldEnable) "启用" else "停用"}。'"
    }

    fun buildChangeRouterPasswordCommand(newPassword: String): String {
        if (newPassword.isEmpty() || newPassword.length > 128 ||
            Regex("[\\u0000\\r\\n:]").containsMatchIn(newPassword)
        ) {
            throw IllegalArgumentException("路由器密码不能为空，且不能包含换行、冒号或空字符。")
        }
        return "command -v chpasswd >/dev/null || { echo '系统未提供 chpasswd。'; exit 2; }; " +
            "printf '%s\\n' ${shell.quote("root:$newPassword")} | chpasswd; echo '路由器 root 密码已修改。'"
    }

    fun buildSshAuthorizedKeysSnapshotCommand(): String =
        "[ -r /etc/dropbear/authorized_keys ] && sed 's/^/SSHKEY|/' /etc/dropbear/authorized_keys || true"

    fun buildAddSshAuthorizedKeyCommand(publicKey: String): String {
        val normalized = publicKey.trim()
        val pattern = Regex("^[A-Za-z0-9@._+-]{2,100} [A-Za-z0-9+/=]{16,20000}(?: [^\\r\\n]{0,160})?$")
        if (!pattern.matches(normalized)) {
            throw IllegalArgumentException("SSH 公钥格式无效，请粘贴完整的一行 OpenSSH 公钥。")
        }
        return "mkdir -p /etc/dropbear; touch /etc/dropbear/authorized_keys; chmod 600 /etc/dropbear/authorized_keys; " +
            "grep -qxF ${shell.quote(normalized)} /etc/dropbear/authorized_keys 2>/dev/null || " +
            "printf '%s\\n' ${shell.quote(normalized)} >> /etc/dropbear/authorized_keys; echo 'SSH 公钥已添加。'"
    }

    // ---------- APK 仓库公钥 ----------

    fun buildApkRepositoryKeysSnapshotCommand(): String =
        "for key in /etc/apk/keys/*; do [ -f \"\$key\" ] || continue; name=\$(basename \"\$key\"); " +
            "case \"\$name\" in ''|*[!A-Za-z0-9._-]*) continue ;; esac; size=\$(wc -c < \"\$key\" | tr -d ' '); " +
            "printf 'APKKEY|%s|%s\\n' \"\$name\" \"\$size\"; done"

    private fun normalizeApkKeyName(name: String): String {
        val trimmed = name.trim()
        return if (trimmed.endsWith(".pub")) trimmed else "$trimmed.pub"
    }

    fun buildAddApkRepositoryKeyCommand(name: String, publicKey: String): String {
        val normalizedName = normalizeApkKeyName(name)
        if (!shell.keyNameRegex().matches(normalizedName)) {
            throw IllegalArgumentException("APK 公钥文件名仅支持字母、数字、点、下划线和连字符。")
        }
        if (publicKey.isBlank() || publicKey.length > 20_000 || Regex("\\u0000").containsMatchIn(publicKey)) {
            throw IllegalArgumentException("APK 公钥内容无效或过长。")
        }
        return "mkdir -p /etc/apk/keys; cp /etc/apk/keys/$normalizedName /etc/apk/keys/$normalizedName.app-backup.\$(date +%s) 2>/dev/null || true; " +
            "printf '%s' ${shell.quote(publicKey.trim())} > /etc/apk/keys/$normalizedName; " +
            "chmod 644 /etc/apk/keys/$normalizedName; echo 'APK 仓库公钥已保存。'"
    }

    fun buildFetchApkRepositoryKeyCommand(name: String, sourceUrl: String): String {
        val normalizedName = normalizeApkKeyName(name)
        if (!shell.keyNameRegex().matches(normalizedName)) {
            throw IllegalArgumentException("APK 公钥文件名仅支持字母、数字、点、下划线和连字符。")
        }
        val uri = try {
            URI(sourceUrl.trim())
        } catch (error: Exception) {
            throw IllegalArgumentException("公钥文件 URL 无效。")
        }
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https" || uri.host.isNullOrEmpty() ||
            !uri.userInfo.isNullOrEmpty() || uri.fragment != null
        ) {
            throw IllegalArgumentException("公钥文件 URL 仅支持无认证的 HTTP(S) 地址。")
        }
        val remote = uri.toString()
        return "mkdir -p /etc/apk/keys; tmp=/tmp/$normalizedName.app-download.\$\$; trap 'rm -f \"\$tmp\"' EXIT; " +
            "(command -v uclient-fetch >/dev/null 2>&1 && uclient-fetch -q -O \"\$tmp\" ${shell.quote(remote)}) || " +
            "(command -v wget >/dev/null 2>&1 && wget -q -O \"\$tmp\" ${shell.quote(remote)}) || " +
            "{ echo '无法下载 APK 仓库公钥。'; exit 2; }; " +
            "[ -s \"\$tmp\" ] && [ \"\$(wc -c < \"\$tmp\")\" -le 20000 ] || { echo '下载的 APK 公钥为空或过长。'; exit 2; }; " +
            "mv \"\$tmp\" /etc/apk/keys/$normalizedName; chmod 644 /etc/apk/keys/$normalizedName; " +
            "echo 'APK 仓库公钥已从 URL 导入。'"
    }

    // ---------- uHTTPd / LuCI 主题 ----------

    fun buildUhttpdSnapshotCommand(): String =
        "[ -x /etc/init.d/uhttpd ] && echo 'UHTTPD|installed|yes' || echo 'UHTTPD|installed|no'; " +
            "uci -q show uhttpd 2>/dev/null | awk -F= '/=uhttpd\$/{section=\$1; sub(/^uhttpd\\./,\"\",section); " +
            "print \"UHTTPD|\" section \"|section|\" section} " +
            "/^uhttpd\\.[^.]+\\.(listen_http|listen_https|redirect_https)=/{key=\$1; sub(/^uhttpd\\.[^.]+\\./,\"\",key); " +
            "value=\$2; gsub(/\\047/,\"\",value); split(\$1,p,\".\"); print \"UHTTPD|\" p[2] \"|\" key \"|\" value}'"

    fun buildSaveUhttpdCommand(settings: UhttpdSettings): String {
        shell.assertSection(settings.section)
        val base = "uhttpd.${settings.section}"
        return "[ -x /etc/init.d/uhttpd ] || { echo 'uhttpd 未安装。'; exit 2; }; " +
            "uci -q get ${shell.quote(base)} >/dev/null || { echo '未找到 uhttpd 配置。'; exit 2; }; " +
            "${shell.uciSet("$base.redirect_https", if (settings.redirectHttps) "1" else "0")}; " +
            "uci commit uhttpd; /etc/init.d/uhttpd reload; echo 'HTTPS 重定向设置已保存。'"
    }

    fun buildLuciThemesSnapshotCommand(): String =
        "active=\$(uci -q get luci.main.mediaurlbase 2>/dev/null || true); active=\"\${active##*/}\"; " +
            "for dir in /www/luci-static/*; do [ -d \"\$dir\" ] || continue; name=\$(basename \"\$dir\"); " +
            "case \"\$name\" in *[!A-Za-z0-9_-]*|'') continue;; esac; " +
            "printf 'THEME|%s|%s\\n' \"\$name\" \"\$([ \"\$name\" = \"\$active\" ] && echo active || echo inactive)\"; done | sort -t'|' -k2,2"

    fun buildSetLuciThemeCommand(theme: String): String {
        if (!Regex("^[A-Za-z0-9_-]{1,64}$").matches(theme)) {
            throw IllegalArgumentException("LuCI 主题名称不合法。")
        }
        val target = "/www/luci-static/$theme"
        return "[ -d ${shell.quote(target)} ] || { echo '未找到此 LuCI 主题。'; exit 2; }; " +
            "uci -q get luci.main >/dev/null || uci set luci.main=core; " +
            "${shell.uciSet("luci.main.mediaurlbase", "/luci-static/$theme")}; uci commit luci; " +
            "/etc/init.d/uhttpd reload 2>/dev/null || true; echo 'LuCI 主题已切换。'"
    }

    // ---------- 网络接口 ----------

    fun buildNetworkInterfaceSnapshotCommand(): String =
        "uci -q show network | awk -F= '/=interface\$/{section=\$1; sub(/^network\\./,\"\",section); " +
            "print \"IFACE|\" section \"|section|\" section} " +
            "/^network\\.[^.]+\\.(proto|device|ifname|ipaddr|netmask|gateway|dns|auto|force_link|defaultroute|" +
            "peerdns|dns_metric|metric|mptcp|ip4table|ip6table|delegate|ip6assign|ip6class|ip6hint|ip6ifaceid|" +
            "ip6weight)=/{key=\$1; sub(/^network\\.[^.]+\\./,\"\",key); value=\$2; gsub(/\\047/,\"\",value); " +
            "split(\$1,p,\".\"); print \"IFACE|\" p[2] \"|\" key \"|\" value}'"

    fun buildNetworkInterfaceOptionsSnapshotCommand(): String =
        "for proto in /lib/netifd/proto/*.sh; do [ -f \"\$proto\" ] || continue; name=\$(basename \"\$proto\" .sh); " +
            "case \"\$name\" in *[!A-Za-z0-9_-]*|'') continue;; esac; printf 'IFOPTION|protocol|%s\\n' \"\$name\"; done; " +
            "uci -q show network | sed -n \"s/^network\\.[^.]*\\.\\(device\\|ifname\\)='\\([^']*\\)'\$/\\2/p\" | tr ' ' '\\n' | " +
            "awk '/^[A-Za-z0-9_.:@-]+\$/ {print \"IFOPTION|device|\" \$0}'; " +
            "ip -o link 2>/dev/null | awk -F': ' '{name=\$2; sub(/@.*/, \"\", name); " +
            "if (name ~ /^[A-Za-z0-9_.:@-]+\$/) print \"IFOPTION|device|\" name}'; " +
            "uci -q show firewall | awk -F= '/=zone\$/{section=\$1; sub(/^firewall\\./,\"\",section); name=section; " +
            "if (section ~ /^[A-Za-z0-9_.-]+\$/) print \"IFZONE|\" section \"|\" name} " +
            "/^firewall\\.[^.]+\\.name=/{section=\$1; sub(/^firewall\\./,\"\",section); sub(/\\.name\$/,\"\",section); " +
            "name=\$2; gsub(/\\047/,\"\",name); print \"IFZONE|\" section \"|\" name}' | sort -u"

    fun buildNetworkInterfaceStatusCommand(): String =
        "ubus call network.interface dump; ip -o link 2>/dev/null | awk '{name=\$2; sub(/:\$/, \"\", name); " +
            "sub(/@.*/, \"\", name); for (i=1; i<=NF; i++) if (\$i == \"link/ether\") { print \"IFMAC|\" name \"|\" \$(i+1); break }}'"

    private fun setOrDelete(base: String, key: String, value: String): String =
        if (value.isNotEmpty()) shell.uciSet("$base.$key", value) else shell.uciDelete("$base.$key")

    fun buildSaveNetworkInterfaceCommand(settings: NetworkInterfaceSettings): String {
        shell.assertSection(settings.section)
        if (!shell.ledOptionRegex().matches(settings.proto)) throw IllegalArgumentException("接口协议不合法。")
        if (settings.firewallZone.isNotEmpty()) shell.assertSection(settings.firewallZone)
        for ((label, value) in linkedMapOf(
            "设备" to settings.device,
            "IPv4 地址" to settings.ipaddr,
            "掩码" to settings.netmask,
            "网关" to settings.gateway,
            "DNS" to settings.dns,
            "DNS 权重" to settings.dnsMetric,
            "网关跃点" to settings.metric,
            "IPv4 路由表" to settings.ip4Table,
            "IPv6 路由表" to settings.ip6Table,
            "IPv6 前缀长度" to settings.ip6Assign,
            "IPv6 前缀过滤器" to settings.ip6Class,
            "IPv6 后缀" to settings.ip6IfaceId,
            "IPv6 优先级" to settings.ip6Weight,
        )) {
            shell.assertValue(value, label)
        }
        val base = "network.${settings.section}"
        val firewallWrites = buildString {
            append("for zone in \$(uci -q show firewall | sed -n \"s/^firewall\\.\\([^.]*\\)=zone\$/\\1/p\"); do ")
            append("networks=\$(uci -q get \"firewall.\$zone.network\"); uci -q delete \"firewall.\$zone.network\"; ")
            append("for network in \$networks; do [ \"\$network\" = ${shell.quote(settings.section)} ] || ")
            append("uci add_list \"firewall.\$zone.network=\$network\"; done; done; ")
            if (settings.firewallZone.isNotEmpty()) {
                append("uci -q get ${shell.quote("firewall.${settings.firewallZone}")} >/dev/null || { echo '防火墙区域不存在。'; exit 2; }; ")
                append("uci add_list ${shell.quote("firewall.${settings.firewallZone}.network=${settings.section}")};")
            }
            append(" uci commit firewall; /etc/init.d/firewall reload 2>/dev/null || true;")
        }
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '接口配置不存在。'; exit 2; }; " +
            "cp /etc/config/network /etc/config/network.app-backup.\$(date +%s); " +
            "${shell.uciSet("$base.proto", settings.proto)}; " +
            "${setOrDelete(base, "device", settings.device)}; " +
            "${setOrDelete(base, "ipaddr", settings.ipaddr)}; " +
            "${setOrDelete(base, "netmask", settings.netmask)}; " +
            "${setOrDelete(base, "gateway", settings.gateway)}; " +
            "${setOrDelete(base, "dns", settings.dns)}; " +
            "${shell.uciSet("$base.auto", if (settings.auto) "1" else "0")}; " +
            "${shell.uciSet("$base.force_link", if (settings.forceLink) "1" else "0")}; " +
            "${shell.uciSet("$base.defaultroute", if (settings.defaultRoute) "1" else "0")}; " +
            "${shell.uciSet("$base.peerdns", if (settings.useCustomDns) "0" else "1")}; " +
            "${setOrDelete(base, "dns_metric", settings.dnsMetric)}; " +
            "${setOrDelete(base, "metric", settings.metric)}; " +
            "${setOrDelete(base, "mptcp", if (settings.mptcp == "off") "" else settings.mptcp)}; " +
            "${setOrDelete(base, "ip4table", settings.ip4Table)}; " +
            "${setOrDelete(base, "ip6table", settings.ip6Table)}; " +
            "${shell.uciSet("$base.delegate", if (settings.delegate) "1" else "0")}; " +
            "${setOrDelete(base, "ip6assign", settings.ip6Assign)}; " +
            "${setOrDelete(base, "ip6class", settings.ip6Class)}; " +
            "${setOrDelete(base, "ip6hint", settings.ip6Hint)}; " +
            "${setOrDelete(base, "ip6ifaceid", settings.ip6IfaceId)}; " +
            "${setOrDelete(base, "ip6weight", settings.ip6Weight)}; uci commit network; " +
            "$firewallWrites /etc/init.d/network reload; echo '接口设置已保存，网络可能短暂重连。'"
    }

    fun buildNetworkInterfaceRestartCommand(section: String): String {
        shell.assertSection(section)
        return "ifdown ${shell.quote(section)} 2>/dev/null || true; sleep 1; ifup ${shell.quote(section)}; " +
            "echo '接口 $section 已重启。'"
    }

    fun buildNetworkInterfaceDeleteCommand(section: String): String {
        shell.assertSection(section)
        val base = "network.$section"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '接口配置不存在。'; exit 2; }; " +
            "cp /etc/config/network /etc/config/network.app-backup.\$(date +%s); ${shell.uciDelete(base)}; " +
            "uci commit network; /etc/init.d/network reload; echo '接口 $section 已删除，网络可能短暂重连。'"
    }

    // ---------- 网络设备与全局 ----------

    fun buildNetworkDeviceSnapshotCommand(): String =
        "uci -q show network | awk -F= '/=device\$/{section=\$1; sub(/^network\\./,\"\",section); " +
            "print \"DEVICE|\" section \"|section|\" section} " +
            "/^network\\.[^.]+\\.(name|type|macaddr|mtu|ipv6)=/{key=\$1; sub(/^network\\.[^.]+\\./,\"\",key); " +
            "value=\$2; gsub(/\\047/,\"\",value); split(\$1,p,\".\"); print \"DEVICE|\" p[2] \"|\" key \"|\" value}'"

    fun buildSaveNetworkDeviceCommand(settings: NetworkDeviceSettings): String {
        shell.assertSection(settings.section)
        shell.assertValue(settings.name, "设备名称")
        shell.assertValue(settings.type, "设备类型")
        if (settings.macaddr.isNotEmpty() &&
            !Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$").matches(settings.macaddr)
        ) {
            throw IllegalArgumentException("MAC 地址格式无效。")
        }
        if (settings.mtu.isNotEmpty() &&
            (!Regex("^\\d{3,5}$").matches(settings.mtu) || settings.mtu.toInt() > 65535)
        ) {
            throw IllegalArgumentException("MTU 必须为 3-5 位且不超过 65535 的数字。")
        }
        val base = "network.${settings.section}"
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '网络设备配置不存在。'; exit 2; }; " +
            "cp /etc/config/network /etc/config/network.app-backup.\$(date +%s); " +
            "${setOrDelete(base, "name", settings.name)}; " +
            "${setOrDelete(base, "type", settings.type)}; " +
            "${setOrDelete(base, "macaddr", settings.macaddr)}; " +
            "${setOrDelete(base, "mtu", settings.mtu)}; " +
            "${shell.uciSet("$base.ipv6", if (settings.ipv6) "1" else "0")}; uci commit network; " +
            "/etc/init.d/network reload; echo '网络设备设置已保存。'"
    }

    fun buildNetworkGlobalSnapshotCommand(): String =
        "uci -q show network | awk -F= '/=globals\$/{section=\$1; sub(/^network\\./,\"\",section); " +
            "print \"GLOBAL|\" section \"|section|\" section} " +
            "/^network\\.[^.]+\\.(ula_prefix|packet_steering)=/{key=\$1; sub(/^network\\.[^.]+\\./,\"\",key); " +
            "value=\$2; gsub(/\\047/,\"\",value); split(\$1,p,\".\"); print \"GLOBAL|\" p[2] \"|\" key \"|\" value}'"

    fun buildSaveNetworkGlobalCommand(settings: NetworkGlobalSettings): String {
        shell.assertSection(settings.section)
        shell.assertValue(settings.ulaPrefix, "IPv6 ULA 前缀")
        if (settings.ulaPrefix.isNotEmpty() &&
            !Regex("^[Ff][CcDd][0-9A-Fa-f:]+/[0-9]{1,3}$").matches(settings.ulaPrefix)
        ) {
            throw IllegalArgumentException("IPv6 ULA 前缀格式无效，例如 fd00:1234::/48。")
        }
        val base = "network.${settings.section}"
        val ulaCommand = if (settings.ulaPrefix.isNotEmpty()) {
            shell.uciSet("$base.ula_prefix", settings.ulaPrefix)
        } else {
            shell.uciDelete("$base.ula_prefix")
        }
        return "uci -q get ${shell.quote(base)} >/dev/null || { echo '全局网络配置不存在。'; exit 2; }; " +
            "cp /etc/config/network /etc/config/network.app-backup.\$(date +%s); $ulaCommand; " +
            "${shell.uciSet("$base.packet_steering", if (settings.packetSteering) "1" else "0")}; " +
            "uci commit network; /etc/init.d/network reload; echo '全局网络设置已保存。'"
    }

    // ---------- 计划任务 ----------

    fun buildScheduledActionCommand(
        minute: String,
        hour: String,
        weekdays: String,
        action: ScheduledAction,
    ): String {
        val cronField = shell.cronFieldRegex()
        if (!cronField.matches(minute) || !cronField.matches(hour) || !cronField.matches(weekdays)) {
            throw IllegalArgumentException("计划时间格式不合法。")
        }
        val tag = "# openwrt-status-app:${action.tag}"
        val line = "$minute $hour * * $weekdays ${action.command} $tag"
        return "(crontab -l 2>/dev/null | grep -vF ${shell.quote(tag)}; printf '%s\\n' ${shell.quote(line)}) | crontab -; " +
            "/etc/init.d/cron restart; echo '计划任务已保存。'"
    }

    fun buildCronSnapshotCommand(): String =
        "crontab -l 2>/dev/null | sed 's/^/CRON|/'"
}
