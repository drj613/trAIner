import { deleteDB } from "idb";
import { DB_NAME, getDb, resetDbConnection } from "./appDb";

// The connection cache's invariants are about *which* open request owns the two
// module globals, so the tests need to see each open request and its callbacks.
// The real openDB does the work; this only records what it was called with.
type OpenArgs = [string, number, { terminated?: () => void }];
const openCalls: OpenArgs[] = [];
jest.mock("idb", () => {
  const actual = jest.requireActual<typeof import("idb")>("idb");
  return {
    ...actual,
    openDB: (...args: unknown[]) => {
      openCalls.push(args as OpenArgs);
      return (actual.openDB as (...a: unknown[]) => unknown)(...args);
    },
  };
});

beforeEach(async () => {
  openCalls.length = 0;
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
  resetDbConnection();
});

// transaction() on a closed connection throws InvalidStateError synchronously,
// which is the only direct read of "is this handle still usable". An empty
// readonly transaction commits on its own; its `done` rejection is pre-handled
// so a connection closed underneath it cannot surface as an unhandled rejection.
const isOpen = (db: Awaited<ReturnType<typeof getDb>>) => {
  try {
    const tx = db.transaction("programs", "readonly");
    void tx.done.catch(() => {});
    return true;
  } catch {
    return false;
  }
};

describe("getDb connection cache", () => {
  it("gives two concurrent callers one open, not two", async () => {
    const first = getDb();
    const second = getDb();

    // Same promise, synchronously: the second caller must not be able to start
    // its own open before the first one settles.
    expect(first).toBe(second);
    const [firstDb, secondDb] = await Promise.all([first, second]);
    expect(firstDb).toBe(secondDb);
    expect(openCalls).toHaveLength(1);
  });

  it("closes an open that finished after a reset had retired it", async () => {
    // resetDbConnection() cannot close a connection that does not exist yet, so
    // the success handler is the only place this one can be dealt with. Left
    // open it belongs to nobody, and it blocks the next deleteDatabase — which
    // is precisely what resetWorkspace needs to succeed.
    const retired = getDb();
    resetDbConnection();
    const strayDb = await retired;

    try {
      const liveDb = await getDb();
      expect(openCalls).toHaveLength(2);
      expect(isOpen(strayDb)).toBe(false);
      expect(isOpen(liveDb)).toBe(true);
    } finally {
      // Belongs to the assertion above, not to the fix: while the bug is
      // present this connection really is orphaned, and leaving it open makes
      // the *next* test's deleteDatabase block forever instead of failing.
      strayDb.close();
    }
  });

  it("ignores a terminated callback from an open that is no longer installed", async () => {
    await getDb();
    const staleTerminated = openCalls[0][2].terminated!;
    resetDbConnection();
    const liveDb = await getDb();
    expect(openCalls).toHaveLength(2);

    staleTerminated();

    try {
      // No reopen, and — the part that matters — the live connection is still
      // the one the module has a handle on, so a reset can still close it.
      // Clearing dbInstance unconditionally here orphans it instead.
      expect(openCalls).toHaveLength(2);
      resetDbConnection();
      expect(isOpen(liveDb)).toBe(false);
    } finally {
      // While the bug is present this connection is orphaned, and an orphan
      // blocks the next test's deleteDatabase forever — a hang instead of a
      // failure. Closing it here keeps the mutation loud and fast.
      liveDb.close();
    }
  });

  it("reopens after the installed connection is terminated", async () => {
    const terminatedDb = await getDb();
    openCalls[0][2].terminated!();

    const reopened = await getDb();
    expect(openCalls).toHaveLength(2);
    expect(reopened).not.toBe(terminatedDb);
  });
});
