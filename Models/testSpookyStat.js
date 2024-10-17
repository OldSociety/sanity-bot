// Example test script: ./testSpookyStat.js
const { User, SpookyStat } = require('./model');

(async () => {
  // Replace 'some-user-id' with an actual user ID from your Users table
  const user = await User.findOne({ where: { user_id: 'some-user-id' }, include: 'spookyStat' });
  console.log(user.spookyStat);
})();