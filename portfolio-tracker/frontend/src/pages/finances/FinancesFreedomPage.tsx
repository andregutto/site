import { useI18n } from '../../contexts/I18nContext'

export default function FinancesFreedomPage() {
  const { t } = useI18n()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.finances.freedomTitle}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.finances.freedomSubtitle}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        {t.common.loading}…
      </div>
    </div>
  )
}
