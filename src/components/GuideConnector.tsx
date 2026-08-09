import { useEffect, useMemo, useState } from 'react'
import type { Stage } from '../game/types'

type ConnectorState = {
  left: number
  top: number
  direction: 'left' | 'down'
  label: string
}

const TARGET: Partial<Record<Stage, { selector: string; label: string }>> = {
  inspect_data: { selector: '.pixel-scanner-card', label: '看这里' },
  choose_features: { selector: '.pixel-control', label: '点这里' },
  choose_model: { selector: '.model-toolbox', label: '点这里' },
  inspect_errors: { selector: '.evidence-console', label: '看这里' },
}

export function GuideConnector({ stage }: { stage: Stage }) {
  const target = TARGET[stage]
  const [connector, setConnector] = useState<ConnectorState>()

  const selectors = useMemo(() => target ? [target.selector, '.beginner-guide.compact'] : [], [target])

  useEffect(() => {
    if (!target) {
      setConnector(undefined)
      return
    }

    const update = () => {
      const targetNode = document.querySelector<HTMLElement>(target.selector)
      const guideNode = document.querySelector<HTMLElement>('.beginner-guide.compact')
      if (!targetNode || !guideNode) {
        setConnector(undefined)
        return
      }

      const targetRect = targetNode.getBoundingClientRect()
      const guideRect = guideNode.getBoundingClientRect()
      const targetIsLeft = targetRect.right < guideRect.left

      if (targetIsLeft) {
        setConnector({
          left: Math.max(74, Math.min(window.innerWidth - 74, targetRect.right - 58)),
          top: Math.max(24, Math.min(window.innerHeight - 34, targetRect.top + 26)),
          direction: 'left',
          label: target.label,
        })
        return
      }

      setConnector({
        left: Math.max(74, Math.min(window.innerWidth - 74, targetRect.left + targetRect.width / 2)),
        top: Math.max(24, targetRect.top - 18),
        direction: 'down',
        label: target.label,
      })
    }

    const frame = window.requestAnimationFrame(update)
    const observer = new ResizeObserver(update)
    selectors.forEach((selector) => {
      const node = document.querySelector<HTMLElement>(selector)
      if (node) observer.observe(node)
    })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [stage, target, selectors])

  if (!connector) return null

  return (
    <div
      className={`guide-connector guide-connector-${connector.direction}`}
      style={{ left: connector.left, top: connector.top }}
      aria-hidden="true"
    >
      <span className="guide-connector-arrow">{connector.direction === 'left' ? '◀' : '▼'}</span>
      <strong>{connector.label}</strong>
    </div>
  )
}
