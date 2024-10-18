Sure! Here's the updated install instructions for your `README.md`:

---

# Roll For Sanity Bot

**Roll For Sanity** is a Discord bot designed to enhance server engagement through a leveling system, achievements, and role-based rewards. Built using `discord.js`, this bot provides a robust platform for tracking user interactions, managing achievements, and maintaining user balances of fate points, allowing for a dynamic and interactive community experience.

## Features

- **Fate Points System**: Track, add, and manage fate points for server users. Admins can also modify user balances.
- **Leveling System**: Engage users through conversation tracking and reward them based on their activity.
- **Achievements**: Award custom achievements to users and track progress in an integrated SQLite database (to be implemented).
- **Server Information**: Easily display details about the server.
- **User Profiles**: View individual user data, including fate points, achievements, and join date.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/OldSociety/sanity-bot.git
cd sanity-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

In the root of your project, create a `.env` file and add the following variables:

```env
TOKEN=your-discord-bot-token
HELLBOUNDCHANNELID=channel-id-for-commands
BOTTESTCHANNELID=channel-id-for-testing
ADMINROLEID=your-admin-role-id
BOOSTERROLEID=your-booster-role-id
UNWANTEDROLEID=role-id-for-banned-users
GUILDID=your-discord-guild-id
DATABASE_URL=sqlite://dev.sqlite # SQLite file for development
```

#### Optional: Create `.env.development` or `.env.production`

For specific environments create `.env.development` or `.env.production` files with the corresponding environment-specific configurations.

### 4. Running Migrations

```bash
npx sequelize-cli db:migrate --env development
```

### 5. Deploy Commands

```bash
node deploy-commands.js
```

### 6. Run the Bot

For development:

```bash
npm run start:dev
```

For production:

```bash
npm run start:prod
```

## Usage

The bot includes several commands for both users and admins to manage their experience on the server.

### Commands Overview

#### **Fate Points Management**: `/fate`
- Fate points are a currency for the Meridian Campaign setting and are used as a replacement for 5e's Heroic inspiration. 

| Subcommand    | Description                                                | Permissions Required  |
| ------------- | ---------------------------------------------------------- | --------------------- |
| `add-fate`    | Adds fate points to yourself.                              | User                  |
| `reroll`        | Deducts 10 fate points or bank points automatically.       | User                  |
| `balance`     | Shows your current fate points and bank balance.           | User                  |
| `manage`      | Admins can manage the fate points or bank of any user.     | Admin Role            |

- Fate points cap at 100 per user. Excess points can be added to the bank for users with Booster or Admin roles.
- Rolling fate deducts points from the bank first, then from fate points if the bank is insufficient.

#### **Server Information**: `/server`

Displays server statistics, such as:
- Server name
- Total number of members

#### **User Information**: `/user`

Provides information about the user executing the command:
- Username of the user
- The date the user joined the server

---

## Halloween Event Commands

The Spooky event introduces fun interactions with tricks, treats, and curses! Below are the commands and their effects:

### **Command Overview**

| Command           | Description                                     | Notes                                                   |
|-------------------|-------------------------------------------------|---------------------------------------------------------|
| `/spooky register` | Registers for the Spooky event.                 | Grants 3 starting treats.                               |
| `/spooky status`   | Check your treat balance and rank.              | Shows your current treats and event rank.               |
| `/spooky treat`    | Gift a treat to a random user.                  | See "Treat Effects" below for more details.             |
| `/spooky trick`    | Use a treat to perform a trick on a random user.| See "Trick Effects" below for more details.             |

### **Treat Effects**

| Effect                           | Description                                                      | Chance   |
|-----------------------------------|------------------------------------------------------------------|----------|
| **Standard Treat**                | Sends a treat message with no special effects.                   | 45%      |
| **Sweet Tooth Role**              | Recipient earns the **Sweet Tooth** title.                       | 5%       |
| **Multi-Gift**                    | Recipient receives 2 treats instead of 1.                        | 10%      |
| **Temporary Immunity**            | Grants 1 hour of immunity from tricks to the giver.              | 10%      |
| **Break a Curse**                 | Removes the **Cursed** role from a random cursed user. Costs 3 treats. | 5%       |
| **Treat is Lost**                 | The treat is lost during gifting.                                | 25%      |

> **Note**: If no cursed users are found, another effect will occur.

### **Trick Effects**

| Effect                           | Description                                                      | Chance   |
|-----------------------------------|------------------------------------------------------------------|----------|
| **Steal a Treat**                 | Steal 1 treat from the target.                                   | 40%      |
| **Great Heist**                   | Steal up to 3 treats from random users.                          | 10%      |
| **Reverse Nickname**              | Reverse the target’s nickname.                                   | 10%      |
| **Curse Target**                  | Apply the **Cursed** role to the target.                         | 10%      |
| **Curse Backfires**               | The curse backfires, and you are cursed instead.                 | 5%       |
| **Caught! No Effect**             | You’re caught, and no trick occurs. (You still lose 1 treat)     | 25%      |

---

## Development Workflow

### Using `.env` Files for Different Environments

- **Development**: Ensure your `.env` (or `.env.development`) is set with the right variables for local development.
- **Production**: Use `.env.production` for production-specific variables and configurations.

You can switch between development and production environments using the commands:

- For development: `npm run start:dev`
- For production: `npm run start:prod`

This setup ensures that the bot uses the correct environment variables based on the environment it's running in.

### Database Configuration

The bot uses SQLite for local development and a different database (if needed) in production. The Sequelize configuration reads from environment variables, so make sure `DATABASE_URL` is correctly set.