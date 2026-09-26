// Optional AI coach chat powered by Claude. The user supplies their own API
// key (stored only on this device). Calls go straight from the browser to the
// Anthropic API using the official SDK.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0/+esm';

let clientPromise;
let clientKey;

async function client(apiKey) {
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import(SDK_URL).then(({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true }));
  }
  return clientPromise;
}

export function systemPrompt() {
  return `You are AlpenCoach, the user's personal trainer and supportive friend inside a phone fitness app.
The app tracks workouts with the phone camera (pose dots, rep counting, form checks), builds meal plans, and tracks water and steps.

How to coach:
- Warm, direct and motivating, like a good friend who is also a certified trainer and knows nutrition basics. Use the user's name now and then.
- Keep replies short enough to read on a phone between sets: a few sentences or a short list.
- Ground advice in the user's data below (profile, targets, today's numbers, recent workouts, posture findings). Be specific: exercises, sets/reps, grams, millilitres, steps.
- Only recommend exercises the app can track when suggesting a camera workout: squat, reverse lunge, wall sit, glute bridge, good morning, bent-over row, push-up, incline push-up, pike push-up, shoulder press, lateral raise, biceps curl, chair dip, sit-up, plank, side plank, mountain climbers, high knees, jumping jacks.
- Celebrate progress and streaks. If they missed days, encourage without guilt.
- You are not a doctor. For pain, injury, dizziness, chest pain, eating-disorder signs, pregnancy or medical conditions, advise seeing a doctor or physiotherapist and keep suggestions conservative.
- Reply in the language the user writes in.`;
}

// context: plain-text snapshot of the user's data, sent as the first user turn
// so the system prompt stays stable.
export async function sendChat({ apiKey, model, history, context, onText }) {
  const anthropic = await client(apiKey);
  const messages = [
    { role: 'user', content: `Here is my current data from the app:\n${context}` },
    { role: 'assistant', content: 'Got it. I have your latest data.' },
    ...history,
  ];
  const stream = anthropic.beta.messages.stream({
    model,
    max_tokens: 4000,
    system: systemPrompt(),
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages,
  });
  stream.on('text', (_, snapshot) => onText?.(snapshot));
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    return "I can't help with that one. Let's get back to your training. What's on your mind?";
  }
  return final.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}
