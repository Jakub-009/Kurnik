import {test} from 'node:test';
import assert from 'node:assert/strict';
import {averageFlock,batchResult,cohortAge,dailyAverage,ingredientMass,mixtureCost,recipeComposition,
  remainingMix,savings,scaleRecipe,stock,supplyForecast} from '../src/calc/index.js';
import {decodeBackup,encodeBackup} from '../src/backup.js';
import {record} from '../src/db.js';
import {derive,putBatch,removeBatch} from '../src/model.js';
import {recipeView} from '../src/views.js';
import * as fmt from '../ui/format.js';

const today = '2026-11-22';
const amounts = [17000,13000,10000,5000,3250,1250,1000];
const names = ['Pszenica','Kukurydza','Śruta sojowa','Groch','Kreda','Dolmix DN','Olej'];
const fixture = () => {
  const ingredients = names.map((name,i) => record({name,unit:i === 6 ? 'l' : 'kg',density:i === 6 ? .92 : null,price:null}));
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
  assert.equal(composition.mass,50420);
  assert.equal(fmt.percent(composition.items[0].share),'33,7%');
  assert.equal(fmt.percent(composition.items[6].share),'1,8%');
  assert.equal(fmt.number(100000 / composition.mass,2),'1,98');
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
  assert.equal(Math.round(forecast.days),801);
  assert.equal(forecast.date,'2029-01-31');
});

test('T8 – proporcje partii i dokładna masa docelowa', () => {
  const {composition} = fixture();
  const items = scaleRecipe(composition,100000);
  assert.equal(items.reduce((sum,row) => sum + row.grams,0),100000);
  assert.deepEqual(items.map(({grams,density}) => fmt.number(grams / 1000 / (density ?? 1),2)),
    ['33,72','25,78','19,83','9,92','6,45','2,48','1,98']);
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
  const cost = mixtureCost(recipeComposition(recipe,ingredients).items);
  near(cost.cents,6064.5);
  near(cost.perKg / 100,1.2028,.00001);
  assert.equal(fmt.money(cost.perKg * 100),'120,28\u00a0zł');
  assert.equal(fmt.money(savings(1352000,200,cost.perKg)),'1\u00a0077,82\u00a0zł');
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
  const items = structuredClone(recipeComposition(recipe,ingredients).items);
  const batch = putBatch(data,null,{recipeId:recipe.id,recipeName:recipe.name,date:today,start:today,
    end:null,remaining:null,mass:50420,items});
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
    end:null,remaining:null,mass:composition.mass,items:composition.items});
  const cohort = record({name:'Kury',category:'hens',date:today,dateKind:'hatch',weeks:null,count:30,mark:'',notes:''});
  data.cohorts.push(cohort);
  data.cohortChanges.push(record({cohortId:cohort.id,date:today,count:29,notes:''}));
  const restored = decodeBackup(encodeBackup(data,today));
  assert.deepEqual(restored,{...data,settings:[{...data.settings[0],lastExport:today}]});
  data.batches[0].mass += 1;
  assert.throws(() => decodeBackup(encodeBackup(data,today)),/niespójne/);
});
