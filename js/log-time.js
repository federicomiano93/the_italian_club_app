// log-time.js — pure timestamp formatting for the log, extracted from log.js so it
// can be unit-tested in isolation (P15 — the owner cannot read code). No DOM, no
// storage, no Firebase: just turns a Date into the { date, time } shown in the log.

const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Formats a Date as { date: "Monday 09 June", time: "2:05 PM" }.
// Time is 12-hour with an AM/PM suffix: midnight/noon read as 12, minutes padded.
export function logTimestamp(now = new Date()) {
  const d = String(now.getDate()).padStart(2, '0');
  const period = now.getHours() < 12 ? 'AM' : 'PM';
  const hour12 = now.getHours() % 12 || 12;
  const t = hour12 + ':' + String(now.getMinutes()).padStart(2, '0') + ' ' + period;
  return { date: `${DAY[now.getDay()]} ${d} ${MON[now.getMonth()]}`, time: t };
}
