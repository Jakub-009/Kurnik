export const stores = ['ingredients', 'ingredientEvents', 'recipes', 'batches', 'cohorts', 'cohortChanges', 'settings'];

export const live = rows => rows.filter(row => !row.deleted);
export const record = fields => ({
  id: crypto.randomUUID(), createdAt: new Date().toISOString(), deleted: false, ...fields
});

function initialData() {
  const ingredients = ['Pszenica', 'Kukurydza', 'Śruta sojowa', 'Groch', 'Kreda', 'Dolmix DN', 'Olej']
    .map((name, i) => record({name, unit: i === 6 ? 'l' : 'kg', density: i === 6 ? 0.92 : null, price: null, oil: i === 6}));
  const amounts = [17000, 13000, 10000, 5000, 3250, 1250, 1000];
  return {
    ingredients, ingredientEvents: [], batches: [], cohorts: [], cohortChanges: [],
    recipes: [record({name: 'Mieszanka podstawowa', current: true, notes: '',
      items: ingredients.map(({id}, i) => ({ingredientId: id, amount: amounts[i]}))})],
    settings: [record({revision: 0, threshold: 30, defaultDaily: 3700, readyPrice: null, lastExport: null})]
  };
}

export async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kurnik', 1);
    request.onupgradeneeded = () => {
      const data = initialData();
      for (const name of stores) {
        const store = request.result.createObjectStore(name, {keyPath: 'id'});
        for (const row of data[name]) store.add(row);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function loadData(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readonly');
    const data = {};
    for (const name of stores) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { data[name] = request.result; };
    }
    tx.oncomplete = () => resolve(data);
    tx.onabort = () => reject(tx.error);
  });
}

export function saveData(db, previous, next) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    const request = tx.objectStore('settings').getAll();
    let conflict = false;
    request.onsuccess = () => {
      const before = previous.settings[0];
      const current = request.result[0];
      if (current?.id !== before.id || current.revision !== before.revision) {
        conflict = true;
        tx.abort();
        return;
      }
      next.settings[0].revision = before.revision + 1;
      for (const name of stores) {
        const store = tx.objectStore(name);
        const old = new Map(previous[name].map(row => [row.id, row]));
        for (const row of next[name]) {
          if (JSON.stringify(old.get(row.id)) !== JSON.stringify(row)) store.put(row);
          old.delete(row.id);
        }
        for (const id of old.keys()) store.delete(id);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(conflict ? Object.assign(new Error('Dane zmieniły się w innym oknie. Otwórz formularz ponownie.'), {conflict:true}) : tx.error);
  });
}

export function refreshPrices(data) {
  const purchases = live(data.ingredientEvents).filter(row => row.type === 'purchase' && row.price)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const prices = new Map();
  for (const row of purchases) {
    if (!prices.has(row.ingredientId)) prices.set(row.ingredientId, row.price);
  }
  for (const ingredient of data.ingredients) ingredient.price = prices.get(ingredient.id) ?? null;
}
