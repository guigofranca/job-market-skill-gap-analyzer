import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/*
 * The main job-seeker flow against the real API and dataset. Assertions avoid exact counts and
 * titles: the dataset changes with every collection.
 */

const jobList = (page: Page) => page.getByRole('list', { name: /^Vagas / })
const jobRows = (page: Page) => jobList(page).locator(':scope > li')

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0)
}

async function expectAccessible(page: Page) {
  // Lists are dimmed while they reload (aria-busy): check the settled page, not a fade.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations.map((item) => `${item.id}: ${item.help}`)).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(jobRows(page).first()).toBeVisible()
})

test('without a profile it lists the newest jobs, linking to the original posting', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: 'Vagas mais recentes' })).toBeVisible()
  const firstLink = jobRows(page).first().getByRole('link').first()
  await expect(firstLink).toHaveAttribute('href', /^https:\/\//)
  await expect(firstLink).toHaveAttribute('target', '_blank')
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('a profile ranks the jobs and says what is missing and where to learn it', async ({
  page,
}) => {
  // Phones fold the profile behind one button, so the first screen shows jobs.
  const profile = page.getByRole('button', { name: 'Marque o que você já sabe' })
  if (await profile.isVisible()) await profile.click()
  // Quick start: the most requested skills are one click away.
  await page
    .getByRole('button', { name: /^Adicionar / })
    .first()
    .click()
  await page
    .getByRole('button', { name: /^Adicionar / })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Vagas que combinam com você' })).toBeVisible()

  await page.getByRole('button', { name: /Falta 1 competência/ }).click()
  const row = jobRows(page).first()
  await expect(row).toContainText('Falta só')
  await expect(
    jobList(page)
      .getByText(/^Aprender .*grátis:/)
      .first(),
  ).toBeVisible()

  const learnNext = page.getByRole('region', { name: 'O que aprender a seguir' })
  const course = learnNext
    .getByText(/^Aprender .*grátis:/)
    .first()
    .getByRole('link')
  await expect(course).toHaveAttribute('href', /^https:\/\//)
  await expect(page.getByText('Cobertura média')).toHaveCount(0)

  // The profile survives a reload (it lives in this browser).
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Vagas que combinam com você' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('a saved job shows up in "Minhas candidaturas"', async ({ page }) => {
  const save = jobRows(page)
    .first()
    .getByRole('button', { name: /^Salvar vaga: / })
  const label = await save.getAttribute('aria-label')
  const title = label?.replace('Salvar vaga: ', '') ?? ''
  await save.click()
  await expect(
    jobRows(page)
      .first()
      .getByRole('button', { name: `Salva: ${title}` }),
  ).toBeVisible()

  await page.getByRole('tab', { name: /candidaturas/i }).click()
  await expect(page).toHaveURL(/aba=candidaturas/)
  await expect(page.getByRole('heading', { name: 'Minhas candidaturas' })).toBeVisible()
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('an opened posting is marked as seen and can be hidden or listed alone', async ({ page }) => {
  const link = jobRows(page).first().getByRole('link').first()
  const title = (await link.textContent())?.replace('(abre em nova aba)', '').trim() ?? ''
  const [posting] = await Promise.all([page.waitForEvent('popup'), link.click()])
  await posting.close()
  await expect(jobRows(page).first()).toContainText('vista agora')

  // Phones fold the filter panel behind one button; "Vistas" sits under "Mais filtros".
  const panel = page.getByRole('button', { name: /^Filtros/ })
  if (await panel.isVisible()) await panel.click()
  await page.getByRole('button', { name: /Mais filtros/ }).click()
  const seen = page.getByLabel('Vistas')

  await seen.selectOption('Só as já vistas')
  await expect(jobRows(page)).toHaveCount(1)
  await expect(jobRows(page).first()).toContainText(title)

  await seen.selectOption('Ocultar as já vistas')
  await expect(jobRows(page).first()).not.toContainText('vista agora')
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})

test('the market tab shows the charts', async ({ page }) => {
  await page.getByRole('tab', { name: 'Mercado' }).click()
  await expect(page).toHaveURL(/aba=mercado/)
  await expect(page.getByRole('heading', { name: 'Categorias de competência' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Estágio × Júnior: o que muda' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Tendência/ })).toBeVisible()
  const workplaces = page.getByRole('figure', { name: /Modalidade de trabalho/ })
  await expect(workplaces.getByText('Todas as áreas')).toBeVisible()

  // A click on a state filters the dashboard and lists that state's cities.
  const states = page.getByRole('figure', { name: 'Ranking dos estados com mais vagas' })
  await states.locator('.recharts-bar-rectangle').first().click()
  await expect(page).toHaveURL(/state=[A-Z]{2}/)
  await expect(page.getByRole('heading', { name: /^Cidades em / })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)
})
