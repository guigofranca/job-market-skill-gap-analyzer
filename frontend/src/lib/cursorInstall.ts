/** The connector's name in the apps that take it from us (Cursor's link, Claude Code). */
export const MCP_SERVER_NAME = 'empregos'

/**
 * Cursor's MCP install link: it opens the app, which asks before adding the server. The config is
 * the same JSON as an mcp.json entry, in base64.
 */
export function cursorInstallLink(url: string): string {
  const config = btoa(JSON.stringify({ url }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${encodeURIComponent(config)}`
}
