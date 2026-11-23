import {t} from './texts.js';
import {icon} from './icons.js';
import * as fmt from './format.js';

export const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

export const button = (label, action, style = '', symbol = '') =>
  `<button type="button" class="button ${style ? 'button--' + style : ''}" data-action="${html(action)}">${symbol ? icon(symbol) : ''}${html(label)}</button>`;

export const link = (label, route, style = '', symbol = '') =>
  `<a class="button ${style ? 'button--' + style : ''}" href="#${html(route)}">${symbol ? icon(symbol) : ''}${html(label)}</a>`;

export function choices(group, options, current) {
  return options.map(([key,label]) =>
    `<button type="button" class="chip" aria-pressed="${key === current}" data-action="${html(group + ':' + key)}">${html(label)}</button>`).join('');
}

export const iconButton = (label, symbol, action) =>
  `<button class="icon-button" type="button" aria-label="${html(label)}" data-action="${html(action)}">${icon(symbol)}</button>`;

export const fab = (label, route, symbol) =>
  `<a class="fab" href="#${html(route)}">${icon(symbol)}${html(label)}</a>`;

export function row({name, sub = '', value = '', symbol = '', route = '', action = ''}) {
  const content = `${symbol ? '<span class="list-icon">' + icon(symbol) + '</span>' : ''}
    <span class="list-content"><span>${html(name)}</span>${sub ? '<small>' + sub + '</small>' : ''}</span>
    ${value ? '<span class="list-value">' + value + '</span>' : ''}
    ${route || action ? icon('next') : ''}`;
  if (route) return `<a class="list-row" href="#${html(route)}">${content}</a>`;
  if (action) return `<button class="list-row" type="button" data-action="${html(action)}">${content}</button>`;
  return `<div class="list-row">${content}</div>`;
}

export function forecast(value, threshold, today, compact = false, hasRecipeItem = false) {
  if (!value) return compact ? '' : hasRecipeItem ? `<small>${t.nieMaDanychOZuzyciuDziennym}</small>` :
    `<small>${t.tegoSkladnikaNieMaWAktualnej}</small>`;
  const low = value.days < threshold;
  const bar = `<progress class="forecast-track" aria-label="${t.prognozaZapasuWzgledemProgu}" value="${Math.min(value.days, threshold)}" max="${threshold}"></progress>`;
  return `<span class="forecast ${low ? 'forecast--low' : ''}">
    <span class="forecast-line"><strong>${low && !compact ? icon('warn') + ' ' : ''}${fmt.days(value.days)}</strong>${compact ? '' : `<span>${fmt.listDate(value.date, today)}</span>`}</span>
    ${bar}<small>${t.prognoza}${compact ? ' · ' + fmt.listDate(value.date, today) : ''}</small></span>`;
}

export const banner = (title, description, action = '', compact = false) =>
  `<aside class="banner ${compact ? 'home-warning' : ''}">${icon('warn')}<div class="grow"><h2>${html(title)}</h2>
    <p>${description}</p></div>${action}</aside>`;

export const warning = label => `<span class="warning">${icon('warn')} ${html(label)}</span>`;
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
  `<div class="value-row"><span class="grow">${html(title)} <strong>${html(value)}</strong></span>${button(t.zmien, action)}</div>`;

export function numberField(name, label, value = '', unit = '', mode = 'decimal') {
  const input = `<div class="number-field"><input autocomplete="off" id="${name}"
    name="${name}" type="text" inputmode="${mode}" maxlength="18" value="${html(value)}" aria-describedby="${name}-error">
    <span class="number-unit" data-unit-for="${name}">${html(unit)}</span></div>`;
  return fieldWrap(name,label,input);
}

export const form = (content, submit = t.zapisz, deletable = false) =>
  `<form class="screen-form" novalidate>${content}
    <p data-form-error class="error-panel" role="alert" hidden></p>
    <div class="form-actions"><button class="button button--filled" type="submit">${html(submit)}</button>
      ${deletable ? button(t.usun, 'delete', 'danger', 'del') : ''}</div>
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
    const range = t.podajLiczbeOd + fmt.number(min, digits) + ' do ' + fmt.number(max, digits) + '.';
    throw new FieldError(name, !text ? t.uzupelnijToPole : range);
  }
  return numeric;
}

export function validDate(value, min = '1900-01-01', max = '9999-12-31') {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= min && value <= max &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function readDate(value, name, min, max) {
  if (!validDate(value, min, max)) {
    throw new FieldError(name, t.podajDateZZakresu + fmt.fullDate(min ?? '1900-01-01') + ' – ' + fmt.fullDate(max ?? '9999-12-31') + '.');
  }
  return value;
}

export function readName(value, name = 'name') {
  const result = String(value ?? '').trim();
  if (!result || result.length > 80) throw new FieldError(name, t.podajNazweOd1Do80);
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
