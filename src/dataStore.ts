import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore/lite";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ALL_BOOKS, type Book } from "./gameData";
import {
  firebaseAuth,
  firestore,
  requireFirebaseAuth,
  requireFirestore,
} from "./firebase";

export type Difficulty = "easy" | "hard";

export interface GameSettings {
  difficulty: Difficulty;
  bookCount: number;
  eventLabel: string;
  gameTitle: string;
  instructions: string;
  winTitle: string;
  winSubtitle: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  difficulty: "easy",
  bookCount: 5,
  eventLabel: "Book Fair 2026",
  gameTitle: "Match the Author",
  instructions: "Drag each author and drop them onto the correct book.",
  winTitle: "Congratulations!",
  winSubtitle: "You Win a Voucher!",
};

const BOOKS_COLLECTION = "sarasavi_books";
const CONFIG_COLLECTION = "sarasavi_config";
const GAME_SETTINGS_DOCUMENT = "game_settings";
const ADVERTISEMENT_DOCUMENT = "advertisement";
const MAX_DOCUMENT_BYTES = 900 * 1024;

export interface AppContent {
  books: Book[];
  settings: GameSettings;
  adImage: string | null;
}

function documentSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function assertDocumentSize(value: unknown, label: string) {
  if (documentSize(value) > MAX_DOCUMENT_BYTES) {
    throw new Error(`${label} is too large for Firestore. Use smaller images and try again.`);
  }
}

function cleanBook(book: Book): Book {
  const cleaned: Book = {
    id: book.id,
    title: book.title,
    author: book.author,
    coverColor: book.coverColor,
    accentColor: book.accentColor,
  };
  if (book.coverImage) cleaned.coverImage = book.coverImage;
  if (book.authorImage) cleaned.authorImage = book.authorImage;
  return cleaned;
}

function isBook(value: unknown): value is Book {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<Book>;
  return [book.id, book.title, book.author, book.coverColor, book.accentColor]
    .every(field => typeof field === "string" && field.length > 0);
}

export async function loadAppContent(): Promise<AppContent> {
  if (!firestore) {
    return { books: ALL_BOOKS, settings: DEFAULT_SETTINGS, adImage: null };
  }

  const [bookSnapshot, settingsSnapshot, adSnapshot] = await Promise.all([
    getDocs(collection(firestore, BOOKS_COLLECTION)),
    getDoc(doc(firestore, CONFIG_COLLECTION, GAME_SETTINGS_DOCUMENT)),
    getDoc(doc(firestore, CONFIG_COLLECTION, ADVERTISEMENT_DOCUMENT)),
  ]);

  const remoteBooks = bookSnapshot.docs
    .map(snapshot => snapshot.data())
    .filter(isBook)
    .map(cleanBook);
  const settingsData = settingsSnapshot.exists()
    ? settingsSnapshot.data() as Partial<GameSettings>
    : {};
  const adData = adSnapshot.exists() ? adSnapshot.data() : {};

  return {
    books: remoteBooks.length ? remoteBooks : ALL_BOOKS,
    settings: { ...DEFAULT_SETTINGS, ...settingsData },
    adImage: typeof adData.imageBase64 === "string" && adData.imageBase64
      ? adData.imageBase64
      : null,
  };
}

function assertAuthenticated() {
  if (!firebaseAuth?.currentUser) {
    throw new Error("An authenticated Firebase administrator is required to save changes.");
  }
}

export async function saveBooksToFirestore(books: Book[]): Promise<void> {
  assertAuthenticated();
  const database = requireFirestore();
  const cleanedBooks = books.map(cleanBook);
  cleanedBooks.forEach(book => assertDocumentSize(book, `Book '${book.title}'`));

  const booksCollection = collection(database, BOOKS_COLLECTION);
  const existing = await getDocs(booksCollection);
  const nextIds = new Set(cleanedBooks.map(book => book.id));
  const batch = writeBatch(database);

  existing.docs.forEach(snapshot => {
    if (!nextIds.has(snapshot.id)) batch.delete(snapshot.ref);
  });
  cleanedBooks.forEach(book => batch.set(doc(booksCollection, book.id), book));
  await batch.commit();
}

export async function saveSettingsToFirestore(settings: GameSettings): Promise<void> {
  assertAuthenticated();
  await setDoc(doc(requireFirestore(), CONFIG_COLLECTION, GAME_SETTINGS_DOCUMENT), settings);
}

export async function saveAdImageToFirestore(imageBase64: string): Promise<void> {
  assertAuthenticated();
  const payload = { imageBase64 };
  assertDocumentSize(payload, "Advertisement image");
  await setDoc(doc(requireFirestore(), CONFIG_COLLECTION, ADVERTISEMENT_DOCUMENT), payload);
}

export async function clearAdImageFromFirestore(): Promise<void> {
  assertAuthenticated();
  await deleteDoc(doc(requireFirestore(), CONFIG_COLLECTION, ADVERTISEMENT_DOCUMENT));
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(requireFirebaseAuth(), email, password);
}

export async function signOutAdmin(): Promise<void> {
  if (firebaseAuth) await signOut(firebaseAuth);
}
