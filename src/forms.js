import {addDays, batchResult, ingredientMass, recipeComposition, scaleRecipe, stock} from './calc/index.js';
import {live} from './db.js';
import {find, put, putBatch, remove, removeBatch, removeRecipe, showAmount} from './model.js';
import {missing} from './views.js';
import {button, changeRow, dateField, details, empty, field, FieldError, form, html, iconButton,
  keypad, keypadKeys, link, readDate, readName, readNumber, select, showFormError, textarea} from '../ui/components.js';
import * as fmt from '../ui/format.js';
import {icon} from '../ui/icons.js';

const amountLimit = 10000000;
const amountOptions = {min:.001,max:amountLimit};
const movementLabels = {purchase:'Zakup', correction:'Korekta stanu', withdrawal:'Inne pobranie'};
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

export function ingredientForm(ctx, id) {
  const old = get(ctx,'ingredients',id);
  if (id && !old) return missing('stock');
  const parent = old ? 'ingredient/' + id : 'stock';
  const referenced = old && (ctx.data.recipes.some(row => row.items.some(item => item.ingredientId === id)) ||
    ctx.data.ingredientEvents.some(row => row.ingredientId === id));
  return {
    title:old ? 'Edytuj składnik' : 'Dodaj składnik', parent, form:true,
    body:form(`${field('name','Nazwa',old?.name,{length:80})}
      ${select('unit','Jednostka',[['kg','kg'],['l','l']],old?.unit ?? 'kg')}
      <div id="density-wrap"${old?.unit !== 'l' ? ' hidden' : ''}>${field('density','Gęstość (kg/l)',asInput(old?.density),{mode:'decimal'})}</div>
      ${referenced ? '<p class="muted">Jednostka jest powiązana z zapisanymi wpisami.</p>' : ''}`, 'Zapisz', Boolean(old)),
    change(target) {
      if (target.id === 'unit') document.getElementById('density-wrap').hidden = target.value !== 'l';
    },
    submit() {
      const name = readName(value('name'));
      if (ctx.derived.ingredients.some(row => row.id !== id && normalize(row.name) === normalize(name))) {
        throw new FieldError('name','Składnik o takiej nazwie już istnieje.');
      }
      const unit = value('unit');
      if (referenced && unit !== old.unit) throw new FieldError('unit','Jednostka jest powiązana z istniejącymi wpisami.');
      const density = unit === 'l' ? readNumber(value('density'),'density',{min:.001,max:100}) : null;
      if (old && density !== old.density) {
        for (const recipe of ctx.derived.recipes) {
          const item = recipe.items.find(row => row.ingredientId === id);
          if (item) physicalMass(item.amount / 1000, {unit,density}, 'density');
        }
      }
      return ctx.commit(data => put(data,'ingredients',old,{name,unit,density,price:old?.price ?? null}), parent);
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
  if (!ctx.derived.ingredients.length) return {title:'Dodaj recepturę',parent:'feed',
    body:empty('Dodaj składnik, aby utworzyć recepturę.',link('Dodaj składnik','ingredient-form','tonal'))};
  const parent = old ? 'recipe/' + id : 'feed';
  const ingredients = ctx.derived.ingredients.slice().sort((a,b) => a.name.localeCompare(b.name,'pl'));
  const options = [['','Wybierz'],...ingredients.map(row => [row.id,row.name + ' (' + row.unit + ')'])];
  let next = 0;
  const readLine = (ingredientId = '', amount) => {
    const index = next++;
    return `<div class="recipe-line" data-recipe-line="${index}">${select('ingredient-' + index,'Składnik',options,ingredientId)}
      ${field('amount-' + index,'Ilość',asInput(amount),{mode:'none',length:17})}
      ${iconButton('Usuń pozycję','del','drop:' + index)}<div class="recipe-keypad" hidden>${keypadKeys('amount-' + index)}</div></div>`;
  };
  const items = old ? old.items.map(item => readLine(item.ingredientId,item.amount / 1000)).join('') : readLine();
  return {title:old ? 'Edytuj recepturę' : 'Dodaj recepturę',parent,form:true,
    body:form(`${field('name','Nazwa',old?.name,{length:80})}<fieldset class="stack tight"><legend>Składniki</legend>
      <div class="stack tight" id="recipe-lines">${items}</div><div>${button('Dodaj składnik','add-line','tonal','plus')}</div></fieldset>
      ${textarea('notes','Uwagi (opcjonalnie)',old?.notes)}`, 'Zapisz', Boolean(old)),
    focus(target) {
      const row = target.closest('[data-recipe-line]');
      const keyboard = row?.querySelector('.recipe-keypad');
      if (target.closest('.recipe-keypad')) return;
      document.querySelectorAll('.recipe-keypad').forEach(element => {
        element.hidden = element !== keyboard || !target.id.startsWith('amount-');
      });
    },
    submit() {
      const name = readName(value('name'));
      const seen = new Set();
      const written = [...document.querySelectorAll('[data-recipe-line]')].map(line => {
        const index = line.dataset.recipeLine;
        const ingredientId = value('ingredient-' + index);
        const ingredient = ingredients.find(row => row.id === ingredientId);
        if (!ingredient) throw new FieldError('ingredient-' + index,'Wybierz składnik.');
        if (seen.has(ingredientId)) throw new FieldError('ingredient-' + index,'Ten składnik został już dodany.');
        seen.add(ingredientId);
        const amount = readNumber(value('amount-' + index),'amount-' + index,amountOptions);
        physicalMass(amount,ingredient,'amount-' + index);
        return {ingredientId,amount:Math.round(amount * 1000)};
      });
      if (!written.length) throw new FieldError('','Dodaj co najmniej jeden składnik.');
      return ctx.commit(data => put(data,'recipes',old,{name,items:written,notes:text('notes'),
        current:old?.current ?? !live(data.recipes).length}),parent);
    },
    action(action) {
      if (action === 'add-line') {
        document.getElementById('recipe-lines').insertAdjacentHTML('beforeend',readLine());
        document.getElementById('ingredient-' + (next - 1)).focus();
        ctx.dirty();
      }
      if (action.startsWith('drop:')) {
        document.querySelector('[data-recipe-line="' + action.slice(5) + '"]').remove();
        ctx.dirty();
      }
      if (action === 'delete') return ctx.commit(data => removeRecipe(data,id),'feed','Usunięto');
    }};
}

export function movementForm(ctx, type, ingredientId, eventId) {
  if (!movementLabels[type]) return missing('stock');
  const old = get(ctx,'ingredientEvents',eventId);
  if (eventId && (!old || old.type !== type || old.ingredientId !== ingredientId)) return missing('stock');
  let ingredient = get(ctx,'ingredients',ingredientId) ?? ctx.derived.ingredients[0];
  const parent = ingredientId ? 'ingredient/' + ingredientId : 'stock';
  if (!ingredient) return {title:movementLabels[type],parent:'stock',
    body:empty('Najpierw dodaj składnik do magazynu.',link('Dodaj składnik','ingredient-form','tonal'))};
  const correction = type === 'correction';
  const purchase = type === 'purchase';
  const selection = ctx.derived.ingredients.slice().sort((a,b) => a.name.localeCompare(b.name,'pl'));
  let date = old?.date ?? ctx.today;
  const currentStock = () => {
    if (!correction) return stock(ctx.data.ingredientEvents,ingredient.id,old?.id);
    const earlier = ctx.data.ingredientEvents.filter(event => event.date < date ||
      (event.date === date && (!old || event.createdAt <= old.createdAt)));
    return stock(earlier,ingredient.id,old?.id);
  };
  const initialAmount = old ? showAmount(correction ? old.measured ?? (currentStock() + old.grams) : Math.abs(old.grams), ingredient) : null;
  const signed = grams => (grams > 0 ? '+' : '') + fmt.quantity(showAmount(grams,ingredient),ingredient.unit);
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
    document.getElementById('calculated-stock').textContent = signed(currentStock()).replace(/^\+/,'');
    try { output.textContent = 'Różnica ' + signed(correctionDelta(getQuantity())); }
    catch { output.textContent = ''; }
  };

  return {title:movementLabels[type],subtitle:ingredientId ? ingredient.name : '',parent,form:true,
    body:form(`${ingredientId ? '' : select('ingredient','Składnik',selection.map(row => [row.id,row.name]),ingredient.id)}
      ${changeRow('Data',fmt.fullDate(date),'date')}
      <div id="date-wrap" hidden>${dateInput(ctx,'date','Data wpisu',date)}</div>
      ${correction ? '<p>Stan wyliczony <strong id="calculated-stock">' + signed(currentStock()).replace(/^\+/,'') + '</strong></p>' : ''}
      ${keypad('quantity',correction ? 'Jest faktycznie' : 'Ilość',asInput(initialAmount),ingredient.unit)}
      ${correction ? '<p id="difference" role="status">' + (old ? 'Różnica ' + signed(old.grams) : '') + '</p>' : ''}
      ${purchase ? priceBlock(ingredient,defaultMode) : ''}
      ${type === 'withdrawal' ? textarea('notes','Uwagi (opcjonalnie)',old?.notes) : ''}`,'Zapisz',Boolean(old)),
    change(target) {
      if (target.id === 'date' && target.value) {
        date = target.value;
        document.querySelector('[data-action="date"]').previousElementSibling.querySelector('strong').textContent = fmt.fullDate(date);
        updateDifference();
      }
      if (target.id === 'ingredient') {
        ingredient = get(ctx,'ingredients',target.value);
        document.querySelector('[data-unit-for="quantity"]').textContent = ingredient.unit;
        if (purchase) document.getElementById('prices').outerHTML = priceBlock(ingredient,'per-kg');
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
      if (purchase) {
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
      const balance = correction ? correctionDelta(grams) : purchase ? grams : -grams;
      return ctx.commit(data => put(data,'ingredientEvents',old,{ingredientId:ingredient.id,
        type,date:when,grams:balance,measured:correction ? grams : null,price,priceMode,batchId:null,notes:text('notes')}),parent);
    },
    action(action) {
      if (action === 'date') {
        const wrap = document.getElementById('date-wrap');
        wrap.hidden = !wrap.hidden;
        if (!wrap.hidden) document.getElementById('date').focus();
      }
      if (action === 'delete') return ctx.commit(data => remove(data,'ingredientEvents',eventId),parent,'Usunięto');
    }};
}

export function mixForm(ctx, name, id, origin) {
  const editing = name === 'batch-form';
  const original = editing ? get(ctx,'batches',id) : null;
  if (editing && !original) return missing('feed');
  const recipeList = ctx.derived.recipes;
  let recipe = (editing ? null : get(ctx,'recipes',id)) ?? ctx.derived.current;
  const parent = editing ? 'batch/' + id : (origin === 'start' ? 'start' : get(ctx,'recipes',id) ? 'recipe/' + id : 'feed');
  if (!editing && !recipe) return {title:'Mieszam',parent,
    body:empty('Najpierw dodaj recepturę.',link('Dodaj recepturę','recipe-form','tonal'))};
  let target = original?.mass ?? 50000;
  let massMode = '50';
  let date = original?.date ?? ctx.today;
  let start = original?.start ?? ctx.today;
  let items = original ? structuredClone(original.items) : [];
  let selected = new Set();
  let editedIndex = null;

  function scale() {
    items = scaleRecipe(recipeComposition(recipe,ctx.derived.ingredients),target);
    selected = new Set();
  }
  if (!editing) scale();
  const batchMass = () => items.reduce((sum, item) => sum + item.grams,0);

  function chips() {
    return [['50','50 kg'],['100','100 kg'],['custom','Inna']].map(([key,label]) =>
      `<button type="button" class="chip" aria-pressed="${key === massMode}" data-action="mass:${key}">${key === massMode ? icon('check') : ''}${label}</button>`).join('');
  }

  function recipeChips() {
    return recipeList.map(item => `<button type="button" class="chip" aria-pressed="${item.id === recipe.id}" data-action="choose:${item.id}">${item.id === recipe.id ? icon('check') : ''}${html(item.name)}</button>`).join('');
  }

  function itemEditor(index) {
    const item = items[index];
    return `<div class="card stack" id="quantity-edit">${keypad('adjust','Ilość · ' + item.name,
      asInput(showAmount(item.grams,item)),item.unit)}
      <div class="actions">${button('Zastosuj ilość','apply-quantity','tonal','check')}${button('Anuluj','cancel-quantity')}</div></div>`;
  }

  function checkList() {
    return items.map((item,index) => `<div class="checklist-row">
      ${editing ? '<span class="grow">' + html(item.name) + '</span>' :
        `<label for="check-${index}"><input id="check-${index}" type="checkbox" data-check="${index}" ${selected.has(index) ? 'checked' : ''}><span>${html(item.name)}</span></label>`}
      <button class="button" type="button" data-action="quantity:${index}" aria-label="Zmień ilość: ${html(item.name)}, ${fmt.quantity(showAmount(item.grams,item),item.unit,true)}">
        ${fmt.quantity(showAmount(item.grams,item),item.unit,true)}${icon('edit')}</button></div>${editedIndex === index ? itemEditor(index) : ''}`).join('');
  }

  function dateSection() {
    return `${changeRow('Mieszanie',fmt.fullDate(date),'show-dates')}
      ${changeRow('Podawanie od',fmt.fullDate(start),'show-dates')}
      <div class="form-grid" id="mix-dates" hidden>${dateInput(ctx,'mixed','Data mieszania',date)}
        ${dateField('start','Początek podawania',start,date,original?.end ? addDays(original.end,-1) : '9999-12-30')}</div>`;
  }

  function renderMix() {
    if (!editing) {
      document.getElementById('mass-chips').innerHTML = chips();
      document.getElementById('recipe-chips').innerHTML = recipeChips();
    }
    document.getElementById('checklist').innerHTML = checkList();
    document.getElementById('actual-mass').textContent = fmt.mass(batchMass(),true);
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

  function applyTarget() {
    const custom = document.getElementById('custom-target');
    if (editing || custom.hidden) return;
    const chosen = Math.round(readNumber(value('target'),'target',amountOptions) * 1000);
    if (chosen !== target) { target = chosen; editedIndex = null; scale(); renderMix(); }
    custom.hidden = true;
  }

  return {title:editing ? 'Edytuj partię' : 'Mieszam',subtitle:original?.recipeName,parent,form:true,
    body:form(`${editing ? '' : `<fieldset><legend>Receptura</legend><div class="actions" id="recipe-chips">${recipeChips()}</div></fieldset>
      <fieldset><legend>Masa partii</legend><div class="actions" id="mass-chips">${chips()}</div></fieldset>
      <div id="custom-target" class="card stack" hidden>${keypad('target','Własna masa','','kg')}
      <div>${button('Przelicz składniki','apply-mass','tonal')}</div></div>`}
      <fieldset><legend>${editing ? 'Skład' : 'Składniki do dosypania'}</legend><div id="checklist">${checkList()}</div></fieldset>
      <div class="value-row"><span>Masa mieszanki</span><strong id="actual-mass">${fmt.mass(batchMass(),true)}</strong></div>
      <div id="date-rows">${dateSection()}</div>`,editing ? 'Zapisz' : 'Zatwierdź partię',editing),
    change(element) {
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
      applyTarget();
      const mixed = readDate(value('mixed'),'mixed','1900-01-01',ctx.today);
      const begins = readDate(value('start'),'start',mixed,original?.end ? addDays(original.end,-1) : '9999-12-30');
      if (items.some(row => row.grams <= 0)) throw new FieldError('','Zwiększ masę partii albo podaj ilości od 1 g dla każdego składnika.');
      const mass = batchMass();
      if (original?.remaining > mass) throw new FieldError('','Pozostałość przekracza masę mieszanki. Skoryguj ją w zakończeniu partii.');
      if (!editing && selected.size < items.length && !await ctx.confirm('Zatwierdzić partię?',
        'Nie wszystkie składniki są odhaczone. Zatwierdzić?', 'Zatwierdź')) return;
      const mixItems = items.map(({ingredientId,name,unit,density,grams,price}) => ({ingredientId,name,unit,density,grams,price}));
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
        const mode = action.slice(5);
        if (editedIndex !== null) applyQuantity();
        const custom = document.getElementById('custom-target');
        if (mode !== massMode) ctx.dirty();
        massMode = mode;
        custom.hidden = mode !== 'custom';
        if (mode !== 'custom') { target = Number(mode) * 1000; scale(); }
        renderMix();
        if (mode === 'custom') document.getElementById('target').focus();
      }
      if (action === 'apply-mass') { applyTarget(); ctx.dirty(); }
      if (action.startsWith('choose:')) {
        const nextRecipe = get(ctx,'recipes',action.slice(7));
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
      ...(daily > 0 ? [['Na ile starcza 100 kg','≈ ' + fmt.days(100000/daily) + ' <small>prognoza</small>']] : [])]);
  }
  return {title:batch.end ? 'Edytuj zakończenie' : 'Zakończ partię',subtitle:batch.recipeName,parent,form:true,
    body:form(`${dateField('end','Pierwszy dzień bez tej partii',date,earliest)}
      ${keypad('remaining','Pozostałość',asInput(remaining / 1000),'kg')}
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

export function cohortForm(ctx,id) {
  const cohort = get(ctx,'cohorts',id);
  if (id && !cohort) return missing('flock');
  const parent = cohort ? 'cohort/' + id : 'flock';
  const dateKind = cohort?.dateKind ?? 'hatch';
  const firstChange = live(ctx.data.cohortChanges).filter(row => row.cohortId === id).sort((a,b) => a.date.localeCompare(b.date))[0];
  return {title:cohort ? 'Edytuj rocznik' : 'Dodaj rocznik',parent,form:true,
    body:form(`${field('name','Nazwa',cohort?.name,{length:80})}
      <div class="form-grid">${select('category','Kategoria',[['hens','Kury'],['roosters','Koguty']],cohort?.category ?? 'hens')}
      ${select('date-kind','Rodzaj daty',[['hatch','Wyklucie'],['purchase','Zakup']],dateKind)}
      ${dateField('date','Data',cohort?.date ?? ctx.today,'1900-01-01',firstChange?.date ?? ctx.today)}</div>
      <div id="weeks-wrap"${dateKind === 'hatch' ? ' hidden' : ''}>${field('weeks','Wiek przy zakupie w tygodniach (opcjonalnie)',asInput(cohort?.weeks),{mode:'numeric'})}</div>
      ${keypad('count',cohort ? 'Początkowa liczba' : 'Liczba ptaków',asInput(cohort?.count),'szt.',false)}
      ${field('mark','Oznaczenie (opcjonalnie)',cohort?.mark,{length:80})}${textarea('notes','Uwagi (opcjonalnie)',cohort?.notes)}`,'Zapisz',Boolean(cohort)),
    change(target) {
      if (target.id === 'date-kind') document.getElementById('weeks-wrap').hidden = target.value === 'hatch';
    },
    submit() {
      const name = readName(value('name'));
      const category = value('category');
      const dateKind = value('date-kind');
      const date = readDate(value('date'),'date','1900-01-01',firstChange?.date ?? ctx.today);
      const weeks = dateKind === 'purchase' ? readNumber(value('weeks'),'weeks',{optional:true,digits:0,max:5200}) : null;
      const count = readNumber(value('count'),'count',{digits:0,max:1000000});
      return ctx.commit(data => put(data,'cohorts',cohort,{name,category,dateKind,date,weeks,count,mark:text('mark'),notes:text('notes')}),parent);
    },
    action(action) {
      if (action !== 'delete') return;
      return ctx.commit(data => {
        remove(data,'cohorts',id);
        for (const row of live(data.cohortChanges)) if (row.cohortId === id) row.deleted = true;
      },'flock','Usunięto');
    }};
}

export function changeForm(ctx,id,changeId) {
  const cohort = get(ctx,'cohorts',id);
  const old = get(ctx,'cohortChanges',changeId);
  if (!cohort || (changeId && (!old || old.cohortId !== id))) return missing('flock');
  const parent = 'cohort/' + id;
  return {title: old ? 'Edytuj zmianę liczby' : 'Zmień liczbę',subtitle:cohort.name,parent,form:true,
    body:form(`${dateInput(ctx,'date','Data',old?.date,cohort.date)}
      ${keypad('count','Nowa liczba',asInput(old?.count),'szt.',false)}
      ${textarea('notes','Uwagi (opcjonalnie)',old?.notes)}`,'Zapisz',Boolean(old)),
    submit() {
      const date = readDate(value('date'),'date',cohort.date,ctx.today);
      const count = readNumber(value('count'),'count',{digits:0,max:1000000});
      return ctx.commit(data => put(data,'cohortChanges',old,{cohortId:id,date,count,notes:text('notes')}),parent);
    },
    action(action) {
      if (action === 'delete') return ctx.commit(data => remove(data,'cohortChanges',changeId),parent,'Usunięto');
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
