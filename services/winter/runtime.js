const {
  withBotTests
} = require('../command-channels');
const {
  commandEnabled
} = require('../command-environment');
const {
  disabledMessage
} = require('../disabled-commands');
const {
  createEconomy
} = require('./economy');
const {
  screen
} = require('./presentation');
const {
  adminMember
} = require('../member-policy');
const {
  IDS
} = require('./recipes');
const slotsRules = require('./slots');
const {
  createLive,
  keyFor
} = require('./live');
function restriction(interaction, environment = process.env.NODE_ENV, now = Date.now()) {
  if (!['development', 'production'].includes(environment) || !process.env.GUILDID || interaction.guildId !== process.env.GUILDID) return 'Snow is available only in the configured server.';
  if (disabledMessage('snow') || !commandEnabled({
    name: 'snow',
    environments: ['development', 'production'],
    eventKey: environment === 'production' ? 'winter' : undefined
  }, environment, now)) return 'Winter Wars is not currently open.';
  const channels = withBotTests([process.env.WINTERCHANNELID, process.env.BOTTESTCHANNELID], {
    guildId: interaction.guildId,
    environment
  });
  if (!channels.includes(interaction.channelId)) return `Use /snow in ${channels.map(id => `<#${id}>`).join(' or ')}.`;
  if (interaction.user.bot) return 'Bots cannot participate in Winter Wars.';
  return null;
}

// Lazily open only the existing environment-selected database after eligibility.
let economy;
function selected() {
  if (!economy) {
    const window = require('../../config/commands/event-commands.json').winter;
    economy = createEconomy({
      sequelize: require('../../config/database/sequelize'),
      allowRestart: process.env.NODE_ENV === 'development',
      ...(process.env.NODE_ENV === 'production' ? {
        startsAt: Date.parse(window.startsAt),
        endsAt: Date.parse(window.endsAt)
      } : {})
    });
  }
  return economy;
}
function createHandler({
  getEconomy = selected,
  authorize = restriction,
  environment = () => process.env.NODE_ENV
} = {}) {
  const live = createLive({
    getEconomy,
    render: screen,
    canRun: () => ['development', 'production'].includes(environment()) && !disabledMessage('snow') && commandEnabled({
      name: 'snow',
      environments: ['development', 'production'],
      eventKey: environment() === 'production' ? 'winter' : undefined
    }, environment())
  });
  const handle = async function handle(interaction) {
    const deny = content => interaction.reply({
      content,
      ephemeral: true,
      allowedMentions: {
        parse: []
      }
    });
    const blocked = authorize(interaction);
    if (blocked) return deny(blocked);
    const isButton = interaction.isButton?.() === true;
    let action, quantity;
    if (isButton) {
      const parts = interaction.customId.split(':');
      if (parts[0] !== 'snow' || parts[1] !== interaction.user.id || parts.length < 3 || parts.length > 4) return deny('These winter controls belong to another player or are invalid. Open /snow status.');
      [,, action, quantity] = parts;
    } else action = interaction.options.getSubcommand();
    const adminAction = ['admin', 'grant-sweat', 'grant-snow', 'grant-ammo'].includes(action);
    const isAdmin = Boolean(adminMember(interaction.member) || interaction.memberPermissions?.has?.('Administrator'));
    if (adminAction && (environment() !== 'development' || !isAdmin)) return deny('Development administrators only.');
    if (['test-kill', 'test-sturdy', 'test-strength'].includes(action) && environment() !== 'development') return deny('Development testing only.');
    if (action?.startsWith('restart') && (environment() !== 'development' || !isButton)) return deny('Restart is available only through development testing controls.');
    if (action === 'test-kill' && (environment() !== 'development' || !isButton)) return deny('This testing control is available only in development.');
    const battleAction = ['battle-opponent', 'battle-start', 'battle-special', 'battle-dirty', 'battle-pause'].includes(action);
    const specialty = ['battle-special', 'battle-dirty'].includes(action);
    const view = action==='opponents' ? 'throw' : adminAction ? 'admin' : action === 'iron' ? 'shop' : ['shovel', 'snowballs'].includes(action) ? 'status' : ['snow-spin', 'snow-slots'].includes(action) ? 'snow-slots' : ['buy-outfit', 'buy-mittens', 'buy-fire-flower'].includes(action) ? 'emporium' : ['test-sturdy','test-strength'].includes(action) ? 'fight' : ['slots-bet', 'slots-spin', 'slots-collect'].includes(action) ? 'slots' : battleAction ? 'fight' : ['train', 'train-strength', 'train-accuracy', 'train-defense', 'train-attack', 'train-dodge', 'train-speed', 'train-special', 'train-select', 'lift20', 'lift'].includes(action) ? 'train' : ['opponent-hendrix', 'opponent-requia'].includes(action) ? 'throw' : ['kitchen', 'pepper', 'mix', 'ingredient', 'recipe-cancel'].includes(action) ? 'kitchen' : action === 'beg' ? 'diamonds' : ['buy-rock', 'shop-help', 'buy-snowman', 'buy-sturdy', 'buy-spicy', 'buy-old-stone', 'buy-recipe'].includes(action) ? 'shop' : action?.startsWith('upgrade-') ? 'shovel' : ['attack', 'attack-spicy', 'craft', 'test-kill'].includes(action) ? 'throw' : action === 'restart-cancel' || action === 'restart-confirm' ? 'status' : action;
    if (action === 'ingredient' && !IDS.includes(quantity)) return deny('Invalid recipe ingredient. Open /snow kitchen.');
    if (action === 'slots-bet' && !slotsRules.STAKES.map(String).includes(quantity)) return deny('Invalid slots stake.');
    if (['slots-spin', 'slots-collect'].includes(action) && !slotsRules.validControl(quantity)) return deny('These slots controls expired. Open /snow slots.');
    if (battleAction && (!isButton || !(action==='battle-opponent' ? /^snowman-[1-9]\d*\.[a-f0-9-]{36}$/ : /^[a-f0-9-]{36}$/).test(quantity || ''))) return deny('These fight controls expired. Open /snow throw.');
    if (!['admin', 'snow-slots', 'emporium', 'slots', 'status', 'snowballs', 'diamonds', 'shop', 'shovel', 'help', 'throw', 'restart', 'kitchen', 'fight', 'train', 'hidden'].includes(view) || quantity !== undefined && (action === 'battle-opponent' ? !/^snowman-[1-9]\d*\.[a-f0-9-]{36}$/.test(quantity) : action === 'train-select' ? !['strength', 'accuracy', 'dodge', 'special', 'speed'].includes(quantity) : action.startsWith('train-') ? !['1', '10', 'max'].includes(quantity) : action === 'snow-spin' ? !['1', '10'].includes(quantity) : action === 'slots-bet' ? !slotsRules.STAKES.map(String).includes(quantity) : ['slots-spin', 'slots-collect'].includes(action) ? !slotsRules.validControl(quantity) : action === 'ingredient' ? !IDS.includes(quantity) : battleAction || action === 'restart-confirm' ? !/^[a-f0-9-]{36}$/.test(quantity) : action === 'buy-spicy' ? !['1', '10', '100', 'max'].includes(quantity) : !['snowballs', 'diamonds', 'craft'].includes(action) || !['1', '10', '100', 'max'].includes(quantity))) return deny('Invalid winter control. Open /snow status.');
    const key = keyFor(interaction.guildId, interaction.user.id);
    // Specialty inputs must not queue a second spend. Other inputs acknowledge
    // immediately and wait in order instead of failing during a Discord edit.
    let release = specialty ? live.claim(key) : null;
    if (specialty && !release) return deny('Your previous action is still processing. Please wait a moment.');
    try {
      if (isButton) await interaction.deferUpdate();else await interaction.deferReply({
        ephemeral: true
      });
      if (!release) release = await live.acquire(key);
      if (specialty) await live.lockCurrent(key);
      const receipt = await getEconomy().execute({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        interactionId: interaction.id,
        action,
        quantity,
        admin: isAdmin
      });
      return await live.show(interaction, receipt, receipt.view || view, environment() === 'development');
    } catch (error) {
      console.error('Winter interaction unavailable:', error.message);
      // A Discord delivery error may follow a committed transaction. Never retry
      // an economy mutation to repair delivery; the same interaction is deduped.
      return interaction.editReply({
        content: action?.startsWith('slots') ? 'Slots could not display this request. Use /snow slots to reopen your saved game before placing another stake.' : 'Snow could not finish this request. Use /snow status to check your saved balances before another purchase.',
        embeds: [],
        components: [],
        allowedMentions: {
          parse: []
        }
      });
    } finally {
      release?.();
    }
  };
  handle.live = live;
  return handle;
}
const handle = createHandler();
function startMaintenance(client) {
  handle.live.start();
  client.once?.('invalidated', () => handle.live.stop());
}
module.exports = {
  handle,
  createHandler,
  restriction,
  startMaintenance
};
