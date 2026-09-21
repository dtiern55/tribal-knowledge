import { SoleSurvivorTorch } from './SoleSurvivorTorch'

/** The worked Sole Survivor bonus, shared by the naming popup and the Rules page. */
export function SoleSurvivorExample({ className = '' }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg border border-gold-200 bg-gold-50/70 p-3 text-left`}>
      <p className="font-display text-[11px] font-bold uppercase tracking-wide text-gold-800">
        Example
      </p>
      <p className="mt-0.5 text-sm text-paper-ink">
        <b className="font-display font-bold text-gold-800">Aubry</b>{' '}
        <SoleSurvivorTorch className="inline-block h-4 w-3 align-[-3px]" />{' '}
        is your Sole Survivor. In the finale she:
      </p>
      <dl className="mt-2 space-y-1 text-sm tabular-nums text-paper-ink">
        <div className="flex justify-between gap-4">
          <dt>Wins immunity</dt>
          <dd>+15</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Makes final tribal</dt>
          <dd>+25</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Wins the season</dt>
          <dd>+40</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-gold-300/60 pt-1 font-medium">
          <dt>Finale points</dt>
          <dd>80</dd>
        </div>
        <div className="flex justify-between gap-4 text-gold-700">
          <dt>Sole Survivor +50%</dt>
          <dd>+40</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-gold-300/60 pt-1 font-display font-bold text-gold-800">
          <dt>You score</dt>
          <dd>120</dd>
        </div>
      </dl>
    </div>
  )
}
