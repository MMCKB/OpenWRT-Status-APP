package com.app.openwrtstatusapp.core.commands

enum class RemoteEntryKind { DIRECTORY, FILE, LINK, OTHER }

data class RemoteFileEntry(
    val name: String,
    val path: String,
    val kind: RemoteEntryKind,
    val mode: String?,
    val size: Long?,
    val modifiedAt: String?,
)

/** 平移自 lib/router-file-commands.ts。 */
object RouterFileCommands {
    private val CONTROL_CHARACTER = Regex("[\\u0000-\\u001f\\u007f]")

    fun normalizeRemotePath(value: String): String {
        val trimmed = value.trim()
        if (trimmed.isEmpty() || trimmed == "/") return "/"
        if (!trimmed.startsWith("/")) throw IllegalArgumentException("文件路径必须以 / 开头。")
        val parts = mutableListOf<String>()
        for (segment in trimmed.split("/")) {
            if (segment.isEmpty() || segment == ".") continue
            if (CONTROL_CHARACTER.containsMatchIn(segment)) {
                throw IllegalArgumentException("文件路径不能包含控制字符。")
            }
            if (segment == "..") {
                if (parts.isNotEmpty()) parts.removeAt(parts.size - 1)
                continue
            }
            parts.add(segment)
        }
        return "/" + parts.joinToString("/")
    }

    fun joinRemotePath(directory: String, name: String): String {
        val parent = normalizeRemotePath(directory)
        val itemName = name.trim()
        if (itemName.isEmpty() || itemName == "." || itemName == ".." ||
            itemName.contains("/") || CONTROL_CHARACTER.containsMatchIn(itemName)
        ) {
            throw IllegalArgumentException("名称不能为空，且不能包含 / 或控制字符。")
        }
        return if (parent == "/") "/$itemName" else "$parent/$itemName"
    }

    fun parentRemotePath(path: String): String {
        val normalized = normalizeRemotePath(path)
        if (normalized == "/") return "/"
        val index = normalized.lastIndexOf("/")
        return if (index == 0) "/" else normalized.substring(0, index)
    }

    fun shellQuote(value: String): String =
        "'" + value.replace("'", "'\\''") + "'"

    private fun quotedPath(path: String): String = shellQuote(normalizeRemotePath(path))

    fun buildListDirectoryCommand(path: String): String {
        val directory = quotedPath(path)
        return "dir=$directory; [ -d \"\$dir\" ] || { printf '__MANUS_NOT_DIRECTORY__'; exit 1; }; " +
            "for item in \"\$dir\"/* \"\$dir\"/.[!.]* \"\$dir\"/..?*; do [ -e \"\$item\" ] || [ -L \"\$item\" ] || continue; " +
            "name=\${item##*/}; if [ -d \"\$item\" ]; then kind=d; elif [ -L \"\$item\" ]; then kind=l; " +
            "elif [ -f \"\$item\" ]; then kind=f; else kind=o; fi; " +
            "mode=\$(stat -c %a \"\$item\" 2>/dev/null || printf ''); size=\$(wc -c < \"\$item\" 2>/dev/null || printf ''); " +
            "modified=\$(date -r \"\$item\" '+%Y-%m-%d %H:%M' 2>/dev/null || printf ''); " +
            "printf '%s\\t%s\\t%s\\t%s\\t%s\\n' \"\$name\" \"\$kind\" \"\$mode\" \"\$size\" \"\$modified\"; done"
    }

    fun parseDirectoryEntries(output: String, directory: String): List<RemoteFileEntry> {
        val normalizedDirectory = normalizeRemotePath(directory)
        val kindByCode = mapOf("d" to RemoteEntryKind.DIRECTORY, "f" to RemoteEntryKind.FILE, "l" to RemoteEntryKind.LINK, "o" to RemoteEntryKind.OTHER)
        return output.split(Regex("\r?\n"))
            .filter { it.isNotEmpty() }
            .mapNotNull { line ->
                val fields = line.split("\t")
                val name = fields.getOrNull(0)
                val kindCode = fields.getOrNull(1)
                if (name.isNullOrEmpty() || kindCode.isNullOrEmpty()) return@mapNotNull null
                try {
                    val rawMode = fields.getOrNull(2)
                    val rawSize = fields.getOrNull(3)
                    val rawModifiedAt = fields.getOrNull(4)
                    RemoteFileEntry(
                        name = name,
                        path = joinRemotePath(normalizedDirectory, name),
                        kind = kindByCode[kindCode] ?: RemoteEntryKind.OTHER,
                        mode = if (Regex("^[0-7]{3,4}$").matches(rawMode ?: "")) rawMode else null,
                        size = if (Regex("^\\d+$").matches(rawSize ?: "")) rawSize?.toLong() else null,
                        modifiedAt = rawModifiedAt?.ifEmpty { null },
                    )
                } catch (error: Exception) {
                    null
                }
            }
            .sortedWith(
                compareByDescending<RemoteFileEntry> { it.kind == RemoteEntryKind.DIRECTORY }
                    .thenBy { it.name },
            )
    }

    fun buildReadTextCommand(path: String, maxBytes: Long = 65536): String {
        val target = quotedPath(path)
        return "size=\$(wc -c < $target 2>/dev/null) || exit 1; " +
            "if [ \"\$size\" -gt ${maxOf(1L, maxBytes)} ]; then printf '__MANUS_FILE_TOO_LARGE__:%s' \"\$size\"; else cat $target; fi"
    }

    fun parseReadableText(output: String): Pair<String?, Long?> {
        val match = Regex("^__MANUS_FILE_TOO_LARGE__:(\\d+)$").find(output)
        return if (match != null) null to match.groupValues[1].toLong()
        else output to null
    }

    fun buildWriteTextCommand(path: String, base64Content: String, temporaryPath: String): String {
        val target = quotedPath(path)
        val temporary = quotedPath(temporaryPath)
        return "umask 077; printf '%s' ${shellQuote(base64Content)} | base64 -d > $temporary && mv -f $temporary $target"
    }

    fun buildCreateDirectoryCommand(path: String): String = "mkdir ${quotedPath(path)}"

    fun buildRenameCommand(sourcePath: String, newName: String): String {
        val source = normalizeRemotePath(sourcePath)
        val destination = joinRemotePath(parentRemotePath(source), newName)
        return "mv ${shellQuote(source)} ${shellQuote(destination)}"
    }

    fun buildCopyCommand(sourcePath: String, destinationDirectory: String): String {
        val source = normalizeRemotePath(sourcePath)
        return "cp -Rp ${shellQuote(source)} ${quotedPath(destinationDirectory)}"
    }

    fun buildMoveCommand(sourcePath: String, destinationDirectory: String): String {
        val source = normalizeRemotePath(sourcePath)
        return "mv ${shellQuote(source)} ${quotedPath(destinationDirectory)}"
    }

    fun buildDeleteCommand(path: String): String = "rm -rf ${quotedPath(path)}"

    fun buildChmodCommand(path: String, mode: String): String {
        if (!Regex("^[0-7]{3,4}$").matches(mode.trim())) {
            throw IllegalArgumentException("权限必须为 3 或 4 位八进制数字，例如 644 或 0755。")
        }
        return "chmod ${mode.trim()} ${quotedPath(path)}"
    }

    fun buildFinalizeUploadCommand(temporaryPath: String, destinationPath: String): String =
        "mv -f ${quotedPath(temporaryPath)} ${quotedPath(destinationPath)}"

    fun createTemporaryUploadPath(fileName: String): String {
        val compact = fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_").takeLast(80).ifEmpty { "upload" }
        return "/tmp/.manus-file-${System.currentTimeMillis()}-$compact"
    }

    fun createTemporaryWritePath(targetPath: String): String =
        joinRemotePath(
            parentRemotePath(targetPath),
            ".manus-write-${System.currentTimeMillis()}-${java.util.UUID.randomUUID().toString().substring(0, 6)}",
        )

    fun formatRemoteSize(size: Long?): String {
        if (size == null) return "大小未知"
        if (size < 1024) return "$size B"
        if (size < 1024 * 1024) return String.format(java.util.Locale.ROOT, "%.1f KB", size / 1024.0)
        return String.format(java.util.Locale.ROOT, "%.1f MB", size / 1024.0 / 1024.0)
    }
}

enum class FileSortMode { NAME, SIZE, MODIFIED }

/** 平移自 lib/file-manager-utils.ts。 */
object FileManagerUtils {
    fun filterFileEntries(entries: List<RemoteFileEntry>, searchTerm: String): List<RemoteFileEntry> {
        val normalized = searchTerm.trim().lowercase()
        if (normalized.isEmpty()) return entries
        return entries.filter { it.name.lowercase().contains(normalized) }
    }

    fun sortFileEntries(entries: List<RemoteFileEntry>, mode: FileSortMode): List<RemoteFileEntry> =
        entries.sortedWith { left, right ->
            val directoryOrder =
                (if (right.kind == RemoteEntryKind.DIRECTORY) 1 else 0) -
                    (if (left.kind == RemoteEntryKind.DIRECTORY) 1 else 0)
            if (directoryOrder != 0) return@sortedWith directoryOrder
            if (mode == FileSortMode.SIZE) {
                val sizeOrder = (right.size ?: -1L).compareTo(left.size ?: -1L)
                if (sizeOrder != 0) return@sortedWith sizeOrder
            }
            if (mode == FileSortMode.MODIFIED) {
                val dateOrder = (right.modifiedAt ?: "").compareTo(left.modifiedAt ?: "")
                if (dateOrder != 0) return@sortedWith dateOrder
            }
            left.name.compareTo(right.name, ignoreCase = true)
        }
}
