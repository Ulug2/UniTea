export type QuestionOption = {
  label: string;
};

export type Question = {
  id: string;
  text: string;
  options: QuestionOption[];
  weight: number;
  scoringType: 'similarity' | 'complementarity';
  adjacency?: number[][];
};

export const MATCHMAKING_QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: 'Your Friday night default?',
    weight: 3,
    scoringType: 'similarity',
    options: [
      { label: 'Out — bars, parties, social scene' },
      { label: 'Small hangout, close friends only' },
      { label: 'Cozy night in, total decompress' },
      { label: 'Spontaneous — could go either way' },
    ],
  },
  {
    id: 'q2',
    text: 'Your natural sleep schedule?',
    weight: 3,
    scoringType: 'similarity',
    options: [
      { label: 'Early bird — up before 8am' },
      { label: 'Midnight — sleep around 12am' },
      { label: 'Night owl — up past 2am regularly' },
      { label: 'Chaotic, no real schedule' },
    ],
  },
  {
    id: 'q3',
    text: 'Your texting style?',
    weight: 3,
    scoringType: 'similarity',
    options: [
      { label: 'Reply fast, always on' },
      { label: 'Thoughtful, but slow' },
      { label: 'Call/voice > texts any day' },
      { label: 'Depends completely on who it is' },
    ],
  },
  {
    id: 'q4',
    text: 'When stressed, you…?',
    weight: 2,
    scoringType: 'complementarity',
    options: [
      { label: 'Need solo time to reset' },
      { label: 'Vent to someone close' },
      { label: 'Stay busy, push through' },
      { label: 'Exercise or physical outlet' },
    ],
  },
  {
    id: 'q5',
    text: 'In 5 years, you see yourself…?',
    weight: 2,
    scoringType: 'similarity',
    options: [
      { label: 'Climbing the career ladder hard' },
      { label: 'Building something of my own' },
      { label: 'Doing meaningful work / impact' },
      { label: 'Honestly still figuring it out' },
    ],
  },
  {
    id: 'q6',
    text: 'What you value most in people?',
    weight: 2,
    scoringType: 'similarity',
    options: [
      { label: 'Loyalty — ride or die' },
      { label: 'Ambition — always building' },
      { label: 'Creativity — original thinker' },
      { label: 'Authenticity — no performance' },
    ],
  },
  {
    id: 'q7',
    text: 'Your humor flavor?',
    weight: 1,
    scoringType: 'similarity',
    options: [
      { label: 'Self-deprecating' },
      { label: 'Dry / deadpan' },
      { label: 'Absurd and chaotic' },
      { label: 'Wholesome / dad jokes' },
    ],
  },
  {
    id: 'q8',
    text: "When there's tension, you…?",
    weight: 1,
    scoringType: 'similarity',
    options: [
      { label: 'Address it directly, right away' },
      { label: 'Let it cool, then talk' },
      { label: 'Drop hints and hope they get it' },
      { label: "Pretend everything's fine" },
    ],
  },
  {
    id: 'q9',
    text: 'Ideal way to spend time together?',
    weight: 1,
    scoringType: 'similarity',
    options: [
      { label: 'Explore somewhere new' },
      { label: 'Cook / eat together' },
      { label: 'Coffee and deep conversation' },
      { label: 'Drinks, music, and good vibes' },
    ],
  },
];

export const MAX_COMPATIBILITY_SCORE = MATCHMAKING_QUESTIONS.reduce(
  (sum, q) => sum + q.weight,
  0,
); // = 18
