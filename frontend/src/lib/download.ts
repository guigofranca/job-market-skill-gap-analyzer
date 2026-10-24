/** Hands the visitor a file made in the browser (nothing is uploaded). */
export function downloadFile(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Revoked after the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
