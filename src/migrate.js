import {isAdditive} from './calc/index.js';
import {t} from '../ui/texts.js';

export const migrations = {
  ingredients(ingredient) {
    if (ingredient.kind === undefined) ingredient.kind = isAdditive(ingredient) ? 'additive' : 'base';
  },
  cohorts(cohort) {
    if (cohort.dateKind === 'initial') {
      cohort.dateKind = 'purchase';
      cohort.weeks = null;
    }
  },
  cohortChanges(event) {
    if (event.type === 'loss' && !event.notes && event.reason) event.notes = t.lossReasons[event.reason] ?? '';
  }
};

export function migrateData(data) {
  for (const [name,migrate] of Object.entries(migrations)) data[name].forEach(migrate);
  return data;
}
