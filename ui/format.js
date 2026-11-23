const locale = 'pl-PL';
const numberFormats = new Map();
const plural = new Intl.PluralRules(locale);
const dateFormats = {
  short: new Intl.DateTimeFormat(locale, {day:'2-digit', month:'2-digit', timeZone:'UTC'}),
  full: new Intl.DateTimeFormat(locale, {day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC'}),
  heading: new Intl.DateTimeFormat(locale, {weekday:'long', month:'long', day:'numeric', timeZone:'UTC'}),
};
const moneyFormat = new Intl.NumberFormat(locale, {style:'currency', currency:'PLN', useGrouping:'always'});

export function number(value, digits = 0, minimum = 0) {
  const key = digits + ':' + minimum;
  if (!numberFormats.has(key)) numberFormats.set(key, new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits, minimumFractionDigits: minimum, useGrouping: 'always'
  }));
  return numberFormats.get(key).format(value);
}

export function quantity(value, unit = 'kg', mixing = false) {
  const digits = mixing ? (Math.abs(value) < .01 ? 3 : 2) : Math.abs(value) < 10 ? 1 : 0;
  return number(value, digits, mixing && Math.abs(value) < 10 ? Math.min(digits, 2) : 0) + ' ' + unit;
}

export function editable(value, digits = 3) {
  return value == null ? '' : number(value, digits).replace(/\s/g, '');
}

export const mass = (grams, mixing = false) => quantity(grams / 1000, 'kg', mixing);
export const money = cents => moneyFormat.format(cents / 100);
export const percent = value => number(value * 100, 1) + '%';
export const headingDate = value => dateFormats.heading.format(new Date(value));
export const fullDate = value => dateFormats.full.format(new Date(value));
export const listDate = (value, today) => (value.slice(0, 4) === today.slice(0, 4)
  ? dateFormats.short : dateFormats.full).format(new Date(value));

export function counted(value, forms) {
  const integer = Math.round(value);
  return number(integer) + ' ' + forms[plural.select(integer)];
}

export const days = value => counted(value, {one:'dzień', few:'dni', many:'dni', other:'dni'});
export const birds = value => counted(value, {one:'ptak', few:'ptaki', many:'ptaków', other:'ptaka'});
export const hens = value => counted(value, {one:'kura', few:'kury', many:'kur', other:'kury'});
export const roosters = value => counted(value, {one:'kogut', few:'koguty', many:'kogutów', other:'koguta'});

export function age({months, minimum}) {
  const years = Math.floor(months / 12);
  const yearLabel = years ? counted(years, {one:'rok', few:'lata', many:'lat', other:'roku'}) : '';
  const monthLabel = !years || months % 12 ? number(months % 12) + ' mies.' : '';
  return (minimum ? 'co najmniej ' : '') + [yearLabel, monthLabel].filter(Boolean).join(' ');
}
