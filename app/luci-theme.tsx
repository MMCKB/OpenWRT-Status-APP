import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppDialog as Alert } from "@/components/app-dialog";
import { ManagementShell, ToolNotice } from "@/components/management-shell";
import { EmptyState, SectionCard } from "@/components/status-ui";
import { useColors } from "@/hooks/use-colors";
import { useManagedSsh } from "@/hooks/use-managed-ssh";
import {
  buildLuciThemesSnapshotCommand,
  buildSetLuciThemeCommand,
  parseLuciThemes,
  type LuciTheme,
} from "@/lib/openwrt-luci-system";

export default function LuciThemeScreen() {
  const colors = useColors();
  const { execute, error, hasRouter, isRunning, isSupported } = useManagedSsh();
  const [themes, setThemes] = useState<LuciTheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasRouter || !isSupported) return;
    setLoading(true);
    setNotice(null);
    try {
      setThemes(
        parseLuciThemes(await execute(buildLuciThemesSnapshotCommand())),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "无法读取 LuCI 主题。",
      );
    } finally {
      setLoading(false);
    }
  }, [execute, hasRouter, isSupported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disabled = !hasRouter || !isSupported || isRunning || loading;

  function requestThemeChange(theme: LuciTheme) {
    if (theme.active) return;
    Alert.alert(
      "切换 LuCI 主题",
      `将 LuCI 网页管理主题切换为“${theme.name}”。切换时 uhttpd 会短暂重载，浏览器中的 LuCI 页面需要刷新。是否继续？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "切换主题",
          onPress: () =>
            void (async () => {
              setLoading(true);
              setNotice(null);
              try {
                const output = await execute(
                  buildSetLuciThemeCommand(theme.name),
                );
                setNotice(
                  output.trim() ||
                    `已切换为 ${theme.name}，请刷新浏览器中的 LuCI 页面。`,
                );
                await refresh();
              } catch (reason) {
                setNotice(
                  reason instanceof Error
                    ? reason.message
                    : "LuCI 主题切换失败。",
                );
              } finally {
                setLoading(false);
              }
            })(),
        },
      ],
    );
  }

  return (
    <ManagementShell
      title="LuCI 主题"
      description="只显示路由器中实际安装的主题。切换仅更新 LuCI 的 mediaurlbase 设置并重载 uhttpd。"
    >
      <SectionCard
        title="可用主题"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新 LuCI 主题"
            disabled={disabled}
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.refresh,
              { borderColor: colors.border },
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.refreshText, { color: colors.primary }]}>
                刷新
              </Text>
            )}
          </Pressable>
        }
      >
        {themes.length ? (
          themes.map((theme, index) => (
            <Pressable
              key={theme.name}
              accessibilityRole="button"
              disabled={disabled || theme.active}
              onPress={() => requestThemeChange(theme)}
              style={({ pressed }) => [
                styles.themeRow,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
                pressed && !theme.active && styles.pressed,
                (disabled || theme.active) && theme.active && styles.activeRow,
              ]}
            >
              <View
                style={[
                  styles.themeIcon,
                  {
                    backgroundColor: theme.active
                      ? `${colors.primary}1F`
                      : colors.background,
                  },
                ]}
              >
                <MaterialIcons
                  name="palette"
                  size={21}
                  color={theme.active ? colors.primary : colors.muted}
                />
              </View>
              <View style={styles.themeCopy}>
                <Text style={[styles.themeName, { color: colors.foreground }]}>
                  {theme.name}
                </Text>
                <Text
                  style={[
                    styles.themeHint,
                    { color: theme.active ? colors.primary : colors.muted },
                  ]}
                >
                  {theme.active ? "当前使用" : "点按切换"}
                </Text>
              </View>
              <MaterialIcons
                name={theme.active ? "check-circle" : "chevron-right"}
                size={theme.active ? 20 : 22}
                color={theme.active ? colors.primary : colors.muted}
              />
            </Pressable>
          ))
        ) : (
          <EmptyState
            icon="palette"
            title={
              hasRouter && isSupported ? "未发现可切换主题" : "尚未连接路由器"
            }
            description={
              hasRouter && isSupported
                ? "请确认 LuCI 主题已安装，并点击刷新重新读取。"
                : "连接应用内 SSH 后即可读取路由器中已安装的 LuCI 主题。"
            }
          />
        )}
      </SectionCard>
      {notice || error ? (
        <ToolNotice>
          <Text style={[styles.notice, { color: colors.foreground }]}>
            {notice ?? error}
          </Text>
        </ToolNotice>
      ) : null}
    </ManagementShell>
  );
}

const styles = StyleSheet.create({
  refresh: {
    minHeight: 34,
    minWidth: 54,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  refreshText: { fontSize: 12, fontWeight: "800" },
  themeRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 2,
    paddingVertical: 12,
  },
  themeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  themeCopy: { flex: 1, gap: 3 },
  themeName: { fontSize: 15, fontWeight: "800" },
  themeHint: { fontSize: 12, fontWeight: "600" },
  notice: { fontSize: 13, lineHeight: 19 },
  activeRow: { opacity: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
