// Detecta se o app está rodando dentro de um shell nativo (Capacitor) em vez do
// navegador/PWA. Hoje o pacote @capacitor/core ainda não está instalado, então
// `window.Capacitor` nunca existe e isNativeApp() sempre retorna false — ou seja,
// todo código que ramifica nesse check continua se comportando exatamente como
// antes no site e no PWA. Quando o Capacitor for adicionado, esse helper passa a
// detectar o ambiente nativo automaticamente, sem precisar tocar nos call sites.
export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

// Scheme reservado pro deep link de volta do OAuth (Google) quando rodando nativo.
// Precisa ser registrado como URL Scheme no Info.plist/AndroidManifest do projeto
// Capacitor e cadastrado como Redirect URL permitido no Supabase Auth antes de uso.
export const NATIVE_AUTH_CALLBACK_URL = 'arvo://auth-callback'
