import {live, record} from './db.js';
import {averageFlock, batchResult, dailyAverage, daysBetween, flockCount,
  mixtureCost, recipeComposition, remainingMix, stock, supplyForecast} from './calc/index.js';

export const latestFirst = (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
export const recipeOrder = (a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, 'pl');
export const find = (data, name, id) => data[name].find(row => row.id === id && !row.deleted);
export const remove = (data, name, id) => { find(data, name, id).deleted = true; };

export function setCurrent(data, id) {
  for (const recipe of live(data.recipes)) recipe.current = recipe.id === id;
}

export function removeRecipe(data, id) {
  const wasCurrent = find(data, 'recipes', id).current;
  remove(data, 'recipes', id);
  if (wasCurrent && live(data.recipes).length) setCurrent(data, live(data.recipes).sort(recipeOrder)[0].id);
}

export function put(data, name, old, values) {
  if (old) {
    const row = find(data, name, old.id);
    Object.assign(row, values);
    return row;
  }
  const row = record(values);
  data[name].push(row);
  return row;
}

export function putBatch(data, old, values) {
  const batch = put(data, 'batches', old, values);
  for (const event of live(data.ingredientEvents)) {
    if (event.batchId === batch.id) event.deleted = true;
  }
  for (const item of batch.items) {
    data.ingredientEvents.push(record({ingredientId:item.ingredientId, type:'batch', date:batch.date,
      grams:-item.grams, price:null, batchId:batch.id, notes:''}));
  }
  return batch;
}

export function removeBatch(data, id) {
  remove(data, 'batches', id);
  for (const event of live(data.ingredientEvents)) {
    if (event.batchId === id) event.deleted = true;
  }
}

export function showAmount(grams, ingredient) {
  return grams / 1000 / (ingredient.unit === 'l' ? ingredient.density : 1);
}

export function derive(data, today) {
  const settings = data.settings[0];
  const ingredients = live(data.ingredients);
  const recipes = live(data.recipes).sort(recipeOrder);
  const batches = live(data.batches).sort(latestFirst);
  const current = recipes.find(row => row.current);
  const composition = current ? recipeComposition(current, ingredients) : null;
  const daily = dailyAverage(batches, settings.defaultDaily, today);
  const open = batches.filter(row => row.start <= today && (!row.end || row.end > today))
    .sort((a,b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt));
  let usedUntil = '';
  const openStatus = open.map(batch => {
    const available = usedUntil > batch.start ? usedUntil : batch.start;
    const elapsed = Math.max(0,daysBetween(available,today));
    const remaining = remainingMix({...batch,start:available},daily,today);
    const used = batch.mass - remaining;
    if (daily > 0) usedUntil = new Date(Date.parse(available) + used / daily * 86400000).toISOString();
    return {batch, elapsed, used, remaining};
  });
  const active = openStatus.find(row => row.remaining > 0) ?? openStatus.at(-1);
  const mixed = openStatus.reduce((sum, row) => sum + row.remaining, 0);
  const received = new Set(live(data.ingredientEvents)
    .filter(row => ['addition','purchase','correction'].includes(row.type)).map(row => row.ingredientId));
  const stocks = ingredients.map(ingredient => {
    const grams = stock(data.ingredientEvents,ingredient.id);
    const known = received.has(ingredient.id);
    const share = composition?.items.find(item => item.ingredientId === ingredient.id)?.share;
    const outlook = known ? supplyForecast(grams,share,daily,mixed,today) : null;
    return {ingredient,grams,known,outlook};
  }).sort((a,b) => (a.outlook?.days ?? Infinity) - (b.outlook?.days ?? Infinity) ||
    Number(b.known) - Number(a.known) || a.ingredient.name.localeCompare(b.ingredient.name,'pl'));
  const flock = flockCount(data.cohorts, data.cohortChanges, today);
  return {settings, ingredients, recipes, batches, current, composition, daily, active, openStatus, mixed, stocks, flock};
}

export function batchStats(batch, data, derived, today) {
  const finished = batch.end && batch.end <= today;
  const open = derived.openStatus.find(row => row.batch.id === batch.id);
  const age = open?.elapsed ?? 0;
  const result = finished ? batchResult(batch) : {
    days: age, consumed: open?.used ?? 0, daily: age > 0 ? (open?.used ?? 0) / age : null
  };
  const birds = result.daily == null ? 0 : averageFlock(data.cohorts, data.cohortChanges,
    batch.start, finished ? batch.end : today);
  return {...result, finished, birds, cost:mixtureCost(batch.items), remaining:finished ? batch.remaining : open?.remaining};
}
