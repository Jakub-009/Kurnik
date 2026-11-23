import {addDays, batchOil, batchResult, cohortEvents, cohortOrigin, cohortState, flockEventKind, ingredientMass, isMixingOil, recipeBaseItems, recipeComposition, recipeOil, scaleRecipe, scaledOilMl, stock, validCohortHistory} from './calc/index.js';
import {live,record} from './db.js';
import {find, put, putBatch, remove, removeBatch, removeRecipe, showAmount} from './model.js';
import {missing} from './views.js';
import {button, changeRow, dateField, details, empty, field, FieldError, form, html, iconButton,
  link, numberField, readDate, readName, readNumber, select, textarea} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';

const amountLimit = 10000000;
const amountOptions = {min:.001,max:amountLimit};
const movementLabels = {add:'Dodaj do magazynu', addition:'Dodanie zapasu', purchase:'Zakup',
  correction:'Korekta stanu', withdrawal:'Inne pobranie'};
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
  return `${field(prefix + 'name','Nazwa',item?.name,{length:80})}
    ${select(prefix + 'unit','Jednostka',[['kg','kg'],['l','l']],item?.unit ?? 'kg')}
    <div id="${prefix}density-wrap"${item?.unit !== 'l' ? ' hidden' : ''}>
      ${field(prefix + 'density','Gęstość (kg/l)',asInput(item?.density),{mode:'decimal'})}</div>
    <div id="${prefix}role-wrap"${item?.unit !== 'l' ? ' hidden' : ''}>
      ${select(prefix + 'role','Zastosowanie',[['base','Składnik receptury'],['oil','Olej do mieszania']],
        item && isMixingOil(item) ? 'oil' : 'base')}</div>`;
}

function updateIngredientFields(prefix, target) {
  if (target.id !== prefix + 'unit') return;
  const hidden = target.value !== 'l';
  document.getElementById(prefix + 'density-wrap').hidden = hidden;
  document.getElementById(prefix + 'role-wrap').hidden = hidden;
}

function ingredientValues(prefix, ingredients, id, lockedUnit) {
  const name = readName(value(prefix + 'name'),prefix + 'name');
  if (ingredients.some(row => row.id !== id && normalize(row.name) === normalize(name))) {
    throw new FieldError(prefix + 'name','Składnik o takiej nazwie już istnieje.');
  }
  const unit = value(prefix + 'unit');
  if (lockedUnit && unit !== lockedUnit) {
    throw new FieldError(prefix + 'unit','Jednostka jest powiązana z istniejącymi wpisami.');
  }
  const density = unit === 'l' ? readNumber(value(prefix + 'density'),prefix + 'density',{min:.001,max:100}) : null;
  return {name,unit,density,oil:unit === 'l' && value(prefix + 'role') === 'oil'};
}

export function ingredientForm(ctx, id) {
  const addingOil = id === 'oil';
  if (addingOil) id = undefined;
  const old = get(ctx,'ingredients',id);
  if (id && !old) return missing('stock');
  const parent = old ? 'ingredient/' + id : 'stock';
  const referenced = old && (ctx.data.recipes.some(row => row.items.some(item => item.ingredientId === id)) ||
    ctx.data.ingredientEvents.some(row => row.ingredientId === id));
  return {
    title:old ? 'Edytuj składnik' : addingOil ? 'Dodaj olej' : 'Dodaj składnik', parent, form:true,
    body:form(`${ingredientFields('',old ?? (addingOil ? {unit:'l',oil:true,density:.92} : null))}
      ${referenced ? '<p class="muted">Jednostka jest powiązana z zapisanymi wpisami.</p>' : ''}`, 'Zapisz', Boolean(old)),
    change(target) {
      updateIngredientFields('',target);
    },
    submit() {
      const fields = ingredientValues('',ctx.derived.ingredients,id,referenced ? old.unit : null);
      if (old && fields.oil && !isMixingOil(old)) {
        const updated = ctx.derived.ingredients.map(ingredient => ingredient.id === id ? {...old,...fields} : ingredient);
        for (const recipe of ctx.derived.recipes.filter(recipe => recipe.items.some(item => item.ingredientId === id))) {
          const baseCount = recipeBaseItems(recipe,updated).length;
          if (!baseCount) throw new FieldError('role','Ta zmiana pozostawiłaby recepturę bez składników bazowych.');
          if (recipe.items.length - baseCount > 1) throw new FieldError('role','Receptura ma już inny olej.');
        }
      }
      if (old && !fields.oil && fields.density !== old.density) {
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
        throw new FieldError('', 'Najpierw usuń składnik z aktywnych receptur.');
      }
      if (live(ctx.data.ingredientEvents).some(row => row.ingredientId === id)) {
        throw new FieldError('', 'Składnik jest powiązany z historią magazynu.');
      }
      return ctx.commit(data => remove(data,'ingredients',id),'stock','Usunięto');
    }
  };
}

export function recipeForm(ctx, id) {
  const old = get(ctx,'recipes',id);
  if (id && !old) return missing('feed');
  const parent = old ? 'recipe/' + id : 'feed';
  const ingredients = ctx.derived.ingredients.slice().sort((a,b) => a.name.localeCompare(b.name,'pl'));
  const drafted = [];
  const optionLabel = row => row.name + (isMixingOil(row) ? ' (dodatek, l)' : ' (' + row.unit + ')');
  const options = () => [['','Wybierz'],...ingredients.map(row => [row.id,optionLabel(row)])];
  let next = 0;
  const readLine = (ingredientId = '', amount) => {
    const index = next++;
    const ingredient = ingredients.find(row => row.id === ingredientId);
    return `<div class="recipe-line" data-recipe-line="${index}">${select('ingredient-' + index,'Składnik',options(),ingredientId)}
      ${field('amount-' + index,ingredient ? 'Ilość (' + ingredient.unit + ')' : 'Ilość',asInput(amount),{mode:'decimal',length:17})}
      ${iconButton('Usuń pozycję','del','drop:' + index)}</div>`;
  };
  const items = old ? old.items.map(item => readLine(item.ingredientId,item.amount / 1000)).join('') : readLine();
  const lines = () => [...document.querySelectorAll('[data-recipe-line]')];
  function updateAmountLabel(selectInput) {
    const ingredient = ingredients.find(row => row.id === selectInput.value);
    const index = selectInput.closest('[data-recipe-line]').dataset.recipeLine;
    document.querySelector('label[for="amount-' + index + '"]').textContent =
      ingredient ? 'Ilość (' + ingredient.unit + ')' : 'Ilość';
  }
  return {title:old ? 'Edytuj recepturę' : 'Dodaj recepturę',parent,form:true,
    body:form(`${field('name','Nazwa',old?.name,{length:80})}<fieldset class="stack tight"><legend>Składniki</legend>
      <div class="stack tight" id="recipe-lines">${items}</div><div class="actions">
      ${button('Dodaj pozycję','add-line','tonal','plus')}${button('Utwórz składnik','new-ingredient')}</div></fieldset>
      <fieldset class="card stack" id="new-ingredient" hidden><legend>Nowy składnik</legend>
        ${ingredientFields('new-',null)}<div class="actions">${button('Dodaj składnik','use-ingredient','tonal')}
        ${button('Anuluj','cancel-ingredient')}</div></fieldset>
      ${textarea('notes','Uwagi (opcjonalnie)',old?.notes)}`, 'Zapisz', Boolean(old)),
    change(target) {
      updateIngredientFields('new-',target);
      if (target.id.startsWith('ingredient-')) updateAmountLabel(target);
    },
    submit() {
      const name = readName(value('name'));
      const seen = new Set();
      let oilCount = 0;
      const written = lines().map(line => {
        const index = line.dataset.recipeLine;
        const ingredientId = value('ingredient-' + index);
        const ingredient = ingredients.find(row => row.id === ingredientId);
        if (!ingredient) throw new FieldError('ingredient-' + index,'Wybierz składnik.');
        if (seen.has(ingredientId)) throw new FieldError('ingredient-' + index,'Ten składnik został już dodany.');
        seen.add(ingredientId);
        if (isMixingOil(ingredient) && ++oilCount > 1) {
          throw new FieldError('ingredient-' + index,'Wybierz jeden olej do receptury.');
        }
        const amount = readNumber(value('amount-' + index),'amount-' + index,amountOptions);
        physicalMass(amount,ingredient,'amount-' + index);
        return {ingredientId,amount:Math.round(amount * 1000)};
      });
      if (written.length === oilCount) throw new FieldError('','Dodaj co najmniej jeden składnik bazowy.');
      if (!document.getElementById('new-ingredient').hidden) {
        throw new FieldError('new-name','Dodaj składnik do receptury albo anuluj jego tworzenie.');
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
        document.getElementById('new-role-wrap').hidden = true;
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
      if (action === 'delete') return ctx.commit(data => removeRecipe(data,id),'feed','Usunięto');
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
      <span class="grow">${html(ingredient.name)}${isMixingOil(ingredient) ? ' <small>Dodatek</small>' : ''}</span>
      <button class="icon-button order-handle" type="button" aria-label="${html('Przenieś: ' + ingredient.name)}"
        aria-describedby="reorder-help"><span aria-hidden="true">⠿</span></button></li>`;
  }).join('');

  function announce(row) {
    const index = order().indexOf(row.dataset.ingredient);
    const name = ingredientNames.get(row.dataset.ingredient).name;
    document.getElementById('order-status').textContent = name + ', pozycja ' + fmt.number(index + 1) + ' z ' + fmt.number(initial.length);
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

  return {title:'Zmień kolejność',subtitle:recipe.name,parent,form:true,mount:bindDrag,
    body:form(`<p class="muted" id="reorder-help">Przeciągnij składniki za uchwyt. Z klawiatury użyj ↑ i ↓.</p>
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
    body:empty('Najpierw dodaj składnik do magazynu.',link('Dodaj składnik','ingredient-form','tonal'))};
  const correction = type === 'correction';
  const add = type === 'add';
  const purchase = type === 'purchase';
  const canPrice = purchase || add;
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
  const modes = item => [['per-kg','Za kg'],...(item.unit === 'l' ? [['per-litre','Za litr']] : []),['total','Łącznie']];
  const priceBlock = (item, mode) => `<div class="form-grid" id="prices">
    ${select('price-mode','Sposób podania ceny',modes(item),mode)}
    ${priceInput('price','Cena (zł, opcjonalnie)',shownPrice(initialPrice(item),mode,item))}</div>`;
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
    try { output.textContent = 'Różnica ' + signed(correctionDelta(getQuantity())); }
    catch { output.textContent = ''; }
  };

  return {title:movementLabels[type],subtitle:ingredientId ? ingredient.name : '',parent,form:true,
    body:form(`${ingredientId ? '' : select('ingredient','Składnik',selection.map(row => [row.id,row.name]),ingredient.id)}
      ${changeRow('Data',fmt.fullDate(date),'date')}
      <div id="date-wrap" hidden>${dateInput(ctx,'date','Data wpisu',date)}</div>
      ${correction ? '<p>Stan wyliczony <strong id="calculated-stock">' + signed(currentStock(),false) + '</strong></p>' : ''}
      ${numberField('quantity',correction ? 'Jest faktycznie' : 'Ilość',asInput(initialAmount),ingredient.unit)}
      ${correction ? '<p id="difference" role="status">' + (old ? 'Różnica ' + signed(old.grams) : '') + '</p>' : ''}
      ${add ? select('addition-kind','Skąd pochodzi składnik?',[['addition','Własny lub otrzymany'],['purchase','Zakup']],'addition') : ''}
      ${canPrice ? `<div id="purchase-fields"${purchase ? '' : ' hidden'}>${priceBlock(ingredient,defaultMode)}</div>` : ''}
      ${!correction ? textarea('notes','Uwagi (opcjonalnie)',old?.notes) : ''}`,'Zapisz',Boolean(old)),
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
        updateDifference();
      }
      if (target.id === 'addition-kind') document.getElementById('purchase-fields').hidden = target.value !== 'purchase';
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
      const kind = add ? value('addition-kind') : type;
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
      return ctx.commit(data => put(data,'ingredientEvents',old,{ingredientId:ingredient.id,
        type:kind,date:when,grams:balance,measured:correction ? grams : null,price,priceMode,batchId:null,notes:text('notes')}),parent);
    },
    action(action) {
      if (action === 'date') {
        const wrap = document.getElementById('date-wrap');
        wrap.hidden = !wrap.hidden;
        if (!wrap.hidden) document.getElementById('date').focus();
      }
      if (action === 'delete') return ctx.commit(data => remove(data,'ingredientEvents',eventId),ingredientRoute,'Usunięto');
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
  if (!editing && !recipe) return {title:'Mieszam',parent,
    body:empty('Najpierw przygotuj recepturę ze składnikami bazowymi.',link('Dodaj recepturę','recipe-form','tonal'))};
  let target = 50000;
  let date = original?.date ?? ctx.today;
  let start = original?.start ?? ctx.today;
  const originalOil = original ? batchOil(original) : undefined;
  let items = original ? structuredClone(original.items.filter(item => !item.oil)) : [];
  const oils = ingredients.filter(isMixingOil).sort((a,b) => a.name.localeCompare(b.name,'pl'));
  if (originalOil && !oils.some(oil => oil.id === originalOil.ingredientId)) {
    oils.push({...originalOil,id:originalOil.ingredientId});
  }
  let selected = new Set();
  let editedIndex = null;
  let configuredOil = null;
  let defaultOilMl = 0;

  function scale() {
    const composition = recipeComposition(recipe,ingredients);
    items = scaleRecipe(composition,target);
    configuredOil = recipeOil(recipe,ingredients);
    defaultOilMl = configuredOil ? scaledOilMl(configuredOil,composition.mass,target) : 0;
    selected = new Set();
  }
  if (!editing) scale();
  const oilPosition = () => editing
    ? originalOil ? original.items.indexOf(originalOil) : items.length
    : configuredOil?.position ?? items.length;
  const batchMass = () => items.reduce((sum, item) => sum + item.grams,0);

  function chips() {
    return [50000,100000].map(grams =>
      `<button type="button" class="chip" aria-pressed="${grams === target}" data-action="mass:${grams}">${grams === target ? icon('check') : ''}${fmt.mass(grams)}</button>`).join('');
  }

  function recipeChips() {
    return recipeList.map(item => `<button type="button" class="chip" aria-pressed="${item.id === recipe.id}" data-action="choose:${item.id}">${item.id === recipe.id ? icon('check') : ''}${html(item.name)}</button>`).join('');
  }

  function itemEditor(index) {
    const item = items[index];
    return `<div class="card stack" id="quantity-edit">${numberField('adjust','Ilość · ' + item.name,
      asInput(showAmount(item.grams,item)),item.unit)}
      <div class="actions">${button('Zastosuj ilość','apply-quantity','tonal','check')}${button('Anuluj','cancel-quantity')}</div></div>`;
  }

  function checkList(oil = '') {
    const rows = items.map((item,index) => `<div class="checklist-row">
      ${editing ? '<span class="grow">' + html(item.name) + '</span>' :
        `<label for="check-${index}"><input id="check-${index}" type="checkbox" data-check="${index}" ${selected.has(index) ? 'checked' : ''}><span>${html(item.name)}</span></label>`}
      <button class="button" type="button" data-action="quantity:${index}" aria-label="Zmień ilość: ${html(item.name)}, ${fmt.mixingQuantity(showAmount(item.grams,item),item.unit)}">
        ${fmt.mixingQuantity(showAmount(item.grams,item),item.unit)}${icon('edit')}</button></div>${editedIndex === index ? itemEditor(index) : ''}`);
    rows.splice(oilPosition(),0,`<div id="oil-slot">${oil}</div>`);
    return rows.join('');
  }

  function oilSection() {
    const oilOptions = oils.filter(oil => !items.some(item => item.ingredientId === oil.id));
    const oilId = originalOil?.ingredientId ?? configuredOil?.ingredientId ?? '';
    const millilitres = originalOil?.millilitres ?? defaultOilMl;
    const oilSelect = select('oil','Rodzaj oleju',[['','Bez oleju'],...oilOptions.map(oil => [oil.id,oil.name])],oilId);
    return `<div id="mix-oil" class="card stack tight mix-oil">
      <h2>Olej · dodatek</h2>
      ${oilOptions.length ? oilSelect : '<div>' + link('Dodaj olej w magazynie','ingredient-form/oil') + '</div>'}
      <div id="oil-volume"${oilId ? '' : ' hidden'}>
        ${numberField('oil-litres','Ilość oleju',asInput(millilitres ? millilitres / 1000 : null),'l')}
        ${editing ? '' : '<label class="oil-check"><input type="checkbox" id="oil-checked"> Olej dodany</label>'}
      </div></div>`;
  }

  function readOil() {
    const selectedOil = document.getElementById('oil')?.value;
    if (!selectedOil) return null;
    const litres = readNumber(value('oil-litres'),'oil-litres',amountOptions);
    const millilitres = Math.round(litres * 1000);
    if (originalOil?.ingredientId === selectedOil) {
      return {...originalOil,millilitres,grams:physicalMass(litres,originalOil,'oil-litres')};
    }
    const ingredient = oils.find(oil => oil.id === selectedOil);
    const {name,unit,density,price} = ingredient;
    return {ingredientId:selectedOil,name,unit,density,price,grams:physicalMass(litres,ingredient,'oil-litres'),
      oil:true,millilitres};
  }

  function dateSection() {
    return `${changeRow('Mieszanie',fmt.fullDate(date),'show-dates')}
      ${changeRow('Podawanie od',fmt.fullDate(start),'show-dates')}
      <div class="form-grid" id="mix-dates" hidden>${dateInput(ctx,'mixed','Data mieszania',date)}
        ${dateField('start','Początek podawania',start,date,original?.end ? addDays(original.end,-1) : '9999-12-30')}</div>`;
  }

  function renderMix(resetOil = false) {
    const oilBlock = resetOil ? null : document.getElementById('mix-oil');
    if (!editing) {
      document.getElementById('mass-chips').innerHTML = chips();
      document.getElementById('recipe-chips').innerHTML = recipeChips();
    }
    document.getElementById('checklist').innerHTML = checkList();
    const slot = document.getElementById('oil-slot');
    if (oilBlock) slot.append(oilBlock);
    else slot.innerHTML = oilSection();
    document.getElementById('actual-mass').textContent = fmt.mixingQuantity(batchMass()/1000);
  }

  function applyQuantity() {
    if (editedIndex === null) return;
    const item = items[editedIndex];
    const raw = value('adjust');
    if (raw !== asInput(showAmount(item.grams,item))) {
      const amount = readNumber(raw,'adjust',amountOptions);
      item.grams = physicalMass(amount,item,'adjust');
      selected.delete(editedIndex);
      ctx.dirty();
    }
    const index = editedIndex;
    editedIndex = null;
    renderMix();
    document.querySelector('[data-action="quantity:' + index + '"]').focus({preventScroll:true});
  }

  return {title:editing ? 'Edytuj partię' : 'Mieszam',subtitle:original?.recipeName,parent,form:true,
    body:form(`${editing ? '' : `<fieldset><legend>Receptura</legend><div class="actions" id="recipe-chips">${recipeChips()}</div></fieldset>
      <fieldset><legend>Masa składników bazowych</legend><div class="actions" id="mass-chips">${chips()}</div></fieldset>`}
      <fieldset><legend>${editing ? 'Skład' : 'Składniki do dosypania'}</legend>
        <p class="muted">Ilości na liście są zaokrąglone.</p><div id="checklist">${checkList(oilSection())}</div></fieldset>
      <div class="value-row"><span>Masa składników bazowych</span><strong id="actual-mass">${fmt.mixingQuantity(batchMass()/1000)}</strong></div>
      <div id="date-rows">${dateSection()}</div>`,editing ? 'Zapisz' : 'Zatwierdź partię',editing),
    change(element) {
      if (element.id === 'oil') document.getElementById('oil-volume').hidden = !element.value;
      if (!editing && ['oil','oil-litres'].includes(element.id)) document.getElementById('oil-checked').checked = false;

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
      applyQuantity();
      const mixed = readDate(value('mixed'),'mixed','1900-01-01',ctx.today);
      const begins = readDate(value('start'),'start',mixed,original?.end ? addDays(original.end,-1) : '9999-12-30');
      if (items.some(row => row.grams <= 0)) throw new FieldError('','Zwiększ masę partii albo podaj ilości od 1 g dla każdego składnika.');
      const oil = readOil();
      const mass = batchMass() + (oil?.grams ?? 0);
      if (original?.remaining > mass) throw new FieldError('','Pozostałość przekracza masę mieszanki. Skoryguj ją w zakończeniu partii.');
      const incomplete = selected.size < items.length || (oil && !document.getElementById('oil-checked')?.checked);
      if (!editing && incomplete && !await ctx.confirm('Zatwierdzić partię?',
        'Nie wszystkie składniki są odhaczone. Zatwierdzić?', 'Zatwierdź')) return;
      const mixItems = items.map(({ingredientId,name,unit,density,grams,price}) => ({ingredientId,name,unit,density,grams,price}));
      if (oil) mixItems.splice(oilPosition(),0,oil);
      const saved = await ctx.commit(data => putBatch(data,original,{
        recipeId:original?.recipeId ?? recipe.id, recipeName:original?.recipeName ?? recipe.name,
        date:mixed,start:begins,end:original?.end ?? null,remaining:original?.remaining ?? null,mass,items:mixItems
      }), parent);
      if (!saved || editing) return;
      const previous = ctx.derived.openStatus.filter(row => !row.batch.end).at(-1)?.batch;
      const proposal = previous?.start === ctx.today
        ? 'Poprzednią partię rozpoczęto dziś. Możesz wybrać datę zakończenia od jutra.'
        : 'Zakończyć poprzednią partię z dzisiejszą datą?';
      if (previous && begins <= ctx.today && await ctx.confirm('Poprzednia partia',proposal,'Zakończ','Pomiń')) {
        ctx.go('finish/' + previous.id + '/feed');
      }
    },
    action(action) {
      if (action.startsWith('mass:')) {
        const grams = Number(action.slice(5));
        if (grams !== target) {
          target = grams;
          editedIndex = null;
          scale();
          renderMix(Boolean(configuredOil));
          document.querySelector('[data-action="' + action + '"]').focus({preventScroll:true});
          ctx.dirty();
        }
      }
      if (action.startsWith('choose:')) {
        const nextRecipe = get(ctx,'recipes',action.slice(7));
        if (recipe.id !== nextRecipe.id) {
          recipe = nextRecipe;
          editedIndex = null; scale(); renderMix(true); ctx.dirty();
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
      if (action === 'delete') return ctx.commit(data => removeBatch(data,id),'feed','Usunięto');
    }};
}

export function finishForm(ctx, id, origin) {
  const batch = get(ctx,'batches',id);
  if (!batch) return missing('feed');
  const parent = origin === 'batch' ? 'batch/' + id : 'feed';
  const earliest = addDays(batch.start,1);
  const date = batch.end ?? (earliest > ctx.today ? earliest : ctx.today);
  const remaining = batch.remaining ?? 0;
  function getInput() {
    const end = readDate(value('end'),'end',earliest);
    const left = Math.round(readNumber(value('remaining'),'remaining',{max:batch.mass / 1000}) * 1000);
    return {end,remaining:left};
  }
  function preview({end,remaining}) {
    const {daily,days} = batchResult({...batch,end,remaining});
    return details([['Dni podawania',fmt.days(days)],['Zużycie dzienne',fmt.number(daily / 1000,3) + ' kg/dzień'],
      ...(daily > 0 ? [['Na ile starcza 100 kg',fmt.days(100000/daily) + ' <small>prognoza</small>']] : [])]);
  }
  return {title:batch.end ? 'Edytuj zakończenie' : 'Zakończ partię',subtitle:batch.recipeName,parent,form:true,
    body:form(`${dateField('end','Pierwszy dzień bez tej partii',date,earliest)}
      ${numberField('remaining','Pozostałość',asInput(remaining / 1000),'kg')}
      <section class="card stack tight"><h2>Podgląd wyników</h2><div id="finish-preview">${preview({end:date,remaining})}</div></section>
      ${batch.end ? '<div>' + button('Cofnij zakończenie','reopen','tonal') + '</div>' : ''}`),
    change() {
      const output = document.getElementById('finish-preview');
      try { output.innerHTML = preview(getInput()); }
      catch { output.textContent = 'Uzupełnij datę oraz pozostałość.'; }
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
const flockOptions = map => Object.entries(map);
const statusOptions = [['','Nieustalony'],...flockOptions(fmt.cohortStatuses)];

export function cohortForm(ctx,id) {
  const cohort = get(ctx,'cohorts',id);
  if (id && !cohort) return missing('flock');
  const parent = cohort ? 'cohort/' + id : 'flock';
  const origin = cohort ? cohortOrigin(cohort) : 'initial';
  const dateKind = cohort?.dateKind ?? 'initial';
  const history = cohort ? cohortEvents(cohort,ctx.data.cohortChanges) : [];
  const lastAllowedDate = history[0]?.date ?? ctx.today;

  function updateFields(target) {
    const source = value('origin');
    const category = value('category');
    const dateSelect = document.getElementById('date-kind');
    if (target?.id === 'origin') {
      if (source === 'purchase') dateSelect.value = 'purchase';
      if (source === 'rearing') dateSelect.value = 'hatch';
      if (source === 'initial') dateSelect.value = 'initial';
    }
    dateSelect.closest('.field').hidden = source !== 'initial';
    const when = dateSelect.value;
    const dateLabel = {purchase:'Data zakupu',hatch:'Data wyklucia',initial:'Data stanu początkowego'};
    document.querySelector('label[for="date"]').textContent = dateLabel[when];
    document.getElementById('weeks-wrap').hidden = when !== 'purchase';
    document.getElementById('hen-fields').hidden = category !== 'hens';
    const status = value('initial-status');
    document.getElementById('expected-wrap').hidden = status !== 'young';
    document.getElementById('laying-wrap').hidden = !['laying','retired'].includes(status);
  }

  return {title:cohort ? 'Edytuj rocznik' : 'Dodaj rocznik',parent,form:true,
    body:form(`${field('name','Nazwa',cohort?.name,{length:80})}
      <div class="form-grid">${select('category','Kategoria',[['hens','Kury'],['roosters','Koguty']],cohort?.category ?? 'hens')}
      ${select('origin','Pochodzenie',flockOptions(fmt.cohortOrigins),origin)}
      ${select('date-kind','Rodzaj daty',[['initial','Stan początkowy'],['hatch','Wyklucie'],['purchase','Zakup']],dateKind)}
      ${dateField('date','Data',cohort?.date ?? ctx.today,'1900-01-01',lastAllowedDate)}</div>
      <div id="weeks-wrap">${field('weeks','Wiek przy zakupie w tygodniach (opcjonalnie)',asInput(cohort?.weeks),{mode:'numeric'})}</div>
      <div id="hen-fields" class="stack tight">
        ${select('initial-status',cohort ? 'Status przy utworzeniu rocznika' : 'Status kur',statusOptions,cohort ? cohort.status ?? '' : 'young')}
        <div id="expected-wrap">${dateField('expected-start','Przewidywany start nieśności (opcjonalnie)',cohort?.expectedStart ?? '')}</div>
        <div id="laying-wrap">${dateField('laying-since','Faktyczny start nieśności, jeśli znany',cohort?.layingSince ?? '', '1900-01-01',ctx.today)}</div>
      </div>
      ${numberField('count',cohort ? 'Początkowa liczba' : 'Liczba ptaków',asInput(cohort?.count),'szt.','numeric')}
      ${field('mark','Oznaczenie (opcjonalnie)',cohort?.mark,{length:80})}${textarea('notes','Uwagi (opcjonalnie)',cohort?.notes)}`,'Zapisz',Boolean(cohort)),
    mount() { updateFields(); },
    change(target) {
      if (['category','origin','date-kind','initial-status'].includes(target.id)) updateFields(target);
    },
    submit() {
      const name = readName(value('name'));
      const category = value('category');
      const origin = value('origin');
      const dateKind = value('date-kind');
      const date = readDate(value('date'),'date','1900-01-01',lastAllowedDate);
      const weeks = dateKind === 'purchase' ? readNumber(value('weeks'),'weeks',{optional:true,digits:0,max:5200}) : null;
      const count = readNumber(value('count'),'count',{digits:0,max:maxBirds,min:origin === 'initial' ? 0 : 1});
      const status = category === 'hens' ? value('initial-status') || null : null;
      const expectedStart = category === 'hens' && !document.getElementById('expected-wrap').hidden && value('expected-start')
        ? readDate(value('expected-start'),'expected-start',dateKind === 'hatch' ? date : '1900-01-01')
        : status === 'young' ? null : category === 'hens' ? cohort?.expectedStart ?? null : null;
      const layingSince = ['laying','retired'].includes(status) && value('laying-since')
        ? readDate(value('laying-since'),'laying-since',dateKind === 'hatch' ? date : '1900-01-01',ctx.today) : null;
      const fields = {name,category,origin,dateKind,date,weeks,count,status,expectedStart,layingSince,mark:text('mark'),notes:text('notes')};
      if (cohort && !validCohortHistory({...cohort,...fields},history)) {
        throw new FieldError('','Ta zmiana jest sprzeczna z historią rocznika. Sprawdź początkową liczbę i status.');
      }
      return ctx.commit(data => put(data,'cohorts',cohort,fields),parent);
    },
    action(action) {
      if (action !== 'delete') return;
      return ctx.commit(data => {
        remove(data,'cohorts',id);
        for (const event of history) remove(data,'cohortChanges',event.id);
      },'flock','Usunięto');
    }};
}

export function changeForm(ctx,id,kind = 'correction',changeId) {
  const cohort = get(ctx,'cohorts',id);
  // Stare odnośniki do korekt zawierały identyfikator od razu po ID rocznika.
  if (!Object.hasOwn(fmt.flockEvents,kind) && !changeId) {
    changeId = kind;
    kind = 'correction';
  }
  const old = get(ctx,'cohortChanges',changeId);
  if (!cohort || !Object.hasOwn(fmt.flockEvents,kind) ||
    (changeId && (!old || old.cohortId !== id || flockEventKind(old) !== kind))) return missing('flock');
  if (kind === 'status' && cohort.category !== 'hens') return missing('cohort/' + id);
  const parent = 'cohort/' + id;
  const history = cohortEvents(cohort,ctx.data.cohortChanges);
  const others = history.filter(event => event.id !== changeId);
  const current = cohortState(cohort,ctx.data.cohortChanges,ctx.today);
  const next = {young:'laying',laying:'retired'};
  const countLabel = {add:'Liczba dodawanych ptaków',loss:'Liczba ptaków do odjęcia',correction:'Faktyczna liczba ptaków'};

  return {title:fmt.flockEvents[kind],subtitle:cohort.name,parent,form:true,
    body:form(`${dateInput(ctx,'date','Data',old?.date,cohort.date)}
      ${kind === 'status' ? select('new-status','Nowy status',flockOptions(fmt.cohortStatuses),
        old?.status ?? next[current.status] ?? 'laying')
        : numberField('count',countLabel[kind],asInput(old?.count),'szt.','numeric')}
      ${kind === 'add' ? select('source','Pochodzenie nowych ptaków',[['purchase','Zakup'],['rearing','Odchów']],old?.origin ?? 'purchase') : ''}
      ${kind === 'loss' ? select('reason','Powód',flockOptions(fmt.lossReasons),old?.reason ?? 'died') : ''}
      ${textarea('notes','Uwagi (opcjonalnie)',old?.notes)}`,'Zapisz',Boolean(old)),
    submit() {
      const date = readDate(value('date'),'date',cohort.date,ctx.today);
      const fields = {cohortId:id,type:kind,date,notes:text('notes')};
      if (kind === 'status') fields.status = value('new-status');
      else fields.count = readNumber(value('count'),'count',{digits:0,max:maxBirds,min:kind === 'correction' ? 0 : 1});
      if (kind === 'add') fields.origin = value('source');
      if (kind === 'loss') fields.reason = value('reason');
      const order = history.reduce((highest,event) => Math.max(highest,event.order ?? 0),0);
      const entry = old ? {...old,...fields} : record({...fields,order:order + 1});
      if (!validCohortHistory(cohort,[...others,entry])) {
        const message = kind === 'status' ? 'Sprawdź kolejność statusów: młode, nioski, wycofane.' :
          'Po tej zmianie liczba ptaków w historii wyszłaby poza dopuszczalny zakres.';
        throw new FieldError(kind === 'status' ? 'new-status' : 'count',message);
      }
      return ctx.commit(data => put(data,'cohortChanges',old,entry),parent);
    },
    action(action) {
      if (action !== 'delete') return;
      if (!validCohortHistory(cohort,others)) {
        throw new FieldError('','Po usunięciu historia rocznika byłaby niespójna. Najpierw popraw powiązane zdarzenia.');
      }
      return ctx.commit(data => remove(data,'cohortChanges',changeId),parent,'Usunięto');
    }};
}

export function settingsForm(ctx, origin) {
  const settings = ctx.derived.settings;
  const parent = ['start','feed','stock','flock'].includes(origin) ? origin : 'start';
  const fileInput = '<input id="backup-file" hidden type="file" accept=".json,application/json">';
  return {title:'Ustawienia',parent,form:true,
    body:form(`<div class="form-grid">
      ${field('threshold','Próg „Do uzupełnienia” (dni)',asInput(settings.threshold),{mode:'numeric'})}
      ${field('default-daily','Domyślne zużycie (kg/dzień)',asInput(settings.defaultDaily / 1000),{mode:'decimal'})}
      ${priceInput('ready','Cena gotowej paszy (zł/kg, opcjonalnie)',settings.readyPrice === null ? null : settings.readyPrice / 100)}</div>
      <section class="card stack tight"><h2>Kopia zapasowa</h2>
        <p class="muted">${settings.lastExport ? 'Ostatni eksport ' + fmt.fullDate(settings.lastExport) : 'Brak zapisanej kopii'}</p>
        <div class="actions">${button('Eksportuj kopię','export','tonal','download')}
          ${navigator.canShare && navigator.share ? button('Udostępnij kopię','share') : ''}
          ${button('Importuj kopię','import')}</div>${fileInput}</section>`),
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
