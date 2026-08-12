import { requestPersistence, getPersistenceState, resetPersistenceForTests } from "./persistence";

describe("requestPersistence", () => {
  const originalStorage = navigator.storage;

  beforeEach(() => { resetPersistenceForTests(); });

  afterEach(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: originalStorage,
    });
  });

  function mockStorage(overrides: Partial<StorageManager>) {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: overrides,
    });
  }

  it("returns 'persisted' when the browser grants the request", async () => {
    mockStorage({ persist: jest.fn().mockResolvedValue(true) });
    await expect(requestPersistence()).resolves.toBe("persisted");
  });

  it("returns 'denied' when the browser refuses", async () => {
    mockStorage({ persist: jest.fn().mockResolvedValue(false) });
    await expect(requestPersistence()).resolves.toBe("denied");
  });

  it("returns 'unsupported' when the API is missing", async () => {
    mockStorage({});
    await expect(requestPersistence()).resolves.toBe("unsupported");
  });

  it("returns 'unsupported' when persist() throws", async () => {
    mockStorage({ persist: jest.fn().mockRejectedValue(new Error("nope")) });
    await expect(requestPersistence()).resolves.toBe("unsupported");
  });

  it("re-asks the browser after a denial (denials are not cached)", async () => {
    const persist = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockStorage({ persist });
    await expect(requestPersistence()).resolves.toBe("denied");
    await expect(requestPersistence()).resolves.toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("caches a grant (persist() not called again)", async () => {
    const persist = jest.fn().mockResolvedValue(true);
    mockStorage({ persist });
    await requestPersistence();
    await requestPersistence();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("getPersistenceState", () => {
  beforeEach(() => { resetPersistenceForTests(); });

  it("reports persisted() without re-requesting", async () => {
    const persisted = jest.fn().mockResolvedValue(true);
    const persist = jest.fn();
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persisted, persist },
    });
    await expect(getPersistenceState()).resolves.toBe("persisted");
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("awaits an in-flight requestPersistence() instead of racing it", async () => {
    let resolvePersist!: (v: boolean) => void;
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persist: jest.fn().mockReturnValue(new Promise<boolean>((r) => { resolvePersist = r; })),
        persisted: jest.fn().mockResolvedValue(false), // would wrongly say "denied"
      },
    });
    const request = requestPersistence(); // startup fires this
    const state = getPersistenceState();  // Settings mounts mid-request
    resolvePersist(true);
    await expect(state).resolves.toBe("persisted");
    await expect(request).resolves.toBe("persisted");
  });
});
