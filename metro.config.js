const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Android 的 Gradle/CMake 产物在本地四 ABI 构建后会生成大量文件；它们不属于 JS
// 依赖图，监听它们既无意义，也会耗尽 Linux 的文件监视器配额。
config.resolver.blockList = [
  /\/android\/(?:\.gradle|build|app\/build|app\/\.cxx)\/.*/,
];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
