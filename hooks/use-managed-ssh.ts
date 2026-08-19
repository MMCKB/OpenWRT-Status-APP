import { useCallback, useState } from "react";

import {
  connectInAppSsh,
  isInAppSshConnectedFor,
  isInAppSshSupported,
  runInAppSshCommand,
} from "@/lib/native-ssh";
import { useRouterStore } from "@/lib/router-provider";

export function useManagedSsh() {
  const { selectedProfile, getSelectedCredentials } = useRouterStore();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (command: string) => {
      if (!selectedProfile) throw new Error("请先选择一台路由器。");
      if (!isInAppSshSupported())
        throw new Error(
          "此功能需要安装最新 Android APK。Web 预览不会加载应用内 SSH。 ",
        );
      setIsRunning(true);
      setError(null);
      try {
        if (!isInAppSshConnectedFor(selectedProfile)) {
          const credentials = await getSelectedCredentials();
          if (!credentials)
            throw new Error(
              "未找到本机保存的 SSH 密码，请编辑路由器资料后再试。",
            );
          await connectInAppSsh(selectedProfile, credentials.sshPassword);
        }
        return await runInAppSshCommand(command);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "SSH 操作失败。";
        setError(message);
        throw new Error(message);
      } finally {
        setIsRunning(false);
      }
    },
    [getSelectedCredentials, selectedProfile],
  );

  return {
    execute,
    isRunning,
    error,
    hasRouter: Boolean(selectedProfile),
    isSupported: isInAppSshSupported(),
  };
}
