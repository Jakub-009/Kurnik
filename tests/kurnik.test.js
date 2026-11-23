import {test} from 'node:test';
import assert from 'node:assert/strict';
import {averageFlock,batchBaseMass,batchAdditives,batchResult,buyAmount,cohortAge,cohortCount,consumptionHistory,
  dailyAverage,flockCount,ingredientMass,isAdditive,lastBatchMass,lastStockSource,mixtureCost,recipeComposition,
  remainingMix,savings,scaleRecipe,scaleBatchRecipe,stock,supplyForecast,validCohortHistory} from '../src/calc/index.js';
import {decodeBackup,encodeBackup} from '../src/backup.js';
import {record} from '../src/db.js';
import {derive,putBatch,removeBatch} from '../src/model.js';
import {ingredientView,movementDetail,recipeView,start,feed,cohortView} from '../src/views.js';
import * as fmt from '../ui/format.js';

const today = '2026-11-22';
const amounts = [17000,13000,10000,5000,3250,1250,1000];
const names = ['Pszenica','Kukurydza','Śruta sojowa','Groch','Kreda','Dolmix DN','Olej'];
const fixture = () => {
  const ingredients = names.map((name,i) => record({name,unit:i === 6 ? 'l' : 'kg',density:i === 6 ? .92 : null,price:null,kind:i === 6 ? 'additive' : 'base'}));
  const recipe = record({name:'Podstawowa',items:ingredients.map((row,i) => ({ingredientId:row.id,amount:amounts[i]})),
    current:true,notes:''});
  const data = {ingredients,recipes:[recipe],batches:[],ingredientEvents:[],cohorts:[],cohortChanges:[],
    settings:[record({threshold:30,defaultDaily:3700,readyPrice:null,lastExport:null,revision:0})]};
  return {data,ingredients,recipe,composition:recipeComposition(recipe,ingredients)};
};
const finished = {mass:1000000,start:'2025-04-22',end:'2026-01-17',remaining:0,createdAt:'2025-04-22T12:00:00.000Z'};
const near = (value, expected, precision = 1e-8) => assert.ok(Math.abs(value - expected) <= precision,`${value} ≠ ${expected}`);

test('T1 – masa i udziały receptury', () => {
  const {composition} = fixture();
  assert.equal(composition.mass,49500);
  assert.equal(fmt.percent(composition.items[0].share),'34,3%');
  assert.equal(composition.additives.length,1);
  assert.equal(fmt.number(composition.additives[0].amount * 100 / composition.mass,2),'2,02');
});

test('T2 – litry bez gęstości są odrzucane', () => {
  assert.throws(() => ingredientMass(1000,'l',null), /gęstość/);
});

test('T3 – zużycie i dni użytkowania', () => {
  const {days,daily} = batchResult(finished);
  assert.equal(days,270);
  assert.equal(fmt.number(daily / 1000,3),'3,704');
  assert.equal(fmt.days(100000 / daily),'27 dni');
});

test('T4 – gramy na ptaka z historycznej obsady', () => {
  const cohort = record({date:'2025-04-22',count:30,category:'hens'});
  const birds = averageFlock([cohort],[],finished.start,finished.end);
  assert.equal(fmt.number(batchResult(finished).daily / birds,1),'123,5');
  const change = record({date:'2025-09-04',cohortId:cohort.id,count:20});
  assert.equal(averageFlock([cohort],[change],finished.start,finished.end),25);
});

test('T5–T6 – stan z dziennika i korekta', () => {
  const id = 'pszenica';
  const events = [500000,1000000,-340000,-5000].map(grams => record({ingredientId:id,grams}));
  assert.equal(stock(events,id),1155000);
  const difference = 1140000 - stock(events,id);
  assert.equal(difference,-15000);
  events.push(record({ingredientId:id,grams:difference}));
  assert.equal(stock(events,id),1140000);
});

test('T7 – prognoza do wyczerpania', () => {
  const {composition} = fixture();
  const forecast = supplyForecast(1000000,composition.items[0].share,batchResult(finished).daily,0,today);
  assert.equal(Math.round(forecast.days),786);
  assert.equal(forecast.date,'2029-01-16');
});

test('T8 – proporcje partii i dokładna masa docelowa', () => {
  const {composition} = fixture();
  const items = scaleBatchRecipe(composition,100000);
  assert.equal(items.filter(row => !row.additive).reduce((sum,row) => sum + row.grams,0),100000);
  assert.deepEqual(items.map(({grams,millilitres}) => fmt.number((millilitres ?? grams) / 1000,2)),
    ['34,34','26,26','20,2','10,1','6,57','2,53','2,02']);
});

test('T9 – pozostałość i dni prognozy', () => {
  const daily = batchResult(finished).daily;
  const remain = remainingMix({mass:100000,start:'2026-11-12'},daily,today);
  assert.equal(fmt.mass(remain),'63 kg');
  assert.equal(fmt.days(remain / daily),'17 dni');
});

test('T10 – pełna precyzja ceny za litr i porównania', () => {
  const {recipe, ingredients} = fixture();
  const prices = [70,65,200,130,86,560,400];
  ingredients.forEach((row,i) => { row.price = {cents:prices[i],grams:i === 6 ? 920 : 1000}; });
  const composition = recipeComposition(recipe,ingredients);
  const cost = mixtureCost([...composition.items,...composition.additives],composition.mass);
  near(cost.cents,6064.5);
  near(cost.perKg / 100,1.22515,.00001);
  assert.equal(fmt.money(cost.perKg * 100),'122,52\u00a0zł');
  assert.equal(fmt.money(savings(1352000,200,cost.perKg)),'1\u00a0047,60\u00a0zł');
});

test('T11 – pełne miesiące i wiek minimalny', () => {
  const cohort = {date:'2025-04-14',dateKind:'purchase',weeks:16};
  assert.equal(fmt.age(cohortAge(cohort,today)),'1 rok 10 mies.');
  assert.equal(fmt.age(cohortAge({...cohort,weeks:null},today)),'co najmniej 1 rok 7 mies.');
});

test('T12 – ekran receptury ukrywa koszty przy braku cen', () => {
  const {data,recipe} = fixture();
  assert.doesNotMatch(recipeView({data,derived:derive(data,today),today},recipe.id).body,/koszt|zł/i);
  data.ingredients[0].price = {cents:70,grams:1000};
  assert.match(recipeView({data,derived:derive(data,today),today},recipe.id).body,/Brak danych/);
});

test('partie nachodzące na siebie mają wspólne dni liczone tylko raz', () => {
  const rows = [{...finished,mass:10000,start:'2026-01-01',end:'2026-01-11'},
    {...finished,mass:10000,start:'2026-01-06',end:'2026-01-16'}];
  near(dailyAverage(rows,3700,today),20000 / 15);
});

test('zatwierdzony skład i ceny są niezależne od receptury oraz usuwa się je wraz z ruchem', () => {
  const {data,recipe,ingredients} = fixture();
  ingredients[0].price = {cents:70,grams:1000};
  const items = structuredClone(recipeComposition(recipe,ingredients).items.map(({additive,...item}) => item));
  const batch = putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,date:today,start:today,
    end:null,remaining:null,mass:49500,items});
  ingredients[0].price.cents = 100;
  recipe.items[0].amount = 27000;
  assert.equal(batch.items[0].grams,17000);
  assert.equal(batch.items[0].price.cents,70);
  assert.equal(stock(data.ingredientEvents,ingredients[0].id),-17000);
  removeBatch(data,batch.id);
  assert.equal(stock(data.ingredientEvents,ingredients[0].id),0);
});

test('kopię można odtworzyć i zweryfikować przed zapisem', () => {
  const {data,ingredients,recipe,composition} = fixture();
  const oil = ingredients[6];
  const exactPrice = {cents:400,grams:920};
  oil.price = exactPrice;
  data.ingredientEvents.push(record({ingredientId:oil.id,type:'purchase',date:today,grams:1840,measured:null,
    price:exactPrice,priceMode:'per-litre',batchId:null,notes:''}));
  putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,date:today,start:today,
    end:null,remaining:null,mass:composition.mass,items:composition.items.map(({additive,...item}) => item)});
  const cohort = record({name:'Kury',category:'hens',date:today,dateKind:'hatch',weeks:null,count:30,mark:'',notes:''});
  data.cohorts.push(cohort);
  data.cohortChanges.push(record({cohortId:cohort.id,date:today,count:29,notes:''}));
  const restored = decodeBackup(encodeBackup(data,today));
  assert.deepEqual(restored,{...data,settings:[{...data.settings[0],lastExport:today}]});
  data.batches[0].mass += 1;
  assert.throws(() => decodeBackup(encodeBackup(data,today)),/uszkodzony/g);
});

test('Start ma trzy karty, jeden najbliższy brak i odróżnia brak stanu od wpisanego zera', () => {
  const {data,ingredients} = fixture();
  const render = () => {
    const derived = derive(data,today);
    return {derived,screen:start({data,derived,today})};
  };
  assert.equal(render().screen.floating,undefined);
  assert.equal((render().screen.body.match(/start-card/g) ?? []).length,3);
  assert.match(render().screen.body,/Wpisz stany/);
  assert.doesNotMatch(render().screen.body,/≈ 0 dni/);

  data.ingredientEvents.push(
    record({ingredientId:ingredients[0].id, type:'addition', grams:100000}),
    record({ingredientId:ingredients[1].id, type:'correction', grams:0}),
    record({ingredientId:ingredients[5].id, type:'batch', grams:-1000}),
    record({ingredientId:ingredients[3].id, type:'purchase', grams:1000})
  );
  const {derived,screen} = render();
  assert.deepEqual(derived.stocks.slice(0,3).map(row => row.ingredient.name),['Kukurydza','Groch','Pszenica']);
  assert.equal(derived.stocks[0].outlook.days,0);
  assert.equal(derived.stocks.find(row => row.ingredient.name === 'Dolmix DN').outlook,null);
  assert.match(screen.body,/Kukurydza · ≈ 0 dni/);
});

test('mieszanie pokazuje zaokrąglenie bez utraty precyzji w partii', () => {
  const {composition} = fixture();
  const [wheat] = scaleRecipe(composition,100000);
  assert.equal(wheat.grams,34343);
  assert.equal(fmt.mixingQuantity(wheat.grams / 1000),'34,3 kg');
  assert.equal(fmt.mixingQuantity(1.25),'1,3 kg');
  assert.equal(fmt.mixingQuantity(.003),'0,003 kg');
});

test('zdarzenia rocznika liczą obsadę niezależnie od starych statusów', () => {
  const cohort = record({name:'Kury',category:'hens',date:'2026-06-01',dateKind:'hatch',count:10,status:'young'});
  const changes = [
    {type:'add',date:'2026-07-01',count:3,origin:'purchase'},
    {type:'loss',date:'2026-08-01',count:1,reason:'died'},
    {type:'status',date:'2026-09-01',status:'laying'},
    {date:'2026-10-01',count:9},
    {type:'status',date:'2026-11-01',status:'retired'}
  ].map(fields => record({...fields,cohortId:cohort.id}));
  assert.equal(validCohortHistory(cohort,changes),true);
  assert.equal(validCohortHistory(cohort,changes.slice(3)),true);
  assert.equal(validCohortHistory(cohort,[...changes,record({cohortId:cohort.id,type:'loss',date:today,count:10})]),false);
  assert.equal(cohortCount(cohort,changes,'2026-08-31'),12);
  assert.equal(cohortCount(cohort,changes,'2026-09-01'),12);
  assert.equal(flockCount([cohort],changes,'2026-10-01').hens,9);
  assert.equal(flockCount([cohort],changes,today).hens,9);
  assert.equal(averageFlock([cohort],changes,'2026-07-31','2026-08-02'),12.5);
  assert.equal(averageFlock([cohort],changes,'2026-05-31','2026-06-02'),null);
});

test('stare kopie zachowują liczebność bez przypisywania kur do niosek, a nowe obsługują zdarzenia', () => {
  const {data,ingredients} = fixture();
  const cohort = record({name:'Kury',category:'hens',date:'2026-06-01',dateKind:'hatch',count:10,
    weeks:null,mark:'',notes:''});
  const oldCorrection = record({cohortId:cohort.id,date:'2026-07-01',count:9,notes:''});
  data.cohorts.push(cohort);
  data.cohortChanges.push(oldCorrection);
  const oldBackup = JSON.parse(encodeBackup(data,today));
  oldBackup.version = 1;
  const oldData = decodeBackup(JSON.stringify(oldBackup));
  assert.equal(flockCount(oldData.cohorts,oldData.cohortChanges,today).hens,9);
  assert.equal(flockCount(oldData.cohorts,oldData.cohortChanges,today).roosters,0);

  Object.assign(cohort,{status:'young',origin:'rearing',expectedStart:'2026-08-01'});
  data.cohortChanges.push(record({cohortId:cohort.id,type:'status',date:'2026-08-01',status:'laying',notes:''}));
  data.ingredientEvents.push(record({ingredientId:ingredients[0].id,type:'addition',date:today,grams:123000,
    measured:null,price:null,priceMode:null,batchId:null,notes:''}));
  const saved = decodeBackup(encodeBackup(data,today));
  assert.equal(flockCount(saved.cohorts,saved.cohortChanges,today).hens,9);
  assert.equal(saved.ingredientEvents[0].grams,123000);
  data.cohortChanges[1].status = 'retired';
  assert.equal(flockCount(decodeBackup(encodeBackup(data,today)).cohorts,data.cohortChanges,today).total,9);
});

test('zdarzenia zapisane w tym samym momencie zachowują kolejność wpisów', () => {
  const cohort = record({category:'hens',date:today,count:10,status:'young'});
  const fields = {cohortId:cohort.id,date:today,createdAt:'2026-11-22T12:00:00.000Z'};
  const events = [
    record({...fields,type:'correction',count:9,order:3}),
    record({...fields,type:'add',count:3,order:2}),
    record({...fields,type:'loss',count:2,order:1})
  ];
  assert.equal(cohortCount(cohort,events,today),9);
});

test('olej nie zmienia proporcji bazowych ani masy wybranej do przeliczenia', () => {
  const {data,ingredients,recipe} = fixture();
  const oil = ingredients[6];
  delete oil.kind;
  assert.equal(isAdditive(oil),true);
  const composition = recipeComposition(recipe,ingredients);
  assert.equal(composition.mass,49500);
  assert.equal(composition.items.length,6);
  near(composition.items.reduce((sum,item) => sum + item.share,0),1);
  for (const grams of [50000,100000]) {
    const scaled = scaleRecipe(composition,grams);
    assert.equal(scaled.reduce((sum,item) => sum + item.grams,0),grams);
    assert.ok(!scaled.some(item => item.ingredientId === oil.id));
  }
  assert.equal(derive(data,today).stocks.find(row => row.ingredient.id === oil.id).outlook,null);
});

test('partia zapisuje litry oleju, odejmuje zapas i liczy jego koszt obok masy bazowej', () => {
  const {data,ingredients,recipe} = fixture();
  const oil = ingredients[6];
  delete oil.kind;
  oil.oil = true;
  oil.name = 'Olej sojowy';
  for (const ingredient of ingredients) {
    ingredient.price = ingredient.oil ? {cents:400,grams:920} : {cents:100,grams:1000};
  }
  data.ingredientEvents.push(record({ingredientId:oil.id,type:'purchase',date:today,grams:9200,
    measured:null,price:oil.price,priceMode:'per-litre',batchId:null,notes:''}));
  const base = scaleRecipe(recipeComposition(recipe,ingredients),50000).map(({additive,...item}) => item);
  const oilItem = {ingredientId:oil.id,name:oil.name,unit:'l',density:.92,oil:true,millilitres:1250,grams:1150,price:oil.price};
  const batch = putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,date:today,start:today,
    end:null,remaining:null,mass:51150,items:[...base,oilItem]});
  assert.equal(batchBaseMass(batch),50000);
  assert.equal(batchAdditives(batch)[0].millilitres,1250);
  assert.equal(stock(data.ingredientEvents,oil.id),8050);
  near(mixtureCost(batch.items).cents,5500);
  const restored = decodeBackup(encodeBackup(data,today));
  assert.deepEqual(restored.batches[0],batch);
  batch.items.at(-1).millilitres = 1000;
  assert.throws(() => decodeBackup(encodeBackup(data,today)),/uszkodzony/g);
});

test('receptura zachowuje pozycję dodatku i przelicza jego litraż niezależnie od bazy', () => {
  const {data,ingredients,recipe} = fixture();
  ingredients[6].oil = true;
  const oilRow = recipe.items.pop();
  recipe.items.splice(1,0,oilRow);
  const composition = recipeComposition(recipe,ingredients);
  const [oil] = composition.additives;
  assert.equal(oil.position,1);
  assert.equal(oil.ingredientId,ingredients[6].id);
  assert.equal(composition.mass,49500);
  assert.equal(scaleBatchRecipe(composition,50000)[1].millilitres,1010);
  assert.equal(scaleBatchRecipe(composition,100000)[1].millilitres,2020);
  const body = recipeView({data,derived:derive(data,today),today},recipe.id).body;
  assert.match(body,/Pszenica[\s\S]*Olej[\s\S]*Dodatek[\s\S]*Kukurydza/);
  const restored = decodeBackup(encodeBackup(data,today));
  assert.deepEqual(restored.recipes[0].items,recipe.items);
});

test('magazyn pokazuje 22,5 kg po zużyciu 2,5 kg z 25 kg i prowadzi do podglądu ruchu', () => {
  const {data,ingredients,recipe} = fixture();
  const ingredient = ingredients[0];
  const purchase = record({ingredientId:ingredient.id,type:'purchase',date:'2026-11-15',grams:25000,
    price:{cents:200,grams:1000},priceMode:'per-kg',notes:'Dostawa'});
  data.ingredientEvents.push(purchase);
  const batch = putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,mass:2500,date:today,start:today,
    end:null,items:[{ingredientId:ingredient.id,name:ingredient.name,unit:'kg',density:null,grams:2500,price:null}]});
  const usage = data.ingredientEvents.find(event => event.batchId === batch.id);
  const ctx = {data,derived:derive(data,today),today};
  const page = ingredientView(ctx,ingredient.id);
  assert.match(page.body,/>\s*22,5 kg<\/p>/);
  assert.match(page.body,/>−2,5 kg<\/span>/);
  assert.ok(page.body.includes('#movement-detail/' + usage.id));
  assert.doesNotMatch(page.body,/#movement\/purchase/);
  const purchased = movementDetail(ctx,purchase.id);
  assert.match(purchased.body,/Koszt zakupu[\s\S]*50,00/);
  assert.ok(purchased.body.includes('#movement/purchase/' + ingredient.id + '/' + purchase.id));
  const consumed = movementDetail(ctx,usage.id);
  assert.ok(consumed.body.includes('#batch/' + batch.id + '/' + usage.id));
  assert.equal(fmt.stockQuantity(22.501,'kg'),'22,501 kg');
  assert.equal(fmt.stockQuantity(25,'kg',true),'+25 kg');
});

test('Start identyfikuje prognozowaną partię i szacuje 70 kg dla samotnej partii z 15.11', () => {
  const {data,recipe,ingredients} = fixture();
  const now = '2026-11-23';
  const batch = (date,recipeName) => record({mass:100000,date,start:date,end:null,recipeName,
    recipeId:recipe.id,items:[{ingredientId:ingredients[0].id,grams:100000}]});
  const recent = batch('2026-11-15','Nowsza');
  data.batches.push(recent);
  let derived = derive(data,now);
  assert.equal(derived.active.remaining,70400);
  let body = start({data,derived,today:now}).body;
  assert.match(body,/≈ 70 kg · ≈ 19 dni/);
  assert.match(body,/Nowsza · Dzień karmienia 9/);

  const older = batch('2026-11-02','Wcześniejsza');
  data.batches.push(older);
  derived = derive(data,now);
  assert.equal(derived.active.batch.id,older.id);
  assert.equal(derived.active.remaining,22300);
  assert.equal(derived.openStatus.find(entry => entry.batch.id === recent.id).remaining,100000);
  body = start({data,derived,today:now}).body;
  assert.match(body,/≈ 22 kg · ≈ 6 dni/);
  assert.match(body,/Wcześniejsza/);
  assert.match(feed({data,derived,today:now}).body,/Masz jeszcze 1 niezakończoną partię/);
});

test('T13 – prognoza dodatku uwzględnia dawkę i masę pozostałej mieszanki', () => {
  const {data,ingredients} = fixture();
  const oil = ingredients[6];
  data.settings[0].defaultDaily = batchResult(finished).daily;
  data.ingredientEvents.push(record({ingredientId:oil.id,type:'addition',grams:9200,date:today}));
  let outlook = derive(data,today).stocks.find(row => row.ingredient.id === oil.id).outlook;
  assert.equal(Math.round(outlook.days),134);
  const gramsPerKg = 920 / 49500;
  outlook = supplyForecast(9200,gramsPerKg,data.settings[0].defaultDaily,50000,today);
  near(outlook.available,9200 + 50000 * gramsPerKg);
});

test('T14 – zapas na 60 i 90 dni, w górę do kg lub do 0,1 l', () => {
  const {composition,ingredients} = fixture();
  const wheat = supplyForecast(50000,composition.items[0].share,3500,0,today);
  assert.equal(buyAmount(wheat,60,ingredients[0]),23);
  assert.equal(buyAmount(wheat,90,ingredients[0]),59);
  const oil = ingredients[6];
  const outlook = supplyForecast(9200,920 / 49500,3500,0,today);
  assert.equal(buyAmount(outlook,60,oil),0);
  assert.equal(buyAmount(supplyForecast(0,920 / 49500,3500,0,today),60,oil),4.3);
});

test('T15–T16 – 75 kg, więcej niż jeden dodatek i ostatnia zapisana masa', () => {
  const {data,composition,recipe,ingredients} = fixture();
  const herb = record({name:'Pokrzywa',kind:'additive',unit:'kg',density:null,price:null});
  ingredients.push(herb);
  recipe.items.splice(2,0,{ingredientId:herb.id,amount:500});
  const items = scaleBatchRecipe(recipeComposition(recipe,ingredients),75000);
  assert.equal(items[0].grams,25758);
  assert.equal(items[2].ingredientId,herb.id);
  assert.equal(items.at(-1).millilitres,1515);
  assert.equal(composition.mass,49500);
  assert.equal(lastBatchMass([]),100000);
  const batch = putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,date:today,start:today,
    end:null,remaining:null,mass:75000,massBasis:'base',savedOrder:1,
    items:items.map(({additive,position,share,amount,...item}) => ({...item,...(additive ? {additive:true} : {})}))});
  assert.equal(lastBatchMass(data.batches),75000);
  assert.equal(stock(data.ingredientEvents,herb.id),-758);
  const restored = decodeBackup(encodeBackup(data,today));
  assert.deepEqual(restored.batches[0],batch);
});

test('T17–T18 – przybyło, ubyło i odczyt starszego stada', () => {
  const {data} = fixture();
  const cohort = record({name:'Kury',category:'hens',date:'2026-01-01',dateKind:'initial',count:30,weeks:null,mark:'',notes:'',status:'young'});
  const event = fields => record({cohortId:cohort.id,notes:'',...fields});
  data.cohorts.push(cohort);
  data.cohortChanges.push(event({type:'loss',date:'2026-01-02',count:1,notes:'padła'}),
    event({type:'add',date:'2026-01-03',count:5,notes:'dokupione'}));
  assert.equal(flockCount(data.cohorts,data.cohortChanges,today).total,34);
  const render = value => cohortView({data:value,derived:derive(value,today),today},cohort.id).body;
  assert.match(render(data),/−1 szt\.[\s\S]*padła/);
  assert.match(render(data),/\+5 szt\.[\s\S]*dokupione/);
  data.cohortChanges = [event({type:'loss',date:'2026-01-02',count:2,reason:'died'}),
    event({type:'status',date:'2026-01-03',status:'laying'}),event({type:'correction',date:'2026-01-04',count:25})];
  const legacy = JSON.parse(encodeBackup(data,today));
  legacy.version = 3;
  const restored = decodeBackup(JSON.stringify(legacy));
  assert.equal(restored.cohorts[0].date,cohort.date);
  assert.equal(restored.cohorts[0].dateKind,'purchase');
  assert.equal(flockCount(restored.cohorts,restored.cohortChanges,today).total,25);
  assert.match(render(restored),/Korekta: 25 szt\./);
  assert.match(render(restored),/−2 szt\.[\s\S]*padła/);
  assert.doesNotMatch(render(restored),/Zmiana statusu|Nioski/);
});

test('T19 – kopia zachowuje zapisane masy, daty i ruchy starszej partii z olejem', () => {
  const {data,recipe,ingredients} = fixture();
  const oil = ingredients[6];
  delete oil.kind;
  oil.oil = true;
  const items = scaleBatchRecipe(recipeComposition(recipe,ingredients),100000)
    .map(({additive,position,share,amount,...item}) => ({...item,...(additive ? {oil:true} : {})}));
  const batch = putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,date:'2026-10-01',start:'2026-10-02',
    end:'2026-11-01',remaining:50,mass:items.reduce((sum,item) => sum + item.grams,0),items});
  const legacy = JSON.parse(encodeBackup(data,today));
  legacy.version = 3;
  const restored = decodeBackup(JSON.stringify(legacy));
  assert.equal(restored.ingredients[6].kind,'additive');
  assert.equal(recipeComposition(restored.recipes[0],restored.ingredients).mass,49500);
  assert.deepEqual(restored.batches[0],batch);
  assert.deepEqual(restored.ingredientEvents,data.ingredientEvents);
});

test('T20 – domyślne źródło niezależne dla każdego składnika, również w starym magazynie', () => {
  const {ingredients, data} = fixture();
  const herb = record({name:'Pokrzywa',kind:'additive'});
  data.ingredientEvents.push(record({ingredientId:herb.id,type:'addition',date:today,grams:500}));
  assert.equal(lastStockSource(data.ingredientEvents,herb),'addition');
  assert.equal(lastStockSource(data.ingredientEvents,ingredients[0]),'purchase');
  herb.lastSource = 'purchase';
  assert.equal(lastStockSource(data.ingredientEvents,herb),'purchase');
});

test('wykres bierze najnowsze dwanaście zakończonych partii w kolejności daty końca', () => {
  const rows = Array.from({length:14},(_,index) => ({...finished,start:'2026-10-01',mass:100000,
    end:'2026-11-' + String(index + 1).padStart(2,'0')}));
  const series = consumptionHistory(rows.reverse(),today);
  assert.equal(series.length,12);
  assert.equal(series[0].date,'2026-11-02');
  assert.equal(series.at(-1).date,'2026-11-13');
});
