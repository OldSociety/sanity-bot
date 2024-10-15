// ./handlers/dailyTreats.js
const { SpookyStat } = require('../Models/model');

async function awardDailyTreats(guild) {
  try {
    console.log('🎃 Running daily treat award...');

    const sweetToothRoleId = process.env.SWEETTOOTHROLEID;

    // Get all users with spooky stats
    const spookyStats = await SpookyStat.findAll();

    for (const stat of spookyStats) {
      const member = await guild.members.fetch(stat.userId).catch(() => null);

      if (member) {
        const treatBonus = member.roles.cache.has(sweetToothRoleId) ? 2 : 1;
        stat.treats += treatBonus;
        await stat.save();

        console.log(
          `🎁 Awarded ${treatBonus} treat(s) to ${member.user.username}. Total: ${stat.treats}`
        );
      } else {
        console.log(`⚠️ User with ID ${stat.userId} not found in guild.`);
      }
    }

    console.log('✅ Daily treat award completed.');
  } catch (error) {
    console.error('❌ Error awarding daily treats:', error);
  }
}

module.exports = { awardDailyTreats };
