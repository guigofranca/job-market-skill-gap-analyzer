import { MAX_CV_CHARS } from './cvSkills'

export const MAX_CV_BYTES = 5 * 1024 * 1024
export const MAX_PDF_PAGES = 10

/** A problem the visitor can act on; `message` is shown as is. */
export class CvFileError extends Error {}

export interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  hasEOL: boolean
}

/**
 * Text of a CV file, read in this browser (the file is never uploaded). PDF and plain text are
 * accepted; Word documents should be saved as PDF first.
 */
export async function readCvFile(file: File): Promise<string> {
  if (file.size > MAX_CV_BYTES) {
    throw new CvFileError('O arquivo passa de 5 MB. O PDF de um currículo costuma ser bem menor.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isPdf(bytes)) return extractPdfText(bytes)
  if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return new TextDecoder().decode(bytes).slice(0, MAX_CV_CHARS)
  }
  throw new CvFileError(
    'Formato não suportado. Envie um PDF (no Word ou no Google Docs: Arquivo → Salvar/Baixar como PDF).',
  )
}

/** PDF files start with "%PDF-" (the spec allows it anywhere in the first 1 KB). */
export function isPdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes('%PDF-')
}

/**
 * Rebuild readable text from pdf.js text items: a new line when the baseline changes, a space
 * when two runs on the same line are apart (some PDFs place each word separately).
 */
export function itemsToText(items: readonly PdfTextItem[]): string {
  let text = ''
  let previous: PdfTextItem | undefined
  for (const item of items) {
    if (previous && !previous.hasEOL) {
      const sameLine = Math.abs((item.transform[5] ?? 0) - (previous.transform[5] ?? 0)) < 2
      if (!sameLine) {
        text += '\n'
      } else {
        const gap = (item.transform[4] ?? 0) - ((previous.transform[4] ?? 0) + previous.width)
        if (gap > 1 && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' '
      }
    }
    text += item.str
    if (item.hasEOL) text += '\n'
    previous = item
  }
  return text
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Loaded on demand: pdf.js is large and most visits never open a file.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  // No WebAssembly or font loading: only the text is needed (and the CSP stays strict).
  const task = pdfjs.getDocument({ data: bytes, useWasm: false, disableFontFace: true })
  let document
  try {
    document = await task.promise
  } catch (error) {
    await task.destroy()
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new CvFileError('Este PDF tem senha. Gere uma versão sem senha e envie de novo.')
    }
    throw new CvFileError('Não conseguimos ler este PDF. Tente exportar o currículo de novo.')
  }

  try {
    const pages: string[] = []
    const count = Math.min(document.numPages, MAX_PDF_PAGES)
    for (let number = 1; number <= count; number += 1) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      pages.push(itemsToText(content.items.filter((item) => 'str' in item)))
      if (pages.join('\n').length >= MAX_CV_CHARS) break
    }
    const text = pages.join('\n').slice(0, MAX_CV_CHARS)
    if (text.trim().length < 20) {
      throw new CvFileError(
        'Não encontramos texto neste PDF: ele parece ser uma imagem escaneada. Exporte o currículo como PDF direto do Word, do Google Docs ou do LinkedIn.',
      )
    }
    return text
  } finally {
    await task.destroy()
  }
}
