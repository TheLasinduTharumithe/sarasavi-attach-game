export interface Book {
  id: string;
  title: string;
  author: string;
  coverColor: string;
  accentColor: string;
  coverImage?: string;
  authorImage?: string;
}

// 20 books for the Sarasavi Book Fair 2026
export const ALL_BOOKS: Book[] = [
  { id: "b1",  title: "The Kite Runner",              author: "Khaled Hosseini",       coverColor: "#c0392b", accentColor: "#e74c3c" },
  { id: "b2",  title: "To Kill a Mockingbird",        author: "Harper Lee",            coverColor: "#2980b9", accentColor: "#3498db" },
  { id: "b3",  title: "1984",                         author: "George Orwell",         coverColor: "#2c3e50", accentColor: "#34495e" },
  { id: "b4",  title: "Pride and Prejudice",          author: "Jane Austen",           coverColor: "#8e44ad", accentColor: "#9b59b6" },
  { id: "b5",  title: "The Great Gatsby",             author: "F. Scott Fitzgerald",   coverColor: "#16a085", accentColor: "#1abc9c" },
  { id: "b6",  title: "One Hundred Years of Solitude",author: "Gabriel García Márquez",coverColor: "#d35400", accentColor: "#e67e22" },
  { id: "b7",  title: "Brave New World",              author: "Aldous Huxley",         coverColor: "#27ae60", accentColor: "#2ecc71" },
  { id: "b8",  title: "The Catcher in the Rye",       author: "J.D. Salinger",         coverColor: "#c0392b", accentColor: "#e74c3c" },
  { id: "b9",  title: "Lord of the Flies",            author: "William Golding",       coverColor: "#7f8c8d", accentColor: "#95a5a6" },
  { id: "b10", title: "The Alchemist",                author: "Paulo Coelho",          coverColor: "#f39c12", accentColor: "#f1c40f" },
  { id: "b11", title: "Harry Potter",                 author: "J.K. Rowling",          coverColor: "#6c3483", accentColor: "#9b59b6" },
  { id: "b12", title: "The Hobbit",                   author: "J.R.R. Tolkien",        coverColor: "#1a5276", accentColor: "#2980b9" },
  { id: "b13", title: "Dune",                         author: "Frank Herbert",         coverColor: "#b7950b", accentColor: "#f39c12" },
  { id: "b14", title: "Animal Farm",                  author: "George Orwell",         coverColor: "#1e8449", accentColor: "#27ae60" },
  { id: "b15", title: "The Da Vinci Code",            author: "Dan Brown",             coverColor: "#1f618d", accentColor: "#2980b9" },
  { id: "b16", title: "Fahrenheit 451",               author: "Ray Bradbury",          coverColor: "#922b21", accentColor: "#c0392b" },
  { id: "b17", title: "The Road",                     author: "Cormac McCarthy",       coverColor: "#4a4a4a", accentColor: "#7f8c8d" },
  { id: "b18", title: "Life of Pi",                   author: "Yann Martel",           coverColor: "#117a65", accentColor: "#16a085" },
  { id: "b19", title: "Gone Girl",                    author: "Gillian Flynn",         coverColor: "#6e2f8a", accentColor: "#8e44ad" },
  { id: "b20", title: "The Midnight Library",         author: "Matt Haig",             coverColor: "#154360", accentColor: "#1a5276" },
];

// Deduplicate by author (b14 has same author as b3, remove it for clean matching)
// Actually we keep all 20 but select 5 with unique authors
export function pickRandomGame(count = 5, sourceBooks: Book[] = ALL_BOOKS): Book[] {
  const shuffled = [...sourceBooks].sort(() => Math.random() - 0.5);
  const selected: Book[] = [];
  const usedAuthors = new Set<string>();
  for (const book of shuffled) {
    if (!usedAuthors.has(book.author)) {
      selected.push(book);
      usedAuthors.add(book.author);
    }
    if (selected.length === count) break;
  }
  return selected;
}
