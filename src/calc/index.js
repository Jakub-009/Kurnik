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
  if (unit === 'l' && !(density > 0)) throw new RangeError('Podaj gęstość składnika w kg/l.');
  const grams = Math.round(unit === 'l' ? amount * density : amount);
  if (!Number.isSafeInteger(grams) || grams < 1) throw new RangeError('Ilość musi odpowiadać co najmniej 1 g.');
  return grams;
}

export function isMixingOil(ingredient) {
  return ingredient.unit === 'l' && (ingredient.oil ?? /^olej(?:\s|$)/iu.test(ingredient.name.trim()));
}

export function recipeBaseItems(recipe, ingredients) {
  return recipe.items.filter(item => {
    const ingredient = ingredients.find(row => row.id === item.ingredientId);
    return !ingredient || !isMixingOil(ingredient);
  });
}

export const batchOil = batch => batch.items.find(item => item.oil);
export const batchBaseMass = batch => batch.mass - (batchOil(batch)?.grams ?? 0);

export function recipeComposition(recipe, ingredients) {
  const items = recipeBaseItems(recipe,ingredients).map(({ingredientId, amount}) => {
    const ingredient = ingredients.find(row => row.id === ingredientId);
    if (!ingredient) throw new RangeError('Brakuje składnika receptury.');
    return {ingredientId, amount, name: ingredient.name, unit: ingredient.unit,
      density: ingredient.density, price: ingredient.price,
      grams: ingredientMass(amount, ingredient.unit, ingredient.density)};
  });
  const mass = items.reduce((sum, item) => sum + item.grams, 0);
  if (!recipe.items.length || !Number.isSafeInteger(mass)) throw new RangeError('Receptura musi zawierać składniki.');
  return {mass, items: items.map(item => ({...item, share: item.grams / mass}))};
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

export function mixtureCost(items) {
  const priced = items.filter(item => item.price);
  if (!priced.length) return {kind: 'none'};
  if (priced.length !== items.length) return {kind: 'partial'};
  const cents = items.reduce((sum, item) => sum + item.grams * item.price.cents / item.price.grams, 0);
  const grams = items.reduce((sum, item) => sum + item.grams, 0);
  return {kind: 'full', cents, perKg: cents / grams * 1000};
}

export function savings(grams, readyPrice, ownPrice) {
  return grams / 1000 * (readyPrice - ownPrice);
}

export function batchResult(batch) {
  const days = batch.end ? daysBetween(batch.start, batch.end) : 0;
  const consumed = batch.mass - (batch.remaining ?? 0);
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
  const recent = batches.filter(row => !row.deleted && row.end && row.end <= today && row.end > row.start)
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
  return Math.max(0, batch.mass - daily * Math.max(0, daysBetween(batch.start, today)));
}

export function supplyForecast(grams, share, daily, mixedGrams, today) {
  if (!share || !daily) return null;
  const days = Math.max(0, (grams + share * mixedGrams) / (daily * share));
  return {days, date: addDays(today, Math.min(Math.round(days), daysBetween(today, '9999-12-31')))};
}

const originsByDate = {purchase:'purchase',hatch:'rearing',initial:'initial'};
export const cohortOrigin = cohort => cohort.origin ?? originsByDate[cohort.dateKind];
export const flockEventKind = event => event.type ?? 'correction';

export function cohortEvents(cohort, changes, date = '9999-12-31') {
  return changes.filter(row => !row.deleted && row.cohortId === cohort.id && row.date <= date)
    .sort((a,b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0) ||
      a.createdAt.localeCompare(b.createdAt) || b.id.localeCompare(a.id));
}

export function cohortState(cohort, changes, date) {
  const result = {count:0,status:null,layingSince:null,retiredSince:null};
  if (date < cohort.date) return result;
  result.count = cohort.count;
  result.status = cohort.status ?? null;
  result.layingSince = cohort.layingSince ?? null;
  for (const event of cohortEvents(cohort,changes,date)) {
    switch (flockEventKind(event)) {
      case 'add': result.count += event.count; break;
      case 'loss': result.count -= event.count; break;
      case 'correction': result.count = event.count; break;
      case 'status':
        result.status = event.status;
        if (event.status === 'laying') result.layingSince = event.date;
        if (event.status === 'retired') result.retiredSince = event.date;
        break;
    }
  }
  return result;
}

export function validCohortHistory(cohort, changes) {
  let count = cohort.count;
  let status = cohort.status ?? null;
  const nextStatus = {young:'laying',laying:'retired'};
  for (const event of cohortEvents(cohort,changes)) {
    if (event.date < cohort.date) return false;
    switch (flockEventKind(event)) {
      case 'add': count += event.count; break;
      case 'loss': count -= event.count; break;
      case 'correction': count = event.count; break;
      case 'status':
        if (cohort.category !== 'hens' || (status && event.status !== nextStatus[status])) return false;
        status = event.status;
        break;
    }
    if (count < 0 || count > 1000000) return false;
  }
  return true;
}

export function cohortCount(cohort, changes, date) {
  return cohortState(cohort,changes,date).count;
}

export function flockCount(cohorts, changes, date) {
  const totals = {hens:0,roosters:0,young:0,laying:0,retired:0,unknown:0};
  for (const cohort of cohorts) {
    if (cohort.deleted) continue;
    const {count,status} = cohortState(cohort,changes,date);
    totals[cohort.category] += count;
    if (cohort.category === 'hens') totals[status ?? 'unknown'] += count;
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
