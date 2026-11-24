import {icon} from './icons.js';
import * as fmt from './format.js';
import {t} from './texts.js';

export const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

export const button = (label, action, style = '', symbol = '') =>
  `<button type="button" class="button ${style ? 'button--' + style : ''}" data-action="${html(action)}">${symbol ? icon(symbol) : ''}${html(label)}</button>`;

export const link = (label, route, style = '', symbol = '') =>
  `<a class="button ${style ? 'button--' + style : ''}" href="#${html(route)}">${symbol ? icon(symbol) : ''}${html(label)}</a>`;

export const iconButton = (label, symbol, action) =>
  `<button class="icon-button" type="button" aria-label="${html(label)}" data-action="${html(action)}">${icon(symbol)}</button>`;

export const textLink = (label, route, symbol = '') => link(label, route, 'text', symbol);

export const fab = (label, route, symbol) =>
  `<a class="fab" href="#${html(route)}">${icon(symbol)}${html(label)}</a>`;

// Liczba z jednostką: „23 dni” → duża liczba i mniejsza jednostka. Tekst bez liczby zostaje w całości.
export function figure(text, unit = '') {
  const value = String(text);
  if (!unit) {
    const split = value.lastIndexOf(' ');
    if (split > 0 && /\d/.test(value.slice(0, split))) return figure(value.slice(0, split), value.slice(split + 1));
  }
  return html(value) + (unit ? '<span class="unit">' + html(unit) + '</span>' : '');
}

// Pasek ostrzeżenia: pogrubiony tytuł, jedna linijka, odnośnik albo przycisk po prawej.
export function strip({title, line = '', route = '', label = '', action = '', tone = 'warn'}) {
  const end = action ? button(label, action, 'text') : label ? `<span class="strip-link">${html(label)}</span>` : '';
  const content = `<span class="grow"><strong>${html(title)}</strong>${line ? '<span>' + html(line) + '</span>' : ''}</span>${end}`;
  return route && !action ? `<a class="strip strip--${tone}" href="#${html(route)}">${content}</a>`
    : `<aside class="strip strip--${tone}">${content}</aside>`;
}

// Linijka z boku karty głównej: „do <b>15 gru</b>”, „<b>31</b> kur”. Tekst przed i po pogrubieniu jest zwykły.
export const side = (before, bold, after = '') =>
  `<span>${before ? html(before) + ' ' : ''}<b>${html(bold)}</b>${after ? ' ' + html(after) : ''}</span>`;

// „31 kur” → <b>31</b> kur
export const sideCount = text => {
  const split = String(text).lastIndexOf(' ');
  return split > 0 ? side('', text.slice(0, split), text.slice(split + 1)) : side('', text);
};

// Karta główna ekranu: etykieta, duża liczba, linijki z boku, pasek, krótki podpis, przyciski pod spodem.
export function hero({label, value, sides = [], bar = null, caption = '', low = false, route = '', after = ''}) {
  const inner = `<span class="hero-top"><span><span class="hero-label">${html(label)}</span><span class="hero-value">${value}</span></span>
      ${sides.length ? '<span class="hero-side">' + sides.join('') + '</span>' : ''}</span>
    ${bar ? `<progress class="hero-bar" aria-hidden="true" value="${Math.max(0, bar[0])}" max="${bar[1]}"></progress>` : ''}
    ${caption ? '<span class="hero-caption">' + html(caption) + '</span>' : ''}`;
  return `<section class="hero${low ? ' hero--low' : ''}">${route ? `<a class="hero-link" href="#${html(route)}">${inner}</a>`
    : `<div class="hero-link">${inner}</div>`}${after}</section>`;
}

// Biała karta z listą: tytuł, opcjonalny odnośnik po prawej, wiersze.
export const listCard = (title, rows, action = '') =>
  `<section class="list"><div class="list-head"><h2 class="list-title">${html(title)}</h2>${action}</div>${rows}</section>`;

export const headLink = (label, route) => `<a class="mini-link" href="#${html(route)}">${icon('plus')}${html(label)}</a>`;

// Wiersz listy: tytuł, szary podpis, wartość po prawej. `sub` i `value` to gotowy HTML.
export function line({title, sub = '', value = '', route = '', strong = true, plus = false, after = ''}) {
  const content = `<span class="grow"><b${strong ? '' : ' class="plain"'}>${html(title)}</b>${sub ? '<small>' + sub + '</small>' : ''}</span>
    ${after}${value ? `<span class="r-val${plus ? ' plus' : ''}">${value}</span>` : ''}${route ? icon('next') : ''}`;
  return route ? `<a class="r-row" href="#${html(route)}">${content}</a>` : `<div class="r-row">${content}</div>`;
}

// Kafelek: etykieta, duża liczba, krótki podpis. Cały kafelek prowadzi dalej.
export function tile({label, value, caption = '', route = '', low = false}) {
  const content = `<span class="tile-label">${html(label)}</span>
    <span class="tile-value${low ? ' tile-value--low' : ''}">${value}</span>${caption ? '<span class="tile-caption">' + html(caption) + '</span>' : ''}`;
  return route ? `<a class="tile" href="#${html(route)}">${content}</a>` : `<div class="tile">${content}</div>`;
}

// Dwa lub trzy przyciski wyboru (jak przełącznik). Pod spodem zwykłe pola radio.
export const choice = (name, legend, options, value) =>
  `<fieldset class="field choice-field"><legend class="field-label">${html(legend)}</legend><div class="segmented">${options.map(([key, label]) =>
    `<label><input type="radio" name="${html(name)}" value="${html(key)}"${key === value ? ' checked' : ''}><span>${icon('check')}${html(label)}</span></label>`).join('')}</div></fieldset>`;

export const chosen = name => document.querySelector('input[name="' + name + '"]:checked')?.value;

export const empty = (message, action = '') => `<div class="card stack tight"><p>${html(message)}</p>${action ? '<div>' + action + '</div>' : ''}</div>`;

export const details = values => `<dl class="detail-grid">${values.map(([title, value]) =>
  `<div><dt>${html(title)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;

const fieldWrap = (name, label, input) =>
  `<div class="field"><label for="${name}">${html(label)}</label>${input}<small class="field-error" id="${name}-error" aria-live="polite"></small></div>`;

export function field(name, label, value = '', options = {}) {
  const {type = 'text', mode = '', max = '', min = '', length = '', spell = ''} = options;
  return fieldWrap(name, label, `<input name="${name}" id="${name}" type="${type}" value="${html(value)}"
    aria-describedby="${name}-error"${mode ? ' inputmode="' + mode + '"' : ''}${max ? ' max="' + max + '"' : ''}
    ${min ? ' min="' + min + '"' : ''}${length ? ' maxlength="' + length + '"' : ''}${spell ? ' spellcheck="false"' : ''}>`);
}

export const textarea = (name, label, value = '') => fieldWrap(name, label,
  `<textarea name="${name}" id="${name}" maxlength="1000" aria-describedby="${name}-error">${html(value)}</textarea>`);

export const select = (name, label, options, value) => fieldWrap(name, label,
  `<select name="${name}" id="${name}" aria-describedby="${name}-error">${options.map(([key, text]) =>
    `<option value="${html(key)}"${value === key ? ' selected' : ''}>${html(text)}</option>`).join('')}</select>`);

export const dateField = (name, label, value, min = '1900-01-01', max = '9999-12-31') =>
  field(name, label, value, {type:'date', min, max});

export const changeRow = (title, value, action) =>
  `<div class="value-row"><span class="grow">${html(title)} <strong>${html(value)}</strong></span>${button(t.change, action, 'text')}</div>`;

export function numberField(name, label, value = '', unit = '', mode = 'decimal') {
  const input = `<div class="number-field"><input autocomplete="off" id="${name}"
    name="${name}" type="text" inputmode="${mode}" maxlength="18" value="${html(value)}" aria-describedby="${name}-error">
    <span class="number-unit" data-unit-for="${name}">${html(unit)}</span></div>`;
  return fieldWrap(name,label,input);
}

export const form = (content, submit = t.save, deletable = false) =>
  `<form class="screen-form" novalidate>${content}
    <p data-form-error class="error-panel" role="alert" hidden></p>
    <div class="form-actions"><button class="button button--filled" type="submit">${html(submit)}</button>
      ${deletable ? button(t.delete, 'delete', 'danger', 'del') : ''}</div>
  </form>`;

export class FieldError extends Error {
  constructor(fieldName, message) {
    super(message);
    this.fieldName = fieldName;
  }
}

export function readNumber(value, name, {optional = false, min = 0, max = 1000000000, digits = 3} = {}) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (optional && !text) return null;
  const pattern = digits ? new RegExp('^(?:[0-9]+(?:\\.[0-9]{1,' + digits + '})?|\\.[0-9]{1,' + digits + '})$') : /^[0-9]+$/;
  const numeric = Number(text);
  if (!pattern.test(text) || numeric < min || numeric > max) {
    throw new FieldError(name, !text ? t.fillIn : t.numberRange(fmt.number(min, digits), fmt.number(max, digits)));
  }
  return numeric;
}

export function validDate(value, min = '1900-01-01', max = '9999-12-31') {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= min && value <= max &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function readDate(value, name, min, max) {
  if (!validDate(value, min, max)) {
    throw new FieldError(name, t.dateRange(fmt.fullDate(min ?? '1900-01-01'), fmt.fullDate(max ?? '9999-12-31')));
  }
  return value;
}

export function readName(value, name = 'name') {
  const result = String(value ?? '').trim();
  if (!result || result.length > 80) throw new FieldError(name, t.nameLength);
  return result;
}

export function showFormError(error) {
  const input = document.getElementById(error.fieldName);
  const label = document.getElementById(error.fieldName + '-error');
  if (input && label) {
    label.textContent = error.message;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  const output = document.querySelector('[data-form-error]');
  if (output) {
    output.textContent = error.message;
    output.hidden = false;
  }
}
