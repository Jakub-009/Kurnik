// Ikony Lucide (lucide.dev, licencja ISC, zob. icons/LUCIDE-LICENSE).
// sack, pallet i hen narysowane dla Kurnika w tym samym stylu (24 × 24, linia 2, zaokrąglone końce).
const shapes = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51 15.42 17.49"/><path d="M15.41 6.51 8.59 10.49"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  recipe: '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  del: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  // Worek z paszą zawiązany u góry.
  sack: '<path d="M7.5 3c1.5 1 3 1 4.5 0s3-1 4.5 0L14.5 7"/><path d="M7.5 3 9.5 7"/><path d="M9 7h6"/><path d="M9.5 7C6.5 8.5 5 11.5 5 15.5 5 19 6.8 21 10 21h4c3.2 0 5-2 5-5.5 0-4-1.5-7-4.5-8.5"/>',
  // Paleta z trzema workami.
  pallet: '<path d="M2 18h20"/><path d="M4 18v3"/><path d="M12 18v3"/><path d="M20 18v3"/><rect x="3" y="12" width="8" height="6" rx="2.5"/><rect x="13" y="12" width="8" height="6" rx="2.5"/><rect x="8" y="5" width="8" height="6" rx="2.5"/>',
  // Kura z profilu.
  hen: '<path d="m8.5 3.5 1-1.5 1 1.5 1-1.5"/><path d="M6.5 6 4 7.5l2.5.5"/><path d="M6.5 8.5c-1 4 .5 8 4.5 9.5 3.5 1.2 7-.5 8.5-3.5 1-2 1-5 .5-9l-4 3.5c-1.5 1-3 .5-4-1V6.5a3 3 0 0 0-5.5-1.5"/><path d="M10.5 18.5V21H9"/><path d="M15 18.5V21h-1.5"/><path d="M8.5 6h.01"/>'
};

export const icon = name =>
  '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' + shapes[name] + '</svg>';

export const iconNames = Object.keys(shapes);
