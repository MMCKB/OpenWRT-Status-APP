# GitHub PAT 可读但 Git 推送 403：研究记录

本文记录 v1.0.14 发布前对 `MMCKB/OpenWRT-Status-APP` 写入拒绝问题的官方资料研究与本地只读诊断结果。它不包含访问令牌、路由器凭据或任何其他敏感信息。

## 已观察到的现象

本地使用 HTTPS Git 凭据对目标仓库执行推送时，GitHub 返回 `Permission to MMCKB/OpenWRT-Status-APP.git denied to MMCKB` 和 HTTP 403。相同凭据能够读取仓库，并可查询到账号对仓库的管理员/推送身份权限。

只读 API 诊断确认，目标仓库为公开仓库，默认分支为 `main`，未启用分支保护，也未发现仓库规则集。因此，当前证据不支持“分支保护或规则集阻止写入”这一解释。

## 官方资料要点

GitHub 说明，PAT 可以作为 HTTPS 命令行认证中的密码替代品；但令牌能够执行的操作既受令牌所有者本身权限约束，也会受到授予给令牌的 scope 或细粒度权限进一步限制。[1]

GitHub 的令牌格式表明确将 `ghp_` 识别为 **Personal access token (classic)**，而 `github_pat_` 才是细粒度 PAT。用户此前提供的两个令牌均为 `ghp_` 前缀，因此应优先按经典 PAT 的 scope 配置排查，而非在细粒度 PAT 的 Resource owner/Repository access 页面中调整。[4]

对于细粒度 PAT，令牌先受所选 Resource owner 限制，随后还受所选 Repository access 与明确授予的 repository permissions 限制。GitHub 还指出，所有公开仓库会拥有只读访问；因此“能够读取公开仓库”本身并不能证明令牌获得了该仓库的写入授权。[1]

官方 OAuth scope 文档将 `workflow` 列为独立 scope，并特别说明 GitHub Actions workflow 文件存在额外的提交限制。因此，这次首次推送所包含的 `.github/workflows/build-android.yml` 不能仅依赖普通的仓库内容读取授权。[2]

GitHub Actions 运行时的 Release 发布应使用平台提供的 `${{ secrets.GITHUB_TOKEN }}`，并以 workflow/job `permissions` 显式限制为所需的最小范围。当前工作流的 release job 已显式声明 `contents: write`，无需把个人 PAT 写入工作流。[3]

## 可验证的修复配置

| 令牌类型 | 目标仓库写入所需配置 |
| --- | --- |
| 细粒度 PAT | Resource owner 选择 `MMCKB`；Repository access 覆盖 `MMCKB/OpenWRT-Status-APP`；Repository permissions 至少授予 **Contents: Read and write**，并为首次提交 Actions workflow 文件授予 **Workflows: Read and write**。 |
| 经典 PAT（当前用户所提供的类型） | 勾选 **repo**（公开仓库可使用 `public_repo`，但本项目为减少歧义使用 `repo`）以及 **workflow**，然后重新生成令牌。仅生成令牌而未选择 scope 时，仍可读取公开仓库，但无法推送此项目。 |

在获得新令牌后，应先执行一次 HTTPS Git push 验证；成功后才继续观察 Actions 运行和 GitHub Release。令牌只通过安全凭据通道传入环境，不写入源码、工作流或日志。

## 参考资料

[1]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens "Managing your personal access tokens - GitHub Docs"
[2]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes "Scopes for OAuth apps - GitHub Docs"
[3]: https://docs.github.com/en/actions/reference/authentication-in-a-workflow "Use GITHUB_TOKEN for authentication in workflows - GitHub Docs"
[4]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github "About authentication to GitHub - GitHub Docs"
