import {addDays, cohortAge, cohortCount, daysBetween, mixtureCost, recipeComposition, savings} from './calc/index.js';
import {live} from './db.js';
import {batchStats, find, latestFirst, showAmount} from './model.js';
import {banner, button, details, empty, fab, forecast, html, link, row, warning} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';

const symbol = {start:'home', feed:'feed', stock:'stock', flock:'flock'};
const tabs = {start:'Start', feed:'Pasza', stock:'Magazyn', flock:'Stado'};
const movementNames = {purchase:'Zakup', correction:'Korekta stanu', withdrawal:'Inne pobranie', batch:'Zużycie w partii'};

export function frame(screen, route) {
  const {title, subtitle = '', parent, form = false, body, floating = ''} = screen;
  const root = route.split('/')[0];
  const main = !parent;
  const navigation = main ? `<nav class="navigation" aria-label="Nawigacja główna"><div class="tabs">${Object.entries(tabs)
    .map(([key, label]) => `<a href="#${key}"${root === key ? ' aria-current="page"' : ''}><span>${icon(symbol[key])}</span><span>${label}</span></a>`).join('')}</div></nav>` : '';
  return `<header class="app-bar">${parent ? `<button class="icon-button" type="button" data-action="back"
    aria-label="${form ? 'Zamknij' : 'Wróć'}">${icon(form ? 'close' : 'back')}</button>` : ''}
    <div class="app-bar-text"><h1 tabindex="-1">${html(title)}</h1>${subtitle ? '<p class="eyebrow">' + html(subtitle) + '</p>' : ''}</div>
    ${main ? `<a class="icon-button" aria-label="Ustawienia" href="#settings/${root}">${icon('settings')}</a>` : ''}</header>
    <main class="page ${main ? 'page--main' : ''} ${form ? 'page--form' : ''}" id="content">${body}</main>${floating}${navigation}`;
}

function stockRows(stocks, ctx, compact = false) {
  return '<div class="list">' + stocks.map(({ingredient, grams, outlook}) => {
    const state = fmt.quantity(showAmount(grams, ingredient), ingredient.unit);
    return row({name:ingredient.name, symbol:compact ? '' : 'stock', route:'ingredient/' + ingredient.id,
      sub:compact ? html(state) : (grams < 0 ? warning('Sprawdź stan') : ''),
      value:compact ? '<span class="home-forecast">' + (forecast(outlook, ctx.derived.settings.threshold, ctx.today, true) || '') + '</span>' : `<strong class="stock-value">${state}</strong>`})
      .replace('</a>', compact ? '</a>' : '</a>' + (outlook
        ? '<div class="stock-projection">' + forecast(outlook, ctx.derived.settings.threshold, ctx.today) + '</div>' : ''));
  }).join('') + '</div>';
}

function currentCard(ctx, home = false) {
  const active = ctx.derived.active;
  const heading = '<h2>Pasza w użyciu</h2>';
  if (!active) return `<section class="card card--strong stack tight">${heading}<p>Brak partii w użyciu</p>
    <div>${link('Mieszam', 'mix', 'tonal', 'plus')}</div></section>`;
  const {batch, remaining} = active;
  const age = daysBetween(batch.start, ctx.today) + 1;
  return `<section class="card card--strong stack tight current-card">
    <div class="current-heading">${heading}${home ? '' : link('Zakończ partię','finish/' + batch.id,'tonal')}</div>
    <div>${html(batch.recipeName)} <span class="muted">· Dzień ${fmt.number(age)}</span></div>
    <p class="display">≈ ${fmt.mass(remaining)}${ctx.derived.daily > 0 ? ' · ≈ ' + fmt.days(remaining / ctx.derived.daily) : ''}</p>
    <small>prognoza</small>
    ${remaining <= 0 ? '<p>' + warning('Sprawdź, czy partia jest jeszcze podawana.') + '</p>' : ''}
    ${home ? '' : '<div>' + link('Szczegóły partii','batch/' + batch.id) + '</div>'}</section>`;
}

function lowBanner(ctx, home) {
  const entries = ctx.derived.stocks.filter(item => item.outlook && item.outlook.days < ctx.derived.settings.threshold);
  if (!entries.length) return '';
  const selected = home ? entries.slice(0, 3) : entries;
  const desc = selected.map(({ingredient, outlook}) => html(ingredient.name) + ' ≈ ' + fmt.days(outlook.days)).join(' · ');
  const more = entries.length - selected.length;
  const action = home ? link('Sprawdź', 'stock') : '';
  return banner('Do uzupełnienia', desc + (more ? ' · +' + fmt.number(more) : '') + ' <small>(prognoza)</small>', action, home);
}

function flockText(flock) {
  return `${fmt.birds(flock.total)} · ${fmt.hens(flock.hens)}, ${fmt.roosters(flock.roosters)}`;
}

export function start(ctx) {
  const {derived, today} = ctx;
  const negatives = derived.stocks.filter(row => row.grams < 0);
  const negativeAction = negatives.length === 1 ? 'movement/correction/' + negatives[0].ingredient.id : 'movement/correction';
  const smallStock = derived.stocks.filter(row => row.outlook).slice(0, 3);
  const last = derived.settings.lastExport;
  const due = daysBetween(last ?? derived.settings.createdAt.slice(0,10), today) > 30;
  return {title:'Kurnik', subtitle:fmt.headingDate(today), floating:fab('Mieszam','mix','plus'), body:`<div class="stack">
    ${currentCard(ctx, true)}
    ${lowBanner(ctx, true)}
    ${negatives.length ? banner('Sprawdź stan', negatives.map(row => html(row.ingredient.name)).join(', '),
      link('Korekta stanu', negativeAction), true) : ''}
    <section class="stack tight home-stock"><div class="section-head"><h2>Magazyn w skrócie</h2>${link('Cały magazyn', 'stock')}</div>
      ${smallStock.length ? stockRows(smallStock, ctx, true) : empty('Brak prognozy zapasu.')}</section>
    <section class="card home-flock">${row({name:'Stado', sub:html(flockText(derived.flock)), symbol:'flock', route:'flock'})}</section>
    ${due ? banner('Zapisz kopię zapasową', 'Od ostatniej kopii minęło ponad 30 dni.', link('Ustawienia', 'settings/start'), true) : ''}
    </div>`};
}

export function feed(ctx) {
  const {derived, today} = ctx;
  return {title:'Pasza', floating:fab('Mieszam','mix','plus'), body:`<div class="stack">
    ${currentCard(ctx)}
    <section class="card"><h2>Na ile starcza 100 kg?</h2><p class="display">${derived.daily > 0 ? '≈ ' + fmt.days(100000 / derived.daily) : 'Brak prognozy'}</p>
      <small>${derived.daily > 0 ? 'prognoza · ' : ''}${fmt.number(derived.daily / 1000, 3)} kg dziennie</small></section>
    <section class="stack tight"><div class="section-head"><h2>Receptury</h2>${link('Dodaj recepturę','recipe-form','', 'plus')}</div>
      ${derived.recipes.length ? '<div class="list">' + derived.recipes.map(recipe => row({name:recipe.name,
        symbol:'recipe', sub:recipe.current ? '<span class="tag">Aktualna</span>' : '',
        value:fmt.mass(recipeComposition(recipe, derived.ingredients).mass), route:'recipe/' + recipe.id})).join('') + '</div>' :
        empty('Dodaj recepturę, aby przeliczyć składniki na partię.')}</section>
    <section class="stack tight"><h2>Partie</h2>${derived.batches.length ? '<div class="list">' + derived.batches.map(batch =>
      row({name:batch.recipeName, symbol:'feed', sub:fmt.listDate(batch.date, today) + ' · ' +
        (batch.end && batch.end <= today ? 'Zakończona' : batch.start > today ? 'Zaplanowana' : 'Otwarta'),
        value:fmt.mass(batch.mass), route:'batch/' + batch.id})).join('') + '</div>' : empty('Nie zapisano jeszcze żadnej partii.')}</section>
    </div>`};
}

function costRows(cost, settings, {batch = false, consumed, daily, estimated = false} = {}) {
  if (cost.kind === 'none') return '';
  const content = [];
  const value = text => estimated ? '≈ ' + text + ' <small>prognoza</small>' : text;
  if (cost.kind === 'partial') content.push(['Koszt mieszanki','Brak danych']);
  if (cost.kind === 'full') {
    if (batch) content.push(['Koszt partii', fmt.money(cost.cents)]);
    if (!batch) content.push(['Koszt 100 kg', fmt.money(cost.perKg * 100)]);
    content.push(['Koszt kilograma', fmt.money(cost.perKg) + '/kg']);
    if (daily != null) content.push(['Koszt dzienny', value(fmt.money(daily / 1000 * cost.perKg))]);
    if (settings.readyPrice !== null) {
      content.push(['Gotowa pasza', fmt.money(settings.readyPrice) + '/kg']);
      if (batch && consumed != null && consumed > 0) {
        const difference = savings(consumed, settings.readyPrice, cost.perKg);
        content.push([difference >= 0 ? 'Oszczędność' : 'Dopłata względem gotowej paszy', value(fmt.money(Math.abs(difference)))]);
      }
      if (!batch) {
        const difference = savings(100000, settings.readyPrice, cost.perKg);
        content.push([difference >= 0 ? 'Oszczędność na 100 kg' : 'Dopłata na 100 kg', fmt.money(Math.abs(difference))]);
      }
    }
  }
  return '<section class="card stack tight"><h2>Koszt mieszanki</h2>' + details(content) + '</section>';
}

export function recipeView(ctx, id) {
  const recipe = find(ctx.data, 'recipes', id);
  if (!recipe) return missing('feed');
  const composition = recipeComposition(recipe, ctx.derived.ingredients);
  const precise = (value, unit) => fmt.number(value, 2) + ' ' + unit;
  return {title:recipe.name, parent:'feed', body:`<div class="stack">
    <section class="card stack tight"><h2>Receptura</h2><p class="display">${precise(composition.mass / 1000, 'kg')}</p>
      ${recipe.current ? '<div><span class="tag">Aktualna</span></div>' : ''}
      ${recipe.notes ? '<p class="notes">' + html(recipe.notes) + '</p>' : ''}</section>
    <section class="stack tight"><h2>Skład i proporcje</h2><div class="list">${composition.items.map(item =>
      row({name:item.name, symbol:'stock', sub:fmt.percent(item.share) + ' · ' +
        precise(item.amount / 1000 * 100000 / composition.mass, item.unit) + ' na 100 kg',
        value:precise(item.amount / 1000, item.unit)})).join('')}</div></section>
    ${costRows(mixtureCost(composition.items), ctx.derived.settings)}
    <div class="actions">${link('Edytuj', 'recipe-form/' + id, 'tonal', 'edit')}
      ${recipe.current ? '' : button('Ustaw jako aktualną', 'current', 'tonal', 'check')}
      ${link('Mieszam', 'mix/' + id, '', 'plus')}</div></div>`,
    action: (action) => { if (action === 'current') ctx.commit(data => ctx.setCurrent(data, id)); }};
}

export function batchView(ctx, id) {
  const batch = find(ctx.data, 'batches', id);
  if (!batch) return missing('feed');
  const result = batchStats(batch, ctx.data, ctx.derived, ctx.today);
  const estimated = text => !result.finished ? '≈ ' + text + ' <small>prognoza</small>' : text;
  const metrics = [];
  if (result.daily != null) {
    metrics.push(['Zużycie dzienne', estimated(fmt.number(result.daily / 1000, 3) + ' kg/dzień')]);
    if (result.daily > 0) metrics.push(['Na ile starcza 100 kg', '≈ ' + fmt.days(100000 / result.daily) + ' <small>prognoza</small>']);
    if (result.birds > 0) metrics.push(['Na ptaka dziennie', estimated(fmt.number(result.daily / result.birds, 1) + ' g')]);
  }
  return {title:'Partia', subtitle:batch.recipeName, parent:'feed', body:`<div class="stack">
    <section class="card stack tight"><p class="display">${fmt.mass(batch.mass)}</p>
      ${details([['Zmieszano', fmt.fullDate(batch.date)], ['Początek podawania', fmt.fullDate(batch.start)],
        ...(batch.end ? [['Koniec podawania', fmt.fullDate(batch.end)]] : []),
        ...(result.remaining != null ? [['Pozostałość', estimated(fmt.mass(result.remaining))]] : [])])}</section>
    ${metrics.length ? '<section class="card stack tight"><h2>Wyniki</h2>' + details(metrics) + '</section>' : ''}
    <section class="stack tight"><h2>Skład</h2><div class="list">${batch.items.map(item =>
      row({name:item.name, symbol:'stock', value:fmt.quantity(showAmount(item.grams,item),item.unit,true)})).join('')}</div></section>
    ${costRows(result.cost, ctx.derived.settings, {batch:true, consumed:result.consumed, daily:result.daily, estimated:!result.finished})}
    <div class="actions">${link(result.finished ? 'Edytuj zakończenie' : 'Zakończ partię', 'finish/' + id + '/batch', 'tonal')}
      ${link('Edytuj partię', 'batch-form/' + id, '', 'edit')}</div></div>`};
}

export function warehouse(ctx) {
  return {title:'Magazyn', floating:fab('Zakup','movement/purchase','plus'), body:`<div class="stack">
    ${lowBanner(ctx, false)}
    <section class="stack tight"><div class="section-head"><h2>Składniki</h2>${link('Dodaj składnik','ingredient-form','', 'plus')}</div>
    ${ctx.derived.stocks.length ? stockRows(ctx.derived.stocks, ctx) : empty('Nie dodano jeszcze żadnego składnika.')}</section></div>`};
}

const formatRate = (price, ingredient) => fmt.money(price.cents * 1000 / price.grams) + '/kg' +
  (ingredient.unit === 'l' ? ' · ' + fmt.money(price.cents * 1000 * ingredient.density / price.grams) + '/l' : '');

export function ingredientView(ctx, id) {
  const item = ctx.derived.stocks.find(entry => entry.ingredient.id === id);
  if (!item) return missing('stock');
  const {ingredient, grams, outlook} = item;
  const events = live(ctx.data.ingredientEvents).filter(row => row.ingredientId === id).sort(latestFirst);
  return {title:ingredient.name, parent:'stock', body:`<div class="stack"><section class="card stack tight">
    <h2>Stan wyliczony</h2><p class="display">${fmt.quantity(showAmount(grams, ingredient), ingredient.unit)}</p>
    ${grams < 0 ? warning('Sprawdź stan') : ''}
    ${forecast(outlook, ctx.derived.settings.threshold, ctx.today)}
    ${ingredient.price ? '<p><small>Ostatnia cena</small> ' + formatRate(ingredient.price, ingredient) + '</p>' : ''}
    </section><div class="actions">${link('Zakup','movement/purchase/' + id,'tonal', 'plus')}
      ${link('Korekta stanu','movement/correction/' + id,'tonal')}
      ${link('Inne pobranie','movement/withdrawal/' + id,'tonal')}
      ${link('Edytuj składnik','ingredient-form/' + id,'','edit')}</div>
    <section class="stack tight"><h2>Historia ruchów</h2>${events.length ? '<div class="list">' + events.map(event => {
      const route = event.batchId ? 'batch/' + event.batchId : 'movement/' + event.type + '/' + id + '/' + event.id;
      const sub = [fmt.listDate(event.date,ctx.today), event.notes ? html(event.notes) : '', event.price ? fmt.money(event.price.cents * event.grams / event.price.grams) : '']
        .filter(Boolean).join(' · ');
      const amount = showAmount(event.grams, ingredient);
      return row({name:movementNames[event.type], symbol:event.type === 'batch' ? 'feed' : 'stock',
        sub, value:(amount > 0 ? '+' : '') + fmt.quantity(amount, ingredient.unit), route});
    }).join('') + '</div>' : empty('Nie ma jeszcze ruchów magazynowych.')}</section></div>`};
}

export function flockView(ctx) {
  const cohorts = live(ctx.data.cohorts).sort(latestFirst);
  return {title:'Stado', floating:fab('Dodaj rocznik','cohort-form','plus'), body:`<div class="stack">
    <section class="card card--strong stack tight"><h2>Razem</h2><p class="display">${fmt.birds(ctx.derived.flock.total)}</p>
      <p>${fmt.hens(ctx.derived.flock.hens)} · ${fmt.roosters(ctx.derived.flock.roosters)}</p></section>
    <section class="stack tight"><h2>Roczniki</h2>${cohorts.length ? '<div class="list">' + cohorts.map(cohort =>
      row({name:cohort.name, symbol:'flock', sub:fmt.age(cohortAge(cohort,ctx.today)) +
        (cohort.mark ? ' · ' + html(cohort.mark) : ''), value:fmt.number(cohortCount(cohort,ctx.data.cohortChanges,ctx.today)) + ' szt.',
        route:'cohort/' + cohort.id})).join('') + '</div>' : empty('Nie ma jeszcze roczników.',link('Dodaj rocznik','cohort-form','tonal'))}</section></div>`};
}

export function cohortView(ctx, id) {
  const cohort = find(ctx.data, 'cohorts', id);
  if (!cohort) return missing('flock');
  const history = live(ctx.data.cohortChanges).filter(change => change.cohortId === id).sort(latestFirst);
  return {title:cohort.name, parent:'flock', body:`<div class="stack"><section class="card stack tight">
    <h2>${cohort.category === 'hens' ? 'Kury' : 'Koguty'}</h2>
    <p class="display">${fmt.number(cohortCount(cohort, ctx.data.cohortChanges, ctx.today))} szt.</p>
    ${details([[cohort.dateKind === 'purchase' ? 'Data zakupu' : 'Data wyklucia', fmt.fullDate(cohort.date)],
      ['Wiek', fmt.age(cohortAge(cohort, ctx.today))], ...(cohort.mark ? [['Oznaczenie',html(cohort.mark)]] : [])])}
    ${cohort.notes ? '<p class="notes">' + html(cohort.notes) + '</p>' : ''}</section>
    <div class="actions">${link('Zmień liczbę', 'change/' + id, 'tonal')}${link('Edytuj rocznik', 'cohort-form/' + id, '', 'edit')}</div>
    <section class="stack tight"><h2>Historia zmian liczby</h2>${history.length ? '<div class="list">' + history.map(change =>
      row({name:fmt.listDate(change.date,ctx.today), symbol:'flock', sub:html(change.notes), value:fmt.number(change.count) + ' szt.',
        route:'change/' + id + '/' + change.id})).join('') + '</div>' : empty('Nie ma jeszcze zmian liczby ptaków.')}</section></div>`};
}

export function missing(parent = 'start') {
  return {title:'Brak wpisu', parent, body:empty('Ten wpis jest niedostępny.', link('Wróć',parent,'tonal'))};
}
