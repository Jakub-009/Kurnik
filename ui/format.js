import {t} from './texts.js';

const locale = 'pl-PL';
const numberFormats = new Map();
const plural = new Intl.PluralRules(locale);
const dateFormats = {
  short: new Intl.DateTimeFormat(locale, {day:'2-digit', month:'2-digit', timeZone:'UTC'}),
  full: new Intl.DateTimeFormat(locale, {day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC'}),
  heading: new Intl.DateTimeFormat(locale, {weekday:'long', month:'long', day:'numeric', timeZone:'UTC'}),
  month: new Intl.DateTimeFormat(locale, {month:'2-digit', year:'2-digit', timeZone:'UTC'}),
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

export function mixingQuantity(value, unit = 'kg') {
  const step = value >= 5 ? 10 : value >= .05 ? 20 : 1000;
  const rounded = Math.round(value * step) / step;
  return number(rounded,3) + ' ' + unit;
}

export function stockQuantity(value, unit, signed = false) {
  const digits = number(Math.abs(value),3);
  const sign = digits === '0' ? '' : value < 0 ? '−' : signed ? '+' : '';
  return sign + digits + ' ' + unit;
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

export const days = value => counted(value, t.forms.days);
export const birds = value => counted(value, t.forms.birds);
export const hens = value => counted(value, t.forms.hens);
export const roosters = value => counted(value, t.forms.roosters);
export const batchCount = value => counted(value, t.forms.batches);

export function age({months, minimum}) {
  const years = Math.floor(months / 12);
  const yearLabel = years ? counted(years, t.forms.years) : '';
  const monthLabel = !years || months % 12 ? number(months % 12) + ' ' + t.months : '';
  return (minimum ? t.atLeast + ' ' : '') + [yearLabel, monthLabel].filter(Boolean).join(' ');
}

// Masa receptury i inne dokładne masy: do 2 miejsc, bez zbędnych zer („49,5 kg”).
export const preciseMass = grams => number(grams / 1000, 2) + ' kg';
export const precise = (value, unit) => number(value, unit === 'l' ? 3 : 2) + ' ' + unit;
export const monthYear = value => dateFormats.month.format(new Date(value));
