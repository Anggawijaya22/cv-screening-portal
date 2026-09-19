// Server-only: extract text from Word document formats (DOCX, DOC, RTF, ODT)
export async function extractDocx(buffer: Buffer, ext = 'docx'): Promise<{ text: string; ocr_used: false }> {
  switch (ext.toLowerCase()) {
    case 'docx': return extractDocxMammoth(buffer)
    case 'doc':  return extractDocBinary(buffer)
    case 'rtf':  return extractRtf(buffer)
    case 'odt':  return extractOdt(buffer)
    default: throw new Error(`Format tidak didukung: .${ext}`)
  }
}

// DOCX (Office Open XML / ZIP) via mammoth
async function extractDocxMammoth(buffer: Buffer): Promise<{ text: string; ocr_used: false }> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return { text: result.value?.trim() ?? '', ocr_used: false }
}

// DOC (Word 97-2003 binary OLE2) via cfb + FIB parsing
async function extractDocBinary(buffer: Buffer): Promise<{ text: string; ocr_used: false }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CFB = require('cfb') as { read: (b: Buffer, o: object) => unknown; find: (c: unknown, p: string) => { content: Buffer | Uint8Array } | null }

  let cfb: unknown
  try {
    cfb = CFB.read(buffer, { type: 'buffer' })
  } catch {
    throw new Error('File .doc tidak valid atau rusak')
  }

  const entry = CFB.find(cfb, 'WordDocument')
  if (!entry?.content) throw new Error('File .doc tidak mengandung konten Word')

  const wd = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content)

  // FibBase fields: fcMin at byte 24, cbMac at byte 28, flags at byte 10
  const fcMin   = wd.readUInt32LE(24)
  const cbMac   = wd.readUInt32LE(28)
  const fComplex = (wd.readUInt16LE(10) >> 2) & 1

  let text = ''

  if (!fComplex && fcMin < wd.length && cbMac <= wd.length && cbMac > fcMin) {
    // Simple (non-fast-saved) file: body text is at fcMin..cbMac in CP1252 encoding
    const tb = wd.slice(fcMin, cbMac)
    for (let i = 0; i < tb.length; i++) {
      const b = tb[i]
      if (b === 0x0D || b === 0x07 || b === 0x0C || b === 0x0B) text += '\n' // para/cell/page/col break
      else if (b === 0x09) text += ' ' // tab → space
      else if (b >= 0x20) text += tb.slice(i, i + 1).toString('latin1')
    }
  } else {
    // Fast-saved or unusual layout: scan WordDocument stream for CP1252 text runs
    text = scanCp1252Runs(wd)
  }

  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), ocr_used: false }
}

function scanCp1252Runs(data: Buffer): string {
  const runs: string[] = []
  let run = ''
  // Skip first 256 bytes (FIB header area)
  for (let i = 256; i < data.length; i++) {
    const b = data[i]
    if (b === 0x0D || b === 0x07 || b === 0x0B) {
      if (run.trim().length >= 5) runs.push(run.trim())
      run = ''
    } else if (b === 0x09) {
      run += ' '
    } else if (b >= 0x20 && b <= 0xFF) {
      run += data.slice(i, i + 1).toString('latin1')
    } else {
      if (run.trim().length >= 10) runs.push(run.trim())
      run = ''
    }
  }
  if (run.trim().length >= 5) runs.push(run.trim())
  return [...new Set(runs)].join('\n')
}

// RTF (Rich Text Format) — proper state-machine parser
function extractRtf(buffer: Buffer): { text: string; ocr_used: false } {
  const raw = buffer.toString('latin1')

  // Destinations whose content should be skipped (metadata, not body text)
  const SKIP_DEST = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
    'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf',
    'fldinst', 'datafield', 'listtable', 'listoverridetable', 'rsidtbl',
    'generator', 'expandedcolortbl', 'themedata', 'colorschememapping',
    'latentstyles', 'falt', 'panose', 'ftncn', 'aftncn', 'noui',
    // Word-specific math and formatting groups
    'mmathPr', 'mmath', 'mmathFont', 'mbrkBin', 'formfield', 'shp', 'sp',
    'sv', 'shpinst', 'shptxt', 'fldrslt',
  ])

  type Frame = { skip: boolean }
  const stack: Frame[] = []
  let cur: Frame = { skip: false }
  let out = ''
  let i = 0

  while (i < raw.length) {
    const c = raw[i]

    if (c === '{') {
      stack.push({ ...cur })
      i++
    } else if (c === '}') {
      const top = stack.pop()
      if (top) cur = top
      i++
    } else if (c === '\\') {
      const next = raw[i + 1]

      if (next === '*') {
        // \* marks an ignorable destination — mark current frame as skip
        cur = { skip: true }
        i += 2
      } else if (next === "'") {
        // \'xx hex escape
        if (!cur.skip) {
          const cp = parseInt(raw.slice(i + 2, i + 4), 16)
          if (!isNaN(cp) && cp >= 0x20) out += String.fromCharCode(cp)
        }
        i += 4
      } else if (next === '\n' || next === '\r') {
        i += 2 // line continuation
      } else if (next === '{' || next === '}' || next === '\\') {
        if (!cur.skip) out += next
        i += 2
      } else {
        // Control word: ASCII letters (RTF standard: lowercase only, but Word uses mixed-case extensions)
        let word = ''
        let j = i + 1
        while (j < raw.length && ((raw[j] >= 'a' && raw[j] <= 'z') || (raw[j] >= 'A' && raw[j] <= 'Z'))) { word += raw[j]; j++ }
        // skip optional numeric param
        if (j < raw.length && (raw[j] === '-' || (raw[j] >= '0' && raw[j] <= '9'))) {
          if (raw[j] === '-') j++
          while (j < raw.length && raw[j] >= '0' && raw[j] <= '9') j++
        }
        if (j < raw.length && raw[j] === ' ') j++ // optional trailing space

        if (SKIP_DEST.has(word)) {
          cur = { ...cur, skip: true }
        } else if (!cur.skip) {
          if (word === 'par' || word === 'pard' || word === 'sect' || word === 'page') out += '\n'
          else if (word === 'line') out += '\n'
          else if (word === 'tab') out += ' '
          else if (word === 'cell' || word === 'row') out += ' '
        }

        i = j
      }
    } else {
      if (!cur.skip && c !== '\r' && c !== '\n' && c.charCodeAt(0) >= 0x20) out += c
      i++
    }
  }

  const text = out
    .replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n')
    .trim()

  return { text, ocr_used: false }
}

// ODT (OpenDocument Text) — unzip and parse content.xml
async function extractOdt(buffer: Buffer): Promise<{ text: string; ocr_used: false }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = require('jszip') as { loadAsync: (b: Buffer) => Promise<{ file: (name: string) => { async: (type: string) => Promise<string> } | null }> }
  const zip = await JSZip.loadAsync(buffer)
  const xmlFile = zip.file('content.xml')
  if (!xmlFile) throw new Error('File ODT tidak valid atau rusak')

  const xml = await xmlFile.async('text')
  const text = xml
    .replace(/<text:line-break[^>]*\/?>/g, '\n')
    .replace(/<text:p[^>]*>/g, '\n')
    .replace(/<text:h[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).join('\n')
    .trim()

  return { text, ocr_used: false }
}
