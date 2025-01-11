'use strict'

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert('BaseItems', [
      {
        name: 'Magic Snowball',
        type: 'consumable',
        damageMin: 4,
        damageMax: 5,
        damageType: 'cold',
        damage2Min: 0,
        damage2Max: 0,
        damageType2: null,
        defense: JSON.stringify([
          {
            physical: 0,
            acid: 0,
            cold: 0,
            fire: 0,
            lightning: 0,
            necrotic: 0,
            radiant: 0,
            thunder: 0,
          },
        ]),
        healing: 0,
        durability: 1, //in turns, null for permanent weapons and shields
        effects: JSON.stringify([
          {
            type: 'freeze', //freeze, sap...
            chance: 0.1,
            stat: null, // none,hp, str, def, agi
            value: 0,
            duration: 1, //in turns, 0 means entire battle
          },
        ]),
        description: 'A basic snowball, perfect for beginners.',
      },
      {
        name: 'Basic Shield',
        type: 'defense',
        damageMin: 0,
        damageMax: 0,
        damageType: null,
        damage2Min: 0,
        damage2Max: 0,
        damageType2: null,
        defense: JSON.stringify([
          {
            physical: 1,
            acid: 0,
            cold: 0,
            fire: 0,
            lightning: 0,
            necrotic: 0,
            radiant: 0,
            thunder: 0,
          },
        ]),
        healing: 0,
        durability: 1, //in turns, null for permanent weapons and shields
        effects: JSON.stringify([
          {
            type: null, //freeze, sap...
            chance: null,
            stat: null, //hp, str, def, agi
            value: null,
            duration: null, //in turns, 0 means entire battle
          },
        ]),
        description: 'Practically useless.',
      },
      // {
      //   name: 'Blizzard Bomb',
      //   type: 'weapon',
      //   damageMin: 6,
      //   damageMax: 8,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: null,
      //   duration: null,
      //   description: 'Causes a mini-blizzard, dealing Ice damage.',
      // },
      // {
      //   name: 'Fireball Slingshot',
      //   type: 'weapon',
      //   damageMin: 6,
      //   damageMax: 10,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Fire',
      //   damageType2: null,
      //   duration: null,
      //   description: 'Shoots small fireballs that melt snow.',
      // },
      // {
      //   name: 'Acid Wand',
      //   type: 'weapon',
      //   damageMin: 7,
      //   damageMax: 12,
      //   damage2Min: 3,
      //   damage2Max: 6,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Acid',
      //   damageType2: 'Ice',
      //   duration: null,
      //   description: 'A wand that deals corrosive and icy damage.',
      // },
      // {
      //   name: 'Catapult',
      //   type: 'weapon',
      //   damageMin: 15,
      //   damageMax: 20,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Physical',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A large weapon that hurls icy boulders.',
      // },
      // {
      //   name: 'Big Boot',
      //   type: 'weapon',
      //   damageMin: 10,
      //   damageMax: 18,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Physical',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A boot filled with snow, swung for a big hit.',
      // },
      // {
      //   name: 'Avalanche Orb',
      //   type: 'weapon',
      //   damageMin: 8,
      //   damageMax: 14,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Earth',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A heavy snowball infused with avalanche power.',
      // },
      // {
      //   name: 'Magic Pebble',
      //   type: 'weapon',
      //   damageMin: 5,
      //   damageMax: 9,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Earth',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A pebble that packs a surprising punch.',
      // },
      // {
      //   name: 'Fire Wand',
      //   type: 'weapon',
      //   damageMin: 4,
      //   damageMax: 8,
      //   damage2Min: 4,
      //   damage2Max: 6,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Fire',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A wand that emits fiery blasts.',
      // },
      // {
      //   name: 'Ice Wand',
      //   type: 'weapon',
      //   damageMin: 8,
      //   damageMax: 12,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: null,
      //   duration: null,
      //   description: 'Summons a hailstorm to pummel enemies.',
      // },

      // // Defensive Items
      // {
      //   name: 'Woolen Mittens',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 2,
      //   healing: 0,
      //   damageType: null,
      //   damageType2: null,
      //   duration: null,
      //   description: 'Soft mittens that reduce minor attacks.',
      // },
      // {
      //   name: 'Puffy Coat',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 4,
      //   healing: 0,
      //   damageType: null,
      //   damageType2: null,
      //   duration: null,
      //   description:
      //     'A warm coat that provides light resistance to all damage types.',
      // },
      // {
      //   name: 'Ice Shield',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 6,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A shimmering shield that blocks icy attacks.',
      // },
      // {
      //   name: 'Dual Fans',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 5,
      //   healing: 0,
      //   damageType: 'Water',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A pair of fans to blow away water-based attacks.',
      // },
      // {
      //   name: 'Fire Fragment',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 7,
      //   healing: 0,
      //   damageType: 'Fire',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A chunk of magma, surprisingly sturdy.',
      // },
      // {
      //   name: 'Rain Jacket',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 8,
      //   healing: 0,
      //   damageType: 'Water',
      //   damageType2: null,
      //   duration: null,
      //   description: 'Protects against water-based attacks.',
      // },
      // {
      //   name: 'Earth Shield',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 4,
      //   healing: 0,
      //   damageType: 'Earth',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A shimmering flower barrier for light protection.',
      // },
      // {
      //   name: 'Magic Bubble',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 6,
      //   healing: 0,
      //   damageType: 'Acid',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A bubbling shield resistant to corrosion.',
      // },
      // {
      //   name: 'Blizzard Barrier',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 10,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: null,
      //   duration: null,
      //   description: 'A swirling shield of snow that blocks attacks.',
      // },
      // {
      //   name: 'Arctic Plate',
      //   type: 'defense',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 12,
      //   healing: 0,
      //   damageType: 'Physical',
      //   damageType2: null,
      //   duration: null,
      //   description: 'Heavy armor crafted from compacted ice.',
      // },

      // // Consumables
      // {
      //   name: 'Fireball',
      //   type: 'consumable',
      //   damageMin: 6,
      //   damageMax: 10,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Fire',
      //   damageType2: null,
      //   duration: 1,
      //   description: 'Simply burns enemies.',
      // },
      // {
      //   name: 'Healing Potion',
      //   type: 'consumable',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 15,
      //   damageType: null,
      //   damageType2: null,
      //   duration: 1,
      //   description: 'Restores 5 HP per turn for 3 turns.',
      // },
      // {
      //   name: 'Snowball',
      //   type: 'consumable',
      //   damageMin: 12,
      //   damageMax: 18,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: null,
      //   duration: 1,
      //   description: 'A snowy blast that chills on impact.',
      // },
      // {
      //   name: 'Acid Ball',
      //   type: 'consumable',
      //   damageMin: 10,
      //   damageMax: 15,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Acid',
      //   damageType2: null,
      //   duration: 1,
      //   description: 'A throwable ball of acid for heavy damage.',
      // },
      // {
      //   name: 'Snow Shield Potion',
      //   type: 'consumable',
      //   damageMin: 0,
      //   damageMax: 0,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 5,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: null,
      //   duration: 3,
      //   description: 'Grants 5 defense per turn for 3 turns.',
      // },
      // {
      //   name: 'Just a Rock',
      //   type: 'consumable',
      //   damageMin: 6,
      //   damageMax: 12,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Earth',
      //   damageType2: null,
      //   duration: 1,
      //   description: 'It’s just a rock, but it hits hard.',
      // },
      // {
      //   name: 'Exploding Snowball',
      //   type: 'consumable',
      //   damageMin: 8,
      //   damageMax: 12,
      //   damage2Min: 3,
      //   damage2Max: 5,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: 'Fire',
      //   duration: 1,
      //   description:
      //     'A volatile snowball that explodes with icy and fiery damage.',
      // },
      // {
      //   name: 'Handful of Rain',
      //   type: 'consumable',
      //   damageMin: 10,
      //   damageMax: 14,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Water',
      //   damageType2: null,
      //   duration: 1,
      //   description: 'A drenching attack to soak enemies.',
      // },
      // {
      //   name: 'Hailstone',
      //   type: 'consumable',
      //   damageMin: 4,
      //   damageMax: 10,
      //   damage2Min: 2,
      //   damage2Max: 4,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Ice',
      //   damageType2: 'Physical',
      //   duration: 1,
      //   description: 'A sharp hailstone that pierces enemies.',
      // },
      // {
      //   name: 'Firestarter Potion',
      //   type: 'consumable',
      //   damageMin: 6,
      //   damageMax: 8,
      //   damage2Min: 0,
      //   damage2Max: 0,
      //   defense: 0,
      //   healing: 0,
      //   damageType: 'Fire',
      //   damageType2: null,
      //   duration: 1,
      //   description: 'A flask that sets small fires to weaken enemies.',
      // },
    ])
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('BaseItems', null, {})
  },
}
