import {addDays, batchAdditives, batchBaseMass, batchOil, batchResult, cohortAge, cohortCounts, cohortEvents, cohortStage, dailyHistory,
  dateOf, dayNumber, daysBetween, flockEventKind, hatchRate, incubation, isAdditive, weeksOld, lastBatchMass, mixtureCost, nowPoint, purchaseNeed,
  recipeComposition, roundPurchase, savings, scaleBatch} from './calc/index.js';
import {live} from './db.js';
import {batchStats, find, isFinished, latestFirst, showAmount} from './model.js';
import {button, details, empty, figure, headLink, hero, html, line, link, listCard, side, sideCount, strip, textLink, tile} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';
import {t} from '../ui/texts.js';

// Zasady ekranów: etykieta, liczba, krótki podpis. Bez „około” – prognozę oznacza tylko „≈” na Starcie.

const symbol = {start:'home', feed:'sack', stock:'pallet', flock:'hen'};

export function frame(screen, route) {
  const {title, subtitle = '', parent, form = false, body, floating = '', edit = ''} = screen;
  const root = route.split('/')[0];
  const main = !parent;
  const navigation = main ? `<nav class="navigation" aria-label="${t.mainNavigation}"><div class="tabs">${Object.entries(t.tabs)
    .map(([key, label]) => `<a href="#${key}"${root === key ? ' aria-current="page"' : ''}><span>${icon(symbol[key])}</span><span>${label}</span></a>`).join('')}</div></nav>` : '';
  const end = main ? `<a class="icon-button" aria-label="${t.settings}" href="#settings/${root}">${icon('settings')}</a>`
    : edit ? `<a class="icon-button" aria-label="${t.edit}" href="#${html(edit)}">${icon('edit')}</a>` : '';
  return `<header class="app-bar">${parent ? `<button class="icon-button" type="button" data-action="back"
    aria-label="${form ? t.close : t.back}">${icon(form ? 'close' : 'back')}</button>` : ''}
    <div class="app-bar-text"><h1 tabindex="-1">${html(title)}</h1>${subtitle ? '<p class="eyebrow">' + html(subtitle) + '</p>' : ''}</div>
    ${end}</header>
    <main class="page ${main ? 'page--main' : ''} ${form ? 'page--form' : ''}" id="content">${body}</main>${floating}${navigation}`;
}

// Stan składnika zawsze dokładnie (do grama, bez zbędnych zer): 1,25 kg, 22,5 kg, 187 kg.
const quantity = (grams, ingredient, signed = false) =>
  fmt.stockQuantity(showAmount(grams, ingredient), ingredient.unit, signed);
const amount = (grams, ingredient) => quantity(grams, ingredient);
const signedAmount = (grams, ingredient) => quantity(grams, ingredient, true);
const zloty = cents => fmt.number(Math.round(cents / 100));
const perKg = cents => fmt.money(cents) + t.perKgSuffix;

function firstUnknown(stocks) {
  return stocks.find(row => !row.known)?.ingredient;
}

// „ + 2,2 l oleju” albo „ + dodatki”; pusto, gdy partia nie ma dodatków.
function additivesLabel(batch) {
  const additives = batchAdditives(batch);
  if (!additives.length) return '';
  const oil = batchOil(batch);
  if (additives.length === 1 && (oil || additives[0].unit === 'l')) {
    const item = oil ?? additives[0];
    if (/^olej/iu.test(item.name)) return t.withOil(fmt.number(item.millilitres / 1000, 1) + ' l');
  }
  return t.withAdditives;
}

const batchLabel = batch => fmt.mass(batchBaseMass(batch)) + additivesLabel(batch);
const feedingDay = (batch, today) => Math.floor(nowPoint(today) - dayNumber(batch.start)) + 1;
const batchRange = (batch, today) => fmt.listDate(batch.start, today) + ' – ' + fmt.listDate(addDays(batch.end, -1), today);

function runOut(ctx) {
  const {runsOutAt} = ctx.derived;
  if (runsOutAt == null || !Number.isFinite(runsOutAt)) return null;
  const days = Math.max(0, runsOutAt - nowPoint(ctx.today));
  return {days, date:dateOf(runsOutAt)};
}

// ───────────── Start ─────────────

// Czego brakuje na kolejną partię tej samej masy co ostatnia: {mass, missing:[tekst], unknown:[składnik]}.
function nextBatchNeeds(ctx) {
  const {composition, batches, stocks} = ctx.derived;
  if (!composition) return null;
  const mass = lastBatchMass(batches);
  const byId = new Map(stocks.map(row => [row.ingredient.id, row]));
  const missing = [], unknown = [];
  for (const item of scaleBatch(composition, mass)) {
    const entry = byId.get(item.ingredientId);
    if (!entry) continue;
    const ingredient = entry.ingredient;
    if (!entry.known) { unknown.push(ingredient); continue; }
    if (entry.grams < item.grams) {
      const need = roundPurchase(item.grams - entry.grams, ingredient.unit, ingredient.density);
      missing.push(item.name + ' ' + fmt.quantity(need, ingredient.unit));
    }
  }
  return {mass, missing, unknown};
}

// Karta główna Startu: kiedy następne mieszanie, ile zostało, do kiedy starczy.
function nextMixHero(ctx) {
  const {active, openStatus} = ctx.derived;
  const today = ctx.today;
  const mixButton = `<div class="hero-action">${link(t.mix, 'mix', 'filled', 'plus')}</div>`;
  if (!active) return hero({label:t.nextMix, value:figure(t.now), caption:t.noMixInUse, after:mixButton});
  const base = batchBaseMass(active.batch);
  const remaining = Math.max(0, active.remaining);
  const end = runOut(ctx);
  const gone = active.remaining <= 0;
  const value = gone ? figure(t.now) : !end ? '—' : end.days < .5 ? figure(t.today) : '<span class="approx">≈</span>' + figure(fmt.days(end.days));
  const sides = [end && !gone ? side(t.until, fmt.shortDate(end.date, today)) : '', side(t.left, fmt.mass(remaining))].filter(Boolean);
  const caption = [gone ? t.mixGone : '', openStatus.length > 1 ? t.openBatches(openStatus.length - 1) : ''].filter(Boolean).join(' · ');
  const soon = gone || (end && end.days <= 3);
  return hero({label:t.nextMix, value, sides, bar:[remaining, base], caption, low:gone, route:'feed', after:soon ? mixButton : ''});
}

// Pasek tylko wtedy, gdy czegoś brakuje na następną partię albo nie wszystko jest wpisane.
function needsStrip(ctx) {
  const needs = nextBatchNeeds(ctx);
  if (!needs) return '';
  if (needs.missing.length) {
    return strip({title:t.shortFor(fmt.mass(needs.mass)), line:needs.missing.join(' · '), route:'stock', label:t.toStock});
  }
  if (needs.unknown.length) {
    return strip({title:t.stocksUnknown, line:needs.unknown.map(row => row.name).join(', '),
      route:'movement/correction/' + needs.unknown[0].id, label:t.enterShort, tone:'info'});
  }
  return '';
}

function flockParts(counts) {
  return [counts.hens ? fmt.hens(counts.hens) : '', counts.roosters ? fmt.roosters(counts.roosters) : '',
    counts.young ? fmt.chicks(counts.young) : ''].filter(Boolean);
}

function flockTile(ctx) {
  const {flock, cohorts} = ctx.derived;
  if (!cohorts.length) return tile({label:t.birdsTile, value:'—', caption:t.addBirdsShort, route:'cohort-form'});
  return tile({label:t.birdsTile, value:figure(fmt.number(flock.total), t.pcs), caption:flockParts(flock).join(' · '), route:'flock'});
}

// „36 szt. × 106 g”, a bez stada samo źródło liczby.
function useBasis(model) {
  return [model.perBird != null ? t.basisShort(fmt.number(model.birds), fmt.number(model.perBird, 0)) : '',
    model.fromHistory ? '' : t.fromSettingsShort].filter(Boolean).join(' · ');
}

function useTile(ctx, route = 'feed') {
  const {model} = ctx.derived;
  const caption = route === 'feed'
    ? [model.perBird != null ? t.perBirdShort(fmt.number(model.perBird, 0)) : '', model.fromHistory ? '' : t.fromSettingsShort].filter(Boolean).join(' · ')
    : useBasis(model);
  return tile({label:t.dailyTile, value:figure(fmt.number(model.daily / 1000, 1), 'kg'), caption, route});
}

function costTile(ctx) {
  const {model, current, composition} = ctx.derived;
  if (!current || !composition || !(model.daily > 0)) return '';
  const cost = mixtureCost([...composition.items, ...composition.additives]);
  if (cost.kind !== 'full') return '';
  return tile({label:t.monthCost, value:figure(zloty(model.daily / 1000 * cost.perKg * 30), 'zł'), caption:t.fromPrices,
    route:'recipe/' + current.id});
}

// Inkubacja i pisklęta jako kafelki. „Inkubacja 2026” zostaje bez powtórzenia słowa.
const stageLabel = (word, name) => name.toLowerCase().startsWith(word.toLowerCase()) ? name : word + ': ' + name;

function hatchValue(state) {
  const late = state.day > 22;
  return {late, value:late ? figure(t.hatchLate) : state.early ? figure(t.hatching) : figure(fmt.days(state.left))};
}

function rearingTile(cohort, ctx) {
  const route = 'cohort/' + cohort.id;
  if (cohortStage(cohort) === 'incubation') {
    const state = incubation(cohort, ctx.today);
    const {late, value} = hatchValue(state);
    const caption = [late || state.early ? '' : t.toHatch, t.incubationDayShort(fmt.number(state.day)), fmt.eggs(state.eggsLeft)]
      .filter(Boolean).join(' · ');
    return tile({label:stageLabel(t.incubation, cohort.name), value, caption, route, low:late});
  }
  const count = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today).young;
  const caption = [t.weeksOld(fmt.number(weeksOld(cohort, ctx.today))),
    cohort.rearing.feedFrom ? t.feedOwnShort : t.feedBoughtShort].join(' · ');
  return tile({label:stageLabel(t.chicks, cohort.name), value:figure(fmt.number(count), t.pcs), caption, route});
}

// Trzy składniki, które skończą się najszybciej. Same dni; ile potrzeba jest w szczegółach składnika.
function suppliesCard(ctx) {
  const {stocks, settings} = ctx.derived;
  const rows = stocks.filter(row => row.outlook).slice(0, 3);
  if (!rows.length) return '';
  return `<section class="list supplies"><h2 class="list-title">${t.supplies}</h2>${rows.map(({ingredient, outlook}) => {
    const low = outlook.days < settings.threshold;
    return `<a class="supply-row${low ? ' supply-row--low' : ''}" href="#ingredient/${html(ingredient.id)}">
      <span class="grow">${html(ingredient.name)}</span><strong>${low ? icon('warn') : ''}${html(fmt.days(outlook.days))}</strong></a>`;
  }).join('')}</section>`;
}

export function start(ctx) {
  const {derived, today} = ctx;
  const {settings} = derived;
  const last = settings.lastExport;
  const due = daysBetween(last ?? settings.createdAt.slice(0, 10), today) > 30;
  const tiles = [flockTile(ctx), useTile(ctx), ...derived.rearing.map(cohort => rearingTile(cohort, ctx)), costTile(ctx)].filter(Boolean);
  return {title:t.appName, subtitle:fmt.headingDate(today), body:`<div class="stack">
    ${nextMixHero(ctx)}${needsStrip(ctx)}
    <div class="tiles">${tiles.join('')}</div>
    ${suppliesCard(ctx)}
    ${due ? strip({title:t.backupShort, line:last ? t.backupDue : t.backupNever, action:'backup', label:t.makeBackup, tone:'info'}) : ''}</div>`,
    action(action) { if (action === 'backup') return ctx.exportBackup(true); }};
}

// ───────────── Mieszanka ─────────────

function activeHero(ctx) {
  const {active, openStatus} = ctx.derived;
  const today = ctx.today;
  const mixButton = link(t.mix, 'mix', 'filled', 'plus');
  if (!active) return hero({label:t.inUse, value:'—', caption:t.noMixInUse, after:`<div class="hero-buttons">${mixButton}</div>`});
  const {batch} = active;
  const base = batchBaseMass(batch);
  const remaining = Math.max(0, active.remaining);
  const end = runOut(ctx);
  const gone = active.remaining <= 0;
  const sides = [end && !gone ? side(t.until, fmt.shortDate(end.date, today)) : '', side(t.dayWord, fmt.number(feedingDay(batch, today)))]
    .filter(Boolean);
  const caption = [t.mixedShort(fmt.listDate(batch.date, today)) + additivesLabel(batch), gone ? t.mixGone : '',
    openStatus.length > 1 ? t.openBatches(openStatus.length - 1) : ''].filter(Boolean).join(' · ');
  return hero({label:t.inUse + ' · ' + batch.recipeName, value:figure(fmt.mass(remaining)) + '<span class="of">' + html(t.of(fmt.mass(base))) + '</span>',
    sides, bar:[remaining, base], caption, low:gone, route:'batch/' + batch.id,
    after:`<div class="hero-buttons">${mixButton}${link(t.finishBatch, 'finish/' + batch.id, 'tonal')}</div>`});
}

function usageChart(ctx) {
  const rows = dailyHistory(ctx.derived.batches, addDays(ctx.today, 1));
  if (rows.length < 3) return '';
  const max = Math.max(...rows.map(row => row.daily)) || 1;
  const bars = rows.map((row, i) => {
    const kg = fmt.number(row.daily / 1000, 1);
    return `<div class="bar-col" title="${html(fmt.monthYear(row.end) + ': ' + t.kgPerDay(kg))}"><span>${kg}</span>
      <i class="${i === rows.length - 1 ? 'last' : ''}" style="height:${Math.max(4, 64 * row.daily / max).toFixed(0)}px"></i>
      <small>${fmt.monthYear(row.end)}</small></div>`;
  }).join('');
  return `<section class="card chart-card"><h2 class="list-title">${t.chartTitle}</h2>
    <div class="bars" role="img" aria-label="${t.chartLabel}">${bars}</div></section>`;
}

function recipeRows(ctx) {
  const {recipes, ingredients} = ctx.derived;
  if (!recipes.length) return empty(t.noRecipes);
  return recipes.map(recipe => {
    const composition = recipeComposition(recipe, ingredients);
    const cost = mixtureCost([...composition.items, ...composition.additives]);
    const sub = [fmt.ingredientCount(recipe.items.length), cost.kind === 'full' ? perKg(cost.perKg) : ''].filter(Boolean).join(' · ');
    return line({title:recipe.name, sub:html(sub), route:'recipe/' + recipe.id,
      after:recipe.current ? '<span class="tag">' + t.currentShort + '</span>' : ''});
  }).join('');
}

function batchRows(ctx) {
  const {batches, current} = ctx.derived;
  const today = ctx.today;
  if (!batches.length) return '<div class="r-row"><small>' + html(t.noBatches) + '</small></div>';
  return batches.map(batch => {
    const finished = isFinished(batch, today);
    const planned = batch.start > today;
    const other = current && batch.recipeName !== current.name ? batch.recipeName : '';
    let title, sub;
    if (finished) {
      const result = batchResult(batch);
      title = batchRange(batch, today);
      sub = [fmt.days(result.days), result.daily != null ? t.kgPerDay(fmt.number(result.daily / 1000, 1)) : '', other];
    } else {
      title = t.fromDate(fmt.listDate(batch.start, today));
      sub = [planned ? t.statusPlannedShort : t.statusOpenShort, planned ? '' : t.dayN(feedingDay(batch, today)), other];
    }
    return line({title, sub:html(sub.filter(Boolean).join(' · ')), value:html(fmt.mass(batchBaseMass(batch))), route:'batch/' + batch.id});
  }).join('');
}

export function feed(ctx) {
  const {model} = ctx.derived;
  const lasts = model.daily > 0 ? figure(fmt.days(100000 / model.daily)) : '—';
  return {title:t.feed, body:`<div class="stack">
    ${activeHero(ctx)}
    <div class="tiles">
      ${tile({label:t.lasts100, value:lasts, caption:model.fromHistory ? t.atCurrentUse : t.fromSettingsShort})}
      ${tile({label:t.dailyTile, value:figure(fmt.number(model.daily / 1000, 1), 'kg'), caption:useBasis(model)})}
    </div>
    ${usageChart(ctx)}
    ${listCard(t.recipes, recipeRows(ctx), headLink(t.newFemale, 'recipe-form'))}
    ${listCard(t.batches, batchRows(ctx))}
    </div>`};
}

// Kafelki kosztu: partia albo receptura (na 100 kg).
function costTiles(cost, settings, {batch = false, consumed = 0} = {}) {
  if (cost.kind === 'none') return '';
  if (cost.kind === 'partial') return strip({title:t.cost, line:t.costPartial, tone:'info'});
  const tiles = [];
  const ready = settings.readyPrice;
  if (batch) tiles.push(tile({label:t.costBatch, value:figure(zloty(cost.cents), 'zł'), caption:perKg(cost.perKg)}));
  else tiles.push(tile({label:t.cost100, value:figure(zloty(cost.perKg * 100), 'zł'), caption:perKg(cost.perKg)}));
  if (ready !== null) {
    const mass = batch ? consumed : 100000;
    if (mass > 0) {
      const difference = savings(mass, ready, cost.perKg);
      tiles.push(tile({label:batch ? (difference >= 0 ? t.cheaperBy : t.dearerBy) : (difference >= 0 ? t.cheaper100 : t.dearer100),
        value:figure(zloty(Math.abs(difference)), 'zł'), caption:t.readyAt(perKg(ready))}));
    }
  }
  return '<div class="tiles">' + tiles.join('') + '</div>';
}

export function recipeView(ctx, id) {
  const recipe = find(ctx.data, 'recipes', id);
  if (!recipe) return missing('feed');
  const composition = recipeComposition(recipe, ctx.derived.ingredients);
  const byId = new Map([...composition.items, ...composition.additives].map(item => [item.ingredientId, item]));
  const rows = recipe.items.map(({ingredientId}) => {
    const item = byId.get(ingredientId);
    const per100 = fmt.precise(item.amount / 1000 * 100000 / composition.mass, item.unit);
    return line({title:item.name, strong:false, sub:html(item.additive ? t.additiveShort : fmt.percent(item.share)), value:html(per100)});
  }).join('');
  const cost = mixtureCost([...composition.items, ...composition.additives]);
  const extra = [recipe.items.length > 1 ? textLink(t.reorder, 'recipe-order/' + id) : '',
    recipe.current ? '' : button(t.setCurrent, 'current', 'text', 'check')].filter(Boolean).join('');
  return {title:recipe.name, parent:'feed', edit:'recipe-form/' + id, body:`<div class="stack">
    ${hero({label:recipe.current ? t.recipe + ' · ' + t.currentShort : t.recipe, value:figure(fmt.ingredientCount(recipe.items.length)),
      sides:cost.kind === 'full' ? [side('', perKg(cost.perKg))] : [], after:`<div class="hero-action">${link(t.mix, 'mix/' + id, 'filled', 'plus')}</div>`})}
    ${recipe.notes ? '<section class="card"><p class="notes">' + html(recipe.notes) + '</p></section>' : ''}
    ${listCard(t.composition100, rows)}
    ${costTiles(cost, ctx.derived.settings)}
    ${extra ? '<div class="actions">' + extra + '</div>' : ''}</div>`,
    action: action => { if (action === 'current') return ctx.commit(data => ctx.setCurrent(data, id)); }};
}

export function batchView(ctx, id, fromEventId) {
  const batch = find(ctx.data, 'batches', id);
  if (!batch) return missing('feed');
  const today = ctx.today;
  const event = fromEventId && find(ctx.data, 'ingredientEvents', fromEventId);
  const parent = event && event.batchId === id ? 'movement-detail/' + event.id : fromEventId === 'start' ? 'start' : 'feed';
  const result = batchStats(batch, ctx.data, ctx.derived, today);
  const planned = batch.start > today;
  const base = batchBaseMass(batch);
  let label, value, sides, bar = null;
  if (result.finished) {
    label = t.statusFinished + ' · ' + batchRange(batch, today);
    value = figure(fmt.days(result.days));
    sides = [side('', fmt.mass(base)), additivesLabel(batch) ? '<span>' + html(additivesLabel(batch).trim()) + '</span>' : ''];
  } else {
    const left = Math.max(0, result.remaining ?? base);
    label = (planned ? t.statusPlanned : t.statusOpen) + ' · ' + t.fromDate(fmt.listDate(batch.start, today));
    value = figure(fmt.mass(left)) + '<span class="of">' + html(t.of(fmt.mass(base))) + '</span>';
    sides = planned ? [] : [side(t.dayWord, fmt.number(feedingDay(batch, today)))];
    bar = [left, base];
  }
  const leftover = result.finished && result.remaining > 0 ? t.leftoverShort(fmt.mass(result.remaining)) : '';
  const caption = [t.mixedShort(fmt.listDate(batch.date, today)) + (result.finished ? '' : additivesLabel(batch)), leftover].filter(Boolean).join(' · ');
  const tiles = result.daily != null ? tile({label:t.dailyTile, value:figure(fmt.number(result.daily / 1000, 1), 'kg'),
    caption:result.birds > 0 ? t.perBirdShort(fmt.number(result.daily / result.birds, 0)) : ''}) : '';
  const items = batch.items.map(item => {
    const extra = item.additive || item.oil;
    const shown = item.millilitres != null ? fmt.stockQuantity(item.millilitres / 1000, 'l')
      : fmt.stockQuantity(showAmount(item.grams, item), item.unit);
    return line({title:item.name, strong:false, sub:extra ? html(t.additiveShort) : '', value:html(shown)});
  }).join('');
  return {title:t.batch, subtitle:batch.recipeName, parent, edit:'batch-form/' + id, body:`<div class="stack">
    ${hero({label, value, sides:sides.filter(Boolean), bar, caption})}
    ${tiles ? '<div class="tiles">' + tiles + '</div>' : ''}
    ${costTiles(result.cost, ctx.derived.settings, {batch:true, consumed:result.consumed})}
    ${listCard(t.batchContent, items)}
    <div class="actions">${link(result.finished ? t.changeFinish : t.finishBatch, 'finish/' + id + '/batch', 'tonal')}</div>
    </div>`};
}

// ───────────── Magazyn ─────────────

const HORIZON = 90; // pełny pasek = zapas na 3 miesiące i więcej

function stockLine(ctx, {ingredient, grams, known, outlook}) {
  const {settings} = ctx.derived;
  const low = (known && grams < 0) || (outlook && outlook.days < settings.threshold);
  const notes = [];
  if (outlook) notes.push(`${low ? icon('warn') : ''}<em>${html(fmt.days(outlook.days))}</em> · ${html(t.until + ' ' + fmt.shortDate(outlook.date, ctx.today))}`);
  if (!known) notes.push(html(t.enterStockShort));
  else if (grams < 0) notes.push(html(t.checkStockShort));
  else if (!outlook) notes.push(html(t.outsideRecipe));
  if (isAdditive(ingredient)) notes.push(html(t.additiveShort));
  return `<a class="s-row${low ? ' s-row--low' : ''}" href="#ingredient/${html(ingredient.id)}">
    <span class="s-top"><span class="grow"><b>${html(ingredient.name)}</b><small>${notes.join(' · ')}</small></span>
      <span class="s-val">${known ? html(amount(grams, ingredient)) : '—'}</span>${icon('next')}</span>
    ${outlook ? `<progress class="s-bar" aria-hidden="true" value="${Math.min(outlook.days, HORIZON)}" max="${HORIZON}"></progress>` : ''}</a>`;
}

export function warehouse(ctx) {
  const {stocks} = ctx.derived;
  const first = firstUnknown(stocks);
  const none = stocks.length && !stocks.some(row => row.known);
  return {title:t.stock, body:`<div class="stack">
    ${none && first ? strip({title:t.enterStocks, line:t.enterStocksLine, route:'movement/correction/' + first.id, label:t.enterShort, tone:'info'}) : ''}
    ${listCard(t.stockList, stocks.length ? stocks.map(item => stockLine(ctx, item)).join('')
      : '<div class="r-row"><small>' + html(t.noIngredients) + '</small></div>', headLink(t.newMale, 'ingredient-form'))}
    ${stocks.length ? '<div>' + textLink(t.addToStockShort, 'movement/add', 'plus') + '</div>' : ''}</div>`};
}

const formatRate = (price, ingredient) => fmt.money(price.cents * 1000 / price.grams) + t.perKgSuffix +
  (ingredient.unit === 'l' ? ' · ' + fmt.money(price.cents * 1000 * ingredient.density / price.grams) + t.perLitreSuffix : '');

function needTiles(ctx, {ingredient, grams, rate}) {
  const {daily, mixed} = ctx.derived;
  return '<div class="tiles">' + [2, 3].map(months => {
    const need = roundPurchase(purchaseNeed(grams, rate, daily, mixed, months * 30), ingredient.unit, ingredient.density);
    return tile({label:t.needFor(months), value:need > 0 ? figure(fmt.quantity(need, ingredient.unit)) : '—',
      caption:need > 0 ? t.overStock : t.stockEnough});
  }).join('') + '</div>';
}

export function ingredientView(ctx, id) {
  const item = ctx.derived.stocks.find(entry => entry.ingredient.id === id);
  if (!item) return missing('stock');
  const {ingredient, grams, known, rate, outlook} = item;
  const low = (known && grams < 0) || (outlook && outlook.days < ctx.derived.settings.threshold);
  const events = live(ctx.data.ingredientEvents).filter(row => row.ingredientId === id).sort(latestFirst);
  const caption = [!known ? t.enterStockShort : grams < 0 ? t.checkStockShort : '',
    rate != null ? t.inEvery100(fmt.precise(showAmount(rate * 100000, ingredient), ingredient.unit)) : t.outsideRecipe,
    isAdditive(ingredient) ? t.additiveShort : '',
    ingredient.price ? t.lastPriceShort(formatRate(ingredient.price, ingredient)) : ''].filter(Boolean).join(' · ');
  const sides = outlook ? [side('', fmt.days(outlook.days)), side(t.until, fmt.shortDate(outlook.date, ctx.today))] : [];
  const history = events.map(event => {
    const batch = event.batchId && find(ctx.data, 'batches', event.batchId);
    const price = event.price && event.priceMode !== 'total' ? fmt.money(event.price.cents * 1000 / event.price.grams) + t.perKgSuffix : '';
    const sub = [fmt.listDate(event.date, ctx.today), batch ? batch.recipeName : price, event.type === 'batch' ? '' : event.notes]
      .filter(Boolean).join(' · ');
    return line({title:t.movementNames[event.type], strong:false, sub:html(sub), value:html(signedAmount(event.grams, ingredient)),
      plus:event.grams > 0, route:'movement-detail/' + event.id});
  }).join('');
  return {title:ingredient.name, parent:'stock', edit:'ingredient-form/' + id, body:`<div class="stack">
    ${hero({label:t.stockLabel, value:known ? figure(amount(grams, ingredient)) : '—', sides, low,
      bar:outlook ? [Math.min(outlook.days, HORIZON), HORIZON] : null, caption})}
    <div class="chip-row">${link(t.add, 'movement/add/' + id, 'tonal', 'plus')}${link(t.correctionShort, 'movement/correction/' + id, 'chip')}
      ${link(t.withdrawalShort, 'movement/withdrawal/' + id, 'chip')}</div>
    ${outlook ? needTiles(ctx, item) : ''}
    ${listCard(t.history, history || '<div class="r-row"><small>' + html(t.noHistory) + '</small></div>')}</div>`};
}

export function movementDetail(ctx, id) {
  const event = find(ctx.data, 'ingredientEvents', id);
  if (!event) return missing('stock');
  const ingredient = find(ctx.data, 'ingredients', event.ingredientId);
  if (!ingredient) return missing('stock');
  const parent = 'ingredient/' + ingredient.id;
  const batch = event.batchId && find(ctx.data, 'batches', event.batchId);
  const info = [[t.date, fmt.fullDate(event.date)]];
  if (event.type === 'correction' && event.measured != null) info.push([t.stockAfter, quantity(event.measured, ingredient)]);
  if (event.price) {
    info.push([t.purchaseCost, fmt.money(event.price.cents * event.grams / event.price.grams)]);
    if (event.priceMode !== 'total') {
      const perLitre = event.priceMode === 'per-litre';
      const unitMass = perLitre ? Math.round(ingredient.density * 1000) : 1000;
      info.push([t.unitPrice, fmt.money(event.price.cents * unitMass / event.price.grams) + (perLitre ? t.perLitreSuffix : t.perKgSuffix)]);
    }
  }
  if (batch) info.push([t.batch, html(batch.recipeName) + ' · ' + html(batchLabel(batch))]);
  const action = batch ? link(t.showBatch, 'batch/' + batch.id + '/' + id, 'tonal') : '';
  const edit = !batch && event.type !== 'batch' ? 'movement/' + event.type + '/' + ingredient.id + '/' + id : '';
  return {title:t.movementNames[event.type], subtitle:ingredient.name, parent, edit, body:`<div class="stack">
    <section class="card stack tight"><p class="display">${quantity(event.grams, ingredient, true)}</p>${details(info)}
    ${event.notes ? '<p class="notes">' + html(event.notes) + '</p>' : ''}</section>
    ${action ? '<div class="actions">' + action + '</div>' : ''}</div>`};
}

// ───────────── Kury ─────────────

const hensRoosters = counts => {
  const parts = [counts.hens ? fmt.hens(counts.hens) : '', counts.roosters ? fmt.roosters(counts.roosters) : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : t.pieces('0');
};

// Podpis rocznika: podział tylko w mieszanych, „koguty” gdy same koguty; potem wiek i oznaczenie.
function cohortSub(cohort, counts, today) {
  const split = counts.hens && counts.roosters ? hensRoosters(counts) : counts.roosters ? t.roosters.toLowerCase() : '';
  return [split, fmt.age(cohortAge(cohort, today)), cohort.mark].filter(Boolean).join(' · ');
}

export function flockView(ctx) {
  const cohorts = ctx.derived.cohorts.slice().sort(latestFirst);
  const {flock, rearing} = ctx.derived;
  const top = cohorts.length
    ? hero({label:t.inCoop, value:figure(fmt.number(flock.total), t.pcs), sides:flockParts(flock).map(sideCount)})
    : hero({label:t.inCoop, value:'—', caption:t.addFirstCohort, after:`<div class="hero-action">${link(t.addCohort, 'cohort-form', 'filled', 'plus')}</div>`});
  const rows = cohorts.map(cohort => {
    const counts = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today);
    return line({title:cohort.name, sub:html(cohortSub(cohort, counts, ctx.today)),
      value:html(t.pieces(fmt.number(counts.hens + counts.roosters))), route:'cohort/' + cohort.id});
  }).join('');
  return {title:t.flock, body:`<div class="stack">
    ${top}
    ${rearing.length ? '<div class="tiles">' + rearing.map(cohort => rearingTile(cohort, ctx)).join('') + '</div>' : ''}
    ${cohorts.length ? listCard(t.cohorts, rows, headLink(t.newMale, 'cohort-form')) : ''}
    <div>${textLink(t.addRearing, 'rearing-form', 'plus')}</div></div>`};
}

// Wiersze zmian: data, notatka, „−1 kura”.
function historyRows(ctx, cohort) {
  const counted = {hens:fmt.hens, roosters:fmt.roosters, young:fmt.chicks};
  return cohortEvents(cohort, ctx.data.cohortChanges).reverse().map(event => {
    const kind = flockEventKind(event);
    const text = counted[event.sex ?? 'hens'](event.count);
    const value = kind === 'add' ? '+' + text : kind === 'loss' ? '−' + text : t.correctionRow(fmt.number(event.count));
    return line({title:fmt.fullDate(event.date), strong:false, sub:html(event.notes), value:html(value), plus:kind === 'add',
      route:kind === 'correction' ? '' : 'change/' + cohort.id + '/' + event.id});
  }).join('');
}

const changeButtons = (id, both = true) => `<div class="chip-row">${link(t.lossButton, 'change/' + id + '/loss', both ? 'tonal' : 'chip')}
  ${both ? link(t.addButton, 'change/' + id + '/add', 'chip') : ''}</div>`;

function hatchInfo(rearing) {
  if (rearing.method === 'bought' || rearing.hatched == null) return '';
  const rate = hatchRate(rearing);
  return t.hatchedOf(fmt.number(rearing.hatched), fmt.eggs(rearing.eggs)) + (rate ? ' (' + fmt.number(rate.ofSet * 100) + '%)' : '');
}

export function cohortView(ctx, id) {
  const cohort = find(ctx.data, 'cohorts', id);
  if (!cohort) return missing('flock');
  const today = ctx.today;
  const stage = cohortStage(cohort);
  const rearing = cohort.rearing;
  if (stage === 'incubation') {
    const state = incubation(cohort, today);
    const {late, value} = hatchValue(state);
    const lost = [rearing.infertile ? t.infertileCount(fmt.number(rearing.infertile)) : '',
      rearing.dead ? t.deadCount(fmt.number(rearing.dead)) : ''].filter(Boolean).join(' · ');
    return {title:cohort.name, subtitle:t.methods[rearing.method], parent:'flock', edit:'rearing-form/' + id, body:`<div class="stack">
      ${hero({label:late || state.early ? t.incubation : t.toHatchLabel, value, low:late,
        sides:[side(t.dayWord, fmt.number(state.day), t.of21), side(t.day21, fmt.shortDate(state.due, today))],
        bar:[Math.min(state.day, 21), 21], caption:t.hatchWindow})}
      <div class="tiles">
        ${tile({label:t.setShort, value:figure(fmt.eggs(rearing.eggs)), caption:fmt.listDate(rearing.setDate, today)})}
        ${tile({label:t.leftShort, value:figure(fmt.eggs(state.eggsLeft)), caption:lost})}
      </div>
      <div class="hero-action">${link(t.enterHatched, 'hatch/' + id, 'filled')}</div></div>`};
  }
  const counts = cohortCounts(cohort, ctx.data.cohortChanges, today);
  const hatched = cohort.dateKind === 'hatch';
  if (stage === 'chicks') {
    const caption = [(hatched ? t.hatchedOn : t.boughtOn)(fmt.listDate(cohort.date, today)), hatchInfo(rearing)].filter(Boolean).join(' · ');
    return {title:cohort.name, subtitle:t.chicks, parent:'flock', edit:'rearing-form/' + id, body:`<div class="stack">
      ${hero({label:t.chicks, value:figure(fmt.number(counts.young), t.pcs), caption,
        sides:[side('', fmt.number(weeksOld(cohort, today)), t.weeksShort),
          rearing.feedFrom ? side(t.mixFrom, fmt.listDate(rearing.feedFrom, today)) : side(t.feedWord, t.boughtWord)]})}
      <div class="chip-row">${rearing.feedFrom ? '' : link(t.switchFeed, 'feed-switch/' + id, 'tonal')}
        ${link(t.moveToFlock, 'transfer/' + id, 'tonal')}${link(t.lossButton, 'change/' + id + '/loss', 'chip')}</div>
      ${listCard(t.changes, historyRows(ctx, cohort) + line({title:fmt.fullDate(cohort.date), strong:false,
        sub:html((hatched ? t.hatchedRow : t.startedRow).toLowerCase()), value:html(fmt.chicks(rearing.chicks))}))}</div>`};
  }
  const age = fmt.age(cohortAge(cohort, today));
  const origin = rearing
    ? [t.inCoopSince(fmt.listDate(cohort.joined, today)), hatchInfo(rearing)]
    : [(hatched ? t.hatchedOn : t.boughtOn)(fmt.fullDate(cohort.date)) + (cohort.weeks ? ' ' + t.atAgeWeeks(fmt.number(cohort.weeks)) : '')];
  const sides = [...[counts.hens ? fmt.hens(counts.hens) : '', counts.roosters ? fmt.roosters(counts.roosters) : ''].filter(Boolean).map(sideCount),
    cohort.mark ? side('', cohort.mark) : ''].filter(Boolean);
  const firstRow = line({title:fmt.fullDate(cohort.joined ?? cohort.date), strong:false,
    sub:html(rearing ? t.movedRow : hatched ? t.hatchedRow.toLowerCase() : t.boughtRow), value:html(hensRoosters(cohort)), plus:true});
  return {title:cohort.name, parent:'flock', edit:'cohort-form/' + id, body:`<div class="stack">
    ${hero({label:t.inCohort, value:figure(fmt.number(counts.hens + counts.roosters), t.pcs), sides,
      caption:[...origin, t.nowAge(age)].filter(Boolean).join(' · ')})}
    ${cohort.notes ? '<section class="card"><p class="notes">' + html(cohort.notes) + '</p></section>' : ''}
    ${changeButtons(id)}
    ${listCard(t.changes, historyRows(ctx, cohort) + firstRow +
      (rearing ? line({title:fmt.fullDate(cohort.date), strong:false, sub:html((hatched ? t.hatchedRow : t.startedRow).toLowerCase()),
        value:html(fmt.chicks(rearing.chicks))}) : ''))}</div>`};
}

export function missing(parent = 'start') {
  return {title:t.noEntryTitle, parent, body:empty(t.noEntry, link(t.back, parent, 'tonal'))};
}
