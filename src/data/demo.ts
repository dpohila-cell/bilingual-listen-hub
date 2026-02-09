import type { Book, Chapter, Sentence, UserProgress } from '@/types';

export const demoBooks: Book[] = [
  {
    id: '1',
    title: 'The Little Prince',
    author: 'Antoine de Saint-Exupéry',
    originalLanguage: 'en',
    fileFormat: 'epub',
    chapterCount: 4,
    sentenceCount: 48,
    createdAt: '2024-12-01',
  },
  {
    id: '2',
    title: 'Anna Karenina',
    author: 'Leo Tolstoy',
    originalLanguage: 'ru',
    fileFormat: 'epub',
    chapterCount: 8,
    sentenceCount: 120,
    createdAt: '2024-12-15',
  },
  {
    id: '3',
    title: 'Pippi Longstocking',
    author: 'Astrid Lindgren',
    originalLanguage: 'sv',
    fileFormat: 'pdf',
    chapterCount: 6,
    sentenceCount: 85,
    createdAt: '2025-01-10',
  },
];

export const demoChapters: Chapter[] = [
  { id: 'ch1', bookId: '1', chapterNumber: 1, chapterTitle: 'The Drawing' },
  { id: 'ch2', bookId: '1', chapterNumber: 2, chapterTitle: 'The Little Prince Appears' },
  { id: 'ch3', bookId: '1', chapterNumber: 3, chapterTitle: 'The Asteroid' },
  { id: 'ch4', bookId: '1', chapterNumber: 4, chapterTitle: 'The Rose' },
];

export const demoSentences: Sentence[] = [
  {
    id: 's1',
    chapterId: 'ch1',
    sentenceOrder: 1,
    originalText: 'Once when I was six years old I saw a magnificent picture in a book about the primeval forest.',
    ruTranslation: 'Когда мне было шесть лет, я увидел однажды удивительную картинку в книге о первобытном лесе.',
    enTranslation: 'Once when I was six years old I saw a magnificent picture in a book about the primeval forest.',
    svTranslation: 'En gång när jag var sex år gammal såg jag en underbar bild i en bok om urskogen.',
  },
  {
    id: 's2',
    chapterId: 'ch1',
    sentenceOrder: 2,
    originalText: 'It was a picture of a boa constrictor in the act of swallowing an animal.',
    ruTranslation: 'На картинке был нарисован удав, который глотал хищного зверя.',
    enTranslation: 'It was a picture of a boa constrictor in the act of swallowing an animal.',
    svTranslation: 'Det var en bild av en boaorm som höll på att svälja ett djur.',
  },
  {
    id: 's3',
    chapterId: 'ch1',
    sentenceOrder: 3,
    originalText: 'In the book it said: "Boa constrictors swallow their prey whole, without chewing it."',
    ruTranslation: 'В книге говорилось: «Удавы заглатывают свою добычу целиком, не жуя.»',
    enTranslation: 'In the book it said: "Boa constrictors swallow their prey whole, without chewing it."',
    svTranslation: 'I boken stod det: "Boaormar sväljer sitt byte helt, utan att tugga."',
  },
  {
    id: 's4',
    chapterId: 'ch1',
    sentenceOrder: 4,
    originalText: 'After that they are not able to move, and they sleep through the six months that they need for digestion.',
    ruTranslation: 'После этого они не могут пошевелиться и спят полгода, пока не переварят пищу.',
    enTranslation: 'After that they are not able to move, and they sleep through the six months that they need for digestion.',
    svTranslation: 'Därefter kan de inte röra sig och de sover i sex månader medan de smälter maten.',
  },
  {
    id: 's5',
    chapterId: 'ch1',
    sentenceOrder: 5,
    originalText: 'I pondered deeply, then, over the adventures of the jungle.',
    ruTranslation: 'Тогда я много думал о приключениях в джунглях.',
    enTranslation: 'I pondered deeply, then, over the adventures of the jungle.',
    svTranslation: 'Jag funderade då länge och väl över djungelns äventyr.',
  },
  {
    id: 's6',
    chapterId: 'ch2',
    sentenceOrder: 1,
    originalText: 'So I lived my life alone, without anyone that I could really talk to.',
    ruTranslation: 'Так я жил один, и мне не с кем было по-настоящему поговорить.',
    enTranslation: 'So I lived my life alone, without anyone that I could really talk to.',
    svTranslation: 'Så jag levde mitt liv ensam, utan någon jag verkligen kunde prata med.',
  },
  {
    id: 's7',
    chapterId: 'ch2',
    sentenceOrder: 2,
    originalText: 'Then one day I had a breakdown in the desert, somewhere in the Sahara.',
    ruTranslation: 'Однажды у меня случилась авария в пустыне, где-то в Сахаре.',
    enTranslation: 'Then one day I had a breakdown in the desert, somewhere in the Sahara.',
    svTranslation: 'Sedan en dag hade jag ett haveri i öknen, någonstans i Sahara.',
  },
  {
    id: 's8',
    chapterId: 'ch2',
    sentenceOrder: 3,
    originalText: '"Please, draw me a sheep!" said a strange little voice.',
    ruTranslation: '«Нарисуй мне барашка!» — попросил странный тоненький голосок.',
    enTranslation: '"Please, draw me a sheep!" said a strange little voice.',
    svTranslation: '"Snälla, rita ett får åt mig!" sa en konstig liten röst.',
  },
];

export const demoSentencesByBook: Record<string, Sentence[]> = {
  '1': demoSentences,
  '2': [
    {
      id: 'ak1', chapterId: 'ak-ch1', sentenceOrder: 1,
      originalText: 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.',
      ruTranslation: 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.',
      enTranslation: 'All happy families are alike; each unhappy family is unhappy in its own way.',
      svTranslation: 'Alla lyckliga familjer liknar varandra; varje olycklig familj är olycklig på sitt eget sätt.',
    },
    {
      id: 'ak2', chapterId: 'ak-ch1', sentenceOrder: 2,
      originalText: 'Всё смешалось в доме Облонских.',
      ruTranslation: 'Всё смешалось в доме Облонских.',
      enTranslation: 'Everything was in confusion in the Oblonskys\' house.',
      svTranslation: 'Allt var i oordning i familjen Oblonskijs hus.',
    },
  ],
  '3': [
    {
      id: 'pl1', chapterId: 'pl-ch1', sentenceOrder: 1,
      originalText: 'I utkanten av en liten stad låg en gammal trädgård.',
      ruTranslation: 'На окраине маленького городка стоял старый сад.',
      enTranslation: 'On the outskirts of a little town lay an old garden.',
      svTranslation: 'I utkanten av en liten stad låg en gammal trädgård.',
    },
    {
      id: 'pl2', chapterId: 'pl-ch1', sentenceOrder: 2,
      originalText: 'Och i trädgården stod ett gammalt hus.',
      ruTranslation: 'А в саду стоял старый дом.',
      enTranslation: 'And in the garden stood an old house.',
      svTranslation: 'Och i trädgården stod ett gammalt hus.',
    },
  ],
};

export const demoProgress: UserProgress = {
  bookId: '1',
  lastSentencePosition: 3,
  completedSentences: 3,
  totalSentences: 48,
};
