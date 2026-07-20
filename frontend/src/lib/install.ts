// PWA install plumbing (#107). beforeinstallprompt can fire before React
// mounts, so the listener lives at module scope and stashes the event for
// the Profile page's install button to use later.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  listeners.forEach((fn) => fn())
})

export function onInstallAvailable(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function installAvailable(): boolean {
  return deferredPrompt !== null
}

export async function promptInstall(): Promise<void> {
  await deferredPrompt?.prompt()
  deferredPrompt = null
}

export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// Post-join install nudge flag (#184): armed once at /join, cleared forever
// on dismiss or install — never nags twice.
const NUDGE_KEY = 'install-nudge'

export function armInstallNudge(): void {
  if (!isInstalled()) localStorage.setItem(NUDGE_KEY, 'pending')
}

export function installNudgePending(): boolean {
  return localStorage.getItem(NUDGE_KEY) === 'pending'
}

export function dismissInstallNudge(): void {
  localStorage.setItem(NUDGE_KEY, 'done')
}
