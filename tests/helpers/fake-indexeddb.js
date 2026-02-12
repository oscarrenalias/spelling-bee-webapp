function createRequest() {
  return {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    oldVersion: 0
  };
}

function emitSuccess(request) {
  queueMicrotask(() => {
    if (typeof request.onsuccess === "function") {
      request.onsuccess({ target: request });
    }
  });
}

function emitError(request, error) {
  request.error = error;
  queueMicrotask(() => {
    if (typeof request.onerror === "function") {
      request.onerror({ target: request });
    }
  });
}

function createObjectStoreNames(internalDb) {
  return {
    contains(name) {
      return internalDb.stores.has(name);
    }
  };
}

class FakeStoreTransactionView {
  constructor(internalStore, transaction) {
    this.internalStore = internalStore;
    this.transaction = transaction;
  }

  put(value) {
    const request = createRequest();
    this.transaction._registerRequest();

    queueMicrotask(() => {
      const key = value[this.internalStore.keyPath];
      if (key === undefined) {
        emitError(request, new Error(`Missing keyPath value: ${this.internalStore.keyPath}`));
        this.transaction._requestFinished();
        return;
      }

      this.internalStore.records.set(key, structuredClone(value));
      request.result = key;
      emitSuccess(request);
      this.transaction._requestFinished();
    });

    return request;
  }

  get(key) {
    const request = createRequest();
    this.transaction._registerRequest();

    queueMicrotask(() => {
      const value = this.internalStore.records.get(key);
      request.result = value === undefined ? undefined : structuredClone(value);
      emitSuccess(request);
      this.transaction._requestFinished();
    });

    return request;
  }

  getAll() {
    const request = createRequest();
    this.transaction._registerRequest();

    queueMicrotask(() => {
      request.result = [...this.internalStore.records.values()].map((value) => structuredClone(value));
      emitSuccess(request);
      this.transaction._requestFinished();
    });

    return request;
  }
}

class FakeTransaction {
  constructor(internalDb, storeName) {
    this.internalDb = internalDb;
    this.storeName = storeName;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    this.pendingRequests = 0;
    this.completed = false;
  }

  objectStore(name) {
    if (name !== this.storeName) {
      throw new Error(`Unknown object store: ${name}`);
    }

    const internalStore = this.internalDb.stores.get(name);
    if (!internalStore) {
      throw new Error(`Object store does not exist: ${name}`);
    }

    return new FakeStoreTransactionView(internalStore, this);
  }

  abort() {
    this.error = new Error("Transaction aborted");
    this.completed = true;
    if (typeof this.onabort === "function") {
      this.onabort({ target: this });
    }
  }

  _registerRequest() {
    this.pendingRequests += 1;
  }

  _requestFinished() {
    this.pendingRequests -= 1;
    if (this.pendingRequests === 0 && !this.completed) {
      this.completed = true;
      queueMicrotask(() => {
        if (typeof this.oncomplete === "function") {
          this.oncomplete({ target: this });
        }
      });
    }
  }
}

class FakeDatabaseConnection {
  constructor(internalDb) {
    this.internalDb = internalDb;
    this.name = internalDb.name;
    this.version = internalDb.version;
    this.objectStoreNames = createObjectStoreNames(internalDb);
  }

  createObjectStore(name, options = {}) {
    if (this.internalDb.stores.has(name)) {
      throw new Error(`Object store already exists: ${name}`);
    }

    const keyPath = options.keyPath ?? "id";
    const internalStore = {
      keyPath,
      records: new Map(),
      indexes: new Map()
    };
    this.internalDb.stores.set(name, internalStore);

    return {
      createIndex(indexName, keyPathValue) {
        internalStore.indexes.set(indexName, { keyPath: keyPathValue });
      }
    };
  }

  transaction(storeName, _mode) {
    return new FakeTransaction(this.internalDb, storeName);
  }

  close() {}
}

function createInternalDb(name, version) {
  return {
    name,
    version,
    stores: new Map()
  };
}

export function createFakeIndexedDb() {
  const dbs = new Map();

  return {
    open(name, version) {
      const request = createRequest();

      queueMicrotask(() => {
        let internalDb = dbs.get(name);
        const requestedVersion = version ?? (internalDb ? internalDb.version : 1);
        const oldVersion = internalDb ? internalDb.version : 0;

        if (!internalDb) {
          internalDb = createInternalDb(name, 0);
          dbs.set(name, internalDb);
        }

        if (requestedVersion < internalDb.version) {
          emitError(request, new Error("VersionError"));
          return;
        }

        if (requestedVersion > internalDb.version) {
          internalDb.version = requestedVersion;
          const upgradeConnection = new FakeDatabaseConnection(internalDb);
          request.result = upgradeConnection;
          request.oldVersion = oldVersion;

          if (typeof request.onupgradeneeded === "function") {
            request.onupgradeneeded({ target: request, oldVersion });
          }
        }

        const connection = new FakeDatabaseConnection(internalDb);
        request.result = connection;
        emitSuccess(request);
      });

      return request;
    },

    deleteDatabase(name) {
      const request = createRequest();

      queueMicrotask(() => {
        dbs.delete(name);
        emitSuccess(request);
      });

      return request;
    },

    seedDatabase(name, version, recordsByStore) {
      const internalDb = createInternalDb(name, version);

      for (const [storeName, storeSeed] of Object.entries(recordsByStore)) {
        const keyPath = storeSeed.keyPath ?? "id";
        const store = {
          keyPath,
          records: new Map(),
          indexes: new Map()
        };

        for (const record of storeSeed.records ?? []) {
          const key = record[keyPath];
          store.records.set(key, structuredClone(record));
        }

        for (const index of storeSeed.indexes ?? []) {
          store.indexes.set(index.name, { keyPath: index.keyPath });
        }

        internalDb.stores.set(storeName, store);
      }

      dbs.set(name, internalDb);
    },

    inspectDatabase(name) {
      const internalDb = dbs.get(name);
      if (!internalDb) {
        return null;
      }

      return {
        name: internalDb.name,
        version: internalDb.version,
        stores: [...internalDb.stores.keys()].sort()
      };
    }
  };
}
