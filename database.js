import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'bot.json');

function loadDb() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    writeFileSync(DB_FILE, JSON.stringify({ users: {}, transactions: [], game_history: [], prisoners: {} }, null, 2));
  }
  const db = JSON.parse(readFileSync(DB_FILE, 'utf-8'));
  if (!db.prisoners) db.prisoners = {};
  if (!db.whitelist) db.whitelist = ['1195827812565798953'];
  return db;
}

function saveDb(db) {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function userKey(userId, guildId) {
  return `${userId}:${guildId}`;
}

function initDatabase() {
  loadDb();
  console.log('✅ قاعدة البيانات جاهزة (JSON)');
}

function getUser(userId, guildId) {
  const db = loadDb();
  return db.users[userKey(userId, guildId)] || null;
}

function ensureUser(userId, guildId, username) {
  const db = loadDb();
  const key = userKey(userId, guildId);
  if (!db.users[key]) {
    db.users[key] = {
      user_id: userId,
      guild_id: guildId,
      username: username || 'Unknown',
      points: 100,
      wins: 0,
      losses: 0,
      games_played: 0,
      daily_claimed: 0,
      last_daily: null,
      created_at: new Date().toISOString(),
    };
  } else if (username && db.users[key].username !== username) {
    db.users[key].username = username;
  }
  saveDb(db);
  return db.users[key];
}

function addPoints(userId, guildId, amount, reason = '') {
  const db = loadDb();
  const key = userKey(userId, guildId);
  if (!db.users[key]) ensureUser(userId, guildId, null);
  const freshDb = loadDb();
  freshDb.users[key].points = (freshDb.users[key].points || 0) + amount;
  freshDb.transactions.push({
    user_id: userId,
    guild_id: guildId,
    amount,
    reason,
    created_at: new Date().toISOString(),
  });
  if (freshDb.transactions.length > 1000) freshDb.transactions = freshDb.transactions.slice(-1000);
  saveDb(freshDb);
  return freshDb.users[key];
}

function setPoints(userId, guildId, amount) {
  const db = loadDb();
  const key = userKey(userId, guildId);
  if (!db.users[key]) ensureUser(userId, guildId, null);
  const freshDb = loadDb();
  freshDb.users[key].points = amount;
  saveDb(freshDb);
  return freshDb.users[key];
}

function recordGameResult(userId, guildId, game, result, pointsChange) {
  const db = loadDb();
  const key = userKey(userId, guildId);
  if (!db.users[key]) ensureUser(userId, guildId, null);
  const freshDb = loadDb();
  if (result === 'win') freshDb.users[key].wins = (freshDb.users[key].wins || 0) + 1;
  else if (result === 'loss') freshDb.users[key].losses = (freshDb.users[key].losses || 0) + 1;
  freshDb.users[key].games_played = (freshDb.users[key].games_played || 0) + 1;
  freshDb.game_history.push({
    user_id: userId,
    guild_id: guildId,
    game,
    result,
    points_change: pointsChange,
    created_at: new Date().toISOString(),
  });
  if (freshDb.game_history.length > 2000) freshDb.game_history = freshDb.game_history.slice(-2000);
  saveDb(freshDb);
  if (pointsChange !== 0) addPoints(userId, guildId, pointsChange, `${game} - ${result}`);
}

function getLeaderboard(guildId, limit = 10) {
  const db = loadDb();
  return Object.values(db.users).filter(u => u.guild_id === guildId).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, limit);
}

function getTopWins(guildId, limit = 10) {
  const db = loadDb();
  return Object.values(db.users).filter(u => u.guild_id === guildId).sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, limit);
}

function getUserRank(userId, guildId) {
  const db = loadDb();
  const allUsers = Object.values(db.users).filter(u => u.guild_id === guildId).sort((a, b) => (b.points || 0) - (a.points || 0));
  return allUsers.findIndex(u => u.user_id === userId) + 1;
}

function getUserGameHistory(userId, guildId, limit = 5) {
  const db = loadDb();
  return db.game_history.filter(h => h.user_id === userId && h.guild_id === guildId).slice(-limit).reverse();
}

function updateUserField(userId, guildId, fields) {
  const db = loadDb();
  const key = userKey(userId, guildId);
  if (!db.users[key]) ensureUser(userId, guildId, null);
  const freshDb = loadDb();
  Object.assign(freshDb.users[key], fields);
  saveDb(freshDb);
  return freshDb.users[key];
}

function savePrisoner(userId, guildId, roles) {
  const db = loadDb();
  db.prisoners[userKey(userId, guildId)] = {
    user_id: userId,
    guild_id: guildId,
    roles,
    jailed_at: new Date().toISOString(),
  };
  saveDb(db);
}

function getPrisoner(userId, guildId) {
  const db = loadDb();
  return db.prisoners[userKey(userId, guildId)] || null;
}

function removePrisoner(userId, guildId) {
  const db = loadDb();
  delete db.prisoners[userKey(userId, guildId)];
  saveDb(db);
}

export {
  loadDb, saveDb, userKey, initDatabase, getUser, ensureUser, addPoints, setPoints,
  recordGameResult, getLeaderboard, getTopWins, getUserRank, getUserGameHistory,
  updateUserField, savePrisoner, getPrisoner, removePrisoner,
};
