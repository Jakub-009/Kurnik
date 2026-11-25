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

// Ilość w tysięcznych jednostki (g albo ml) zamieniona na gramy.
export function ingredientMass(amount, unit, density) {
  if (unit === 'l' && !(density > 0)) throw new RangeError(t.densityMissing);
  const grams = Math.round(unit === 'l' ? amount * density : amount);
  if (!Number.isSafeInteger(grams) || grams < 1) throw new RangeError(t.tooLittle);
  return grams;
}

// Dodatek = składnik poza proporcjami. Stare dane: olej w litrach (pole oil albo nazwa „Olej…”).
export function isAdditive(ingredient) {
  if (ingredient.kind !== undefined) return ingredient.kind === 'additive';
  return ingredient.unit === 'l' && (ingredient.oil ?? /^olej(?:\s|$)/iu.test(ingredient.name.trim()));
}

// Cena do liczenia kosztu: kupowany – ostatnia cena zakupu; własny – wpisana wartość albo 0 zł.
export const isOwn = ingredient => ingredient?.origin === 'own';
export function costPrice(ingredient) {
  if (!ingredient) return null;
  return isOwn(ingredient) ? ingredient.ownPrice ?? {cents:0, grams:1000} : ingredient.price ?? null;
}

export function recipeBaseItems(recipe, ingredients) {
  return recipe.items.filter(item => {
    const ingredient = ingredients.find(row => row.id === item.ingredientId);
    return !ingredient || !isAdditive(ingredient);
  });
}

// Masa i udziały tylko ze składników liczonych w proporcjach.
// Dodatki dostają dawkę: gramy dodatku na 1 g mieszanki bez dodatków.
export function recipeComposition(recipe, ingredients) {
  const positions = recipe.items.map(({ingredientId, amount}, position) => {
    const ingredient = ingredients.find(row => row.id === ingredientId);
    if (!ingredient) throw new RangeError(t.ingredientMissing);
    return {ingredientId, amount, position, name: ingredient.name, unit: ingredient.unit,
      density: ingredient.density, price: costPrice(ingredient), free: isOwn(ingredient) && !ingredient.ownPrice,
      additive: isAdditive(ingredient),
      grams: ingredientMass(amount, ingredient.unit, ingredient.density)};
  });
  const base = positions.filter(item => !item.additive);
  const mass = base.reduce((sum, item) => sum + item.grams, 0);
  if (!base.length || !Number.isSafeInteger(mass)) throw new RangeError(t.recipeNeedsBase);
  return {
    mass,
    items: base.map(item => ({...item, share: item.grams / mass})),
    additives: positions.filter(item => item.additive).map(item => ({...item, share: item.grams / mass}))
  };
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

// Dawka dodatku przeliczona na masę mieszanki; litry zapisywane w ml.
export function scaleAdditive(additive, baseMass, targetMass) {
  const amount = Math.round(additive.amount * targetMass / baseMass);
  if (additive.unit === 'l') {
    return {...additive, millilitres: amount, grams: Math.round(amount * additive.density)};
  }
  return {...additive, grams: amount};
}

// Pełna lista do mieszania w kolejności receptury: składniki i dodatki.
export function scaleBatch(composition, grams) {
  const items = [...scaleRecipe(composition, grams),
    ...composition.additives.map(item => scaleAdditive(item, composition.mass, grams))];
  return items.sort((a, b) => a.position - b.position);
}

export const batchAdditives = batch => (batch.items ?? []).filter(item => item.additive || item.oil);
export const batchOil = batch => (batch.items ?? []).find(item => item.oil);
export const batchBaseMass = batch => batch.massBasis === 'base'
  ? batch.mass : batch.mass - batchAdditives(batch).reduce((sum, item) => sum + item.grams, 0);
// Udział mieszanki bez dodatków w zapisanej masie partii (stare partie liczyły olej w masie).
export const baseShare = batch => batchBaseMass(batch) / batch.mass;

export function lastBatchMass(batches, fallback = 100000) {
  const last = batches.filter(row => !row.deleted)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
  return last ? batchBaseMass(last) : fallback;
}

// Koszt liczony na kilogram mieszanki bez dodatków (dodatki wchodzą do kosztu, nie do masy).
export function mixtureCost(items) {
  const priced = items.filter(item => item.price);
  if (!priced.length) return {kind: 'none'};
  if (priced.length !== items.length) return {kind: 'partial'};
  const cents = items.reduce((sum, item) => sum + item.grams * item.price.cents / item.price.grams, 0);
  const grams = items.filter(item => !item.additive && !item.oil).reduce((sum, item) => sum + item.grams, 0);
  return {kind: 'full', cents, perKg: cents / grams * 1000};
}

export function savings(grams, readyPrice, ownPrice) {
  return grams / 1000 * (readyPrice - ownPrice);
}

export function batchResult(batch) {
  const days = batch.end ? daysBetween(batch.start, batch.end) : 0;
  const consumed = (batch.mass - (batch.remaining ?? 0)) * baseShare(batch);
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

const finishedBatches = (batches, today) => batches
  .filter(row => !row.deleted && row.end && row.end <= today && row.end > row.start)
  .sort((a, b) => b.end.localeCompare(a.end) || b.createdAt.localeCompare(a.createdAt));

// Średnie zużycie mieszanki bez dodatków z 3 ostatnich zakończonych partii.
export function dailyAverage(batches, fallback, today) {
  const recent = finishedBatches(batches, today).slice(0, 3);
  const days = unionDays(recent);
  const consumed = recent.reduce((sum, row) => sum + batchResult(row).consumed, 0);
  return days > 0 ? consumed / days : fallback;
}

// Do wykresu: najwyżej 12 ostatnich zakończonych partii, od najstarszej.
export function dailyHistory(batches, today, limit = 12) {
  return finishedBatches(batches, today).slice(0, limit).reverse()
    .map(batch => ({id: batch.id, end: batch.end, daily: batchResult(batch).daily}));
}

export function stock(events, ingredientId, excludeId) {
  return events.reduce((sum, row) =>
    !row.deleted && row.ingredientId === ingredientId && row.id !== excludeId ? sum + row.grams : sum, 0);
}

export function remainingMix(batch, daily, today) {
  return Math.max(0, batch.mass - daily * Math.max(0, daysBetween(batch.start, today)));
}

// rate = udział składnika albo dawka dodatku na 1 g mieszanki bez dodatków.
export function supplyForecast(grams, rate, daily, mixedGrams, today) {
  if (!rate || !daily) return null;
  const days = Math.max(0, (grams + rate * mixedGrams) / (daily * rate));
  return {days, date: addDays(today, Math.min(Math.round(days), daysBetween(today, '9999-12-31')))};
}

// Ile dokupić na podaną liczbę dni. Zero, gdy zapas wystarczy.
export function purchaseNeed(grams, rate, daily, mixedGrams, days) {
  return Math.max(0, daily * rate * days - (grams + rate * mixedGrams));
}

// Zaokrąglenie w górę: do pełnych kg albo do 0,1 l.
export function roundPurchase(grams, unit, density) {
  if (grams <= 0) return 0;
  if (unit === 'l') return Math.ceil(Math.round(grams / density / 100 * 1e6) / 1e6) / 10;
  return Math.ceil(Math.round(grams / 1000 * 1e6) / 1e6);
}

// ===== Stado =====
// Rocznik ma osobno kury i koguty (`hens`, `roosters`). Klucie i pisklęta to ten sam rocznik na wcześniejszym etapie:
// `rearing` = {method, setDate, eggs, infertile, dead, hatched, chicks, feedFrom}. Do głównego stada wchodzi w dniu `joined`.
// Zmiany liczby mają `sex`: 'hens', 'roosters' albo 'young' (pisklęta). Stare zdarzenia bez typu to korekty.
export const flockEventKind = event => event.type ?? 'correction';
export const HATCH_DAYS = 21;
export const HATCH_EARLY = 18;

export function cohortStage(cohort) {
  if (!cohort.rearing || cohort.joined) return 'flock';
  return cohort.rearing.chicks == null ? 'incubation' : 'chicks';
}

// Dzień, od którego ptaki liczą się w głównym stadzie.
export const flockStart = cohort => cohort.joined ?? cohort.date;

export function cohortEvents(cohort, changes, date = '9999-12-31') {
  return changes.filter(row => !row.deleted && row.cohortId === cohort.id && row.date <= date &&
    flockEventKind(row) !== 'status')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0) ||
      a.createdAt.localeCompare(b.createdAt) || b.id.localeCompare(a.id));
}

function applyEvent(counts, event) {
  const sex = event.sex ?? 'hens';
  switch (flockEventKind(event)) {
    case 'add': counts[sex] += event.count; break;
    case 'loss': counts[sex] -= event.count; break;
    case 'correction': counts[sex] = event.count; break;
  }
  return counts;
}

// Liczby w danym dniu: kury i koguty w głównym stadzie oraz pisklęta przed przeniesieniem.
export function cohortCounts(cohort, changes, date) {
  const counts = {hens:0, roosters:0, young:0};
  const events = cohortEvents(cohort, changes, date);
  const start = flockStart(cohort);
  if (cohortStage(cohort) === 'flock' && start && date >= start) {
    counts.hens = cohort.hens;
    counts.roosters = cohort.roosters;
    for (const event of events) if (event.sex !== 'young' && event.date >= start) applyEvent(counts, event);
  }
  const rearing = cohort.rearing;
  if (rearing?.chicks != null && cohort.date && date >= cohort.date && !(cohort.joined && date >= cohort.joined)) {
    counts.young = rearing.chicks;
    for (const event of events) if (event.sex === 'young') applyEvent(counts, event);
  }
  return counts;
}

export const cohortCount = (cohort, changes, date) => {
  const counts = cohortCounts(cohort, changes, date);
  return counts.hens + counts.roosters + counts.young;
};

// Żadna z liczb nie może spaść poniżej zera ani przekroczyć limitu.
export function validCohortHistory(cohort, changes, max = 1000000) {
  const counts = {hens:cohort.hens ?? 0, roosters:cohort.roosters ?? 0, young:cohort.rearing?.chicks ?? 0};
  const start = flockStart(cohort);
  for (const event of cohortEvents(cohort, changes)) {
    if (cohort.date && event.date < cohort.date) return false;
    if (event.sex !== 'young' && start && event.date < start) return false;
    if (event.sex === 'young' && cohort.joined && event.date >= cohort.joined) return false;
    applyEvent(counts, event);
    if (Object.values(counts).some(value => value < 0 || value > max)) return false;
  }
  return true;
}

export function flockCount(cohorts, changes, date) {
  const totals = {hens:0, roosters:0, young:0};
  for (const cohort of cohorts) {
    if (cohort.deleted) continue;
    const counts = cohortCounts(cohort, changes, date);
    totals.hens += counts.hens;
    totals.roosters += counts.roosters;
    totals.young += counts.young;
  }
  return {...totals, total:totals.hens + totals.roosters};
}

// Ptaki jedzące mieszankę w danym dniu: główne stado i pisklęta od dnia przejścia na mieszankę.
export function feedingBirds(cohorts, changes, date) {
  let total = 0;
  for (const cohort of cohorts) {
    if (cohort.deleted) continue;
    const counts = cohortCounts(cohort, changes, date);
    total += counts.hens + counts.roosters;
    if (cohort.rearing?.feedFrom && date >= cohort.rearing.feedFrom) total += counts.young;
  }
  return total;
}

export function averageFlock(cohorts, changes, start, end) {
  const counter = birdCounter(cohorts, changes);
  if (!counter) return null;
  const duration = daysBetween(start, end);
  if (!(duration > 0)) return counter(start);
  return birdDays(counter, dayNumber(start), dayNumber(end)) / duration;
}

// Klucie: dzień wysiadywania (1 = dzień wstawienia) i przewidywana data.
export function incubation(cohort, today) {
  const {setDate, eggs, infertile, dead} = cohort.rearing;
  const day = Math.floor(daysBetween(setDate, today)) + 1;
  return {day, due:addDays(setDate, HATCH_DAYS), left:HATCH_DAYS - day + 1,
    eggsLeft:eggs - (infertile ?? 0) - (dead ?? 0), early:day >= HATCH_EARLY};
}

// Wylęgowość: wyklute z wstawionych i z zalężonych.
export function hatchRate(rearing) {
  if (rearing?.hatched == null || !rearing.eggs) return null;
  const fertile = rearing.eggs - (rearing.infertile ?? 0);
  return {ofSet:rearing.hatched / rearing.eggs, ofFertile:fertile > 0 ? rearing.hatched / fertile : null};
}

export const weeksOld = (cohort, today) => Math.max(0, Math.floor(daysBetween(cohort.date, today) / 7));

// ===== Model zużycia =====
// Czas liczony w dniach (liczba zmiennoprzecinkowa). Dziś liczy się jako pół dnia,
// bo pasza jest sypana rano i po południu.
export const dayNumber = date => Date.parse(date) / DAY;
export const dateOf = number => new Date(Math.floor(number + 1e-9) * DAY).toISOString().slice(0, 10);
export const nowPoint = today => dayNumber(today) + .5;
export const defaultPerBird = 120;

// Liczba ptaków jedzących mieszankę w danym dniu. Dni przed pierwszym rocznikiem w stadzie dostają liczbę stada
// z dnia, w którym zaczyna się pierwszy rocznik, żeby rocznik wpisany z późniejszą datą nie zerował wcześniejszych partii.
export function birdCounter(cohorts, changes) {
  const live = cohorts.filter(row => !row.deleted);
  const starts = live.filter(row => cohortStage(row) === 'flock' && flockStart(row)).map(flockStart).sort();
  if (!starts.length && !live.some(row => row.rearing?.feedFrom)) return null;
  const first = starts[0];
  const cache = new Map();
  return date => {
    if (!cache.has(date)) {
      const flock = flockCount(live, changes, first && date < first ? first : date).total;
      cache.set(date, feedingBirds(live, changes, date) - flockCount(live, changes, date).total + flock);
    }
    return cache.get(date);
  };
}

// Ptakodni między dwoma punktami czasu.
function birdDays(birds, from, to) {
  let total = 0;
  for (let day = Math.floor(from); day < to; day++) {
    const overlap = Math.min(to, day + 1) - Math.max(from, day);
    if (overlap > 0) total += overlap * birds(dateOf(day));
  }
  return total;
}

function union(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [from, to] of sorted) {
    const last = merged.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

// Zużycie: gramy na ptaka z 3 ostatnich zakończonych partii, a bez stada — kg dziennie jak dawniej.
// use(from, to) zwraca gramy mieszanki (bez dodatków) zjedzone w tym czasie.
export function feedModel({batches, cohorts, changes, settings, today}) {
  const birds = birdCounter(cohorts, changes);
  const recent = finishedBatches(batches, addDays(today, 1)).slice(0, 3);
  if (!birds) {
    const daily = dailyAverage(batches, settings.defaultDaily, addDays(today, 1));
    return {perBird:null, birds:null, daily, fromHistory:recent.length > 0, use:(from, to) => Math.max(0, to - from) * daily};
  }
  const consumed = recent.reduce((sum, row) => sum + batchResult(row).consumed, 0);
  const days = union(recent.map(row => [dayNumber(row.start), dayNumber(row.end)]))
    .reduce((sum, [from, to]) => sum + birdDays(birds, from, to), 0);
  const fromHistory = days > 0;
  const perBird = fromHistory ? consumed / days : settings.defaultPerBird ?? defaultPerBird;
  const count = birds(today);
  return {perBird, birds:count, daily:perBird * count, fromHistory,
    use:(from, to) => from < to ? perBird * birdDays(birds, from, to) : 0};
}

// Kiedy skończy się `mass` gramów, jedzonych od punktu `from`. Szukanie po dniach (najwyżej 20 lat).
export function exhaustPoint(model, from, mass) {
  if (mass <= 0) return from;
  let point = from;
  let left = mass;
  for (let i = 0; i < 7300; i++) {
    const next = Math.floor(point) + 1;
    const use = model.use(point, next);
    if (use >= left) return point + (next - point) * left / use;
    left -= use;
    point = next;
  }
  return Infinity;
}

// Wiek w pełnych miesiącach. Zakup bez podanego wieku i stary „stan początkowy” = „co najmniej”.
export function cohortAge(cohort, today) {
  if (!cohort.date) return null;
  const bought = cohort.dateKind !== 'hatch';
  const minimum = bought && cohort.weeks == null;
  const from = bought ? addDays(cohort.date, -(cohort.weeks ?? 0) * 7) : cohort.date;
  const [year, month, day] = from.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  const months = (currentYear - year) * 12 + currentMonth - month - Number(currentDay < day);
  return {months: Math.max(0, months), minimum};
}
