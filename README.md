Thank you for providing the additional code features. Here's an updated version of the README in proper Markdown format, including the newly provided code snippets:

```md
# Roll For Sanity Bot

**Roll For Sanity** is a Discord bot designed to enhance server engagement through a leveling system, achievements, and role-based rewards. Built using `discord.js`, this bot provides a robust platform for tracking user interactions, managing achievements, and maintaining user balances of fate points, allowing for a dynamic and interactive community experience.

## Features

- **Fate Points System**: Track, add, and manage fate points for server users. Admins can also modify user balances.
- **Leveling System**: Engage users through conversation tracking and reward them based on their activity.
- **Achievements**: Award custom achievements to users and track progress in an integrated SQLite database (to be implemented).
- **Server Information**: Easily display details about the server.
- **User Profiles**: View individual user data, including fate points, achievements, and join date.

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/roll-for-sanity-bot.git
   cd roll-for-sanity-bot
   ```

2. Install the required dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add the following environment variables:
   ```env
   TOKEN=your-discord-bot-token
   HELLBOUNDCHANNELID=channel-id-for-commands
   BOTTESTCHANNELID=channel-id-for-testing
   ADMINROLEID=your-admin-role-id
   BOOSTERROLEID=your-booster-role-id
   UNWANTEDROLEID=role-id-for-banned-users
   GUILDID=your-discord-guild-id
   ```

4. Run the bot:
   ```bash
   node index.js
   ```

## Usage

The bot includes several commands for both users and admins to manage their experience on the server.

### Commands Overview

#### **Fate Points Management**: `/fate`

| Subcommand    | Description                                                | Permissions Required  |
| ------------- | ---------------------------------------------------------- | --------------------- |
| `add-fate`    | Adds fate points to yourself.                              | User                  |
| `roll`        | Deducts 10 fate points or bank points automatically.       | User                  |
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

### Command Usage Examples

1. **Adding Fate Points**:
   ```bash
   /fate add-fate points:10
   ```
   Adds 10 fate points to the user.

2. **Rolling Fate**:
   ```bash
   /fate roll
   ```
   Deducts 10 fate points from the user's fate or bank balance.

3. **Checking Fate Balance**:
   ```bash
   /fate balance
   ```
   Displays the user’s current fate points and bank balance.

4. **Managing Fate Points as an Admin**:
   ```bash
   /fate manage user:@username action:set-fate amount:50
   ```
   Sets the fate points for a specified user.

## Handlers

### **Message Handler**

The message handler tracks user activity and awards experience points (XP) based on participation. It features the following logic:

- **XP and Level System**: Tracks user messages, awarding XP on each valid message. Users gain levels once they reach the required XP threshold.
- **Cooldown Mechanism**: Ensures that XP is only awarded once per minute to prevent spam.
- **Level-Up Logic**: Notifies users when they level up. If a user belongs to certain roles, they may also gain fate points upon leveling.
- **Edge Case Handling**: Ignores messages from bots, DMs, commands, and bot mentions to maintain system integrity.

---

### **Booster Handler**

The booster handler is responsible for giving users with the Booster role additional benefits:

- **Role Detection**: Automatically detects when a user gains the Booster role and sends them a welcome message.
- **Daily Fate Points**: Boosters receive 1 extra fate point daily, with a cap on how many points can be stored in their bank.
- **Scheduled Task**: Uses `cron` to schedule the daily update for boosting users, ensuring fate points are awarded consistently.
- **Bank Management**: Excess fate points are deposited into a bank, with a system in place to cap the total fate points and notify users when their bank reaches the limit.

---

## Development

### Setting up SQLite

Ensure you have SQLite set up correctly for local development.

1. Initialize the database schema by running:
   ```bash
   sqlite3 database.db < schema.sql
   ```

2. Schema includes the following tables:
   - **Users**: Tracks user data including fate points, bank balance, chat experience, and levels.

### Planned Features
- **Achievements System**: Work-in-progress for creating, managing, and awarding achievements to users.
- **Auto-Roles**: Automated role management based on user activity and achievement unlocks.
- **Detailed Logging**: Improved logging and analytics for monitoring bot activity.

## Contributing

We welcome contributions! Please create a fork of this repository, make your changes in a new branch, and submit a pull request with a detailed description of your changes.

1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature-branch-name
   ```
3. Make your changes and commit them:
   ```bash
   git commit -m "Describe your changes here"
   ```
4. Push your branch and open a pull request.

