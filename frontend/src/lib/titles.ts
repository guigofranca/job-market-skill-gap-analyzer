/*
 * Some companies post titles in capitals ("ANALISTA DE SUPORTE TÉCNICO JÚNIOR"). Shown as is they
 * shout in a list of normal titles, so all-caps titles are displayed in title case. Titles with
 * any lowercase letter are left untouched: their casing is the company's choice.
 */

const SMALL_WORDS = new Set(
  'a o as os à ao aos e em na no nas nos de da do das dos para por com ou'.split(' '),
)

/** Kept in capitals. */
const ACRONYMS = new Set(
  [
    'TI IT IA AI BI ML QA UX UI API APIS ERP SAP NOC AWS GCP SOC SRE',
    'CLT PJ PCD ETL RPA TIC DBA BU NET VTEX',
    // The 27 state codes ("Suporte Técnico - SP").
    'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO',
  ].flatMap((line) => line.split(' ')),
)

const SPECIAL: Record<string, string> = { JR: 'Jr', SR: 'Sr', PL: 'Pl', DEVOPS: 'DevOps' }

const VOWEL = /[AEIOUÁÉÍÓÚÂÊÔÃÕÀ]/

export function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '')
  return letters.length >= 4 && letters === letters.toLocaleUpperCase('pt-BR')
}

/** "ESTAGIÁRIO(A) DE TI - SP" -> "Estagiário(a) de TI - SP". */
export function displayTitle(title: string): string {
  if (!isAllCaps(title)) return title
  let index = 0
  return title.replace(/[\p{L}\p{N}]+/gu, (word, offset: number) => {
    const first = index === 0
    index += 1
    // The "(A)" / "/A" gender ending attached to the previous word.
    if (word.length === 1 && /\p{L}[(/]$/u.test(title.slice(Math.max(0, offset - 2), offset))) {
      return word.toLocaleLowerCase('pt-BR')
    }
    const special = SPECIAL[word]
    if (special) return special
    // Acronyms, codes with digits ("N1") and vowel-less words ("SQL", "CRM", "PHP").
    if (ACRONYMS.has(word) || /\d/.test(word) || (word.length > 1 && !VOWEL.test(word))) {
      return word
    }
    const lower = word.toLocaleLowerCase('pt-BR')
    if (!first && SMALL_WORDS.has(lower)) return lower
    return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
  })
}
