import { I18nProvider } from '@/lib/i18n'
import type { ReactNode } from 'react'

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}
