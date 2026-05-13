import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

export default function TermsOfUsePage() {
  const { t } = useI18n()
  const tp = t.termsPage

  const sections = [
    { title: tp.s1title, body: tp.s1body },
    { title: tp.s2title, body: tp.s2body },
    { title: tp.s3title, body: tp.s3body },
    { title: tp.s4title, body: tp.s4body },
    { title: tp.s5title, body: tp.s5body },
    { title: tp.s6title, body: tp.s6body },
    { title: tp.s7title, body: tp.s7body },
    { title: tp.s8title, body: tp.s8body },
    { title: tp.s9title, body: tp.s9body },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/login" className="text-xs text-[#001A70] hover:underline flex items-center gap-1">
            ← Login
          </Link>
          <LanguageSelector />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[#001A70]">{tp.title}</h1>
            <p className="text-xs text-gray-400 mt-1">{tp.updated}</p>
          </div>

          {sections.map(({ title, body }) => (
            <div key={title} className="space-y-1">
              <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <LoginFooter />
      </div>
    </div>
  )
}
