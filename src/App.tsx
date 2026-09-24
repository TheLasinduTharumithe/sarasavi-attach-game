import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import confetti from "canvas-confetti";
import { onAuthStateChanged } from "firebase/auth";
import { ALL_BOOKS, pickRandomGame, type Book } from "./gameData";
import {
  clearAdImageFromFirestore,
  DEFAULT_SETTINGS,
  loadAppContent,
  saveAdImageToFirestore,
  saveBooksToFirestore,
  saveSettingsToFirestore,
  signInAdmin,
  signOutAdmin,
  type Difficulty,
  type GameSettings,
} from "./dataStore";
import {
  firebaseAuth,
  firebaseConfigurationError,
  isFirebaseConfigured,
} from "./firebase";
import { imageFileToBase64, imageSrc, type ImageKind } from "./imageUtils";
import sarasaviLogo from "./assets/attachment2.png";
import sarasaviEmailLogo from "./imports/sarasavi_email_logo.jpg";

type MatchState = "idle" | "correct" | "incorrect";
type Screen = "setup" | "game";

interface BookState {
  book: Book;
  matchedAuthorId: string | null;
  state: MatchState;
}


function uniqueAuthorCount(books: Book[]) {
  return new Set(books.map(book => book.author.trim()).filter(Boolean)).size;
}

function clampBookCount(count: number, books: Book[]) {
  const max = Math.max(1, uniqueAuthorCount(books));
  return Math.min(Math.max(1, count), max);
}

function makeBookId() {
  return `book-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type GameSound = "tap" | "correct" | "wrong" | "win";

let audioContext: AudioContext | null = null;

function getAudioContext() {
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ??= new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function playTone(context: AudioContext, frequency: number, start: number, duration: number, volume = 0.08, type: OscillatorType = "sine") {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playGameSound(sound: GameSound) {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;

  if (sound === "tap") {
    playTone(context, 520, now, 0.07, 0.045, "triangle");
    playTone(context, 760, now + 0.035, 0.06, 0.035, "triangle");
    return;
  }

  if (sound === "correct") {
    playTone(context, 660, now, 0.11, 0.06, "sine");
    playTone(context, 880, now + 0.08, 0.13, 0.055, "sine");
    return;
  }

  if (sound === "win") {
    [523, 659, 784, 1046].forEach((frequency, index) => {
      playTone(context, frequency, now + index * 0.11, 0.18, 0.075, "sine");
    });
    return;
  }

  playTone(context, 220, now, 0.18, 0.075, "sawtooth");
  playTone(context, 165, now + 0.13, 0.24, 0.06, "sawtooth");
}

function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enter = useCallback(() => {
    ref.current?.requestFullscreen().catch(() => {});
  }, [ref]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    isFullscreen ? exit() : enter();
  }, [isFullscreen, enter, exit]);

  return { isFullscreen, toggle };
}

function IconButton({
  title,
  onClick,
  children,
  className = "",
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700 ${className}`}
    >
      {children}
    </button>
  );
}

function UploadButton({
  label,
  onUpload,
  compact = false,
  imageKind = "bookCover",
}: {
  label: string;
  onUpload: (data: string) => void | Promise<void>;
  compact?: boolean;
  imageKind?: ImageKind;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsConverting(true);
    setUploadError("");
    try {
      const base64 = await imageFileToBase64(file, imageKind);
      await onUpload(base64);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image conversion failed.");
    } finally {
      setIsConverting(false);
      event.target.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={isConverting}
        onClick={() => inputRef.current?.click()}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60",
          compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
        ].join(" ")}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {isConverting ? "Optimizing…" : label}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFile} />
      {uploadError && <span className="max-w-48 text-xs font-semibold text-red-600">{uploadError}</span>}
    </>
  );
}

function BookCover({ book, hideAuthor }: { book: Book; hideAuthor?: boolean }) {
  const coverSource = imageSrc(book.coverImage);
  if (coverSource) {
    return (
      <img
        src={coverSource}
        alt={`${book.title} cover`}
        className="h-[120px] w-[84px] flex-shrink-0 rounded object-cover shadow-md"
      />
    );
  }

  return (
    <svg width={84} height={120} viewBox="0 0 84 120" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 rounded shadow-md">
      <rect width="84" height="120" rx="4" fill={book.coverColor} />
      <rect x="6" y="6" width="72" height="108" rx="2" fill="none" stroke={book.accentColor} strokeWidth="1.5" opacity="0.5" />
      <rect x="0" y="0" width="10" height="120" rx="2" fill={book.accentColor} opacity="0.6" />
      <text x="46" y="48" textAnchor="middle" fontSize="7" fill="white" fontFamily="sans-serif" fontWeight="bold">
        {book.title.split(" ").slice(0, 3).map((word, index) => (
          <tspan key={index} x="46" dy={index === 0 ? 0 : 10}>{word}</tspan>
        ))}
      </text>
      {!hideAuthor && (
        <>
          <rect x="16" y="80" width="52" height="1" fill="white" opacity="0.4" />
          <text x="46" y="100" textAnchor="middle" fontSize="5.5" fill="white" opacity="0.9" fontFamily="sans-serif">
            {book.author.split(" ")[0]}
          </text>
          <text x="46" y="108" textAnchor="middle" fontSize="5.5" fill="white" opacity="0.9" fontFamily="sans-serif">
            {book.author.split(" ").slice(1).join(" ")}
          </text>
        </>
      )}
    </svg>
  );
}

function AuthorAvatar({ book }: { book: Book }) {
  const authorSource = imageSrc(book.authorImage);
  if (authorSource) {
    return (
      <img
        src={authorSource}
        alt={book.author}
        className="h-12 w-12 flex-shrink-0 rounded-full object-cover shadow"
      />
    );
  }

  const initials = book.author.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#1e5fa8", "#c0392b", "#16a085", "#8e44ad", "#d35400", "#27ae60"];
  const color = colors[book.author.charCodeAt(0) % colors.length] ?? "#1e5fa8";
  return (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow" style={{ background: color }}>
      {initials}
    </div>
  );
}

function DraggableAuthor({
  book,
  disabled,
  isMobileSelected,
  frozen,
  onTap,
}: {
  book: Book;
  disabled: boolean;
  isMobileSelected: boolean;
  frozen: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: book.id,
    disabled: disabled || frozen,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
    transition: isDragging ? "none" : "transform 0.15s ease",
  };

  return (
    <div
      ref={setNodeRef}
      style={style as React.CSSProperties}
      {...listeners}
      {...attributes}
      onClick={disabled || frozen ? undefined : onTap}
      className={[
        "flex select-none items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 shadow-sm transition-all duration-150",
        disabled ? "cursor-not-allowed opacity-50 grayscale"
          : frozen ? "cursor-not-allowed opacity-40"
          : "cursor-grab hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
        isMobileSelected ? "border-blue-500 shadow-md shadow-blue-200 ring-2 ring-blue-300" : "border-gray-200",
      ].join(" ")}
    >
      <AuthorAvatar book={book} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-gray-800">{book.author}</p>
        <p className="mt-0.5 text-xs text-gray-400">{frozen ? "Game paused" : "Drag to match"}</p>
      </div>
      {disabled ? (
        <svg className="h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        !frozen && (
          <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 100 4 2 2 0 000-4zM7 8a2 2 0 100 4 2 2 0 000-4zM7 14a2 2 0 100 4 2 2 0 000-4zM13 2a2 2 0 100 4 2 2 0 000-4zM13 8a2 2 0 100 4 2 2 0 000-4zM13 14a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
        )
      )}
    </div>
  );
}

function DragCard({ book }: { book: Book }) {
  return (
    <div className="flex scale-105 cursor-grabbing items-center gap-3 rounded-xl border-2 border-blue-400 bg-white px-4 py-3 shadow-xl ring-2 ring-blue-200">
      <AuthorAvatar book={book} />
      <p className="text-sm font-semibold text-gray-800">{book.author}</p>
    </div>
  );
}

function DroppableBook({
  bookState,
  isHighlighted,
  isMobileSelected,
  frozen,
  hideAuthor,
  onTap,
}: {
  bookState: BookState;
  isHighlighted: boolean;
  isMobileSelected: boolean;
  frozen: boolean;
  hideAuthor: boolean;
  onTap: () => void;
}) {
  const { book, matchedAuthorId, state } = bookState;
  const matched = matchedAuthorId !== null;
  const { setNodeRef, isOver } = useDroppable({ id: book.id, disabled: matched || frozen });

  const borderClass =
    state === "correct" ? "border-green-500 bg-green-50"
      : state === "incorrect" ? "shake border-red-500 bg-red-50"
        : isOver || (isHighlighted && !matched) ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
          : isMobileSelected ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
            : "border-gray-200 bg-white";

  return (
    <div
      ref={setNodeRef}
      onClick={matched || frozen ? undefined : onTap}
      className={[
        "flex flex-col items-center gap-2 rounded-xl border-2 p-3 shadow-sm transition-all duration-200",
        borderClass,
        !matched && !frozen ? "cursor-pointer" : "",
      ].join(" ")}
    >
      <BookCover book={book} hideAuthor={hideAuthor} />
      <p className="line-clamp-2 w-full text-center text-xs font-semibold leading-tight text-gray-700">{book.title}</p>
      {state === "correct" ? (
        <div className="correct-pulse flex flex-col items-center gap-1">
          <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs font-semibold text-green-700">Correct Match</span>
          <span className="text-xs text-green-600">{book.author}</span>
        </div>
      ) : state === "incorrect" ? (
        <div className="flex flex-col items-center gap-1">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-center text-xs font-semibold text-red-700">Wrong Answer</span>
        </div>
      ) : (
        <div className={[
          "mt-1 flex w-full items-center justify-center rounded-lg border border-dashed px-2 py-1",
          isHighlighted || isOver ? "border-blue-400 bg-blue-100" : "border-gray-300 bg-gray-50",
        ].join(" ")}>
          <span className="text-xs text-gray-400">Drop Author Here</span>
        </div>
      )}
    </div>
  );
}

function WrongOverlay({ onNewGame }: { onNewGame: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="win-scale mx-4 flex max-w-xs flex-col items-center gap-5 rounded-3xl border-4 border-red-400 bg-white p-8 text-center shadow-2xl">
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <img src={sarasaviEmailLogo} alt="Sarasavi Bookshop" className="h-16 w-auto object-contain" />
        </div>
        <h2 className="text-2xl font-black text-gray-900">Your answer is wrong.</h2>
        <p className="text-base text-gray-600">Please try again.</p>
        <button
          type="button"
          onClick={onNewGame}
          className="mt-2 rounded-full px-8 py-3 text-base font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-95"
          style={{ background: "#1e5fa8" }}
        >
          Start New Game
        </button>
      </div>
    </div>
  );
}

function WinOverlay({
  title,
  subtitle,
  showNewGame,
  onNewGame,
}: {
  title: string;
  subtitle: string;
  showNewGame: boolean;
  onNewGame: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="win-scale mx-4 flex max-w-sm flex-col items-center gap-6 rounded-3xl bg-white p-10 text-center shadow-2xl">
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
          <img src={sarasaviEmailLogo} alt="Sarasavi Bookshop" className="h-20 w-auto object-contain" />
        </div>
        <h2 className="text-4xl font-black leading-tight text-gray-900">{title}</h2>
        <p className="text-2xl font-bold text-blue-700">{subtitle}</p>
        {showNewGame && (
          <button
            type="button"
            onClick={onNewGame}
            className="rounded-full bg-blue-700 px-8 py-3 text-base font-black text-white shadow-lg transition-all hover:bg-blue-800 active:scale-95"
          >
            New Game
          </button>
        )}
      </div>
    </div>
  );
}

function KioskAdOverlay({ imageUrl, onClose }: { imageUrl: string; onClose: () => void }) {
  const source = imageSrc(imageUrl);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <img src={source} alt="Advertisement" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-black/80"
        title="Close ad"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function AdsBanner({
  adImage,
  onShowKiosk,
}: {
  adImage: string | null;
  onShowKiosk: () => void;
}) {
  if (!adImage) return null;
  const source = imageSrc(adImage);
  if (!source) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8">
      <div className="overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-100 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-widest text-gray-400">Advertisement</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onShowKiosk}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white transition-all hover:bg-blue-800"
              title="Show ad fullscreen"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
              Kiosk View
            </button>
          </div>
        </div>

        <button type="button" onClick={onShowKiosk} className="group relative block max-h-[260px] w-full overflow-hidden text-left" title="Click to view fullscreen">
          <img src={source} alt="Advertisement" className="block max-h-[260px] w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">Click for Kiosk View</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function SetupScreen({
  settings,
  books,
  onStart,
}: {
  settings: GameSettings;
  books: Book[];
  onStart: (settings: GameSettings) => void;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="bg-blue-800 shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <div className="rounded-xl bg-white px-3 py-2 shadow">
            <img src={sarasaviLogo} alt="Sarasavi Bookshop" className="h-10 w-auto object-contain" />
          </div>
          <div className="text-white">
            <p className="text-sm font-medium uppercase tracking-widest opacity-80">{settings.eventLabel}</p>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{settings.gameTitle}</h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
          <button
            type="button"
            onClick={() => onStart({ ...settings, bookCount: clampBookCount(settings.bookCount, books) })}
            className="w-full rounded-2xl bg-blue-700 py-4 text-lg font-black text-white shadow-lg transition-all hover:bg-blue-800 active:scale-95"
          >
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
}

function GameScreen({
  settings,
  books: sourceBooks,
  onNewGame,
  adImage,
}: {
  settings: GameSettings;
  books: Book[];
  onNewGame: () => void;
  adImage: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef);
  const [showKioskAd, setShowKioskAd] = useState(false);

  const initBooks = useCallback(
    () => pickRandomGame(clampBookCount(settings.bookCount, sourceBooks), sourceBooks).map(book => ({ book, matchedAuthorId: null, state: "idle" as MatchState })),
    [settings.bookCount, sourceBooks]
  );

  const [books, setBooks] = useState<BookState[]>(initBooks);
  const [shuffledAuthors, setShuffledAuthors] = useState<Book[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [mobileSelectedId, setMobileSelectedId] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [hasWon, setHasWon] = useState(false);
  const [showWinNewGame, setShowWinNewGame] = useState(false);
  const [showWrongOverlay, setShowWrongOverlay] = useState(false);
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    const authors = books.map(bookState => bookState.book);
    setShuffledAuthors([...authors].sort(() => Math.random() - 0.5));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
  );

  const startFreshGame = () => {
    const fresh = initBooks();
    setBooks(fresh);
    setShuffledAuthors([...fresh.map(bookState => bookState.book)].sort(() => Math.random() - 0.5));
    setCorrectCount(0);
    setHasWon(false);
    setShowWinNewGame(false);
    setShowWrongOverlay(false);
    setFrozen(false);
    setMobileSelectedId(null);
  };

  useEffect(() => {
    if (!hasWon) {
      setShowWinNewGame(false);
      return;
    }

    const timer = window.setTimeout(() => setShowWinNewGame(true), 10000);
    return () => window.clearTimeout(timer);
  }, [hasWon]);

  const tryMatch = useCallback((authorBookId: string, dropBookId: string) => {
    if (frozen) return;
    const isCorrect = authorBookId === dropBookId;
    if (isCorrect) {
      playGameSound("correct");
      setBooks(previous => previous.map(bookState =>
        bookState.book.id === dropBookId ? { ...bookState, matchedAuthorId: authorBookId, state: "correct" } : bookState
      ));
      setCorrectCount(previous => {
        const next = previous + 1;
        if (next === books.length) {
          setTimeout(() => {
            playGameSound("win");
            setHasWon(true);
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
            setTimeout(() => confetti({ particleCount: 100, spread: 80, origin: { y: 0.3 } }), 400);
          }, 300);
        }
        return next;
      });
    } else {
      setBooks(previous => previous.map(bookState =>
        bookState.book.id === dropBookId ? { ...bookState, state: "incorrect" } : bookState
      ));
      playGameSound("wrong");
      setFrozen(true);
      setTimeout(() => setShowWrongOverlay(true), 600);
    }
  }, [books.length, frozen]);

  const handleDragStart = (event: DragStartEvent) => {
    if (frozen) return;
    playGameSound("tap");
    setActiveDragId(event.active.id as string);
    setMobileSelectedId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    tryMatch(active.id as string, over.id as string);
  };

  const handleAuthorTap = (bookId: string) => {
    if (frozen) return;
    playGameSound("tap");
    setMobileSelectedId(previous => previous === bookId ? null : bookId);
  };

  const handleBookTap = (dropBookId: string) => {
    if (!mobileSelectedId || frozen) return;
    const target = books.find(bookState => bookState.book.id === dropBookId);
    if (!target || target.matchedAuthorId !== null) return;
    tryMatch(mobileSelectedId, dropBookId);
    setMobileSelectedId(null);
  };

  const isDragging = activeDragId !== null;
  const draggedBook = books.find(bookState => bookState.book.id === activeDragId)?.book;
  const availableAuthors = shuffledAuthors.filter(
    book => !books.find(bookState => bookState.book.id === book.id && bookState.matchedAuthorId !== null)
  );
  const matchedAuthors = shuffledAuthors.filter(
    book => books.find(bookState => bookState.book.id === book.id && bookState.matchedAuthorId !== null)
  );
  const hideAuthor = settings.difficulty === "hard";
  const gridCols = books.length <= 4 ? "grid-cols-2" : books.length <= 6 ? "grid-cols-3" : "grid-cols-4";

  return (
    <div ref={rootRef} className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex-shrink-0 bg-blue-800 shadow-lg">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-4 sm:flex-row">
          <div className="rounded-xl bg-white px-3 py-2 shadow">
            <img src={sarasaviLogo} alt="Sarasavi Bookshop" className="h-10 w-auto object-contain" />
          </div>
          <div className="text-center text-white sm:text-left">
            <p className="text-sm font-medium uppercase tracking-widest opacity-80">{settings.eventLabel}</p>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">{settings.gameTitle}</h1>
            <p className="mt-0.5 text-sm opacity-70">{settings.instructions}</p>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
            <div className="rounded-xl bg-white/20 px-4 py-2 text-center text-white">
              <p className="text-xs uppercase tracking-wide opacity-80">Correct</p>
              <p className="text-2xl font-black">{correctCount}<span className="text-base font-semibold opacity-60">/{books.length}</span></p>
            </div>
            <IconButton title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={toggleFullscreen} className="border-white/10 bg-white/20 text-white hover:bg-white/30 hover:text-white">
              {isFullscreen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </IconButton>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row">
            <section className="flex-shrink-0 lg:w-72">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
                <div className="border-b border-gray-100 bg-blue-800 px-4 py-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">Authors</h2>
                  <p className="mt-0.5 text-xs text-white/70">
                    {frozen ? "Game paused" : mobileSelectedId ? "Now tap a book to place" : "Drag or tap to select"}
                  </p>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {availableAuthors.map(book => (
                    <DraggableAuthor key={book.id} book={book} disabled={false} frozen={frozen} isMobileSelected={mobileSelectedId === book.id} onTap={() => handleAuthorTap(book.id)} />
                  ))}
                  {matchedAuthors.map(book => (
                    <DraggableAuthor key={book.id} book={book} disabled frozen={false} isMobileSelected={false} onTap={() => {}} />
                  ))}
                </div>
              </div>
            </section>

            <section className="flex-1">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
                <div className="border-b border-gray-100 bg-blue-800 px-4 py-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-white">Books</h2>
                  <p className="mt-0.5 text-xs text-white/70">Drop the matching author onto each book</p>
                </div>
                <div className={`grid ${gridCols} gap-4 p-4 sm:grid-cols-3`}>
                  {books.map(bookState => (
                    <DroppableBook
                      key={bookState.book.id}
                      bookState={bookState}
                      isHighlighted={isDragging && bookState.matchedAuthorId === null}
                      isMobileSelected={mobileSelectedId !== null && bookState.matchedAuthorId === null}
                      frozen={frozen}
                      hideAuthor={hideAuthor}
                      onTap={() => handleBookTap(bookState.book.id)}
                    />
                  ))}
                </div>
              </div>
            </section>
          </main>

          <DragOverlay>
            {activeDragId && draggedBook ? <DragCard book={draggedBook} /> : null}
          </DragOverlay>
        </DndContext>

        <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-3 px-4 pb-4">
          <button
            type="button"
            onClick={startFreshGame}
            className="rounded-full bg-blue-700 px-6 py-2 text-sm font-semibold text-white shadow transition-all hover:bg-blue-800 active:scale-95"
          >
            New Game
          </button>
        </div>

        <AdsBanner adImage={adImage} onShowKiosk={() => setShowKioskAd(true)} />
      </div>

      {showWrongOverlay && <WrongOverlay onNewGame={startFreshGame} />}
      {hasWon && <WinOverlay title={settings.winTitle} subtitle={settings.winSubtitle} showNewGame={showWinNewGame} onNewGame={startFreshGame} />}
      {showKioskAd && adImage && <KioskAdOverlay imageUrl={adImage} onClose={() => setShowKioskAd(false)} />}
    </div>
  );
}

function AdminLogin({
  onLogin,
  onBack,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await onLogin(email.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Firebase login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="bg-blue-800 shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <div className="rounded-xl bg-white px-3 py-2 shadow">
            <img src={sarasaviLogo} alt="Sarasavi Bookshop" className="h-10 w-auto object-contain" />
          </div>
          <div className="text-white">
            <p className="text-sm font-medium uppercase tracking-widest opacity-80">Admin Login</p>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">Content Control</h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <form onSubmit={submitLogin} className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
          <h2 className="mb-1 text-2xl font-black text-gray-900">Admin Login</h2>
          <p className="mb-6 text-sm text-gray-500">Enter the admin credentials to change books and uploads.</p>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
              autoComplete="username"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
              autoComplete="current-password"
            />
          </label>

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          {!isFirebaseConfigured && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
              {firebaseConfigurationError}
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onBack} className="h-12 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
              Back
            </button>
            <button type="submit" disabled={isSubmitting || !isFirebaseConfigured} className="h-12 flex-1 rounded-xl bg-blue-700 text-sm font-black text-white shadow transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? "Signing in…" : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminPanel({
  books,
  settings,
  adImage,
  onSaveBooks,
  onSaveSettings,
  onAdUpload,
  onAdClear,
  onBack,
  onLogout,
}: {
  books: Book[];
  settings: GameSettings;
  adImage: string | null;
  onSaveBooks: (books: Book[]) => Promise<void>;
  onSaveSettings: (settings: GameSettings) => Promise<void>;
  onAdUpload: (data: string) => Promise<void>;
  onAdClear: () => Promise<void>;
  onBack: () => void;
  onLogout: () => Promise<void>;
}) {
  const [draftBooks, setDraftBooks] = useState<Book[]>(books);
  const [draftSettings, setDraftSettings] = useState<GameSettings>(settings);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const maxCount = Math.max(1, uniqueAuthorCount(draftBooks));

  const updateBook = (id: string, changes: Partial<Book>) => {
    setDraftBooks(previous => previous.map(book => book.id === id ? { ...book, ...changes } : book));
  };

  const saveAll = async () => {
    const cleanedBooks = draftBooks
      .map(book => ({ ...book, title: book.title.trim(), author: book.author.trim() }))
      .filter(book => book.title && book.author);
    const savedBooks = cleanedBooks.length ? cleanedBooks : ALL_BOOKS;
    const cleanedSettings = {
      ...draftSettings,
      bookCount: clampBookCount(draftSettings.bookCount, savedBooks),
    };
    setIsSaving(true);
    setStatus("");
    try {
      await Promise.all([
        onSaveBooks(savedBooks),
        onSaveSettings(cleanedSettings),
      ]);
      setDraftBooks(savedBooks);
      setDraftSettings(cleanedSettings);
      setStatus("Saved to Firebase");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Firebase save failed.");
    } finally {
      setIsSaving(false);
    }
  };

  const addBook = () => {
    setDraftBooks(previous => [
      {
        id: makeBookId(),
        title: "New Book",
        author: "New Author",
        coverColor: "#1e5fa8",
        accentColor: "#60a5fa",
      },
      ...previous,
    ]);
  };

  const clearAdvertisement = async () => {
    try {
      await onAdClear();
      setStatus("Advertisement removed");
      window.setTimeout(() => setStatus(""), 2000);
    } catch (clearError) {
      setStatus(clearError instanceof Error ? clearError.message : "Unable to remove the advertisement.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-blue-900/20 bg-blue-800 shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
          <div className="rounded-xl bg-white px-3 py-2 shadow">
            <img src={sarasaviLogo} alt="Sarasavi Bookshop" className="h-9 w-auto object-contain" />
          </div>
          <div className="text-white">
            <p className="text-xs font-medium uppercase tracking-widest opacity-75">Admin Panel</p>
            <h1 className="text-2xl font-black leading-tight">Content and Game Controls</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {status && <span className={`max-w-sm rounded-full px-3 py-1 text-xs font-bold ${status === "Saved to Firebase" || status === "Advertisement removed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{status}</span>}
            <button type="button" disabled={isSaving} onClick={saveAll} className="h-10 rounded-lg bg-white px-4 text-sm font-black text-blue-800 shadow transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onBack} className="h-10 rounded-lg bg-white/15 px-4 text-sm font-bold text-white transition hover:bg-white/25">
              Back
            </button>
            <button type="button" onClick={() => void onLogout().catch(logoutError => setStatus(logoutError instanceof Error ? logoutError.message : "Logout failed."))} className="h-10 rounded-lg bg-red-500/80 px-4 text-sm font-bold text-white transition hover:bg-red-500">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-gray-900">Game Settings</h2>
                <p className="text-sm text-gray-500">Defaults used on the setup screen.</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Event Label</span>
                <input value={draftSettings.eventLabel} onChange={event => setDraftSettings({ ...draftSettings, eventLabel: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Game Title</span>
                <input value={draftSettings.gameTitle} onChange={event => setDraftSettings({ ...draftSettings, gameTitle: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Instructions</span>
                <textarea value={draftSettings.instructions} onChange={event => setDraftSettings({ ...draftSettings, instructions: event.target.value })} rows={3} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-gray-500">Default Difficulty</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["easy", "hard"] as Difficulty[]).map(option => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => setDraftSettings({ ...draftSettings, difficulty: option })}
                      className={[
                        "h-10 rounded-lg border text-sm font-bold capitalize transition",
                        draftSettings.difficulty === option ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 text-gray-600 hover:border-blue-300",
                      ].join(" ")}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Default Book Count</span>
                <input
                  type="number"
                  min={1}
                  max={maxCount}
                  value={draftSettings.bookCount}
                  onChange={event => setDraftSettings({ ...draftSettings, bookCount: Number(event.target.value) })}
                  className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
                />
                <span className="mt-1 block text-xs text-gray-400">Available unique authors: {maxCount}</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Win Title</span>
                <input value={draftSettings.winTitle} onChange={event => setDraftSettings({ ...draftSettings, winTitle: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Win Subtitle</span>
                <input value={draftSettings.winSubtitle} onChange={event => setDraftSettings({ ...draftSettings, winSubtitle: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-gray-900">Advertisement Image</h2>
            <p className="mt-1 text-sm text-gray-500">This image appears below the game and can open fullscreen.</p>
            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              {adImage ? (
                <img src={imageSrc(adImage)} alt="Advertisement preview" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm font-semibold text-gray-400">No image uploaded</div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <UploadButton label={adImage ? "Change Ad" : "Upload Ad"} onUpload={onAdUpload} imageKind="advertisement" compact />
              {adImage && (
                <button type="button" onClick={() => void clearAdvertisement()} className="h-9 rounded-lg px-3 text-xs font-semibold text-red-500 transition hover:bg-red-50">
                  Remove
                </button>
              )}
            </div>
          </section>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-gray-900">Books and Authors</h2>
              <p className="text-sm text-gray-500">Upload a cover and author image for each match pair.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addBook} className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white shadow transition hover:bg-blue-800">
                Add Book
              </button>
              <button type="button" onClick={() => setDraftBooks(ALL_BOOKS)} className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-bold text-gray-700 transition hover:bg-gray-50">
                Reset Defaults
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-5 xl:grid-cols-2">
            {draftBooks.map(book => (
              <article key={book.id} className="rounded-xl border border-gray-200 p-4">
                <div className="mb-4 flex items-start gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <BookCover book={book} />
                    <UploadButton compact label={book.coverImage ? "Change Cover" : "Cover"} imageKind="bookCover" onUpload={data => updateBook(book.id, { coverImage: data })} />
                    {book.coverImage && (
                      <button type="button" onClick={() => updateBook(book.id, { coverImage: undefined })} className="text-xs font-semibold text-red-500 hover:text-red-700">
                        Remove cover
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Book Title</span>
                      <input value={book.title} onChange={event => updateBook(book.id, { title: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Author</span>
                      <input value={book.author} onChange={event => updateBook(book.id, { author: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Cover</span>
                        <input type="color" value={book.coverColor} onChange={event => updateBook(book.id, { coverColor: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 bg-white p-1" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500">Accent</span>
                        <input type="color" value={book.accentColor} onChange={event => updateBook(book.id, { accentColor: event.target.value })} className="h-10 w-full rounded-lg border border-gray-200 bg-white p-1" />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                  <AuthorAvatar book={book} />
                  <UploadButton compact label={book.authorImage ? "Change Author Image" : "Author Image"} imageKind="authorAvatar" onUpload={data => updateBook(book.id, { authorImage: data })} />
                  {book.authorImage && (
                    <button type="button" onClick={() => updateBook(book.id, { authorImage: undefined })} className="text-xs font-semibold text-red-500 hover:text-red-700">
                      Remove image
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDraftBooks(previous => previous.filter(item => item.id !== book.id))}
                    className="ml-auto h-9 rounded-lg px-3 text-xs font-semibold text-red-500 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [path, setPath] = useState(() => window.location.pathname);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [contentError, setContentError] = useState("");
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [books, setBooks] = useState<Book[]>(ALL_BOOKS);
  const [adImage, setAdImage] = useState<string | null>(null);
  const [roundSettings, setRoundSettings] = useState<GameSettings | null>(null);
  const [contentVersion, setContentVersion] = useState(0);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    loadAppContent()
      .then(content => {
        if (!active) return;
        setBooks(content.books);
        setSettings(content.settings);
        setAdImage(content.adImage);
        setContentError("");
      })
      .catch(error => {
        if (active) setContentError(error instanceof Error ? error.message : "Unable to load Firebase content.");
      })
      .finally(() => {
        if (active) setIsContentLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!firebaseAuth) {
      setIsAuthLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, user => {
      setIsAdminAuthenticated(!!user);
      setIsAuthLoading(false);
    });
  }, []);

  const handleSaveSettings = async (nextSettings: GameSettings) => {
    await saveSettingsToFirestore(nextSettings);
    setSettings(nextSettings);
  };

  const handleSaveBooks = async (nextBooks: Book[]) => {
    await saveBooksToFirestore(nextBooks);
    setBooks(nextBooks);
    setContentVersion(previous => previous + 1);
  };

  const handleAdUpload = async (data: string) => {
    await saveAdImageToFirestore(data);
    setAdImage(data);
  };

  const handleAdClear = async () => {
    await clearAdImageFromFirestore();
    setAdImage(null);
  };

  const goHome = () => {
    window.history.pushState(null, "", "/");
    setPath("/");
  };

  if (isContentLoading || (path === "/admin" && isAuthLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-lg">
          <p className="font-bold text-blue-800">Loading Firebase content…</p>
        </div>
      </div>
    );
  }

  if (contentError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-black text-red-700">Firebase connection failed</h1>
          <p className="mt-3 text-sm text-gray-600">{contentError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-blue-700 px-5 py-2 text-sm font-bold text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (path === "/admin" && !isAdminAuthenticated) {
    return (
      <AdminLogin
        onLogin={signInAdmin}
        onBack={goHome}
      />
    );
  }

  if (path === "/admin") {
    return (
      <AdminPanel
        books={books}
        settings={settings}
        adImage={adImage}
        onSaveBooks={handleSaveBooks}
        onSaveSettings={handleSaveSettings}
        onAdUpload={handleAdUpload}
        onAdClear={handleAdClear}
        onBack={goHome}
        onLogout={async () => {
          await signOutAdmin();
          goHome();
        }}
      />
    );
  }

  if (screen === "game" && roundSettings) {
    return (
      <GameScreen
        key={`${roundSettings.difficulty}-${roundSettings.bookCount}-${contentVersion}`}
        settings={roundSettings}
        books={books}
        onNewGame={() => {
          setRoundSettings(null);
          setScreen("setup");
        }}
        adImage={adImage}
      />
    );
  }

  return (
    <SetupScreen
      settings={settings}
      books={books}
      onStart={nextSettings => {
        const clamped = { ...nextSettings, bookCount: clampBookCount(nextSettings.bookCount, books) };
        setRoundSettings(clamped);
        setScreen("game");
      }}
    />
  );
}
