const test = require("node:test"),
  assert = require("node:assert/strict");
process.env.NODE_ENV = "development";
const { newBattle, advance } = require("../services/arena/combat");
const { resolveCharacter } = require("../services/arena/characters");
const { legendData, legendSvg } = require("../services/arena/legend");
const { healthCost } = require("../services/arena/resources");
const { kitFor } = require("../services/arena/rules");
test("development Arena exposes fight, campaign and management subcommands", () => {
  const command = require("../commands/Arena/Arena");
  assert.deepEqual(
    command.data.toJSON().options.map((x) => x.name),
    ["fight", "campaign", "shop", "access", "diagnostic"]
  );
  assert.equal(typeof command.autocomplete, 'function');
});
test("immediate critical has no symbol in the second embed key", () => {
  const b = newBattle(6, {
    character: resolveCharacter("Hendrix"),
    opponent: "Hellfed Marq",
  });
  b.player.criticalReady = true;
  assert(!legendData(b).items.some(([type]) => type === "critical"));
  assert(!legendSvg(b).includes("Duality critical"));
});
test("Bleeding never amplifies Hellfed self payments or triggers from any special", () => {
  for (const rage of [0, 1, 2, 3])
    for (const slot of ["special1", "special2", "special3"]) {
      if (slot === "special1" && rage === 3) continue;
      const run = (bleeding) => {
        const b = newBattle(6, {
          character: resolveCharacter("Hellfed Marq"),
          opponent: "Hendrix",
        });
        b.player.rage = rage;
        if (bleeding) b.player.bleeding = { remaining: 3 };
        const cost = healthCost(b.player, kitFor(b.player)[slot]);
        let i = 0;
        const n = advance(
          b,
          { [slot]: true, ...(slot === "special3" ? { choice: 3 } : {}) },
          () => 1,
          () => [6, 7][i++ % 2],
          () => 99,
          () => 0,
          () => 99,
          () => 99,
          { actor: "ability" }
        );
        assert.notEqual(n, b, `${slot} resolved`);
        assert.equal(
          n.player.hp,
          b.player.hp - cost,
          `${slot} rage ${rage} bleeding ${bleeding}`
        );
        assert.equal(n.statistics.enemy.damage.bleeding, 0);
        return n;
      };
      const plain = run(false),
        bleeding = run(true);
      assert.equal(plain.player.hp, bleeding.player.hp);
      assert.equal(plain.enemy.hp, bleeding.enemy.hp);
    }
});
