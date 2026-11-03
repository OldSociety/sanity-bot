const { discovered } = require('./discoveries');

const gymLines = [
  {
    text: 'The stronger you are, the more impact you do with good old-fashioned snow. But Strength has no effect on specialty weapons. Look for other ways to improve that sort of thing.'
  },
  {
    text: 'Lift with your legs. Throw with your arms. If you get those mixed up, I want to watch.'
  },
  { text: 'Snowmen skip leg day. Look at them. Learn from their mistakes.' },
  {
    text: 'Every great workout starts with showing up. Unfortunately, it also involves the workout.'
  },
  { text: 'Those weights are not going to lift themselves. I asked. Very rude of them.' },
  { text: 'You brought Sweat instead of excuses. We might actually get somewhere today.' },
  {
    text: 'Regular snow is free to admire. Throwing it with some muscle is where things get interesting.'
  },
  { text: 'A snowman challenged me to an arm wrestle once. Very short match. Very sad carrot.' },
  {
    text: 'The secret to getting stronger is repetition. The secret to getting stronger is repetition.'
  },
  {
    text: 'Take a breath between sets. The snowmen can wait. They are famously bad at walking away.'
  },
  { text: 'I put a motivational poster up. It fell down. Even the wall needs more training.' },
  {
    strength: 25,
    text: "Accuracy is all about imagining your target, seeing your target, and not missing. It's really that simple."
  },
  {
    strength: 25,
    text: 'Aim for the snowman. If you hit the gym window again, we are adding glass to your training costs.'
  },
  {
    endurance: true,
    text: 'Endurance training is available now. Being able to throw a punch is useful. Being able to take one is useful too.'
  }
];
function gymLine(s) {
  const available = gymLines.filter(
    (line) =>
      (!line.strength || s.strength >= line.strength) && (!line.endurance || s.lift50Completed)
  );
  return available[Math.max(0, (s.gymVisits || 1) - 1) % available.length].text;
}
function unavailable(s, action) {
  const known = discovered(s);
  return (
    action === 'slots' ||
    (action === 'hidden' && s.tier < 3) ||
    (action === 'shop' && s.dummyHp > 0) ||
    (action === 'diamonds' && !s.wooden) ||
    (action === 'kitchen' && !known.kitchen) ||
    (['train', 'gym'].includes(action) && !s.gymUnlocked) ||
    (action === 'emporium' && !s.emporiumIntroduced && !s.jacketOwned)
  );
}
module.exports = { gymLine, unavailable };
