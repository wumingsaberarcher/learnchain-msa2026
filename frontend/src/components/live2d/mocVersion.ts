/** Read moc3 format version from file header (byte at offset 4 after "MOC3"). */
export async function readMoc3Version(mocUrl: string): Promise<number | null> {
  try {
    const res = await fetch(mocUrl)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength < 8) return null
    const view = new DataView(buf)
    const magic =
      String.fromCharCode(view.getUint8(0)) +
      String.fromCharCode(view.getUint8(1)) +
      String.fromCharCode(view.getUint8(2)) +
      String.fromCharCode(view.getUint8(3))
    if (magic !== 'MOC3') return null
    return view.getUint32(4, true)
  } catch {
    return null
  }
}
