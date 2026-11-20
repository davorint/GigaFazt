import { expect, test, type Page } from "@playwright/test"

const PASSWORD = process.env.E2E_PASSWORD ?? ""

/** Console errors and uncaught exceptions of a page (the analytics script only exists on Vercel: ignored). */
function watch(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error" && !/_vercel\/insights/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  return errors
}

async function signIn(page: Page, password = PASSWORD) {
  await page.goto("/interno/entrar")
  await page.getByLabel("Contraseña").fill(password)
  await page.getByRole("button", { name: "Entrar" }).click()
}

test("home and plans render without errors", async ({ page }) => {
  const errors = watch(page)
  await page.goto("/es")
  await expect(page.locator('[data-section="hero"]')).toBeVisible()
  await page.goto("/es/planes")
  await expect(page.getByRole("button", { name: /Contratar el plan de/ }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test("a plan request is sent from the Contratar sheet", async ({ page }) => {
  await page.goto("/es/planes")
  await page.getByRole("button", { name: /Contratar el plan de/ }).first().click()
  await page.getByLabel("Nombre completo").fill("Prueba E2E")
  await page.getByLabel("WhatsApp o teléfono").fill("5512345678")
  await page.getByLabel("Dirección de instalación").fill("Calle Prueba 123, Col. Centro, Cuernavaca, 62000")
  await page.getByRole("checkbox", { name: /Acepto el/ }).check()
  await page.getByRole("button", { name: "Enviar solicitud" }).click()
  await expect(page.getByText("¡Listo! Recibimos tu solicitud.")).toBeVisible()
})

test("/interno needs the password; a wrong one is refused", async ({ page }) => {
  await page.goto("/interno/admin/clientes")
  await expect(page).toHaveURL(/\/interno\/entrar/)
  await signIn(page, "contraseña-equivocada")
  await expect(page.getByText("Nombre o contraseña incorrectos.")).toBeVisible()
})

test("signed in: a note is kept in the phone and survives a reload", async ({ page }) => {
  test.skip(!PASSWORD, "E2E_PASSWORD not set")
  const errors = watch(page)
  await signIn(page)
  await expect(page).toHaveURL(/\/interno$/)
  await page.goto("/interno/admin/notas")
  await page.getByLabel("Título (opcional)").first().fill("Revisar caja NAP")
  await page.getByLabel("Escribe la nota…").first().fill("Torre B, piso 4")
  await page.getByRole("button", { name: "Pegar nota" }).click()
  await expect(page.getByText("Revisar caja NAP")).toBeVisible()
  await page.reload()
  await expect(page.getByText("Revisar caja NAP")).toBeVisible()
  expect(errors).toEqual([])
})

test("signed in: a visited internal page opens without signal", async ({ page, context }) => {
  test.skip(!PASSWORD, "E2E_PASSWORD not set")
  await signIn(page)
  await page.goto("/interno/admin/notas")
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready))
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Notas", level: 1 })).toBeVisible()
  await page.goto("/interno/herramientas/en-existencia").catch(() => undefined)
  await expect(page.getByRole("heading", { name: "Sin conexión" })).toBeVisible()
  await context.setOffline(false)
})
