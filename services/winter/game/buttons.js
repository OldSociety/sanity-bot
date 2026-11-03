const { randomBytes } = require('node:crypto');

// One private screen per player, across channels and diagnostic runs. Tokens
// live only for this process: a restart expires all previously issued buttons.
function createControls({ clock = Date.now, ttl = 10 * 60 * 1000 } = {}) {
  const screens = new Map();
  const key = (i) => `${i.guildId}:${i.user.id}`;
  async function close(entry) {
    if (!entry) return;
    try {
      await entry.interaction.deleteReply();
    } catch {
      try {
        await entry.interaction.editReply({ components: [] });
      } catch {
        /* Expired Discord token/message. */
      }
    }
  }
  function accepts(i) {
    const entry = screens.get(key(i));
    return Boolean(
      entry &&
        entry.expires > clock() &&
        entry.ids.has(i.customId) &&
        (!entry.messageId || entry.messageId === i.message?.id)
    );
  }
  function isCurrentMessage(i) {
    const entry = screens.get(key(i));
    return Boolean(entry && entry.messageId && entry.messageId === i.message?.id);
  }
  async function retire(i, replacing = false) {
    const entry = screens.get(key(i));
    screens.delete(key(i));
    // A button updates its existing message; a new command closes the old one.
    if (replacing) await close(entry);
  }
  function decorate(output, token = randomBytes(6).toString('base64url')) {
    const ids = new Set();
    for (const row of output.components || [])
      for (const button of row.components) {
        const id = `${button.data.custom_id}:${token}`;
        button.setCustomId(id);
        if (!button.data.disabled) ids.add(id);
      }
    return ids;
  }
  function remember(i, result, ids, { fight = false, run = 'normal' } = {}) {
    if (ids.size)
      screens.set(key(i), {
        key: key(i),
        interaction: i,
        messageId: result?.id || i.message?.id,
        ids,
        token: [...ids][0].split(':').at(-1),
        fight,
        run,
        lastCaptureAt: clock(),
        expires: clock() + (fight ? 5 * 60 * 1000 : ttl)
      });
  }
  async function expire() {
    for (const [id, entry] of screens)
      if (entry.expires <= clock()) {
        screens.delete(id);
        if (entry.fight) {
          try {
            await entry.interaction.editReply({
              content:
                "Don't worry, your fight continues even when you're offline. Check in soon with `/snow throw` at any time.",
              embeds: [],
              components: [],
              attachments: []
            });
          } catch {
            /* Token expired. */
          }
        } else await close(entry);
      }
  }
  const current = (entry) => screens.get(entry.key) === entry;
  const live = () =>
    [...screens.values()].filter(
      (entry) => entry.fight && entry.expires > clock() && clock() - entry.lastCaptureAt >= 3000
    );
  // Keep the three-second schedule anchored to its original slots. Starting
  // the next interval after Discord finishes editing skips the following tick.
  const capturing = (entry) => {
    if (current(entry))
      entry.lastCaptureAt += Math.floor(Math.max(0, clock() - entry.lastCaptureAt) / 3000) * 3000;
  };
  const updated = (entry, ids, fight) => {
    if (current(entry)) {
      entry.ids = ids;
      entry.fight = fight;
    }
  };
  return {
    accepts,
    isCurrentMessage,
    retire,
    decorate,
    remember,
    expire,
    current,
    live,
    capturing,
    updated
  };
}
module.exports = { createControls };
