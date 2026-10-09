// Hands a question to Gemini or ChatGPT. The browser version of the phone's AiBridge, with the same
// rule: the prompt always goes on the clipboard first, and never into a URL (it would land in
// browser history). Nothing is ever auto-submitted.

export const TARGETS = [
  ['GEMINI', 'Gemini'],
  ['CHATGPT', 'ChatGPT'],
  ['ASK', 'Ask each time'],
];

const WEB = { GEMINI: 'https://gemini.google.com/app', CHATGPT: 'https://chatgpt.com/' };

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Must run inside the click handler: the new tab is opened synchronously, while the browser still
 * counts it as a user gesture. Resolves to a one-line description for a toast.
 */
export function ask(target, prompt) {
  const copied = copy(prompt);
  const label = TARGETS.find(t => t[0] === target)?.[1];
  if (target === 'ASK') {
    // "Choose app": the system share sheet where there is one (phones), else just the clipboard.
    if (navigator.share) {
      return navigator.share({ title: 'Fitness question', text: prompt })
        .then(() => 'Prompt shared — also copied', () => copied.then(ok => (ok ? 'Prompt copied' : 'Could not copy the prompt')));
    }
    return copied.then(ok => (ok ? 'Prompt copied — paste it into your AI app' : 'Could not copy the prompt'));
  }
  window.open(WEB[target], '_blank', 'noopener');
  return copied.then(ok => (ok ? `Opened ${label} — paste the prompt` : `Opened ${label} — copy failed, select the text manually`));
}

// ---------------------------------------------------------------- prompt builders
// Each carries the user's own context so the answer is not generic.

export function exercisePrompt(name, reps, targetWeightKg, focus, question) {
  let s = `I'm doing a gym session (${focus.toLowerCase()}). Exercise: ${name}, prescribed ${reps}`;
  if (targetWeightKg != null) s += ` at ${targetWeightKg} kg`;
  return `${s}.\n\n${question}`;
}

export const mealPrompt = (slot, option, question) =>
  `My coach's meal plan for ${slot.toLowerCase()} is:\n${option}\n\n${question}`;

export const statPrompt = (context, question) =>
  `Here's my current training data:\n${context}\n\n${question}`;

export const freeform = (selected, question) =>
  (question.trim() ? `${question}\n\nContext:\n${selected}` : selected);

/** Canned questions, so the common case is two taps and no typing. */
export const EXERCISE_QUESTIONS = [
  'How do I do this with correct form, and what are the three most common mistakes?',
  'My lower back hurts during this. What am I doing wrong and what should I change?',
  'Give me 3 substitute exercises that hit the same muscles with the equipment in a normal gym.',
  'Should I increase the weight this week? What is a sensible jump?',
  'How do I feel this in the target muscle instead of my joints?',
];

export const MEAL_QUESTIONS = [
  'Roughly how many calories and how much protein is in this?',
  "Give me an equally-macro'd swap I can make with Indian groceries.",
  "I'm eating out tonight. What's the closest thing to this on a restaurant menu?",
  'Is this enough protein for someone cutting at my weight?',
];

export const PROGRESS_QUESTIONS = [
  'Is this rate of weight loss healthy and sustainable?',
  'My weight has stalled. What should I change first?',
  "What does this trend suggest about whether I'm losing fat or muscle?",
];
