/** Normalize transport newlines, including a CR/LF split across pipe chunks.
 * JSON string escapes stay untouched; only actual CRLF bytes become LF.
 */
export function appendFrame(buffer: string, chunk: string) {
  if (buffer.endsWith("\r")) return buffer.slice(0, -1) + ("\r" + chunk).replace(/\r\n/g, "\n")
  return buffer + chunk.replace(/\r\n/g, "\n")
}
