import {addDays, batchAdditives, batchBaseMass, batchOil, cohortAge, cohortCount, cohortCounts, cohortEvents, cohortStage, dailyHistory,
  dateOf, dayNumber, daysBetween, flockEventKind, hatchRate, incubation, isAdditive, weeksOld, lastBatchMass, mixtureCost, nowPoint, purchaseNeed, recipeComposition, roundPurchase,
  savings, scaleBatch} from './calc/index.js';
import {live} from './db.js';
import {batchStats, find, isFinished, latestFirst, showAmount} from './model.js';
import {button, details, empty, fab, figure, forecast, html, link, row, strip, textLink, tile, warning} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';
import {t} from '../ui/texts.js';

const symbol = {start:'home', feed:'sack', stock:'pallet', flock:'hen'};
const approx = text => t.approx + ' ' + text;

export function frame(screen, route) {
  const {title, subtitle = '', parent, form = false, body, floating = ''} = screen;
  const root = route.split('/')[0];
  const main = !parent;
  const navigation = main ? `<nav class="navigation" aria-label="${t.mainNavigation}"><div class="tabs">${Object.entries(t.tabs)
    .map(([key, label]) => `<a href="#${key}"${root === key ? ' aria-current="page"' : ''}><span>${icon(symbol[key])}</span><span>${label}</span></a>`).join('')}</div></nav>` : '';
  return `<header class="app-bar">${parent ? `<button class="icon-button" type="button" data-action="back"
    aria-label="${form ? t.close : t.back}">${icon(form ? 'close' : 'back')}</button>` : ''}
    <div class="app-bar-text"><h1 tabindex="-1">${html(title)}</h1>${subtitle ? '<p class="eyebrow">' + html(subtitle) + '</p>' : ''}</div>
    ${main ? `<a class="icon-button" aria-label="${t.settings}" href="#settings/${root}">${icon('settings')}</a>` : ''}</header>
    <main class="page ${main ? 'page--main' : ''} ${form ? 'page--form' : ''}" id="content">${body}</main>${floating}${navigation}`;
}

const quantity = (grams, ingredient, signed = false) =>
  fmt.stockQuantity(showAmount(grams, ingredient), ingredient.unit, signed);

function firstUnknown(stocks) {
  return stocks.find(row => !row.known)?.ingredient;
}

function enterStocksCard(stocks) {
  const first = firstUnknown(stocks);
  return `<section class="card stack tight"><p>${t.enterStocksInfo}</p>
    ${first ? '<div>' + link(t.enterStocks, 'movement/correction/' + first.id, 'tonal') + '</div>' : ''}</section>`;
}

function stockRows(ctx) {
  const {stocks, settings} = ctx.derived;
  const anyKnown = stocks.some(row => row.known);
  return '<div class="list">' + stocks.map(({ingredient, grams, known, outlook}) => {
    const notice = known && grams < 0 ? warning(t.checkStock) : outlook && outlook.days < settings.threshold ? warning(t.runningOut) : '';
    const sub = [known ? '' : anyKnown ? html(t.enterAmount) : '', isAdditive(ingredient) ? html(t.additive) : '', notice]
      .filter(Boolean).join(' · ');
    const item = row({name:ingredient.name, route:'ingredient/' + ingredient.id, sub,
      value: known ? `<strong class="stock-value">${quantity(grams, ingredient)}</strong>` : ''});
    return item + (outlook ? '<div class="stock-projection">' + forecast(outlook, settings.threshold, ctx.today) + '</div>' : '');
  }).join('') + '</div>';
}

function batchLabel(batch) {
  const additives = batchAdditives(batch);
  const base = fmt.mass(batchBaseMass(batch));
  if (!additives.length) return base;
  const oil = batchOil(batch);
  if (additives.length === 1 && (oil || additives[0].unit === 'l')) {
    const item = oil ?? additives[0];
    if (/^olej/iu.test(item.name)) return base + t.withOil(fmt.number(item.millilitres / 1000, 1) + ' l');
  }
  return base + t.withAdditives;
}

const feedingDay = (batch, today) => Math.floor(nowPoint(today) - dayNumber(batch.start)) + 1;
const kgText = grams => fmt.number(grams / 1000, 1) + '\u00a0kg';

// Jak liczone jest zużycie: „34 × 115 g = 3,9 kg dziennie” albo „3,7 kg dziennie”.
function basis(ctx) {
  const {model} = ctx.derived;
  const line = model.perBird != null
    ? t.basisBirds(fmt.number(model.birds), fmt.number(model.perBird, 0), fmt.number(model.daily / 1000, 1))
    : t.basisDaily(fmt.number(model.daily / 1000, 1));
  return line + ' · ' + (model.fromHistory ? t.fromHistory : t.fromSettings);
}

function runOut(ctx) {
  const {runsOutAt} = ctx.derived;
  if (runsOutAt == null || !Number.isFinite(runsOutAt)) return null;
  const days = Math.max(0, runsOutAt - nowPoint(ctx.today));
  return {days, date:dateOf(runsOutAt)};
}

function otherOpen(ctx) {
  const count = ctx.derived.openStatus.length - 1;
  return count > 0 ? t.otherOpen(count) : '';
}

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
  if (!active) {
    return `<section class="hero"><span class="hero-label">${t.nextMix}</span>
      <p class="hero-value">${figure(t.now)}</p><p class="hero-caption">${html(t.noMixInUse)}</p>${mixButton}</section>`;
  }
  const base = batchBaseMass(active.batch);
  const remaining = Math.max(0, active.remaining);
  const end = runOut(ctx);
  const gone = active.remaining <= 0;
  const value = gone ? figure(t.now) : !end ? '—' : end.days < .5 ? figure(t.today) : '<span class="approx">≈</span>' + figure(fmt.days(end.days));
  const side = [end && !gone ? [t.until, fmt.shortDate(end.date, today)] : null, [t.left, fmt.mass(remaining)]]
    .filter(Boolean).map(([label, text]) => `<span>${html(label)} <b>${html(text)}</b></span>`).join('');
  const open = openStatus.length > 1 ? t.openBatches(openStatus.length - 1) : '';
  const caption = [gone ? t.mixGone : '', open].filter(Boolean).join(' · ');
  const soon = gone || (end && end.days <= 3);
  return `<section class="hero${gone ? ' hero--low' : ''}"><a class="hero-link" href="#feed">
    <span class="hero-top"><span><span class="hero-label">${t.nextMix}</span><span class="hero-value">${value}</span></span>
      <span class="hero-side">${side}</span></span>
    <progress class="hero-bar" aria-hidden="true" value="${remaining}" max="${base}"></progress>
    ${caption ? '<span class="hero-caption">' + html(caption) + '</span>' : ''}</a>${soon ? mixButton : ''}</section>`;
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

function flockTile(ctx) {
  const {flock, cohorts} = ctx.derived;
  if (!cohorts.length) return tile({label:t.birdsTile, value:'—', caption:t.addBirdsShort, route:'cohort-form'});
  const parts = [flock.hens ? fmt.hens(flock.hens) : '', flock.roosters ? fmt.roosters(flock.roosters) : '',
    flock.young ? fmt.chicks(flock.young) : ''].filter(Boolean);
  return tile({label:t.birdsTile, value:figure(fmt.number(flock.total), t.pcs), caption:parts.join(' · '), route:'flock'});
}

function useTile(ctx) {
  const {model} = ctx.derived;
  const caption = [model.perBird != null ? t.perBirdShort(fmt.number(model.perBird, 0)) : '',
    model.fromHistory ? '' : t.fromSettingsShort].filter(Boolean).join(' · ');
  return tile({label:t.dailyTile, value:figure(fmt.number(model.daily / 1000, 1), 'kg'), caption, route:'feed'});
}

function costTile(ctx) {
  const {model, current, composition} = ctx.derived;
  if (!current || !composition || !(model.daily > 0)) return '';
  const cost = mixtureCost([...composition.items, ...composition.additives]);
  if (cost.kind !== 'full') return '';
  const zloty = Math.round(model.daily / 1000 * cost.perKg * 30 / 100);
  return tile({label:t.monthCost, value:figure(fmt.number(zloty), 'zł'), caption:t.fromPrices, route:'recipe/' + current.id});
}

// Inkubacja i pisklęta jako kafelki. „Inkubacja 2026” zostaje bez powtórzenia słowa.
const stageLabel = (word, name) => name.toLowerCase().startsWith(word.toLowerCase()) ? name : word + ': ' + name;

function rearingTile(cohort, ctx) {
  const route = 'cohort/' + cohort.id;
  if (cohortStage(cohort) === 'incubation') {
    const state = incubation(cohort, ctx.today);
    const late = state.day > 22;
    const value = late ? figure(t.hatchLate) : state.early ? figure(t.hatching) : figure(fmt.days(state.left));
    const caption = [late || state.early ? '' : t.toHatch, t.incubationDayShort(fmt.number(state.day))].filter(Boolean).join(' · ');
    return tile({label:stageLabel(t.incubation, cohort.name), value, caption, route, low:late});
  }
  const count = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today).young;
  const caption = [t.weeksOld(fmt.number(weeksOld(cohort, ctx.today))),
    cohort.rearing.feedFrom ? t.feedOwnShort : t.feedBoughtShort].join(' · ');
  return tile({label:stageLabel(t.chicks, cohort.name), value:figure(fmt.number(count)), caption, route});
}

// Trzy składniki, które skończą się najszybciej. Same dni; ile dokupić jest w szczegółach składnika.
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

function currentCard(ctx) {
  const {active} = ctx.derived;
  const heading = `<h2>${t.feedInUse}</h2>`;
  if (!active) return `<section class="card stack tight">${heading}<p class="muted">${t.noMixInUse}</p></section>`;
  const {batch, remaining} = active;
  const end = runOut(ctx);
  const others = otherOpen(ctx);
  return `<section class="card stack tight current-card">${heading}
    <a class="current-link" href="#batch/${html(batch.id)}"><strong>${html(batch.recipeName)} · ${html(batchLabel(batch))}</strong>
      <p class="display">${html(t.leftNow(kgText(Math.max(0, remaining))))}</p>
      ${end && remaining > 0 ? '<p class="current-until">' + html(t.enoughUntil(fmt.listDate(end.date, ctx.today), t.approx + ' ' + fmt.days(end.days))) + '</p>' : ''}
      <p class="muted">${html(t.mixedOn(fmt.listDate(batch.date, ctx.today), fmt.listDate(batch.start, ctx.today)) + ' · ' +
        t.feedingDay(feedingDay(batch, ctx.today)))}</p>
      <p class="muted">${html(basis(ctx))}</p></a>
    ${remaining <= 0 ? '<p>' + warning(t.mixShouldBeGone) + '</p>' : ''}
    ${others ? '<p class="muted">' + html(others) + '</p>' : ''}
    <div class="actions">${button(t.finishAndMix, 'finish-and-mix:' + batch.id, 'tonal')}
      ${textLink(t.finishBatch, 'finish/' + batch.id)}</div></section>`;
}

function usageChart(ctx) {
  const rows = dailyHistory(ctx.derived.batches, addDays(ctx.today, 1));
  if (rows.length < 3) return '';
  const width = 320, height = 150, top = 18, bottom = 24, left = 4;
  const max = Math.max(...rows.map(row => row.daily)) || 1;
  const step = (width - left) / rows.length;
  const bar = Math.min(28, step * .62);
  const bars = rows.map((row, i) => {
    const h = (height - top - bottom) * row.daily / max;
    const x = left + step * i + (step - bar) / 2;
    const y = height - bottom - h;
    const kg = fmt.number(row.daily / 1000, 1);
    return `<g><title>${html(fmt.monthYear(row.end) + ': ' + t.kgPerDay(kg))}</title>
      <rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>
      <text class="chart-value" x="${(x + bar / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}">${kg}</text>
      <text class="chart-label" x="${(x + bar / 2).toFixed(1)}" y="${height - 6}">${fmt.monthYear(row.end)}</text></g>`;
  }).join('');
  return `<section class="card stack tight"><h2>${t.chartTitle}</h2>
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t.chartLabel}">
      <line class="chart-axis" x1="0" x2="${width}" y1="${height - bottom}" y2="${height - bottom}"/>${bars}</svg></section>`;
}

export function feed(ctx) {
  const {derived, today} = ctx;
  return {title:t.feed, floating:fab(t.mix, 'mix', 'plus'), body:`<div class="stack">
    ${currentCard(ctx)}
    <section class="card stack tight"><h2>${t.howLong100}</h2><p class="display">${derived.daily > 0 ? approx(fmt.days(100000 / derived.daily)) : t.noForecast}</p>
      <p class="muted">${html(basis(ctx))}</p></section>
    ${usageChart(ctx)}
    <section class="stack tight"><div class="section-head"><h2>${t.recipes}</h2>${textLink(t.addRecipe, 'recipe-form', 'plus')}</div>
      ${derived.recipes.length ? '<div class="list">' + derived.recipes.map(recipe => row({name:recipe.name,
        symbol:'recipe', sub:recipe.current ? '<span class="tag">' + t.current + '</span>' : '',
        value:fmt.preciseMass(recipeComposition(recipe, derived.ingredients).mass), route:'recipe/' + recipe.id})).join('') + '</div>' :
        empty(t.noRecipes)}</section>
    <section class="stack tight"><h2>${t.batches}</h2>${derived.batches.length ? '<div class="list">' + derived.batches.map(batch =>
      row({name:batch.recipeName, symbol:'sack', sub:fmt.listDate(batch.date, today) + ' · ' +
        (isFinished(batch, today) ? t.statusFinished : batch.start > today ? t.statusPlanned : t.statusOpen),
        value:html(batchLabel(batch)), route:'batch/' + batch.id})).join('') + '</div>' : empty(t.noBatches)}</section>
    </div>`,
    async action(action) {
      if (!action.startsWith('finish-and-mix:')) return;
      const id = action.slice('finish-and-mix:'.length);
      const end = addDays(today, 1);
      if (await ctx.commit(data => Object.assign(find(data, 'batches', id), {end, remaining:0}), 'feed', t.batchFinished)) ctx.go('mix');
    }};
}

function costRows(cost, settings, {batch = false, consumed, daily, estimated = false} = {}) {
  if (cost.kind === 'none') return '';
  const content = [];
  const value = text => estimated ? text + ' <small>' + t.estimate + '</small>' : text;
  if (cost.kind === 'partial') content.push([t.cost, t.costPartial]);
  if (cost.kind === 'full') {
    if (batch) content.push([t.costBatch, fmt.money(cost.cents)]);
    else content.push([t.cost100, fmt.money(cost.perKg * 100)]);
    content.push([t.costKg, fmt.money(cost.perKg) + t.perKgSuffix]);
    if (daily != null) content.push([t.costDaily, value(fmt.money(daily / 1000 * cost.perKg))]);
    if (settings.readyPrice !== null) {
      content.push([t.readyFeed, fmt.money(settings.readyPrice) + t.perKgSuffix]);
      if (batch && consumed > 0) {
        const difference = savings(consumed, settings.readyPrice, cost.perKg);
        content.push([difference >= 0 ? t.cheaperBy : t.dearerBy, value(fmt.money(Math.abs(difference)))]);
      }
      if (!batch) {
        const difference = savings(100000, settings.readyPrice, cost.perKg);
        content.push([difference >= 0 ? t.cheaper100 : t.dearer100, fmt.money(Math.abs(difference))]);
      }
    }
  }
  return '<section class="card stack tight"><h2>' + t.cost + '</h2>' + details(content) + '</section>';
}

export function recipeView(ctx, id) {
  const recipe = find(ctx.data, 'recipes', id);
  if (!recipe) return missing('feed');
  const composition = recipeComposition(recipe, ctx.derived.ingredients);
  const byId = new Map([...composition.items, ...composition.additives].map(item => [item.ingredientId, item]));
  const recipeRows = recipe.items.map(({ingredientId}) => {
    const item = byId.get(ingredientId);
    const per100 = fmt.precise(item.amount / 1000 * 100000 / composition.mass, item.unit);
    if (item.additive) return row({name:item.name, sub:'<span class="tag">' + t.additive + '</span> ' + html(t.per100(per100)),
      value:fmt.precise(item.amount / 1000, item.unit)});
    return row({name:item.name, sub:html(fmt.percent(item.share) + ' · ' + t.per100(per100)),
      value:fmt.precise(item.amount / 1000, item.unit)});
  }).join('');
  return {title:recipe.name, parent:'feed', body:`<div class="stack">
    <section class="card stack tight"><h2>${t.recipe}</h2><p class="display">${fmt.preciseMass(composition.mass)}</p>
      ${recipe.current ? '<div><span class="tag">' + t.current + '</span></div>' : ''}
      ${recipe.notes ? '<p class="notes">' + html(recipe.notes) + '</p>' : ''}</section>
    <div class="actions">${link(t.mix, 'mix/' + id, 'tonal', 'plus')}${link(t.edit, 'recipe-form/' + id, 'tonal', 'edit')}</div>
    <section class="stack tight"><h2>${t.composition}</h2><div class="list">${recipeRows}</div></section>
    ${costRows(mixtureCost([...composition.items, ...composition.additives]), ctx.derived.settings)}
    <div class="actions">${recipe.items.length > 1 ? textLink(t.reorder, 'recipe-order/' + id) : ''}
      ${recipe.current ? '' : button(t.setCurrent, 'current', 'text', 'check')}</div></div>`,
    action: action => { if (action === 'current') return ctx.commit(data => ctx.setCurrent(data, id)); }};
}

export function batchView(ctx, id, fromEventId) {
  const batch = find(ctx.data, 'batches', id);
  if (!batch) return missing('feed');
  const event = fromEventId && find(ctx.data, 'ingredientEvents', fromEventId);
  const parent = event && event.batchId === id ? 'movement-detail/' + event.id : fromEventId === 'start' ? 'start' : 'feed';
  const result = batchStats(batch, ctx.data, ctx.derived, ctx.today);
  const estimated = text => !result.finished ? text + ' <small>' + t.estimate + '</small>' : text;
  const metrics = [];
  if (result.daily != null) {
    metrics.push([t.dailyUse, estimated(t.kgPerDay(fmt.number(result.daily / 1000, 2)))]);
    if (result.daily > 0) metrics.push([t.howLong100, fmt.days(100000 / result.daily)]);
    if (result.birds > 0) metrics.push([t.perBird, estimated(fmt.number(result.daily / result.birds, 0) + ' g')]);
  }
  const dates = [[t.mixedDate, fmt.fullDate(batch.date)], [t.feedingFrom, fmt.fullDate(batch.start)],
    ...(batch.end ? [[t.lastFeedingDay, fmt.fullDate(addDays(batch.end, -1))]] : []),
    ...(result.remaining != null ? [[t.leftover, estimated(fmt.mass(result.remaining))]] : [])];
  const items = batch.items.map(item => {
    const extra = item.additive || item.oil;
    const amount = item.millilitres != null ? fmt.stockQuantity(item.millilitres / 1000, 'l')
      : extra ? fmt.stockQuantity(showAmount(item.grams, item), item.unit) : fmt.quantity(showAmount(item.grams, item), item.unit, true);
    return row({name:item.name, sub:extra ? '<span class="tag">' + t.additive + '</span>' : '', value:amount});
  }).join('');
  return {title:t.batch, subtitle:batch.recipeName, parent, body:`<div class="stack">
    <section class="card stack tight"><p class="display">${html(batchLabel(batch))}</p>${details(dates)}</section>
    <div class="actions">${link(result.finished ? t.changeFinish : t.finishBatch, 'finish/' + id + '/batch', 'tonal')}
      ${textLink(t.editBatch, 'batch-form/' + id, 'edit')}</div>
    ${metrics.length ? '<section class="card stack tight"><h2>' + t.results + '</h2>' + details(metrics) + '</section>' : ''}
    <section class="stack tight"><h2>${t.batchContent}</h2><div class="list">${items}</div></section>
    ${costRows(result.cost, ctx.derived.settings, {batch:true, consumed:result.consumed, daily:result.daily, estimated:!result.finished})}
    </div>`};
}

export function warehouse(ctx) {
  const {stocks} = ctx.derived;
  return {title:t.stock, floating:fab(t.add, 'movement/add', 'plus'), body:`<div class="stack">
    ${stocks.length && !stocks.some(row => row.known) ? enterStocksCard(stocks) : ''}
    <section class="stack tight"><div class="section-head"><h2>${t.ingredients}</h2>${textLink(t.addIngredient, 'ingredient-form', 'plus')}</div>
    ${stocks.length ? stockRows(ctx) : empty(t.noIngredients)}</section></div>`};
}

const formatRate = (price, ingredient) => fmt.money(price.cents * 1000 / price.grams) + t.perKgSuffix +
  (ingredient.unit === 'l' ? ' · ' + fmt.money(price.cents * 1000 * ingredient.density / price.grams) + t.perLitreSuffix : '');

function buyCard(ctx, item) {
  const {ingredient, grams, rate} = item;
  const {daily, mixed} = ctx.derived;
  const rows = [2, 3].map(months => {
    const need = roundPurchase(purchaseNeed(grams, rate, daily, mixed, months * 30), ingredient.unit, ingredient.density);
    return '<p>' + (need > 0 ? html(t.buyFor(months)) + ' <strong>' + fmt.number(need, 1) + ' ' + ingredient.unit + '</strong>'
      : html(t.enoughFor(months))) + '</p>';
  }).join('');
  return `<section class="card stack tight"><h2>${t.toBuy}</h2>${rows}</section>`;
}

export function ingredientView(ctx, id) {
  const item = ctx.derived.stocks.find(entry => entry.ingredient.id === id);
  if (!item) return missing('stock');
  const {ingredient, grams, known, outlook} = item;
  const events = live(ctx.data.ingredientEvents).filter(row => row.ingredientId === id).sort(latestFirst);
  return {title:ingredient.name, parent:'stock', body:`<div class="stack"><section class="card stack tight">
    <h2>${t.shouldBe}</h2>${isAdditive(ingredient) ? '<p class="muted">' + t.kindAdditive + '</p>' : ''}
    <p class="display">${known ? quantity(grams, ingredient) : t.enterAmount}</p>
    ${known && grams < 0 ? warning(t.checkStock) : ''}
    ${known ? forecast(outlook, ctx.derived.settings.threshold, ctx.today) : ''}
    ${ingredient.price ? '<p class="muted">' + t.lastPrice + ' ' + formatRate(ingredient.price, ingredient) + '</p>' : ''}
    </section>
    <div class="actions">${link(t.add, 'movement/add/' + id, 'tonal', 'plus')}
      ${link(t.stockCorrection, 'movement/correction/' + id, 'tonal')}
      ${textLink(t.withdrawal, 'movement/withdrawal/' + id)}
      ${textLink(t.edit, 'ingredient-form/' + id, 'edit')}</div>
    ${outlook ? buyCard(ctx, item) : ''}
    <section class="stack tight"><h2>${t.history}</h2>${events.length ? '<div class="list">' + events.map(event => {
      const batch = event.batchId && find(ctx.data, 'batches', event.batchId);
      const sub = fmt.listDate(event.date, ctx.today) + (batch ? ' · ' + html(batch.recipeName) : '');
      return row({name:t.movementNames[event.type], sub, value:quantity(event.grams, ingredient, true),
        route:'movement-detail/' + event.id});
    }).join('') + '</div>' : empty(t.noHistory)}</section></div>`};
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
  const action = batch ? link(t.showBatch, 'batch/' + batch.id + '/' + id, 'tonal') :
    event.type !== 'batch' ? link(t.edit, 'movement/' + event.type + '/' + ingredient.id + '/' + id, 'tonal', 'edit') : '';
  return {title:t.movementNames[event.type], subtitle:ingredient.name, parent, body:`<div class="stack">
    <section class="card stack tight"><p class="display">${quantity(event.grams, ingredient, true)}</p>${details(info)}
    ${event.notes ? '<p class="notes">' + html(event.notes) + '</p>' : ''}</section>
    <div class="actions">${action}</div></div>`};
}

const hensRoosters = counts => {
  const parts = [counts.hens ? fmt.hens(counts.hens) : '', counts.roosters ? fmt.roosters(counts.roosters) : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : fmt.birds(0);
};

// Krótki opis klucia albo piskląt: wartość i podpis.
function rearingSummary(cohort, ctx) {
  const stage = cohortStage(cohort);
  if (stage === 'incubation') {
    const state = incubation(cohort, ctx.today);
    const value = state.day > 22 ? t.overdue : state.early ? t.canHatch : t.hatchIn(t.approx + ' ' + fmt.days(state.left));
    return {title:t.incubation, value, low:state.day > 22,
      sub:[t.incubationDay(fmt.number(state.day)), fmt.eggs(state.eggsLeft)].join(' · '), count:''};
  }
  const count = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today).young;
  const feedText = cohort.rearing.feedFrom ? t.feedOwnShort : t.feedBoughtShort;
  return {title:t.chicks, value:fmt.chicks(count), count:t.pieces(fmt.number(count)),
    sub:[t.weeksOld(fmt.number(weeksOld(cohort, ctx.today))), feedText].join(' · ')};
}

export function flockView(ctx) {
  const cohorts = ctx.derived.cohorts.slice().sort(latestFirst);
  const {flock, rearing} = ctx.derived;
  const rearingRows = rearing.map(cohort => {
    const info = rearingSummary(cohort, ctx);
    return row({name:cohort.name, symbol:'hen', sub:html(info.title + ' · ' + info.sub), value:info.count, route:'cohort/' + cohort.id});
  }).join('');
  return {title:t.flock, floating:fab(t.addCohort, 'cohort-form', 'plus'), body:`<div class="stack">
    ${cohorts.length ? `<section class="card stack tight"><h2>${t.together}</h2><p class="display">${fmt.birds(flock.total)}</p>
      <p class="muted">${html(hensRoosters(flock))}${flock.young ? html(', ' + t.orChicks(fmt.chicks(flock.young))) : ''}</p></section>` : ''}
    ${rearing.length ? `<section class="stack tight"><h2>${t.rearingTitle}</h2><div class="list">${rearingRows}</div></section>` : ''}
    ${cohorts.length ? `<section class="stack tight"><h2>${t.cohorts}</h2><div class="list">${cohorts.map(cohort => {
      const counts = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today);
      const sub = [hensRoosters(counts), fmt.age(cohortAge(cohort, ctx.today)), cohort.mark].filter(Boolean).map(html).join(' · ');
      return row({name:cohort.name, symbol:'hen', sub, value:t.pieces(fmt.number(counts.hens + counts.roosters)), route:'cohort/' + cohort.id});
    }).join('')}</div></section>` : empty(t.addFirstCohort)}
    <div>${link(t.addRearing, 'rearing-form', 'tonal', 'plus')}</div></div>`};
}

function historyRows(ctx, cohort) {
  const sexLabel = {hens:t.hens, roosters:t.roosters, young:t.chicks};
  return cohortEvents(cohort, ctx.data.cohortChanges).reverse().map(event => {
    const kind = flockEventKind(event);
    const value = (kind === 'add' ? '+' + fmt.number(event.count) : kind === 'loss' ? '−' + fmt.number(event.count)
      : t.correctionRow(fmt.number(event.count)));
    const sub = [sexLabel[event.sex], event.notes].filter(Boolean).map(html).join(' · ');
    return row({name:fmt.fullDate(event.date), sub, value, route:kind === 'correction' ? '' : 'change/' + cohort.id + '/' + event.id});
  }).join('');
}

function eggDetails(rearing) {
  if (rearing.method === 'bought') return [];
  const rows = [[t.setDate, fmt.fullDate(rearing.setDate)], [t.eggsSet, fmt.number(rearing.eggs)]];
  if (rearing.infertile != null) rows.push([t.eggsInfertile, fmt.number(rearing.infertile)]);
  if (rearing.dead != null) rows.push([t.eggsDead, fmt.number(rearing.dead)]);
  const rate = hatchRate(rearing);
  if (rate) rows.push([t.hatchRate, html(t.hatchRateValue(fmt.percent(rate.ofSet), rate.ofFertile != null ? fmt.percent(rate.ofFertile) : ''))]);
  return rows;
}

export function cohortView(ctx, id) {
  const cohort = find(ctx.data, 'cohorts', id);
  if (!cohort) return missing('flock');
  const stage = cohortStage(cohort);
  const rearing = cohort.rearing;
  if (stage === 'incubation') {
    const state = incubation(cohort, ctx.today);
    const info = rearingSummary(cohort, ctx);
    return {title:cohort.name, parent:'flock', body:`<div class="stack">
      <section class="card stack tight"><h2>${t.incubation} · ${t.methods[rearing.method]}</h2>
        <p class="display${info.low ? ' display--low' : ''}">${html(info.value)}</p>
        <p class="muted">${html(t.incubationDay(fmt.number(state.day)) + ' · ' + t.hatchDue(fmt.fullDate(state.due)))}</p>
        ${details([...eggDetails(rearing), [t.eggsLeft, fmt.number(state.eggsLeft)]])}</section>
      <div class="actions">${link(t.enterHatched, 'hatch/' + id, 'tonal')}${textLink(t.edit, 'rearing-form/' + id, 'edit')}</div></div>`};
  }
  const counts = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today);
  const hatched = cohort.dateKind === 'hatch';
  if (stage === 'chicks') {
    return {title:cohort.name, parent:'flock', body:`<div class="stack">
      <section class="card stack tight"><h2>${t.chicks}</h2><p class="display">${t.pieces(fmt.number(counts.young))}</p>
        ${details([[hatched ? t.hatchedDate : t.purchaseDate, fmt.fullDate(cohort.date)],
          [t.age, html(t.weeksOld(fmt.number(weeksOld(cohort, ctx.today))))],
          [t.feedLabel, html(rearing.feedFrom ? t.feedOwn(fmt.fullDate(rearing.feedFrom)) : t.feedBought)],
          ...eggDetails(rearing)])}</section>
      <div class="actions">${rearing.feedFrom ? '' : link(t.switchFeed, 'feed-switch/' + id, 'tonal')}
        ${link(t.moveToFlock, 'transfer/' + id, 'tonal')}${textLink(t.changeCount, 'change/' + id)}
        ${textLink(t.edit, 'rearing-form/' + id, 'edit')}</div>
      <section class="stack tight"><h2>${t.changes}</h2><div class="list">${historyRows(ctx, cohort)}
        ${row({name:fmt.fullDate(cohort.date), sub:hatched ? t.hatchedRow : t.startedRow, value:t.pieces(fmt.number(rearing.chicks))})}
      </div></section></div>`};
  }
  const info = [[hatched ? t.hatchDate : t.purchaseDate, fmt.fullDate(cohort.date)], [t.age, fmt.age(cohortAge(cohort, ctx.today))],
    ...(cohort.mark ? [[t.mark, html(cohort.mark)]] : [])];
  if (rearing) {
    info.push([t.moveDate, fmt.fullDate(cohort.joined)]);
    if (rearing.method !== 'bought') info.push([t.fromHatch, html(t.fromHatchValue(fmt.eggs(rearing.eggs), fmt.number(rearing.hatched)))]);
  }
  return {title:cohort.name, parent:'flock', body:`<div class="stack">
    <section class="card stack tight"><p class="display">${fmt.birds(counts.hens + counts.roosters)}</p>
    <p class="muted">${html(hensRoosters(counts))}</p>${details(info)}
    ${cohort.notes ? '<p class="notes">' + html(cohort.notes) + '</p>' : ''}</section>
    <div class="actions">${link(t.changeCount, 'change/' + id, 'tonal')}${textLink(t.edit, 'cohort-form/' + id, 'edit')}</div>
    <section class="stack tight"><h2>${t.changes}</h2><div class="list">${historyRows(ctx, cohort)}
      ${row({name:fmt.fullDate(cohort.joined ?? cohort.date), sub:rearing ? t.moveToFlock : t.newCohortRow,
        value:html(hensRoosters(cohort))})}
      ${rearing ? row({name:fmt.fullDate(cohort.date), sub:hatched ? t.hatchedRow : t.startedRow, value:t.pieces(fmt.number(rearing.chicks))}) : ''}
    </div></section></div>`};
}

export function missing(parent = 'start') {
  return {title:t.noEntryTitle, parent, body:empty(t.noEntry, link(t.back, parent, 'tonal'))};
}
