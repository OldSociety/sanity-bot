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
   git clone https://github.com/OldSociety/sanity-bot.git
   cd sanity-bot
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

Here’s an **Achievements** section you can add to your `README.md` file, explaining the functionality and usage of the achievement commands.

---

## Achievements

This bot allows for the management of user achievements. Admins can create new achievements, award them to users, and view a list of all available achievements or the specific achievements earned by users. The achievement system also automatically rewards users with fate points when they are awarded an achievement.

### Commands

#### `/achievement create`
- **Description**: Creates a new achievement that can be awarded to users.
- **Usage**: `/achievement create name:<name> description:<description> secret:<true/false>`
  - **name**: The name of the achievement (e.g., "Dragon Slayer").
  - **description**: A description of the achievement (e.g., "Awarded for slaying a mighty dragon").
  - **secret**: Boolean value indicating if the achievement is secret (Secret achievements give 20 fate points; non-secret ones give 10 fate points).

##### Example:
```
/achievement create name:"Dragon Slayer" description:"Awarded for slaying a mighty dragon" secret:false
```

#### `/achievement award`
- **Description**: Awards an achievement to a user and automatically grants them fate points.
- **Usage**: `/achievement award user:<@user> achievement:<achievement_name>`
  - **user**: The user to whom you want to award the achievement.
  - **achievement**: The name of the achievement to award.

##### Example:
```
/achievement award user:@JohnDoe achievement:"Dragon Slayer"
```
- This will award the "Dragon Slayer" achievement to JohnDoe, along with the respective fate points (20 if the achievement is secret, 10 if it's not).

#### `/achievement view`
- **Description**: View a list of all achievements or the achievements earned by a specific user.
- **Usage**: 
  - To view all achievements: `/achievement view`
  - To view a user’s earned achievements: `/achievement view user:<@user>`
  
##### Example:
```
/achievement view user:@JohnDoe
```
- This will show all achievements that JohnDoe has earned.

### Fate Points System
- When an achievement is awarded, the user automatically earns fate points.
  - **Secret Achievements**: 20 fate points.
  - **Non-Secret Achievements**: 10 fate points.
  
These fate points are stored and can be used for additional in-game mechanics (such as fate rolls).

### Database Models
- **Achievement**: Stores the list of available achievements with attributes such as name, description, and whether the achievement is secret.
- **UserAchievement**: Junction table that tracks which achievements have been awarded to which users.
- **User**: Stores user-specific data, including their earned fate points and the achievements they have received.


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

