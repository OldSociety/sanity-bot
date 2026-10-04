// utils/haikuDetector.js

const customSyllables = {
  daggerheart: 3,
  pathos: 2,
  rajarasna: 4,
}

function cleanWord(word) {
  return word
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^[^a-z']+|[^a-z']+$/g, '')
}

function cleanMessage(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<@!?\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

let syllableFunction

async function loadSyllable() {
  if (!syllableFunction) {
    const module = await import('syllable')
    syllableFunction = module.syllable
  }

  return syllableFunction
}

async function countWordSyllables(word) {
  const cleaned = cleanWord(word)

  if (!cleaned) return 0

  if (customSyllables[cleaned] !== undefined) {
    return customSyllables[cleaned]
  }

  const syllable = await loadSyllable()
  return syllable(cleaned)
}

async function detectHaiku(content) {
  const cleanedMessage = cleanMessage(content)

  if (!cleanedMessage) return null

  const words = cleanedMessage.split(' ').filter(Boolean)
  const targets = [5, 7, 5]

  const lines = []
  let currentLine = []
  let currentSyllables = 0
  let targetIndex = 0

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const wordSyllables = await countWordSyllables(word)

    if (wordSyllables <= 0) return null

    currentLine.push(word)
    currentSyllables += wordSyllables

    if (currentSyllables > targets[targetIndex]) {
      return null
    }

    if (currentSyllables === targets[targetIndex]) {
      lines.push(currentLine.join(' '))

      currentLine = []
      currentSyllables = 0
      targetIndex += 1

      if (targetIndex === targets.length) {
        const isFinalWord = i === words.length - 1

        return isFinalWord ? lines : null
      }
    }
  }

  return null
}

module.exports = {
  detectHaiku,
  countWordSyllables,
}