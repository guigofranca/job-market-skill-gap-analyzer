import { describe, expect, it } from 'vitest'
import {
  CvFileError,
  isPdf,
  itemsToText,
  MAX_CV_BYTES,
  readCvFile,
  type PdfTextItem,
} from './cvFile'

const item = (str: string, x: number, y: number, width: number, hasEOL = false): PdfTextItem => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  width,
  hasEOL,
})

describe('itemsToText', () => {
  it('keeps words apart and starts a new line when the baseline changes', () => {
    const text = itemsToText([
      item('Python', 10, 700, 30),
      item('SQL', 45, 700, 15), // 5 units after "Python": a separate word
      item('Power', 10, 680, 25),
      item(' BI', 35, 680, 10),
    ])
    expect(text).toBe('Python SQL\nPower BI')
  })

  it('does not split a word written in two runs', () => {
    expect(itemsToText([item('Estatís', 10, 700, 30), item('tica', 40, 700, 15)])).toBe(
      'Estatística',
    )
  })

  it('follows explicit line ends', () => {
    expect(itemsToText([item('Git', 10, 700, 15, true), item('Docker', 10, 700, 30)])).toBe(
      'Git\nDocker',
    )
  })
})

describe('readCvFile', () => {
  it('recognises a PDF by its signature, not by its name', () => {
    expect(isPdf(new TextEncoder().encode('%PDF-1.7\n...'))).toBe(true)
    expect(isPdf(new TextEncoder().encode('PK\u0003\u0004 word document'))).toBe(false)
  })

  it('reads plain text files', async () => {
    const file = new File(['Projetos com Python e SQL'], 'cv.txt', { type: 'text/plain' })
    await expect(readCvFile(file)).resolves.toBe('Projetos com Python e SQL')
  })

  it('rejects other formats and oversized files with a helpful message', async () => {
    const docx = new File(['PK...'], 'curriculo.docx')
    await expect(readCvFile(docx)).rejects.toThrow(/Salvar\/Baixar como PDF/)
    const huge = new File([new Uint8Array(MAX_CV_BYTES + 1)], 'cv.pdf', {
      type: 'application/pdf',
    })
    await expect(readCvFile(huge)).rejects.toBeInstanceOf(CvFileError)
  })
})
