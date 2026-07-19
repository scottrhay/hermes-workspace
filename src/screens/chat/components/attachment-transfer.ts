export function dedupeTransferredFiles(files: Array<File>): Array<File> {
  const seen = new Set<string>()

  return files.filter((file) => {
    // Browsers can expose one pasted image through both clipboard items and
    // clipboard files with different synthetic lastModified values.
    const key = `${file.name}:${file.size}:${file.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
