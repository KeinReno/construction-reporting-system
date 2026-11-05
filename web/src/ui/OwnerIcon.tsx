import type { ReactNode } from 'react';

type IconName = 'building' | 'reports' | 'review' | 'calendar' | 'photo' | 'money' | 'event' | 'arrow' | 'work' | 'chart';

const icons: Record<IconName, ReactNode> = {
  building: <><path d="M4 21h16M6 21V7l6-3 6 3v14M9 10h1m4 0h1m-6 4h1m4 0h1M11 21v-4h2v4"/></>,
  reports: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></>,
  review: <><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
  photo: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 17l5-4 3 2 3-3 5 5"/></>,
  money: <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18m-5 5h2"/></>,
  event: <><path d="M12 3l9 16H3L12 3zM12 9v4m0 3h.01"/></>,
  arrow: <><path d="M4 12h15m-5-5l5 5-5 5"/></>,
  work: <><path d="M3 7h18v13H3zM8 7V4h8v3M3 12h18M10 12v2h4v-2"/></>,
  chart: <><path d="M4 20V11m5 9V6m5 14v-8m5 8V3M2 21h20"/></>,
};

export function OwnerIcon({ name }: { name: IconName }) {
  return <svg className="owner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}
