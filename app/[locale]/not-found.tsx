import { getLocale, getTranslations } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Footer } from "@/components/layout/Footer"
import { ERROR_PRIMARY, ERROR_SECONDARY, ErrorScreen } from "@/components/layout/ErrorScreen"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { isPlaceholder } from "@/lib/placeholder"

/**
 * notFound() inside a page (an unknown /cobertura/<slug>…): the 404 with the site's nav and footer, in the page's
 * language. URLs that match no route at all get app/global-not-found.tsx.
 */
export default async function LocaleNotFound() {
  const locale = await getLocale()
  const t = await getTranslations("notFound")
  const base = `/${locale}`
  return (
    <>
      <Nav base={base} />
      <main>
        <ErrorScreen code={t("code")} title={t("title")} lead={t("lead")}>
          <a href={base} className={ERROR_PRIMARY}>
            {t("home")}
          </a>
          <a href={`${base}/planes`} className={ERROR_SECONDARY}>
            {t("plans")}
          </a>
          <a href={`${base}/clientes`} className={ERROR_SECONDARY}>
            {t("clients")}
          </a>
          {!isPlaceholder(company.whatsapp) && (
            <a href={whatsappHref(company.whatsapp, t("whatsappText"))} target="_blank" rel="noopener noreferrer" className={ERROR_SECONDARY}>
              {t("whatsapp")}
            </a>
          )}
        </ErrorScreen>
      </main>
      <Footer base={base} />
    </>
  )
}
