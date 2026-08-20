export type RemoteEntryKind = "directory" | "file" | "link" | "other";

export interface RemoteFileEntry {
  name: string;
  path: string;
  kind: RemoteEntryKind;
  mode: string | null;
  size: number | null;
  modifiedAt: string | null;
}

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export function normalizeRemotePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  if (!trimmed.startsWith("/")) throw new Error("文件路径必须以 / 开头。");

  const parts: string[] = [];
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") continue;
    if (CONTROL_CHARACTER.test(segment)) throw new Error("文件路径不能包含控制字符。");
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

export function joinRemotePath(directory: string, name: string) {
  const parent = normalizeRemotePath(directory);
  const itemName = name.trim();
  if (!itemName || itemName === "." || itemName === ".." || itemName.includes("/") || CONTROL_CHARACTER.test(itemName)) {
    throw new Error("名称不能为空，且不能包含 / 或控制字符。");
  }
  return parent === "/" ? `/${itemName}` : `${parent}/${itemName}`;
}

export function parentRemotePath(path: string) {
  const normalized = normalizeRemotePath(path);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  return index === 0 ? "/" : normalized.slice(0, index);
}

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function quotedPath(path: string) {
  return shellQuote(normalizeRemotePath(path));
}

export function buildListDirectoryCommand(path: string) {
  const directory = quotedPath(path);
  return `dir=${directory}; [ -d "$dir" ] || { printf '__MANUS_NOT_DIRECTORY__'; exit 1; }; for item in "$dir"/* "$dir"/.[!.]* "$dir"/..?*; do [ -e "$item" ] || [ -L "$item" ] || continue; name=\${item##*/}; if [ -d "$item" ]; then kind=d; elif [ -L "$item" ]; then kind=l; elif [ -f "$item" ]; then kind=f; else kind=o; fi; mode=$(stat -c %a "$item" 2>/dev/null || printf ''); size=$(wc -c < "$item" 2>/dev/null || printf ''); modified=$(date -r "$item" '+%Y-%m-%d %H:%M' 2>/dev/null || printf ''); printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$kind" "$mode" "$size" "$modified"; done`;
}

export function parseDirectoryEntries(output: string, directory: string): RemoteFileEntry[] {
  const normalizedDirectory = normalizeRemotePath(directory);
  const kindByCode: Record<string, RemoteEntryKind> = { d: "directory", f: "file", l: "link", o: "other" };

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, kindCode, rawMode, rawSize, rawModifiedAt] = line.split("\t");
      if (!name || !kindCode) return null;
      try {
        return {
          name,
          path: joinRemotePath(normalizedDirectory, name),
          kind: kindByCode[kindCode] ?? "other",
          mode: /^[0-7]{3,4}$/.test(rawMode ?? "") ? rawMode : null,
          size: /^\d+$/.test(rawSize ?? "") ? Number(rawSize) : null,
          modifiedAt: rawModifiedAt || null,
        } satisfies RemoteFileEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is RemoteFileEntry => entry !== null)
    .sort((left, right) => Number(right.kind === "directory") - Number(left.kind === "directory") || left.name.localeCompare(right.name));
}

export function buildReadTextCommand(path: string, maxBytes = 65536) {
  const target = quotedPath(path);
  return `size=$(wc -c < ${target} 2>/dev/null) || exit 1; if [ "$size" -gt ${Math.max(1, Math.floor(maxBytes))} ]; then printf '__MANUS_FILE_TOO_LARGE__:%s' "$size"; else cat ${target}; fi`;
}

export function parseReadableText(output: string) {
  const match = output.match(/^__MANUS_FILE_TOO_LARGE__:(\d+)$/);
  return match ? { content: null, tooLargeBytes: Number(match[1]) } : { content: output, tooLargeBytes: null };
}

export function buildWriteTextCommand(path: string, base64Content: string, temporaryPath: string) {
  const target = quotedPath(path);
  const temporary = quotedPath(temporaryPath);
  return `umask 077; printf '%s' ${shellQuote(base64Content)} | base64 -d > ${temporary} && mv -f ${temporary} ${target}`;
}

export function buildCreateDirectoryCommand(path: string) {
  return `mkdir ${quotedPath(path)}`;
}

export function buildRenameCommand(sourcePath: string, newName: string) {
  const source = normalizeRemotePath(sourcePath);
  const destination = joinRemotePath(parentRemotePath(source), newName);
  return `mv ${shellQuote(source)} ${shellQuote(destination)}`;
}

export function buildCopyCommand(sourcePath: string, destinationDirectory: string) {
  const source = normalizeRemotePath(sourcePath);
  return `cp -Rp ${shellQuote(source)} ${quotedPath(destinationDirectory)}`;
}

export function buildMoveCommand(sourcePath: string, destinationDirectory: string) {
  const source = normalizeRemotePath(sourcePath);
  return `mv ${shellQuote(source)} ${quotedPath(destinationDirectory)}`;
}

export function buildDeleteCommand(path: string) {
  return `rm -rf ${quotedPath(path)}`;
}

export function buildChmodCommand(path: string, mode: string) {
  if (!/^[0-7]{3,4}$/.test(mode.trim())) throw new Error("权限必须为 3 或 4 位八进制数字，例如 644 或 0755。");
  return `chmod ${mode.trim()} ${quotedPath(path)}`;
}

export function buildFinalizeUploadCommand(temporaryPath: string, destinationPath: string) {
  return `mv -f ${quotedPath(temporaryPath)} ${quotedPath(destinationPath)}`;
}

export function createTemporaryUploadPath(fileName: string) {
  const compact = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "upload";
  return `/tmp/.manus-file-${Date.now()}-${compact}`;
}

export function createTemporaryWritePath(targetPath: string) {
  return joinRemotePath(parentRemotePath(targetPath), `.manus-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

export function formatRemoteSize(size: number | null) {
  if (size === null) return "大小未知";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
