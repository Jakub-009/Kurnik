import {t} from '../ui/texts.js';
import {addDays, batchResult, cohortEvents, ingredientMass, isAdditive, lastBatchMass, lastStockSource, nextFlockEventOrder, nextSavedOrder, recipeBaseItems, recipeComposition, scaleBatchRecipe, stock, sumItemMass, validCohortHistory} from './calc/index.js';
import {live,record} from './db.js';
import {find, put, putBatch, remove, removeBatch, removeRecipe, showAmount} from './model.js';
import {missing} from './views.js';
import {button, choices, changeRow, dateField, details, empty, field, FieldError, form, html, iconButton,
  link, numberField, readDate, readName, readNumber, select, textarea} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';

const amountLimit = 10000000;
const amountOptions = {min:.001,max:amountLimit};
const movementLabels = {add:t.dodajDoMagazynu, addition:t.wlasny, purchase:t.zakup,
  correction:t.korektaStanu, withdrawal:t.innePobranie};
const value = name => document.getElementById(name).value;
const dateInput = (ctx, name, label, date = ctx.today, min) => dateField(name,label,date,min,ctx.today);
const asInput = (number, digits) => fmt.editable(number, digits);
const text = (name, fallback = '') => (document.getElementById(name)?.value ?? fallback).trim();
const priceInput = (name, label, initial) => field(name,label,asInput(initial,2),{mode:'decimal',length:14});
const normalize = name => name.trim().toLocaleLowerCase('pl');
const get = (ctx, store, id) => find(ctx.data,store,id);

function physicalMass(amount, ingredient, fieldName) {
  try { return ingredientMass(Math.round(amount * 1000), ingredient.unit, ingredient.density); }
  catch (error) { throw new FieldError(fieldName,error.message); }
}

function ingredientFields(prefix, item) {
  return `${field(prefix + 'name',t.nazwa,item?.name,{length:80})}
    ${select(prefix + 'unit',t.jednostka,[['kg','kg'],['l','l']],item?.unit ?? 'kg')}
    <div id="${prefix}density-wrap"${item?.unit !== 'l' ? ' hidden' : ''}>
      ${field(prefix + 'density',t.gestoscKgL,asInput(item?.density),{mode:'decimal'})}</div>
    ${select(prefix + 'role',t.rodzaj,[['base',t.liczonyWProporcjach],['additive',t.dodatekPozaMasa]],
        item && isAdditive(item) ? 'additive' : 'base')}`;
}

function updateIngredientFields(prefix, target) {
  if (target.id !== prefix + 'unit') return;
  const hidden = target.value !== 'l';
  document.getElementById(prefix + 'density-wrap').hidden = hidden;
}

function ingredientValues(prefix, ingredients, id, lockedUnit) {
  const name = readName(value(prefix + 'name'),prefix + 'name');
  if (ingredients.some(row => row.id !== id && normalize(row.name) === normalize(name))) {
    throw new FieldError(prefix + 'name',t.maszJuzSkladnikOTejNazwie);
  }
  const unit = value(prefix + 'unit');
  if (lockedUnit && unit !== lockedUnit) {
    throw new FieldError(prefix + 'unit',t.jednostkiNieMoznaZmienicBoSa);
  }
  const density = unit === 'l' ? readNumber(value(prefix + 'density'),prefix + 'density',{min:.001,max:100}) : null;
  return {name,unit,density,kind:value(prefix + 'role')};
}

export function ingredientForm(ctx, id) {
  const old = get(ctx,'ingredients',id);
  if (id && !old) return missing('stock');
  const parent = old ? 'ingredient/' + id : 'stock';
  const referenced = old && (ctx.data.recipes.some(row => row.items.some(item => item.ingredientId === id)) ||
    ctx.data.ingredientEvents.some(row => row.ingredientId === id));
  return {
    title:old ? t.edytujSkladnik : t.dodajSkladnik, parent, form:true,
    body:form(`${ingredientFields('',old)}
      ${referenced ? `<p class="muted">${t.jednostkiNieMoznaZmienicBoSa}</p>` : ''}`, t.zapisz, Boolean(old)),
    change(target) {
      updateIngredientFields('',target);
    },
    submit() {
      const fields = ingredientValues('',ctx.derived.ingredients,id,referenced ? old.unit : null);
      if (old && isAdditive(fields) && !isAdditive(old)) {
        const updated = ctx.derived.ingredients.map(ingredient => ingredient.id === id ? {...old,...fields} : ingredient);
        for (const recipe of ctx.derived.recipes.filter(recipe => recipe.items.some(item => item.ingredientId === id))) {
          const baseCount = recipeBaseItems(recipe,updated).length;
          if (!baseCount) throw new FieldError('role',t.recepturaMusiMiecChocJedenSkladnik);
        }
      }
      if (old && fields.density !== old.density) {
        for (const recipe of ctx.derived.recipes) {
          const item = recipe.items.find(row => row.ingredientId === id);
          if (item) physicalMass(item.amount / 1000, fields, 'density');
        }
      }
      return ctx.commit(data => put(data,'ingredients',old,{...fields,price:old?.price ?? null}), parent);
    },
    action(action) {
      if (action !== 'delete') return;
      if (ctx.derived.recipes.some(row => row.items.some(item => item.ingredientId === id))) {
        throw new FieldError('', t.najpierwUsunTenSkladnikZReceptur);
      }
      if (live(ctx.data.ingredientEvents).some(row => row.ingredientId === id)) {
        throw new FieldError('', t.nieMoznaUsunacSkladnikaKtoryMa);
      }
      return ctx.commit(data => remove(data,'ingredients',id),'stock',t.usunieto);
    }
  };
}

export function recipeForm(ctx, id) {
  const old = get(ctx,'recipes',id);
  if (id && !old) return missing('feed');
  const parent = old ? 'recipe/' + id : 'feed';
  const ingredients = ctx.derived.ingredients.slice().sort((a,b) => a.name.localeCompare(b.name,'pl'));
  const drafted = [];
  const optionLabel = row => row.name + (isAdditive(row) ? t.additiveOption + row.unit + ')' : ' (' + row.unit + ')');
  const options = () => [['',t.wybierz],...ingredients.map(row => [row.id,optionLabel(row)])];
  let next = 0;
  const readLine = (ingredientId = '', amount) => {
    const index = next++;
    const ingredient = ingredients.find(row => row.id === ingredientId);
    return `<div class="recipe-line" data-recipe-line="${index}">${select('ingredient-' + index,t.skladnik,options(),ingredientId)}
      ${field('amount-' + index,ingredient ? t.ilosc + ingredient.unit + ')' : t.ilosc2,asInput(amount),{mode:'decimal',length:17})}
      ${iconButton(t.usunPozycje,'del','drop:' + index)}</div>`;
  };
  const items = old ? old.items.map(item => readLine(item.ingredientId,item.amount / 1000)).join('') : readLine();
  const lines = () => [...document.querySelectorAll('[data-recipe-line]')];
  function updateAmountLabel(selectInput) {
    const ingredient = ingredients.find(row => row.id === selectInput.value);
    const index = selectInput.closest('[data-recipe-line]').dataset.recipeLine;
    document.querySelector('label[for="amount-' + index + '"]').textContent =
      ingredient ? t.ilosc + ingredient.unit + ')' : t.ilosc2;
  }
  return {title:old ? t.edytujRecepture : t.dodajRecepture,parent,form:true,
    body:form(`${field('name',t.nazwa,old?.name,{length:80})}<fieldset class="stack tight"><legend>${t.skladniki}</legend>
      <div class="stack tight" id="recipe-lines">${items}</div><div class="actions">
      ${button(t.dodajPozycje,'add-line','tonal','plus')}${button(t.utworzSkladnik,'new-ingredient')}</div></fieldset>
      <fieldset class="card stack" id="new-ingredient" hidden><legend>${t.nowySkladnik}</legend>
        ${ingredientFields('new-',null)}<div class="actions">${button(t.dodajSkladnik,'use-ingredient','','plus')}
        ${button(t.anuluj,'cancel-ingredient')}</div></fieldset>
      ${textarea('notes',t.uwagiOpcjonalnie,old?.notes)}`, t.zapisz, Boolean(old)),
    change(target) {
      updateIngredientFields('new-',target);
      if (target.id.startsWith('ingredient-')) updateAmountLabel(target);
    },
    submit() {
      const name = readName(value('name'));
      const seen = new Set();
      const written = lines().map(line => {
        const index = line.dataset.recipeLine;
        const ingredientId = value('ingredient-' + index);
        const ingredient = ingredients.find(row => row.id === ingredientId);
        if (!ingredient) throw new FieldError('ingredient-' + index,t.wybierzSkladnik);
        if (seen.has(ingredientId)) throw new FieldError('ingredient-' + index,t.tenSkladnikZostalJuzDodany);
        seen.add(ingredientId);
        const amount = readNumber(value('amount-' + index),'amount-' + index,amountOptions);
        physicalMass(amount,ingredient,'amount-' + index);
        return {ingredientId,amount:Math.round(amount * 1000)};
      });
      if (!recipeBaseItems({items:written},ingredients).length) throw new FieldError('',t.dodajCoNajmniejJedenSkladnikOprocz);
      if (!document.getElementById('new-ingredient').hidden) {
        throw new FieldError('new-name',t.dodajSkladnikDoRecepturyAlboAnuluj);
      }
      return ctx.commit(data => {
        const used = new Set(written.map(item => item.ingredientId));
        for (const ingredient of drafted) {
          if (used.has(ingredient.id)) put(data,'ingredients',null,ingredient);
        }
        put(data,'recipes',old,{name,items:written,notes:text('notes'),current:old?.current ?? !live(data.recipes).length});
      },parent);
    },
    action(action) {
      const editor = document.getElementById('new-ingredient');
      if (action === 'new-ingredient') {
        editor.hidden = false;
        document.getElementById('new-name').focus();
      }
      if (action === 'cancel-ingredient' || action === 'use-ingredient') {
        if (action === 'use-ingredient') {
          const ingredient = {id:crypto.randomUUID(),...ingredientValues('new-',[...ctx.derived.ingredients,...drafted]),price:null};
          drafted.push(ingredient);
          ingredients.push(ingredient);
          const selectors = [...document.querySelectorAll('#recipe-lines select')];
          const blank = selectors.find(item => !item.value);
          for (const item of selectors) item.add(new Option(optionLabel(ingredient),ingredient.id));
          if (blank) {
            blank.value = ingredient.id;
            updateAmountLabel(blank);
          } else document.getElementById('recipe-lines').insertAdjacentHTML('beforeend',readLine(ingredient.id));
          const index = blank ? blank.id.slice('ingredient-'.length) : next - 1;
          document.getElementById('amount-' + index).focus();
          ctx.dirty();
        }
        editor.hidden = true;
        document.getElementById('new-name').value = '';
        document.getElementById('new-unit').value = 'kg';
        document.getElementById('new-density').value = '';
        document.getElementById('new-density-wrap').hidden = true;
        document.getElementById('new-role').value = 'base';
      }
      if (action === 'add-line') {
        document.getElementById('recipe-lines').insertAdjacentHTML('beforeend',readLine());
        document.getElementById('ingredient-' + (next - 1)).focus();
        ctx.dirty();
      }
      if (action.startsWith('drop:')) {
        document.getElementById('ingredient-' + action.slice(5)).closest('[data-recipe-line]').remove();
        ctx.dirty();
      }
      if (action === 'delete') return ctx.commit(data => removeRecipe(data,id),'feed',t.usunieto);
    }};
}

export function recipeOrderForm(ctx, id) {
  const recipe = get(ctx,'recipes',id);
  if (!recipe) return missing('feed');
  const parent = 'recipe/' + id;
  const initial = recipe.items.map(item => item.ingredientId);
  const list = () => document.getElementById('recipe-order-list');
  const order = () => [...list().children].map(item => item.dataset.ingredient);
  const changed = () => order().some((ingredientId,index) => ingredientId !== initial[index]);
  const ingredientNames = new Map(ctx.derived.ingredients.map(item => [item.id,item]));
  const rows = initial.map(ingredientId => {
    const ingredient = ingredientNames.get(ingredientId);
    return `<li class="order-row" data-ingredient="${html(ingredientId)}">
      <span class="grow">${html(ingredient.name)}${isAdditive(ingredient) ? ` <small>${t.dodatek}</small>` : ''}</span>
      <button class="icon-button order-handle" type="button" aria-label="${html(t.przenies + ingredient.name)}"
        aria-describedby="reorder-help">${icon('grip')}</button></li>`;
  }).join('');

  function announce(row) {
    const index = order().indexOf(row.dataset.ingredient);
    const name = ingredientNames.get(row.dataset.ingredient).name;
    document.getElementById('order-status').textContent = name + t.pozycja + fmt.number(index + 1) + ' z ' + fmt.number(initial.length);
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
      const speed = y < edge ? -Math.min(16,(edge - y) / 4) : y > bottom ? Math.min(16,(y - bottom) / 4) : 0;
      if (speed) {
        window.scrollBy(0,speed);
        placeRow(y);
      }
      frameId = requestAnimationFrame(scrollDuringDrag);
    }

    container.addEventListener('pointerdown',event => {
      const handle = event.target.closest('.order-handle');
      if (!handle || event.button !== 0 || drag) return;
      const row = handle.closest('li');
      drag = {row,id:event.pointerId,y:event.clientY,previous:[...container.children]};
      container.setPointerCapture(event.pointerId);
      row.classList.add('order-row--dragging');
      frameId = requestAnimationFrame(scrollDuringDrag);
      event.preventDefault();
    });
    container.addEventListener('pointermove',event => {
      if (event.pointerId !== drag?.id) return;
      drag.y = event.clientY;
      placeRow(drag.y);
    });
    function finishDrag(event) {
      if (event.pointerId !== drag?.id) return;
      const {row,previous} = drag;
      drag = null;
      cancelAnimationFrame(frameId);
      row.classList.remove('order-row--dragging');
      if (event.type === 'pointerup') announce(row);
      else container.append(...previous);
    }
    for (const event of ['pointerup','pointercancel','lostpointercapture']) container.addEventListener(event,finishDrag);

    container.addEventListener('keydown',event => {
      const handle = event.target.closest('.order-handle');
      if (!handle || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const row = handle.closest('li');
      if (event.key === 'ArrowUp') row.previousElementSibling?.before(row);
      else row.nextElementSibling?.after(row);
      handle.focus({preventScroll:true});
      announce(row);
    });
  }

  return {title:t.zmienKolejnosc,subtitle:recipe.name,parent,form:true,mount:bindDrag,
    body:form(`<p class="muted" id="reorder-help">${t.przeciagnijSkladnikiZaUchwytZKlawiatury}</p>
      <ol class="list order-list" id="recipe-order-list">${rows}</ol><p class="muted" id="order-status" role="status"></p>`),
    submit() {
      if (!changed()) return ctx.done(parent);
      const items = new Map(recipe.items.map(item => [item.ingredientId,item]));
      const reordered = order().map(ingredientId => items.get(ingredientId));
      return ctx.commit(data => put(data,'recipes',recipe,{items:reordered}),parent);
    }};
}

export function movementForm(ctx, type, ingredientId, eventId) {
  if (!Object.hasOwn(movementLabels,type)) return missing('stock');
  const old = get(ctx,'ingredientEvents',eventId);
  if (eventId && (!old || old.type !== type || old.ingredientId !== ingredientId)) return missing('stock');
  let ingredient = get(ctx,'ingredients',ingredientId) ?? ctx.derived.ingredients[0];
  const ingredientRoute = ingredientId ? 'ingredient/' + ingredientId : 'stock';
  const parent = old ? 'movement-detail/' + old.id : ingredientRoute;
  if (!ingredient) return {title:movementLabels[type],parent:'stock',
    body:empty(t.najpierwDodajSkladnikDoMagazynu,link(t.dodajSkladnik,'ingredient-form','','plus'))};
  const correction = type === 'correction';
  const add = type === 'add';
  const purchase = type === 'purchase';
  const canPrice = purchase || add;
  const sources = [['purchase',t.zakup],['addition',t.wlasny]];
  let source = add ? lastStockSource(ctx.data.ingredientEvents,ingredient) : type;
  function showSource() {
    document.getElementById('addition-options').innerHTML = choices('source',sources,source);
    document.getElementById('purchase-fields').hidden = source !== 'purchase';
  }
  const selection = ctx.derived.ingredients.slice().sort((a,b) => a.name.localeCompare(b.name,'pl'));
  let date = old?.date ?? ctx.today;
  const currentStock = () => {
    if (!correction) return stock(ctx.data.ingredientEvents,ingredient.id,old?.id);
    const earlier = ctx.data.ingredientEvents.filter(event => event.date < date ||
      (event.date === date && (!old || event.createdAt <= old.createdAt)));
    return stock(earlier,ingredient.id,old?.id);
  };
  const initialAmount = old ? showAmount(correction ? old.measured ?? (currentStock() + old.grams) : Math.abs(old.grams), ingredient) : null;
  const signed = (grams, sign = true) => fmt.stockQuantity(showAmount(grams,ingredient),ingredient.unit,sign);
  const initialPrice = item => old ? old.price : item.price;
  const defaultMode = old?.priceMode ?? 'per-kg';
  const shownPrice = (price, mode, item) => {
    if (!price) return null;
    if (mode === 'total') return price.cents / 100 * old.grams / price.grams;
    return price.cents * 10 / price.grams * (mode === 'per-litre' ? item.density : 1);
  };
  const modes = item => [['per-kg',t.zaKg],...(item.unit === 'l' ? [['per-litre',t.zaLitr]] : []),['total',t.lacznie]];
  const priceBlock = (item, mode) => `<div class="form-grid" id="prices">
    ${select('price-mode',t.jakPodajeszCene,modes(item),mode)}
    ${priceInput('price',t.cenaZlOpcjonalnie,shownPrice(initialPrice(item),mode,item))}</div>`;
  const getQuantity = () => {
    if (old && value('quantity') === asInput(initialAmount)) return correction ? (old.measured ?? currentStock() + old.grams) : Math.abs(old.grams);
    const amount = readNumber(value('quantity'),'quantity',correction ? {max:amountLimit} : amountOptions);
    return amount === 0 ? 0 : physicalMass(amount,ingredient,'quantity');
  };
  const correctionDelta = grams => old && date === old.date && grams === old.measured ? old.grams : grams - currentStock();
  const updateDifference = () => {
    if (!correction) return;
    const output = document.getElementById('difference');
    document.getElementById('calculated-stock').textContent = signed(currentStock(),false);
    try { output.textContent = t.roznica + signed(correctionDelta(getQuantity())); }
    catch { output.textContent = ''; }
  };

  return {title:movementLabels[type],subtitle:ingredientId ? ingredient.name : '',parent,form:true,
    body:form(`${ingredientId ? '' : select('ingredient',t.skladnik,selection.map(row => [row.id,row.name]),ingredient.id)}
      ${changeRow(t.data,fmt.fullDate(date),'date')}
      <div id="date-wrap" hidden>${dateInput(ctx,'date',t.dataWpisu,date)}</div>
      ${correction ? `<p>${t.powinnoByc} <strong id="calculated-stock">` + signed(currentStock(),false) + '</strong></p>' : ''}
      ${numberField('quantity',correction ? t.jestFaktycznie : t.ilosc2,asInput(initialAmount),ingredient.unit)}
      ${correction ? '<p id="difference" role="status">' + (old ? t.roznica + signed(old.grams) : '') + '</p>' : ''}
      ${add ? `<div class="actions" id="addition-options">${choices('source',sources,source)}</div>` : ''}
      ${canPrice ? `<div id="purchase-fields"${source === 'purchase' ? '' : ' hidden'}>${priceBlock(ingredient,defaultMode)}</div>` : ''}
      ${!correction ? textarea('notes',t.uwagiOpcjonalnie,old?.notes) : ''}`,t.zapisz,Boolean(old)),
    change(target) {
      if (target.id === 'date' && target.value) {
        date = target.value;
        document.querySelector('[data-action="date"]').previousElementSibling.querySelector('strong').textContent = fmt.fullDate(date);
        updateDifference();
      }
      if (target.id === 'ingredient') {
        ingredient = get(ctx,'ingredients',target.value);
        document.querySelector('[data-unit-for="quantity"]').textContent = ingredient.unit;
        if (canPrice) document.getElementById('prices').outerHTML = priceBlock(ingredient,'per-kg');
        if (add) {
          source = lastStockSource(ctx.data.ingredientEvents,ingredient);
          showSource();
        }
        updateDifference();
      }
      if (target.id === 'price-mode') {
        const priceField = document.getElementById('price');
        if (old || target.value !== 'total') {
          priceField.value = asInput(shownPrice(initialPrice(ingredient),target.value,ingredient),2);
        } else priceField.value = '';
      }
      if (target.id === 'quantity') updateDifference();
    },
    submit() {
      const when = readDate(value('date'),'date','1900-01-01',ctx.today);
      date = when;
      const grams = getQuantity();
      let price = null;
      let priceMode = null;
      const kind = source;
      if (kind === 'purchase') {
        priceMode = value('price-mode');
        const original = initialPrice(ingredient);
        const defaultPrice = priceMode === 'total' && !old ? null : shownPrice(original,priceMode,ingredient);
        const defaultText = asInput(defaultPrice,2);
        if (original && value('price') === defaultText && defaultText && (!old || priceMode !== 'total' || grams === old.grams)) {
          price = original;
        } else {
          const entered = readNumber(value('price'),'price',{optional:true,min:.01,max:100000000,digits:2});
          if (entered !== null) price = {cents:Math.round(entered * 100),grams:priceMode === 'total' ? grams
            : priceMode === 'per-litre' ? Math.round(ingredient.density * 1000) : 1000};
        }
      }
      const balance = correction ? correctionDelta(grams) : kind === 'withdrawal' ? -grams : grams;
      return ctx.commit(data => {
        if (add) find(data,'ingredients',ingredient.id).lastSource = kind;
        put(data,'ingredientEvents',old,{ingredientId:ingredient.id,
          type:kind,date:when,grams:balance,measured:correction ? grams : null,price,priceMode,batchId:null,notes:text('notes')});
      },parent);
    },
    action(action) {
      if (action.startsWith('source:')) {
        source = action.slice(7);
        showSource();
        ctx.dirty();
      }
      if (action === 'date') {
        const wrap = document.getElementById('date-wrap');
        wrap.hidden = !wrap.hidden;
        if (!wrap.hidden) document.getElementById('date').focus();
      }
      if (action === 'delete') return ctx.commit(data => remove(data,'ingredientEvents',eventId),ingredientRoute,t.usunieto);
    }};
}

export function mixForm(ctx, name, id, origin) {
  const editing = name === 'batch-form';
  const original = editing ? get(ctx,'batches',id) : null;
  if (editing && !original) return missing('feed');
  const ingredients = ctx.derived.ingredients;
  const recipeList = ctx.derived.recipes.filter(item => recipeBaseItems(item,ingredients).length);
  let recipe = recipeList.find(item => item.id === id) ?? recipeList.find(item => item.current) ?? recipeList[0];
  const parent = editing ? 'batch/' + id : (origin === 'start' ? 'start' : get(ctx,'recipes',id) ? 'recipe/' + id : 'feed');
  if (!editing && !recipe) return {title:t.mieszam,parent,
    body:empty(t.najpierwDodajRecepture,link(t.dodajRecepture,'recipe-form','','plus'))};

  const customLimits = {min:1,max:2000};
  let target = lastBatchMass(ctx.derived.batches);
  if (target < 1000 || target > 2000000) target = 100000;
  let massChoice = [50000,100000].includes(target) ? String(target) : 'custom';
  let date = original?.date ?? ctx.today;
  let start = original?.start ?? ctx.today;
  let items = original ? structuredClone(original.items) : [];
  let selected = new Set();
  let editedIndex = null;

  function scale() {
    items = scaleBatchRecipe(recipeComposition(recipe,ingredients),target);
    selected = new Set();
  }
  if (!editing) scale();
  const batchMass = () => sumItemMass(items.filter(item => !item.additive && !item.oil));
  const label = item => item.name + (item.additive || item.oil ? t.dodatek2 : '');

  function chips() {
    return choices('mass',[['50000',fmt.mass(50000)],['100000',fmt.mass(100000)],['custom',t.inna]],massChoice);
  }

  function recipeChips() {
    return choices('choose',recipeList.map(item => [item.id,item.name]),recipe.id);
  }

  function itemEditor(index) {
    const item = items[index];
    return `<div class="card stack" id="quantity-edit">${numberField('adjust',t.ilosc3 + item.name,
      asInput(item.millilitres == null ? showAmount(item.grams,item) : item.millilitres / 1000),item.unit)}
      <div class="actions">${button(t.zastosujIlosc,'apply-quantity','tonal','check')}${button(t.anuluj,'cancel-quantity')}</div></div>`;
  }

  function checkList() {
    return items.map((item,index) => {
      const amount = fmt.mixingQuantity(item.millilitres == null ? showAmount(item.grams,item) : item.millilitres / 1000,item.unit);
      return `<div class="checklist-row">
      ${editing ? '<span class="grow">' + html(label(item)) + '</span>' :
        `<label for="check-${index}"><input id="check-${index}" type="checkbox" data-check="${index}" ${selected.has(index) ? 'checked' : ''}><span>${html(label(item))}</span></label>`}
      <button class="button" type="button" data-action="quantity:${index}" aria-label="${html(t.zmienIlosc + item.name + ', ' + amount)}">
        ${amount}${icon('edit')}</button></div>${editedIndex === index ? itemEditor(index) : ''}`;
    }).join('');
  }

  function dateSection() {
    return `${changeRow(t.mieszanie,fmt.fullDate(date),'show-dates')}
      ${changeRow(t.karmienieOd,fmt.fullDate(start),'show-dates')}
      <div class="form-grid" id="mix-dates" hidden>${dateInput(ctx,'mixed',t.dataMieszania,date)}
        ${dateField('start',t.karmienieOd,start,date,original?.end ? addDays(original.end,-1) : '9999-12-30')}</div>`;
  }

  function renderMix() {
    document.getElementById('checklist').innerHTML = checkList();
    document.getElementById('actual-mass').textContent = fmt.stockQuantity(batchMass()/1000,'kg');
  }

  function changeMass(grams) {
    if (grams === target) return;
    target = grams;
    editedIndex = null;
    scale();
    renderMix();
  }

  function applyQuantity() {
    if (editedIndex === null) return;
    const item = items[editedIndex];
    const raw = value('adjust');
    const previous = item.millilitres == null ? showAmount(item.grams,item) : item.millilitres / 1000;
    if (raw !== asInput(previous) || !item.grams) {
      const amount = readNumber(raw,'adjust',amountOptions);
      item.grams = physicalMass(amount,item,'adjust');
      if ((item.additive || item.oil) && item.unit === 'l') item.millilitres = Math.round(amount * 1000);
      selected.delete(editedIndex);
      ctx.dirty();
    }
    const index = editedIndex;
    editedIndex = null;
    renderMix();
    document.querySelector('[data-action="quantity:' + index + '"]').focus({preventScroll:true});
  }

  return {title:editing ? t.edytujPartie : t.mieszam,subtitle:original?.recipeName,parent,form:true,
    body:form(`${editing ? '' : `<fieldset><legend>${t.receptura}</legend><div class="actions" id="recipe-chips">${recipeChips()}</div></fieldset>
      <fieldset><legend>${t.masaMieszankiBezDodatkow}</legend><div class="actions" id="mass-chips">${chips()}</div>
      <div id="custom-mass"${massChoice === 'custom' ? '' : ' hidden'}>${numberField('batch-kg',t.masaMieszanki,asInput(target / 1000),'kg')}</div></fieldset>`}
      <fieldset><legend>${editing ? t.sklad : t.skladnikiDoDosypania}</legend>
        <p class="muted">${t.ilosciZaokragloneDo100G}</p><div id="checklist">${checkList()}</div></fieldset>
      <div class="value-row"><span>${t.masaMieszankiBezDodatkow}</span><strong id="actual-mass">${fmt.stockQuantity(batchMass()/1000,'kg')}</strong></div>
      <div id="date-rows">${dateSection()}</div>`,editing ? t.zapisz : t.zatwierdzPartie,editing),
    change(element) {
      if (element.id === 'batch-kg') {
        try { changeMass(Math.round(readNumber(element.value,'batch-kg',customLimits) * 1000)); }
        catch (error) { if (!(error instanceof FieldError)) throw error; }
      }
      if (element.dataset.check !== undefined) {
        if (element.checked) selected.add(Number(element.dataset.check));
        else selected.delete(Number(element.dataset.check));
      }
      if (element.id === 'mixed' && element.value) {
        const startInput = document.getElementById('start');
        if (startInput.value === date || startInput.value < element.value) startInput.value = element.value;
        date = element.value;
        startInput.min = date;
      }
      if (['mixed','start'].includes(element.id)) {
        start = value('start');
        const labels = document.querySelectorAll('#date-rows .value-row strong');
        if (date) labels[0].textContent = fmt.fullDate(date);
        if (start) labels[1].textContent = fmt.fullDate(start);
      }
    },
    async submit() {
      if (!editing && massChoice === 'custom') changeMass(Math.round(readNumber(value('batch-kg'),'batch-kg',customLimits) * 1000));
      applyQuantity();
      const mixed = readDate(value('mixed'),'mixed','1900-01-01',ctx.today);
      const begins = readDate(value('start'),'start',mixed,original?.end ? addDays(original.end,-1) : '9999-12-30');
      if (items.some(row => row.grams <= 0)) throw new FieldError('',t.kliknijIloscIWpiszCoNajmniej);
      const legacy = original && original.massBasis !== 'base';
      const mass = legacy ? sumItemMass(items) : batchMass();
      if (original?.remaining > mass) throw new FieldError('',t.zostaloWiecejNizZmieszalesPoprawPozostalosc);
      if (!editing && selected.size < items.length && !await ctx.confirm(t.zatwierdzicPartie,
        t.nieWszystkieSkladnikiSaOdhaczoneZatwierdzic, t.zatwierdz)) return;
      const mixItems = items.map(({ingredientId,name,unit,density,grams,price,additive,oil,millilitres}) => ({
        ingredientId,name,unit,density,grams,price,...(oil ? {oil:true} : additive ? {additive:true} : {}),
        ...(millilitres == null ? {} : {millilitres})
      }));
      const saved = await ctx.commit(data => putBatch(data,original,{
        recipeId:original?.recipeId ?? recipe.id, recipeName:original?.recipeName ?? recipe.name,
        date:mixed,start:begins,end:original?.end ?? null,remaining:original?.remaining ?? null,mass,items:mixItems,
        ...(legacy ? {} : {massBasis:'base'}),
        ...(editing ? {} : {savedOrder:nextSavedOrder(data.batches)})
      }), parent);
      if (!saved || editing) return;
      const previous = ctx.derived.openStatus.filter(row => !row.batch.end).at(-1)?.batch;
      if (previous && begins <= ctx.today && await ctx.confirm(t.poprzedniaPartia,
        t.czyPoprzedniaPartiaJuzSieSkonczyla, t.zakoncz,t.pomin)) {
        ctx.go('finish/' + previous.id + '/feed');
      }
    },
    action(action) {
      if (action.startsWith('mass:')) {
        const key = action.slice(5);
        if (key === massChoice) return;
        massChoice = key;
        document.getElementById('mass-chips').innerHTML = chips();
        const custom = document.getElementById('custom-mass');
        custom.hidden = key !== 'custom';
        const input = document.getElementById('batch-kg');
        if (key === 'custom') {
          input.value = asInput(target / 1000);
          input.focus();
          input.select();
        } else changeMass(Number(key));
        ctx.dirty();
      }
      if (action.startsWith('choose:')) {
        const nextRecipe = get(ctx,'recipes',action.slice(7));
        if (recipe.id !== nextRecipe.id) {
          recipe = nextRecipe;
          editedIndex = null;
          scale();
          document.getElementById('recipe-chips').innerHTML = recipeChips();
          renderMix();
          ctx.dirty();
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
      if (action === 'delete') return ctx.commit(data => removeBatch(data,id),'feed',t.usunieto);
    }};
}

export function finishForm(ctx, id, origin) {
  const batch = get(ctx,'batches',id);
  if (!batch) return missing('feed');
  const parent = origin === 'batch' ? 'batch/' + id : 'feed';
  const earliest = batch.start;
  const date = batch.end ? addDays(batch.end,-1) : (earliest > ctx.today ? earliest : ctx.today);
  const remaining = batch.remaining ?? 0;
  function getInput() {
    const end = addDays(readDate(value('end'),'end',earliest,'9999-12-30'),1);
    const left = Math.round(readNumber(value('remaining'),'remaining',{max:batch.mass / 1000}) * 1000);
    return {end,remaining:left};
  }
  function preview({end,remaining}) {
    const {daily,days} = batchResult({...batch,end,remaining});
    return details([[t.dniKarmienia,fmt.days(days)],[t.zuzycieDzienne,fmt.number(daily / 1000,3) + t.kgDzien],
      ...(daily > 0 ? [[t.naIleStarcza100Kg,fmt.days(100000/daily) + ` <small>${t.prognoza}</small>`]] : [])]);
  }
  return {title:batch.end ? t.edytujZakonczenie : t.zakonczPartie,subtitle:batch.recipeName,parent,form:true,
    body:form(`${dateField('end',t.ostatniDzienKarmieniaTaPartia,date,earliest)}
      ${numberField('remaining',t.pozostalosc,asInput(remaining / 1000),'kg')}
      <section class="card stack tight"><h2>${t.podgladWynikow}</h2><div id="finish-preview">${preview({end:addDays(date,1),remaining})}</div></section>
      ${batch.end ? '<div>' + button(t.cofnijZakonczenie,'reopen','tonal') + '</div>' : ''}`),
    change() {
      const output = document.getElementById('finish-preview');
      try { output.innerHTML = preview(getInput()); }
      catch { output.textContent = t.uzupelnijDateOrazPozostalosc; }
    },
    submit() {
      const values = getInput();
      return ctx.commit(data => put(data,'batches',batch,values),parent);
    },
    action(action) {
      if (action === 'reopen') return ctx.commit(data => put(data,'batches',batch,{end:null,remaining:null}),parent);
    }};
}

const maxBirds = 1000000;

export function cohortForm(ctx,id) {
  const cohort = get(ctx,'cohorts',id);
  if (id && !cohort) return missing('flock');
  const parent = cohort ? 'cohort/' + id : 'flock';
  const history = cohort ? cohortEvents(cohort,ctx.data.cohortChanges) : [];
  const earliest = history[0]?.date ?? ctx.today;
  let category = cohort?.category ?? 'hens';
  let dateKind = cohort?.dateKind === 'hatch' ? 'hatch' : 'purchase';
  const categories = [['hens',t.kury],['roosters',t.koguty]];
  const dates = [['purchase',t.zakup],['hatch',t.wyklucie]];
  return {title:cohort ? t.edytujRocznik : t.dodajRocznik,parent,form:true,
    body:form(`${field('name',t.nazwa,cohort?.name,{length:80})}
      <div class="actions" id="category-options">${choices('category',categories,category)}</div>
      ${numberField('count',t.liczbaPtakow,asInput(cohort?.count),t.szt,'numeric')}
      <fieldset class="stack tight"><legend>${t.dataZakupuAlboWyklucia}</legend>
        <div class="actions" id="date-options">${choices('date-kind',dates,dateKind)}</div>
        ${dateField('date',dateKind === 'purchase' ? t.dataZakupu : t.dataWyklucia,cohort?.date ?? ctx.today,'1900-01-01',earliest)}</fieldset>
      <div id="weeks-wrap"${dateKind === 'purchase' ? '' : ' hidden'}>${field('weeks',t.wiekPrzyZakupieWTygodniachOpcjonalnie,asInput(cohort?.weeks),{mode:'numeric'})}</div>
      ${field('mark',t.oznaczenieOpcjonalnie,cohort?.mark,{length:80})}`,t.zapisz,Boolean(cohort)),
    submit() {
      const fields = {name:readName(value('name')),category,dateKind,date:readDate(value('date'),'date','1900-01-01',earliest),
        count:readNumber(value('count'),'count',{digits:0,max:maxBirds}),mark:text('mark'),
        weeks:dateKind === 'purchase' ? readNumber(value('weeks'),'weeks',{optional:true,digits:0,max:5200}) : null,
        notes:cohort?.notes ?? ''};
      if (cohort && !validCohortHistory({...cohort,...fields},history)) {
        throw new FieldError('',t.sprawdzDateILiczbePtakowW);
      }
      return ctx.commit(data => {
        const row = put(data,'cohorts',cohort,fields);
        delete row.origin;
      },parent);
    },
    action(action) {
      if (action.startsWith('category:')) {
        category = action.slice(9);
        document.getElementById('category-options').innerHTML = choices('category',categories,category);
        ctx.dirty();
      }
      if (action.startsWith('date-kind:')) {
        dateKind = action.slice(10);
        document.getElementById('date-options').innerHTML = choices('date-kind',dates,dateKind);
        document.getElementById('weeks-wrap').hidden = dateKind !== 'purchase';
        document.querySelector('label[for="date"]').textContent = dateKind === 'purchase' ? t.dataZakupu : t.dataWyklucia;
        ctx.dirty();
      }
      if (action === 'delete') return ctx.commit(data => {
        remove(data,'cohorts',id);
        for (const event of history) remove(data,'cohortChanges',event.id);
      },'flock',t.usunieto);
    }};
}

export function changeForm(ctx,id,first,previousId) {
  const cohort = get(ctx,'cohorts',id);
  if (!cohort) return missing('flock');
  const parent = 'cohort/' + id;
  const changeId = previousId ?? (first && !['add','loss'].includes(first) ? first : null);
  const old = changeId ? get(ctx,'cohortChanges',changeId) : null;
  if (changeId && (!old || old.cohortId !== id || !['add','loss'].includes(old.type))) return missing(parent);
  const history = cohortEvents(cohort,ctx.data.cohortChanges);
  const others = history.filter(event => event.id !== changeId);
  let kind = old?.type ?? (first === 'add' ? 'add' : 'loss');
  const directions = [['loss',t.ubylo],['add',t.przybylo]];
  const hints = [t.padla,t.uboj,t.sprzedana,t.dokupione,t.wyklute];
  return {title:t.zmienLiczbe,subtitle:cohort.name,parent,form:true,
    body:form(`<div class="actions" id="bird-change">${choices('direction',directions,kind)}</div>
      ${numberField('count',t.liczbaSztuk,asInput(old?.count),t.szt,'numeric')}
      ${dateInput(ctx,'date',t.data,old?.date,cohort.date)}
      ${textarea('notes',t.uwaga,old?.notes)}
      <div class="actions">${hints.map((hint,index) => button(hint,'hint:' + index,'tonal')).join('')}</div>`,t.zapisz,Boolean(old)),
    submit() {
      const date = readDate(value('date'),'date',cohort.date,ctx.today);
      const count = readNumber(value('count'),'count',{digits:0,max:maxBirds,min:1});
      const fields = {cohortId:id,type:kind,date,count,notes:text('notes')};
      const entry = old ? {...old,...fields} : record({...fields,order:nextFlockEventOrder(history)});
      if (!validCohortHistory(cohort,[...others,entry])) throw new FieldError('count',t.sprawdzLiczbePtakowWDniuWpisu);
      return ctx.commit(data => put(data,'cohortChanges',old,entry),parent);
    },
    action(action) {
      if (action.startsWith('direction:')) {
        kind = action.slice(10);
        document.getElementById('bird-change').innerHTML = choices('direction',directions,kind);
        ctx.dirty();
      }
      if (action.startsWith('hint:')) {
        document.getElementById('notes').value = hints[Number(action.slice(5))];
        ctx.dirty();
      }
      if (action === 'delete') {
        if (!validCohortHistory(cohort,others)) throw new FieldError('',t.sprawdzKolejneWpisyPrzedUsunieciemTego);
        return ctx.commit(data => remove(data,'cohortChanges',changeId),parent,t.usunieto);
      }
    }};
}

export function settingsForm(ctx, origin) {
  const settings = ctx.derived.settings;
  const parent = ['start','feed','stock','flock'].includes(origin) ? origin : 'start';
  const fileInput = '<input id="backup-file" hidden type="file" accept=".json,application/json">';
  return {title:t.ustawienia,parent,form:true,
    body:form(`<div class="form-grid">
      ${field('threshold',t.progDoUzupelnieniaDni,asInput(settings.threshold),{mode:'numeric'})}
      ${field('default-daily',t.ileZjadajaDziennieZanimZbierzeSie,asInput(settings.defaultDaily / 1000),{mode:'decimal'})}
      ${priceInput('ready',t.cenaGotowejPaszyZlKgOpcjonalnie,settings.readyPrice === null ? null : settings.readyPrice / 100)}</div>
      <section class="card stack tight"><h2>${t.kopiaZapasowa}</h2>
        <p class="muted">${settings.lastExport ? t.ostatniEksport + fmt.fullDate(settings.lastExport) : t.brakZapisanejKopii}</p>
        <div class="actions">${button(t.eksportujKopie,'export','tonal','download')}
          ${navigator.canShare && navigator.share ? button(t.udostepnijKopie,'share') : ''}
          ${button(t.importujKopie,'import')}</div>${fileInput}</section>`),
    submit() {
      const threshold = readNumber(value('threshold'),'threshold',{min:1,max:3650,digits:0});
      const defaultDaily = Math.round(readNumber(value('default-daily'),'default-daily',amountOptions) * 1000);
      const entered = readNumber(value('ready'),'ready',{optional:true,min:.01,max:100000000,digits:2});
      const readyPrice = entered === null ? null : Math.round(entered * 100);
      return ctx.commit(data => Object.assign(data.settings[0],{threshold,defaultDaily,readyPrice}),parent);
    },
    change(target) {
      if (target.id === 'backup-file' && target.files[0]) return ctx.importBackup(target.files[0]);
    },
    action(action) {
      if (action === 'import') document.getElementById('backup-file').click();
      if (action === 'export' || action === 'share') return ctx.exportBackup(action === 'share');
    }};
}
