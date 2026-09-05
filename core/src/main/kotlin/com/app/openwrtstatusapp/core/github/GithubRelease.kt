package com.app.openwrtstatusapp.core.github

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

data class GithubReleaseAsset(
    val id: Long,
    val name: String,
    val size: Long,
    val downloadUrl: String,
    val contentType: String?,
    val firmwareCandidate: Boolean,
)

data class GithubRelease(
    val owner: String,
    val repository: String,
    val tagName: String,
    val name: String?,
    val publishedAt: String?,
    val body: String?,
    val htmlUrl: String,
    val assets: List<GithubReleaseAsset>,
)

/** 平移自 lib/github-release.ts。 */
object GithubReleaseClient {
    private val GITHUB_HOSTS = setOf("github.com", "www.github.com")
    private val DOWNLOAD_HOSTS = setOf(
        "github.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com",
    )
    private val json = Json { ignoreUnknownKeys = true }
    private val http = OkHttpClient()

    private fun releaseUrlError() = IllegalArgumentException(
        "请填写 GitHub 仓库的 Release 链接，例如 https://github.com/owner/repository/releases",
    )

    fun parseGithubReleaseUrl(value: String): Triple<String, String, String?> {
        val parsed = try {
            java.net.URI(value.trim())
        } catch (error: Exception) {
            throw releaseUrlError()
        }
        if (parsed.scheme?.lowercase() != "https" || parsed.host?.lowercase() !in GITHUB_HOSTS) {
            throw releaseUrlError()
        }
        val segments = parsed.rawPath.split("/").filter { it.isNotEmpty() }
        val isRepositoryRelease = segments.size == 3
        val isTaggedRelease = segments.size == 5 && segments[3] == "tag" &&
            Regex("^[A-Za-z0-9_.-]+$").matches(segments[4])
        if ((!isRepositoryRelease && !isTaggedRelease) || segments.getOrNull(2) != "releases" ||
            !Regex("^[A-Za-z0-9_.-]+$").matches(segments.getOrElse(0) { "" }) ||
            !Regex("^[A-Za-z0-9_.-]+$").matches(segments.getOrElse(1) { "" })
        ) {
            throw releaseUrlError()
        }
        return Triple(segments[0], segments[1], if (isTaggedRelease) segments[4] else null)
    }

    private fun isFirmwareCandidate(name: String): Boolean =
        Regex("(?:sysupgrade|factory|firmware|openwrt).*(?:\\.bin|\\.img|\\.itb|\\.squashfs|\\.gz|\\.zip)$", RegexOption.IGNORE_CASE)
            .containsMatchIn(name) ||
            Regex("(?:\\.bin|\\.img|\\.itb|\\.squashfs)$", RegexOption.IGNORE_CASE).containsMatchIn(name)

    private fun safeDownloadUrl(value: Any?): String? {
        val raw = value as? String ?: return null
        return try {
            val parsed = java.net.URI(raw)
            if (parsed.scheme?.lowercase() == "https" && parsed.host?.lowercase() in DOWNLOAD_HOSTS) {
                parsed.toString()
            } else {
                null
            }
        } catch (error: Exception) {
            null
        }
    }

    private fun stringValue(value: Any?): String? =
        (value as? JsonPrimitive)?.takeIf { it.isString && it.content.isNotBlank() }?.content

    private fun parseGithubRelease(owner: String, repository: String, payload: Any?): GithubRelease? {
        val item = payload as? JsonObject ?: return null
        val tagName = stringValue(item["tag_name"]) ?: return null
        val htmlUrl = safeDownloadUrl(item["html_url"]) ?: return null
        val assets = (item["assets"] as? JsonArray)?.mapNotNull { asset ->
            val entry = asset as? JsonObject ?: return@mapNotNull null
            val id = (entry["id"] as? JsonPrimitive)?.doubleOrNull?.toLong() ?: return@mapNotNull null
            val name = stringValue(entry["name"]) ?: return@mapNotNull null
            val downloadUrl = safeDownloadUrl(entry["browser_download_url"]) ?: return@mapNotNull null
            val size = (entry["size"] as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
            if (!size.isFinite() || size < 0) return@mapNotNull null
            GithubReleaseAsset(
                id = id, name = name, size = size.toLong(), downloadUrl = downloadUrl,
                contentType = stringValue(entry["content_type"]),
                firmwareCandidate = isFirmwareCandidate(name),
            )
        } ?: emptyList()
        return GithubRelease(
            owner = owner,
            repository = repository,
            tagName = tagName,
            name = stringValue(item["name"]),
            publishedAt = stringValue(item["published_at"]),
            body = stringValue(item["body"]),
            htmlUrl = htmlUrl,
            assets = assets,
        )
    }

    private fun githubApiUrl(owner: String, repository: String, path: String): String =
        "https://api.github.com/repos/${java.net.URLEncoder.encode(owner, "UTF-8")}/" +
            java.net.URLEncoder.encode(repository, "UTF-8") + path

    private suspend fun fetchJson(url: String): Any? = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .build()
        http.newCall(request).execute().use { response ->
            if (response.code == 404) {
                throw IllegalArgumentException("未找到公开的 Release。请确认链接正确且仓库公开。")
            }
            if (!response.isSuccessful) {
                throw IllegalArgumentException("GitHub 标签查询失败（HTTP ${response.code}）。")
            }
            json.parseToJsonElement(response.body?.string() ?: "")
        }
    }

    /** 枚举公开 Release 的全部分页。 */
    suspend fun fetchGithubReleases(sourceUrl: String): List<GithubRelease> {
        val (owner, repository, _) = parseGithubReleaseUrl(sourceUrl)
        val releases = mutableListOf<GithubRelease>()
        val seenTags = mutableSetOf<String>()
        var page = 1
        while (true) {
            val payload = fetchJson(githubApiUrl(owner, repository, "/releases?per_page=100&page=$page"))
            val list = payload as? JsonArray
                ?: throw IllegalArgumentException("GitHub Release 返回的数据格式不正确。")
            for (entry in list) {
                val release = parseGithubRelease(owner, repository, entry)
                if (release != null && seenTags.add(release.tagName)) {
                    releases.add(release)
                }
            }
            if (list.size < 100) break
            page += 1
        }
        if (releases.isEmpty()) {
            throw IllegalArgumentException("未找到公开的 Release 标签。请确认仓库已发布 Release。")
        }
        return releases
    }

    suspend fun fetchLatestGithubRelease(sourceUrl: String): GithubRelease {
        val (owner, repository, requestedTag) = parseGithubReleaseUrl(sourceUrl)
        val releasePath = if (requestedTag != null) {
            "/releases/tags/${java.net.URLEncoder.encode(requestedTag, "UTF-8")}"
        } else {
            "/releases/latest"
        }
        val payload = try {
            fetchJson(githubApiUrl(owner, repository, releasePath))
        } catch (error: IllegalArgumentException) {
            if (requestedTag != null) {
                throw IllegalArgumentException(
                    "未找到公开的 Release 标签“$requestedTag”。请确认链接、标签名称和仓库可见性。",
                )
            }
            throw IllegalArgumentException(
                "未找到公开的最新 Release。请确认链接正确、仓库公开且已发布非预发行版本。",
            )
        }
        return parseGithubRelease(owner, repository, payload)
            ?: throw IllegalArgumentException("GitHub Release 返回的数据不完整。")
    }

    private fun versionNumbers(value: String): List<Long> =
        Regex("\\d+").findAll(value.lowercase().removePrefix("v")).map { it.value.toLong() }.toList()

    /** 大于 0 表示 latest 更新;0 表示相同;小于 0 表示当前更新;null 无法比较。 */
    fun compareReleaseVersion(current: String?, latestTag: String): Int? {
        if (current.isNullOrBlank() || latestTag.isBlank()) return null
        val left = versionNumbers(current)
        val right = versionNumbers(latestTag)
        if (left.isEmpty() || right.isEmpty()) return null
        for (index in 0 until maxOf(left.size, right.size)) {
            val delta = (right.getOrElse(index) { 0 }) - (left.getOrElse(index) { 0 })
            if (delta != 0L) return if (delta > 0) 1 else -1
        }
        return 0
    }
}
