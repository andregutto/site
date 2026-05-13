import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

export default function PrivacyPolicyPage() {
  const { t } = useI18n()
  const p = t.privacy

  const sections = [
    { title: p.s1title, body: p.s1body },
    { title: p.s2title, body: p.s2body },
    { title: p.s3title, body: p.s3body },
    { title: p.s4title, body: p.s4body },
    { title: p.s5title, body: p.s5body },
    { title: p.s6title, body: p.s6body },
    { title: p.s7title, body: p.s7body },
    { title: p.s8title, body: p.s8body },
    { title: p.s9title, body: p.s9body },
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
            <h1 className="text-2xl font-bold text-[#001A70]">{p.title}</h1>
            <p className="text-xs text-gray-400 mt-1">{p.updated}</p>
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
