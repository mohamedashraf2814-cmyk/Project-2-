import { eventLog } from '../eventLog/eventLog';
import { app } from '../store/app';
import { SimEngine } from './engine';

/** The single simulation manager used by the whole application. */
export const sim = new SimEngine({
  log: eventLog,
  now: () => Date.now(),
  getReminders: () => app.get().reminders,
  patchReminder: app.patchReminder,
});

// stop every timer if the page is closed or hot-reloaded
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => sim.stop());
}
