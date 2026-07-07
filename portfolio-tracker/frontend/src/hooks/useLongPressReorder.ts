import { useCallback, useEffect, useRef, useState } from 'react'

// Reordenação por pressionar-e-segurar via Pointer Events (funciona com mouse
// E touch, diferente do HTML5 drag-and-drop nativo que iOS/Android não
// suportam via toque). Extraído do padrão original em
// voyage/TripItineraryPanel.tsx pra reusar em outras listas (ex: cards da
// Hoje) sem duplicar a lógica de long-press/scroll-lock/drop-target.

const LONG_PRESS_MS = 380
const MOVE_CANCEL_PX = 8

// Este app nunca mexe em overflow de <html>/<body> em outro lugar, então é
// seguro só setar/limpar 'hidden' direto sem salvar um valor anterior.
let pageScrollLockCount = 0
function lockPageScroll() {
  pageScrollLockCount++
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
}
function unlockPageScroll() {
  pageScrollLockCount = Math.max(0, pageScrollLockCount - 1)
  if (pageScrollLockCount === 0) {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }
}

export function useLongPressReorder<T extends { id: string }>(
  items: T[],
  onReorder: (list: T[]) => void,
  enabled = true,
) {
  const itemsRef = useRef(items)
  itemsRef.current = items
  const dragIdRef = useRef<string | null>(null)
  const overIdRef = useRef<string | null>(null)
  const [dragVisual, setDragVisual] = useState<{ dragId: string | null; overId: string | null }>({ dragId: null, overId: null })
  const pressState = useRef(new Map<string, { start: { x: number; y: number }; timer: number | null; manualScroll: boolean; lastY: number }>())

  const doReorder = useCallback((draggedId: string, targetId: string) => {
    const list = itemsRef.current
    const dragItem = list.find(i => i.id === draggedId)
    if (!dragItem) return
    const without = list.filter(i => i.id !== draggedId)
    const targetIdx = without.findIndex(i => i.id === targetId)
    if (targetIdx === -1) return
    without.splice(targetIdx, 0, dragItem)
    onReorder(without)
  }, [onReorder])

  function startDrag(id: string) {
    dragIdRef.current = id
    overIdRef.current = null
    setDragVisual({ dragId: id, overId: null })
    lockPageScroll()
  }

  useEffect(() => {
    if (!enabled) return
    function rowIdAt(x: number, y: number): string | null {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      const rowEl = el?.closest('[data-reorder-id]') as HTMLElement | null
      return rowEl ? rowEl.dataset.reorderId ?? null : null
    }
    function onMove(e: PointerEvent) {
      if (dragIdRef.current == null) return
      if (e.cancelable) e.preventDefault()
      const id = rowIdAt(e.clientX, e.clientY)
      if (id !== overIdRef.current) {
        overIdRef.current = id
        setDragVisual(v => ({ ...v, overId: id }))
      }
    }
    function finishDrag() {
      const draggedId = dragIdRef.current
      const targetId = overIdRef.current
      dragIdRef.current = null
      overIdRef.current = null
      setDragVisual({ dragId: null, overId: null })
      unlockPageScroll()
      if (draggedId != null && targetId != null && draggedId !== targetId) doReorder(draggedId, targetId)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      unlockPageScroll()
    }
  }, [enabled, doReorder])

  // Props pra colocar no elemento arrastável — inclui o data-attribute que
  // rowIdAt() usa pra achar o alvo embaixo do dedo durante o arrasto.
  function getHandleProps(id: string) {
    if (!enabled) return { 'data-reorder-id': id }
    return {
      'data-reorder-id': id,
      onPointerDown: (e: React.PointerEvent) => {
        const start = { x: e.clientX, y: e.clientY }
        if (e.pointerType === 'mouse') { pressState.current.set(id, { start, timer: null, manualScroll: false, lastY: e.clientY }); return }
        const timer = window.setTimeout(() => {
          const st = pressState.current.get(id)
          if (st) st.timer = null
          navigator.vibrate?.(10)
          startDrag(id)
        }, LONG_PRESS_MS)
        pressState.current.set(id, { start, timer, manualScroll: false, lastY: e.clientY })
      },
      // touchAction deve ser 'none' no elemento (definido pelo chamador) desde o
      // primeiro toque — os browsers decidem quem "dono" do gesto (scroll vs JS)
      // no primeiro contato, não dá pra trocar depois. Isso cancela o scroll
      // nativo da página nesse elemento, então se o movimento acabar sendo um
      // scroll (não um long-press), simulamos com scrollBy pro resto do toque.
      onPointerMove: (e: React.PointerEvent) => {
        const st = pressState.current.get(id)
        if (!st) return
        if (st.manualScroll) {
          window.scrollBy(0, st.lastY - e.clientY)
          st.lastY = e.clientY
          return
        }
        const dx = e.clientX - st.start.x
        const dy = e.clientY - st.start.y
        if (Math.hypot(dx, dy) <= MOVE_CANCEL_PX) return
        if (e.pointerType === 'mouse') {
          pressState.current.delete(id)
          startDrag(id)
          return
        }
        if (st.timer == null) return
        clearTimeout(st.timer)
        st.manualScroll = true
        st.lastY = e.clientY
      },
      onPointerUp: () => {
        const st = pressState.current.get(id)
        if (st?.timer != null) clearTimeout(st.timer)
        pressState.current.delete(id)
      },
      onPointerCancel: () => {
        const st = pressState.current.get(id)
        if (st?.timer != null) clearTimeout(st.timer)
        pressState.current.delete(id)
      },
    }
  }

  return {
    getHandleProps,
    isDragging: (id: string) => dragVisual.dragId === id,
    isDropTarget: (id: string) => dragVisual.overId === id && dragVisual.dragId !== id,
    isReordering: dragVisual.dragId != null,
  }
}
