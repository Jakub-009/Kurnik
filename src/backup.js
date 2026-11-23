import {stores, live, refreshPrices} from './db.js';
import {flockEventKind,recipeComposition,validCohortHistory} from './calc/index.js';
import {validDate} from '../ui/components.js';

const format = 'kurnik-backup';
const version = 2;
const text = (value, max = 1000) => typeof value === 'string' && value.length <= max;
const name = value => text(value,80) && value.trim().length > 0;
const int = (value,min = 0,max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const decimal = (value,min,max) => Number.isFinite(value) && value >= min && value <= max;
const id = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const date = value => typeof value === 'string' && validDate(value);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const price = value => value === null || (value && int(value.cents,1) && int(value.grams,1));
const units = row => row.unit === 'kg' ? row.density === null : row.unit === 'l' && decimal(row.density,.001,100);
const optionalDate = value => value === null || date(value);
const own = (map,key) => Object.hasOwn(map,key);

function requireThat(condition) {
  if (!condition) throw new Error('Kopia zawiera nieprawidłowe lub niespójne dane Kurnika.');
}

function uniqueKeys(rows,key) {
  return new Set(rows.map(row => row[key])).size === rows.length;
}

export function encodeBackup(data, today) {
  const saved = structuredClone(data);
  saved.settings[0].lastExport = today;
  return JSON.stringify({format,version,exportedAt:today,data:saved},null,2);
}

export function decodeBackup(raw) {
  let source;
  try { source = JSON.parse(raw); }
  catch { throw new Error('Plik nie jest poprawnym JSON-em. Wybierz kopię Kurnika.'); }
  if (source?.format !== format || ![1,version].includes(source.version) || !source.data || !date(source.exportedAt)) {
    throw new Error('Format lub wersja kopii nie jest obsługiwana.');
  }
  const data = Object.fromEntries(stores.map(key => [key,source.data[key]]));
  for (const key of stores) {
    requireThat(own(source.data,key) && Array.isArray(data[key]) && data[key].every(row =>
      row && id(row.id) && timestamp(row.createdAt) && typeof row.deleted === 'boolean') && uniqueKeys(data[key],'id'));
  }
  const ingredientIds = new Set(data.ingredients.map(row => row.id));
  const recipeIds = new Set(data.recipes.map(row => row.id));
  const batchIds = new Set(data.batches.map(row => row.id));
  const activeIngredients = new Set(live(data.ingredients).map(row => row.id));
  const activeBatches = new Set(live(data.batches).map(row => row.id));
  const cohorts = new Map(data.cohorts.map(row => [row.id,row]));
  requireThat(data.ingredients.every(row => name(row.name) && units(row) && price(row.price)));
  for (const recipe of data.recipes) {
    requireThat(name(recipe.name) && text(recipe.notes) && typeof recipe.current === 'boolean' &&
      Array.isArray(recipe.items) && recipe.items.length > 0 && recipe.items.every(row =>
        row && ingredientIds.has(row.ingredientId) && int(row.amount,1)) && uniqueKeys(recipe.items,'ingredientId'));
    if (!recipe.deleted) {
      requireThat(recipe.items.every(row => activeIngredients.has(row.ingredientId)));
      recipeComposition(recipe,data.ingredients);
    }
  }
  const activeRecipes = live(data.recipes);
  requireThat(activeRecipes.filter(row => row.current).length === Number(activeRecipes.length > 0));

  for (const batch of data.batches) {
    requireThat(recipeIds.has(batch.recipeId) && name(batch.recipeName) && date(batch.date) &&
      date(batch.start) && batch.start >= batch.date && batch.start < '9999-12-31' && optionalDate(batch.end) &&
      (batch.end ? batch.end > batch.start && int(batch.remaining,0,batch.mass) : batch.remaining === null) &&
      int(batch.mass,1) && Array.isArray(batch.items) && batch.items.length > 0 &&
      batch.items.every(row => row && ingredientIds.has(row.ingredientId) && name(row.name) && units(row) &&
        int(row.grams,1) && price(row.price)) && uniqueKeys(batch.items,'ingredientId') &&
      batch.items.reduce((sum,row) => sum + row.grams,0) === batch.mass);
  }
  const batchEvents = new Map();
  for (const event of data.ingredientEvents) {
    requireThat(ingredientIds.has(event.ingredientId) && date(event.date) && int(event.grams,-Number.MAX_SAFE_INTEGER) &&
      text(event.notes) && price(event.price) && (event.deleted || activeIngredients.has(event.ingredientId)));
    if (event.type === 'batch') {
      requireThat(batchIds.has(event.batchId) && event.grams < 0 && event.price === null);
      if (!event.deleted) {
        requireThat(activeBatches.has(event.batchId));
        if (!batchEvents.has(event.batchId)) batchEvents.set(event.batchId,[]);
        batchEvents.get(event.batchId).push(event);
      }
    } else {
      requireThat(event.batchId === null);
      if (event.type === 'purchase') requireThat(event.grams > 0 && ['per-kg','per-litre','total'].includes(event.priceMode));
      else if (event.type === 'addition') requireThat(event.grams > 0 && event.price === null);
      else if (event.type === 'withdrawal') requireThat(event.grams < 0 && event.price === null);
      else requireThat(event.type === 'correction' && event.price === null && int(event.measured,0));
    }
  }
  for (const batch of live(data.batches)) {
    const rows = batchEvents.get(batch.id) ?? [];
    requireThat(rows.length === batch.items.length && rows.every(row => row.date === batch.date) &&
      batch.items.every(item => rows.some(row => row.ingredientId === item.ingredientId && row.grams === -item.grams)));
  }
  for (const cohort of data.cohorts) {
    requireThat(name(cohort.name) && ['hens','roosters'].includes(cohort.category) && date(cohort.date) &&
      ['hatch','purchase','initial'].includes(cohort.dateKind) && (cohort.weeks === null ||
        (cohort.dateKind === 'purchase' && int(cohort.weeks,0,5200))) &&
      int(cohort.count,0,1000000) && text(cohort.mark,80) && text(cohort.notes));
    requireThat(cohort.origin === undefined || cohort.origin === 'initial' ||
      (cohort.origin === 'purchase' && cohort.dateKind === 'purchase') ||
      (cohort.origin === 'rearing' && cohort.dateKind === 'hatch'));
    requireThat(cohort.status == null || (cohort.category === 'hens' && ['young','laying','retired'].includes(cohort.status)));
    requireThat(cohort.expectedStart == null || (cohort.category === 'hens' && date(cohort.expectedStart)));
    requireThat(cohort.layingSince == null || (['laying','retired'].includes(cohort.status) && date(cohort.layingSince)));
  }
  for (const change of data.cohortChanges) {
    const cohort = cohorts.get(change.cohortId);
    requireThat(cohort && date(change.date) && (change.deleted || (!cohort.deleted && change.date >= cohort.date)) && text(change.notes));
    requireThat(change.order === undefined || int(change.order,1));
    const kind = flockEventKind(change);
    if (kind === 'status') requireThat(['young','laying','retired'].includes(change.status));
    else if (kind === 'add') requireThat(int(change.count,1,1000000) && ['purchase','rearing'].includes(change.origin));
    else if (kind === 'loss') requireThat(int(change.count,1,1000000) && ['died','culled','slaughter'].includes(change.reason));
    else requireThat(kind === 'correction' && int(change.count,0,1000000));
  }
  requireThat(live(data.cohorts).every(cohort => validCohortHistory(cohort,data.cohortChanges)));
  const settings = data.settings[0];
  requireThat(data.settings.length === 1 && !settings.deleted && int(settings.revision) &&
    int(settings.threshold,1,3650) && int(settings.defaultDaily,1,10000000000) &&
    (settings.readyPrice === null || int(settings.readyPrice,1,10000000000)) && optionalDate(settings.lastExport));
  refreshPrices(data);
  return data;
}
