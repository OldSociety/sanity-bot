'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('WinterMonsters', [
      {
        name: 'Ugly Snowman',
        hp: 8,
        strength: 8,
        defense: 10,
        resistance: JSON.stringify([
          {
            physical: 0,
            acid: 0,
            cold: 100,
            fire: -5,
            lightning: 0,
            necrotic: 0,
            radiant: 0,
            thunder: 0,
          },
        ]),
        agility: 3,
        attacks: JSON.stringify([
          {
            name: 'Magic Snowball',
            description: 'Light cold damage with a small chance to freeze.',
            damageMin: 0.8,
            damageMax: 1.6,
            damageType: 'cold',
            priority: 1,
            effects: {
              type: 'freeze', //freeze, sap...
              chance: 0.1,
              stat: null, // none, hp, str, def, agi
              value: 0,
              duration: 1,//in turns, 0 means entire battle
            },
          },
        ]),
        flavorText: 'A mischievous goat that curses your name!',
        url: 'uglysnowman',
        loot: 'snowball',
        droprate: 0.9,
      },
      {
        name: 'Julbock, the Yule Goat',
        hp: 8,
        strength: 13,
        defense: 4,
        resistance: JSON.stringify([
          {
            physical: 0,
            acid: 0,
            cold: 0,
            fire: 5,
            lightning: 0,
            necrotic: 0,
            radiant: 0,
            thunder: 0,
          },
        ]),
        agility: 5,
        attacks: JSON.stringify([
          {
            name: 'Yule Ram',
            description: 'Light physical damage.',
            damageMin: 0.8,
            damageMax: 1.6,
            damageType: 'physical',
            priority: 1,
          },
          {
            name: 'Gentle Frostbite',
            description: 'A chilling attack that weakens your strength.',
            damageMin: 1.2,
            damageMax: 2.4,
            damageType: 'cold',
            priority: 2,
            effect: {
              type: "sap", //weaken stat
              chance: 0.15,
              stat: "agi",
              value: -2,
              duration: 3
            },
          },
        ]),
        flavorText: 'A mischievous goat that curses your name!',
        url: 'julbock',
      },
    ])
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('WinterMonsters')
  },
}
