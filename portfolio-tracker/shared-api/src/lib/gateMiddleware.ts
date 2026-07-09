// Middleware factory pra gates de entitlements. Reusa checkGate do módulo
// central (lib/entitlements.ts) — a fonte única da matriz Free/Plus/Pro/Beta.
//
// Aplicado após requireAuth (precisa de req.userId). Em caso de bloqueio,
// responde 403 com o payload UpgradeRequired padronizado, que o frontend
// intercepta (error === 'upgrade_required') pra abrir o UpgradeModal.
//
// Uso:
//   router.get('/x', requireAuth, requireGateMw('patrimonio'), handler)
// ou, quando o router inteiro é gated (todas as rotas exigem o mesmo gate):
//   router.use(requireAuth)
//   router.use(requireGateMw('patrimonio'))

import { Request, Response, NextFunction } from 'express'
import { AuthRequest } from '../middleware/auth.js'
import { checkGate, type GateKey } from './entitlements.js'

export function requireGateMw(gate: GateKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as AuthRequest).userId
      const result = await checkGate(userId, gate)
      if (!result.ok) { res.status(403).json(result.payload); return }
      next()
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Erro ao validar acesso' })
    }
  }
}
