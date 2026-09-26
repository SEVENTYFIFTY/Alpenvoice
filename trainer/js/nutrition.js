// Body metrics, calorie/macro targets, water & steps goals, meal plans.
// Formulas: BMI, Mifflin-St Jeor BMR, activity multipliers, ~35 ml/kg water.
// These are general-population estimates, not medical advice.

export const ACTIVITY = {
  sedentary: { label: 'Sedentary (desk job, little exercise)', factor: 1.2, steps: 7000 },
  light: { label: 'Light (1–3 workouts / week)', factor: 1.375, steps: 8000 },
  moderate: { label: 'Moderate (3–5 workouts / week)', factor: 1.55, steps: 10000 },
  active: { label: 'Very active (6–7 workouts / week)', factor: 1.725, steps: 12000 },
};

export const GOALS = {
  lose: { label: 'Lose fat', kcal: -0.2, proteinPerKg: 2.0, stepsBonus: 2000 },
  maintain: { label: 'Get fit & toned', kcal: 0, proteinPerKg: 1.6, stepsBonus: 0 },
  gain: { label: 'Build muscle', kcal: 0.1, proteinPerKg: 1.8, stepsBonus: -1000 },
};

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiCategory(v) {
  if (v < 18.5) return 'Underweight';
  if (v < 25) return 'Healthy range';
  if (v < 30) return 'Overweight';
  return 'Obesity range';
}

export function bmr({ sex, age, weight, height }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

export function targets(profile) {
  const act = ACTIVITY[profile.activity] || ACTIVITY.light;
  const goal = GOALS[profile.goal] || GOALS.maintain;
  const b = bmr(profile);
  const tdee = b * act.factor;
  const floor = profile.sex === 'female' ? 1200 : 1500;
  const kcal = Math.max(floor, Math.round((tdee * (1 + goal.kcal)) / 10) * 10);
  const protein = Math.round(profile.weight * goal.proteinPerKg);
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const waterMl = Math.round((profile.weight * 35) / 50) * 50;
  const steps = Math.max(6000, act.steps + goal.stepsBonus);
  const b2 = bmi(profile.weight, profile.height);
  const whtr = profile.waist ? profile.waist / profile.height : null;
  return {
    bmr: Math.round(b),
    tdee: Math.round(tdee),
    kcal,
    protein,
    fat,
    carbs,
    waterMl,
    steps,
    bmi: Math.round(b2 * 10) / 10,
    bmiCategory: bmiCategory(b2),
    waistToHeight: whtr ? Math.round(whtr * 100) / 100 : null,
    waistRisk: whtr == null ? null : whtr < 0.5 ? 'Low' : whtr < 0.6 ? 'Increased' : 'High',
  };
}

// Extra water for a workout: ~0.5 L per 30 minutes.
export function workoutWaterMl(minutes) {
  return Math.round((minutes / 30) * 500 / 50) * 50;
}

// Calories burned: MET × kg × hours.
export function kcalBurned(met, weightKg, seconds) {
  return Math.round(met * weightKg * (seconds / 3600));
}

// diet tags: 'omni' < 'veg' < 'vegan' (a vegan meal suits everyone).
const M = (slot, name, diet, kcal, protein, items) => ({ slot, name, diet, kcal, protein, items });

export const MEALS = [
  // Breakfast
  M('breakfast', 'Bircher muesli with berries & walnuts', 'veg', 505, 27, [['Oats', 60], ['Skyr / Greek yogurt', 150], ['Grated apple', 150], ['Berries', 80], ['Walnuts', 10]]),
  M('breakfast', 'Scrambled eggs on wholegrain toast', 'veg', 465, 28, [['Eggs (~3)', 150], ['Wholegrain bread', 80], ['Spinach', 50], ['Butter', 5]]),
  M('breakfast', 'Peanut-butter banana oats', 'vegan', 556, 22, [['Oats', 70], ['Soy milk', 250], ['Peanut butter', 15], ['Banana', 100]]),
  M('breakfast', 'Tofu scramble with tomatoes & toast', 'vegan', 502, 37, [['Firm tofu', 200], ['Wholegrain bread', 60], ['Tomatoes', 100], ['Olive oil', 5]]),
  M('breakfast', 'Quark power bowl', 'veg', 400, 36, [['Low-fat quark', 250], ['Oats', 40], ['Berries', 100], ['Honey', 10]]),
  M('breakfast', 'Smoked salmon & cream cheese toast', 'omni', 425, 28, [['Wholegrain bread', 80], ['Smoked salmon', 80], ['Cream cheese', 30], ['Cucumber', 80]]),
  // Lunch
  M('lunch', 'Chicken, rice & broccoli bowl', 'omni', 646, 55, [['Chicken breast', 150], ['Cooked rice', 200], ['Broccoli', 150], ['Olive oil', 10]]),
  M('lunch', 'Lentil & quinoa salad', 'vegan', 540, 25, [['Cooked lentils', 200], ['Cooked quinoa', 150], ['Cherry tomatoes', 150], ['Cucumber', 100], ['Olive oil', 10]]),
  M('lunch', 'Tuna wholegrain pasta', 'omni', 550, 42, [['Wholegrain pasta (dry)', 90], ['Tuna in water', 120], ['Tomato sauce', 150], ['Olive oil', 5]]),
  M('lunch', 'Chickpea & feta wrap', 'veg', 670, 31, [['Chickpeas (cooked)', 200], ['Feta', 50], ['Wholegrain wrap', 60], ['Peppers', 100], ['Spinach', 40]]),
  M('lunch', 'Salmon, potatoes & green beans', 'omni', 545, 38, [['Salmon fillet', 150], ['Potatoes', 250], ['Green beans', 150]]),
  M('lunch', 'Tofu & veggie noodle stir-fry', 'vegan', 655, 38, [['Firm tofu', 200], ['Rice noodles (dry)', 70], ['Mixed vegetables', 200], ['Sesame oil', 5]]),
  // Snack
  M('snack', 'Greek yogurt & almonds', 'veg', 190, 20, [['Greek yogurt 0%', 170], ['Almonds', 15]]),
  M('snack', 'Apple & peanut butter', 'vegan', 170, 4, [['Apple', 150], ['Peanut butter', 15]]),
  M('snack', 'Protein shake & banana', 'veg', 210, 25, [['Whey protein', 30], ['Banana', 100]]),
  M('snack', 'Hummus, carrots & crispbread', 'vegan', 210, 7, [['Hummus', 60], ['Carrots', 100], ['Crispbread', 20]]),
  M('snack', 'Edamame', 'vegan', 180, 17, [['Edamame', 150]]),
  M('snack', 'Cottage cheese & pineapple', 'veg', 236, 23, [['Cottage cheese', 200], ['Pineapple', 80]]),
  // Dinner
  M('dinner', 'Lean beef chili with rice', 'omni', 565, 44, [['Lean minced beef', 130], ['Kidney beans', 120], ['Chopped tomatoes', 200], ['Cooked rice', 150]]),
  M('dinner', 'Chicken, sweet potato & salad', 'omni', 571, 51, [['Chicken breast', 150], ['Sweet potato', 250], ['Green salad', 100], ['Olive oil', 10]]),
  M('dinner', 'Veggie omelette with potatoes', 'veg', 515, 32, [['Eggs (~3)', 150], ['Grated cheese', 30], ['Peppers', 100], ['Potatoes', 200]]),
  M('dinner', 'Chickpea & spinach curry with rice', 'vegan', 623, 26, [['Chickpeas (cooked)', 200], ['Light coconut milk', 100], ['Spinach', 100], ['Cooked rice', 150]]),
  M('dinner', 'Cod with quinoa & zucchini', 'omni', 488, 44, [['Cod fillet', 180], ['Cooked quinoa', 180], ['Zucchini', 200], ['Olive oil', 10]]),
  M('dinner', 'Red-lentil bolognese pasta', 'vegan', 604, 30, [['Red lentils (dry)', 60], ['Wholegrain pasta (dry)', 80], ['Tomato passata', 200], ['Olive oil', 5]]),
];

export const SLOTS = [
  { id: 'breakfast', label: 'Breakfast', share: 0.25 },
  { id: 'lunch', label: 'Lunch', share: 0.35 },
  { id: 'snack', label: 'Snack', share: 0.1 },
  { id: 'dinner', label: 'Dinner', share: 0.3 },
];

function allowed(meal, diet) {
  if (diet === 'vegan') return meal.diet === 'vegan';
  if (diet === 'veg') return meal.diet !== 'omni';
  return true;
}

function scaleMeal(meal, targetKcal) {
  const factor = Math.min(2, Math.max(0.5, Math.round((targetKcal / meal.kcal) * 20) / 20));
  return {
    ...meal,
    factor,
    kcal: Math.round(meal.kcal * factor),
    protein: Math.round(meal.protein * factor),
    items: meal.items.map(([n, g]) => [n, Math.max(5, Math.round((g * factor) / 5) * 5)]),
  };
}

export function mealPlan(t, diet = 'omni', days = 7) {
  const week = [];
  for (let d = 0; d < days; d++) {
    const meals = SLOTS.map((slot, s) => {
      const options = MEALS.filter((m) => m.slot === slot.id && allowed(m, diet));
      const meal = options[(d + s * 2) % options.length];
      return { ...scaleMeal(meal, t.kcal * slot.share), slot: slot.label };
    });
    week.push({
      day: d,
      meals,
      kcal: meals.reduce((a, m) => a + m.kcal, 0),
      protein: meals.reduce((a, m) => a + m.protein, 0),
    });
  }
  return week;
}
