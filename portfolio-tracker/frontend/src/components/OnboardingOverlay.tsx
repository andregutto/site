import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'

const STORAGE_KEY = 'onboarding_v1_done'

const DEFAULT_CLASSES = [
  { name: 'Ações Brasil',   color: '#10b981' },
  { name: 'Ações Exterior', color: '#3b82f6' },
  { name: 'FIIs',           color: '#f59e0b' },
  { name: 'Cripto',         color: '#f97316' },
  { name: 'Renda Fixa',     color: '#06b6d4' },
  { name: 'Previdência',    color: '#8b5cf6' },
  { name: 'Imóveis',        color: '#ef4444' },
]

interface Props {
  onDone: () => void
}

export default function OnboardingOverlay({ onDone }: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const o = t.onboarding
  const TOTAL_STEPS = 3

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    onDone()
  }

  function goToContributions() {
    finish()
    navigate('/contributions')
  }

  const ASSET_TYPES = [
    { icon: '🇧🇷', label: o.assetB3,     desc: o.assetB3Desc     },
    { icon: '🌎',  label: o.assetIntl,   desc: o.assetIntlDesc   },
    { icon: '₿',   label: o.assetCrypto, desc: o.assetCryptoDesc },
    { icon: '📄',  label: o.assetFi,     desc: o.assetFiDesc     },
    { icon: '🏠',  label: o.assetImovel, desc: o.assetImovelDesc },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative flex flex-col max-h-[90vh]">

        {/* Header with progress + skip */}
        <div className="px-6 pt-5 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-8 bg-[#001A70]'
                    : i < step  ? 'w-3 bg-[#001A70]/40'
                    :             'w-3 bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={finish}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {o.skip}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 bg-[#001A70] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <span className="text-white text-3xl">▦</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#001A70]">{o.welcomeTitle}</h2>
                <p className="text-gray-500 mt-2 text-sm leading-relaxed">{o.welcomeBody}</p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full bg-[#001A70] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
              >
                {o.start}
              </button>
            </div>
          )}

          {/* Step 1: Default classes */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.classesTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm leading-relaxed">{o.classesBody}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_CLASSES.map(c => (
                  <div key={c.name} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-sm font-medium text-gray-700">{c.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{o.classesNote}</p>
              <button
                onClick={() => setStep(2)}
                className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
              >
                {o.continue}
              </button>
            </div>
          )}

          {/* Step 2: First asset */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.assetsTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm">{o.assetsBody}</p>
              </div>
              <div className="space-y-2">
                {ASSET_TYPES.map(a => (
                  <button
                    key={a.label}
                    onClick={goToContributions}
                    className="w-full flex items-center gap-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-[#001A70]/20 rounded-xl px-4 py-3 text-left transition-colors"
                  >
                    <span className="text-xl shrink-0">{a.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{a.label}</p>
                      <p className="text-xs text-gray-400 truncate">{a.desc}</p>
                    </div>
                    <span className="ml-auto text-gray-300 text-sm shrink-0">→</span>
                  </button>
                ))}
              </div>
              <button
                onClick={finish}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                {o.doneBody}
              </button>
            </div>
          )}

          {/* Back button for steps 1+ */}
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              ← {o.back}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
