// Voice coach: phrase bank (EN/DE) + a speech queue that never spams.
// Rep counts interrupt anything; form cues and hype have cooldowns.

const PHRASES = {
  en: {
    remaining: { 3: 'Three more!', 2: 'Two more, keep pushing!', 1: 'One more, you can do it!' },
    setDone: ['Yes! Set complete. Great work, {name}!', 'Boom! That set is done. Proud of you!', "That's how it's done, {name}!"],
    hype: ["Looking strong!", 'Nice and controlled.', "That's it, keep that form!", "You're crushing it!", 'Breathe. Stay with me.', 'Every rep counts, {name}!'],
    idle: ["Come on, don't stop now!", "Stay with me {name}, you've got this!", "Let's go, a few more!"],
    streak: 'Perfect form, {n} in a row!',
    partial: 'Go a bit deeper, full range!',
    tooFast: 'Slow it down, control the movement.',
    notVisible: 'Step back so I can see your whole body.',
    holdStart: 'Hold it! Timer running.',
    holdLost: 'Get back into position!',
    holdLeft: '{n} seconds left!',
    holdDone: 'Time! Amazing hold, {name}!',
    rest: 'Rest {n} seconds. Shake it out, drink some water.',
    restTen: 'Ten seconds. Get ready.',
    go: 'Three, two, one, go!',
    next: 'Next up: {ex}. {sets} sets of {reps}.',
    nextHold: 'Next up: {ex}. Hold for {reps} seconds.',
    workoutDone: "Workout complete! I'm proud of you, {name}. Stretch, hydrate and log your meals.",
    faults: {
      chest_up: 'Chest up, keep your back straight.',
      torso_upright: 'Keep your torso upright.',
      go_lower: 'Go a bit lower, thighs parallel.',
      soft_knee: "Soft knees, it's a hinge, not a squat.",
      hinge_more: 'Hinge forward more, flat back.',
      hips_sag: "Lift your hips, don't let them sag.",
      hips_pike: 'Lower your hips into a straight line.',
      hips_high: 'Keep those hips high.',
      hips_up: 'Push your hips up.',
      wrists_over_elbows: 'Stack your wrists over your elbows.',
      too_high: 'Stop at shoulder height.',
      straight_arms: 'Keep your arms almost straight.',
      elbows_pinned: 'Keep your elbows pinned to your sides.',
      feet_wide: 'Jump your feet wider.',
    },
  },
  de: {
    remaining: { 3: 'Noch drei!', 2: 'Noch zwei, weiter so!', 1: 'Noch eine, du schaffst das!' },
    setDone: ['Ja! Satz geschafft. Super gemacht, {name}!', 'Stark! Satz erledigt. Ich bin stolz auf dich!', 'Genau so, {name}!'],
    hype: ['Sieht stark aus!', 'Schön kontrolliert.', 'Genau so, halt die Technik!', 'Du rockst das!', 'Atmen. Bleib dran.', 'Jede Wiederholung zählt, {name}!'],
    idle: ['Komm schon, nicht aufhören!', 'Bleib dran {name}, du packst das!', 'Los, noch ein paar!'],
    streak: 'Perfekte Technik, {n} am Stück!',
    partial: 'Etwas tiefer, volle Bewegung!',
    tooFast: 'Langsamer, kontrolliere die Bewegung.',
    notVisible: 'Geh einen Schritt zurück, damit ich dich ganz sehe.',
    holdStart: 'Halten! Die Zeit läuft.',
    holdLost: 'Zurück in Position!',
    holdLeft: 'Noch {n} Sekunden!',
    holdDone: 'Zeit! Starkes Halten, {name}!',
    rest: '{n} Sekunden Pause. Locker machen, etwas trinken.',
    restTen: 'Zehn Sekunden. Mach dich bereit.',
    go: 'Drei, zwei, eins, los!',
    next: 'Als Nächstes: {ex}. {sets} Sätze mit {reps}.',
    nextHold: 'Als Nächstes: {ex}. {reps} Sekunden halten.',
    workoutDone: 'Training geschafft! Ich bin stolz auf dich, {name}. Dehnen, trinken und Mahlzeiten eintragen.',
    faults: {
      chest_up: 'Brust raus, Rücken gerade.',
      torso_upright: 'Oberkörper aufrecht halten.',
      go_lower: 'Etwas tiefer, Oberschenkel parallel.',
      soft_knee: 'Knie leicht gebeugt, Hüfte nach hinten.',
      hinge_more: 'Weiter nach vorne beugen, Rücken gerade.',
      hips_sag: 'Hüfte hoch, nicht durchhängen.',
      hips_pike: 'Hüfte runter, gerade Linie.',
      hips_high: 'Hüfte schön hoch halten.',
      hips_up: 'Hüfte nach oben drücken.',
      wrists_over_elbows: 'Handgelenke über die Ellbogen.',
      too_high: 'Nur bis Schulterhöhe.',
      straight_arms: 'Arme fast gestreckt lassen.',
      elbows_pinned: 'Ellbogen eng am Körper.',
      feet_wide: 'Füße weiter auseinander springen.',
    },
  },
};

const NUMBERS_DE = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];

export function fill(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function phrases(lang) {
  return PHRASES[lang] || PHRASES.en;
}

export class Coach {
  constructor({ lang = 'en', name = '', voice = true } = {}) {
    this.lang = lang;
    this.name = name;
    this.voiceOn = voice;
    this.lastSpoke = {};
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voice = null;
    this.listeners = [];
    if (this.synth) {
      const choose = () => {
        const voices = this.synth.getVoices();
        const prefix = this.lang === 'de' ? 'de' : 'en';
        this.voice = voices.find((v) => v.lang.startsWith(prefix) && /natural|premium|enhanced|google/i.test(v.name))
          || voices.find((v) => v.lang.startsWith(prefix)) || null;
      };
      choose();
      this.synth.addEventListener?.('voiceschanged', choose);
    }
  }

  get P() {
    return phrases(this.lang);
  }

  onSay(fn) {
    this.listeners.push(fn);
  }

  // key: cooldown bucket; cooldown in ms; interrupt cancels current speech.
  say(text, { key = 'misc', cooldown = 0, interrupt = false, vars = {} } = {}) {
    const now = Date.now();
    if (cooldown && this.lastSpoke[key] && now - this.lastSpoke[key] < cooldown) return false;
    this.lastSpoke[key] = now;
    const msg = fill(text, { name: this.name, ...vars }).replace(/,\s*!/g, '!').replace(/\s+/g, ' ').trim();
    this.listeners.forEach((fn) => fn(msg));
    if (!this.voiceOn || !this.synth) return true;
    if (interrupt) this.synth.cancel();
    const u = new SpeechSynthesisUtterance(msg);
    if (this.voice) u.voice = this.voice;
    u.lang = this.lang === 'de' ? 'de-CH' : 'en-US';
    u.rate = 1.05;
    u.pitch = 1.05;
    this.synth.speak(u);
    return true;
  }

  count(n) {
    const word = this.lang === 'de' ? (NUMBERS_DE[n] || String(n)) : String(n);
    this.say(word, { key: 'count', interrupt: true });
  }

  // Called after each counted rep.
  onRep(ev, target) {
    const left = target - ev.count;
    if (left <= 0) return;
    if (this.P.remaining[left]) {
      this.say(this.P.remaining[left], { key: 'remaining', interrupt: true });
    } else if (ev.tooFast) {
      this.say(this.P.tooFast, { key: 'tempo', cooldown: 8000, interrupt: true });
    } else if (ev.clean && ev.streak > 0 && ev.streak % 5 === 0) {
      this.say(this.P.streak, { key: 'streak', vars: { n: ev.streak }, interrupt: true });
    } else if (ev.faults.length) {
      this.fault(ev.faults[0], true);
    } else if (Math.random() < 0.35) {
      this.count(ev.count);
      this.say(pick(this.P.hype), { key: 'hype', cooldown: 6000 });
    } else {
      this.count(ev.count);
    }
  }

  fault(id, interrupt = false) {
    const text = this.P.faults[id];
    if (text) this.say(text, { key: 'fault:' + id, cooldown: 5000, interrupt });
  }

  setVoice(on) {
    this.voiceOn = on;
    if (!on) this.synth?.cancel();
  }

  stop() {
    this.synth?.cancel();
  }
}

// A small beep + vibration on each rep for instant feedback.
let audioCtx;
export function beep(freq = 880, ms = 90) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* audio not available */
  }
  navigator.vibrate?.(40);
}
