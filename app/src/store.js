// Petit stockage IndexedDB pour le mode test cloud (voix clonées et historique, sur l'appareil).
const DB = "voxa";
let dbp;

function open() {
  dbp ??= new Promise((ok, ko) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("voices", { keyPath: "id" });
      req.result.createObjectStore("items", { keyPath: "id" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((ok, ko) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error("quota"));
  });
}

export const store = {
  all: (s) => run(s, "readonly", (o) => o.getAll()),
  get: (s, id) => run(s, "readonly", (o) => o.get(id)),
  put: (s, v) => run(s, "readwrite", (o) => o.put(v)),
  del: (s, id) => run(s, "readwrite", (o) => o.delete(id)),
};
