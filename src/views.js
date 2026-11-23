import {batchBaseMass, batchOil, cohortAge, cohortEvents, cohortOrigin, cohortState, daysBetween, flockEventKind, isMixingOil, mixtureCost, recipeComposition, savings} from './calc/index.js';
import {live} from './db.js';
import {batchStats, find, latestFirst, showAmount} from './model.js';
import {banner, button, details, empty, fab, forecast, html, link, row, warning} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';

const symbol = {start:'home', feed:'feed', stock:'stock', flock:'flock'};
const tabs = {start:'Start', feed:'Pasza', stock:'Magazyn', flock:'Stado'};
const movementNames = {purchase:'Zakup', addition:'Dodanie zapasu', correction:'Korekta stanu', withdrawal:'Inne pobranie', batch:'Zużycie w partii'};

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
  const threshold = ctx.derived.settings.threshold;
  return '<div class="list">' + stocks.map(({ingredient,grams,known,outlook}) => {
    const state = known ? fmt.quantity(showAmount(grams,ingredient),ingredient.unit) : 'Stan do wpisania';
    const notices = known && grams < 0 ? warning('Sprawdź stan') : outlook && outlook.days < threshold ? warning('Na wyczerpaniu') : '';
    const projected = outlook ? forecast(outlook,threshold,ctx.today,compact) : '';
    const item = row({name:ingredient.name,symbol:compact ? '' : 'stock',route:'ingredient/' + ingredient.id,
      sub:[compact || !known ? html(state) : '',notices].filter(Boolean).join('<br>'),
      value:compact ? projected : known ? `<strong class="stock-value">${state}</strong>` : ''});
    return item + (projected && !compact ? '<div class="stock-projection">' + projected + '</div>' : '');
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

function flockText(flock) {
  return `${fmt.birds(flock.total)} · ${fmt.hens(flock.hens)}, ${fmt.roosters(flock.roosters)}`;
}

export function start(ctx) {
  const {derived, today} = ctx;
  const smallStock = derived.stocks.slice(0,3);
  const last = derived.settings.lastExport;
  const due = daysBetween(last ?? derived.settings.createdAt.slice(0,10), today) > 30;
  return {title:'Kurnik', subtitle:fmt.headingDate(today), body:`<div class="stack">
    ${currentCard(ctx, true)}
    <section class="stack tight home-stock"><div class="section-head"><h2>Magazyn w skrócie</h2>${link('Cały magazyn', 'stock')}</div>
      ${smallStock.length ? stockRows(smallStock, ctx, true) : empty('Nie ma składników w magazynie.')}</section>
    <section class="card home-flock">${row({name:'Stado', sub:html(flockText(derived.flock)), symbol:'flock', route:'flock'})}</section>
    ${due ? banner('Zapisz kopię zapasową', 'Od ostatniej kopii minęło ponad 30 dni.', link('Ustawienia', 'settings/start'), true) : ''}
    </div>`};
}

function oilVolume(item) {
  return fmt.number(item.millilitres / 1000,3) + ' l';
}

function batchLabel(batch) {
  const oil = batchOil(batch);
  return fmt.mass(batchBaseMass(batch)) + (oil ? ' + ' + oilVolume(oil) + ' oleju' : '');
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
        value:batchLabel(batch), route:'batch/' + batch.id})).join('') + '</div>' : empty('Nie zapisano jeszcze żadnej partii.')}</section>
    </div>`};
}

function costRows(cost, settings, {batch = false, consumed, daily, estimated = false, title = 'Koszt mieszanki'} = {}) {
  if (cost.kind === 'none') return '';
  const content = [];
  const value = text => estimated ? '≈ ' + text + ' <small>prognoza</small>' : text;
  if (cost.kind === 'partial') content.push([title,'Brak danych']);
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
  return '<section class="card stack tight"><h2>' + title + '</h2>' + details(content) + '</section>';
}

export function recipeView(ctx, id) {
  const recipe = find(ctx.data, 'recipes', id);
  if (!recipe) return missing('feed');
  const composition = recipeComposition(recipe, ctx.derived.ingredients);
  const hasBase = composition.items.length > 0;
  const precise = (value, unit) => fmt.number(value, unit === 'l' ? 3 : 2) + ' ' + unit;
  const baseItems = new Map(composition.items.map(item => [item.ingredientId,item]));
  const oils = new Map(ctx.derived.ingredients.filter(isMixingOil).map(item => [item.id,item]));
  const hasOil = recipe.items.some(item => oils.has(item.ingredientId));
  const recipeRows = recipe.items.map(({ingredientId,amount}) => {
    const oil = oils.get(ingredientId);
    if (oil) return row({name:oil.name,symbol:'stock',sub:'<span class="tag">Dodatek</span>',value:precise(amount / 1000,'l')});
    const item = baseItems.get(ingredientId);
    return row({name:item.name,symbol:'stock',sub:fmt.percent(item.share) + ' · ' +
      precise(item.amount / 1000 * 100000 / composition.mass,item.unit) + ' na 100 kg',
      value:precise(item.amount / 1000,item.unit)});
  }).join('');
  return {title:recipe.name, parent:'feed', body:`<div class="stack">
    <section class="card stack tight"><h2>Receptura</h2>${hasBase ? '<p class="display">' + precise(composition.mass / 1000,'kg') + '</p>'
        : '<p>Dodaj składniki bazowe do receptury.</p>'}
      ${recipe.current ? '<div><span class="tag">Aktualna</span></div>' : ''}
      ${recipe.notes ? '<p class="notes">' + html(recipe.notes) + '</p>' : ''}</section>
    <section class="stack tight"><h2>Skład i proporcje</h2><div class="list">${recipeRows}</div></section>
    ${costRows(mixtureCost(composition.items),ctx.derived.settings,hasOil ? {title:'Koszt bazy'} : {})}
    <div class="actions">${link('Edytuj', 'recipe-form/' + id, 'tonal', 'edit')}
      ${recipe.current ? '' : button('Ustaw jako aktualną', 'current', 'tonal', 'check')}
      ${hasBase ? link('Mieszam','mix/' + id,'','plus') : ''}</div></div>`,
    action: (action) => { if (action === 'current') ctx.commit(data => ctx.setCurrent(data, id)); }};
}

export function batchView(ctx, id) {
  const batch = find(ctx.data, 'batches', id);
  if (!batch) return missing('feed');
  const oil = batchOil(batch);
  const result = batchStats(batch, ctx.data, ctx.derived, ctx.today);
  const estimated = text => !result.finished ? '≈ ' + text + ' <small>prognoza</small>' : text;
  const metrics = [];
  if (result.daily != null) {
    metrics.push(['Zużycie dzienne', estimated(fmt.number(result.daily / 1000, 3) + ' kg/dzień')]);
    if (result.daily > 0) metrics.push(['Na ile starcza 100 kg', '≈ ' + fmt.days(100000 / result.daily) + ' <small>prognoza</small>']);
    if (result.birds > 0) metrics.push(['Na ptaka dziennie', estimated(fmt.number(result.daily / result.birds, 1) + ' g')]);
  }
  return {title:'Partia', subtitle:batch.recipeName, parent:'feed', body:`<div class="stack">
    <section class="card stack tight"><p class="display">${batchLabel(batch)}</p>
      ${details([['Zmieszano', fmt.fullDate(batch.date)], ['Początek podawania', fmt.fullDate(batch.start)],
        ...(batch.end ? [['Koniec podawania', fmt.fullDate(batch.end)]] : []),
        ...(result.remaining != null ? [['Pozostałość', estimated(fmt.mass(result.remaining))]] : [])])}</section>
    ${metrics.length ? '<section class="card stack tight"><h2>Wyniki</h2>' + details(metrics) + '</section>' : ''}
    <section class="stack tight"><h2>${oil ? 'Składniki bazowe' : 'Skład'}</h2><div class="list">${batch.items.filter(item => !item.oil).map(item =>
      row({name:item.name, symbol:'stock', value:fmt.quantity(showAmount(item.grams,item),item.unit,true)})).join('')}</div></section>
    ${oil ? '<section class="stack tight"><h2>Olej do mieszania</h2><div class="list">' +
      row({name:oil.name,symbol:'stock',value:oilVolume(oil)}) + '</div></section>' : ''}
    ${costRows(result.cost, ctx.derived.settings, {batch:true, consumed:result.consumed, daily:result.daily, estimated:!result.finished})}
    <div class="actions">${link(result.finished ? 'Edytuj zakończenie' : 'Zakończ partię', 'finish/' + id + '/batch', 'tonal')}
      ${link('Edytuj partię', 'batch-form/' + id, '', 'edit')}</div></div>`};
}

export function warehouse(ctx) {
  return {title:'Magazyn', floating:fab('Dodaj','movement/add','plus'), body:`<div class="stack">
    <section class="stack tight"><div class="section-head"><h2>Składniki</h2>${link('Dodaj składnik','ingredient-form','', 'plus')}</div>
    ${ctx.derived.stocks.length ? stockRows(ctx.derived.stocks, ctx) : empty('Nie dodano jeszcze żadnego składnika.')}</section></div>`};
}

const formatRate = (price, ingredient) => fmt.money(price.cents * 1000 / price.grams) + '/kg' +
  (ingredient.unit === 'l' ? ' · ' + fmt.money(price.cents * 1000 * ingredient.density / price.grams) + '/l' : '');

export function ingredientView(ctx, id) {
  const item = ctx.derived.stocks.find(entry => entry.ingredient.id === id);
  if (!item) return missing('stock');
  const {ingredient, grams, known, outlook} = item;
  const events = live(ctx.data.ingredientEvents).filter(row => row.ingredientId === id).sort(latestFirst);
  return {title:ingredient.name, parent:'stock', body:`<div class="stack"><section class="card stack tight">
    <h2>Stan wyliczony</h2>${isMixingOil(ingredient) ? '<p class="muted">Olej do mieszania</p>' : ''}<p class="display"> ${known ? fmt.quantity(showAmount(grams,ingredient),ingredient.unit) : 'Stan do wpisania'}</p>
     ${known && grams < 0 ? warning('Sprawdź stan') : ''}
    ${known && !isMixingOil(ingredient) ? forecast(outlook,ctx.derived.settings.threshold,ctx.today) : ''}
    ${ingredient.price ? '<p><small>Ostatnia cena</small> ' + formatRate(ingredient.price, ingredient) + '</p>' : ''}
    </section><div class="actions">${link('Dodaj','movement/add/' + id,'tonal','plus')}
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

function newLayingStatus(cohort, state, today) {
  return state.count > 0 && state.status === 'young' && cohort.expectedStart && cohort.expectedStart <= today;
}

export function flockView(ctx) {
  const cohorts = live(ctx.data.cohorts).sort(latestFirst);
  const {flock} = ctx.derived;
  return {title:'Stado', floating:fab('Nowe ptaki','flock-add','plus'), body:`<div class="stack">
    <section class="card card--strong stack tight"><h2>Razem</h2><p class="display">${fmt.birds(flock.total)}</p>
      ${details([['Nioski',fmt.number(flock.laying)],['Młode kury',fmt.number(flock.young)],['Koguty',fmt.number(flock.roosters)],
        ...(flock.retired ? [['Wycofane',fmt.number(flock.retired)]] : []),
        ...(flock.unknown ? [['Status do wpisania',fmt.number(flock.unknown)]] : [])])}</section>
    <section class="stack tight"><h2>Roczniki</h2>${cohorts.length ? '<div class="list">' + cohorts.map(cohort => {
      const state = cohortState(cohort,ctx.data.cohortChanges,ctx.today);
      const due = newLayingStatus(cohort,state,ctx.today);
      const sub = [state.status ? fmt.cohortStatuses[state.status] : cohort.category === 'hens' ? 'Status do wpisania' : 'Koguty',
        fmt.age(cohortAge(cohort,ctx.today)),cohort.mark ? html(cohort.mark) : ''];
      if (state.status === 'young' && cohort.expectedStart) {
        sub.push(due ? warning('Sprawdź start nieśności') : 'Przewidywany start ' + fmt.fullDate(cohort.expectedStart));
      }
      return row({name:cohort.name,symbol:'flock',sub:sub.filter(Boolean).join(' · '),
        value:fmt.number(state.count) + ' szt.',route:'cohort/' + cohort.id});
    }).join('') + '</div>' : empty('Nie ma jeszcze roczników.',link('Dodaj rocznik','cohort-form','tonal'))}</section></div>`};
}

export function flockAdd(ctx) {
  const cohorts = live(ctx.data.cohorts).sort(latestFirst);
  return {title:'Nowe ptaki',parent:'flock',body:`<div class="stack">
    <div>${link('Nowy rocznik','cohort-form','tonal','plus')}</div>
    ${cohorts.length ? '<section class="stack tight"><h2>Dodaj do istniejącego rocznika</h2><div class="list">' +
      cohorts.map(cohort => row({name:cohort.name,symbol:'flock',sub:html(cohort.mark),route:'change/' + cohort.id + '/add'})).join('') +
      '</div></section>' : ''}</div>`};
}

export function cohortView(ctx, id) {
  const cohort = find(ctx.data,'cohorts',id);
  if (!cohort) return missing('flock');
  const history = cohortEvents(cohort,ctx.data.cohortChanges,ctx.today).reverse();
  const state = cohortState(cohort,ctx.data.cohortChanges,ctx.today);
  const isHen = cohort.category === 'hens';
  const dateLabel = {purchase:'Data zakupu',hatch:'Data wyklucia',initial:'Data stanu początkowego'};
  const layingDateKnown = state.layingSince && (state.status !== 'retired' || state.retiredSince);
  const layingYear = layingDateKnown ? Math.floor(cohortAge({date:state.layingSince,dateKind:'hatch'},
    state.retiredSince ?? ctx.today).months / 12) + 1 : null;
  const due = newLayingStatus(cohort,state,ctx.today);
  const eventRows = history.map(event => {
    const kind = flockEventKind(event);
    const context = kind === 'loss' ? fmt.lossReasons[event.reason] : kind === 'add' ? fmt.cohortOrigins[event.origin] : '';
    const count = kind === 'status' ? fmt.cohortStatuses[event.status] :
      (kind === 'add' ? '+' : kind === 'loss' ? '−' : '') + fmt.number(event.count) + ' szt.';
    return row({name:fmt.flockEvents[kind],symbol:'flock',
      sub:[fmt.fullDate(event.date),context,html(event.notes)].filter(Boolean).join(' · '),
      value:count,route:'change/' + id + '/' + kind + '/' + event.id});
  }).join('');
  const origin = fmt.cohortOrigins[cohortOrigin(cohort)];
  return {title:cohort.name,parent:'flock',body:`<div class="stack">
    <section class="card stack tight"><h2>${isHen ? 'Kury' : 'Koguty'}</h2>
    <p class="display">${fmt.number(state.count)} szt.</p>
    ${details([[dateLabel[cohort.dateKind],fmt.fullDate(cohort.date)],['Pochodzenie',origin],
      ['Wiek',fmt.age(cohortAge(cohort,ctx.today))],
      ...(cohort.mark ? [['Oznaczenie',html(cohort.mark)]] : []),
      ...(isHen ? [['Status',fmt.cohortStatuses[state.status] ?? 'Nieustalony']] : []),
      ...(state.status === 'young' && cohort.expectedStart ? [['Przewidywany start nieśności',fmt.fullDate(cohort.expectedStart)]] : []),
      ...(layingYear ? [[state.status === 'retired' ? 'Ostatni odnotowany rok nieśności' : 'Rok nieśności',
        fmt.number(layingYear) + '.']] : [])])}
    ${cohort.notes ? '<p class="notes">' + html(cohort.notes) + '</p>' : ''}</section>
    ${due ? banner('Sprawdź start nieśności','Minęła przewidywana data startu nieśności.',
      link('Zmień status','change/' + id + '/status')) : ''}
    <div class="actions">${link('Nowe ptaki','change/' + id + '/add','tonal','plus')}${link('Ubytek','change/' + id + '/loss','tonal')}
      ${!due && isHen && state.status !== 'retired' ? link('Zmień status','change/' + id + '/status','tonal') : ''}
      ${link('Korekta liczby','change/' + id + '/correction','tonal')}
      ${link('Edytuj rocznik','cohort-form/' + id,'','edit')}</div>
    <section class="stack tight"><h2>Historia zdarzeń</h2><div class="list">${eventRows}
      ${row({name:cohortOrigin(cohort) === 'initial' ? 'Stan początkowy' : 'Nowy rocznik',symbol:'flock',
        sub:[fmt.fullDate(cohort.date),cohortOrigin(cohort) === 'initial' ? '' : origin].filter(Boolean).join(' · '),
        value:fmt.number(cohort.count) + ' szt.',route:'cohort-form/' + id})}
    </div></section></div>`};
}

export function missing(parent = 'start') {
  return {title:'Brak wpisu', parent, body:empty('Ten wpis jest niedostępny.', link('Wróć',parent,'tonal'))};
}
