# Haven SSH 终端交互参考

本次控制页重构仅借鉴 Haven 的终端交互原则，不复制其代码或界面资产。Haven 将终端会话、连接状态、滚动回显与键盘工具栏组织为专注的工作区；其文档也强调终端具备文本选择与可配置的常用按键工具栏。[1]

本应用保留单一 OpenWrt SSH 会话，采用深色等宽输出区、简洁连接状态栏、底部命令输入行和一排常用控制键。软件包读取、命令快捷预设和状态页终端入口都会移除，使用户只在“控制”标签内进行 SSH 连接与命令输入。

## 参考文献

[1]: https://github.com/GlassHaven/Haven/blob/main/docs/features/terminal.md "Haven Terminal Documentation"
