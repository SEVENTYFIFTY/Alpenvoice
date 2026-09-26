# AlpenCoach: AI video personal trainer

A phone web app (PWA) that turns your phone camera into a personal trainer.
It needs no app store and no backend, and your video never leaves the phone.

## What it does

| Area | Features |
|---|---|
| **Live camera coaching** | On-device body tracking with MediaPipe Pose (33 points), drawn as dots and a skeleton over the video. Counts reps and hold times, gives a depth bar, and reports a form score per set. Joints with bad form turn red. |
| **Voice coach (EN / DE)** | Counts reps out loud ("Two more, keep pushing!", "One more, you can do it!"). Gives form cues ("Chest up", "Lift your hips"), catches partial reps and rushed tempo, cheers form streaks, nudges you when you stop, and runs rest countdowns. Beeps and vibrates on each rep. |
| **Workout builder** | Pick body parts (chest, back, shoulders, arms, core, legs, glutes, cardio), time and level. You get a warm-up plus sets, reps and rests tuned to your goal and today's energy check-in. It suggests what to train next based on the last 48h. |
| **19 tracked exercises** | Squat, reverse lunge, wall sit, glute bridge, good morning, bent-over row, push-up, incline push-up, pike push-up, shoulder press, lateral raise, biceps curl, chair dip, sit-up, plank, side plank, mountain climbers, high knees, jumping jacks |
| **Fits your real life** | The **Week** tab asks about your job (office, home office, hybrid, shifts including night shifts, commute, lunch break), your **kids** (ages, daycare / kindergarten / school times and days, who does drop-off and pick-up, bedtimes, toddler naps), dinner, bed and wake times, and fixed commitments. From that it finds the gaps where you're **free**, where the **kids are with you**, and where you're **busy**, then plans your sessions in the best windows (preferred time of day, no back-to-back days, not too close to bedtime). It sets body-part splits, adds **walks** in the leftover gaps, and suggests **family workouts** when the only time you have is with the kids. It tells you honestly when fewer sessions fit than you asked for. The home screen shows today's window with a Start button, the app nudges you when the window opens, and **Add to my calendar** exports an `.ics` file with 10-minute reminders. |
| **Body analysis** | BMI, BMR, daily burn, calorie and macro targets, and waist-to-height risk. **Posture scan** (5 s front + 5 s side) checks shoulder and hip tilt, head tilt, lateral shift, knee valgus, forward head, slouching and sway-back, with corrective exercises for each finding. |
| **Food plan** | 7-day meal plan (omnivore / vegetarian / vegan) with gram portions scaled to your calorie target. You can tick meals as eaten, and it points out any protein gap. |
| **Water & steps** | Daily goals, one-tap logging, hydration reminders, a live step counter from the accelerometer, and manual step entry. |
| **Coach friend** | Home screen coach messages that react to your streak, energy, water, steps and posture. Optional **AI chat** with Claude that knows your profile, targets and workout history (you bring your own Anthropic API key). |

All data is stored in the browser's `localStorage` on your phone. You can export it as JSON from the Body → Settings screen.

## Run it

The camera needs **https** (or `localhost`).

```bash
cd trainer
python3 -m http.server 8080      # then open http://localhost:8080
```

To use it on your phone, host the `trainer/` folder on any static https host:

- **GitHub Pages:** Settings → Pages → deploy from branch, folder `/trainer` (or copy it to `/docs`).
- **Netlify / Cloudflare Pages / Vercel:** drag-and-drop the `trainer` folder.

Then open the URL on your phone and choose *Add to Home Screen* so it runs full-screen like an app.

### Camera setup tips
- Lean the phone against something at hip height, 2–3 m away, so your whole body is in frame.
- Each exercise tells you whether to stand **side-on** (squats, push-ups, planks…) or **facing** the camera (jacks, shoulder press, lateral raise).
- Good, even light helps a lot. If tracking misses a rep, tap **+1**.

## Tests

```bash
cd trainer && npm test     # node --test, no dependencies
```

The unit tests cover schedule planning (office worker, parent of a kindergartener, toddler naps, busy parent of two, night shift, morning preference), joint-angle math, rep counting on synthetic squat streams, partial-rep and tempo detection, form faults, hold timing, nutrition formulas, meal-plan diet filtering and calories, the workout builder, recommendations, posture findings and the step detector.

## Code map

| File | Purpose |
|---|---|
| `js/geometry.js` | Landmark indices, angles, tilt, smoothing |
| `js/exercises.js` | Exercise library: tracked metric, rep range, hold rules, form checks |
| `js/repCounter.js` | Rep state machine (start → moving → peak → rep), partial/tempo detection, hold timer |
| `js/coach.js` | EN/DE phrase bank, speech queue with cooldowns, beep/vibrate |
| `js/pose.js` | Camera + MediaPipe Pose Landmarker + skeleton overlay |
| `js/session.js` | Guided workout runner and posture scan flow |
| `js/planner.js` | Workout builder + next-workout recommendation |
| `js/schedule.js` | Life schedule → free/family/busy day grid → weekly training plan, `.ics` export |
| `js/week.js` | Week tab: schedule form and weekly plan view |
| `js/posture.js` | Posture analysis and corrective exercises |
| `js/nutrition.js` | BMI/BMR/TDEE, macros, water, steps, meal plans |
| `js/pedometer.js` | Accelerometer step detection |
| `js/chat.js` | Optional Claude-powered coach chat |
| `js/main.js` | UI: Today, Train, Week, Body, Food, Coach tabs |

## Limits (honest notes)
- Pose tracking is 2D from one camera. Side-on vs facing placement matters, and it cannot judge everything a human trainer can (grip, breathing, spinal flexion under load).
- Web browsers can't read Apple Health / Google Fit step history. Live step counting only works while the app is open.
- Calorie, water and posture outputs are estimates for healthy adults, not medical advice. See a doctor or physiotherapist for pain or health conditions.
- The AI chat key is stored in the browser and used directly from the phone. That's fine for personal use; for a public app, route chat through your own backend.
