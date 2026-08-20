import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface StartupErrorBoundaryProps {
  children: ReactNode;
}

interface StartupErrorBoundaryState {
  error: Error | null;
}

/**
 * 防止首屏 JavaScript 渲染异常直接终止 Android 进程。错误被捕获后保留在
 * 可见页面内，用户可以重试进入界面，而不是只能看到系统“已停止运行”弹窗。
 */
export class StartupErrorBoundary extends Component<
  StartupErrorBoundaryProps,
  StartupErrorBoundaryState
> {
  state: StartupErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StartupErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("启动界面渲染失败", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>启动模块未能完成加载</Text>
        <Text selectable style={styles.message}>
          {this.state.error.message || "未知启动错误"}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>重新尝试</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101719",
    padding: 28,
  },
  title: { color: "#F4FBFB", fontSize: 21, fontWeight: "700", marginBottom: 12 },
  message: { color: "#B7C8C8", fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 24 },
  button: { backgroundColor: "#007E7A", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  buttonPressed: { opacity: 0.76 },
  buttonLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
