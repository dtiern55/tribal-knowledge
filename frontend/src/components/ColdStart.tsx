import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'

/** The app before there is anything to show: a league whose commissioner
 * hasn't created a season yet (#520). Every page used to render "No season
 * found — choose one from the menu", pointing at an empty menu.
 *
 * The commissioner gets a way out now that /admin has a create-season form
 * (#526); before that any button here would have looped back to a page that
 * cold-started the same way. A player in no league at all is sent to enter a
 * join code (#595); a player whose league has no season yet gets no call to
 * action, because there genuinely isn't one for them.
 */
export function ColdStart() {
  const { profile } = useAuth()
  const admin = profile?.is_admin
  const noLeague = !admin && profile != null && profile.leagues.length === 0

  if (noLeague) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
        <img
          src="/icon-512.webp?v=20260902-tone"
          alt=""
          width={72}
          height={72}
          className="size-[72px] rounded-2xl opacity-90 shadow-sm"
        />
        <h1 className="mt-6 font-display text-2xl tracking-wide text-forest-800">
          You’re not in a league yet
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your commissioner has a join code for you. Enter it and your tribe shows up here.
        </p>
        <Link
          to="/join"
          className="mt-6 rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800"
        >
          Enter a join code
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
      <img
        src="/icon-512.webp?v=20260902-tone"
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
          : 'Your commissioner hasn’t started a season. Once they do, your tribe and the weekly play show up here.'}
      </p>
      {admin && (
        <Link
          to="/admin"
          className="mt-6 rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800"
        >
          Create the first season
        </Link>
      )}
    </div>
  )
}
