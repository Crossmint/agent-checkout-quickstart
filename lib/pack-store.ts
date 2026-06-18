// Client-side memory of the packs this browser has created.
//
// The Agentic Checkouts API has no "list packs" endpoint — you can create, get,
// update, and delete a pack by id, but you can't enumerate a project's packs.
// So this quickstart keeps the ids it created in localStorage and re-fetches
// each one with getPack on load. This is a demo convenience, not a source of
// truth: a real app would store pack ids in its own database alongside the
// merchant records they belong to.

const STORAGE_KEY = "agentic-checkout-quickstart.pack-ids";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

/** The pack ids this browser has created, newest first. */
export function getStoredPackIds(): string[] {
  return read();
}

/** Remember a newly created pack id (newest first, de-duplicated). */
export function addStoredPackId(id: string): void {
  write([id, ...read().filter((existing) => existing !== id)]);
}

/** Forget a pack id — after deleting it, or when getPack reports it's gone. */
export function removeStoredPackId(id: string): void {
  write(read().filter((existing) => existing !== id));
}
