interface HexViewProps { bytes: Uint8Array }

export function HexView({ bytes }: HexViewProps) {
  if (bytes.length === 0) return <p className="filelab-empty">El archivo contiene 0 bytes.</p>
  const rows = Array.from({ length: Math.ceil(bytes.length / 16) }, (_, index) => bytes.slice(index * 16, index * 16 + 16))
  return (
    <div className="hex-view" role="table" aria-label={`${bytes.length} bytes en hexadecimal`}>
      {rows.map((row, rowIndex) => (
        <div className="hex-row" role="row" key={rowIndex}>
          <code className="hex-offset" role="cell">{(rowIndex * 16).toString(16).padStart(4, '0')}</code>
          <code className="hex-bytes" role="cell">{[...row].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}</code>
          <code className="hex-ascii" role="cell">{[...row].map((byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·').join('')}</code>
        </div>
      ))}
    </div>
  )
}
