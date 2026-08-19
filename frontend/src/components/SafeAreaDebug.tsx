import { useEffect, useState } from 'react'

/**
 * TEMPORARY (#459 diagnosis): admin-only readout of the values that decide why
 * the Android gesture bar renders cream. Reads the real safe-area inset and
 * which element/color sits at the very bottom edge of the web viewport.
 * Remove once the fix lands.
 */
export function SafeAreaDebug() {
  const [info, setInfo] = useState<string[]>([])

  useEffect(() => {
    function measure() {
      // Real safe-area-inset-bottom, read off a probe element.
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom);'
      document.body.appendChild(probe)
      const sab = probe.getBoundingClientRect().height
      probe.remove()

      // What element/color is painted at the very bottom-center of the viewport.
      const x = Math.round(window.innerWidth / 2)
      const y = window.innerHeight - 1
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      const bg = el ? getComputedStyle(el).backgroundColor : 'null'
      const cls = el ? `${el.tagName}.${(el.className || '').toString().slice(0, 28)}` : 'null'

      setInfo([
        `standalone=${window.matchMedia('(display-mode: standalone)').matches}`,
        `sab=${sab}px  innerH=${window.innerHeight}  screenH=${window.screen.height}`,
        `visualH=${Math.round(window.visualViewport?.height ?? 0)}`,
        `bottomEl=${cls}`,
        `bottomBg=${bg}`,
        `bodyBg=${getComputedStyle(document.body).backgroundColor}`,
      ])
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <div
      className="fixed bottom-20 left-2 z-[70] max-w-[92vw] rounded bg-black/85 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300"
      aria-hidden="true"
    >
      {info.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
}
