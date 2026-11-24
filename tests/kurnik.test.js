import {test} from 'node:test';
import assert from 'node:assert/strict';
import {averageFlock, batchBaseMass, cohortCounts, feedModel, hatchRate, incubation, batchResult, cohortAge, cohortCount, dailyAverage, dailyHistory, flockCount, ingredientMass,
  isAdditive, lastBatchMass, mixtureCost, purchaseNeed, recipeComposition, remainingMix, roundPurchase, savings, scaleBatch,
  scaleRecipe, stock, supplyForecast, validCohortHistory} from '../src/calc/index.js';
import {decodeBackup, encodeBackup} from '../src/backup.js';
import {record} from '../src/db.js';
import {normalizeData} from '../src/migrate.js';
import {derive, putBatch, removeBatch} from '../src/model.js';
import {batchView, cohortView, feed, flockView, ingredientView, movementDetail, recipeView, start, warehouse} from '../src/views.js';
import {mixForm, movementForm} from '../src/forms.js';
import * as fmt from '../ui/format.js';

const today = '2026-11-22';
const amounts = [17000, 13000, 10000, 5000, 3250, 1250, 1000];
const names = ['Pszenica', 'Kukurydza', 'Śruta sojowa', 'Groch', 'Kreda', 'Dolmix DN', 'Olej'];
// Receptura z olejem jako dodatkiem (stan po wersji 1.5).
const fixture = (oilKind = 'additive') => {
  const ingredients = names.map((name, i) => record({name, unit:i === 6 ? 'l' : 'kg', density:i === 6 ? .92 : null,
    price:null, kind:i === 6 ? oilKind : 'base'}));
  const recipe = record({name:'Podstawowa', items:ingredients.map((row, i) => ({ingredientId:row.id, amount:amounts[i]})),
    current:true, notes:''});
  const data = {ingredients, recipes:[recipe], batches:[], ingredientEvents:[], cohorts:[], cohortChanges:[],
    settings:[record({threshold:30, defaultDaily:3700, readyPrice:null, lastExport:today, revision:0})]};
  return {data, ingredients, recipe, composition:recipeComposition(recipe, ingredients)};
};
const ctxOf = (data, day = today) => ({data, derived:derive(data, day), today:day, version:'test'});
const finished = {mass:1000000, start:'2025-04-22', end:'2026-01-17', remaining:0, items:[], createdAt:'2025-04-22T12:00:00.000Z'};
const near = (value, expected, precision = 1e-8) => assert.ok(Math.abs(value - expected) <= precision, `${value} ≠ ${expected}`);
const kg = grams => fmt.number(grams / 1000, 2);

test('T1 – receptura z olejem jako dodatkiem: 49,5 kg, pszenica 34,3%, olej 2,02 l na 100 kg', () => {
  const {data, recipe, composition} = fixture();
  assert.equal(composition.mass, 49500);
  assert.equal(composition.items.length, 6);
  assert.equal(fmt.percent(composition.items[0].share), '34,3%');
  assert.equal(kg(composition.items[0].share * 100000), '34,34');
  const [oil] = composition.additives;
  assert.equal(fmt.precise(oil.amount / 1000 * 100000 / composition.mass, 'l'), '2,02 l');
  const body = recipeView(ctxOf(data), recipe.id).body;
  assert.match(body, /Skład na 100 kg/);
  assert.match(body, /dodatek<\/small>[\s\S]*2,02 l/);
  assert.match(body, /34,3%<\/small>[\s\S]*34,34 kg/);
  assert.match(feed(ctxOf(data)).body, /7 składników/);
});

test('T2 – litry bez gęstości są odrzucane', () => {
  assert.throws(() => ingredientMass(1000, 'l', null), /gęstość/);
});

test('T3 – zużycie i dni', () => {
  const {days, daily} = batchResult(finished);
  assert.equal(days, 270);
  assert.equal(fmt.number(daily / 1000, 3), '3,704');
  assert.equal(fmt.days(100000 / daily), '27 dni');
});

test('T4 – gramy na ptaka z historycznej obsady', () => {
  const cohort = record({date:'2025-04-22', dateKind:'hatch', hens:30, roosters:0, rearing:null});
  const birds = averageFlock([cohort], [], finished.start, finished.end);
  assert.equal(fmt.number(batchResult(finished).daily / birds, 1), '123,5');
  const change = record({date:'2025-09-04', cohortId:cohort.id, count:20});
  assert.equal(averageFlock([cohort], [change], finished.start, finished.end), 25);
});

test('T5–T6 – stan z wpisów i korekta', () => {
  const id = 'pszenica';
  const events = [500000, 1000000, -340000, -5000].map(grams => record({ingredientId:id, grams}));
  assert.equal(stock(events, id), 1155000);
  const difference = 1140000 - stock(events, id);
  assert.equal(difference, -15000);
  events.push(record({ingredientId:id, grams:difference}));
  assert.equal(stock(events, id), 1140000);
});

test('T7 – prognoza pszenicy: 1000 kg przy 3,704 kg dziennie ≈ 786 dni', () => {
  const {composition} = fixture();
  const forecast = supplyForecast(1000000, composition.items[0].share, batchResult(finished).daily, 0, today);
  assert.equal(Math.round(forecast.days), 786);
});

test('T8 – przeliczenie na 100 kg z olejem w litrach', () => {
  const {composition} = fixture();
  const items = scaleBatch(composition, 100000);
  const base = items.filter(item => !item.additive);
  assert.equal(base.reduce((sum, row) => sum + row.grams, 0), 100000);
  assert.deepEqual(base.map(row => kg(row.grams)), ['34,34', '26,26', '20,2', '10,1', '6,57', '2,53']);
  const oil = items.find(item => item.additive);
  assert.equal(oil.millilitres, 2020);
  assert.equal(oil.grams, 1858);
  assert.equal(items.at(-1).name, 'Olej');
});

test('T9 – pozostałość i dni prognozy', () => {
  const daily = batchResult(finished).daily;
  const remain = remainingMix({mass:100000, start:'2026-11-12'}, daily, today);
  assert.equal(fmt.mass(remain), '63 kg');
  assert.equal(fmt.days(remain / daily), '17 dni');
});

test('T10 – koszt z ceną za litr i porównanie z gotową paszą (olej liczony w proporcjach)', () => {
  const {recipe, ingredients} = fixture('base');
  const prices = [70, 65, 200, 130, 86, 560, 400];
  ingredients.forEach((row, i) => { row.price = {cents:prices[i], grams:i === 6 ? 920 : 1000}; });
  const cost = mixtureCost(recipeComposition(recipe, ingredients).items);
  near(cost.cents, 6064.5);
  assert.equal(fmt.money(cost.perKg * 100), '120,28 zł');
  assert.equal(fmt.money(savings(1352000, 200, cost.perKg)), '1 077,82 zł');
});

test('T11 – wiek w pełnych miesiącach i „co najmniej”', () => {
  const cohort = {date:'2025-04-14', dateKind:'purchase', weeks:16};
  assert.equal(fmt.age(cohortAge(cohort, today)), '1 rok 10 mies.');
  assert.equal(fmt.age(cohortAge({...cohort, weeks:null}, today)), 'co najmniej 1 rok 7 mies.');
  assert.equal(fmt.age(cohortAge({...cohort, dateKind:'initial', weeks:null}, today)), 'co najmniej 1 rok 7 mies.');
});

test('T12 – receptura bez cen nie pokazuje kosztu', () => {
  const {data, recipe} = fixture();
  assert.doesNotMatch(recipeView(ctxOf(data), recipe.id).body, /Koszt|zł/);
  data.ingredients[0].price = {cents:70, grams:1000};
  assert.match(recipeView(ctxOf(data), recipe.id).body, /Nie wszystkie składniki mają cenę/);
});

test('T13 – prognoza oleju: 10 l przy 3,704 kg mieszanki dziennie ≈ 134 dni', () => {
  const {data, ingredients, composition} = fixture();
  const [oil] = composition.additives;
  const forecast = supplyForecast(9200, oil.share, batchResult(finished).daily, 0, today);
  assert.equal(Math.round(forecast.days), 134);
  data.batches.push({...finished, id:'b', recipeId:data.recipes[0].id, recipeName:'x', date:finished.start, deleted:false});
  data.ingredientEvents.push(record({ingredientId:ingredients[6].id, type:'purchase', date:today, grams:9200}));
  const row = derive(data, today).stocks.find(item => item.ingredient.id === ingredients[6].id);
  assert.equal(Math.round(row.outlook.days), 134);
  assert.equal(derive(data, today).stocks[0].ingredient.name, 'Olej');
});

test('T14 – ile dokupić: pszenica 50 kg przy 3,5 kg dziennie → 23 kg i 59 kg', () => {
  const {composition} = fixture();
  const share = composition.items[0].share;
  assert.equal(roundPurchase(purchaseNeed(50000, share, 3500, 0, 60), 'kg'), 23);
  assert.equal(roundPurchase(purchaseNeed(50000, share, 3500, 0, 90), 'kg'), 59);
  assert.equal(purchaseNeed(500000, share, 3500, 0, 90), 0);
  assert.equal(roundPurchase(1132, 'l', .92), 1.3);
  assert.equal(roundPurchase(920, 'l', .92), 1);
});

test('T15 – masa „Inna” 75 kg: pszenica 25,76 kg, olej 1,52 l', () => {
  const {composition} = fixture();
  const items = scaleBatch(composition, 75000);
  assert.equal(kg(items[0].grams), '25,76');
  assert.equal(fmt.number(items.find(item => item.additive).millilitres / 1000, 2), '1,52');
});

test('T16 – domyślna masa: ostatnia partia 75 kg → „Inna” z 75; bez partii 100 kg', () => {
  const {data, recipe, ingredients} = fixture();
  assert.equal(lastBatchMass([]), 100000);
  let body = mixForm(ctxOf(data), 'mix').body;
  assert.match(body, /aria-pressed="true" data-action="mass:100000"/);
  const items = scaleBatch(recipeComposition(recipe, ingredients), 75000);
  putBatch(data, null, {recipeId:recipe.id, recipeName:recipe.name, date:today, start:today, end:null, remaining:null,
    mass:75000, massBasis:'base', items:items.map(({position, share, amount, additive, ...item}) => additive ? {...item, additive} : item)});
  assert.equal(lastBatchMass(data.batches), 75000);
  body = mixForm(ctxOf(data), 'mix').body;
  assert.match(body, /aria-pressed="true" data-action="mass:other"/);
  assert.match(body, /id="other-mass"[\s\S]*?value="75"/);
  assert.match(body, /Olej <small class="tag">Dodatek<\/small>/);
  assert.doesNotMatch(body, /Rodzaj oleju|Olej dodany|Bez oleju/);
});

test('T17 – zmiana liczby: 30 szt., ubyło 1, przybyło 5 → 34 szt.', () => {
  const {data} = fixture();
  const cohort = record({name:'Kury 2025', date:'2025-04-14', dateKind:'purchase', weeks:16, hens:30, roosters:0, rearing:null, mark:'', notes:''});
  data.cohorts.push(cohort);
  data.cohortChanges.push(record({cohortId:cohort.id, type:'loss', date:'2026-10-01', count:1, notes:'padła', order:1}),
    record({cohortId:cohort.id, type:'add', date:'2026-11-01', count:5, notes:'dokupione', order:2}));
  assert.equal(cohortCount(cohort, data.cohortChanges, today), 34);
  const body = cohortView(ctxOf(data), cohort.id).body;
  assert.match(body, /padła[\s\S]*−1 kura/);
  assert.match(body, /dokupione[\s\S]*\+5 kur/);
  assert.match(body, />34<span class="unit">szt\./);
  assert.match(body, /href="#change\/[^"]+\/loss"[\s\S]*href="#change\/[^"]+\/add"/);
  assert.equal(validCohortHistory(cohort, [...data.cohortChanges, record({cohortId:cohort.id, type:'loss', date:today, count:35})]), false);
});

test('T18 – migracja stada: ubytek 2, status, korekta na 25 → 25 szt., bez statusu', () => {
  const {data} = fixture();
  const cohort = record({name:'Nioski', category:'hens', date:'2026-03-01', dateKind:'initial', weeks:null, count:30,
    mark:'', notes:'', status:'young', origin:'initial', expectedStart:'2026-06-01'});
  data.cohorts.push(cohort);
  data.cohortChanges.push(
    record({cohortId:cohort.id, type:'loss', date:'2026-04-01', count:2, reason:'died', notes:''}),
    record({cohortId:cohort.id, type:'status', date:'2026-06-01', status:'laying', notes:''}),
    record({cohortId:cohort.id, type:'correction', date:'2026-07-01', count:25, notes:''}));
  const backup = JSON.parse(encodeBackup(data, today));
  backup.version = 3;
  const restored = decodeBackup(JSON.stringify(backup));
  const [migrated] = restored.cohorts;
  assert.equal(cohortCount(migrated, restored.cohortChanges, today), 25);
  assert.equal(flockCount(restored.cohorts, restored.cohortChanges, today).hens, 25);
  const body = cohortView(ctxOf(restored), migrated.id).body;
  assert.match(body, /Korekta: 25 szt\./);
  assert.match(body, /padła/);
  assert.doesNotMatch(body, /Nioski<\/h2>|Młode|Wycofane|Status|nieśności/);
  assert.match(body, /co najmniej/);
});

test('T19 – migracja dodatków: stary „Olej” (oil: true) staje się dodatkiem, stare partie bez zmian', () => {
  const {data, ingredients, recipe} = fixture();
  const oil = ingredients[6];
  delete oil.kind;
  oil.oil = true;
  for (const ingredient of ingredients.slice(0, 6)) delete ingredient.kind;
  const base = scaleRecipe(recipeComposition(recipe, ingredients), 50000);
  const oldBatch = putBatch(data, null, {recipeId:recipe.id, recipeName:recipe.name, date:'2026-10-01', start:'2026-10-01',
    end:'2026-10-15', remaining:0, mass:51150, items:[...base.map(({ingredientId, name, unit, density, grams, price}) =>
      ({ingredientId, name, unit, density, grams, price})),
    {ingredientId:oil.id, name:oil.name, unit:'l', density:.92, oil:true, millilitres:1250, grams:1150, price:null}]});
  const backup = JSON.parse(encodeBackup(data, today));
  backup.version = 3;
  const restored = decodeBackup(JSON.stringify(backup));
  const migratedOil = restored.ingredients.find(row => row.id === oil.id);
  assert.equal(migratedOil.kind, 'additive');
  assert.equal(migratedOil.oil, undefined);
  assert.equal(restored.ingredients[0].kind, 'base');
  assert.equal(recipeComposition(restored.recipes[0], restored.ingredients).mass, 49500);
  assert.deepEqual(restored.batches[0], oldBatch);
  assert.equal(batchBaseMass(restored.batches[0]), 50000);
  near(batchResult(restored.batches[0]).consumed, 50000);
  const body = batchView(ctxOf(restored), oldBatch.id).body;
  assert.match(body, /<b>50 kg<\/b>[\s\S]*\+ 1,3 l oleju/);
  assert.match(body, /1,25 l/);
});

test('T20 – źródło dodania: domyślnie „Zakup”, po „Własny” zapamiętane dla składnika', () => {
  const {data, ingredients} = fixture();
  const nettle = record({name:'Pokrzywa', unit:'kg', density:null, price:null, kind:'base', lastSource:'addition'});
  data.ingredients.push(nettle);
  const checked = body => body.match(/value="(\w+)" checked/)[1];
  assert.equal(checked(movementForm(ctxOf(data), 'add', nettle.id).body), 'addition');
  assert.equal(checked(movementForm(ctxOf(data), 'add', ingredients[0].id).body), 'purchase');
  assert.doesNotMatch(movementForm(ctxOf(data), 'add', ingredients[0].id).body, /Własny lub otrzymany/);
  const restored = decodeBackup(encodeBackup(data, today));
  assert.equal(restored.ingredients.at(-1).lastSource, 'addition');
});

test('partie nachodzące na siebie mają wspólne dni liczone raz; stary olej nie zawyża zużycia', () => {
  const rows = [{...finished, mass:10000, start:'2026-01-01', end:'2026-01-11'},
    {...finished, mass:10000, start:'2026-01-06', end:'2026-01-16'}];
  near(dailyAverage(rows, 3700, today), 20000 / 15);
  const withOil = {...finished, mass:10200, start:'2026-01-01', end:'2026-01-11',
    items:[{grams:10000}, {oil:true, grams:200, millilitres:217}]};
  near(dailyAverage([withOil], 3700, today), 1000);
});

test('zapisany skład i ceny nie zmieniają się z recepturą, a usunięcie partii cofa ruchy', () => {
  const {data, recipe, ingredients} = fixture();
  ingredients[0].price = {cents:70, grams:1000};
  const items = structuredClone(recipeComposition(recipe, ingredients).items);
  const batch = putBatch(data, null, {recipeId:recipe.id, recipeName:recipe.name, date:today, start:today,
    end:null, remaining:null, mass:49500, massBasis:'base', items});
  ingredients[0].price.cents = 100;
  recipe.items[0].amount = 27000;
  assert.equal(batch.items[0].grams, 17000);
  assert.equal(batch.items[0].price.cents, 70);
  assert.equal(stock(data.ingredientEvents, ingredients[0].id), -17000);
  removeBatch(data, batch.id);
  assert.equal(stock(data.ingredientEvents, ingredients[0].id), 0);
});

test('kopia: zapis i odczyt bez zmian, uszkodzona kopia daje jeden prosty komunikat', () => {
  const {data, ingredients, recipe, composition} = fixture();
  const oil = ingredients[6];
  oil.price = {cents:400, grams:920};
  data.ingredientEvents.push(record({ingredientId:oil.id, type:'purchase', date:today, grams:1840, measured:null,
    price:oil.price, priceMode:'per-litre', batchId:null, notes:''}));
  const items = scaleBatch(composition, 50000).map(({position, share, amount, additive, ...item}) => additive ? {...item, additive} : item);
  putBatch(data, null, {recipeId:recipe.id, recipeName:recipe.name, date:today, start:today,
    end:null, remaining:null, mass:50000, massBasis:'base', items});
  const cohort = record({name:'Kury', date:today, dateKind:'hatch', weeks:null, hens:30, roosters:0, rearing:null, mark:'', notes:''});
  data.cohorts.push(cohort);
  data.cohortChanges.push(record({cohortId:cohort.id, type:'loss', sex:'hens', date:today, count:1, notes:'padła'}));
  const restored = decodeBackup(encodeBackup(data, today));
  assert.deepEqual(restored, {...data, settings:[{...data.settings[0], lastExport:today}]});
  assert.equal(JSON.parse(encodeBackup(data, today)).version, 5);
  data.batches[0].mass += 1;
  assert.throws(() => decodeBackup(encodeBackup(data, today)), /To nie jest plik kopii Kurnika albo jest uszkodzony\./);
  assert.throws(() => decodeBackup('{nie json'), /To nie jest plik kopii Kurnika/);
});

test('kopia z wersji 1.5 od Codexa (dodatek w kg, savedOrder, rocznik bez uwag) wczytuje się', () => {
  const {data, ingredients, recipe} = fixture();
  ingredients[5].kind = 'additive';
  ingredients[0].lastSource = 'purchase';
  const items = scaleBatch(recipeComposition(recipe, ingredients), 100000)
    .map(({position, share, amount, additive, ...item}) => additive ? {...item, additive} : item);
  putBatch(data, null, {recipeId:recipe.id, recipeName:recipe.name, date:today, start:today, end:null, remaining:null,
    mass:items.filter(item => !item.additive).reduce((sum, item) => sum + item.grams, 0), massBasis:'base', items, savedOrder:1});
  const cohort = record({name:'Kury', category:'hens', date:'2026-01-01', dateKind:'purchase', weeks:null, count:20, mark:''});
  data.cohorts.push(cohort);
  data.cohortChanges.push(record({cohortId:cohort.id, type:'add', date:'2026-02-01', count:2, notes:'', order:1}));
  const backup = JSON.parse(encodeBackup(data, today));
  backup.version = 4;
  const restored = decodeBackup(JSON.stringify(backup));
  assert.equal(restored.cohorts[0].notes, '');
  assert.equal(cohortCount(restored.cohorts[0], restored.cohortChanges, today), 22);
  assert.equal(restored.batches[0].items.filter(item => item.additive).length, 2);
  assert.equal(batchBaseMass(restored.batches[0]), 100000);
});

test('Start „co dalej”: następne mieszanie, 3 kończące się składniki, stado; bez FAB', () => {
  const {data, ingredients, recipe} = fixture();
  let screen = start(ctxOf(data));
  assert.equal(screen.floating, undefined);
  assert.doesNotMatch(screen.body, /Magazyn w skrócie|Wpisz, ile masz</);
  assert.match(screen.body, /Nie wszystkie stany są wpisane/);
  assert.match(screen.body, /Dodaj rocznik/);
  assert.match(screen.body, /Brak mieszanki w użyciu/);
  assert.match(screen.body, /href="#mix"/);
  assert.doesNotMatch(screen.body, /0 ptaków/);

  const now = '2026-11-23';
  data.batches.push(record({mass:50000, massBasis:'base', date:'2026-11-15', start:'2026-11-15', end:null, remaining:null,
    recipeName:'Podstawowa', recipeId:recipe.id, items:[{ingredientId:ingredients[0].id, grams:50000}]}));
  ingredients.forEach((row, i) => data.ingredientEvents.push(record({ingredientId:row.id, type:'purchase',
    grams:i === 2 ? 5000 : 200000, date:now})));
  data.cohorts.push(record({name:'Kury', date:'2026-01-01', dateKind:'hatch', weeks:null, hens:26, roosters:0, rearing:null, mark:'', notes:''}),
    record({name:'Koguty', date:'2026-01-01', dateKind:'hatch', weeks:null, hens:0, roosters:4, rearing:null, mark:'', notes:''}));
  screen = start(ctxOf(data, now));
  // 30 ptaków × 120 g = 3,6 kg dziennie; 8,5 dnia karmienia → zostało 50 − 30,6 = 19,4 kg; 19,4 / 3,6 ≈ 5 dni.
  assert.match(screen.body, /Następne mieszanie[\s\S]*≈<\/span>5<span class="unit">dni/);
  assert.match(screen.body, /zostało <b>19 kg<\/b>/);
  assert.doesNotMatch(screen.body, /około|ok\./);
  assert.match(screen.body, /Brakuje na 50 kg[\s\S]*Śruta sojowa 6 kg/);
  assert.match(screen.body, /Zapasy[\s\S]*Śruta sojowa/);
  assert.equal((screen.body.match(/class="supply-row/g) ?? []).length, 3);
  assert.match(screen.body, /Kury[\s\S]*>30<span class="unit">szt\.[\s\S]*26 kur · 4 koguty/);
  assert.match(screen.body, /Zużycie dziennie[\s\S]*3,6<span class="unit">kg[\s\S]*120 g na sztukę · wg Ustawień/);
  assert.doesNotMatch(screen.body, /Zrób kopię/);
  data.settings[0].lastExport = '2026-09-01';
  assert.match(start(ctxOf(data, now)).body, /Zrób kopię/);
});

test('zużycie na ptaka: uczy się z partii, a ubytek w połowie partii zmienia prognozę od tego dnia', () => {
  const {data, recipe} = fixture();
  const cohort = record({name:'Kury', date:'2026-01-01', dateKind:'hatch', weeks:null, hens:30, roosters:0, rearing:null, mark:'', notes:''});
  data.cohorts.push(cohort);
  // Zakończona partia: 30 ptaków × 10 dni zjadło 33 kg → 110 g na ptaka.
  data.batches.push(record({mass:33000, massBasis:'base', date:'2026-10-01', start:'2026-10-01', end:'2026-10-11', remaining:0,
    recipeName:'P', recipeId:recipe.id, items:[]}));
  const open = record({mass:50000, massBasis:'base', date:'2026-11-15', start:'2026-11-15', end:null, remaining:null,
    recipeName:'P', recipeId:recipe.id, items:[]});
  data.batches.push(open);
  let derived = derive(data, '2026-11-23');
  near(derived.model.perBird, 110);
  near(derived.daily, 3300);
  near(derived.active.remaining, 50000 - 8.5 * 3300);
  // 20.11 ubyło 10 kur: od tego dnia 20 × 110 g.
  data.cohortChanges.push(record({cohortId:cohort.id, type:'loss', date:'2026-11-20', count:10, notes:'sprzedana'}));
  derived = derive(data, '2026-11-23');
  near(derived.daily, 2200);
  near(derived.active.remaining, 50000 - 5 * 3300 - 3.5 * 2200);
  assert.match(feed(ctxOf(data, '2026-11-23')).body, /Zużycie dziennie[\s\S]*2,2<span class="unit">kg[\s\S]*20 szt\. × 110 g/);
});

test('bez stada prognoza liczy kg dziennie, dziś jako pół dnia; rocznik z późniejszą datą nie zeruje przeszłości', () => {
  const {data, recipe} = fixture();
  data.batches.push(record({mass:50000, massBasis:'base', date:'2026-11-15', start:'2026-11-15', end:null, remaining:null,
    recipeName:'P', recipeId:recipe.id, items:[]}));
  let derived = derive(data, '2026-11-23');
  assert.equal(derived.model.perBird, null);
  near(derived.active.remaining, 50000 - 8.5 * 3700);
  const body = feed(ctxOf(data, '2026-11-23')).body;
  assert.match(body, /W użyciu · P[\s\S]*19<span class="unit">kg<\/span><span class="of">z 50 kg[\s\S]*dzień <b>9<\/b>/);
  assert.match(body, /3,7<span class="unit">kg[\s\S]*wg Ustawień/);
  assert.doesNotMatch(body, /około|ok\./);
  data.cohorts.push(record({name:'Kury', date:'2026-11-23', dateKind:'purchase', weeks:null, hens:25, roosters:0, rearing:null, mark:'', notes:''}));
  derived = derive(data, '2026-11-23');
  near(derived.active.remaining, 50000 - 8.5 * 25 * 120);
});

test('Magazyn: karta „Wpisz stany” przy pierwszym uruchomieniu, potem „Wpisz, ile masz” przy brakach', () => {
  const {data, ingredients} = fixture();
  let body = warehouse(ctxOf(data)).body;
  assert.match(body, /Wpisz stany/);
  data.ingredientEvents.push(record({ingredientId:ingredients[0].id, type:'purchase', grams:25000, date:today}));
  body = warehouse(ctxOf(data)).body;
  assert.doesNotMatch(body, /Wpisz stany/);
  assert.match(body, /wpisz stan/);
  assert.match(body, /<span class="s-val">25 kg<\/span>/);
  assert.match(body, /href="#movement\/add"[^>]*>[\s\S]*Dodaj na stan/);
  assert.equal(warehouse(ctxOf(data)).floating, undefined);
  assert.equal(feed(ctxOf(data)).floating, undefined);
  assert.doesNotMatch(body, /około|ok\./);
});

test('ekran składnika: 22,5 kg po zużyciu 2,5 kg z 25 kg, „Ile dokupić” i podgląd ruchów', () => {
  const {data, ingredients, recipe} = fixture();
  const ingredient = ingredients[0];
  const purchase = record({ingredientId:ingredient.id, type:'purchase', date:'2026-11-15', grams:25000,
    price:{cents:200, grams:1000}, priceMode:'per-kg', notes:'Dostawa'});
  data.ingredientEvents.push(purchase);
  const batch = putBatch(data, null, {recipeId:recipe.id, recipeName:recipe.name, mass:2500, massBasis:'base', date:today, start:today,
    end:null, remaining:null, items:[{ingredientId:ingredient.id, name:ingredient.name, unit:'kg', density:null, grams:2500, price:null}]});
  const usage = data.ingredientEvents.find(event => event.batchId === batch.id);
  const ctx = ctxOf(data);
  const page = ingredientView(ctx, ingredient.id);
  // Na listach i w karcie stan w pełnych kg (22,5 → 23), dokładny stan jest w szczegółach ruchu.
  assert.match(page.body, /Stan[\s\S]*23<span class="unit">kg/);
  assert.match(page.body, /Potrzeba na 2 mies\.[\s\S]*kg/);
  assert.match(page.body, /Zakup[\s\S]*2,00\szł\/kg · Dostawa[\s\S]*\+25 kg/);
  assert.match(page.body, /Zużyte w partii[\s\S]*−2,5 kg/);
  assert.ok(page.body.includes('#movement-detail/' + usage.id));
  const purchased = movementDetail(ctx, purchase.id);
  assert.match(purchased.body, /Zapłacono[\s\S]*50,00/);
  const consumed = movementDetail(ctx, usage.id);
  assert.ok(consumed.body.includes('#batch/' + batch.id + '/' + usage.id));
});

test('zakończenie partii: partia z ostatnim dniem dziś nie jest już w użyciu', () => {
  const {data, recipe, ingredients} = fixture();
  const batch = record({mass:100000, massBasis:'base', date:'2026-11-01', start:'2026-11-01', end:null, remaining:null,
    recipeName:'Podstawowa', recipeId:recipe.id, items:[{ingredientId:ingredients[0].id, grams:100000}]});
  data.batches.push(batch);
  assert.equal(derive(data, today).active.batch.id, batch.id);
  assert.match(feed(ctxOf(data)).body, /href="#finish\/[^"]+"[^>]*>Zakończ partię/);
  Object.assign(batch, {end:'2026-11-23', remaining:0});
  assert.equal(derive(data, today).active, undefined);
  assert.match(batchView(ctxOf(data), batch.id).body, /Zakończona · 01\.11 – 22\.11[\s\S]*22<span class="unit">dni/);
  near(derive(data, today).daily, 100000 / 22);
});

test('wykres zużycia pojawia się od 3 zakończonych partii, najwyżej 12', () => {
  const {data, recipe} = fixture();
  const add = i => data.batches.push(record({mass:100000, massBasis:'base', date:`2025-${String(i).padStart(2, '0')}-01`,
    start:`2025-${String(i).padStart(2, '0')}-01`, end:`2025-${String(i).padStart(2, '0')}-25`, remaining:0,
    recipeName:'P', recipeId:recipe.id, items:[]}));
  add(1); add(2);
  assert.doesNotMatch(feed(ctxOf(data)).body, /class="bars"/);
  add(3);
  assert.match(feed(ctxOf(data)).body, /Zużycie dziennie w kolejnych partiach[\s\S]*class="bars"/);
  for (let i = 4; i <= 12; i++) add(i);
  data.batches.push(record({mass:100000, massBasis:'base', date:'2024-01-01', start:'2024-01-01', end:'2024-01-20',
    remaining:0, recipeName:'P', recipeId:recipe.id, items:[]}));
  const rows = dailyHistory(data.batches, today);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].end, '2025-01-25');
});

test('normalizacja jest idempotentna i nie rusza liczb', () => {
  const {data} = fixture();
  data.ingredients[6].oil = true;
  delete data.ingredients[6].kind;
  const once = normalizeData(structuredClone(data));
  assert.deepEqual(normalizeData(structuredClone(once)), once);
  assert.equal(isAdditive(once.ingredients[6]), true);
});

test('rocznik z kurami i kogutami razem: 8 kur i 2 koguty, ubył 1 kogut', () => {
  const {data} = fixture();
  const cohort = record({name:'Zakup 2026', dateKind:'purchase', date:'2026-05-01', weeks:16, hens:8, roosters:2, mark:'', notes:'', rearing:null});
  data.cohorts.push(cohort);
  data.cohortChanges.push(record({cohortId:cohort.id, type:'loss', sex:'roosters', date:'2026-10-01', count:1, notes:'ubój', order:1}));
  assert.deepEqual(cohortCounts(cohort, data.cohortChanges, today), {hens:8, roosters:1, young:0});
  assert.equal(flockCount(data.cohorts, data.cohortChanges, today).total, 9);
  const body = flockView(ctxOf(data)).body;
  assert.match(body, /W kurniku[\s\S]*9<span class="unit">szt\.[\s\S]*<b>8<\/b> kur[\s\S]*<b>1<\/b> kogut/);
  assert.match(body, /Zakup 2026[\s\S]*8 kur · 1 kogut/);
  assert.doesNotMatch(body, /ptak|Stado/);
  assert.equal(validCohortHistory(cohort, [...data.cohortChanges,
    record({cohortId:cohort.id, type:'loss', sex:'roosters', date:today, count:2})]), false);
});

test('klucie → pisklęta → mieszanka od wybranego dnia → przeniesienie do stada', () => {
  const {data, recipe} = fixture();
  const adults = record({name:'Kury', dateKind:'hatch', date:'2025-01-01', weeks:null, hens:20, roosters:0, mark:'', notes:'', rearing:null});
  const hatch = record({name:'Klucie 2026', dateKind:'hatch', date:null, weeks:null, hens:0, roosters:0, mark:'', notes:'',
    rearing:{method:'incubator', setDate:'2026-04-01', eggs:20, infertile:3, dead:2, hatched:null, chicks:null, feedFrom:null}});
  data.cohorts.push(adults, hatch);
  const inc = incubation(hatch, '2026-04-18');
  assert.equal(inc.day, 18);
  assert.equal(inc.due, '2026-04-22');
  assert.equal(inc.eggsLeft, 15);
  assert.equal(inc.early, true);
  assert.equal(incubation(hatch, '2026-04-10').left, 12);
  assert.match(start(ctxOf(data, '2026-04-10')).body, /Inkubacja: Klucie 2026[\s\S]*12<span class="unit">dni[\s\S]*do klucia · dzień 10 z 21/);
  assert.match(flockView(ctxOf(data, '2026-04-10')).body, /Inkubacja: Klucie 2026[\s\S]*dzień 10 z 21 · 15 jaj/);
  assert.match(cohortView(ctxOf(data, '2026-04-10'), hatch.id).body, /Do klucia[\s\S]*12<span class="unit">dni[\s\S]*3 niezalężone · 2 obumarłe/);
  // Wyklucie 21.04: 12 piskląt. Pisklęta na paszy kupnej nie liczą się do mieszanki.
  Object.assign(hatch, {date:'2026-04-21', rearing:{...hatch.rearing, hatched:12, chicks:12}});
  assert.deepEqual(hatchRate(hatch.rearing), {ofSet:.6, ofFertile:12 / 17});
  let model = feedModel({batches:data.batches, cohorts:data.cohorts, changes:data.cohortChanges, settings:data.settings[0], today:'2026-05-10'});
  assert.equal(model.birds, 20);
  data.cohortChanges.push(record({cohortId:hatch.id, type:'loss', sex:'young', date:'2026-05-01', count:2, notes:'padła', order:1}));
  // Od 15.06 jedzą mieszankę: liczą się do zużycia.
  hatch.rearing.feedFrom = '2026-06-15';
  model = feedModel({batches:data.batches, cohorts:data.cohorts, changes:data.cohortChanges, settings:data.settings[0], today:'2026-06-20'});
  assert.equal(model.birds, 30);
  assert.match(cohortView(ctxOf(data, '2026-06-20'), hatch.id).body, /10<span class="unit">szt\.[\s\S]*<b>8<\/b> tyg\.[\s\S]*mieszanka od <b>15\.06<\/b>[\s\S]*12 z 20 jaj \(60%\)/);
  // Przeniesienie 20.08: 6 kur i 4 koguty.
  Object.assign(hatch, {joined:'2026-08-20', hens:6, roosters:4});
  assert.equal(validCohortHistory(hatch, data.cohortChanges), true);
  assert.deepEqual(cohortCounts(hatch, data.cohortChanges, '2026-08-19'), {hens:0, roosters:0, young:10});
  assert.deepEqual(cohortCounts(hatch, data.cohortChanges, '2026-08-20'), {hens:6, roosters:4, young:0});
  assert.equal(flockCount(data.cohorts, data.cohortChanges, '2026-08-25').total, 30);
  assert.equal(derive(data, '2026-08-25').rearing.length, 0);
  const body = cohortView(ctxOf(data, '2026-08-25'), hatch.id).body;
  assert.match(body, /W roczniku[\s\S]*10<span class="unit">szt\.[\s\S]*<b>6<\/b> kur[\s\S]*<b>4<\/b> koguty[\s\S]*w kurniku od 20\.08 · 12 z 20 jaj/);
  const restored = decodeBackup(encodeBackup(data, today));
  assert.deepEqual(restored.cohorts, data.cohorts);
  assert.equal(JSON.parse(encodeBackup(data, today)).version, 5);
  void recipe;
});
