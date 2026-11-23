import {t} from '../ui/texts.js';
import {addDays, batchAdditives, batchBaseMass, batchIsFinished, buyAmount, cohortAge, cohortEvents, cohortCount, consumptionHistory, daysBetween, flockEventKind, isAdditive, mixtureCost, recipeComposition, savings} from './calc/index.js';
import {live} from './db.js';
import {batchStats, find, latestFirst, showAmount} from './model.js';
import {banner, button, details, empty, fab, forecast, html, link, row, warning} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';

const symbol = {start:'home', feed:'feed', stock:'stock', flock:'flock'};
const tabs = {start:t.start, feed:t.pasza, stock:t.magazyn, flock:t.stado};
const movementNames = {purchase:t.zakup, addition:t.wlasny, correction:t.korektaStanu,
  withdrawal:t.innePobranie, batch:t.zuzycieWPartii};

export function frame(screen, route) {
  const {title, subtitle = '', parent, form = false, body, floating = ''} = screen;
  const root = route.split('/')[0];
  const main = !parent;
  const navigation = main ? `<nav class="navigation" aria-label="${t.nawigacjaGlowna}"><div class="tabs">${Object.entries(tabs)
    .map(([key, label]) => `<a href="#${key}"${root === key ? ' aria-current="page"' : ''}><span>${icon(symbol[key])}</span><span>${label}</span></a>`).join('')}</div></nav>` : '';
  return `<header class="app-bar">${parent ? `<button class="icon-button" type="button" data-action="back"
    aria-label="${form ? t.zamknij : t.wroc}">${icon(form ? 'close' : 'back')}</button>` : ''}
    <div class="app-bar-text"><h1 tabindex="-1">${html(title)}</h1>${subtitle ? '<p class="eyebrow">' + html(subtitle) + '</p>' : ''}</div>
    ${main ? `<a class="icon-button" aria-label="${t.ustawienia}" href="#settings/${root}">${icon('settings')}</a>` : ''}</header>
    <main class="page ${main ? 'page--main' : ''} ${form ? 'page--form' : ''}" id="content">${body}</main>${floating}${navigation}`;
}

function stockRows(stocks, ctx) {
  const threshold = ctx.derived.settings.threshold;
  return '<div class="list">' + stocks.map(({ingredient,grams,known,outlook}) => {
    const state = known ? fmt.stockQuantity(showAmount(grams,ingredient),ingredient.unit) : '';
    const notice = !known ? t.wpiszIleMasz : grams < 0 ? warning(t.sprawdzStan) :
      outlook && outlook.days < threshold ? t.konczySie : '';
    const item = row({name:ingredient.name,route:'ingredient/' + ingredient.id,sub:notice,
      value:known ? `<strong class="stock-value">${state}</strong>` : ''});
    return item + (outlook ? '<div class="stock-projection">' + forecast(outlook,threshold,ctx.today) + '</div>' : '');
  }).join('') + '</div>';
}

function currentCard(ctx) {
  const active = ctx.derived.active;
  if (!active) return `<section class="card stack tight"><h2>${t.paszaWUzyciu}</h2><p>${t.brakMieszankiWUzyciu}</p></section>`;
  const {batch,remaining} = active;
  const {daily,openStatus} = ctx.derived;
  const other = openStatus.length - 1;
  return `<section class="card stack tight current-card">
    <h2>${t.paszaWUzyciu}</h2>
    <strong>${html(batch.recipeName)} · ${batchLabel(batch)}</strong>
    <p class="muted">${t.zmieszana} ${fmt.listDate(batch.date,ctx.today)} ${t.karmienieOd2} ${fmt.listDate(batch.start,ctx.today)}</p>
    ${daily > 0 ? `<p class="muted">≈ ${fmt.number(daily / 1000,2)} ${t.kgDziennie}</p>` : ''}
    <dl class="detail-grid current-estimate">
      <div><dt>${t.zostalo}</dt><dd>${fmt.mass(remaining)}</dd></div>
      ${daily > 0 ? `<div><dt>${t.wystarczyNa}</dt><dd>` + fmt.days(remaining / daily) + '</dd></div>' : ''}
    </dl>
    ${remaining <= 0 ? '<p>' + warning(t.mieszankaPowinnaSieJuzSkonczycSprawdz) + '</p>' : ''}
    ${other ? '<p class="muted">' + fmt.unfinishedBatches(other) + '</p>' : ''}
    <div class="actions">${button(t.zakonczIMieszajNowa,'finish-and-mix','tonal')}
      ${link(t.zakonczPartie,'finish/' + batch.id,'tonal')}</div></section>`;
}

function startCard(title, value, subtitle, route, cta = '') {
  return `<a href="#${html(route)}" class="card stack tight start-card">
    <h2>${html(title)}</h2><p class="${value ? 'display' : 'start-empty'}">${value || html(subtitle)}</p>
    ${value && subtitle ? '<p class="muted">' + html(subtitle) + '</p>' : ''}
    ${cta ? '<span class="button button--tonal">' + html(cta) + '</span>' : ''}</a>`;
}

function stockOnboarding(route, home = false) {
  const message = t.wpiszIleMaszPoszczegolnychSkladnikowZeby;
  return home ? startCard(t.najblizszyBrak,'',message,route,t.wpiszStany) :
    empty(message,link(t.wpiszStany,route,'tonal'));
}

export function start(ctx) {
  const {derived,today} = ctx;
  const {active,stocks,flock,daily} = derived;
  const next = stocks.find(item => item.outlook);
  const firstUnknown = stocks.find(item => !item.known);
  const last = derived.settings.lastExport;
  const due = daysBetween(last ?? derived.settings.createdAt.slice(0,10), today) >= 30;
  const feedCard = active ? startCard(t.paszaWUzyciu,
    '≈ ' + fmt.mass(active.remaining) + (daily > 0 ? ' · ≈ ' + fmt.days(active.remaining / daily) : ''),
    active.batch.recipeName + ' · ' + fmt.feedingDay(daysBetween(active.batch.start,today) + 1),
    'batch/' + active.batch.id + '/start') : startCard(t.paszaWUzyciu,'',t.brakMieszankiWUzyciu,'mix',t.mieszam);
  const stockCard = next ? startCard(t.najblizszyBrak,
    html(next.ingredient.name) + ' · ≈ ' + fmt.days(next.outlook.days),
    t.do + fmt.listDate(next.outlook.date,today),'ingredient/' + next.ingredient.id) :
    !stocks.some(item => item.known) && firstUnknown ? stockOnboarding('ingredient/' + firstUnknown.ingredient.id,true) :
    startCard(t.najblizszyBrak,'',t.wpiszStanyMagazynu,firstUnknown ? 'ingredient/' + firstUnknown.ingredient.id : 'stock');
  const flockCard = live(ctx.data.cohorts).length ? startCard(t.stado,fmt.birds(flock.total),
    fmt.hens(flock.hens) + ', ' + fmt.roosters(flock.roosters),'flock') : startCard(t.stado,'',t.dodajPierwszyRocznik,'cohort-form');
  return {title:t.appName,subtitle:fmt.headingDate(today),body:`<div class="stack">
    ${feedCard}${stockCard}${flockCard}
    ${due ? banner(t.zapiszKopieZapasowa,t.mineloJuz30Dni,button(t.zrobKopie,'backup-now','tonal','share'),true) : ''}</div>`,
    action(action) { if (action === 'backup-now') return ctx.exportBackup(true); }};
}

function batchLabel(batch) {
  const additions = batchAdditives(batch);
  const base = fmt.stockQuantity(batchBaseMass(batch)/1000,'kg');
  if (additions.length > 1) return base + t.dodatki;
  if (!additions.length) return base;
  const item = additions[0];
  const amount = item.millilitres == null ? showAmount(item.grams,item) : item.millilitres / 1000;
  const label = /^olej(?:\s|$)/iu.test(item.name) ? t.oleju : html(item.name);
  return base + ' + ' + fmt.stockQuantity(amount,item.unit) + ' ' + label;
}

function consumptionChart(batches,today) {
  const series = consumptionHistory(batches,today);
  if (series.length < 3) return '';
  const width = 44 * series.length + 38;
  const chartHeight = 126;
  const peak = Math.max(...series.map(point => point.daily),1);
  const bars = series.map((point,index) => {
    const kg = point.daily / 1000;
    const h = point.daily / peak * 80;
    const x = 34 + 44 * index;
    const month = fmt.chartMonth(point.date);
    const year = fmt.chartYear(point.date);
    return `<g><title>${month} ${year} · ${fmt.number(kg,3)} ${t.kgDziennie}</title>
      <rect x="${x}" y="${chartHeight-h}" width="26" height="${h}" rx="3"/>
      <text x="${x+13}" y="${chartHeight-h-5}">${fmt.number(kg,1)}</text>
      <text x="${x+13}" y="141">${month}</text><text x="${x+13}" y="154">${year}</text></g>`;
  }).join('');
  return `<section class="card stack tight"><h2 id="consumption-title">${t.zuzycieDziennieWKolejnychPartiach}</h2>
    <div class="chart-scroll" tabindex="0"><svg class="consumption-chart" width="${width}" height="161"
      viewBox="0 0 ${width} 161" role="img" aria-labelledby="consumption-title"><text x="15" y="31">${t.kg}</text>
      <path d="M25 36 V126 H${width-5}"/>${bars}</svg></div></section>`;
}

export function feed(ctx) {
  const {derived, today} = ctx;
  return {title:t.pasza, floating:fab(t.mieszam,'mix','plus'), body:`<div class="stack">
    ${currentCard(ctx)}
    <section class="card"><h2>${t.naIleStarcza100Kg2}</h2><p class="display">${derived.daily > 0 ? fmt.days(100000 / derived.daily) : t.brakPrognozy}</p>
      <small>${derived.daily > 0 ? t.prognoza2 : ''}${fmt.number(derived.daily / 1000, 3)} ${t.kgDziennie}</small></section>
    ${consumptionChart(derived.batches,today)}
    <section class="stack tight"><div class="section-head"><h2>${t.receptury}</h2>${link(t.dodajRecepture,'recipe-form','', 'plus')}</div>
      ${derived.recipes.length ? '<div class="list">' + derived.recipes.map(recipe => row({name:recipe.name,
        symbol:'recipe', sub:recipe.current ? `<span class="tag">${t.aktualna}</span>` : '',
        value:fmt.stockQuantity(recipeComposition(recipe,derived.ingredients).mass / 1000,'kg'), route:'recipe/' + recipe.id})).join('') + '</div>' :
        empty(t.dodajReceptureAbyPrzeliczycSkladnikiNa)}</section>
    <section class="stack tight"><h2>${t.partie}</h2>${derived.batches.length ? '<div class="list">' + derived.batches.map(batch =>
      row({name:batch.recipeName, symbol:'feed', sub:fmt.listDate(batch.date, today) + ' · ' +
        (batchIsFinished(batch,today) ? t.zakonczona : batch.start > today ? t.zaplanowana : t.otwarta),
        value:batchLabel(batch), route:'batch/' + batch.id})).join('') + '</div>' : empty(t.nieMaJeszczePartii)}</section>
    </div>`,async action(action) {
      if (action !== 'finish-and-mix' || !derived.active) return;
      const {batch} = derived.active;
      await ctx.commit(data => ctx.finishToday(data,batch,today),'mix',t.zakonczonoPartie,true);
    }};
}

function costRows(cost, settings, {batch = false, consumed, daily, estimated = false, title = t.kosztMieszanki} = {}) {
  if (cost.kind === 'none') return '';
  const content = [];
  const value = text => estimated ? text + ` <small>${t.szacunek}</small>` : text;
  if (cost.kind === 'partial') content.push([title,t.brakDanych]);
  if (cost.kind === 'full') {
    if (batch) content.push([t.kosztPartii, fmt.money(cost.cents)]);
    if (!batch) content.push([t.koszt100Kg, fmt.money(cost.perKg * 100)]);
    content.push([t.kosztKilograma, fmt.money(cost.perKg) + '/kg']);
    if (daily != null) content.push([t.kosztDzienny, value(fmt.money(daily / 1000 * cost.perKg))]);
    if (settings.readyPrice !== null) {
      content.push([t.gotowaPasza, fmt.money(settings.readyPrice) + '/kg']);
      if (batch && consumed != null && consumed > 0) {
        const difference = savings(consumed, settings.readyPrice, cost.perKg);
        content.push([difference >= 0 ? t.taniejNizGotowaPaszaO : t.drozejNizGotowaPaszaO, value(fmt.money(Math.abs(difference)))]);
      }
      if (!batch) {
        const difference = savings(100000, settings.readyPrice, cost.perKg);
        content.push([difference >= 0 ? t.taniejNizGotowaPaszaO : t.drozejNizGotowaPaszaO, fmt.money(Math.abs(difference))]);
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
  const baseItems = new Map(composition.items.map(item => [item.ingredientId,item]));
  const additions = new Map(composition.additives.map(item => [item.ingredientId,item]));
  const recipeRows = recipe.items.map(({ingredientId,amount}) => {
    const item = baseItems.get(ingredientId) ?? additions.get(ingredientId);
    const dose = composition.mass ? fmt.number(item.amount * 100 / composition.mass,2) + ' ' + item.unit + t.na100Kg : '';
    const caption = item.additive ? `<span class="tag">${t.dodatek}</span>` : fmt.percent(item.share);
    return row({name:item.name,sub:caption + (dose ? ' · ' + dose : ''),value:fmt.stockQuantity(amount / 1000,item.unit)});
  }).join('');
  return {title:recipe.name, parent:'feed', body:`<div class="stack">
    <section class="card stack tight"><h2>${t.receptura}</h2>${hasBase ? '<p class="display">' + fmt.stockQuantity(composition.mass / 1000,'kg') + '</p>'
        : `<p>${t.dodajCoNajmniejJedenSkladnikOprocz}</p>`}
      ${recipe.current ? `<div><span class="tag">${t.aktualna}</span></div>` : ''}
      ${recipe.notes ? '<p class="notes">' + html(recipe.notes) + '</p>' : ''}</section>
    <section class="stack tight"><h2>${t.skladIProporcje}</h2><div class="list">${recipeRows}</div></section>
    ${hasBase ? costRows(mixtureCost([...composition.items,...composition.additives],composition.mass),ctx.derived.settings) : ''}
    <div class="actions">${link(t.edytuj, 'recipe-form/' + id, 'tonal', 'edit')}
      ${hasBase ? link(t.mieszam,'mix/' + id,'tonal') : ''}
      ${recipe.items.length > 1 ? link(t.zmienKolejnosc,'recipe-order/' + id,'tonal') : ''}
      ${recipe.current ? '' : button(t.ustawJakoAktualna, 'current', 'tonal', 'check')}
      </div></div>`,
    action: (action) => { if (action === 'current') ctx.commit(data => ctx.setCurrent(data, id)); }};
}

export function batchView(ctx, id, fromEventId) {
  const batch = find(ctx.data, 'batches', id);
  if (!batch) return missing('feed');
  const event = fromEventId && find(ctx.data,'ingredientEvents',fromEventId);
  const parent = event && event.batchId === id ? 'movement-detail/' + event.id : fromEventId === 'start' ? 'start' : 'feed';
  const result = batchStats(batch, ctx.data, ctx.derived, ctx.today);
  const estimated = text => !result.finished ? text + ` <small>${t.szacunek}</small>` : text;
  const metrics = [];
  if (result.daily != null) {
    metrics.push([t.zuzycieDzienne, estimated(fmt.number(result.daily / 1000, 3) + t.kgDzien)]);
    if (result.daily > 0) metrics.push([t.naIleStarcza100Kg, fmt.days(100000 / result.daily) + ` <small>${t.prognoza}</small>`]);
    if (result.birds > 0) metrics.push([t.naPtakaDziennie, estimated(fmt.number(result.daily / result.birds, 1) + ' g')]);
  }
  return {title:t.partia, subtitle:batch.recipeName, parent, body:`<div class="stack">
    <section class="card stack tight"><p class="display">${batchLabel(batch)}</p>
      ${details([[t.zmieszano, fmt.fullDate(batch.date)], [t.karmienieOd, fmt.fullDate(batch.start)],
        ...(batch.end ? [[t.ostatniDzienKarmieniaTaPartia, fmt.fullDate(addDays(batch.end,-1))]] : []),
        ...(result.remaining != null ? [[t.pozostalosc, estimated(fmt.mass(result.remaining))]] : [])])}</section>
    ${metrics.length ? `<section class="card stack tight"><h2>${t.wyniki}</h2>` + details(metrics) + '</section>' : ''}
    <section class="stack tight"><h2>${t.sklad}</h2><div class="list">${batch.items.map(item =>
      row({name:item.name,sub:item.additive || item.oil ? `<span class="tag">${t.dodatek}</span>` : '',
        value:fmt.stockQuantity(item.millilitres == null ? showAmount(item.grams,item) : item.millilitres / 1000,item.unit)})).join('')}</div></section>
    ${costRows(result.cost, ctx.derived.settings, {batch:true, consumed:result.consumed, daily:result.daily, estimated:!result.finished})}
    <div class="actions">${link(result.finished ? t.edytujZakonczenie : t.zakonczPartie, 'finish/' + id + '/batch', 'tonal')}
      ${link(t.edytujPartie, 'batch-form/' + id, '', 'edit')}</div></div>`};
}

export function warehouse(ctx) {
  const first = ctx.derived.stocks.find(item => !item.known);
  const onboarding = first && !ctx.derived.stocks.some(item => item.known);
  return {title:t.magazyn, floating:fab(t.dodaj,'movement/add','plus'), body:`<div class="stack">
    <section class="stack tight"><div class="section-head"><h2>${t.skladniki}</h2>${link(t.dodajSkladnik,'ingredient-form','', 'plus')}</div>
    ${onboarding ? stockOnboarding('ingredient/' + first.ingredient.id) : ctx.derived.stocks.length ? stockRows(ctx.derived.stocks, ctx) : empty(t.nieMaJeszczeSkladnikow)}</section></div>`};
}

const formatRate = (price, ingredient) => fmt.money(price.cents * 1000 / price.grams) + '/kg' +
  (ingredient.unit === 'l' ? ' · ' + fmt.money(price.cents * 1000 * ingredient.density / price.grams) + '/l' : '');

function purchasePlan(outlook,ingredient) {
  const lines = [[60,2],[90,3]].map(([days,months]) => {
    const amount = buyAmount(outlook,days,ingredient);
    return amount ? t.na + fmt.number(months) + t.miesiaceDokup + fmt.stockQuantity(amount,ingredient.unit) :
      t.wystarczyNaDluzejNiz + fmt.number(months) + t.miesiace;
  });
  return `<section class="card stack tight"><h2>${t.ileDokupic}</h2>${lines.map(line => '<p>' + line + '</p>').join('')}</section>`;
}

export function ingredientView(ctx, id) {
  const item = ctx.derived.stocks.find(entry => entry.ingredient.id === id);
  if (!item) return missing('stock');
  const {ingredient, grams, known, outlook} = item;
  const events = live(ctx.data.ingredientEvents).filter(row => row.ingredientId === id).sort(latestFirst);
  return {title:ingredient.name, parent:'stock', body:`<div class="stack"><section class="card stack tight">
    <h2>${t.powinnoByc}</h2>${isAdditive(ingredient) ? `<p class="muted">${t.dodatek}</p>` : ''}<p class="display"> ${known ? fmt.stockQuantity(showAmount(grams,ingredient),ingredient.unit) : t.wpiszIleMasz}</p>
     ${known && grams < 0 ? warning(t.sprawdzStan) : ''}
    ${known ? forecast(outlook,ctx.derived.settings.threshold,ctx.today,false,item.usedInRecipe) : ''}
    ${outlook ? `<p class="muted">${t.dailyStockUse} ${fmt.stockQuantity(showAmount(outlook.daily,ingredient),ingredient.unit)} ${t.daily}</p>` : ''}
    ${ingredient.price ? `<p><small>${t.ostatniaCena}</small> ` + formatRate(ingredient.price, ingredient) + '</p>' : ''}
    </section>${outlook ? purchasePlan(outlook,ingredient) : ''}<div class="actions">${link(t.dodaj,'movement/add/' + id,'tonal','plus')}
      ${link(t.korektaStanu,'movement/correction/' + id,'tonal')}
      ${link(t.innePobranie,'movement/withdrawal/' + id,'tonal')}
      ${link(t.edytujSkladnik,'ingredient-form/' + id,'','edit')}</div>
    <section class="stack tight"><h2>${t.historiaRuchow}</h2>${events.length ? '<div class="list">' + events.map(event => {
      const batch = event.batchId && find(ctx.data,'batches',event.batchId);
      const sub = fmt.listDate(event.date,ctx.today) + (batch ? ' · ' + html(batch.recipeName) : '');
      return row({name:movementNames[event.type],
        sub,value:fmt.stockQuantity(showAmount(event.grams,ingredient),ingredient.unit,true),
        route:'movement-detail/' + event.id});
    }).join('') + '</div>' : empty(t.nieMaJeszczeRuchowMagazynowych)}</section></div>`};
}

export function movementDetail(ctx, id) {
  const event = find(ctx.data,'ingredientEvents',id);
  if (!event) return missing('stock');
  const ingredient = find(ctx.data,'ingredients',event.ingredientId);
  if (!ingredient) return missing('stock');
  const parent = 'ingredient/' + ingredient.id;
  const batch = event.batchId && find(ctx.data,'batches',event.batchId);
  const amount = fmt.stockQuantity(showAmount(event.grams,ingredient),ingredient.unit,true);
  const info = [[t.data,fmt.fullDate(event.date)]];
  if (event.type === 'correction' && event.measured != null) {
    info.push([t.stanPoKorekcie,fmt.stockQuantity(showAmount(event.measured,ingredient),ingredient.unit)]);
  }
  if (event.price) {
    const total = event.price.cents * event.grams / event.price.grams;
    info.push([t.kosztZakupu,fmt.money(total)]);
    if (event.priceMode !== 'total') {
      const perLitre = event.priceMode === 'per-litre';
      const unitMass = perLitre ? Math.round(ingredient.density * 1000) : 1000;
      info.push([t.cenaZaJednostke,fmt.money(event.price.cents * unitMass / event.price.grams) + (perLitre ? '/l' : '/kg')]);
    }
  }
  if (batch) info.push([t.partia,html(batch.recipeName) + ' · ' + html(batchLabel(batch))]);
  const action = batch ? link(t.pokazPartie,'batch/' + batch.id + '/' + id,'tonal') :
    event.type !== 'batch' ? link(t.edytuj,'movement/' + event.type + '/' + ingredient.id + '/' + id,'tonal','edit') : '';
  return {title:movementNames[event.type],subtitle:ingredient.name,parent,body:`<div class="stack">
    <section class="card stack tight"><p class="display">${amount}</p>${details(info)}
    ${event.notes ? '<p class="notes">' + html(event.notes) + '</p>' : ''}</section>
    <div class="actions">${action}</div></div>`};
}

export function flockView(ctx) {
  const cohorts = live(ctx.data.cohorts).sort(latestFirst);
  const {flock} = ctx.derived;
  return {title:t.stado,floating:fab(t.dodajRocznik,'cohort-form','plus'),body:`<div class="stack">
    ${cohorts.length ? `<section class="card stack tight"><h2>${t.razem}</h2><p class="display">${fmt.birds(flock.total)}</p>
      <p class="muted">${fmt.hens(flock.hens)}, ${fmt.roosters(flock.roosters)}</p></section>
    <section class="stack tight"><h2>${t.roczniki}</h2><div class="list">${cohorts.map(cohort => row({name:cohort.name,
      sub:[html(cohort.mark),fmt.age(cohortAge(cohort,ctx.today))].filter(Boolean).join(' · '),
      value:fmt.pieces(cohortCount(cohort,ctx.data.cohortChanges,ctx.today)),route:'cohort/' + cohort.id})).join('')}</div></section>` :
      empty(t.dodajPierwszyRocznik)}</div>`};
}

export function cohortView(ctx,id) {
  const cohort = find(ctx.data,'cohorts',id);
  if (!cohort) return missing('flock');
  const history = cohortEvents(cohort,ctx.data.cohortChanges,ctx.today).reverse()
    .filter(event => flockEventKind(event) !== 'status');
  const count = cohortCount(cohort,ctx.data.cohortChanges,ctx.today);
  const eventRows = history.map(event => {
    const kind = flockEventKind(event);
    const correction = kind === 'correction';
    return row({name:correction ? t.correctionPrefix + fmt.pieces(event.count) : (kind === 'add' ? '+' : '−') + fmt.pieces(event.count),
      sub:[fmt.fullDate(event.date),html(event.notes)].filter(Boolean).join(' · '),
      route:correction ? '' : 'change/' + id + '/' + kind + '/' + event.id});
  }).join('');
  return {title:cohort.name,parent:'flock',body:`<div class="stack">
    <section class="card stack tight"><h2>${cohort.category === 'hens' ? t.kury : t.koguty}</h2>
    <p class="display">${fmt.pieces(count)}</p>
    ${details([[cohort.dateKind === 'hatch' ? t.dataWyklucia : t.dataZakupu,fmt.fullDate(cohort.date)],
      [t.wiek,fmt.age(cohortAge(cohort,ctx.today))],...(cohort.mark ? [[t.oznaczenie,html(cohort.mark)]] : [])])}</section>
    <div class="actions">${link(t.zmienLiczbe,'change/' + id,'tonal')}
      ${link(t.edytuj,'cohort-form/' + id,'','edit')}</div>
    <section class="stack tight"><h2>${t.historiaZmianLiczby}</h2>${eventRows ? '<div class="list">' + eventRows + '</div>' :
      empty(t.nieMaJeszczeZmianLiczbyPtakow)}</section></div>`};
}

export function missing(parent = 'start') {
  return {title:t.brakWpisu, parent, body:empty(t.nieMaTakiegoWpisu, link(t.wroc,parent,'tonal'))};
}
