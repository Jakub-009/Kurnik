import {addDays, batchResult, cohortCounts, cohortEvents, cohortStage, defaultPerBird, flockEventKind, ingredientMass, isAdditive, lastBatchMass, recipeBaseItems,
  recipeComposition, scaleBatch, stock, validCohortHistory} from './calc/index.js';
import {live, record} from './db.js';
import {find, isFinished, put, putBatch, remove, removeBatch, removeRecipe, showAmount} from './model.js';
import {missing} from './views.js';
import {button, changeRow, choice, chosen, dateField, empty, field, FieldError, figure, form, html, iconButton,
  link, numberField, readDate, readName, readNumber, select, strip, textarea, tile} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';
import {t} from '../ui/texts.js';

const amountLimit = 10000000;
const amountOptions = {min:.001, max:amountLimit};
const maxBirds = 1000000;
const value = name => document.getElementById(name).value;
const dateInput = (ctx, name, label, date = ctx.today, min) => dateField(name, label, date, min, ctx.today);
const asInput = (number, digits) => fmt.editable(number, digits);
const text = (name, fallback = '') => (document.getElementById(name)?.value ?? fallback).trim();
const priceInput = (name, label, initial) => field(name, label, asInput(initial, 2), {mode:'decimal', length:14});
const normalize = name => name.trim().toLocaleLowerCase('pl');
const get = (ctx, store, id) => find(ctx.data, store, id);
const kindOptions = [['base', t.kindBase], ['additive', t.kindAdditive]];
const originOptions = [['bought', t.originBought], ['own', t.originOwn]];

function physicalMass(amount, ingredient, fieldName) {
  try { return ingredientMass(Math.round(amount * 1000), ingredient.unit, ingredient.density); }
  catch (error) { throw new FieldError(fieldName, error.message); }
}

function ingredientFields(prefix, item) {
  return `${field(prefix + 'name', t.nameLabel, item?.name, {length:80})}
    ${select(prefix + 'unit', t.unit, [['kg', 'kg'], ['l', 'l']], item?.unit ?? 'kg')}
    <div id="${prefix}density-wrap"${item?.unit !== 'l' ? ' hidden' : ''}>
      ${field(prefix + 'density', t.density, asInput(item?.density), {mode:'decimal'})}</div>
    ${choice(prefix + 'kind', t.kind, kindOptions, item && isAdditive(item) ? 'additive' : 'base')}
    ${choice(prefix + 'origin', t.origin, originOptions, item?.origin === 'own' ? 'own' : 'bought')}
    <div class="stack tight" id="${prefix}own-wrap"${item?.origin === 'own' ? '' : ' hidden'}>
      ${priceInput(prefix + 'own-price', t.ownValue(item?.unit ?? 'kg'), ownValueShown(item))}
      <p class="muted">${t.ownValueHint}</p></div>`;
}

// Wartość składnika własnego w zł za jednostkę (kg albo l); puste = 0 zł.
function ownValueShown(item) {
  if (!item?.ownPrice) return null;
  return item.ownPrice.cents / 100 * (item.unit === 'l' ? item.density * 1000 : 1000) / item.ownPrice.grams;
}

function updateIngredientFields(prefix, target) {
  if (target.name === prefix + 'origin') document.getElementById(prefix + 'own-wrap').hidden = target.value !== 'own';
  if (target.id !== prefix + 'unit') return;
  document.getElementById(prefix + 'density-wrap').hidden = target.value !== 'l';
  document.querySelector('label[for="' + prefix + 'own-price"]').textContent = t.ownValue(target.value);
}

function ingredientValues(prefix, ingredients, id, lockedUnit) {
  const name = readName(value(prefix + 'name'), prefix + 'name');
  if (ingredients.some(row => row.id !== id && normalize(row.name) === normalize(name))) {
    throw new FieldError(prefix + 'name', t.nameTaken);
  }
  const unit = value(prefix + 'unit');
  if (lockedUnit && unit !== lockedUnit) throw new FieldError(prefix + 'unit', t.unitLocked);
  const density = unit === 'l' ? readNumber(value(prefix + 'density'), prefix + 'density', {min:.001, max:100}) : null;
  const origin = chosen(prefix + 'origin') ?? 'bought';
  const entered = origin === 'own'
    ? readNumber(value(prefix + 'own-price'), prefix + 'own-price', {optional:true, min:0, max:100000, digits:2}) : null;
  const ownPrice = entered === null ? null : {cents:Math.round(entered * 100), grams:unit === 'l' ? Math.round(density * 1000) : 1000};
  return {name, unit, density, kind:chosen(prefix + 'kind') ?? 'base', origin, ownPrice};
}

export function ingredientForm(ctx, id) {
  const old = get(ctx, 'ingredients', id);
  if (id && !old) return missing('stock');
  const parent = old ? 'ingredient/' + id : 'stock';
  const referenced = old && (ctx.data.recipes.some(row => row.items.some(item => item.ingredientId === id)) ||
    ctx.data.ingredientEvents.some(row => row.ingredientId === id));
  return {
    title:old ? t.editIngredient : t.newIngredient, parent, form:true,
    body:form(`${ingredientFields('', old)}
      ${referenced ? '<p class="muted">' + t.unitLocked + '</p>' : ''}`, t.save, Boolean(old)),
    change(target) {
      updateIngredientFields('', target);
    },
    submit() {
      const fields = ingredientValues('', ctx.derived.ingredients, id, referenced ? old.unit : null);
      if (old) {
        const updated = ctx.derived.ingredients.map(ingredient => ingredient.id === id ? {...old, ...fields} : ingredient);
        for (const recipe of ctx.derived.recipes.filter(recipe => recipe.items.some(item => item.ingredientId === id))) {
          if (!recipeBaseItems(recipe, updated).length) throw new FieldError('kind', t.recipeMustHaveBase);
          const item = recipe.items.find(row => row.ingredientId === id);
          physicalMass(item.amount / 1000, fields, fields.unit === 'l' ? 'density' : 'name');
        }
      }
      return ctx.commit(data => {
        const row = put(data, 'ingredients', old, {...fields, price:old?.price ?? null});
        delete row.oil;
      }, parent);
    },
    action(action) {
      if (action !== 'delete') return;
      if (ctx.derived.recipes.some(row => row.items.some(item => item.ingredientId === id))) {
        throw new FieldError('', t.removeFromRecipes);
      }
      if (live(ctx.data.ingredientEvents).some(row => row.ingredientId === id)) throw new FieldError('', t.hasStockEntries);
      return ctx.commit(data => remove(data, 'ingredients', id), 'stock', t.deleted);
    }
  };
}

export function recipeForm(ctx, id) {
  const old = get(ctx, 'recipes', id);
  if (id && !old) return missing('feed');
  const parent = old ? 'recipe/' + id : 'feed';
  const ingredients = ctx.derived.ingredients.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const drafted = [];
  const optionLabel = row => isAdditive(row) ? t.optionAdditive(row.name, row.unit) : t.optionBase(row.name, row.unit);
  const options = () => [['', t.choose], ...ingredients.map(row => [row.id, optionLabel(row)])];
  let next = 0;
  const readLine = (ingredientId = '', amount) => {
    const index = next++;
    const ingredient = ingredients.find(row => row.id === ingredientId);
    return `<div class="recipe-line" data-recipe-line="${index}">${select('ingredient-' + index, t.ingredient, options(), ingredientId)}
      ${field('amount-' + index, ingredient ? t.amountIn(ingredient.unit) : t.amount, asInput(amount), {mode:'decimal', length:17})}
      ${iconButton(t.removeLine, 'del', 'drop:' + index)}</div>`;
  };
  const items = old ? old.items.map(item => readLine(item.ingredientId, item.amount / 1000)).join('') : readLine();
  const lines = () => [...document.querySelectorAll('[data-recipe-line]')];
  function updateAmountLabel(selectInput) {
    const ingredient = ingredients.find(row => row.id === selectInput.value);
    const index = selectInput.closest('[data-recipe-line]').dataset.recipeLine;
    document.querySelector('label[for="amount-' + index + '"]').textContent = ingredient ? t.amountIn(ingredient.unit) : t.amount;
  }
  function resetNewIngredient() {
    document.getElementById('new-ingredient').hidden = true;
    document.getElementById('new-name').value = '';
    document.getElementById('new-unit').value = 'kg';
    document.getElementById('new-density').value = '';
    document.getElementById('new-density-wrap').hidden = true;
    document.querySelector('input[name="new-kind"][value="base"]').checked = true;
  }
  return {title:old ? t.editRecipe : t.newRecipe, parent, form:true,
    body:form(`${field('name', t.nameLabel, old?.name, {length:80})}<fieldset class="stack tight"><legend>${t.ingredients}</legend>
      <div class="recipe-head" aria-hidden="true"><span>${t.ingredient}</span><span>${t.amount}</span></div>
      <div class="stack tight" id="recipe-lines">${items}</div><div class="actions">
      ${button(t.addLine, 'add-line', 'tonal', 'plus')}${button(t.createIngredient, 'new-ingredient', 'text', 'plus')}</div></fieldset>
      <fieldset class="card stack" id="new-ingredient" hidden><legend>${t.createIngredient}</legend>
        ${ingredientFields('new-', null)}<div class="actions">${button(t.addToRecipe, 'use-ingredient', 'tonal')}
        ${button(t.cancel, 'cancel-ingredient', 'text')}</div></fieldset>
      ${textarea('notes', t.notesOptional, old?.notes)}`, t.save, Boolean(old)),
    change(target) {
      updateIngredientFields('new-', target);
      if (target.id.startsWith('ingredient-')) updateAmountLabel(target);
    },
    submit() {
      const name = readName(value('name'));
      const seen = new Set();
      const written = lines().map(line => {
        const index = line.dataset.recipeLine;
        const ingredientId = value('ingredient-' + index);
        const ingredient = ingredients.find(row => row.id === ingredientId);
        if (!ingredient) throw new FieldError('ingredient-' + index, t.chooseIngredient);
        if (seen.has(ingredientId)) throw new FieldError('ingredient-' + index, t.duplicateIngredient);
        seen.add(ingredientId);
        const amount = readNumber(value('amount-' + index), 'amount-' + index, amountOptions);
        physicalMass(amount, ingredient, 'amount-' + index);
        return {ingredientId, amount:Math.round(amount * 1000)};
      });
      if (!recipeBaseItems({items:written}, ingredients).length) throw new FieldError('', t.recipeNeedsBase);
      if (!document.getElementById('new-ingredient').hidden) throw new FieldError('new-name', t.finishNewIngredient);
      return ctx.commit(data => {
        const used = new Set(written.map(item => item.ingredientId));
        for (const ingredient of drafted) {
          if (used.has(ingredient.id)) data.ingredients.push(record(ingredient));
        }
        put(data, 'recipes', old, {name, items:written, notes:text('notes'), current:old?.current ?? !live(data.recipes).length});
      }, parent);
    },
    action(action) {
      if (action === 'new-ingredient') {
        document.getElementById('new-ingredient').hidden = false;
        document.getElementById('new-name').focus();
      }
      if (action === 'cancel-ingredient') resetNewIngredient();
      if (action === 'use-ingredient') {
        const ingredient = {id:crypto.randomUUID(), ...ingredientValues('new-', [...ctx.derived.ingredients, ...drafted]), price:null};
        drafted.push(ingredient);
        ingredients.push(ingredient);
        const selectors = [...document.querySelectorAll('#recipe-lines select')];
        const blank = selectors.find(item => !item.value);
        for (const item of selectors) item.add(new Option(optionLabel(ingredient), ingredient.id));
        if (blank) {
          blank.value = ingredient.id;
          updateAmountLabel(blank);
        } else document.getElementById('recipe-lines').insertAdjacentHTML('beforeend', readLine(ingredient.id));
        const index = blank ? blank.id.slice('ingredient-'.length) : next - 1;
        resetNewIngredient();
        document.getElementById('amount-' + index).focus();
        ctx.dirty();
      }
      if (action === 'add-line') {
        document.getElementById('recipe-lines').insertAdjacentHTML('beforeend', readLine());
        document.getElementById('ingredient-' + (next - 1)).focus();
        ctx.dirty();
      }
      if (action.startsWith('drop:')) {
        document.getElementById('ingredient-' + action.slice(5)).closest('[data-recipe-line]').remove();
        ctx.dirty();
      }
      if (action === 'delete') return ctx.commit(data => removeRecipe(data, id), 'feed', t.deleted);
    }};
}

export function recipeOrderForm(ctx, id) {
  const recipe = get(ctx, 'recipes', id);
  if (!recipe) return missing('feed');
  const parent = 'recipe/' + id;
  const initial = recipe.items.map(item => item.ingredientId);
  const list = () => document.getElementById('recipe-order-list');
  const order = () => [...list().children].map(item => item.dataset.ingredient);
  const changed = () => order().some((ingredientId, index) => ingredientId !== initial[index]);
  const ingredientNames = new Map(ctx.derived.ingredients.map(item => [item.id, item]));
  const rows = initial.map(ingredientId => {
    const ingredient = ingredientNames.get(ingredientId);
    return `<li class="order-row" data-ingredient="${html(ingredientId)}">
      <span class="grow">${html(ingredient.name)}${isAdditive(ingredient) ? ' <small>' + t.additive + '</small>' : ''}</span>
      <button class="icon-button order-handle" type="button" aria-label="${html(t.move(ingredient.name))}"
        aria-describedby="reorder-help">${icon('grip')}</button></li>`;
  }).join('');

  function announce(row) {
    const index = order().indexOf(row.dataset.ingredient);
    const name = ingredientNames.get(row.dataset.ingredient).name;
    document.getElementById('order-status').textContent = t.position(name, fmt.number(index + 1), fmt.number(initial.length));
    ctx.dirty(changed());
  }

  function bindDrag() {
    const container = list();
    let drag;
    let frameId;
    const midpoint = row => {
      const bounds = row.getBoundingClientRect();
      return bounds.top + bounds.height / 2;
    };
    function placeRow(y) {
      const {row} = drag;
      while (row.previousElementSibling && y < midpoint(row.previousElementSibling)) row.previousElementSibling.before(row);
      while (row.nextElementSibling && y > midpoint(row.nextElementSibling)) row.nextElementSibling.after(row);
    }
    function scrollDuringDrag() {
      if (!drag || !container.isConnected) return;
      const edge = 80;
      const bottom = window.innerHeight - edge;
      const y = drag.y;
      const speed = y < edge ? -Math.min(16, (edge - y) / 4) : y > bottom ? Math.min(16, (y - bottom) / 4) : 0;
      if (speed) {
        window.scrollBy(0, speed);
        placeRow(y);
      }
      frameId = requestAnimationFrame(scrollDuringDrag);
    }
    container.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.order-handle');
      if (!handle || event.button !== 0 || drag) return;
      const row = handle.closest('li');
      drag = {row, id:event.pointerId, y:event.clientY, previous:[...container.children]};
      container.setPointerCapture(event.pointerId);
      row.classList.add('order-row--dragging');
      frameId = requestAnimationFrame(scrollDuringDrag);
      event.preventDefault();
    });
    container.addEventListener('pointermove', event => {
      if (event.pointerId !== drag?.id) return;
      drag.y = event.clientY;
      placeRow(drag.y);
    });
    function finishDrag(event) {
      if (event.pointerId !== drag?.id) return;
      const {row, previous} = drag;
      drag = null;
      cancelAnimationFrame(frameId);
      row.classList.remove('order-row--dragging');
      if (event.type === 'pointerup') announce(row);
      else container.append(...previous);
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) container.addEventListener(event, finishDrag);
    container.addEventListener('keydown', event => {
      const handle = event.target.closest('.order-handle');
      if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const row = handle.closest('li');
      if (event.key === 'ArrowUp') row.previousElementSibling?.before(row);
      else row.nextElementSibling?.after(row);
      handle.focus({preventScroll:true});
      announce(row);
    });
  }

  return {title:t.reorder, subtitle:recipe.name, parent, form:true, mount:bindDrag,
    body:form(`<p class="muted" id="reorder-help">${t.reorderHelp}</p>
      <ol class="list order-list" id="recipe-order-list">${rows}</ol><p class="muted" id="order-status" role="status"></p>`),
    submit() {
      if (!changed()) return ctx.done(parent);
      const items = new Map(recipe.items.map(item => [item.ingredientId, item]));
      const reordered = order().map(ingredientId => items.get(ingredientId));
      return ctx.commit(data => put(data, 'recipes', recipe, {items:reordered}), parent);
    }};
}

const movementTitles = {add:t.addToStock, purchase:t.movementNames.purchase, addition:t.movementNames.addition,
  correction:t.stockCorrection, withdrawal:t.withdrawal};

export function movementForm(ctx, type, ingredientId, eventId) {
  if (!Object.hasOwn(movementTitles, type)) return missing('stock');
  const old = get(ctx, 'ingredientEvents', eventId);
  if (eventId && (!old || old.type !== type || old.ingredientId !== ingredientId)) return missing('stock');
  let ingredient = get(ctx, 'ingredients', ingredientId) ?? ctx.derived.stocks[0]?.ingredient;
  const ingredientRoute = ingredientId ? 'ingredient/' + ingredientId : 'stock';
  const parent = old ? 'movement-detail/' + old.id : ingredientRoute;
  if (!ingredient) return {title:movementTitles[type], parent:'stock',
    body:empty(t.needIngredient, link(t.addIngredient, 'ingredient-form', 'tonal'))};
  const correction = type === 'correction';
  const add = type === 'add';
  const canPrice = type === 'purchase' || add;
  const selection = ctx.derived.ingredients.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  let date = old?.date ?? ctx.today;
  const defaultSource = row => row.lastSource ?? (row.origin === 'own' ? 'addition' : 'purchase');
  let source = add ? defaultSource(ingredient) : type;
  // Składnik bez żadnego wpisanego stanu: pierwszy wpis to „Wpisz stan” (zważona ilość na dany dzień),
  // bo zwykłe „Dodaj” dopisałoby ilość do stanu pomniejszonego o wcześniejsze partie.
  const unknown = row => !ctx.derived.stocks.find(entry => entry.ingredient.id === row.id)?.known;
  const first = correction && !old && unknown(ingredient);
  const firstNote = row => add && !old && unknown(row)
    ? strip({title:t.firstEntryTitle, line:t.firstEntryLine, route:'movement/correction/' + row.id, label:t.enterStateShort, tone:'info'}) : '';
  const currentStock = () => {
    if (!correction) return stock(ctx.data.ingredientEvents, ingredient.id, old?.id);
    const earlier = ctx.data.ingredientEvents.filter(event => event.date < date ||
      (event.date === date && (!old || event.createdAt <= old.createdAt)));
    return stock(earlier, ingredient.id, old?.id);
  };
  const initialAmount = old ? showAmount(correction ? old.measured ?? (currentStock() + old.grams) : Math.abs(old.grams), ingredient) : null;
  const signed = (grams, sign = true) => fmt.stockQuantity(showAmount(grams, ingredient), ingredient.unit, sign);
  const initialPrice = item => old ? old.price : item.price;
  const defaultMode = old?.priceMode ?? 'per-kg';
  const shownPrice = (price, mode, item) => {
    if (!price) return null;
    if (mode === 'total') return old ? price.cents / 100 * old.grams / price.grams : null;
    return price.cents * 10 / price.grams * (mode === 'per-litre' ? item.density : 1);
  };
  const modes = item => [['per-kg', t.priceModes['per-kg']], ...(item.unit === 'l' ? [['per-litre', t.priceModes['per-litre']]] : []),
    ['total', t.priceModes.total]];
  const priceBlock = (item, mode) => `<div class="form-grid" id="prices">
    ${priceInput('price', t.priceOptional, shownPrice(initialPrice(item), mode, item))}
    ${select('price-mode', t.priceMode, modes(item), mode)}</div>`;
  const getQuantity = () => {
    if (old && value('quantity') === asInput(initialAmount)) return correction ? (old.measured ?? currentStock() + old.grams) : Math.abs(old.grams);
    const amount = readNumber(value('quantity'), 'quantity', correction ? {max:amountLimit} : amountOptions);
    return amount === 0 ? 0 : physicalMass(amount, ingredient, 'quantity');
  };
  const correctionDelta = grams => old && date === old.date && grams === old.measured ? old.grams : grams - currentStock();
  const updateDifference = () => {
    if (!correction) return;
    const output = document.getElementById('difference');
    document.getElementById('calculated-stock').textContent = signed(currentStock(), false);
    try { output.textContent = t.difference(signed(correctionDelta(getQuantity()))); }
    catch { output.textContent = ''; }
  };
  const sourceChoice = () => choice('source', t.source, [['purchase', t.sourcePurchase], ['addition', t.sourceOwn]], source);

  return {title:first ? t.enterState : movementTitles[type], subtitle:ingredientId ? ingredient.name : '', parent, form:true,
    body:form(`${ingredientId ? '' : select('ingredient', t.ingredient, selection.map(row => [row.id, row.name]), ingredient.id)}
      ${add ? '<div id="first-entry">' + firstNote(ingredient) + '</div>' : ''}
      ${add ? '<div id="source-wrap">' + sourceChoice() + '</div>' : ''}
      ${correction ? `<p${first ? ' hidden' : ''}>${t.shouldBe} <strong id="calculated-stock">${signed(currentStock(), false)}</strong></p>` : ''}
      ${first ? '<p class="muted">' + t.firstStateHint + '</p>' : ''}
      ${numberField('quantity', first ? t.howMuchNow : correction ? t.howMuchReally : t.quantity, asInput(initialAmount), ingredient.unit)}
      ${correction ? `<p id="difference" role="status"${first ? ' hidden' : ''}>${old ? t.difference(signed(old.grams)) : ''}</p>` : ''}
      ${canPrice ? `<div id="purchase-fields"${source === 'purchase' ? '' : ' hidden'}>${priceBlock(ingredient, defaultMode)}</div>` : ''}
      ${changeRow(t.date, fmt.fullDate(date), 'date')}
      <div id="date-wrap" hidden>${dateInput(ctx, 'date', t.date, date)}</div>
      ${!correction ? textarea('notes', t.notesOptional, old?.notes) : ''}`, t.save, Boolean(old)),
    change(target) {
      if (target.id === 'date' && target.value) {
        date = target.value;
        document.querySelector('[data-action="date"]').previousElementSibling.querySelector('strong').textContent = fmt.fullDate(date);
        updateDifference();
      }
      if (target.id === 'ingredient') {
        ingredient = get(ctx, 'ingredients', target.value);
        document.querySelector('[data-unit-for="quantity"]').textContent = ingredient.unit;
        if (add) {
          source = defaultSource(ingredient);
          document.getElementById('first-entry').innerHTML = firstNote(ingredient);
          document.getElementById('source-wrap').innerHTML = sourceChoice();
          document.getElementById('purchase-fields').hidden = source !== 'purchase';
        }
        if (canPrice) document.getElementById('prices').outerHTML = priceBlock(ingredient, 'per-kg');
        updateDifference();
      }
      if (target.name === 'source') {
        source = target.value;
        document.getElementById('purchase-fields').hidden = source !== 'purchase';
      }
      if (target.id === 'price-mode') {
        document.getElementById('price').value = asInput(shownPrice(initialPrice(ingredient), target.value, ingredient), 2);
      }
      if (target.id === 'quantity') updateDifference();
    },
    submit() {
      const when = readDate(value('date'), 'date', '1900-01-01', ctx.today);
      date = when;
      const grams = getQuantity();
      let price = null;
      let priceMode = null;
      const kind = add ? source : type;
      if (kind === 'purchase') {
        priceMode = value('price-mode');
        const original = initialPrice(ingredient);
        const defaultText = asInput(shownPrice(original, priceMode, ingredient), 2);
        if (original && defaultText && value('price') === defaultText && (!old || priceMode !== 'total' || grams === old.grams)) {
          price = original;
        } else {
          const entered = readNumber(value('price'), 'price', {optional:true, min:.01, max:100000000, digits:2});
          if (entered !== null) price = {cents:Math.round(entered * 100), grams:priceMode === 'total' ? grams
            : priceMode === 'per-litre' ? Math.round(ingredient.density * 1000) : 1000};
        }
      }
      const balance = correction ? correctionDelta(grams) : kind === 'withdrawal' ? -grams : grams;
      return ctx.commit(data => {
        put(data, 'ingredientEvents', old, {ingredientId:ingredient.id, type:kind, date:when, grams:balance,
          measured:correction ? grams : null, price, priceMode, batchId:null, notes:text('notes')});
        if (add) find(data, 'ingredients', ingredient.id).lastSource = kind;
      }, parent);
    },
    action(action) {
      if (action === 'date') {
        const wrap = document.getElementById('date-wrap');
        wrap.hidden = !wrap.hidden;
        if (!wrap.hidden) document.getElementById('date').focus();
      }
      if (action === 'delete') return ctx.commit(data => remove(data, 'ingredientEvents', eventId), ingredientRoute, t.deleted);
    }};
}

// Blokada wygaszania ekranu podczas mieszania. Bez obsługi w przeglądarce nic się nie dzieje.
function screenLock() {
  let lock = null;
  let active = false;
  const request = async () => {
    if (!active || document.hidden || !navigator.wakeLock) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { if (lock === sentinel) lock = null; });
      lock = sentinel;
      if (!active) sentinel.release().catch(() => {});
    } catch { lock = null; }
  };
  const onVisibility = () => { if (!document.hidden && !lock) request(); };
  return {
    start() {
      active = true;
      document.addEventListener('visibilitychange', onVisibility);
      request();
    },
    stop() {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
      lock = null;
    }
  };
}

const extra = item => Boolean(item.additive || item.oil);
const presetMasses = [50000, 100000];

export function mixForm(ctx, name, id, origin) {
  const editing = name === 'batch-form';
  const original = editing ? get(ctx, 'batches', id) : null;
  if (editing && !original) return missing('feed');
  const ingredients = ctx.derived.ingredients;
  const requested = get(ctx, 'recipes', id) ?? ctx.derived.current;
  const parent = editing ? 'batch/' + id : origin === 'start' ? 'start' : get(ctx, 'recipes', id) ? 'recipe/' + id : 'feed';
  const recipeList = ctx.derived.recipes.filter(item => recipeBaseItems(item, ingredients).length);
  let recipe = recipeList.find(item => item.id === requested?.id) ?? recipeList[0];
  if (!editing && !recipe) return {title:t.mix, parent,
    body:empty(t.needRecipe, link(t.addRecipe, 'recipe-form', 'tonal', 'plus'))};
  // Stara partia z olejem liczonym w masie zostaje w swoim formacie.
  const legacy = Boolean(original && original.massBasis !== 'base' && original.items.some(item => item.oil));
  let target = editing ? null : lastBatchMass(ctx.derived.batches);
  let mode = presetMasses.includes(target) ? target : 'other';
  let date = original?.date ?? ctx.today;
  let start = original?.start ?? ctx.today;
  let items = original ? structuredClone(original.items) : [];
  let selected = new Set();
  let editedIndex = null;
  const lock = screenLock();

  function scale() {
    items = scaleBatch(recipeComposition(recipe, ingredients), target);
    selected = new Set();
  }
  if (!editing) scale();
  const baseMass = () => items.filter(item => !extra(item)).reduce((sum, item) => sum + item.grams, 0);
  const shown = item => item.millilitres != null ? item.millilitres / 1000 : showAmount(item.grams, item);

  function chips() {
    const option = (key, label) => `<button type="button" class="chip" aria-pressed="${key === mode}" data-action="mass:${key}">${key === mode ? icon('check') : ''}${label}</button>`;
    return presetMasses.map(grams => option(grams, fmt.mass(grams))).join('') + option('other', t.otherMass);
  }

  function recipeChips() {
    return recipeList.map(item => `<button type="button" class="chip" aria-pressed="${item.id === recipe.id}" data-action="choose:${item.id}">${item.id === recipe.id ? icon('check') : ''}${html(item.name)}</button>`).join('');
  }

  function itemEditor(index) {
    const item = items[index];
    return `<div class="card stack" id="quantity-edit">${numberField('adjust', t.amount + ' · ' + item.name, asInput(shown(item)), item.unit)}
      <div class="actions">${button(t.applyAmount, 'apply-quantity', 'tonal', 'check')}${button(t.cancel, 'cancel-quantity', 'text')}</div></div>`;
  }

  // Przy nowej partii: ile brakuje w magazynie do tej ilości. Nie blokuje zapisu – możesz mieć niewpisany towar.
  const stockById = new Map(ctx.derived.stocks.map(entry => [entry.ingredient.id, entry]));
  function shortNote(item) {
    const entry = stockById.get(item.ingredientId);
    if (editing || !entry?.known || entry.grams >= item.grams) return '';
    const missingGrams = item.grams - Math.max(0, entry.grams);
    const text = fmt.quantity(showAmount(missingGrams, entry.ingredient), entry.ingredient.unit, true);
    return `<small class="short-note">${icon('warn')}${html(entry.grams <= 0 ? t.noneInStock : t.missingAmount(text))}</small>`;
  }

  function checkList() {
    return items.map((item, index) => {
      const amount = fmt.mixingQuantity(shown(item), item.unit);
      const label = html(item.name) + (extra(item) ? ' <small class="tag">' + t.additive + '</small>' : '') + shortNote(item);
      return `<div class="checklist-row">
        ${editing ? '<span class="grow">' + label + '</span>' :
          `<label for="check-${index}"><input id="check-${index}" type="checkbox" data-check="${index}" ${selected.has(index) ? 'checked' : ''}><span>${label}</span></label>`}
        <button class="button checklist-amount" type="button" data-action="quantity:${index}" aria-label="${html(t.changeAmount(item.name, amount))}">
          ${amount}${icon('edit')}</button></div>${editedIndex === index ? itemEditor(index) : ''}`;
    }).join('');
  }

  function dateSection() {
    return `${changeRow(t.mixing, fmt.fullDate(date), 'show-dates')}
      ${changeRow(t.feedingFrom, fmt.fullDate(start), 'show-dates')}
      <div class="form-grid" id="mix-dates" hidden>${dateInput(ctx, 'mixed', t.mixDate, date)}
        ${dateField('start', t.feedingStart, start, date, original?.end ? addDays(original.end, -1) : '9999-12-30')}</div>`;
  }

  function renderMix() {
    if (!editing) {
      document.getElementById('mass-chips').innerHTML = chips();
      document.getElementById('recipe-chips').innerHTML = recipeChips();
      document.getElementById('other-mass-wrap').hidden = mode !== 'other';
    }
    document.getElementById('checklist').innerHTML = checkList();
    document.getElementById('actual-mass').textContent = fmt.mixingQuantity(baseMass() / 1000);
  }

  function applyQuantity() {
    if (editedIndex === null) return;
    const item = items[editedIndex];
    const raw = value('adjust');
    if (raw !== asInput(shown(item))) {
      const amount = readNumber(raw, 'adjust', amountOptions);
      item.grams = physicalMass(amount, item, 'adjust');
      if (item.millilitres != null) item.millilitres = Math.round(amount * 1000);
      selected.delete(editedIndex);
      ctx.dirty();
    }
    const index = editedIndex;
    editedIndex = null;
    renderMix();
    document.querySelector('[data-action="quantity:' + index + '"]').focus({preventScroll:true});
  }

  function readOtherMass() {
    return Math.round(readNumber(value('other-mass'), 'other-mass', {min:1, max:2000}) * 1000);
  }

  return {title:editing ? t.editBatch : t.mix, subtitle:original?.recipeName, parent, form:true,
    mount() { if (!editing) lock.start(); },
    unmount() { lock.stop(); },
    body:form(`${editing ? '' : `<fieldset><legend>${t.recipe}</legend><div class="actions" id="recipe-chips">${recipeChips()}</div></fieldset>
      <fieldset class="stack tight"><legend>${t.mixMass}</legend><div class="actions" id="mass-chips">${chips()}</div>
        <div id="other-mass-wrap"${mode === 'other' ? '' : ' hidden'}>${numberField('other-mass', t.otherMassField,
          mode === 'other' ? asInput(target / 1000) : '', 'kg')}</div></fieldset>`}
      <fieldset><legend>${editing ? t.batchContent : t.toPour}</legend>
        <p class="muted">${t.rounded}</p><div id="checklist">${checkList()}</div></fieldset>
      <div class="value-row"><span>${t.mixMass}</span><strong id="actual-mass">${fmt.mixingQuantity(baseMass() / 1000)}</strong></div>
      <div id="date-rows">${dateSection()}</div>`, editing ? t.save : t.saveBatch, editing),
    change(element) {
      if (element.dataset.check !== undefined) {
        if (element.checked) selected.add(Number(element.dataset.check));
        else selected.delete(Number(element.dataset.check));
      }
      if (element.id === 'other-mass') {
        let grams;
        try { grams = readOtherMass(); } catch { return; }
        if (grams !== target) {
          target = grams;
          editedIndex = null;
          scale();
          document.getElementById('checklist').innerHTML = checkList();
          document.getElementById('actual-mass').textContent = fmt.mixingQuantity(baseMass() / 1000);
        }
      }
      if (element.id === 'mixed' && element.value) {
        const startInput = document.getElementById('start');
        if (startInput.value === date || startInput.value < element.value) startInput.value = element.value;
        date = element.value;
        startInput.min = date;
      }
      if (['mixed', 'start'].includes(element.id)) {
        start = value('start');
        const labels = document.querySelectorAll('#date-rows .value-row strong');
        if (date) labels[0].textContent = fmt.fullDate(date);
        if (start) labels[1].textContent = fmt.fullDate(start);
      }
    },
    async submit() {
      applyQuantity();
      if (!editing && mode === 'other' && readOtherMass() !== target) {
        target = readOtherMass();
        scale();
        renderMix();
      }
      const mixed = readDate(value('mixed'), 'mixed', '1900-01-01', ctx.today);
      const begins = readDate(value('start'), 'start', mixed, original?.end ? addDays(original.end, -1) : '9999-12-30');
      if (items.some(row => row.grams <= 0)) throw new FieldError('', t.needMoreMass);
      const mass = legacy ? items.reduce((sum, item) => sum + item.grams, 0) : baseMass();
      if (original?.remaining > mass) throw new FieldError('', t.leftoverTooBig);
      if (!editing && selected.size < items.length &&
        !await ctx.confirm(t.notAllCheckedTitle, t.notAllChecked, t.saveAnyway)) return;
      const mixItems = items.map(item => {
        const saved = {ingredientId:item.ingredientId, name:item.name, unit:item.unit, density:item.density, grams:item.grams, price:item.price};
        if (item.oil) Object.assign(saved, {oil:true, millilitres:item.millilitres});
        else if (item.additive) Object.assign(saved, {additive:true}, item.millilitres != null ? {millilitres:item.millilitres} : {});
        return saved;
      });
      const previous = ctx.derived.openStatus.filter(row => !row.batch.end).at(-1)?.batch;
      const saved = await ctx.commit(data => putBatch(data, original, {
        recipeId:original?.recipeId ?? recipe.id, recipeName:original?.recipeName ?? recipe.name,
        date:mixed, start:begins, end:original?.end ?? null, remaining:original?.remaining ?? null, mass, items:mixItems,
        massBasis:legacy ? undefined : 'base'
      }), parent);
      if (!saved || editing) return;
      if (previous && begins <= ctx.today && await ctx.confirm(t.previousBatch, t.finishPrevious, t.finish, t.skip)) {
        ctx.go('finish/' + previous.id + '/feed');
      }
    },
    action(action) {
      if (action.startsWith('mass:')) {
        const key = action.slice(5);
        const next = key === 'other' ? 'other' : Number(key);
        if (next !== mode) {
          mode = next;
          editedIndex = null;
          if (mode !== 'other') {
            target = mode;
            scale();
          } else {
            document.getElementById('other-mass').value = asInput(target / 1000);
          }
          renderMix();
          if (mode === 'other') document.getElementById('other-mass').focus();
          else document.querySelector('[data-action="' + action + '"]').focus({preventScroll:true});
          ctx.dirty();
        }
      }
      if (action.startsWith('choose:')) {
        const nextRecipe = get(ctx, 'recipes', action.slice(7));
        if (recipe.id !== nextRecipe.id) {
          recipe = nextRecipe;
          editedIndex = null; scale(); renderMix(); ctx.dirty();
        }
      }
      if (action.startsWith('quantity:')) {
        const next = Number(action.slice(9));
        if (editedIndex !== null && editedIndex !== next) applyQuantity();
        editedIndex = editedIndex === next ? null : next;
        renderMix();
        document.getElementById('adjust')?.focus();
      }
      if (action === 'apply-quantity') applyQuantity();
      if (action === 'cancel-quantity') { editedIndex = null; renderMix(); }
      if (action === 'show-dates') {
        const dates = document.getElementById('mix-dates');
        dates.hidden = !dates.hidden;
        if (!dates.hidden) document.getElementById('mixed').focus();
      }
      if (action === 'delete') return ctx.commit(data => removeBatch(data, id), 'feed', t.deleted);
    }};
}

export function finishForm(ctx, id, origin) {
  const batch = get(ctx, 'batches', id);
  if (!batch) return missing('feed');
  const parent = origin === 'batch' ? 'batch/' + id : 'feed';
  const earliest = batch.start;
  // W danych koniec = dzień po ostatnim dniu karmienia.
  const lastDay = batch.end ? addDays(batch.end, -1) : earliest > ctx.today ? earliest : ctx.today;
  const remaining = batch.remaining ?? 0;
  function getInput() {
    const last = readDate(value('end'), 'end', earliest);
    const left = Math.round(readNumber(value('remaining'), 'remaining', {max:batch.mass / 1000}) * 1000);
    return {end:addDays(last, 1), remaining:left};
  }
  function preview({end, remaining}) {
    const {daily, days} = batchResult({...batch, end, remaining});
    return [tile({label:t.feedingDays, value:figure(fmt.days(days))}),
      tile({label:t.dailyTile, value:daily > 0 ? figure(fmt.number(daily / 1000, 1), 'kg') : '—'}),
      ...(daily > 0 ? [tile({label:t.lasts100, value:figure(fmt.days(100000 / daily))})] : [])].join('');
  }
  return {title:batch.end ? t.finishEditTitle : t.finishTitle, subtitle:batch.recipeName, parent, form:true,
    body:form(`${dateField('end', t.lastDayField, lastDay, earliest)}
      ${numberField('remaining', t.leftoverField, asInput(remaining / 1000), 'kg')}
      <section class="stack tight"><h2 class="list-title">${t.preview}</h2><div class="tiles" id="finish-preview">${preview({end:addDays(lastDay, 1), remaining})}</div></section>
      ${batch.end ? '<div>' + button(t.reopen, 'reopen', 'text') + '</div>' : ''}`),
    change() {
      const output = document.getElementById('finish-preview');
      try { output.innerHTML = preview(getInput()); }
      catch { output.innerHTML = '<p class="muted">' + html(t.fillFinish) + '</p>'; }
    },
    submit() {
      const values = getInput();
      return ctx.commit(data => put(data, 'batches', batch, values), parent);
    },
    action(action) {
      if (action === 'reopen') return ctx.commit(data => put(data, 'batches', batch, {end:null, remaining:null}), parent);
    }};
}

const birdsField = (name, label, value) => numberField(name, label, asInput(value), t.pcs, 'numeric');
const readBirds = (name, min = 0) => readNumber(value(name), name, {digits:0, max:maxBirds, min});
const year = date => date.slice(0, 4);

export function cohortForm(ctx, id) {
  const cohort = get(ctx, 'cohorts', id);
  if (id && (!cohort || cohortStage(cohort) !== 'flock')) return missing('flock');
  const parent = cohort ? 'cohort/' + id : 'flock';
  const history = cohort ? cohortEvents(cohort, ctx.data.cohortChanges) : [];
  const lastAllowedDate = history[0]?.date ?? ctx.today;
  const fromRearing = Boolean(cohort?.rearing);
  let dateKind = cohort?.dateKind === 'hatch' ? 'hatch' : 'purchase';

  function updateFields() {
    document.querySelector('label[for="date"]').textContent = dateKind === 'hatch' ? t.hatchDate : t.purchaseDate;
    document.getElementById('weeks-wrap').hidden = dateKind !== 'purchase';
  }

  return {title:cohort ? t.editCohort : t.addCohort, parent, form:true,
    body:form(`${field('name', t.nameLabel, cohort?.name, {length:80})}
      <div class="form-grid form-grid--aligned">${birdsField('hens', t.hens, cohort?.hens)}${birdsField('roosters', t.roosters, cohort?.roosters)}</div>
      ${fromRearing ? '' : `${choice('date-kind', t.boughtOrHatched, [['purchase', t.bought], ['hatch', t.hatched]], dateKind)}
      ${dateField('date', dateKind === 'hatch' ? t.hatchDate : t.purchaseDate, cohort?.date ?? ctx.today, '1900-01-01', lastAllowedDate)}
      <div id="weeks-wrap"${dateKind === 'purchase' ? '' : ' hidden'}>${field('weeks', t.ageAtPurchase, asInput(cohort?.weeks), {mode:'numeric'})}</div>`}
      ${field('mark', t.markOptional, cohort?.mark, {length:80})}`, t.save, Boolean(cohort)),
    change(target) {
      if (target.name === 'date-kind') {
        dateKind = target.value;
        updateFields();
      }
    },
    submit() {
      const name = readName(value('name'));
      const hens = readBirds('hens');
      const roosters = readBirds('roosters');
      if (!cohort && hens + roosters < 1) throw new FieldError('hens', t.atLeastOneBird);
      const fields = {name, hens, roosters, mark:text('mark'), notes:cohort?.notes ?? ''};
      if (!fromRearing) {
        fields.dateKind = dateKind;
        fields.date = readDate(value('date'), 'date', '1900-01-01', lastAllowedDate);
        fields.weeks = dateKind === 'purchase' ? readNumber(value('weeks'), 'weeks', {optional:true, digits:0, max:5200}) : null;
        fields.rearing = null;
      }
      if (cohort && !validCohortHistory({...cohort, ...fields}, history)) throw new FieldError('hens', t.historyConflict);
      return ctx.commit(data => put(data, 'cohorts', cohort, fields), parent);
    },
    action(action) {
      if (action !== 'delete') return;
      return removeCohort(ctx, id);
    }};
}

function removeCohort(ctx, id) {
  return ctx.commit(data => {
    remove(data, 'cohorts', id);
    for (const change of live(data.cohortChanges)) if (change.cohortId === id) change.deleted = true;
  }, 'flock', t.deleted);
}

// Klucie (inkubator albo kwoka) albo kupione pisklęta. Ten sam formularz służy do poprawiania liczb jaj.
export function rearingForm(ctx, id) {
  const cohort = get(ctx, 'cohorts', id);
  if (id && (!cohort?.rearing || cohortStage(cohort) === 'flock')) return missing('flock');
  const parent = cohort ? 'cohort/' + id : 'flock';
  const old = cohort?.rearing;
  let method = old?.method ?? 'incubator';
  const hatched = old && old.method !== 'bought' && old.chicks != null;
  const history = cohort ? cohortEvents(cohort, ctx.data.cohortChanges) : [];

  function show() {
    document.getElementById('egg-fields').hidden = method === 'bought';
    document.getElementById('bought-fields').hidden = method !== 'bought';
  }

  return {title:cohort ? t.editRearing : t.newRearing, parent, form:true,
    body:form(`${cohort ? '<p class="muted">' + html(t.methods[method]) + '</p>' : choice('method', t.rearingSource, Object.entries(t.methods), method)}
      ${field('name', t.nameLabel, cohort?.name ?? t.defaultRearingName(method, year(ctx.today)), {length:80})}
      <div id="egg-fields" class="stack tight"${method === 'bought' ? ' hidden' : ''}>
        ${dateField('set-date', t.setDate, old?.setDate ?? ctx.today, '1900-01-01', ctx.today)}
        ${birdsField('eggs', t.eggs, old?.eggs)}
        <div class="form-grid form-grid--aligned">${birdsField('infertile', t.infertile, old?.infertile)}${birdsField('dead', t.deadInShell, old?.dead)}</div>
        ${hatched ? `<div class="form-grid form-grid--aligned">${dateField('hatch-date', t.hatchedDate, cohort.date, old.setDate, ctx.today)}
          ${birdsField('hatched', t.hatchedCount, old.hatched)}</div>` : ''}</div>
      <div id="bought-fields" class="stack tight"${method === 'bought' ? '' : ' hidden'}>
        ${dateField('date', t.purchaseDate, old?.method === 'bought' ? cohort.date : ctx.today, '1900-01-01', ctx.today)}
        ${field('weeks', t.ageAtPurchase, asInput(cohort?.weeks), {mode:'numeric'})}
        ${birdsField('chicks', t.chicksCount, old?.method === 'bought' ? old.chicks : null)}</div>
      ${old?.feedFrom ? dateField('feed-from', t.switchFeedDate, old.feedFrom, cohort.date, ctx.today) : ''}`, t.save, Boolean(cohort)),
    change(target) {
      if (target.name === 'method') {
        const nameInput = document.getElementById('name');
        if (!cohort && nameInput.value === t.defaultRearingName(method, year(ctx.today))) {
          nameInput.value = t.defaultRearingName(target.value, year(ctx.today));
        }
        method = target.value;
        show();
      }
    },
    submit() {
      const name = readName(value('name'));
      const rearing = {method, setDate:null, eggs:null, infertile:null, dead:null, hatched:null, chicks:null, feedFrom:null};
      const fields = {name, rearing, hens:cohort?.hens ?? 0, roosters:cohort?.roosters ?? 0, mark:cohort?.mark ?? '', notes:cohort?.notes ?? ''};
      if (method === 'bought') {
        Object.assign(fields, {dateKind:'purchase', date:readDate(value('date'), 'date', '1900-01-01', history[0]?.date ?? ctx.today),
          weeks:readNumber(value('weeks'), 'weeks', {optional:true, digits:0, max:5200})});
        rearing.chicks = readBirds('chicks', 1);
      } else {
        rearing.setDate = readDate(value('set-date'), 'set-date', '1900-01-01', ctx.today);
        rearing.eggs = readBirds('eggs', 1);
        rearing.infertile = readNumber(value('infertile'), 'infertile', {optional:true, digits:0, max:rearing.eggs});
        rearing.dead = readNumber(value('dead'), 'dead', {optional:true, digits:0, max:rearing.eggs});
        if ((rearing.infertile ?? 0) + (rearing.dead ?? 0) > rearing.eggs) throw new FieldError('dead', t.eggsTooFew);
        Object.assign(fields, {dateKind:'hatch', date:null, weeks:null});
        if (hatched) {
          fields.date = readDate(value('hatch-date'), 'hatch-date', rearing.setDate, history[0]?.date ?? ctx.today);
          rearing.hatched = readBirds('hatched');
          if (rearing.hatched > rearing.eggs) throw new FieldError('hatched', t.hatchedTooMany);
          rearing.chicks = rearing.hatched;
        }
      }
      if (old?.feedFrom) rearing.feedFrom = readDate(value('feed-from'), 'feed-from', fields.date ?? '1900-01-01', ctx.today);
      if (cohort && !validCohortHistory({...cohort, ...fields}, history)) throw new FieldError('', t.historyConflict);
      return ctx.commit(data => put(data, 'cohorts', cohort, fields), cohort ? parent : 'flock');
    },
    action(action) {
      if (action === 'delete') return removeCohort(ctx, id);
    }};
}

export function hatchForm(ctx, id) {
  const cohort = get(ctx, 'cohorts', id);
  if (!cohort || cohortStage(cohort) !== 'incubation') return missing('flock');
  const parent = 'cohort/' + id;
  const rearing = cohort.rearing;
  const left = rearing.eggs - (rearing.infertile ?? 0) - (rearing.dead ?? 0);
  return {title:t.enterHatched, subtitle:cohort.name, parent, form:true,
    body:form(`${dateField('date', t.hatchedDate, ctx.today, rearing.setDate, ctx.today)}
      ${birdsField('hatched', t.hatchedCount, left)}`),
    submit() {
      const date = readDate(value('date'), 'date', rearing.setDate, ctx.today);
      const hatched = readBirds('hatched');
      if (hatched > rearing.eggs) throw new FieldError('hatched', t.hatchedTooMany);
      return ctx.commit(data => put(data, 'cohorts', cohort, {date, dateKind:'hatch', weeks:null,
        rearing:{...rearing, hatched, chicks:hatched}}), parent);
    }};
}

export function feedSwitchForm(ctx, id) {
  const cohort = get(ctx, 'cohorts', id);
  if (!cohort || cohortStage(cohort) !== 'chicks') return missing('flock');
  const parent = 'cohort/' + id;
  return {title:t.switchFeed, subtitle:cohort.name, parent, form:true,
    body:form(dateField('date', t.switchFeedDate, ctx.today, cohort.date, ctx.today)),
    submit() {
      const feedFrom = readDate(value('date'), 'date', cohort.date, ctx.today);
      return ctx.commit(data => put(data, 'cohorts', cohort, {rearing:{...cohort.rearing, feedFrom}}), parent);
    }};
}

export function transferForm(ctx, id) {
  const cohort = get(ctx, 'cohorts', id);
  if (!cohort || cohortStage(cohort) !== 'chicks') return missing('flock');
  const parent = 'cohort/' + id;
  const history = cohortEvents(cohort, ctx.data.cohortChanges);
  const earliest = history.at(-1)?.date > cohort.date ? history.at(-1).date : cohort.date;
  const now = cohortCounts(cohort, ctx.data.cohortChanges, ctx.today).young;
  return {title:t.moveToFlock, subtitle:cohort.name, parent, form:true,
    body:form(`<p class="muted">${html(t.moveHelp(fmt.chicks(now)))}</p>
      ${dateField('date', t.moveDate, ctx.today, earliest, ctx.today)}
      <div class="form-grid form-grid--aligned">${birdsField('hens', t.hens, null)}${birdsField('roosters', t.roosters, null)}</div>`),
    submit() {
      const joined = readDate(value('date'), 'date', earliest, ctx.today);
      const hens = readBirds('hens');
      const roosters = readBirds('roosters');
      const young = cohortCounts(cohort, ctx.data.cohortChanges, joined).young;
      if (hens + roosters !== young) throw new FieldError('roosters', t.moveCountMismatch(fmt.number(young)));
      return ctx.commit(data => put(data, 'cohorts', cohort, {joined, hens, roosters}), parent);
    }};
}

export function changeForm(ctx, id, changeId) {
  const cohort = get(ctx, 'cohorts', id);
  // „change/id/loss” i „change/id/add” otwierają nowy wpis z wybranym kierunkiem (przyciski Ubyło / Przybyło).
  // Stare adresy miały rodzaj zdarzenia przed identyfikatorem.
  let preset = 'loss';
  if (['add', 'loss', 'correction', 'status'].includes(changeId)) {
    if (changeId === 'add') preset = 'add';
    changeId = arguments[3];
  }
  const old = changeId ? get(ctx, 'cohortChanges', changeId) : null;
  if (!cohort || cohortStage(cohort) === 'incubation' ||
    (changeId && (!old || old.cohortId !== id || !['add', 'loss'].includes(flockEventKind(old))))) return missing('flock');
  const parent = 'cohort/' + id;
  const young = old ? old.sex === 'young' : cohortStage(cohort) === 'chicks';
  const history = cohortEvents(cohort, ctx.data.cohortChanges);
  const others = history.filter(event => event.id !== changeId);
  const minDate = young ? cohort.date : cohort.joined ?? cohort.date;
  return {title:t.changeCount, subtitle:cohort.name, parent, form:true,
    body:form(`${choice('direction', t.lessOrMore, [['loss', t.less], ['add', t.more]], old?.type ?? preset)}
      ${young ? '' : choice('sex', t.whichBirds, [['hens', t.hens], ['roosters', t.roosters]], old?.sex ?? 'hens')}
      ${numberField('count', t.howMany, asInput(old?.count), t.pcs, 'numeric')}
      ${dateInput(ctx, 'date', t.date, old?.date, minDate)}
      ${textarea('notes', t.note, old?.notes)}
      <div class="actions hint-chips">${t.hints.map((hint, index) => button(hint, 'hint:' + index, 'chip')).join('')}</div>`, t.save, Boolean(old)),
    submit() {
      const type = chosen('direction');
      const sex = young ? 'young' : chosen('sex');
      const date = readDate(value('date'), 'date', minDate, young && cohort.joined ? addDays(cohort.joined, -1) : ctx.today);
      const count = readNumber(value('count'), 'count', {digits:0, max:maxBirds, min:1});
      const fields = {cohortId:id, type, sex, date, count, notes:text('notes')};
      const order = history.reduce((highest, event) => Math.max(highest, event.order ?? 0), 0);
      const entry = old ? {...old, ...fields} : record({...fields, order:order + 1});
      if (!validCohortHistory(cohort, [...others, entry])) throw new FieldError('count', t.historyConflict);
      return ctx.commit(data => put(data, 'cohortChanges', old, entry), parent);
    },
    action(action) {
      if (action.startsWith('hint:')) {
        document.getElementById('notes').value = t.hints[Number(action.slice(5))];
        ctx.dirty();
      }
      if (action !== 'delete') return;
      if (!validCohortHistory(cohort, others)) throw new FieldError('', t.deleteConflict);
      return ctx.commit(data => remove(data, 'cohortChanges', changeId), parent, t.deleted);
    }};
}

export function settingsForm(ctx, origin) {
  const settings = ctx.derived.settings;
  const parent = ['start', 'feed', 'stock', 'flock'].includes(origin) ? origin : 'start';
  const canShare = Boolean(navigator.canShare && navigator.share);
  const hasFlock = ctx.derived.cohorts.length > 0;
  const fileInput = '<input id="backup-file" hidden type="file" accept=".json,application/json">';
  return {title:t.settings, parent, form:true,
    body:form(`${field('threshold', t.threshold, asInput(settings.threshold), {mode:'numeric'})}
      ${hasFlock ? field('default-per-bird', t.defaultPerBird, asInput(settings.defaultPerBird ?? defaultPerBird), {mode:'numeric'})
        : field('default-daily', t.defaultDaily, asInput(settings.defaultDaily / 1000), {mode:'decimal'})}
      <p class="muted">${t.defaultDailyHelp}</p>
      ${priceInput('ready', t.readyPrice, settings.readyPrice === null ? null : settings.readyPrice / 100)}
      <section class="card stack tight"><h2>${t.backup}</h2>
        <p class="muted">${settings.lastExport ? t.lastBackup(fmt.fullDate(settings.lastExport)) : t.noBackup}</p>
        <p class="muted">${t.backupHelp}</p>
        <div class="actions">${button(t.makeBackup, 'share', 'tonal', canShare ? 'share' : 'download')}
          ${canShare ? button(t.downloadBackup, 'export', 'text', 'download') : ''}
          ${button(t.loadBackup, 'import', 'text')}</div>${fileInput}</section>
      <p class="muted">${t.appName} · ${t.version} ${ctx.version}</p>`),
    submit() {
      const threshold = readNumber(value('threshold'), 'threshold', {min:1, max:3650, digits:0});
      const usage = hasFlock
        ? {defaultPerBird:readNumber(value('default-per-bird'), 'default-per-bird', {min:1, max:1000, digits:0})}
        : {defaultDaily:Math.round(readNumber(value('default-daily'), 'default-daily', amountOptions) * 1000)};
      const entered = readNumber(value('ready'), 'ready', {optional:true, min:.01, max:100000000, digits:2});
      const readyPrice = entered === null ? null : Math.round(entered * 100);
      return ctx.commit(data => Object.assign(data.settings[0], {threshold, readyPrice, ...usage}), parent);
    },
    change(target) {
      if (target.id === 'backup-file' && target.files[0]) return ctx.importBackup(target.files[0]);
    },
    action(action) {
      if (action === 'import') document.getElementById('backup-file').click();
      if (action === 'export' || action === 'share') return ctx.exportBackup(action === 'share');
    }};
}
