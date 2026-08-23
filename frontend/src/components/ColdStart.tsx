import { useAuth } from '../auth/useAuth'

/** The app before there is anything to show: a league whose commissioner
 * hasn't created a season yet (#520). Every page used to render "No season
 * found — choose one from the menu", pointing at an empty menu.
 *
 * No call to action for the commissioner on purpose: there is no create-season
 * UI yet (the endpoint exists, nothing calls it), and /admin cold-starts here
 * too, so any button would loop. See #526.
 */
export function ColdStart() {
  const { profile } = useAuth()
  const admin = profile?.is_admin

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
      <img
        src="/icon-512.webp"
        alt=""
        width={72}
        height={72}
        className="size-[72px] rounded-2xl opacity-90 shadow-sm"
      />
      <h1 className="mt-6 font-display text-2xl tracking-wide text-forest-800">
        {admin ? 'No season yet' : 'Camp isn’t set up yet'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {admin
          ? 'Once a season exists, commissioner tools open up and the league can start picking.'
          : 'Your commissioner hasn’t started a season. Once they do, your roster and the weekly play show up here.'}
      </p>
    </div>
  )
}
