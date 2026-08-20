import type { RemoteFileEntry } from "@/lib/router-file-commands";

export type FileSortMode = "name" | "size" | "modified";

export function filterFileEntries(entries: RemoteFileEntry[], searchTerm: string) {
  const normalized = searchTerm.trim().toLocaleLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => entry.name.toLocaleLowerCase().includes(normalized));
}

export function sortFileEntries(entries: RemoteFileEntry[], mode: FileSortMode) {
  return [...entries].sort((left, right) => {
    const directoryOrder = Number(right.kind === "directory") - Number(left.kind === "directory");
    if (directoryOrder !== 0) return directoryOrder;

    if (mode === "size") {
      const sizeOrder = (right.size ?? -1) - (left.size ?? -1);
      if (sizeOrder !== 0) return sizeOrder;
    }

    if (mode === "modified") {
      const dateOrder = (right.modifiedAt ?? "").localeCompare(left.modifiedAt ?? "");
      if (dateOrder !== 0) return dateOrder;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}
