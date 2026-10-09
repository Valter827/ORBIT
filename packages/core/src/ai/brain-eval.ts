export const BRAIN_EVAL_SUITE = "orbit-brain-eval-0.10.1-3";
export type BrainEvalCase = {
  name: string;
  category: string;
  system?: string;
  prompt: string;
  validate: (text: string) => boolean;
};
const exact = (answer: string) => (text: string) =>
  text.trim().replace(/[.!]$/, "").toLowerCase() === answer.toLowerCase();
const reasoning: Array<[string, string, string]> = [
  ["Arithmetic", "There are 17 red and 8 blue blocks. Remove 6 red blocks. How many remain?", "19"],
  ["Multi-step cost", "Three books cost 12 each. Apply a 25% discount, then add 5 shipping. What is the total?", "32"],
  ["Ordering constraints", "A precedes C. B follows C. Return the only order of A,B,C separated by commas.", "A,C,B"],
  [
    "Parallel planning",
    "Task A takes 3 hours. B and C start after A and take 4 and 2 hours in parallel. D follows both and takes 1 hour. Minimum total hours?",
    "8",
  ],
  ["Rate comparison", "A: 3 items for 12. B: 5 items for 15. Which has lower cost per item, A or B?", "B"],
  ["Sequence rule", "Start at 2. Repeatedly double then add 1. Sequence 2,5,11,23. Next number?", "47"],
  ["Weighted mean", "Two scores of 10 and three scores of 20. What is the average of all five scores?", "16"],
  ["Set overlap", "18 people like tea, 15 coffee, 7 both. How many like at least one?", "26"],
  ["Implication", "All ravens are birds. Some birds are blue. Must some ravens be blue? Answer YES or NO.", "NO"],
  [
    "Conditional probability",
    "A bag has 3 red and 2 blue balls. Draw two without replacement. Probability both are red? Give a reduced fraction.",
    "3/10",
  ],
  ["Constraint selection", "Choose the smallest integer x where x>7, x<15 and x is divisible by both 2 and 3.", "12"],
  [
    "Data interpretation",
    "Sales Jan=12, Feb=18, Mar=15. What is the increase from Jan to Mar as a percentage? Include %.",
    "25%",
  ],
];
export const strongerBrainCases: BrainEvalCase[] = [
  ...reasoning.map(([name, prompt, answer]) => ({
    name,
    category: "reasoning",
    prompt: prompt + " Return only the final answer; no reasoning trace.",
    validate: exact(answer),
  })),
  {
    name: "Current instruction priority",
    category: "context",
    system:
      "Synthetic saved preference: user generally prefers English. Current explicit user instructions override this preference.",
    prompt: "Відповідай українською одним реченням: повідом, що перевірку успішно завершено.",
    validate: (t) =>
      /перевір|тест/u.test(t.toLowerCase()) &&
      /заверш|закінч|успіш/u.test(t.toLowerCase()) &&
      !/completed|successfully|провер/u.test(t.toLowerCase()),
  },
  {
    name: "Eight required points",
    category: "context",
    system:
      "Synthetic launch facts: owner=Mira; stage=beta; version=2.1; language=Rust; deadline=Friday; region=EU; blocker=DNS; next=load testing.",
    prompt:
      "Return eight numbered points, one for each supplied launch fact. Include all values, with no invented facts.",
    validate: (t) =>
      [/Mira/i, /beta/i, /2\.1/, /Rust/i, /Friday/i, /\bEU\b/, /DNS/, /load test/i].every((r) => r.test(t)),
  },
  {
    name: "Conflicting evidence",
    category: "rag",
    system:
      "Use only these sources. [A] The measurement is 10. [B] The measurement is 15. Neither source has precedence.",
    prompt: "State both measurements, cite their sources, and explain whether one definitive value can be selected.",
    validate: (t) =>
      /\b10\b/.test(t) &&
      /\b15\b/.test(t) &&
      /\[A\]/.test(t) &&
      /\[B\]/.test(t) &&
      /conflict|disagree|cannot|can't|inconsisten|impossible|neither.{0,40}precedence|insufficient/i.test(t),
  },
  {
    name: "Unanswerable source",
    category: "hallucination",
    system: "Only evidence: [A] Synthetic probe Zeta is silver. No other information is available.",
    prompt: "What is Zeta's launch date? Return UNKNOWN when the evidence does not specify it.",
    validate: exact("UNKNOWN"),
  },
  {
    name: "Python edge semantics",
    category: "code",
    prompt: "Python: print([x*x for x in [-2,0,3] if x != 0]). Return only the printed output.",
    validate: (t) => t.replace(/\s/g, "") === "[4,9]",
  },
  {
    name: "Rust integer semantics",
    category: "code",
    prompt:
      'Rust: let xs=[2_i32,3,4]; let n:i32=xs.iter().filter(|&&x| x%2==0).sum(); println!("{}",n); Return only the output.',
    validate: exact("6"),
  },
  {
    name: "TypeScript nullish semantics",
    category: "code",
    prompt:
      "TypeScript: const xs: Array<number|null>=[0,null,2]; console.log(xs.map(x=>x??7).join(',')); Return only the output.",
    validate: exact("0,7,2"),
  },
  {
    name: "JavaScript stable uniqueness",
    category: "code",
    prompt: "JavaScript: console.log([...new Set([3,1,3,2,1])].join(',')); Return only the output.",
    validate: exact("3,1,2"),
  },
];
const languages = [
  {
    category: "ukrainian",
    rows: [
      ["Grammar", "Обери правильне узгодження: A) Нові файли збережено. B) Новий файли збережено. Лише A або B.", "A"],
      ["Technical", "Що зберігає пари ключ-значення: A) словник B) монітор? Лише A або B.", "A"],
      ["Instruction", "Напиши тільки число, яке на три більше за сім.", "10"],
      [
        "Summary",
        "Олена запустила тест. Тест упав через відсутній файл. Файл додали. Обери причину збою: A) мережа B) відсутній файл. Лише літера.",
        "B",
      ],
      [
        "Meaning",
        "Яке речення описує майбутню дію: A) Я вже перевірив код. B) Я перевірю код завтра. Лише літера.",
        "B",
      ],
    ],
  },
  {
    category: "russian",
    rows: [
      [
        "Grammar",
        "Выбери правильное согласование: A) Новые файлы сохранены. B) Новый файлы сохранены. Только A или B.",
        "A",
      ],
      ["Technical", "Что хранит пары ключ-значение: A) словарь B) монитор? Только A или B.", "A"],
      ["Instruction", "Напиши только число, которое на три больше семи.", "10"],
      [
        "Summary",
        "Елена запустила тест. Он упал из-за отсутствующего файла. Файл добавили. Причина сбоя: A) сеть B) отсутствующий файл. Только буква.",
        "B",
      ],
      [
        "Code explanation",
        "Python len([]) возвращает 0, потому что: A) список пуст B) в списке один элемент. Только буква.",
        "A",
      ],
    ],
  },
  {
    category: "english",
    rows: [
      [
        "Grammar",
        "Choose the correct agreement: A) The new files are saved. B) The new files is saved. A or B only.",
        "A",
      ],
      ["Technical", "Which stores key-value pairs: A) dictionary B) monitor? A or B only.", "A"],
      ["Instruction", "Write only the number three greater than seven.", "10"],
      [
        "Summary",
        "Elena ran a test. It failed due to a missing file. The file was added. Cause: A) network B) missing file. Letter only.",
        "B",
      ],
      [
        "Code explanation",
        "Python len([]) returns 0 because: A) the list is empty B) the list has one item. Letter only.",
        "A",
      ],
    ],
  },
];
for (const language of languages)
  for (const [name, prompt, answer] of language.rows)
    strongerBrainCases.push({
      name: language.category + " " + name,
      category: language.category,
      prompt: prompt!,
      validate: exact(answer!),
    });

/** Transparent weights; no score exists when required measurements are missing. */
export const coreWeights: Record<string, number> = {
  reasoning: 0.25,
  context: 0.2,
  rag: 0.2,
  ukrainian: 0.08,
  russian: 0.08,
  english: 0.08,
  structured: 0.06,
  hallucination: 0.05,
};
export function practicalCoreScore(cases: Array<{ category: string; passed: boolean }>): number | null {
  let score = 0;
  for (const [category, weight] of Object.entries(coreWeights)) {
    const measured = cases.filter((c) => c.category === category);
    if (!measured.length) return null;
    score += (weight * measured.filter((c) => c.passed).length) / measured.length;
  }
  return score;
}
