'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('WinterMonsters', [
      {
        name: 'Julbock, the Yule Goat',
        hp: 8,
        strength: 13,
        defense: 4,
        agility: 5,
        attacks: JSON.stringify([
          {
            name: 'Yule Ram',
            description: 'Light physical damage.',
            damageMin: 0.8,
            damageMax: 1.6,
            damageType: 'physical',
            priority: 1
          },
          {
            name: 'Gentle Frostbite',
            description: 'A chilling attack that weakens your strength.',
            damageMin: 1.2,
            damageMax: 2.4,
            damageType: 'cold',
            priority: 2,
            effect: {
              stat: 'strength',
              value: -2, // Reduces strength by 2
              duration: 2 // Lasts 2 turns
            }
          },
        ]),
        flavorText: 'A mischievous goat that curses your name!',
      },
      // {
      //   name: 'Inflatable Frostbeast',
      //   hp: 12,
      //   strength: 6,
      //   defense: 5,
      //   agility: 5,
      //   attacks: JSON.stringify([
      //     {
      //       name: 'Light Frost Scratch',
      //       description: 'Minimal physical damage.',
      //     },
      //     { name: 'Snowy Gust', description: 'Light air-elemental attack.' },
      //     {
      //       name: 'Frosty Shield',
      //       description: 'Reduces incoming damage slightly.',
      //     },
      //   ]),
      //   flavorText:
      //     'An inflatable snow beast that floats around causing chaos.',
      // },
      // {
      //   name: 'Snowman Dummy',
      //   hp: 5000,
      //   strength: 0,
      //   defense: 0,
      //   agility: 0,
      //   attacks: JSON.stringify([]),
      //   flavorText: 'A practice snowman for testing your moves!',
      // },
      // {
      //   name: 'Chillzilla',
      //   hp: 20,
      //   strength: 10,
      //   defense: 8,
      //   agility: 5,
      //   attacks: JSON.stringify([
      //     { name: 'Icy Tail Swipe', description: 'Moderate physical damage.' },
      //     {
      //       name: 'Snowy Roar',
      //       description: 'Reduces agility of the opponent.',
      //     },
      //     { name: 'Cold Bite', description: 'Heavy physical attack.' },
      //   ]),
      //   flavorText: 'A giant icy beast with a chilling roar.',
      // },
      // {
      //   name: 'Frost Imp',
      //   hp: 15,
      //   strength: 7,
      //   defense: 6,
      //   agility: 10,
      //   attacks: JSON.stringify([
      //     {
      //       name: 'Snowball Steal',
      //       description: 'Attempts to steal a small item (non-functional).',
      //     },
      //     { name: 'Frost Claw', description: 'Light physical damage.' },
      //     { name: 'Chill Cloud', description: 'Air-elemental attack.' },
      //   ]),
      //   flavorText: 'A sneaky imp who loves the cold and causing trouble.',
      // },
      // {
      //   name: 'Jelly Snowman',
      //   hp: 18,
      //   strength: 8,
      //   defense: 8,
      //   agility: 7,
      //   attacks: JSON.stringify([
      //     { name: 'Snow Jelly Toss', description: 'Light physical damage.' },
      //     { name: 'Icy Bomb', description: 'Moderate physical attack.' },
      //     {
      //       name: 'Snow Shield',
      //       description: 'Increases its defense temporarily.',
      //     },
      //   ]),
      //   flavorText: 'A jelly-like snowman that loves the frosty weather.',
      // },
      // {
      //   name: 'Snow Cave Guardian',
      //   hp: 25,
      //   strength: 12,
      //   defense: 10,
      //   agility: 7,
      //   attacks: JSON.stringify([
      //     { name: 'Icy Smash', description: 'Moderate physical damage.' },
      //     { name: 'Snow Rock Toss', description: 'Light physical damage.' },
      //     { name: 'Avalanche', description: 'Heavy earth-elemental attack.' },
      //   ]),
      //   flavorText: 'A protector of the frozen caves.',
      // },
      // {
      //   name: 'Slime Yeti',
      //   hp: 22,
      //   strength: 9,
      //   defense: 8,
      //   agility: 6,
      //   attacks: JSON.stringify([
      //     { name: 'Icy Slime Spray', description: 'Weak physical attack.' },
      //     { name: 'Frozen Ooze', description: "Reduces opponent's agility." },
      //     { name: 'Sticky Snowball', description: 'Slows down the enemy.' },
      //   ]),
      //   flavorText: 'A slimy yeti with a frosty exterior.',
      // },
      // {
      //   name: 'Blazing Meerca',
      //   hp: 18,
      //   strength: 9,
      //   defense: 7,
      //   agility: 8,
      //   attacks: JSON.stringify([
      //     { name: 'Fireball', description: 'Light fire-elemental attack.' },
      //     { name: 'Flame Tail Whip', description: 'Physical damage.' },
      //     {
      //       name: 'Flame Barrier',
      //       description: 'Reduces incoming damage temporarily.',
      //     },
      //   ]),
      //   flavorText: 'A fiery creature with a burning tail.',
      // },
    ])
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('WinterMonsters')
  },
}
