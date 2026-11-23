import {isoDate} from './calc/index.js';
import {decodeBackup, encodeBackup} from './backup.js';
import {loadData, openDatabase, refreshPrices, saveData, stores} from './db.js';
import {derive, setCurrent} from './model.js';
import * as views from './views.js';
import * as forms from './forms.js';
import {FieldError, handleKeypad, html, showFormError} from '../ui/components.js';

const app = document.getElementById('app');
const snackbar = document.getElementById('snackbar');
const status = document.getElementById('status');
const undo = document.getElementById('undo');
const dialog = document.getElementById('dialog');
const routes = {
  start:views.start, feed:views.feed, stock:views.warehouse, flock:views.flockView,
  recipe:views.recipeView, batch:views.batchView, ingredient:views.ingredientView, cohort:views.cohortView,
  'recipe-form':forms.recipeForm, 'ingredient-form':forms.ingredientForm, movement:forms.movementForm,
  mix:(ctx,id) => forms.mixForm(ctx,'mix',id,history.state?.origin),
  'batch-form':(ctx,id) => forms.mixForm(ctx,'batch-form',id),
  finish:forms.finishForm, 'cohort-form':forms.cohortForm, change:forms.changeForm, settings:forms.settingsForm,
};

let db;
let data;
let screen;
let route;
let historyIndex = 0;
let dirty = false;
let busy = false;
let saving = false;
let timer;
let undoAction;
let displayedDate;
let pendingPop = false;
let restoreDone;

function readRoute() {
  return location.hash.slice(1) || 'start';
}

function notify(message, action, duration = 5000) {
  clearTimeout(timer);
  status.textContent = message;
  snackbar.hidden = false;
  undo.hidden = !action;
  undoAction = action;
  timer = setTimeout(() => {
    undoAction = undefined;
    snackbar.hidden = true;
  },duration);
}

function confirm(title, message, yes, no = 'Anuluj') {
  return new Promise(resolve => {
    dialog.innerHTML = `<h2 id="dialog-title">${html(title)}</h2><p>${html(message)}</p>
      <form class="dialog-actions" method="dialog"><button class="button" value="no" autofocus>${html(no)}</button>
        <button class="button" value="yes">${html(yes)}</button></form>`;
    dialog.setAttribute('aria-labelledby','dialog-title');
    dialog.returnValue = 'no';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {once:true});
    dialog.showModal();
  });
}

function render(focus = true, resetScroll = true) {
  displayedDate = isoDate();
  const [name,...args] = route.split('/');
  const context = {
    data, derived:derive(data,displayedDate), today:displayedDate,
    commit, confirm, go, setCurrent, importBackup, exportBackup,
    dirty:() => { dirty = true; }
  };
  screen = Object.hasOwn(routes,name) ? routes[name](context,...args) : views.missing();
  app.innerHTML = views.frame(screen,route);
  document.title = screen.title === 'Kurnik' ? 'Kurnik' : screen.title + ' · Kurnik';
  if (resetScroll) window.scrollTo(0,0);
  if (focus) app.querySelector('h1').focus({preventScroll:true});
}

function enter(target, replace = false) {
  if (!replace && target === route) return;
  const previous = replace ? history.state?.origin : route;
  route = target;
  dirty = false;
  if (!replace) historyIndex += 1;
  history[replace ? 'replaceState' : 'pushState']({kurnik:historyIndex,route,origin:previous},'', '#' + route);
  render();
}

async function discard() {
  return !dirty || await confirm('Odrzucić zmiany?', 'Niezapisane zmiany zostaną utracone.', 'Odrzuć', 'Wróć do formularza');
}

async function go(target) {
  if (target === route || (screen?.form && !await discard())) return;
  enter(target);
}

function complete(target) {
  if (!target || target === route) {
    dirty = false;
    render(false,false);
    return;
  }
  dirty = false;
  if (historyIndex > 0 && history.state?.origin === target) history.back();
  else enter(target,true);
}

function previousVersion(before, after) {
  const restored = structuredClone(before);
  for (const key of stores.filter(key => key !== 'settings')) {
    const originalIds = new Set(before[key].map(row => row.id));
    for (const row of after[key]) {
      if (!originalIds.has(row.id)) restored[key].push({...row,deleted:true});
    }
  }
  return restored;
}

async function write(update) {
  if (saving) return null;
  saving = true;
  const before = data;
  const after = structuredClone(before);
  try {
    const result = update(after);
    refreshPrices(after);
    await saveData(db,before,after);
    data = after;
    return {before,after,result};
  } catch (error) {
    if (error.conflict) data = await loadData(db);
    throw error.conflict ? error : new Error('Nie udało się zapisać danych. Sprawdź wolne miejsce w pamięci urządzenia.');
  } finally {
    saving = false;
  }
}

async function commit(update,target,message = 'Zapisano') {
  const saved = await write(update);
  if (!saved) return false;
  const {before,after} = saved;
  complete(target);
  notify(message,async () => {
    if (data !== after) return;
    if (screen.form && !await discard()) return;
    try {
      const restored = previousVersion(before,after);
      await saveData(db,after,restored);
      data = restored;
      dirty = false;
      render(false,false);
      notify('Cofnięto zmianę');
    } catch (error) {
      if (error.conflict) {
        data = await loadData(db);
        dirty = false;
        render(false,false);
      }
      notify(error.message || 'Nie udało się cofnąć zmiany.');
    }
  });
  return true;
}

async function exportBackup(share) {
  if (dirty && !await discard()) return;
  const today = isoDate();
  const name = 'kurnik-kopia-' + today + '.json';
  const file = new File([encodeBackup(data,today)],name,{type:'application/json'});
  if (share && navigator.canShare?.({files:[file]})) {
    try { await navigator.share({files:[file]}); }
    catch (error) {
      if (error.name === 'AbortError') return;
      throw new Error('Nie udało się udostępnić pliku. Użyj przycisku „Eksportuj kopię”.');
    }
  } else {
    const url = URL.createObjectURL(file);
    const anchor = Object.assign(document.createElement('a'),{href:url,download:name});
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  }
  const saved = await write(next => { next.settings[0].lastExport = today; });
  if (!saved) return;
  dirty = false;
  render(false,false);
  notify('Wyeksportowano kopię');
}

async function importBackup(file) {
  if (file.size > 50000000) throw new FieldError('', 'Kopia jest większa niż 50 MB.');
  let imported;
  try { imported = decodeBackup(await file.text()); }
  catch (error) { throw new FieldError('',error.message); }
  const accepted = await confirm('Zastąpić dane?',
    'Wszystkie obecne wpisy i ustawienia zostaną zastąpione danymi z pliku.', 'Importuj');
  if (!accepted) return;
  const saved = await write(next => {
    for (const key of stores) next[key] = imported[key];
  });
  if (!saved) return;
  dirty = false;
  render(false,false);
  notify('Przywrócono kopię');
}

function report(error) {
  if (error.conflict) {
    dirty = false;
    render(false,false);
    notify(error.message);
    return;
  }
  if (error.fieldName) {
    const parent = document.getElementById(error.fieldName)?.closest('[hidden]');
    if (parent) parent.hidden = false;
  }
  if (screen?.form) showFormError(error);
  else notify(error.message || 'Wystąpił błąd.');
}

function clearErrors() {
  for (const field of app.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
  for (const message of app.querySelectorAll('.field-error')) message.textContent = '';
  const output = app.querySelector('[data-form-error]');
  if (output) output.hidden = true;
}

async function run(callback) {
  if (busy || dialog.open) return;
  busy = true;
  try { await callback(); }
  catch (error) { report(error); }
  finally { busy = false; }
}

app.addEventListener('click', event => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
    event.preventDefault();
    run(() => go(anchor.hash.slice(1)));
    return;
  }
  const target = event.target.closest('button');
  if (!target || dialog.open || busy) return;
  if (target.dataset.key) { handleKeypad(target); return; }
  const action = target.dataset.action;
  if (!action) return;
  if (action === 'back') {
    run(async () => {
      if (!await discard()) return;
      complete(screen.parent);
    });
  } else {
    run(async () => {
      clearErrors();
      await screen.action?.(action);
    });
  }
});

app.addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    clearErrors();
    await screen.submit?.();
  });
});

function inputChanged(event) {
  const target = event.target;
  if (!target.closest('form') || target.type === 'file') {
    if (target.type === 'file' && event.type === 'change') run(async () => {
      try { await screen.change?.(target); }
      finally { target.value = ''; }
    });
    return;
  }
  dirty = true;
  target.removeAttribute('aria-invalid');
  const error = document.getElementById(target.id + '-error');
  if (error) error.textContent = '';
  if (event.type === 'change' || !['SELECT','INPUT'].includes(target.tagName) || !['checkbox','date','select-one'].includes(target.type)) {
    try { screen.change?.(target); }
    catch (error) { report(error); }
  }
}
app.addEventListener('focusin', event => screen?.focus?.(event.target));
app.addEventListener('input', inputChanged);
app.addEventListener('change', inputChanged);
undo.addEventListener('click', () => run(async () => { await undoAction?.(); }));

window.addEventListener('popstate', async event => {
  if (!data) return;
  if (restoreDone) {
    const done = restoreDone;
    restoreDone = undefined;
    done();
    return;
  }
  const target = readRoute();
  const index = event.state?.kurnik;
  if (target === route) return;
  if (pendingPop) return;
  if (dirty && screen.form) {
    if (dialog.open) dialog.close('no');
    pendingPop = true;
    if (Number.isInteger(index) && index !== historyIndex) {
      await new Promise(resolve => {
        restoreDone = resolve;
        history.go(historyIndex - index);
      });
      if (await discard()) {
        dirty = false;
        history.go(index - historyIndex);
      }
    } else {
      history.pushState({kurnik:historyIndex,route},'','#' + route);
      if (await discard()) enter(target,true);
    }
    pendingPop = false;
    return;
  }
  route = target;
  historyIndex = Number.isInteger(index) ? index : historyIndex;
  if (!Number.isInteger(index)) history.replaceState({kurnik:historyIndex,route},'','#' + route);
  render();
});

window.addEventListener('beforeunload', event => {
  if (dirty) event.preventDefault();
});

async function initialize() {
  try {
    db = await openDatabase();
    data = await loadData(db);
    route = readRoute();
    historyIndex = history.state?.kurnik ?? 0;
    if (history.state?.route !== route) history.replaceState({kurnik:historyIndex,route},'','#' + route);
    render(false);
  } catch {
    app.innerHTML = '<main class="page"><section class="error-panel"><h1>Kurnik</h1><p>Nie udało się otworzyć lokalnej bazy danych. Otwórz aplikację w Chrome pod adresem HTTPS i sprawdź ustawienia pamięci witryn.</p></section></main>';
    return;
  }
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      registration.update().catch(() => {});
      function announceWaiting() {
        if (registration.waiting && navigator.serviceWorker.controller) {
          notify('Dostępna aktualizacja. Zamknij i otwórz ponownie Kurnik.');
        }
      }
      announceWaiting();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', announceWaiting);
      });
    }).catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && data && !dirty && !busy && displayedDate !== isoDate()) render(false,false);
});

initialize();
