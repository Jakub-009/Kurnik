import {isAdditive} from './calc/index.js';
import {t} from '../ui/texts.js';

// Ujednolica dane z wersji 1.0–1.5 w pamięci. Nie zmienia liczb, dat, partii ani ruchów magazynowych.
// Wywoływane po wczytaniu bazy i po imporcie kopii. Można wywołać wielokrotnie.
export function normalizeData(data) {
  for (const ingredient of data.ingredients) {
    if (ingredient.kind === undefined) ingredient.kind = isAdditive(ingredient) ? 'additive' : 'base';
    delete ingredient.oil;
  }
  for (const change of data.cohortChanges) {
    if (change.notes == null) change.notes = '';
    if (change.notes) continue;
    if (change.type === 'loss' && t.oldLossReasons[change.reason]) change.notes = t.oldLossReasons[change.reason];
    if (change.type === 'add' && t.oldAddOrigins[change.origin]) change.notes = t.oldAddOrigins[change.origin];
  }
  for (const cohort of data.cohorts) {
    if (cohort.notes == null) cohort.notes = '';
    if (cohort.mark == null) cohort.mark = '';
    if (cohort.weeks === undefined) cohort.weeks = null;
  }
  return data;
}
