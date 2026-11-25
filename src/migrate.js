import {isAdditive} from './calc/index.js';
import {t} from '../ui/texts.js';

// Ujednolica dane z wersji 1.0–1.5 w pamięci. Nie zmienia liczb, dat, partii ani ruchów magazynowych.
// Wywoływane po wczytaniu bazy i po imporcie kopii. Można wywołać wielokrotnie.
export function normalizeData(data) {
  for (const ingredient of data.ingredients) {
    if (ingredient.kind === undefined) ingredient.kind = isAdditive(ingredient) ? 'additive' : 'base';
    // Pochodzenie: przy pierwszym uruchomieniu bierzemy je z ostatniego dodania (Zakup / Własny).
    if (ingredient.origin === undefined) ingredient.origin = ingredient.lastSource === 'addition' ? 'own' : 'bought';
    if (ingredient.ownPrice === undefined) ingredient.ownPrice = null;
    delete ingredient.oil;
  }
  // Stare roczniki miały jedną kategorię i jedną liczbę. Teraz kury i koguty są osobno w jednym roczniku.
  const legacySex = new Map();
  for (const cohort of data.cohorts) {
    if (cohort.hens === undefined) {
      const roosters = cohort.category === 'roosters';
      cohort.hens = roosters ? 0 : cohort.count ?? 0;
      cohort.roosters = roosters ? cohort.count ?? 0 : 0;
      legacySex.set(cohort.id, roosters ? 'roosters' : 'hens');
    }
    for (const key of ['category', 'count', 'status', 'origin', 'expectedStart', 'layingSince']) delete cohort[key];
    if (cohort.notes == null) cohort.notes = '';
    if (cohort.mark == null) cohort.mark = '';
    if (cohort.weeks === undefined) cohort.weeks = null;
    if (cohort.rearing === undefined) cohort.rearing = null;
  }
  for (const change of data.cohortChanges) {
    if (change.notes == null) change.notes = '';
    if (change.sex === undefined) change.sex = legacySex.get(change.cohortId) ?? 'hens';
    if (change.notes) continue;
    if (change.type === 'loss' && t.oldLossReasons[change.reason]) change.notes = t.oldLossReasons[change.reason];
    if (change.type === 'add' && t.oldAddOrigins[change.origin]) change.notes = t.oldAddOrigins[change.origin];
  }
  return data;
}
