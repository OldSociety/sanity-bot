const { escapeMarkdown } = require('discord.js')
// Names are untrusted text, not bot-authored Markdown or mention syntax.
function safeName(value) {
  return escapeMarkdown(String(value || 'a player').replace(/[@<>]/g, '').replace(/[\r\n]/g, ' ').slice(0, 80),
    { maskedLink: true, heading: true, bulletedList: true, numberedList: true })
}
module.exports = { safeName }
