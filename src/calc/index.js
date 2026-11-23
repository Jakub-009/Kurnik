import {t} from '../../ui/texts.js';

const DAY = 86400000;

export function isoDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function daysBetween(start, end) {
  return (Date.parse(end) - Date.parse(start)) / DAY;
}

export function addDays(date, days) {
  return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
}

export function ingredientMass(amount, unit, density) {
  if (unit === 'l' && !(density > 0)) throw new RangeError(t.densityError);
  const grams = Math.round(unit === 'l' ? amount * density : amount);
  if (!Number.isSafeInteger(grams) || grams < 1) throw new RangeError(t.minimumWeight);
  return grams;
}

export function isAdditive(ingredient) {
  if (ingredient.kind !== undefined) return ingredient.kind === 'additive';
  return ingredient.oil === true || (ingredient.oil !== false && ingredient.unit === 'l' &&
    /^olej(?:\s|$)/iu.test(ingredient.name.trim()));
}

export function recipeBaseItems(recipe, ingredients) {
  const byId = new Map(ingredients.map(ingredient => [ingredient.id,ingredient]));
  return recipe.items.filter(item => !byId.has(item.ingredientId) || !isAdditive(byId.get(item.ingredientId)));
}

export const sumItemMass = items => items.reduce((sum,item) => sum + item.grams,0);
export const nextSavedOrder = batches => batches.reduce((max,batch) => Math.max(max,batch.savedOrder ?? 0),0) + 1;

export const batchAdditives = batch => (batch.items ?? []).filter(item => item.additive || item.oil);
export const batchBaseMass = batch => batch.massBasis === 'base'
  ? batch.mass : batch.mass - batchAdditives(batch).reduce((sum,item) => sum + item.grams,0);

export function batchBaseRemaining(batch) {
  return (batch.remaining ?? 0) * batchBaseMass(batch) / batch.mass;
}

export const batchIsFinished = (batch,today) => Boolean(batch.end && batch.end <= addDays(today,1));

export function recipeComposition(recipe, ingredients) {
  const byId = new Map(ingredients.map(item => [item.id,item]));
  const positions = recipe.items.map(({ingredientId,amount},position) => {
    const ingredient = byId.get(ingredientId);
    if (!ingredient) throw new RangeError(t.ingredientMissing);
    return {ingredientId,amount,position,name:ingredient.name,unit:ingredient.unit,
      density:ingredient.density,price:ingredient.price,additive:isAdditive(ingredient),
      grams:ingredientMass(amount,ingredient.unit,ingredient.density)};
  });
  const items = positions.filter(item => !item.additive);
  const mass = items.reduce((sum,item) => sum + item.grams,0);
  if (!recipe.items.length || !Number.isSafeInteger(mass)) throw new RangeError(t.recipeEmpty);
  return {mass,items:items.map(item => ({...item,share:item.grams / mass})),
    additives:positions.filter(item => item.additive)};
}

export function scaleBatchRecipe(composition, grams) {
  const items = scaleRecipe(composition,grams);
  for (const item of composition.additives) {
    const amount = Math.round(item.amount * grams / composition.mass);
    const mass = Math.round(item.unit === 'l' ? amount * item.density : amount);
    items.push({...item,grams:mass,...(item.unit === 'l' ? {millilitres:amount} : {})});
  }
  return items.sort((a,b) => a.position - b.position);
}

export function lastBatchMass(batches) {
  const last = batches.filter(batch => !batch.deleted)
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || (b.savedOrder ?? 0) - (a.savedOrder ?? 0) ||
      b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  return last ? batchBaseMass(last) : 100000;
}

export function lastStockSource(events, ingredient) {
  if (ingredient.lastSource) return ingredient.lastSource;
  const last = events.filter(event => !event.deleted && event.ingredientId === ingredient.id &&
    ['purchase','addition'].includes(event.type))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date))[0];
  return last?.type ?? 'purchase';
}

export function scaleRecipe(composition, grams) {
  const scaled = composition.items.map((item, index) => {
    const exact = item.share * grams;
    return {...item, index, grams: Math.floor(exact), remainder: exact - Math.floor(exact)};
  });
  const missing = grams - scaled.reduce((sum, item) => sum + item.grams, 0);
  scaled.slice().sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, missing).forEach(item => { item.grams += 1; });
  return scaled.map(({index, remainder, ...item}) => item);
}

export function mixtureCost(items, baseMass) {
  const priced = items.filter(item => item.price);
  if (!priced.length) return {kind: 'none'};
  if (priced.length !== items.length) return {kind: 'partial'};
  const cents = items.reduce((sum, item) => sum + item.grams * item.price.cents / item.price.grams, 0);
  const grams = items.reduce((sum, item) => sum + item.grams, 0);
  return {kind: 'full', cents, perKg: cents / (baseMass ?? grams) * 1000};
}

export function savings(grams, readyPrice, ownPrice) {
  return grams / 1000 * (readyPrice - ownPrice);
}

export function batchResult(batch) {
  const days = batch.end ? daysBetween(batch.start, batch.end) : 0;
  const consumed = batchBaseMass(batch) - batchBaseRemaining(batch);
  return {days, consumed, daily: days > 0 ? consumed / days : null};
}

function unionDays(batches) {
  let total = 0;
  let end = '';
  for (const batch of batches.slice().sort((a, b) => a.start.localeCompare(b.start))) {
    if (batch.end <= end) continue;
    const start = batch.start > end ? batch.start : end;
    total += daysBetween(start, batch.end);
    end = batch.end;
  }
  return total;
}

export function dailyAverage(batches, fallback, today, consumedMass = batch => batchResult(batch).consumed) {
  const recent = batches.filter(row => !row.deleted && batchIsFinished(row,today) && row.end > row.start)
    .sort((a, b) => b.end.localeCompare(a.end) || b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const days = unionDays(recent);
  const consumed = recent.reduce((sum, row) => sum + consumedMass(row), 0);
  return days > 0 ? consumed / days : fallback;
}

export function stock(events, ingredientId, excludeId) {
  return events.reduce((sum, row) =>
    !row.deleted && row.ingredientId === ingredientId && row.id !== excludeId ? sum + row.grams : sum, 0);
}

export function remainingMix(batch, daily, today) {
  return Math.max(0, (batch.items ? batchBaseMass(batch) : batch.mass) - daily * Math.max(0, daysBetween(batch.start, today)));
}

export function openBatchForecast(batches,daily,today) {
  const open = batches.filter(batch => batch.start <= today && !batchIsFinished(batch,today))
    .sort((a,b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt));
  let usedUntil = '';
  return open.map(batch => {
    const available = usedUntil > batch.start ? usedUntil : batch.start;
    const elapsed = Math.max(0,daysBetween(available,today));
    const remaining = remainingMix({...batch,start:available},daily,today);
    const used = batchBaseMass(batch) - remaining;
    if (daily > 0) usedUntil = new Date(Date.parse(available) + used / daily * DAY).toISOString();
    return {batch,elapsed,used,remaining};
  });
}

export function recipeStockRates(composition) {
  if (!composition?.mass) return new Map();
  return new Map([
    ...composition.items.map(item => [item.ingredientId,item.share]),
    ...composition.additives.map(item => [item.ingredientId,item.grams / composition.mass])
  ]);
}

export function supplyForecast(grams, share, daily, mixedGrams, today) {
  if (!share || !daily) return null;
  const days = Math.max(0, (grams + share * mixedGrams) / (daily * share));
  return {days, daily:daily * share, available:grams + share * mixedGrams,
    date:addDays(today,Math.min(Math.round(days),daysBetween(today,'9999-12-31')))};
}

export function buyAmount(outlook, days, ingredient) {
  const needed = outlook.daily * days - outlook.available;
  if (needed <= 0) return 0;
  const step = ingredient.unit === 'l' ? ingredient.density * 100 : 1000;
  return Math.ceil(needed / step - 1e-10) / (ingredient.unit === 'l' ? 10 : 1);
}

export function consumptionHistory(batches,today) {
  return batches.filter(batch => !batch.deleted && batchIsFinished(batch,today) && batch.end > batch.start)
    .sort((a,b) => a.end.localeCompare(b.end) || a.createdAt.localeCompare(b.createdAt))
    .slice(-12).map(batch => ({date:addDays(batch.end,-1),daily:batchResult(batch).daily}));
}

export const displayAmount = (grams,ingredient) =>
  grams / 1000 / (ingredient.unit === 'l' ? ingredient.density : 1);

export function nextFlockEventOrder(events) {
  return events.reduce((max,event) => Math.max(max,event.order ?? 0),0) + 1;
}

export const flockEventKind = event => event.type ?? 'correction';

export function cohortEvents(cohort, changes, date = '9999-12-31') {
  return changes.filter(row => !row.deleted && row.cohortId === cohort.id && row.date <= date)
    .sort((a,b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0) ||
      a.createdAt.localeCompare(b.createdAt) || b.id.localeCompare(a.id));
}

export function cohortCount(cohort, changes, date) {
  if (date < cohort.date) return 0;
  let count = cohort.count;
  for (const event of cohortEvents(cohort,changes,date)) {
    switch (flockEventKind(event)) {
      case 'add': count += event.count; break;
      case 'loss': count -= event.count; break;
      case 'correction': count = event.count; break;
    }
  }
  return count;
}

export function validCohortHistory(cohort, changes) {
  let count = cohort.count;
  for (const event of cohortEvents(cohort,changes)) {
    if (event.date < cohort.date) return false;
    switch (flockEventKind(event)) {
      case 'add': count += event.count; break;
      case 'loss': count -= event.count; break;
      case 'correction': count = event.count; break;
    }
    if (count < 0 || count > 1000000) return false;
  }
  return true;
}

export function flockCount(cohorts, changes, date) {
  const totals = {hens:0,roosters:0};
  for (const cohort of cohorts) {
    if (!cohort.deleted) totals[cohort.category] += cohortCount(cohort,changes,date);
  }
  return {...totals,total:totals.hens + totals.roosters};
}

export function averageFlock(cohorts, changes, start, end) {
  if (!cohorts.some(row => !row.deleted && row.date <= start)) return null;
  const duration = daysBetween(start, end);
  if (!(duration > 0)) return flockCount(cohorts, changes, start).total;
  const dates = [...new Set([start, end, ...cohorts.filter(row => !row.deleted).map(row => row.date),
    ...changes.filter(row => !row.deleted).map(row => row.date)])]
    .filter(date => date >= start && date <= end).sort();
  const birdDays = dates.slice(0, -1).reduce((sum, date, i) =>
    sum + flockCount(cohorts, changes, date).total * daysBetween(date, dates[i + 1]), 0);
  return birdDays / duration;
}

export function cohortAge(cohort, today) {
  const minimum = cohort.dateKind === 'initial' || (cohort.dateKind === 'purchase' && cohort.weeks == null);
  const from = cohort.dateKind === 'purchase' ? addDays(cohort.date, -(cohort.weeks ?? 0) * 7) : cohort.date;
  const [year, month, day] = from.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  const months = (currentYear - year) * 12 + currentMonth - month - Number(currentDay < day);
  return {months: Math.max(0, months), minimum};
}
