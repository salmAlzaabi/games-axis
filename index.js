import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { Client, GatewayIntentBits, ActivityType, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits, ChannelType, REST, Routes, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType } from '@discordjs/voice';
import { setClient } from './dashboard.js';
import playdlPkg from 'play-dl';
const { search: playSearch } = playdlPkg;
let createCanvas, GlobalFonts, loadImage, GIFEncoder;
let canvasAvailable = false;
try {
  const canvasMod = await import('@napi-rs/canvas');
  createCanvas = canvasMod.createCanvas;
  GlobalFonts = canvasMod.GlobalFonts;
  loadImage = canvasMod.loadImage;
  const gifMod = await import('gif-encoder-2');
  GIFEncoder = gifMod.default;
  canvasAvailable = true;
  console.log('✅ Canvas modules loaded');
} catch (_canvasErr) {
  console.warn('⚠️ @napi-rs/canvas غير متاح في هذه البيئة — ميزات الصور معطّلة:', _canvasErr.message);
}
import { DISCORD_TOKEN, DISCORD_CLIENT_ID } from './config.js';

import ffmpegStaticPath from 'ffmpeg-static';
const FFMPEG_BIN = ffmpegStaticPath || 'ffmpeg';

// play-dl (مكتبة JS صرفة — بدون يحتاج أي برنامج خارجي، يتجنب مشكلة "Sign in to confirm")
async function createYTStream(videoUrl) {
  const streamInfo = await playdlPkg.stream(videoUrl, { discordPlayerCompatibility: true });
  return { stream: streamInfo.stream, type: streamInfo.type, ffProc: null };
}

const TOKEN = process.env.DISCORD_TOKEN || DISCORD_TOKEN;

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


const TICKET_TYPES = [
  { id: 'support',    label: 'مساعدة - Support',           emoji: '🆘', description: 'احصل على دعم من الفريق' },
  { id: 'report',     label: 'بلاغ - Report',              emoji: '🚨', description: 'أبلغ عن مشكلة أو شخص' },
  { id: 'shop',       label: 'شراء - Shop',                emoji: '🛒', description: 'اشترِ شيئاً من المتجر' },
  { id: 'createteam', label: 'إنشاء تيم - Create Team',    emoji: '👥', description: 'أنشئ تيماً جديداً' },
  { id: 'staffapp',   label: 'تقديم إدارة - Staff Application', emoji: '📝', description: 'قدّم طلب الانضمام للإدارة' },
  { id: 'rolerequest',label: 'طلب رول - Role Request',     emoji: '🎭', description: 'اطلب رتبة معينة' },
];

const TICKET_LABELS = {
  support: 'مساعدة', report: 'بلاغ', shop: 'شراء',
  createteam: 'إنشاء تيم', staffapp: 'تقديم إدارة', rolerequest: 'طلب رول',
};

// In-memory ticket channel tracking: channelId -> { openerID, type }
const openTickets = new Map();

// Music state: guildId -> { connection, player, streamProc, currentVideo, textChannel, loop, paused }
const musicState = new Map();

function safeDestroyMusic(guildId) {
  const st = musicState.get(guildId);
  if (!st) return;
  musicState.delete(guildId);
  try { st.player?.stop(true); } catch {}
  try { st.streamProc?.ffProc?.kill('SIGKILL'); } catch {}
  try { st.streamProc?.stream?.destroy(); } catch {}
  try {
    if (st.connection?.state?.status !== VoiceConnectionStatus.Destroyed) {
      st.connection?.destroy();
    }
  } catch {}
}

// Build voice control panel embed + buttons
function buildMusicPanel(guildId) {
  const st = musicState.get(guildId);
  const cv = st?.currentVideo;

  const embed = new EmbedBuilder()
    .setColor(0x7D0C22)
    .setTitle('🎵 لوحة التحكم بالموسيقى')
    .setDescription(
      '**الأوامر النصية:**\n' +
      '`-ش [اسم الأغنية]` — يشغل أغنية من يوتيوب (يجب أن تكون في قناة صوتية)\n' +
      '`-ايقاف` — يوقف التشغيل ويخرج البوت من القناة\n' +
      '`-يشغل` — يعرض اسم الأغنية التي تشتغل الحين\n\n' +
      '**الأزرار:**\n' +
      '⏸ **إيقاف مؤقت / استئناف** — يوقف الأغنية أو يعيد تشغيلها\n' +
      '🔁 **تكرار** — يكرر نفس الأغنية حتى تلغيه أو تشغل أغنية ثانية\n' +
      '🔍 **بحث وتشغيل** — يفتح نافذة بحث لكتابة اسم الأغنية\n' +
      '⏹ **إيقاف** — يوقف التشغيل ويخرج البوت من القناة الصوتية'
    );

  if (cv) {
    let status = st.paused ? '⏸ موقف مؤقتاً' : '▶️ يشتغل';
    if (st.loop) status += ' · 🔁 تكرار مفعّل';
    embed.addFields({ name: '🎵 الأغنية الحالية', value: `[${cv.title}](${cv.url})` });
    embed.addFields({ name: '📊 الحالة', value: status });
  } else {
    embed.addFields({ name: '📊 الحالة', value: '💤 لا يوجد شيء يشتغل' });
  }

  const isPaused = !!st?.paused;
  const isLoop = !!st?.loop;
  const hasMusic = !!st;

  const pauseBtn = new ButtonBuilder()
    .setCustomId('music_pause')
    .setLabel(isPaused ? '▶️ استئناف' : '⏸️ إيقاف مؤقت')
    .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(!hasMusic);

  const loopBtn = new ButtonBuilder()
    .setCustomId('music_loop')
    .setLabel(isLoop ? '🔁 تكرار: مفعّل' : '🔁 تكرار: معطّل')
    .setStyle(isLoop ? ButtonStyle.Primary : ButtonStyle.Secondary);

  const searchBtn = new ButtonBuilder()
    .setCustomId('music_search')
    .setLabel('🔍 بحث وتشغيل')
    .setStyle(ButtonStyle.Primary);

  const stopBtn = new ButtonBuilder()
    .setCustomId('music_stop')
    .setLabel('⏹️ إيقاف')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!hasMusic);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(pauseBtn, loopBtn, stopBtn),
      new ActionRowBuilder().addComponents(searchBtn),
    ],
  };
}

function getTicketConfig(guildId) {
  const db = loadDb();
  return (db.ticket_configs || {})[guildId] || null;
}

function saveTicketConfig(guildId, config) {
  const db = loadDb();
  if (!db.ticket_configs) db.ticket_configs = {};
  db.ticket_configs[guildId] = config;
  saveDb(db);
}

function buildTicketPanel() {
  const axisPath = path.join(__dirname, 'assets', 'axis.png');
  const attachment = new AttachmentBuilder(axisPath, { name: 'axis.png' });
  const embed = new EmbedBuilder()
    .setColor(0x7D0C22)
    .setTitle('Ticket System')
    .setDescription('Choose a ticket type below to open a request and get support from the staff team.')
    .setImage('attachment://axis.png');

  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_open')
    .setPlaceholder('اضغط لفتح التذكرة')
    .addOptions(
      TICKET_TYPES.map(t =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.label)
          .setValue(t.id)
          .setDescription(t.description)
          .setEmoji(t.emoji)
      )
    );

  const row = new ActionRowBuilder().addComponents(select);
  return { embeds: [embed], components: [row], files: [attachment] };
}

async function createTicketChannel(guild, opener, typeId, categoryId) {
  const typeName = TICKET_LABELS[typeId] || typeId;
  const channelName = `ticket-${opener.username.toLowerCase().replace(/[^a-z0-9]/gi, '-').slice(0, 15)}`;

  const axisTeamRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'axis team' || r.name === 'Axis team');

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: opener.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (axisTeamRole) {
    permissionOverwrites.push({
      id: axisTeamRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId || null,
    permissionOverwrites,
    topic: `تذكرة ${typeName} — فتحها: ${opener.username}`,
  });

  openTickets.set(channel.id, { openerID: opener.id, type: typeId, claimedBy: null });

  const axisPath = path.join(__dirname, 'assets', 'axis.png');
  const attachment = new AttachmentBuilder(axisPath, { name: 'axis.png' });
  const teamMention = axisTeamRole ? `<@&${axisTeamRole.id}>` : '@Axis team';

  const embed = new EmbedBuilder()
    .setColor(0x7D0C22)
    .setTitle(`${typeName} — ${TICKET_TYPES.find(t=>t.id===typeId)?.emoji || '🎫'}`)
    .setDescription(`أهلاً بك في تكت **${typeName}**!\nيرجى شرح مشكلتك بالتفصيل وسيتم مساعدتك في أقرب وقت.\n\n${teamMention} | <@${opener.id}>`)
    .setImage('attachment://axis.png')
    .setFooter({ text: `Axis's Tickets • ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` });

  const claimBtn = new ButtonBuilder()
    .setCustomId('ticket_claim')
    .setLabel('🎫 استلام')
    .setStyle(ButtonStyle.Success);

  const closeBtn = new ButtonBuilder()
    .setCustomId('ticket_close')
    .setLabel('🔒 اغلاق')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(claimBtn, closeBtn);

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_edit_assign')
      .setPlaceholder('تعديل التذكرة')
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('تعديل التذكرة').setValue('edit').setEmoji('✏️')
      ])
  );

  await channel.send({ content: `${teamMention} | <@${opener.id}>`, embeds: [embed], components: [row], files: [attachment] });

  return channel;
}


const OWNER_ID  = '1195827812565798953';
const OWNER_ID2 = '1226561156907401248';
const isOwner = id => id === OWNER_ID || id === OWNER_ID2;

function isAuthorized(userId) {
  if (isOwner(userId)) return true;
  const db = loadDb();
  return (db.whitelist || []).includes(userId);
}

function addToWhitelist(userId) {
  const db = loadDb();
  if (!db.whitelist) db.whitelist = [OWNER_ID];
  if (!db.whitelist.includes(userId)) {
    db.whitelist.push(userId);
    saveDb(db);
    return true;
  }
  return false;
}

function removeFromWhitelist(userId) {
  if (isOwner(userId)) return false;
  const db = loadDb();
  const idx = (db.whitelist || []).indexOf(userId);
  if (idx === -1) return false;
  db.whitelist.splice(idx, 1);
  saveDb(db);
  return true;
}

const PUBLIC_CMDS = new Set([
  'اسرع','fast','سريع','speed',
  'اعكس','reverse','عكس',
  'اعلام','flags',
  'اكشف','reveal','اكتشف',
  'زر','button','btn',
  'نقاطي','نقاط','points','balance',
  'العاب','games','الالعاب',
]);

const AUTHORIZED_ROLE_ID = '1518979586510028904';


const COLORS = {
  primary: 0x7D0C22, success: 0x7D0C22, error: 0x7D0C22, warning: 0x7D0C22,
  gold: 0x7D0C22, purple: 0x7D0C22, blue: 0x7D0C22, red: 0x7D0C22,
  green: 0x7D0C22, orange: 0x7D0C22, dark: 0x7D0C22, teal: 0x7D0C22, game: 0x7D0C22,
};

function makeEmbed({ title, description, color, fields, footer, thumbnail, image, author, timestamp }) {
  const embed = { color: color ?? COLORS.primary };
  if (title) embed.title = title;
  if (description) embed.description = description;
  if (fields) embed.fields = fields;
  if (footer) embed.footer = typeof footer === 'string' ? { text: footer } : footer;
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  if (image) embed.image = { url: image };
  if (author) embed.author = typeof author === 'string' ? { name: author } : author;
  if (timestamp) embed.timestamp = new Date().toISOString();
  return embed;
}


const fontPath = path.join(__dirname, 'assets', 'NotoArabic.ttf');
if (canvasAvailable) {
  try { GlobalFonts.registerFromPath(fontPath, 'NotoArabic'); }
  catch (e) { console.error('Font registration failed:', e.message); }
}

const PALETTE = [
  { bg: '#E74C3C', rim: '#FF6B6B', txt: '#FFFFFF' }, { bg: '#2ECC71', rim: '#58D68D', txt: '#000000' },
  { bg: '#3498DB', rim: '#5DADE2', txt: '#FFFFFF' }, { bg: '#F39C12', rim: '#F5B041', txt: '#000000' },
  { bg: '#9B59B6', rim: '#BB8FCE', txt: '#FFFFFF' }, { bg: '#1ABC9C', rim: '#48C9B0', txt: '#000000' },
  { bg: '#E91E63', rim: '#F06292', txt: '#FFFFFF' }, { bg: '#FF5722', rim: '#FF8A65', txt: '#FFFFFF' },
  { bg: '#00BCD4', rim: '#4DD0E1', txt: '#000000' }, { bg: '#8BC34A', rim: '#AED581', txt: '#000000' },
  { bg: '#673AB7', rim: '#9575CD', txt: '#FFFFFF' }, { bg: '#FF9800', rim: '#FFB74D', txt: '#000000' },
  { bg: '#F44336', rim: '#EF9A9A', txt: '#FFFFFF' }, { bg: '#009688', rim: '#4DB6AC', txt: '#FFFFFF' },
  { bg: '#795548', rim: '#A1887F', txt: '#FFFFFF' }, { bg: '#607D8B', rim: '#90A4AE', txt: '#FFFFFF' },
  { bg: '#C0392B', rim: '#E74C3C', txt: '#FFFFFF' }, { bg: '#27AE60', rim: '#2ECC71', txt: '#FFFFFF' },
  { bg: '#2980B9', rim: '#3498DB', txt: '#FFFFFF' }, { bg: '#D35400', rim: '#E67E22', txt: '#FFFFFF' },
];

function lighten(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xFF) + amount);
  const b = Math.min(255, (num & 0xFF) + amount);
  return `rgb(${r},${g},${b})`;
}

function drawArrow(ctx, cx, cy, R) {
  const tipX = cx + R + 6, backX = tipX + 50, halfH = 22, notch = backX - 14;
  ctx.save();
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 25;
  ctx.shadowOffsetX = -2;
  const ag = ctx.createLinearGradient(tipX, cy, backX, cy);
  ag.addColorStop(0, '#FFFFFF');
  ag.addColorStop(0.4, '#FFD700');
  ag.addColorStop(1, '#FF8C00');
  ctx.beginPath();
  ctx.moveTo(tipX, cy);
  ctx.lineTo(backX, cy - halfH);
  ctx.lineTo(notch, cy);
  ctx.lineTo(backX, cy + halfH);
  ctx.closePath();
  ctx.fillStyle = ag; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawSidePanel(ctx, W, H, cx, R, players, winnerIdx, isFinished) {
  const panelX = cx + R + 65, panelW = W - panelX - 12;
  if (panelW < 60) return;
  const panelH = H - 100, panelY = 40;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#0D0520';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,100,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.direction = 'rtl';
  ctx.font = `bold 13px NotoArabic, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#BB8FCE';
  ctx.fillText('اللاعبون', panelX + panelW / 2, panelY + 10);
  ctx.strokeStyle = 'rgba(180,100,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 8, panelY + 28);
  ctx.lineTo(panelX + panelW - 8, panelY + 28);
  ctx.stroke();
  const itemH = Math.min(22, (panelH - 40) / players.length), fontSize = Math.min(12, itemH - 4);
  for (let i = 0; i < players.length; i++) {
    const iy = panelY + 36 + i * itemH, isWinner = isFinished && i === winnerIdx, col = PALETTE[i % PALETTE.length];
    ctx.beginPath();
    ctx.arc(panelX + 10, iy + itemH / 2 - 1, 5, 0, 2 * Math.PI);
    ctx.fillStyle = col.bg;
    ctx.fill();
    const maxLen = Math.floor(panelW / fontSize), rawName = players[i];
    const nameStr = rawName.length > maxLen ? rawName.slice(0, maxLen - 2) + '..' : rawName;
    ctx.font = `${isWinner ? 'bold' : ''} ${fontSize}px NotoArabic, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isWinner ? '#FFD700' : 'rgba(220,200,255,0.85)';
    if (isWinner) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8; }
    ctx.fillText(nameStr, panelX + panelW - 8, iy + itemH / 2);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

async function generateSpinningWheelGif(players, winnerIdx) {
  if (!canvasAvailable) return null;
  const W = 720, H = 620, cx = 300, cy = H / 2, R = 260, n = players.length;
  const sliceAngle = (2 * Math.PI) / n;
  const winnerOffset = winnerIdx * sliceAngle + sliceAngle / 2;
  const finalRotAngle = Math.PI / 2 - winnerOffset;
  const totalRotation = 8 * 2 * Math.PI;
  const FRAMES = 48, frameDelays = [], frameAngles = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1), ease = 1 - Math.pow(1 - t, 3.2);
    frameAngles.push(finalRotAngle - totalRotation + ease * totalRotation);
    frameDelays.push(Math.round(10 + Math.pow(t, 1.6) * 130));
  }
  const totalDurationMs = frameDelays.reduce((a, b) => a + b, 0);
  const encoder = new GIFEncoder(W, H, 'neuquant', true);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setQuality(6);
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');

  function drawWheel(angle, isFinished) {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 400);
    bg.addColorStop(0, '#1A0A2E');
    bg.addColorStop(0.5, '#0D0618');
    bg.addColorStop(1, '#050010');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glowR = ctx.createRadialGradient(cx, cy, R - 10, cx, cy, R + 30);
    glowR.addColorStop(0, 'rgba(180,100,255,0.25)');
    glowR.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowR;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 30, 0, 2 * Math.PI);
    ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    for (let i = 0; i < n; i++) {
      const startA = i * sliceAngle - Math.PI / 2, endA = startA + sliceAngle, col = PALETTE[i % PALETTE.length];
      const isWinner = isFinished && i === winnerIdx;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, startA, endA);
      ctx.closePath();
      ctx.fillStyle = isWinner ? lighten(col.bg, 40) : col.bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.90)';
      ctx.lineWidth = isWinner ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, startA, endA);
      ctx.closePath();
      ctx.stroke();
      if (isWinner) {
        ctx.save();
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 35;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R - 2, startA, endA);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      const na = i * sliceAngle - Math.PI / 2 + sliceAngle / 2;
      const dist = n === 2 ? R * 0.52 : n <= 4 ? R * 0.58 : R * (n > 10 ? 0.65 : 0.60);
      const lx = Math.cos(na) * dist, ly = Math.sin(na) * dist;
      const fs = n === 2 ? 22 : n <= 4 ? 18 : n <= 6 ? 15 : n <= 10 ? 12 : n <= 14 ? 10 : 9;
      const maxLen = n === 2 ? 14 : n <= 4 ? 12 : n <= 6 ? 10 : n <= 10 ? 8 : 6;
      const rawName = players[i], nameStr = rawName.length > maxLen ? rawName.slice(0, maxLen) + '..' : rawName;
      ctx.save(); ctx.translate(lx, ly);
      const normNa = ((na % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const flip = normNa > Math.PI / 2 && normNa < 3 * Math.PI / 2;
      ctx.rotate(flip ? na - Math.PI / 2 : na + Math.PI / 2);
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${fs}px NotoArabic, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,1)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = col.txt; ctx.fillText(nameStr, 0, 0);
      if (isWinner && i === winnerIdx) { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14; ctx.fillStyle = '#FFD700'; ctx.fillText(nameStr, 0, 0); }
      ctx.shadowBlur = 0; ctx.restore();
    }
    const centerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
    centerGrad.addColorStop(0, '#F5F5F5');
    centerGrad.addColorStop(0.5, '#D0D0D0');
    centerGrad.addColorStop(1, '#999');
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, 2 * Math.PI);
    ctx.fillStyle = centerGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    drawArrow(ctx, cx, cy, R);
    if (isFinished) {
      const banY = H - 68, banH = 56, banX = 30, banW = W - 60;
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 20;
      const banGrad = ctx.createLinearGradient(banX, banY, banX + banW, banY);
      banGrad.addColorStop(0, 'rgba(80,20,10,0.96)');
      banGrad.addColorStop(0.5, 'rgba(120,60,10,0.98)');
      banGrad.addColorStop(1, 'rgba(80,20,10,0.96)');
      ctx.fillStyle = banGrad;
      ctx.beginPath();
      ctx.roundRect(banX, banY, banW, banH, 14);
      ctx.fill();
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(banX, banY, banW, banH, 14);
      ctx.stroke();
      ctx.restore();
      ctx.direction = 'rtl';
      ctx.font = 'bold 24px NotoArabic, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FF8C00';
      ctx.shadowBlur = 15;
      ctx.fillText(`🎯 توقفت على: ${players[winnerIdx]}`, W / 2, banY + banH / 2);
      ctx.shadowBlur = 0;
    }
    drawSidePanel(ctx, W, H, cx, R, players, winnerIdx, isFinished);
  }

  for (let f = 0; f < FRAMES; f++) {
    drawWheel(frameAngles[f], f === FRAMES - 1);
    encoder.setDelay(frameDelays[f]); encoder.addFrame(ctx);
  }
  encoder.finish();
  const gifBuffer = encoder.out.getData();
  const pCanvas = createCanvas(W, H), pCtx = pCanvas.getContext('2d');
  drawWheel(finalRotAngle, true);
  pCtx.drawImage(canvas, 0, 0);
  const stoppedImageBuffer = pCanvas.toBuffer('image/png');
  return { gifBuffer, stoppedImageBuffer, totalDurationMs };
}

function drawPill(ctx, x, y, text, fontSize, fillColor, borderColor, textColor, width, height) {
  const px = x - width / 2, py = y - height / 2;
  ctx.save();
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 16;
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.roundRect(px, py, width, height, height / 2);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
  ctx.direction = 'rtl';
  ctx.font = `bold ${fontSize}px NotoArabic, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 10;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

async function generateWordImage(word, subtitle = 'اسرع من يكتب') {
  if (!canvasAvailable) return null;
  const W = 900;
  const H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0A0020');
  bg.addColorStop(0.5, '#120035');
  bg.addColorStop(1, '#0A0020');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const rng = mulberry32(word.charCodeAt(0) * 1337);
  for (let i = 0; i < 80; i++) {
    const sx = rng() * W;
    const sy = rng() * H;
    const sr = rng() * 1.8 + 0.3;
    const alpha = rng() * 0.6 + 0.1;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(200,170,255,${alpha})`;
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 280);
  glow.addColorStop(0, 'rgba(130,60,255,0.40)');
  glow.addColorStop(0.5, 'rgba(80,30,180,0.15)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  drawPill(ctx, W / 2, H * 0.18, subtitle, 18, 'rgba(180,100,255,0.20)', '#9B59B6', '#D7BDE2', 380, 46);
  const wordY = H * 0.50;
  const wordFs = word.length > 18 ? 36 : word.length > 12 ? 46 : word.length > 7 ? 58 : 70;
  const glowColors = ['#9B59B6', '#BDC3E8', '#FFFFFF'];
  const glowBlurs = [30, 14, 0];
  for (let g = 0; g < glowColors.length; g++) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.font = `bold ${wordFs}px NotoArabic, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glowColors[g];
    ctx.shadowBlur = glowBlurs[g];
    ctx.fillStyle = g < 2 ? glowColors[g] + '44' : '#FFFFFF';
    ctx.fillText(word, W / 2, wordY);
    ctx.restore();
  }
  const textMeasure = wordFs * word.length * 0.55;
  const lineW = Math.min(textMeasure + 60, W - 100);
  const lineY = wordY + wordFs / 2 + 14;
  const lineGrad = ctx.createLinearGradient(W / 2 - lineW / 2, 0, W / 2 + lineW / 2, 0);
  lineGrad.addColorStop(0, 'rgba(155,89,182,0)');
  lineGrad.addColorStop(0.5, 'rgba(155,89,182,0.9)');
  lineGrad.addColorStop(1, 'rgba(155,89,182,0)');
  ctx.beginPath();
  ctx.moveTo(W / 2 - lineW / 2, lineY);
  ctx.lineTo(W / 2 + lineW / 2, lineY);
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.shadowColor = '#9B59B6';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
  drawPill(ctx, W / 2, H * 0.84, '⏱ لديك 15 ثانية', 16, 'rgba(80,30,150,0.25)', '#6C3483', '#A9CCE3', 280, 42);
  return canvas.toBuffer('image/png');
}

async function fetchFlagBuffer(countryCode) {
  const url = `https://flagcdn.com/w320/${countryCode.toLowerCase()}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Flag not found');
  return Buffer.from(await res.arrayBuffer());
}

async function generateFlagChallengeImage(countryCode) {
  if (!canvasAvailable) return null;
  const W = 760, H = 420, canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0B1426');
  bg.addColorStop(0.5, '#0F1D35');
  bg.addColorStop(1, '#0B1426');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy < H; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }
  const titleGrad = ctx.createLinearGradient(0, 0, W, 0);
  titleGrad.addColorStop(0, 'rgba(0,100,200,0.0)');
  titleGrad.addColorStop(0.5, 'rgba(0,150,255,0.25)');
  titleGrad.addColorStop(1, 'rgba(0,100,200,0.0)');
  ctx.fillStyle = titleGrad;
  ctx.fillRect(0, 0, W, 60);
  ctx.direction = 'rtl';
  ctx.font = 'bold 28px NotoArabic, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#0080FF';
  ctx.shadowBlur = 20;
  ctx.fillText('🌍  ما اسم هذا العلم؟', W / 2, 32);
  ctx.shadowBlur = 0;
  const divGrad = ctx.createLinearGradient(0, 0, W, 0);
  divGrad.addColorStop(0, 'rgba(0,150,255,0)');
  divGrad.addColorStop(0.5, 'rgba(0,150,255,0.7)');
  divGrad.addColorStop(1, 'rgba(0,150,255,0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(60, 62);
  ctx.lineTo(W - 60, 62);
  ctx.stroke();
  try {
    const flagBuf = await fetchFlagBuffer(countryCode), flagImg = await loadImage(flagBuf);
    const maxW = 440, maxH = 260, scale = Math.min(maxW / flagImg.width, maxH / flagImg.height);
    const fw = Math.round(flagImg.width * scale), fh = Math.round(flagImg.height * scale), fx = (W - fw) / 2, fy = 72 + (maxH - fh) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 8);
    ctx.clip();
    ctx.drawImage(flagImg, fx, fy, fw, fh);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 8);
    ctx.stroke();
    ctx.restore();
  } catch {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(160, 75, 440, 260);
    ctx.font = '70px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌍', W / 2, 205);
  }
  ctx.fillStyle = 'rgba(0,150,255,0.10)';
  ctx.fillRect(0, H - 50, W, 50);
  ctx.direction = 'rtl';
  ctx.font = 'bold 18px NotoArabic, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(150,200,255,0.80)';
  ctx.fillText('⚡ أسرع شخص يكتب اسم الدولة يفوز! | لديك 20 ثانية', W / 2, H - 26);
  return canvas.toBuffer('image/png');
}


// add
const cmdAdd = {
  name: 'add', aliases: ['addpoints', 'اضف'],
  async execute(message, args) {
    const target = message.mentions.users.first(), amount = parseInt(args[1] ?? args[0]);
    if (!target) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ مثال: `-add @شخص 500`' }] });
    if (!amount) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ مثال: `-add @شخص 500`' }] });
    ensureUser(target.id, message.guild.id, target.username);
    const updated = addPoints(target.id, message.guild.id, amount, 'إضافة من مشرف');
    await message.channel.send({ embeds: [makeEmbed({ title: '✅ تمت الإضافة', color: COLORS.success, fields: [{ name: '👤 اللاعب', value: `<@${target.id}>`, inline: true }, { name: '💰 المضاف', value: `${amount > 0 ? '+' : ''}${amount.toLocaleString()}`, inline: true }, { name: '💼 الرصيد الكلي', value: `${updated.points.toLocaleString()}`, inline: true }] })] });
  }
};

// join (voice)
function parseChannelId(input) {
  const mentionMatch = input.match(/^<#(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  const linkMatch = input.match(/channels\/\d+\/(\d+)/);
  if (linkMatch) return linkMatch[1];
  if (/^\d{17,20}$/.test(input.trim())) return input.trim();
  return null;
}

const cmdJoin = {
  name: 'join', aliases: ['جوين', 'دخول'], cooldown: 5,
  async execute(message, args, client) {
    const guild = message.guild;
    if (!guild) return;

    let voiceChannel = null;

    // إذا ذكر قناة أو أعطى ID/رابط
    if (args.length > 0) {
      const input = args.join(' ').trim();
      const channelId = parseChannelId(input)
        ?? (message.mentions.channels.first()?.id);
      if (channelId) {
        try { voiceChannel = await guild.channels.fetch(channelId); } catch { /* ignore */ }
      }
      // بحث بالاسم
      if (!voiceChannel) {
        voiceChannel = guild.channels.cache.find(
          c => c.isVoiceBased() && c.name.toLowerCase().includes(input.toLowerCase())
        ) || null;
      }
    } else {
      // إذا ما في وسيطة ادخل فويس المرسل
      voiceChannel = message.member?.voice?.channel || null;
    }

    if (!voiceChannel || !voiceChannel.isVoiceBased())
      return message.reply('❌ ما لقيت قناة صوتية. مثال: `-join <#قناة>` أو `-join اسم القناة`');

    const permissions = voiceChannel.permissionsFor(guild.members.me);
    if (!permissions?.has('Connect'))
      return message.reply('❌ ما عندي صلاحية دخول هذي القناة!');

    try {
      const existing = getVoiceConnection(guild.id);
      if (existing) existing.destroy();

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch { connection.destroy(); }
      });
      await message.react('✅').catch(() => {});
    } catch (err) {
      console.error('[join]', err.message);
      return message.reply(`❌ فشل الدخول: \`${err.message}\``);
    }
  }
};

// leave
const cmdLeave = {
  name: 'leave', aliases: ['طلع', 'اطلع', 'خروج-فويس'], cooldown: 3,
  async execute(message, args, client) {
    const guild = message.guild;
    if (!guild) return;
    const connection = getVoiceConnection(guild.id);
    if (!connection) return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('❌ البوت مو في أي فويس!')] });
    connection.destroy();
    return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('✅ طلعت من الفويس!')] });
  }
};

// xo
const xoGames = new Map();
const XO_EMPTY = '⬜', XO_X = '❌', XO_O = '⭕';
const XO_WIN_CONDS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function xoCheckWin(board, mark) { return XO_WIN_CONDS.some(([a,b,c]) => board[a]===mark && board[b]===mark && board[c]===mark); }
function xoBoardComponents(board, disabled=false) {
  const rows = [];
  for (let r=0; r<3; r++) {
    const row = new ActionRowBuilder();
    for (let c=0; c<3; c++) {
      const i = r*3+c;
      row.addComponents(new ButtonBuilder().setCustomId(`xo_cell_${i}`).setLabel(board[i]===XO_EMPTY ? '‎ ' : board[i]===XO_X ? '❌' : '⭕').setStyle(board[i]===XO_X ? ButtonStyle.Danger : board[i]===XO_O ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(disabled || board[i]!==XO_EMPTY));
    }
    rows.push(row);
  }
  return rows;
}
function xoLobbyEmbed(players, endTs) {
  return new EmbedBuilder().setTitle('❌⭕ XO').setColor(0x7D0C22)
    .setDescription('**طريقة اللعب:**\n1- شارك في اللعبة بالضغط على الزر أدناه\n2- سيتم اختيار اللاعبين بشكل عشوائي للمنافسة\n3- الخاسر يُطرد، الفائز يكمل حتى النهاية\n4- آخر لاعب يبقى يفوز بـ **1 نقطة!**\n\n' + `**اللاعبون المشاركون: (${players.length}/20)**\n\nستبدأ اللعبة <t:${endTs}:R>`);
}
async function xoPlayMatch(channel, p1, p2) {
  while (true) {
    const board = Array(9).fill(XO_EMPTY);
    const matchMsg = await channel.send({ content: `**❌⭕ مباراة: <@${p1.id}> (❌) ضد <@${p2.id}> (⭕)\nدور: <@${p1.id}>**`, components: xoBoardComponents(board) });
    const result = await new Promise(resolve => {
      const collector = matchMsg.createMessageComponentCollector({ time: 120_000 });
      let currentPlayer = p1, currentMark = XO_X;
      collector.on('collect', async i => {
        if (i.user.id !== currentPlayer.id) return i.reply({ content: '**❌ مو دورك!**', ephemeral: true });
        const idx = parseInt(i.customId.replace('xo_cell_', ''));
        if (board[idx] !== XO_EMPTY) return i.deferUpdate();
        board[idx] = currentMark;
        if (xoCheckWin(board, currentMark)) {
          collector.stop('done');
          await i.update({ content: `**🎉 فاز ${currentPlayer.username}! <@${currentPlayer.id}> ✅**`, components: xoBoardComponents(board, true) });
          return resolve({ type: 'winner', player: currentPlayer });
        }
        if (!board.includes(XO_EMPTY)) {
          collector.stop('done');
          await i.update({ content: `**🤝 تعادل بين <@${p1.id}> و <@${p2.id}>! جاري إعادة اللعب...**`, components: xoBoardComponents(board, true) });
          return resolve({ type: 'tie' });
        }
        currentPlayer = currentPlayer.id === p1.id ? p2 : p1;
        currentMark = currentMark === XO_X ? XO_O : XO_X;
        await i.update({ content: `**❌⭕ <@${p1.id}> (❌) ضد <@${p2.id}> (⭕)\nدور: <@${currentPlayer.id}>**`, components: xoBoardComponents(board) });
      });
      collector.on('end', (_, reason) => {
        if (reason !== 'done') {
          matchMsg.edit({ components: xoBoardComponents(board, true) }).catch(() => {});
          resolve({ type: 'timeout' });
        }
      });
    });
    if (result.type === 'winner') return result.player;
    if (result.type === 'timeout') return Math.random() < 0.5 ? p1 : p2;
    // tie → replay
    await sleep(2000);
  }
}
async function xoRunTournament(channel, game, channelId) {
  let remaining = [...game.players];
  while (remaining.length > 1) {
    const shuffled = remaining.sort(() => Math.random() - 0.5), nextRound = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      const p1 = shuffled[i], p2 = shuffled[i + 1];
      if (!p2) { nextRound.push(p1); continue; }
      const winner = await xoPlayMatch(channel, p1, p2);
      nextRound.push(winner);
      const loser = winner.id === p1.id ? p2 : p1;
      recordGameResult(loser.id, channel.guild.id, 'XO', 'loss', 0);
      await sleep(1500);
    }
    remaining = nextRound;
  }
  xoGames.delete(channelId);
  if (remaining.length === 1) {
    recordGameResult(remaining[0].id, channel.guild.id, 'XO', 'win', 1);
    await channel.send(`**👑 بطل XO!\n🎉 الفائز: <@${remaining[0].id}>!\n🏆 +1 نقطة**`);
  }
}
const cmdXo = {
  name: 'xo', aliases: ['اكس او'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (xoGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const endTs = Math.floor((Date.now() + 27_000) / 1000);
    const game = { players: [], phase: 'lobby', endTs };
    xoGames.set(channelId, game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('xo_join').setLabel('دخول إلى اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('xo_leave').setLabel('اخرج من اللعبة').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('xo_store').setLabel('⚡ متجر اللعبة').setStyle(ButtonStyle.Primary),
    );
    const sentMsg = await message.channel.send({ embeds: [xoLobbyEmbed(game.players, endTs)], components: [row] });
    const collector = sentMsg.createMessageComponentCollector({ time: 90_000 });
    collector.on('collect', async i => {
      const g = xoGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'xo_store') return i.reply({ content: '**🏪 متجر قريباً!**', ephemeral: true });
      if (i.customId === 'xo_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود بالفعل!**', ephemeral: true });
        if (g.players.length >= 20) return i.reply({ content: '**❌ اللعبة ممتلئة!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        g.players.push({ id: i.user.id, username: i.user.username });
        return i.update({ embeds: [xoLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'xo_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
      return i.update({ embeds: [xoLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });
    setTimeout(async () => {
      const g = xoGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 2) { xoGames.delete(channelId);
      return sentMsg.edit({ embeds: [], components: [], content: '**❌ لم يكن هناك لاعبون كافيون.**' }); }
      g.phase = 'playing';
      await sentMsg.edit({ components: [], embeds: [xoLobbyEmbed(g.players, g.endTs)] });
      await xoRunTournament(message.channel, g, channelId);
    }, 27_000);
  }
};

// اسرع
const اسرعChannels = new Set();
const اسرعSINGLE = ['مرحبا','ديسكورد','البوت','سريع','روليت','مافيا','فيديو','شجاعة','اسد','قمر','نجمة','سماء','بحر','جبل','صحراء','كتاب','قلم','باب','نافذة','شمس','نار','سلام','فرح','ضحكة','بطل','قوة','حلم','قلب','روح','طريق','دولة','ارض','سحاب','مطر','ثلج','نهر','غابة','ذهب','خشب','خبز','سمك','تفاح','حليب','عسل','نمر','فيل','صقر','نسر','كلب','حصان','جمل','ملعب','بركة','مدرسة','ساعة','كرسي','طاولة','سلم','مطعم','فندق','سوق','بنك','متحف','قلعة','مسجد','مطار','ميناء','قطار','دراجة','سفينة','برج','جزيرة','بركان','نخلة','وردة','صخرة','رمال','موجة','شفاه','عقل','عيون','صوت','ضوء','ظلام','صحبة','بسمة','لهفة','شوق','دفء','امل','طيف','حياة','امنية','خيال','مغامرة','اكتشاف','رحلة','مكان','عالم','كون','نبات','حديقة','شلال','خريف','ربيع','صيف','شتاء','سحابة','فجر','غروب','صحراء','قافلة','واحة','نهضة','قيادة','ابداع','فلسفة','حضارة','تراث','ثقافة'];
const اسرعTWO = ['لوحة تزلج','كرة قدم','رياضة مائية','سباق سيارات','تزلج جليدي','قفز حواجز','رمي قرص','سباق دراجات','تسلق جبال','غوص بحري','حديقة حيوانات','مركز تسوق','مطعم فاخر','فندق خمس نجوم','شاطئ رملي','جزيرة استوائية','غابة مطيرة','صحراء رملية','قمة جبلية','نهر متدفق','مدرسة ثانوية','جامعة حكومية','مستشفى عام','مركز صحي','صيدلية شعبية','سيارة رياضية','دراجة نارية','حافلة مدرسية','قطار سريع','طائرة مروحية','هاتف ذكي','حاسوب محمول','شاشة كبيرة','كاميرا احترافية','سماعة لاسلكية','برنامج حاسوبي','تطبيق جوال','ذكاء اصطناعي','واقع افتراضي','انترنت سريع','كتاب قصصي','رواية بوليسية','قصيدة شعرية','مقالة علمية','موسوعة عالمية','موسيقى هادئة','رقصة شعبية','لوحة فنية','تمثال برونزي','معرض فني','ملعب كرة','استاد رياضي','بركة سباحة','صالة العاب','نادي رياضي','مطبخ عصري','غرفة نوم','صالة جلوس','حمام واسع','شرفة جميلة','بستان ورود','نخلة باسقة','شجرة مثمرة','عشب اخضر','زهرة جميلة','قلعة تاريخية','متحف وطني','مسجد عريق','قلعة قديمة','معبد اثري','سوق شعبي','متجر تجاري','بنك وطني','مكتب حكومي','محكمة عدل','طبيب اسنان','مهندس مدني','معلم ابتدائي','محامي مشهور','طيار مدني','طاه ماهر','فنان تشكيلي','ممثل شهير','مغني معروف','رياضي محترف','صحفي حر','كاتب روائي','شاعر عربي','مخترع عبقري','عالم فيزياء','خريطة طريق','بوصلة ملاح','مجهر علمي','تلسكوب فلكي','مختبر كيمياء','حبل مشدود','درع واقي','سيف قديم','قوس نشاب','رمح حربي'];
const cmdاسرع = {
  name: 'اسرع', aliases: ['fast', 'سريع', 'speed'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (اسرعChannels.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    اسرعChannels.add(channelId);
    const allWords = [...اسرعSINGLE, ...اسرعTWO], word = allWords[Math.floor(Math.random() * allWords.length)];
    let imageBuffer;
    try { imageBuffer = await generateWordImage(word, 'اسرع من يكتب'); } catch (e) { console.error('Image gen failed:', e); }
    if (imageBuffer) {
      await message.channel.send({ content: '**⚡ اسرع — أكتب الكلمة في الصورة! لديك 15 ثانية**', files: [new AttachmentBuilder(imageBuffer, { name: 'word.png' })] });
    } else { await message.channel.send(`**⚡ اسرع — أكتب: ${word}\nلديك 15 ثانية!**`); }
    const start = Date.now();
    try {
      const collected = await message.channel.awaitMessages({ filter: m => !m.author.bot && m.content.trim() === word, max: 1, time: 15_000, errors: ['time'] });
      const timeTaken = ((Date.now() - start) / 1000).toFixed(2), winner = collected.first().author;
      ensureUser(winner.id, message.guild.id, winner.username);
      recordGameResult(winner.id, message.guild.id, 'اسرع', 'win', 1);
      await message.channel.send(`**⚡ <@${winner.id}> كتبها في ${timeTaken} ثانية! +1 نقطة 🏆**`);
    } catch { await message.channel.send(`**⏰ انتهى الوقت! الكلمة كانت: ${word}**`); }
    اسرعChannels.delete(channelId);
  }
};

// اسكت
const cmdاسكت = {
  name: 'اسكت', aliases: ['mute', 'timeout'], cooldown: 3,
  async execute(message, args, client) {
    let target = null, durationMinutes = 10;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = replied.member || await message.guild.members.fetch(replied.author.id).catch(() => null);
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.members?.size > 0) target = message.mentions.members.first();
    for (const arg of args) { const num = parseInt(arg); if (!isNaN(num) && num > 0) { durationMinutes = Math.min(num, 40320); break; } }
    if (!target || target.id === message.author.id || target.id === client.user.id || !target.moderatable) return;
    try { await target.timeout(durationMinutes * 60 * 1000, `كتم بواسطة ${message.author.tag}`); await message.react('✅').catch(() => {}); } catch { /* ignore */ }
  }
};

// اعفاء
const cmdاعفاء = {
  name: 'اعفاء', aliases: ['pardon', 'free', 'unjail'], cooldown: 3,
  async execute(message, args, client) {
    let target = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = await message.guild.members.fetch(replied.author.id).catch(() => null);
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.members?.size > 0) target = message.mentions.members.first();
    if (!target) return;
    const prisonerData = getPrisoner(target.id, message.guild.id);
    if (!prisonerData) return;
    const prisonRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'prison');
    if (prisonRole && target.roles.cache.has(prisonRole.id)) { try { await target.roles.remove(prisonRole, 'اعفاء'); } catch { /* ignore */ } }
    for (const roleId of prisonerData.roles) { const role = message.guild.roles.cache.get(roleId); if (role && !role.managed && role.id !== message.guild.id) { try { await target.roles.add(role, 'اعفاء — استعادة رتبة'); } catch { /* skip */ } } }
    removePrisoner(target.id, message.guild.id);
    try { await target.send(`🔓 تم الإفراج عنك من سيرفر **${message.guild.name}**! 🎉`).catch(() => {}); } catch { /* DMs closed */ }
    await message.react('✅').catch(() => {});
  }
};

// اعكس
const اعكسChannels = new Set();
const اعكسWORDS = ['مرحبا','ديسكورد','العاب','سريع','روليت','مافيا','فيديو','كلمة','شجاعة','اسد','قمر','نجمة','سماء','بحر','جبل','صحراء','كتاب','قلم','باب','نافذة','شمس','نار','سلام','فرح','ضحكة','بطل','قوة','حلم','قلب','روح','طريق','دولة','ارض','سحاب','مطر','ثلج','نهر','غابة','ذهب','خشب','خبز','سمك','تفاح','حليب','عسل','نمر','فيل','صقر','نسر','كلب','حصان','جمل','بطة','ديك','قطة','نار','حجر','ماء','هواء','تراب','شاطئ','نهضة','قيادة','ابداع','حضارة','تراث','ثقافة','جزيرة','بركان'];
const cmdاعكس = {
  name: 'اعكس', aliases: ['reverse', 'عكس'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (اعكسChannels.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    اعكسChannels.add(channelId);
    const word = اعكسWORDS[Math.floor(Math.random() * اعكسWORDS.length)], reversed = word.split('').reverse().join('');
    await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔄 اعكس الكلمة!').setColor(0x7D0C22).setDescription(`## \`${reversed}\`\n\n**اعكس هذه الكلمة واكتبها صحيحة!**\n⏱ لديك **20 ثانية**`).setFooter({ text: 'أسرع لاعب يكتب الجواب يفوز!' })] });
    try {
      const collected = await message.channel.awaitMessages({ filter: m => !m.author.bot && m.content.trim() === word, max: 1, time: 20_000, errors: ['time'] });
      const winner = collected.first().author;
      ensureUser(winner.id, message.guild.id, winner.username);
      recordGameResult(winner.id, message.guild.id, 'اعكس', 'win', 1);
      await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎉 صحيح!').setColor(0x7D0C22).setDescription(`**<@${winner.id}> فاز!**\n✅ الجواب: **${word}**\n💰 **+1 نقطة**`)] });
    } catch {
      await message.channel.send({ embeds: [new EmbedBuilder().setTitle('⏰ انتهى الوقت!').setColor(0x7D0C22).setDescription(`الكلمة الصحيحة كانت: **${word}**`)] });
    }
    اعكسChannels.delete(channelId);
  }
};

// اعلام
const اعلامChannels = new Set();
const FLAGS = [
  { code: 'sa', name: 'السعودية', aliases: ['المملكة','سعوديه','السعوديه'] }, { code: 'ae', name: 'الإمارات', aliases: ['الامارات','إمارات','امارات'] },
  { code: 'kw', name: 'الكويت', aliases: ['كويت'] }, { code: 'qa', name: 'قطر', aliases: [] },
  { code: 'bh', name: 'البحرين', aliases: ['بحرين'] }, { code: 'om', name: 'عُمان', aliases: ['عمان','سلطنة عمان'] },
  { code: 'ye', name: 'اليمن', aliases: ['يمن'] }, { code: 'iq', name: 'العراق', aliases: ['عراق'] },
  { code: 'sy', name: 'سوريا', aliases: ['سوريه','الشام'] }, { code: 'lb', name: 'لبنان', aliases: [] },
  { code: 'jo', name: 'الأردن', aliases: ['الاردن','اردن'] }, { code: 'ps', name: 'فلسطين', aliases: [] },
  { code: 'eg', name: 'مصر', aliases: [] }, { code: 'ly', name: 'ليبيا', aliases: [] },
  { code: 'tn', name: 'تونس', aliases: [] }, { code: 'dz', name: 'الجزائر', aliases: ['جزائر'] },
  { code: 'ma', name: 'المغرب', aliases: ['مغرب'] }, { code: 'sd', name: 'السودان', aliases: ['سودان'] },
  { code: 'so', name: 'الصومال', aliases: ['صومال'] }, { code: 'mr', name: 'موريتانيا', aliases: [] },
  { code: 'us', name: 'أمريكا', aliases: ['امريكا','الولايات المتحدة','usa'] }, { code: 'gb', name: 'بريطانيا', aliases: ['انجلترا','المملكة المتحدة','uk'] },
  { code: 'fr', name: 'فرنسا', aliases: [] }, { code: 'de', name: 'ألمانيا', aliases: ['المانيا','جرمانيا'] },
  { code: 'it', name: 'إيطاليا', aliases: ['ايطاليا'] }, { code: 'es', name: 'إسبانيا', aliases: ['اسبانيا'] },
  { code: 'ru', name: 'روسيا', aliases: [] }, { code: 'cn', name: 'الصين', aliases: ['صين'] },
  { code: 'jp', name: 'اليابان', aliases: ['يابان'] }, { code: 'kr', name: 'كوريا الجنوبية', aliases: ['كوريا','كوريا الجنوبيه'] },
  { code: 'in', name: 'الهند', aliases: ['هند'] }, { code: 'pk', name: 'باكستان', aliases: [] },
  { code: 'tr', name: 'تركيا', aliases: ['تركيه'] }, { code: 'ir', name: 'إيران', aliases: ['ايران'] },
  { code: 'br', name: 'البرازيل', aliases: ['برازيل'] }, { code: 'mx', name: 'المكسيك', aliases: ['مكسيك'] },
  { code: 'ca', name: 'كندا', aliases: [] }, { code: 'au', name: 'أستراليا', aliases: ['استراليا'] },
  { code: 'za', name: 'جنوب أفريقيا', aliases: ['جنوب افريقيا'] }, { code: 'ng', name: 'نيجيريا', aliases: [] },
  { code: 'th', name: 'تايلاند', aliases: ['تايلند'] }, { code: 'id', name: 'إندونيسيا', aliases: ['اندونيسيا'] },
  { code: 'my', name: 'ماليزيا', aliases: [] }, { code: 'nl', name: 'هولندا', aliases: [] },
  { code: 'pl', name: 'بولندا', aliases: [] }, { code: 'ar', name: 'الأرجنتين', aliases: ['ارجنتين'] },
  { code: 'pt', name: 'البرتغال', aliases: ['برتغال'] }, { code: 'ch', name: 'سويسرا', aliases: [] },
  { code: 'se', name: 'السويد', aliases: ['سويد'] }, { code: 'no', name: 'النرويج', aliases: ['نرويج'] },
];
const cmdاعلام = {
  name: 'اعلام', aliases: ['flags', 'علم', 'flag'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (اعلامChannels.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    اعلامChannels.add(channelId);
    const flag = FLAGS[Math.floor(Math.random() * FLAGS.length)];
    const allAnswers = [flag.name.toLowerCase(), ...flag.aliases.map(a => a.toLowerCase())];
    let imgBuffer = null;
    try { imgBuffer = await generateFlagChallengeImage(flag.code); } catch (e) { console.error('Flag image failed:', e.message); }
    if (imgBuffer) {
      await message.channel.send({ content: '**🏳️ اعلام — ما اسم هذا العلم؟ لديك 20 ثانية!**', files: [new AttachmentBuilder(imgBuffer, { name: 'flag_challenge.png' })] });
    } else { await message.channel.send('**🏳️ اعلام — ما اسم هذا العلم؟ (تعذّر تحميل الصورة)**'); }
    try {
      const collected = await message.channel.awaitMessages({ filter: m => !m.author.bot && allAnswers.includes(m.content.trim().toLowerCase()), max: 1, time: 20_000, errors: ['time'] });
      const winner = collected.first().author;
      ensureUser(winner.id, message.guild.id, winner.username);
      recordGameResult(winner.id, message.guild.id, 'اعلام', 'win', 1);
      await message.channel.send(`**🎉 <@${winner.id}> فاز!\n✅ الجواب: ${flag.name}\n+1 نقطة**`);
    } catch { await message.channel.send(`**⏰ انتهى الوقت! العلم كان: ${flag.name}**`); }
    اعلامChannels.delete(channelId);
  }
};

// اكشف
const اكشفChannels = new Set();
const اكشفWORDS = ['شجاعة','مدرسة','سيارة','طائرة','مستشفى','حديقة','مكتبة','مطبخ','غرفة','شاشة','هاتف','ساعة','كرسي','طاولة','نافذة','سلم','باحة','مسبح','ملعب','مطعم','فندق','سوق','صيدلية','بنك','متحف','قلعة','مسجد','مطار','ميناء','قطار','دراجة','سفينة','منارة','برج','جزيرة','بركان','صخرة','مغارة','واحة','تلة'];
function maskWord(word, revealed) { return word.split('').map((ch, i) => revealed.has(i) ? ch : '\\_').join(' '); }
const cmdاكشف = {
  name: 'اكشف', aliases: ['reveal', 'اكتشف'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (اكشفChannels.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    اكشفChannels.add(channelId);
    const word = اكشفWORDS[Math.floor(Math.random() * اكشفWORDS.length)], revealed = new Set([0, word.length - 1]);
    let done = false;
    let gameMsg = await message.channel.send(`**🔍 اكشف الكلمة — ${word.length} حروف • 30 ثانية**\n\`${maskWord(word, revealed)}\``);
    const revealTimer = setInterval(async () => {
      if (done) return clearInterval(revealTimer);
      const unrevealed = Array.from({ length: word.length }, (_, i) => i).filter(i => !revealed.has(i));
      if (unrevealed.length === 0) return clearInterval(revealTimer);
      revealed.add(unrevealed[Math.floor(Math.random() * unrevealed.length)]);
      await gameMsg.edit(`**🔍 اكشف الكلمة — ${word.length} حروف**\n\`${maskWord(word, revealed)}\``).catch(() => {});
    }, 5000);
    try {
      const collected = await message.channel.awaitMessages({ filter: m => !m.author.bot && m.content.trim() === word, max: 1, time: 30_000, errors: ['time'] });
      done = true; clearInterval(revealTimer);
      const winner = collected.first().author;
      ensureUser(winner.id, message.guild.id, winner.username);
      recordGameResult(winner.id, message.guild.id, 'اكشف', 'win', 1);
      await gameMsg.edit(`**🔍 اكشف الكلمة — ${word} ✅**`).catch(() => {});
      await message.channel.send(`**🎉 <@${winner.id}> فاز!\n✅ الجواب: ${word}\n+1 نقطة**`);
    } catch {
      done = true; clearInterval(revealTimer);
      await message.channel.send(`**⏰ انتهى الوقت! الكلمة كانت: ${word}**`);
    }
    اكشفChannels.delete(channelId);
  }
};

// العاب
const cmdالعاب = {
  name: 'العاب', aliases: ['games', 'الالعاب'],
  async execute(message) {
    await message.channel.send({ embeds: [makeEmbed({ title: '🎮 ألعاب السيرفر', color: COLORS.primary, description: '### ألعاب السيرفر\n`-` روليت\n`-` xo\n`-` مافيا\n`-` كراسي\n`-` حجرة\n`-` عجلة\n`-` ريبلكا\n`-` غميضة\n\n### ألعاب فردية\n`-` زر\n`-` اسرع\n`-` اعلام\n`-` اعكس\n`-` اكشف\n\n### النقاط\n`-` نقاطي\n`-` تحويل @شخص كمية\n`-` add @شخص كمية', footer: 'اكتب - مع اسم اللعبة لتبدأ!' })] });
  }
};

// تحويل
const cmdتحويل = {
  name: 'تحويل', aliases: ['transfer', 'send'],
  async execute(message, args) {
    const target = message.mentions.users.first(), amount = parseInt(args[1] ?? args[0]);
    if (!target) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ المنشن الشخص اللي تبي تحوّل له.\nمثال: `-تحويل @شخص 500`' }] });
    if (!amount || amount < 1) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ حدد كمية صحيحة.\nمثال: `-تحويل @شخص 500`' }] });
    if (target.id === message.author.id) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ ما تقدر تحوّل لنفسك!' }] });
    if (target.bot) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ ما تقدر تحوّل للبوتات!' }] });
    const sender = ensureUser(message.author.id, message.guild.id, message.author.username);
    if (sender.points < amount) return message.reply({ embeds: [{ color: 0x7D0C22, description: `❌ رصيدك غير كافٍ! عندك **${sender.points.toLocaleString()}** نقطة فقط.` }] });
    ensureUser(target.id, message.guild.id, target.username);
    addPoints(message.author.id, message.guild.id, -amount, `تحويل لـ ${target.username}`);
    addPoints(target.id, message.guild.id, amount, `تحويل من ${message.author.username}`);
    await message.channel.send({ embeds: [makeEmbed({ title: '💸 تم التحويل!', color: COLORS.success, fields: [{ name: '📤 من', value: `<@${message.author.id}>`, inline: true }, { name: '📥 إلى', value: `<@${target.id}>`, inline: true }, { name: '💰 المبلغ', value: `**${amount.toLocaleString()}** نقطة`, inline: true }, { name: '💼 رصيدك المتبقي', value: `${(sender.points - amount).toLocaleString()} نقطة`, inline: false }], timestamp: true })] });
  }
};

// تكلم
const cmdتكلم = {
  name: 'تكلم', aliases: ['unmute', 'untimeout'], cooldown: 3,
  async execute(message, args, client) {
    let target = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = replied.member || await message.guild.members.fetch(replied.author.id).catch(() => null);
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.members?.size > 0) target = message.mentions.members.first();
    if (!target || !target.isCommunicationDisabled()) return;
    try { await target.timeout(null, `فك كتم بواسطة ${message.author.tag}`); await message.react('✅').catch(() => {}); } catch { /* ignore */ }
  }
};

// حجرة
const حجرةGames = new Map();
const RPS_CHOICES = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const RPS_EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
function حجرةLobbyEmbed(players, endTs) {
  return new EmbedBuilder().setTitle('🪨 حجرة ورقة مقص').setColor(0x7D0C22)
    .setDescription('**طريقة اللعب:**\n> يتم اختيار اللاعبين عشوائياً للمنافسة\n> الخاسر يُطرد، الفائز يكمل\n> **عند التعادل → تُعاد الجولة بين المتعادلَين!**\n> آخر لاعب يفوز بـ **1 نقطة**\n\n' + `**👥 اللاعبون: (${players.length}/20)**\n` + (players.length > 0 ? players.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n') : '> لا يوجد لاعبون بعد') + `\n\nستبدأ اللعبة <t:${endTs}:R>`);
}
async function rpsCollectChoices(channel, players) {
  const ids = new Set(players.map(p => p.id));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 حجر').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Danger),
  );
  const msg = await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**🎮 اختاروا سلاحكم! (15 ثانية)**\n${players.map(p => `<@${p.id}>`).join(' ')}`)], components: [row] });
  const choices = {};
  const coll = msg.createMessageComponentCollector({ filter: i => ids.has(i.user.id), time: 15_000 });
  coll.on('collect', async i => {
    choices[i.user.id] = i.customId.replace('rps_', '');
    await i.reply({ content: `**✅ اخترت ${RPS_CHOICES[choices[i.user.id]]}!**`, ephemeral: true });
    if (Object.keys(choices).length >= players.length) coll.stop('done');
  });
  await sleep(15_000);
  coll.stop();
  await msg.edit({ components: [] });
  for (const p of players) { if (!choices[p.id]) { const keys = Object.keys(RPS_CHOICES); choices[p.id] = keys[Math.floor(Math.random() * keys.length)]; } }
  return choices;
}
async function rpsPlayDuel(channel, p1, p2) {
  let tieCount = 0;
  while (true) {
    if (tieCount > 0) { await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**🔁 تعادل مرة ${tieCount}! <@${p1.id}> و <@${p2.id}> — أعيدوا الاختيار!**`)] });
    await sleep(1000); }
    const choices = await rpsCollectChoices(channel, [p1, p2]), c1 = choices[p1.id], c2 = choices[p2.id];
    if (c1 === c2) { tieCount++; await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**🤝 تعادل!**\n<@${p1.id}> ${RPS_EMOJI[c1]}  vs  ${RPS_EMOJI[c2]} <@${p2.id}>\n*كلاهما اختار ${RPS_CHOICES[c1]}!*`)] }); continue; }
    const winner = RPS_BEATS[c1] === c2 ? p1 : p2, loser = winner.id === p1.id ? p2 : p1;
    const wChoice = winner.id === p1.id ? c1 : c2, lChoice = loser.id === p1.id ? c1 : c2;
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**${RPS_EMOJI[c1]} <@${p1.id}> vs <@${p2.id}> ${RPS_EMOJI[c2]}**\n\n🏆 فاز **<@${winner.id}>** بـ ${RPS_CHOICES[wChoice]} على ${RPS_CHOICES[lChoice]}!`)] });
    return { winner, loser };
  }
}
async function rpsRunGame(channel, game, channelId) {
  let remaining = [...game.players], roundNum = 1;
  while (remaining.length > 1) {
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setTitle(`🪨 الجولة ${roundNum}`).setDescription(`**المشاركون:**\n${shuffled.map(p => `<@${p.id}>`).join('  ')}` + (shuffled.length % 2 !== 0 ? `\n\n⚡ <@${shuffled[shuffled.length - 1].id}> تخطى مباشرة للجولة القادمة!` : ''))] });
    await sleep(1500);
    const nextRound = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      const p1 = shuffled[i], p2 = shuffled[i + 1];
      if (!p2) { nextRound.push(p1); continue; }
      const { winner, loser } = await rpsPlayDuel(channel, p1, p2);
      recordGameResult(loser.id, channel.guild.id, 'حجرة ورقة مقص', 'loss', 0);
      nextRound.push(winner);
    }
    remaining = nextRound; roundNum++;
    await sleep(2000);
  }
  حجرةGames.delete(channelId);
  if (remaining.length === 1) {
    const winner = remaining[0];
    recordGameResult(winner.id, channel.guild.id, 'حجرة ورقة مقص', 'win', 1);
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setTitle('🏆 الفائز!').setDescription(`## 🎉 <@${winner.id}>\n**${winner.username}** فاز بلعبة حجرة ورقة مقص!\n💰 **+1 نقطة**`).setFooter({ text: 'مبروك! 🎊' })] });
  }
}
const cmdحجرة = {
  name: 'حجرة', aliases: ['rps', 'حجر'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (حجرةGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const endTs = Math.floor((Date.now() + 21_000) / 1000);
    const game = { players: [], phase: 'lobby', endTs };
    حجرةGames.set(channelId, game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hjr_join').setLabel('✚ انضمام').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('hjr_leave').setLabel('↩ انسحاب').setStyle(ButtonStyle.Danger),
    );
    const sentMsg = await message.channel.send({ embeds: [حجرةLobbyEmbed(game.players, endTs)], components: [row] });
    const collector = sentMsg.createMessageComponentCollector({ time: 21_000 });
    collector.on('collect', async i => {
      const g = حجرةGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'hjr_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود!**', ephemeral: true });
        if (g.players.length >= 20) return i.reply({ content: '**❌ اكتمل العدد!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        const name = i.member?.displayName || i.user.username;
        g.players.push({ id: i.user.id, username: name });
        return i.update({ embeds: [حجرةLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'hjr_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
      return i.update({ embeds: [حجرةLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });
    setTimeout(async () => {
      const g = حجرةGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 2) { حجرةGames.delete(channelId);
      return sentMsg.edit({ embeds: [], components: [], content: '**❌ يحتاج لاعبان على الأقل!**' }); }
      g.phase = 'playing';
      await sentMsg.edit({ components: [], embeds: [حجرةLobbyEmbed(g.players, g.endTs)] });
      await rpsRunGame(message.channel, g, channelId);
    }, 21_000);
  }
};

// حذف
const cmdحذف = {
  name: 'حذف', aliases: ['clear', 'purge', 'delete'], cooldown: 3,
  async execute(message, args, client) {
    const isReply = !!message.reference?.messageId, hasMention = message.mentions.users.size > 0;
    const numArg = args.find(a => !isNaN(parseInt(a)) && !a.startsWith('<')), count = numArg ? Math.min(Math.max(1, parseInt(numArg)), 100) : 1;
    if (isReply && !hasMention) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        const toDelete = [message.id, replied.id];
        await message.channel.bulkDelete(toDelete, true).catch(async () => { for (const id of toDelete) await message.channel.messages.fetch(id).then(m => m.delete()).catch(() => {}); });
        const confirm = await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('**🗑️ تم حذف الرسالتين.**')] });
        setTimeout(() => confirm.delete().catch(() => {}), 3000);
      } catch (e) { console.error('Delete reply error:', e);
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('**❌ فشل الحذف!**')] }); }
      return;
    }
    if (hasMention) {
      const targetUser = message.mentions.users.first(), deleteCount = count > 1 ? count : 20;
      try {
        await message.delete().catch(() => {});
        const fetched = await message.channel.messages.fetch({ limit: 100 });
        const userMsgs = fetched.filter(m => m.author.id === targetUser.id).first(deleteCount);
        if (userMsgs.length === 0) { const noMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**⚠️ لا توجد رسائل لـ <@${targetUser.id}> في آخر 100 رسالة.**`)] }); setTimeout(() => noMsg.delete().catch(() => {}), 4000); return; }
        const ids = userMsgs.map(m => m.id);
        await message.channel.bulkDelete(ids, true).catch(async () => { for (const id of ids) await message.channel.messages.fetch(id).then(m => m.delete()).catch(() => {}); });
        const confirm = await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**🗑️ تم حذف ${userMsgs.length} رسالة لـ <@${targetUser.id}>.**`)] });
        setTimeout(() => confirm.delete().catch(() => {}), 4000);
      } catch (e) { console.error('Delete user msgs error:', e);
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('**❌ فشل الحذف!**')] }); }
      return;
    }
    const deleteCount = count + 1;
    try {
      const fetched = await message.channel.messages.fetch({ limit: Math.min(deleteCount, 100) }), toDelete = fetched.first(deleteCount), ids = toDelete.map(m => m.id);
      await message.channel.bulkDelete(ids, true).catch(async () => { for (const id of ids) await message.channel.messages.fetch(id).then(m => m.delete()).catch(() => {}); });
      const actualDeleted = Math.min(count, toDelete.length - 1);
      const confirm = await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**🗑️ تم حذف ${actualDeleted} رسالة.**`)] });
      setTimeout(() => confirm.delete().catch(() => {}), 3000);
    } catch (e) { console.error('Bulk delete error:', e);
      return message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('**❌ فشل الحذف! (الرسائل أقدم من 14 يوم لا يمكن حذفها)**')] }); }
  }
};

// روليت
const روليتGames = new Map(), LOBBY_DURATION = 30_000;
function روليتBuildJoinRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('روليت_عشوائي').setLabel('✚  انضمام').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('روليت_خروج').setLabel('↩  انسحاب').setStyle(ButtonStyle.Danger),
  );
}
function روليتBuildLobbyEmbed(game, endTs) {
  const playerList = game.players.length > 0 ? game.players.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n') : '> لا يوجد لاعبون بعد';
  return new EmbedBuilder().setTitle('🎡 روليت — انتظار اللاعبين').setColor(0x7D0C22).setDescription(`**👥 اللاعبون: ${game.players.length}/20**\n**⏱ تبدأ <t:${endTs}:R>**\n\n${playerList}`).setFooter({ text: 'اضغط ✚ للانضمام — يحتاج لاعبان على الأقل' });
}
async function روليتSpinAndReveal(channel, players, winnerIdx) {
  let gifBuf, stoppedBuf, gifDuration;
  try { const result = await generateSpinningWheelGif(players.map(p => p.username), winnerIdx); gifBuf = result.gifBuffer; stoppedBuf = result.stoppedImageBuffer; gifDuration = result.totalDurationMs; } catch (e) { console.error('Wheel GIF error:', e.message); return; }
  const spinMsg = await channel.send({ content: '**🎡 العجلة تدور...**', files: [new AttachmentBuilder(Buffer.from(gifBuf), { name: 'wheel_spin.gif' })] });
  await sleep(Math.min(gifDuration + 300, 5500));
  try { await spinMsg.delete(); } catch { /* ignore */ }
  await channel.send({ content: `**🎯 توقفت العجلة على: <@${players[winnerIdx].id}>!**`, files: [new AttachmentBuilder(stoppedBuf, { name: 'wheel_stopped.png' })] });
}
async function روليتSendWinnerEmbed(channel, guild, winner) {
  let avatarUrl = null;
  try { const member = await guild.members.fetch(winner.id); avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }); } catch { /* ignored */ }
  const embed = new EmbedBuilder().setTitle('🏆 الفائز!').setColor(0x7D0C22).setDescription(`## 🎉 <@${winner.id}>\n**${winner.username}** فاز بلعبة الروليت!\n\n💰 **+3 نقاط**`).setFooter({ text: 'مبروك للفائز! 🎊' });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  await channel.send({ content: '@here', embeds: [embed] });
}
async function روليتRunGame(message, game, channelId, client) {
  const channel = message.channel;
  while (game.players.length > 1) {
    const chosenIdx = Math.floor(Math.random() * game.players.length);
    const chosen = game.players[chosenIdx];
    await channel.send(`**🎡 الجولة ${game.round} — اللاعبون:** ${game.players.map(p => `<@${p.id}>`).join(' ')}`);
    await روليتSpinAndReveal(channel, game.players, chosenIdx);
    await sleep(800);

    const otherPlayers = game.players.filter(p => p.id !== chosen.id);
    const btnRows = [];
    const allOptions = [...otherPlayers];
    const chunks = [];
    for (let i = 0; i < allOptions.length; i += 5) chunks.push(allOptions.slice(i, i + 5));
    for (const chunk of chunks) {
      const row = new ActionRowBuilder().addComponents(chunk.map(p => new ButtonBuilder().setCustomId(`rlt_kick_${p.id}`).setLabel(p.username.slice(0, 20)).setStyle(ButtonStyle.Secondary)));
      btnRows.push(row);
    }
    const withdrawRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rlt_withdraw').setLabel('↩ انسحاب (أطرد نفسي)').setStyle(ButtonStyle.Secondary));
    btnRows.push(withdrawRow);

    const pickMsg = await channel.send({ content: `<@${chosen.id}> **العجلة وقفت عليك! اختر من تطرد أو اضغط انسحاب لتطرد نفسك (30 ثانية)**`, components: btnRows });

    let eliminated = chosen;
    try {
      const pick = await pickMsg.awaitMessageComponent({ filter: i => i.user.id === chosen.id, time: 30_000 });
      await pick.deferUpdate();
      if (pick.customId === 'rlt_withdraw') {
        eliminated = chosen;
      } else {
        const kickId = pick.customId.replace('rlt_kick_', '');
        eliminated = game.players.find(p => p.id === kickId) || chosen;
      }
    } catch { eliminated = chosen; }

    try { await pickMsg.edit({ components: [] }); } catch { /* ignore */ }

    game.players = game.players.filter(p => p.id !== eliminated.id);
    game.round++;
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`**❌ تم طرد <@${eliminated.id}>!**\n**المتبقون (${game.players.length}):** ${game.players.map(p => `<@${p.id}>`).join(' ')}`)] });
    await sleep(3000);
  }
  if (game.players.length === 1) {
    const winner = game.players[0];
    addPoints(winner.id, channel.guild.id, 3);
    روليتGames.delete(channelId);
    await روليتSendWinnerEmbed(channel, channel.guild, winner);
  }
}
const cmdروليت = {
  name: 'روليت', aliases: ['roulette'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (روليتGames.has(channelId)) return message.reply('**❌ يوجد لعبة روليت نشطة بالفعل!**');
    const endTs = Math.floor((Date.now() + LOBBY_DURATION) / 1000);
    const game = { players: [], eliminated: [], phase: 'lobby', round: 1, endTs };
    روليتGames.set(channelId, game);
    const lobbyMsg = await message.channel.send({ embeds: [روليتBuildLobbyEmbed(game, endTs)], components: [روليتBuildJoinRow()] });
    const collector = lobbyMsg.createMessageComponentCollector({ time: LOBBY_DURATION + 2000 });
    collector.on('collect', async i => {
      const g = روليتGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'روليت_خروج') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ أنت لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
        return i.update({ embeds: [روليتBuildLobbyEmbed(g, g.endTs)] });
      }
      if (i.customId === 'روليت_عشوائي') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود بالفعل!**', ephemeral: true });
        if (g.players.length >= 20) return i.reply({ content: '**❌ اكتمل عدد اللاعبين (20)!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        const displayName = i.member?.displayName || i.user.username;
        g.players.push({ id: i.user.id, username: displayName });
        return i.update({ embeds: [روليتBuildLobbyEmbed(g, g.endTs)] });
      }
    });
    setTimeout(async () => {
      const g = روليتGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 2) {
        روليتGames.delete(channelId);
        return lobbyMsg.edit({ embeds: [], content: '**❌ لم يكن هناك لاعبون كافيون (يلزم لاعبان على الأقل).**', components: [] }); }
      g.phase = 'playing';
      await lobbyMsg.edit({ embeds: [], content: `**🎡 انتهى وقت التسجيل! اللاعبون: ${g.players.map(p => `<@${p.id}>`).join(' ')}**`, components: [] });
      await روليتRunGame(message, g, channelId, client);
    }, LOBBY_DURATION);
  }
};

// ريبلكا
const ريبلكاGames = new Map();
const REPLIKA_CATEGORIES = ['اسم','حيوان','نبات','دولة','مدينة','طعام','لون','مهنة','جماد','فاكهة'];
const ARABIC_LETTERS = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
function ريبلكاLobbyEmbed(players, endTs) {
  return new EmbedBuilder().setTitle('🔤 ريبلكا').setColor(0x7D0C22)
    .setDescription('**طريقة اللعب:**\n1- شارك بالضغط على الزر أدناه\n2- كل جولة: حرف عشوائي + تصنيف عشوائي\n3- اللاعب المختار يكتب كلمة تبدأ بالحرف من التصنيف\n4- أعلى نقاط في 5 جولات يفوز!\n\n' + `**اللاعبون المشاركون: (${players.length}/10)**\n\nستبدأ اللعبة <t:${endTs}:R>`);
}
async function ريبلكاRunGame(channel, game, channelId) {
  const rounds = 5;
  for (let r = 1; r <= rounds; r++) {
    const letter = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    const category = REPLIKA_CATEGORIES[Math.floor(Math.random() * REPLIKA_CATEGORIES.length)];
    const target = game.players[Math.floor(Math.random() * game.players.length)];
    await channel.send(`<@${target.id}> **الجولة ${r}/${rounds}\nالحرف: ${letter} | التصنيف: ${category}\nاكتب كلمة تبدأ بـ ${letter} من ${category}! (20 ثانية)**`);
    try {
      const collected = await channel.awaitMessages({ filter: m => m.author.id === target.id, max: 1, time: 20_000, errors: ['time'] });
      const answer = collected.first().content.trim();
      if (answer.startsWith(letter) || answer.startsWith('ا')) {
        target.score = (target.score || 0) + 1;
        await channel.send(`**✅ <@${target.id}> أجاب: ${answer} — صح! (+1)**`);
      } else {
        await channel.send(`**❌ <@${target.id}> أجاب: ${answer} — الكلمة لا تبدأ بـ ${letter}!**`);
      }
    } catch { await channel.send(`**⏰ <@${target.id}> لم يجب في الوقت!**`); }
    await sleep(2000);
  }
  const sorted = [...game.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const winner = sorted[0];
  recordGameResult(winner.id, channel.guild.id, 'ريبلكا', 'win', 1);
  ريبلكاGames.delete(channelId);
  const results = sorted.map((p, i) => `${i + 1}. <@${p.id}> — ${p.score || 0} نقطة`).join('\n');
  await channel.send(`**🔤 انتهت ريبلكا!\nالنتائج:\n${results}\n\n🏆 الفائز: <@${winner.id}>! +1 نقطة**`);
}
const cmdريبلكا = {
  name: 'ريبلكا', aliases: ['replika'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (ريبلكاGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const endTs = Math.floor((Date.now() + 27_000) / 1000);
    const game = { players: [], phase: 'lobby', endTs };
    ريبلكاGames.set(channelId, game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rep_join').setLabel('دخول إلى اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rep_leave').setLabel('اخرج من اللعبة').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rep_store').setLabel('⚡ متجر اللعبة').setStyle(ButtonStyle.Primary),
    );
    const sentMsg = await message.channel.send({ embeds: [ريبلكاLobbyEmbed(game.players, endTs)], components: [row] });
    const collector = sentMsg.createMessageComponentCollector({ time: 90_000 });
    collector.on('collect', async i => {
      const g = ريبلكاGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'rep_store') return i.reply({ content: '**🏪 قريباً!**', ephemeral: true });
      if (i.customId === 'rep_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        g.players.push({ id: i.user.id, username: i.user.username, score: 0 });
        return i.update({ embeds: [ريبلكاLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'rep_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
      return i.update({ embeds: [ريبلكاLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });
    setTimeout(async () => {
      const g = ريبلكاGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 2) { ريبلكاGames.delete(channelId);
      return sentMsg.edit({ embeds: [], components: [], content: '**❌ يحتاج لاعبين أكثر!**' }); }
      g.phase = 'playing';
      await sentMsg.edit({ components: [], embeds: [ريبلكاLobbyEmbed(g.players, g.endTs)] });
      await ريبلكاRunGame(message.channel, g, channelId);
    }, 27_000);
  }
};

// زر
const زرChannels = new Set();
const cmdزر = {
  name: 'زر', aliases: ['button', 'btn'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (زرChannels.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    زرChannels.add(channelId);
    const greenPos = Math.floor(Math.random() * 9);
    function buildGrid(disabled = false, revealGreen = false) {
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const idx = r * 3 + c, isGreen = idx === greenPos;
          row.addComponents(new ButtonBuilder().setCustomId(`زر_${idx}`).setLabel(revealGreen && isGreen ? '🟢' : '·').setStyle(revealGreen && isGreen ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(disabled));
        }
        rows.push(row);
      }
      return rows;
    }
    const msg = await message.channel.send({ content: '**🟢 زر — أضغط على الزر الأخضر أول واحد! لديك 30 ثانية**', components: buildGrid() });
    const collector = msg.createMessageComponentCollector({ time: 30_000, max: 1 });
    collector.on('collect', async i => {
      const chosen = parseInt(i.customId.replace('زر_', '')), won = chosen === greenPos;
      ensureUser(i.user.id, message.guild.id, i.user.username);
      if (won) recordGameResult(i.user.id, message.guild.id, 'زر', 'win', 1);
      await i.update({ content: won ? `**🟢 <@${i.user.id}> فاز! ضغط الزر الأخضر! +1 نقطة 🏆**` : `**❌ <@${i.user.id}> ضغط الزر الخاطئ!**`, components: buildGrid(true, true) });
      زرChannels.delete(channelId);
    });
    collector.on('end', (coll, reason) => {
      زرChannels.delete(channelId);
      if (reason === 'time') msg.edit({ content: '**⏰ انتهى الوقت! لم يضغط أحد على الزر الأخضر.**', components: buildGrid(true, true) }).catch(() => {});
    });
  }
};

// سجن
const cmdسجن = {
  name: 'سجن', aliases: ['jail', 'prison'], cooldown: 3,
  async execute(message, args, client) {
    let target = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = await message.guild.members.fetch(replied.author.id).catch(() => null);
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.members?.size > 0) target = message.mentions.members.first();
    if (!target || target.id === message.author.id || target.id === client.user.id) return message.react('❌').catch(() => {});
    if (!target.manageable) return message.reply('❌ رتبة البوت أقل من رتبة الشخص، ارفع رتبة البوت في السيرفر.');

    // تحقق من وجود prison role وصلاحية البوت عليها
    const prisonRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'prison');
    if (!prisonRole) return message.reply('❌ رتبة `prison` غير موجودة في السيرفر، أنشئها أولاً.');

    // إذا عنده رتبة prison بالفعل = مسجون
    if (target.roles.cache.has(prisonRole.id)) return message.reply('⚠️ هذا الشخص مسجون بالفعل!');

    // احفظ الرتب الحالية
    const savedRoleIds = target.roles.cache.filter(r => r.id !== message.guild.id && !r.managed && r.id !== prisonRole.id).map(r => r.id);

    // شيل كل الرتب
    const rolesToRemove = target.roles.cache.filter(r => r.id !== message.guild.id && !r.managed);
    if (rolesToRemove.size > 0) {
      try { await target.roles.remove([...rolesToRemove.keys()], 'سجن'); }
      catch (e) { return message.reply(`❌ فشل شيل الرتب: تأكد أن البوت عنده صلاحية \`Manage Roles\` ورتبته أعلى من رتب العضو.\n\`${e.message}\``); }
    }

    // أضف رتبة prison
    try { await target.roles.add(prisonRole, 'سجن'); }
    catch (e) { return message.reply(`❌ فشل إضافة رتبة prison: \`${e.message}\``); }

    // احفظ البيانات بعد نجاح العملية
    savePrisoner(target.id, message.guild.id, savedRoleIds);

    // منشن في قناة prison
    const prisonChannel = message.guild.channels.cache.find(c => c.name.toLowerCase() === 'prison' && c.isTextBased());
    if (prisonChannel) { try { await prisonChannel.send(`🔒 <@${target.id}> تم سجنه!`); } catch { /* تجاهل */ } }

    // DM للمسجون
    try { await target.send(`🔒 تم سجنك في سيرفر **${message.guild.name}**!`); } catch { /* DMs مغلق */ }

    await message.react('✅').catch(() => {});
  }
};

// قفل
const cmdقفل = {
  name: 'قفل', aliases: ['lock'], cooldown: 3,
  async execute(message, args, client) {
    const channel = message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      await message.react('✅').catch(() => {});
      await channel.send({ embeds: [{ color: 0x7D0C22, description: `🔒 **تم قفل القناة بواسطة <@${message.author.id}>**` }] });
    } catch {
      await message.react('❌').catch(() => {});
    }
  }
};

// فتح
const cmdفتح = {
  name: 'فتح', aliases: ['unlock'], cooldown: 3,
  async execute(message, args, client) {
    const channel = message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      await message.react('✅').catch(() => {});
      await channel.send({ embeds: [{ color: 0x7D0C22, description: `🔓 **تم فتح القناة بواسطة <@${message.author.id}>**` }] });
    } catch {
      await message.react('❌').catch(() => {});
    }
  }
};

// رول
function roleDistance(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (b.includes(a) || a.includes(b)) return 0;
  let dist = 0;

  let i = 0;

  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] !== b[j]) dist++;
    i++;
    j++;
  }
  dist += Math.abs(a.length - b.length);
  return dist;
}
const cmdرول = {
  name: 'رول', aliases: ['role'], cooldown: 3,
  async execute(message, args, client) {
    let target = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = await message.guild.members.fetch(replied.author.id).catch(() => null);
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.members?.size > 0) target = message.mentions.members.first();
    const query = args.filter(a => !a.startsWith('<')).join(' ').trim();
    if (!target || !query) return message.react('❌').catch(() => {});
    const roles = message.guild.roles.cache.filter(r => r.id !== message.guild.id && !r.managed);
    let best = null;
    let bestDist = Infinity;
    for (const [, role] of roles) {
      const d = roleDistance(query, role.name);
      if (d < bestDist) {
        bestDist = d;
        best = role;
      }
    }
    if (!best || bestDist > Math.max(best.name.length, query.length)) return message.react('❌').catch(() => {});
    try {
      if (target.roles.cache.has(best.id)) {
        await target.roles.remove(best, `رول بواسطة ${message.author.tag}`);
        await message.react('➖').catch(() => {});
        await message.react('✅').catch(() => {});
      } else {
        await target.roles.add(best, `رول بواسطة ${message.author.tag}`);
        await message.react('✅').catch(() => {});
      }
    } catch {
      await message.react('❌').catch(() => {});
    }
  }
};

// اسم / نك
const cmdاسم = {
  name: 'اسم', aliases: ['نك', 'nick', 'nickname'], cooldown: 3,
  async execute(message, args, client) {
    let target = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = await message.guild.members.fetch(replied.author.id).catch(() => null);
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.members?.size > 0) target = message.mentions.members.first();
    if (!target) return message.react('❌').catch(() => {});
    const newName = args.filter(a => !a.startsWith('<')).join(' ').trim();
    if (!newName) return message.react('❌').catch(() => {});
    try {
      await target.setNickname(newName, `تغيير الاسم بواسطة ${message.author.tag}`);
      await message.react('✅').catch(() => {});
    } catch {
      await message.react('❌').catch(() => {});
    }
  }
};

// اوامر
const cmdاوامر = {
  name: 'اوامر', aliases: ['help', 'مساعدة', 'commands'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('📋 قائمة الأوامر')
      .setColor(0x7D0C22)
      .setDescription('البادئة: **`-`**')
      .addFields(
        { name: '🛡️ الإدارة', value: '`سجن` `اعفاء` `اسكت` `تكلم` `حذف` `رول` `قفل` `فتح`', inline: false },
        { name: '🎵 الصوت', value: '`join` `leave`', inline: false },
        { name: '💰 النقاط', value: '`نقاطي` `تحويل @شخص كمية` `add @شخص كمية`', inline: false },
        { name: '🎮 الألعاب الجماعية', value: '`روليت` `xo` `مافيا` `كراسي` `حجرة` `عجلة` `ريبلكا`', inline: false },
        { name: '⚡ الألعاب السريعة', value: '`اسرع` `اعكس` `اعلام` `اكشف` `زر`', inline: false },
      )
      .setFooter({ text: 'اكتب -العاب لقائمة الألعاب' });
    await message.channel.send({ embeds: [embed] });
  }
};

// عجلة
const عجلةGames = new Map();
const LOCATIONS = ['🏠 البيت','🏫 المدرسة','🏖️ الشاطئ','🌲 الغابة','🏔️ الجبل','🏙️ المدينة','🎭 المسرح','🏪 المتجر','🌊 البحر','🏜️ الصحراء'];
function عجلةLobbyEmbed(players, endTs) {
  return new EmbedBuilder().setTitle('🎡 عجلة الموت').setColor(0x7D0C22)
    .setDescription('**طريقة اللعب:**\n1- شارك بالضغط على الزر أدناه\n2- تدور عجلة الموت وتختار لاعباً\n3- اللاعب يختار مكاناً — واحد فقط هو مكان الموت!\n4- آخر لاعب يبقى يفوز بـ **1 نقطة!**\n\n' + `**اللاعبون المشاركون: (${players.length}/4)**\n\nستبدأ اللعبة <t:${endTs}:R>`);
}
async function عجلةRunGame(channel, game, channelId) {
  let remaining = [...game.players], round = 1;
  while (remaining.length > 1) {
    await channel.send(`**🎡 الجولة ${round} — العجلة تدور...**`);
    await sleep(2500);
    const target = remaining[Math.floor(Math.random() * remaining.length)];
    await channel.send(`**🎡 العجلة اختارت: <@${target.id}>! اختر مكاناً...**`);
    const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5).slice(0, Math.min(remaining.length + 1, 5));
    const deathIdx = Math.floor(Math.random() * shuffled.length);
    const locRow = new ActionRowBuilder().addComponents(shuffled.map((loc, i) => new ButtonBuilder().setCustomId(`wheel_loc_${i}`).setLabel(loc).setStyle(ButtonStyle.Secondary)));
    const locMsg = await channel.send({ content: `<@${target.id}> **اختر مكاناً! (15 ثانية)**`, components: [locRow] });
    let chosen = null;
    try {
      const pick = await locMsg.awaitMessageComponent({ filter: i => i.user.id === target.id, time: 15_000 });
      chosen = parseInt(pick.customId.replace('wheel_loc_', ''));
      await pick.deferUpdate();
    }
    catch { chosen = Math.floor(Math.random() * shuffled.length); }
    await locMsg.edit({ components: [] });
    if (chosen === deathIdx) {
      remaining = remaining.filter(p => p.id !== target.id);
      recordGameResult(target.id, channel.guild.id, 'عجلة الموت', 'loss', 0);
      await channel.send(`**💀 <@${target.id}> اختار ${shuffled[chosen]} — مكان الموت! خرج من اللعبة!\nالمتبقون: ${remaining.map(p => `<@${p.id}>`).join(' ')}**`);
    }
    else {
      await channel.send(`**✅ <@${target.id}> اختار ${shuffled[chosen]} — مكان آمن! 😮‍💨\nالمكان الخطير كان: ${shuffled[deathIdx]}**`);
    }
    round++;
    await sleep(3000);
  }
  عجلةGames.delete(channelId);
  if (remaining.length === 1) {
    recordGameResult(remaining[0].id, channel.guild.id, 'عجلة الموت', 'win', 1);
    await channel.send(`**🎡 الفائز!\n🎉 <@${remaining[0].id}> نجا من عجلة الموت! +1 نقطة**`);
  }
}
const cmdعجلة = {
  name: 'عجلة', aliases: ['wheel'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (عجلةGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const endTs = Math.floor((Date.now() + 17_000) / 1000);
    const game = { players: [], phase: 'lobby', endTs };
    عجلةGames.set(channelId, game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wheel_join').setLabel('دخول إلى اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('wheel_leave').setLabel('اخرج من اللعبة').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('wheel_store').setLabel('⚡ متجر اللعبة').setStyle(ButtonStyle.Primary),
    );
    const sentMsg = await message.channel.send({ embeds: [عجلةLobbyEmbed(game.players, endTs)], components: [row] });
    const collector = sentMsg.createMessageComponentCollector({ time: 60_000 });
    collector.on('collect', async i => {
      const g = عجلةGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'wheel_store') return i.reply({ content: '**🏪 قريباً!**', ephemeral: true });
      if (i.customId === 'wheel_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        g.players.push({ id: i.user.id, username: i.user.username });
        return i.update({ embeds: [عجلةLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'wheel_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
      return i.update({ embeds: [عجلةLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });
    setTimeout(async () => {
      const g = عجلةGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 2) { عجلةGames.delete(channelId);
      return sentMsg.edit({ embeds: [], components: [], content: '**❌ يحتاج لاعبين أكثر!**' }); }
      g.phase = 'playing';
      await sentMsg.edit({ components: [], embeds: [عجلةLobbyEmbed(g.players, g.endTs)] });
      await عجلةRunGame(message.channel, g, channelId);
    }, 17_000);
  }
};

// كراسي
const كراسيGames = new Map();
function كراسيLobbyEmbed(players, endTs) {
  return new EmbedBuilder().setTitle('🪑 كراسي').setColor(0x7D0C22)
    .setDescription('**طريقة اللعب:**\n1- شارك بالضغط على الزر أدناه\n2- تظهر الأزرار فجأة، اضغط على كرسي بسرعة!\n3- عدد الكراسي = عدد اللاعبين - 1\n4- من لا يجد كرسياً يُطرد\n5- آخر لاعب يبقى يفوز!\n\n' + `**اللاعبون المشاركون: (${players.length}/20)**\n\nستبدأ اللعبة <t:${endTs}:R>`);
}
async function كراسيRunGame(channel, game, channelId) {
  let remaining = [...game.players], round = 1;
  while (remaining.length > 1) {
    const chairs = remaining.length - 1;
    await channel.send(`**🪑 الجولة ${round} — الكراسي: ${chairs} | اللاعبون: ${remaining.length}\n🎵 الموسيقى بدأت...** ${remaining.map(p => `<@${p.id}>`).join(' ')}`);
    await sleep(Math.random() * 3000 + 2000);
    const chairBtns = Array.from({ length: Math.min(chairs, 10) }, (_, i) => new ButtonBuilder().setCustomId(`chair_${i}`).setLabel('🪑').setStyle(ButtonStyle.Secondary));
    const btnRows = [];
    for (let i = 0; i < chairBtns.length; i += 5) btnRows.push(new ActionRowBuilder().addComponents(chairBtns.slice(i, i + 5)));
    const pressedSet = new Set();
    const pressMsg = await channel.send({ content: `**🪑 اضغط على كرسي الآن! (5 ثوانٍ)**`, components: btnRows });
    const pressColl = pressMsg.createMessageComponentCollector({ filter: i => remaining.find(p => p.id === i.user.id), time: 5_000 });
    pressColl.on('collect', async i => {
      if (pressedSet.has(i.user.id)) return i.deferUpdate();
      if (pressedSet.size >= chairs) return i.reply({ content: '**❌ الكراسي ممتلئة!**', ephemeral: true });
      pressedSet.add(i.user.id);
      await i.reply({ content: `**✅ جلست! (${pressedSet.size}/${chairs})**`, ephemeral: true });
      if (pressedSet.size >= chairs) pressColl.stop('full');
    });
    await sleep(5_000);
    pressColl.stop();
    await pressMsg.edit({ components: [] });
    const eliminated = remaining.filter(p => !pressedSet.has(p.id));
    remaining = remaining.filter(p => pressedSet.has(p.id));
    if (eliminated.length > 0) {
    recordGameResult(eliminated[0].id, channel.guild.id, 'كراسي', 'loss', 0);
    await channel.send(`**❌ ${eliminated.map(p => `<@${p.id}>`).join(', ')} لم يجد كرسياً وخرج!\nالمتبقون: ${remaining.map(p => `<@${p.id}>`).join(' ')}**`);
  }
    round++;
    await sleep(3000);
  }
  كراسيGames.delete(channelId);
  if (remaining.length === 1) {
    recordGameResult(remaining[0].id, channel.guild.id, 'كراسي', 'win', 1);
    await channel.send(`**🪑 الفائز!\n🎉 <@${remaining[0].id}> فاز بالكراسي الموسيقية!\n🏆 +1 نقطة**`);
  }
}
const cmdكراسي = {
  name: 'كراسي', aliases: ['chairs'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (كراسيGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const endTs = Math.floor((Date.now() + 27_000) / 1000);
    const game = { players: [], phase: 'lobby', endTs };
    كراسيGames.set(channelId, game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('chair_join').setLabel('دخول إلى اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('chair_leave').setLabel('اخرج من اللعبة').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('chair_store').setLabel('⚡ متجر اللعبة').setStyle(ButtonStyle.Primary),
    );
    const sentMsg = await message.channel.send({ embeds: [كراسيLobbyEmbed(game.players, endTs)], components: [row] });
    const collector = sentMsg.createMessageComponentCollector({ time: 90_000 });
    collector.on('collect', async i => {
      const g = كراسيGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'chair_store') return i.reply({ content: '**🏪 قريباً!**', ephemeral: true });
      if (i.customId === 'chair_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        g.players.push({ id: i.user.id, username: i.user.username });
        return i.update({ embeds: [كراسيLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'chair_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
      return i.update({ embeds: [كراسيLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });
    setTimeout(async () => {
      const g = كراسيGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 2) { كراسيGames.delete(channelId);
      return sentMsg.edit({ embeds: [], components: [], content: '**❌ يحتاج لاعبين أكثر!**' }); }
      g.phase = 'playing';
      await sentMsg.edit({ components: [], embeds: [كراسيLobbyEmbed(g.players, g.endTs)] });
      await كراسيRunGame(message.channel, g, channelId);
    }, 27_000);
  }
};

// مافيا
const مافياGames = new Map();
function مافياLobbyEmbed(players, endTs) {
  return new EmbedBuilder().setTitle('🔫 مافيا').setColor(0x7D0C22)
    .setDescription('**طريقة اللعب:**\n1- شارك بالضغط على الزر أدناه\n2- توزيع الأدوار: مافيا، طبيب، مواطنين\n3- الليل: المافيا تختار ضحية، الطبيب يحمي أحداً\n4- النهار: الجميع يصوت لطرد مشتبه به\n5- المواطنون يفوزون بطرد المافيا، المافيا تفوز بمساواة العدد\n\n' + `**اللاعبون المشاركون: (${players.length}/15)**\n\nستبدأ اللعبة <t:${endTs}:R> | يحتاج 4 لاعبين على الأقل`);
}
async function مافياRunGame(channel, game, channelId) {
  const players = game.players, total = players.length, mafiaCount = Math.max(1, Math.floor(total / 4));
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => { p.role = i < mafiaCount ? 'مافيا' : i === mafiaCount ? 'طبيب' : 'مواطن'; });
  for (const p of players) {
    const emoji = p.role === 'مافيا' ? '🔫' : p.role === 'طبيب' ? '💊' : '👤';
    try { const user = await channel.client.users.fetch(p.id); await user.send(`**${emoji} دورك في مافيا: ${p.role}**`); } catch { /* DMs closed */ }
  }
  await channel.send(`**🌙 الليل بدأ... تم إرسال الأدوار في الرسائل الخاصة!\nالأدوار — مافيا: ${mafiaCount} | طبيب: 1 | مواطنين: ${total - mafiaCount - 1}**`);
  let round = 1;
  while (true) {
    const alive = players.filter(p => p.alive), mafias = alive.filter(p => p.role === 'مافيا'), citizens = alive.filter(p => p.role !== 'مافيا');
    if (mafias.length === 0) { مافياGames.delete(channelId); citizens.forEach(p => recordGameResult(p.id, channel.guild.id, 'مافيا', 'win', 1));
      return channel.send(`**🏆 المواطنون فازوا! تم القضاء على المافيا!\nالفائزون: ${citizens.map(p => `<@${p.id}>`).join(' ')}**`); }
    if (mafias.length >= citizens.length) { مافياGames.delete(channelId); mafias.forEach(p => recordGameResult(p.id, channel.guild.id, 'مافيا', 'win', 1));
      return channel.send(`**🔫 المافيا فازت! تسيطر على المدينة!\nالمافيا: ${mafias.map(p => `<@${p.id}>`).join(' ')}**`); }
    await channel.send(`**🌙 الليلة ${round} — المافيا تختار ضحية...**`);
    await sleep(4000);
    const killTarget = citizens[Math.floor(Math.random() * citizens.length)], doctor = alive.find(p => p.role === 'طبيب');
    const protect = doctor ? alive[Math.floor(Math.random() * alive.length)] : null;
    if (protect && protect.id === killTarget.id) { await channel.send(`**☀️ النهار ${round} — الطبيب أنقذ أحدهم الليلة! لم يمت أحد.**`); }
    else { killTarget.alive = false; await channel.send(`**☀️ النهار ${round} — <@${killTarget.id}> وجد ميتاً! كان ${killTarget.role}.**`); }
    const stillAlive = players.filter(p => p.alive);
    const voteRow = new ActionRowBuilder().addComponents(stillAlive.slice(0, 5).map(p => new ButtonBuilder().setCustomId(`vote_${p.id}`).setLabel(p.username).setStyle(ButtonStyle.Primary)));
    const voteMsg = await channel.send({ content: `**🗳️ صوّتوا لطرد المشتبه به! (20 ثانية)\nالأحياء: ${stillAlive.map(p => `<@${p.id}>`).join(' ')}**`, components: [voteRow] });
    const votes = {}, voteColl = voteMsg.createMessageComponentCollector({ time: 20_000 });
    voteColl.on('collect', async i => {
      if (!players.find(p => p.id === i.user.id && p.alive)) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
      votes[i.user.id] = i.customId.replace('vote_', '');
      await i.reply({ content: '**✅ تم تسجيل صوتك!**', ephemeral: true });
    });
    await sleep(20_000);
    voteColl.stop();
    await voteMsg.edit({ components: [] });
    const voteCounts = {}
    Object.values(votes).forEach(id => { voteCounts[id] = (voteCounts[id] || 0) + 1; });
    const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    if (sortedVotes.length > 0) { const ejected = players.find(p => p.id === sortedVotes[0][0]); if (ejected) { ejected.alive = false; await channel.send(`**🗳️ تم طرد <@${ejected.id}>! كان ${ejected.role}.**`); } }
    else { await channel.send('**⚠️ لم يصوت أحد هذه الجولة!**'); }
    round++;
    await sleep(3000);
  }
}
const cmdمافيا = {
  name: 'مافيا', aliases: ['mafia'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (مافياGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const endTs = Math.floor((Date.now() + 27_000) / 1000);
    const game = { players: [], phase: 'lobby', endTs };
    مافياGames.set(channelId, game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mafia_join').setLabel('دخول إلى اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('mafia_leave').setLabel('اخرج من اللعبة').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mafia_store').setLabel('⚡ متجر اللعبة').setStyle(ButtonStyle.Primary),
    );
    const sentMsg = await message.channel.send({ embeds: [مافياLobbyEmbed(game.players, endTs)], components: [row] });
    const collector = sentMsg.createMessageComponentCollector({ time: 90_000 });
    collector.on('collect', async i => {
      const g = مافياGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'mafia_store') return i.reply({ content: '**🏪 قريباً!**', ephemeral: true });
      if (i.customId === 'mafia_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود!**', ephemeral: true });
        if (g.players.length >= 15) return i.reply({ content: '**❌ ممتلئة!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        g.players.push({ id: i.user.id, username: i.user.username, role: null, alive: true });
        return i.update({ embeds: [مافياLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'mafia_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
      return i.update({ embeds: [مافياLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });
    setTimeout(async () => {
      const g = مافياGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 4) { مافياGames.delete(channelId);
      return sentMsg.edit({ embeds: [], components: [], content: '**❌ يحتاج 4 لاعبين على الأقل.**' }); }
      g.phase = 'playing';
      await sentMsg.edit({ components: [], embeds: [مافياLobbyEmbed(g.players, g.endTs)] });
      await مافياRunGame(message.channel, g, channelId);
    }, 27_000);
  }
};


const غميضةGames = new Map();

function buildغميضةHideGrid(squares, channelId) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gmydh_${idx}_${channelId}`)
          .setLabel(`${idx + 1}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(false)
      );
    }
    rows.push(row);
  }
  return rows;
}

function buildغميضةSeekGrid(squares, channelId) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const sq = squares[idx];
      let label = `${idx + 1}`;
      let style = ButtonStyle.Secondary;
      let disabled = false;
      if (sq.hit) {
        label = '🟥';
        style = ButtonStyle.Danger;
        disabled = true;
      } else if (sq.miss) {
        label = '✗';
        style = ButtonStyle.Secondary;
        disabled = true;
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gmyds_${idx}_${channelId}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }
  return rows;
}

function غميضةLobbyEmbed(players, endTs) {
  const count = players.length;
  return new EmbedBuilder()
    .setColor(0x7D0C22)
    .setDescription(
      '**لعبة الاختباء**\n\n' +
      '**طريقة اللعب:**\n' +
      '1- اضغط على الزر ادناه لدخول اللعبة\n' +
      '2- يجب على اللاعبين اختيار مكان للاختباء فيه\n' +
      '3- يتم اختيار شخص كل جولة لكشف المختبئين\n' +
      '4- يختار هذا الشخص مكاناً لفحصه، اذا وجد لاعب مختبئاً يتم طرد اللاعب\n' +
      '5- تنتهي اللعبه بفوز آخر لاعب مختبئ\n\n' +
      `**اللاعبون المشاركون: (${count}/15)**\n\n` +
      `ستبدأ اللعبة <t:${endTs}:R>`
    );
}

async function غميضةStartHiding(channel, game, channelId) {
  game.phase = 'hiding';
  game.squares = Array.from({ length: 15 }, () => ({ occupants: [], occupied: false, hit: false, miss: false }));
  game.pendingHiders = new Set(game.players.map(p => p.id));
  game.aliveIds = new Set(game.players.map(p => p.id));

  const mentions = game.players.map(p => `<@${p.id}>`).join(' ');
  const hideEmbed = new EmbedBuilder()
    .setColor(0x7D0C22)
    .setTitle('🙈 وقت الاختباء!')
    .setDescription(
      '**اختر مربعاً تختبئ فيه! — لديك 30 ثانية**\n\n' +
      `${mentions}`
    )
    .setFooter({ text: 'اضغط على رقم المربع لتختبئ فيه — الاختيار سري!' });

  const rows = buildغميضةHideGrid(game.squares, channelId);
  const hideMsg = await channel.send({ embeds: [hideEmbed], components: rows });
  game.hidingMessage = hideMsg;

  setTimeout(async () => {
    const g = غميضةGames.get(channelId);
    if (!g || g.phase !== 'hiding') return;
    const stillPending = [...g.pendingHiders];
    for (const pid of stillPending) {
      const randomIdx = Math.floor(Math.random() * 15);
      g.squares[randomIdx].occupants.push(pid);
      g.squares[randomIdx].occupied = true;
      g.pendingHiders.delete(pid);
    }
    await غميضةStartSeeking(channel, g, channelId);
  }, 30_000);
}

async function غميضةStartSeeking(channel, game, channelId) {
  game.phase = 'seeking';

  const hidingMsg = game.hidingMessage;
  if (hidingMsg) {
    try {
      await hidingMsg.edit({
        embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('🙈 **انتهى وقت الاختباء! اللعبة بدأت...**')],
        components: []
      });
    } catch { /* ignore */ }
  }

  game.seekers = [...game.players].sort(() => Math.random() - 0.5).map(p => p.id);
  game.currentSeekerIdx = 0;

  await sleep(1500);
  await غميضةDoSeekTurn(channel, game, channelId);
}

async function غميضةDoSeekTurn(channel, game, channelId) {
  const g = غميضةGames.get(channelId);
  if (!g || g.phase !== 'seeking') return;

  const aliveCount = g.aliveIds.size;
  if (aliveCount <= 1) {
    return غميضةEndGame(channel, g, channelId);
  }

  let seekerId = null;
  let tries = 0;
  while (tries < g.seekers.length) {
    const candidate = g.seekers[g.currentSeekerIdx % g.seekers.length];
    g.currentSeekerIdx++;
    tries++;
    if (g.aliveIds.has(candidate)) {
      seekerId = candidate;
      break;
    }
  }

  if (!seekerId) return غميضةEndGame(channel, g, channelId);

  const rows = buildغميضةSeekGrid(g.squares, channelId);

  const aliveList = g.players.filter(p => g.aliveIds.has(p.id)).map(p => `<@${p.id}>`).join(' ');

  const seekEmbed = new EmbedBuilder()
    .setColor(0x7D0C22)
    .setTitle('🔍 دور الكشف!')
    .setDescription(
      `**<@${seekerId}> — اختر مربعاً للكشف عنه!**\n\n` +
      `👥 المتبقون: ${aliveList}\n\n` +
      `⏱ لديك **20 ثانية**`
    );

  const seekMsg = await channel.send({ embeds: [seekEmbed], components: rows });
  g.seekMessage = seekMsg;
  g.currentSeekerUserId = seekerId;

  const timeout = setTimeout(async () => {
    const gNow = غميضةGames.get(channelId);
    if (!gNow || gNow.seekMessage?.id !== seekMsg.id) return;
    const unrevealed = gNow.squares.map((sq, i) => ({ sq, i })).filter(({ sq }) => !sq.hit && !sq.miss);
    if (unrevealed.length > 0) {
      const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      await غميضةRevealSquare(channel, gNow, channelId, pick.i, seekMsg, true);
    } else {
      await غميضةEndGame(channel, gNow, channelId);
    }
  }, 20_000);

  g.seekTimeout = timeout;
}

async function غميضةRevealSquare(channel, game, channelId, sqIdx, seekMsg, wasAuto) {
  if (game.seekTimeout) { clearTimeout(game.seekTimeout); game.seekTimeout = null; }

  const sq = game.squares[sqIdx];
  if (sq.hit || sq.miss) return;

  const foundOccupants = sq.occupants.filter(id => game.aliveIds.has(id));

  if (foundOccupants.length > 0) {
    sq.hit = true;
    for (const fid of foundOccupants) {
      game.aliveIds.delete(fid);
    }
    const foundMentions = foundOccupants.map(id => `<@${id}>`).join(', ');
    const rows = buildغميضةSeekGrid(game.squares, channelId);
    await seekMsg.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x7D0C22)
        .setTitle(`🟥 المربع ${sqIdx + 1} — تم اكتشاف لاعب!`)
        .setDescription(`💥 **${foundMentions}** ${foundOccupants.length > 1 ? 'كانوا' : 'كان'} مختبئاً في المربع **${sqIdx + 1}**!\n\n🚫 تم طردهم من اللعبة!`)],
      components: rows
    });
  } else {
    sq.miss = true;
    const rows = buildغميضةSeekGrid(game.squares, channelId);
    await seekMsg.edit({
      embeds: [new EmbedBuilder()
        .setColor(0x7D0C22)
        .setTitle(`✗ المربع ${sqIdx + 1} — فارغ!`)
        .setDescription(`لا يوجد أحد في المربع **${sqIdx + 1}**`)],
      components: rows
    });
  }

  await sleep(2000);

  const aliveCount = game.aliveIds.size;
  if (aliveCount <= 1) {
    await غميضةEndGame(channel, game, channelId);
  } else {
    await غميضةDoSeekTurn(channel, game, channelId);
  }
}

async function غميضةEndGame(channel, game, channelId) {
  غميضةGames.delete(channelId);
  if (game.seekTimeout) { clearTimeout(game.seekTimeout); game.seekTimeout = null; }

  if (game.aliveIds.size === 1) {
    const winnerId = [...game.aliveIds][0];
    const winner = game.players.find(p => p.id === winnerId);
    if (winner) {
      recordGameResult(winnerId, channel.guild.id, 'غميضة', 'win', 3);
      let avatarUrl = null;
      try { const mem = await channel.guild.members.fetch(winnerId); avatarUrl = mem.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }); } catch {}
      const winEmbed = new EmbedBuilder()
        .setColor(0x7D0C22)
        .setTitle('🏆 الفائز!')
        .setDescription(`## 🎉 <@${winnerId}>\n**${winner.username}** فاز بلعبة الغميضة!\n\n💰 **+3 نقاط** 🏅`)
        .setFooter({ text: 'مبروك للفائز! 🎊' });
      if (avatarUrl) winEmbed.setThumbnail(avatarUrl);
      await channel.send({ content: '@here', embeds: [winEmbed] });
    }
  } else {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setTitle('🎮 انتهت اللعبة').setDescription('انتهت اللعبة بدون فائز!')] });
  }
}

const cmdغميضة = {
  name: 'غميضة', aliases: ['hide', 'اختبي', 'اختباء'], cooldown: 5,
  async execute(message, args, client) {
    const channelId = message.channel.id;
    if (غميضةGames.has(channelId)) return message.reply('**❌ يوجد لعبة نشطة!**');
    const game = { players: [], phase: 'lobby' };
    غميضةGames.set(channelId, game);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gmyd_join').setLabel('دخول إلى اللعبة').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('gmyd_leave').setLabel('اخرج من اللعبة').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('gmyd_store').setLabel('⚡ متجر اللعبة').setStyle(ButtonStyle.Primary),
    );

    const endTs = Math.floor((Date.now() + 20_000) / 1000);
    game.endTs = endTs;
    const sentMsg = await message.channel.send({ embeds: [غميضةLobbyEmbed(game.players, endTs)], components: [row] });
    game.lobbyMsg = sentMsg;

    const collector = sentMsg.createMessageComponentCollector({ time: 20_000 });
    collector.on('collect', async i => {
      const g = غميضةGames.get(channelId);
      if (!g || g.phase !== 'lobby') return i.deferUpdate();
      if (i.customId === 'gmyd_store') return i.reply({ content: '**🏪 متجر قريباً!**', ephemeral: true });
      if (i.customId === 'gmyd_join') {
        if (g.players.find(p => p.id === i.user.id)) return i.reply({ content: '**❌ أنت موجود بالفعل!**', ephemeral: true });
        if (g.players.length >= 15) return i.reply({ content: '**❌ اللعبة ممتلئة!**', ephemeral: true });
        ensureUser(i.user.id, message.guild.id, i.user.username);
        const name = i.member?.displayName || i.user.username;
        g.players.push({ id: i.user.id, username: name });
        return i.update({ embeds: [غميضةLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
      if (i.customId === 'gmyd_leave') {
        const idx = g.players.findIndex(p => p.id === i.user.id);
        if (idx === -1) return i.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
        g.players.splice(idx, 1);
        return i.update({ embeds: [غميضةLobbyEmbed(g.players, g.endTs)], components: [row] });
      }
    });

    setTimeout(async () => {
      const g = غميضةGames.get(channelId);
      if (!g || g.phase !== 'lobby') return;
      collector.stop();
      if (g.players.length < 4) {
        غميضةGames.delete(channelId);
        return sentMsg.edit({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('**❌ لم يكن هناك لاعبون كافيون. (يحتاج 4 على الأقل)**')], components: [] });
      }
      g.phase = 'starting';
      await sentMsg.edit({ embeds: [غميضةLobbyEmbed(g.players, g.endTs)], components: [] });
      await sleep(1000);
      await غميضةStartHiding(message.channel, g, channelId);
    }, 20_000);
  }
};

// تصفير
const cmdتصفير = {
  name: 'تصفير', aliases: ['reset-points','zeroing'],
  async execute(message, args) {
    let target = null;
    if (message.reference?.messageId) {
      try {
        const replied = await message.channel.messages.fetch(message.reference.messageId);
        target = replied.author;
      } catch { /* ignored */ }
    }
    if (!target && message.mentions.users.size > 0) target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ ارد على رسالة شخص أو منشنه.\nمثال: `تصفير @شخص` أو رد على رسالته بـ `تصفير`' }] });
    setPoints(target.id, message.guild.id, 0);
    await message.channel.send({ embeds: [makeEmbed({ title: '🔄 تصفير النقاط', color: COLORS.warning, description: `✅ تم تصفير نقاط <@${target.id}> إلى **0**` })] });
  }
};

// نقاطي
const cmdنقاطي = {
  name: 'نقاطي', aliases: ['points', 'نقاط', 'balance'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const data = ensureUser(target.id, message.guild.id, target.username);
    const rank = getUserRank(target.id, message.guild.id);
    const winRate = data.games_played > 0 ? ((data.wins / data.games_played) * 100).toFixed(1) : '0.0';
    await message.channel.send({
      embeds: [makeEmbed({
        title: `💰 نقاط ${target.username}`,
        color: COLORS.gold,
        thumbnail: target.displayAvatarURL({ dynamic: true }),
        fields: [
          { name: '💵 النقاط',       value: `**${data.points.toLocaleString()}**`, inline: true },
          { name: '🏆 الترتيب',      value: `#${rank}`,                            inline: true },
          { name: '🎮 المباريات',    value: `${data.games_played}`,                inline: true },
          { name: '✅ انتصارات',     value: `${data.wins}`,                        inline: true },
          { name: '❌ خسائر',        value: `${data.losses}`,                      inline: true },
          { name: '📊 نسبة الفوز',  value: `${winRate}%`,                         inline: true },
        ],
        footer: 'استخدم -تحويل لإرسال نقاط',
      })],
    });
  }
};


function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const PREFIX = '-';
const NO_PREFIX_CMDS = new Set(['حذف', 'اسكت', 'تكلم', 'سجن', 'اعفاء', 'رول', 'قفل', 'فتح', 'اسم', 'نك', 'تصفير']);

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL', 'MESSAGE'],
});
setClient(client);

client.commands = new Collection();
client.cooldowns = new Collection();

const cmdتوب = {
  name: 'توب', aliases: ['top', 'ترتيب', 'leaderboard'], cooldown: 5,
  async execute(message, args, client) {
    const db = loadDb();
    const guildId = message.guild.id;
    const users = Object.values(db.users).filter(u => u.guild_id === guildId && (u.points > 0 || u.wins > 0));
    if (users.length === 0) return message.reply('**❌ لا يوجد لاعبون بعد!**');
    users.sort((a, b) => (b.points || 0) - (a.points || 0));
    const top10 = users.slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const rows = top10.map((u, i) => {
      const medal = medals[i] || `\`${i + 1}\``;
      const wins = u.wins || 0;
      const played = u.games_played || 0;
      const rate = played > 0 ? Math.round((wins / played) * 100) : 0;
      return `${medal} **${u.username}** — 🪙 ${u.points} نقطة | 🏆 ${wins} فوز | 📊 ${rate}%`;
    }).join('\n');
    const authorRank = users.findIndex(u => u.user_id === message.author.id);
    let footer = 'أكمل اللعب لترتفع في القائمة!';
    if (authorRank >= 0) footer = `مرتبتك: #${authorRank + 1} من ${users.length} لاعب`;
    const embed = new EmbedBuilder()
      .setTitle('🏆 قائمة أفضل اللاعبين')
      .setColor(0x7D0C22)
      .setDescription(rows)
      .setFooter({ text: footer })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

const ALL_COMMANDS = [
  cmdAdd, cmdJoin, cmdLeave, cmdXo, cmdاسرع, cmdاسكت, cmdاعفاء, cmdاعكس, cmdاعلام, cmdاكشف,
  cmdالعاب, cmdتحويل, cmdتكلم, cmdحجرة, cmdحذف, cmdروليت, cmdريبلكا, cmdزر, cmdسجن, cmdعجلة, cmdكراسي, cmdمافيا, cmdنقاطي,
  cmdقفل, cmdفتح, cmdرول, cmdاوامر, cmdاسم, cmdتصفير, cmdغميضة, cmdتوب,
];

for (const cmd of ALL_COMMANDS) {
  client.commands.set(cmd.name, cmd);
  if (cmd.aliases) cmd.aliases.forEach(a => client.commands.set(a, cmd));
}

initDatabase();

async function runCommand(command, message, args) {
  if (!client.cooldowns.has(command.name)) client.cooldowns.set(command.name, new Collection());
  const timestamps = client.cooldowns.get(command.name);
  const cooldownAmount = (command.cooldown ?? 3) * 1000;
  const now = Date.now();
  if (timestamps.has(message.author.id)) {
    const expiration = timestamps.get(message.author.id) + cooldownAmount;
    if (now < expiration) {
      const left = ((expiration - now) / 1000).toFixed(1);
      return message.reply({ embeds: [{ color: 0x7D0C22, description: `⏳ انتظر **${left}** ثانية قبل الاستخدام مجدداً.` }] });
    }
  }
  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
  try {
    await command.execute(message, args, client);
    message.react('✅').catch(() => {});
  }
  catch (err) {
    console.error(`[${command.name}] Error:`, err);
    message.react('❌').catch(() => {});
    message.reply({ embeds: [{ color: 0x7D0C22, description: '❌ حدث خطأ أثناء تنفيذ الأمر.' }] }).catch(() => {});
  }
}

const RANDOM_EMOJIS = ['😀','😂','🥰','😍','🤩','😎','🥳','🤯','😱','🔥','💥','⭐','🌟','✨','💫','🎉','🎊','🏆','💎','👑','🦁','🐯','🦊','🐺','🦋','🌈','🍕','🍦','🎮','🎯','🎲','🎸','🎵','🎶','❤️','💜','💙','💚','💛','🧡','🤍','💝','🌺','🌸','🌻','🌹','🍀','🌊','⚡','🌙','☀️','❄️'];

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // DM handler (owner only)
  if (!message.guild) {
    if (message.author.id !== OWNER_ID) return;
    const dmArgs = content.trim().split(/\s+/);
    const dmCmd = dmArgs[0];
    const targetId = dmArgs[1]?.replace(/\D/g, '');
    if (dmCmd === 'اضافة' && targetId) {
      const added = addToWhitelist(targetId);
      await message.reply(added ? `✅ تمت إضافة \`${targetId}\` للقائمة البيضاء.` : `⚠️ \`${targetId}\` موجود بالفعل.`);
    } else if ((dmCmd === 'حذف' || dmCmd === 'ازالة') && targetId) {
      const removed = removeFromWhitelist(targetId);
      await message.reply(removed ? `✅ تمت إزالة \`${targetId}\` من القائمة البيضاء.` : `⚠️ \`${targetId}\` غير موجود أو هو المالك.`);
    } else if (dmCmd === 'قائمة') {
      const db = loadDb();
      const list = (db.whitelist || []).join('\n') || 'فارغة';
      await message.reply(`📋 **القائمة البيضاء:**\n\`\`\`\n${list}\n\`\`\``);
    }
    return;
  }

  // مسح (delete ticket channel after 3s)
  if (content.trim() === 'مسح' && openTickets.has(message.channel.id)) {
    const closeEmbed = new EmbedBuilder()
      .setColor(0x7D0C22)
      .setTitle('🗑️ حذف التذكرة')
      .setDescription('سيتم حذف هذه التذكرة بعد **3 ثوانٍ**...');
    await message.channel.send({ embeds: [closeEmbed] });
    openTickets.delete(message.channel.id);
    await sleep(3000);
    await message.channel.delete('مسح التذكرة').catch(() => {});
    return;
  }

  // سلام عليكم
  if (/السلام عليكم/.test(content)) {
    await message.reply('وعليكم السلام ورحمة الله وبركاته').catch(() => {});
    return;
  }

  // خط (send AXIS image and delete message)
  if (content === 'خط' || content.startsWith('خط ') || content.endsWith(' خط') || content.includes(' خط ')) {
    try { await message.delete(); } catch { /* ignore */ }
    const axisPath = path.join(__dirname, 'assets', 'axis.png');
    await message.channel.send({ files: [new AttachmentBuilder(axisPath, { name: 'axis.png' })] }).catch(() => {});
    return;
  }

  // نقطه (point message detector)
  if (content.trim() === 'نقطه' || content.trim() === 'نقطة') {
    const userId = message.author.id;
    if (userId === '1226561156907401248') {
      await message.reply('هلا يالأميرة 💅').catch(() => {});
    } else if (userId === OWNER_ID) {
      await message.reply('**__مـرحـبـآ عـزيـزي الاونر نـورت سيرفرك 💫 .~__**').catch(() => {});
    } else {
      await message.reply(`**__مـرحـبـآ عـزيـزي الـعـضـو نـورت الـشـات 💫 .~ / __<@${userId}>**`).catch(() => {});
    }
    return;
  }

  // -ش (شغّل موسيقى من يوتيوب)
  if (content.startsWith('-ش ') || content === '-ش') {
    const query = content.slice(3).trim();
    if (!query) return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('❌ اكتب اسم الأغنية. مثال: `-ش اغنية برتقاله وليمونه`')] });

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('❌ يجب أن تكون في قناة صوتية أولاً')] });

    const perms = voiceChannel.permissionsFor(message.guild.members.me);
    if (!perms?.has('Connect') || !perms?.has('Speak'))
      return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('❌ ما عندي صلاحية الدخول أو الكلام في القناة الصوتية')] });

    const loadingMsg = await message.channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('🔍 جاري البحث في يوتيوب...')] });

    try {
      // Search YouTube
      const results = await playSearch(query, { source: { youtube: 'video' }, limit: 1 });
      if (!results || results.length === 0) {
        await loadingMsg.edit({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('❌ ما لقيت نتائج للبحث')] });
        return;
      }
      const video = results[0];

      // Destroy existing connection if any
      safeDestroyMusic(message.guild.id);

      // Join voice channel
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      // Get audio stream via SoundCloud
      await loadingMsg.edit({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('⏳ جاري تحضير البث الصوتي...')] });
      const streamProc = await createYTStream(video.url);
      const resource = createAudioResource(streamProc.stream, { inputType: streamProc.type });

      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      player.play(resource);
      connection.subscribe(player);

      // Save state
      const prevSt = musicState.get(message.guild.id);
      musicState.set(message.guild.id, {
        connection, player, streamProc, currentVideo: video,
        textChannel: message.channel,
        loop: prevSt?.loop ?? false,
        paused: false,
      });

      // When song ends naturally — support loop mode
      const guildId = message.guild.id;
      player.on(AudioPlayerStatus.Idle, async () => {
        const st = musicState.get(guildId);
        if (!st) return;
        if (st.loop && st.currentVideo) {
          try {
            const loopVideo = st.currentVideo;
            try { st.streamProc?.ffProc?.kill('SIGKILL'); } catch {}
            try { st.streamProc?.stream?.destroy(); } catch {}
            const newStreamProc = await createYTStream(loopVideo.url);
            const newResource = createAudioResource(newStreamProc.stream, { inputType: newStreamProc.type });
            const currentSt = musicState.get(guildId);
            if (!currentSt) { try { newStreamProc.ffProc?.kill('SIGKILL'); } catch {} return; }
            currentSt.streamProc = newStreamProc;
            currentSt.paused = false;
            currentSt.player.play(newResource);
          } catch (e) {
            console.error('[Music Loop Error]', e.message);
            safeDestroyMusic(guildId);
          }
        } else {
          safeDestroyMusic(guildId);
        }
      });

      player.on('error', err => {
        console.error('[Music Player Error]', err.message);
        safeDestroyMusic(guildId);
      });

      // Handle voice connection errors
      connection.on('error', () => {
        safeDestroyMusic(guildId);
      });

      const duration = video.durationInSec
        ? `${Math.floor(video.durationInSec / 60)}:${String(video.durationInSec % 60).padStart(2, '0')}`
        : 'غير معروف';

      await loadingMsg.edit({ embeds: [new EmbedBuilder()
        .setColor(0x7D0C22)
        .setTitle('🎵 جاري التشغيل')
        .setDescription(`**[${video.title}](${video.url})**`)
        .addFields(
          { name: '👤 القناة', value: video.channel?.name || 'غير معروف', inline: true },
          { name: '⏱️ المدة', value: duration, inline: true },
          { name: '🔊 القناة الصوتية', value: voiceChannel.name, inline: true },
        )
        .setThumbnail(video.thumbnails?.[0]?.url || null)
        .setFooter({ text: 'YouTube | استخدم -ايقاف لإيقاف التشغيل' })
      ] });

    } catch (err) {
      console.error('[Music] Error:', err.message);
      await loadingMsg.edit({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription(`❌ فشل التشغيل: ${err.message?.slice(0, 100) || 'خطأ غير معروف'}`)] });
      safeDestroyMusic(message.guild.id);
    }
    return;
  }

  // -ايقاف (إيقاف الموسيقى)
  if (content === '-ايقاف') {
    const st = musicState.get(message.guild.id);
    if (!st) return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('⚠️ ما في شي شغّال الحين')] });
    safeDestroyMusic(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('⏹️ تم إيقاف التشغيل وخروج البوت من القناة الصوتية')] });
    return;
  }

  // -يشغل (عرض الأغنية الحالية)
  if (content === '-يشغل') {
    const st = musicState.get(message.guild.id);
    if (!st) return message.reply({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setDescription('⚠️ ما في شي شغّال الحين')] });
    const v = st.currentVideo;
    const dur = v.durationInSec ? `${Math.floor(v.durationInSec/60)}:${String(v.durationInSec%60).padStart(2,'0')}` : '؟';
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(0x7D0C22)
      .setTitle('🎵 يشتغل الحين')
      .setDescription(`**[${v.title}](${v.url})**`)
      .addFields({ name: '⏱️ المدة', value: dur, inline: true }, { name: '👤 القناة', value: v.channel?.name || '؟', inline: true })
      .setThumbnail(v.thumbnails?.[0]?.url || null)
      .setFooter({ text: 'YouTube | -ايقاف لإيقاف التشغيل' })
    ] });
  }

  // Check if user has the authorized role
  const memberHasAuthRole = message.member?.roles?.cache?.has(AUTHORIZED_ROLE_ID) ?? false;
  const userFullyAuthorized = isAuthorized(message.author.id) || memberHasAuthRole;

  if (content.startsWith(PREFIX)) {
    const args = content.slice(PREFIX.length).trim().split(/\s+/), commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    if (!command) return;
    if (!userFullyAuthorized && !PUBLIC_CMDS.has(command.name) && !PUBLIC_CMDS.has(commandName)) {
      return message.react('❌').catch(() => {});
    }
    await runCommand(command, message, args);
    return;
  }

  const words = content.split(/\s+/), firstWord = words[0];
  if (NO_PREFIX_CMDS.has(firstWord)) {
    const command = client.commands.get(firstWord);
    if (!command) return;
    if (!userFullyAuthorized) return message.react('❌').catch(() => {});
    await runCommand(command, message, words.slice(1));
  }
});


const slashCommands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('أضف مستخدم للقائمة البيضاء (المالك فقط)')
    .addUserOption(o => o.setName('user').setDescription('المستخدم المراد إضافته').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('أزل مستخدم من القائمة البيضاء (المالك فقط)')
    .addUserOption(o => o.setName('user').setDescription('المستخدم المراد إزالته').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('اعرض القائمة البيضاء الحالية (المالك فقط)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('اجعل البوت يرسل رسالة في هذه القناة')
    .addStringOption(o => o.setName('message').setDescription('الرسالة التي سيرسلها البوت').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('إعداد نظام التذاكر (Ticket System)')
    .addChannelOption(o => o.setName('channel').setDescription('القناة التي سيُرسل فيها لوحة التذاكر').setRequired(true))
    .addChannelOption(o => o.setName('category').setDescription('الكاتيجوري الذي ستُنشأ فيه التذاكر').setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('voicesetup')
    .setDescription('أرسل لوحة التحكم بالموسيقى في هذه القناة')
    .toJSON(),
];

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: slashCommands });
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.error('❌ Slash commands registration failed:', e.message);
  }
}

client.on('interactionCreate', async interaction => {
  try {
    const memberHasAuth = interaction.member?.roles?.cache?.has(AUTHORIZED_ROLE_ID) ?? false;
    const userFullyAuth = interaction.user.id === OWNER_ID || isAuthorized(interaction.user.id) || memberHasAuth;

    // SELECT MENU: Open Ticket
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_open') {
      const typeId = interaction.values[0];
      const config = getTicketConfig(interaction.guild.id);
      const categoryId = config?.categoryId || null;

      // Check if user already has an open ticket
      const existing = [...openTickets.entries()].find(([, t]) => t.openerID === interaction.user.id);
      if (existing) {
        return interaction.reply({
          content: `❌ عندك تذكرة مفتوحة بالفعل: <#${existing[0]}>`,
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const channel = await createTicketChannel(interaction.guild, interaction.user, typeId, categoryId);
        await interaction.editReply({ content: `✅ تم فتح تذكرتك: <#${channel.id}>` });
      } catch (e) {
        await interaction.editReply({ content: `❌ فشل إنشاء التذكرة: ${e.message}` });
      }
      return;
    }

    // BUTTONS: غميضة — Hide phase
    if (interaction.isButton() && interaction.customId.startsWith('gmydh_')) {
      const parts = interaction.customId.split('_');
      const sqIdx = parseInt(parts[1]);
      const chanId = parts[2];
      const g = غميضةGames.get(chanId);
      if (!g || g.phase !== 'hiding') return interaction.deferUpdate();
      const isInGame = g.players.some(p => p.id === interaction.user.id);
      if (!isInGame) return interaction.reply({ content: '**❌ لست في اللعبة!**', ephemeral: true });
      if (!g.pendingHiders.has(interaction.user.id)) {
        return interaction.reply({ content: '**✅ اخترت مكانك بالفعل!**', ephemeral: true });
      }
      const sq = g.squares[sqIdx];
      sq.occupants.push(interaction.user.id);
      g.pendingHiders.delete(interaction.user.id);

      const stillPending = [...g.pendingHiders].map(id => `<@${id}>`).join(' ');
      const updatedEmbed = new EmbedBuilder()
        .setColor(0x7D0C22)
        .setTitle('🙈 وقت الاختباء!')
        .setDescription(
          '**اختر مربعاً تختبئ فيه! — لديك 30 ثانية**\n\n' +
          (stillPending.length > 0 ? `⏳ بانتظار: ${stillPending}` : '**✅ اختار الجميع! جاري بدء الكشف...**')
        )
        .setFooter({ text: 'الاختيار سري! 🤫' });

      const hideRows = buildغميضةHideGrid(g.squares, chanId);
      try { await g.hidingMessage.edit({ embeds: [updatedEmbed], components: hideRows }); } catch {}
      await interaction.reply({ content: `**✅ اختبأت في المربع ${sqIdx + 1}! 🤫**`, ephemeral: true });

      if (g.pendingHiders.size === 0) {
        await sleep(1500);
        const gNow = غميضةGames.get(chanId);
        if (gNow && gNow.phase === 'hiding') {
          await غميضةStartSeeking(interaction.channel, gNow, chanId);
        }
      }
      return;
    }

    // BUTTONS: غميضة — Seek phase
    if (interaction.isButton() && interaction.customId.startsWith('gmyds_')) {
      const parts = interaction.customId.split('_');
      const sqIdx = parseInt(parts[1]);
      const chanId = parts[2];
      const g = غميضةGames.get(chanId);
      if (!g || g.phase !== 'seeking') return interaction.deferUpdate();
      if (interaction.user.id !== g.currentSeekerUserId) {
        return interaction.reply({ content: '**❌ مو دورك الحين!**', ephemeral: true });
      }
      const sq = g.squares[sqIdx];
      if (sq.hit || sq.miss) return interaction.reply({ content: '**❌ هذا المربع مكشوف مسبقاً!**', ephemeral: true });
      await interaction.deferUpdate();
      await غميضةRevealSquare(interaction.channel, g, chanId, sqIdx, g.seekMessage, false);
      return;
    }

    // BUTTON: Claim Ticket
    if (interaction.isButton() && interaction.customId === 'ticket_claim') {
      const ticket = openTickets.get(interaction.channel.id);
      if (ticket?.claimedBy) {
        return interaction.reply({ content: `⚠️ هذه التذكرة مستلمة بالفعل من <@${ticket.claimedBy}>`, ephemeral: true });
      }
      if (ticket) ticket.claimedBy = interaction.user.id;

      const claimedEmbed = new EmbedBuilder()
        .setColor(0x7D0C22)
        .setDescription(`✅ **تم استلام التذكرة** من <@${interaction.user.id}>`);

      const claimBtn = new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel(`🎫 مستلمة — ${interaction.user.username}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

      const closeBtn = new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('🔒 اغلاق')
        .setStyle(ButtonStyle.Danger);

      await interaction.update({ components: [new ActionRowBuilder().addComponents(claimBtn, closeBtn)] });
      await interaction.channel.send({ embeds: [claimedEmbed] });
      return;
    }

    // BUTTON: Close Ticket
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      const closeEmbed = new EmbedBuilder()
        .setColor(0x7D0C22)
        .setTitle('🔒 إغلاق التذكرة')
        .setDescription(`سيتم حذف هذه التذكرة بعد **3 ثوانٍ**...\nتم الإغلاق بواسطة <@${interaction.user.id}>`);

      await interaction.reply({ embeds: [closeEmbed] });
      openTickets.delete(interaction.channel.id);
      await sleep(3000);
      await interaction.channel.delete('إغلاق التذكرة').catch(() => {});
      return;
    }

    // BUTTONS: Music control
    if (interaction.isButton() && interaction.customId === 'music_pause') {
      const st = musicState.get(interaction.guild.id);
      if (!st) return interaction.update(buildMusicPanel(interaction.guild.id));
      if (st.paused) { st.player.unpause(); st.paused = false; }
      else { st.player.pause(); st.paused = true; }
      return interaction.update(buildMusicPanel(interaction.guild.id));
    }

    if (interaction.isButton() && interaction.customId === 'music_loop') {
      const st = musicState.get(interaction.guild.id);
      if (st) st.loop = !st.loop;
      return interaction.update(buildMusicPanel(interaction.guild.id));
    }

    if (interaction.isButton() && interaction.customId === 'music_stop') {
      safeDestroyMusic(interaction.guild.id);
      return interaction.update(buildMusicPanel(interaction.guild.id));
    }

    if (interaction.isButton() && interaction.customId === 'music_search') {
      const modal = new ModalBuilder()
        .setCustomId('music_search_modal')
        .setTitle('🔍 بحث وتشغيل أغنية');
      const input = new TextInputBuilder()
        .setCustomId('music_query')
        .setLabel('اكتب اسم الأغنية أو الفيديو')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: برتقاله وليمونه')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // MODAL: Music search → play
    if (interaction.isModalSubmit() && interaction.customId === 'music_search_modal') {
      const query = interaction.fields.getTextInputValue('music_query').trim();
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) return interaction.reply({ content: '❌ يجب أن تكون في قناة صوتية أولاً', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      try {
        const results = await playSearch(query, { source: { youtube: 'video' }, limit: 1 });
        if (!results?.length) return interaction.editReply({ content: '❌ ما لقيت نتائج' });
        const video = results[0];
        safeDestroyMusic(interaction.guild.id);
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id, guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true,
        });
        const streamProc = await createYTStream(video.url);
        const resource = createAudioResource(streamProc.stream, { inputType: streamProc.type });
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        player.play(resource);
        connection.subscribe(player);
        const guildId = interaction.guild.id;
        musicState.set(guildId, { connection, player, streamProc, currentVideo: video, textChannel: interaction.channel, loop: false, paused: false });
        player.on(AudioPlayerStatus.Idle, async () => {
          const st = musicState.get(guildId);
          if (!st) return;
          if (st.loop && st.currentVideo) {
            try {
              const loopVideo = st.currentVideo;
              try { st.streamProc?.ffProc?.kill('SIGKILL'); } catch {}
              try { st.streamProc?.stream?.destroy(); } catch {}
              const nf = await createYTStream(loopVideo.url);
              const nr = createAudioResource(nf.stream, { inputType: nf.type });
              const cur = musicState.get(guildId);
              if (!cur) { try { nf.ffProc?.kill('SIGKILL'); } catch {} return; }
              cur.streamProc = nf;
              cur.paused = false;
              cur.player.play(nr);
            } catch { safeDestroyMusic(guildId); }
          } else { safeDestroyMusic(guildId); }
        });
        player.on('error', () => { safeDestroyMusic(guildId); });
        connection.on('error', () => { safeDestroyMusic(guildId); });
        const dur = video.durationInSec ? `${Math.floor(video.durationInSec / 60)}:${String(video.durationInSec % 60).padStart(2, '0')}` : 'غير معروف';
        await interaction.editReply({ content: `✅ جاري تشغيل **${video.title}** (${dur}) في ${voiceChannel.name}` });
      } catch (e) {
        console.error('[Music Modal]', e.message);
        safeDestroyMusic(interaction.guild.id);
        await interaction.editReply({ content: `❌ فشل التشغيل: ${e.message?.slice(0, 100)}` });
      }
      return;
    }

    // SLASH COMMANDS
    if (!interaction.isChatInputCommand()) return;

    // /setup — anyone fully authorized can use it
    if (interaction.commandName === 'setup') {
      if (!userFullyAuth) return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذا الأمر.', ephemeral: true });
      const panelChannel = interaction.options.getChannel('channel');
      const categoryChannel = interaction.options.getChannel('category');

      saveTicketConfig(interaction.guild.id, {
        channelId: panelChannel.id,
        categoryId: categoryChannel.id,
      });

      try {
        const panel = buildTicketPanel();
        await panelChannel.send(panel);
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x7D0C22)
            .setDescription(`✅ تم إرسال لوحة التذاكر إلى <#${panelChannel.id}>\n📁 الكاتيجوري: **${categoryChannel.name}**`)],
          ephemeral: true,
        });
      } catch (e) {
        return interaction.reply({ content: `❌ فشل الإرسال: ${e.message}`, ephemeral: true });
      }
    }

    // All commands below are owner-only by default
    if (interaction.commandName !== 'say' && !userFullyAuth) {
      return interaction.reply({ content: '❌ هذا الأمر للمالك فقط.', ephemeral: true });
    }

    if (interaction.commandName === 'add') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ للمالك فقط.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const added = addToWhitelist(target.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(added ? 0x7D0C22 : 0x7D0C22)
          .setDescription(added
            ? `✅ تمت إضافة <@${target.id}> (\`${target.id}\`) للقائمة البيضاء.`
            : `⚠️ <@${target.id}> موجود بالفعل في القائمة البيضاء.`)],
        ephemeral: true,
      });
    }

    if (interaction.commandName === 'remove') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ للمالك فقط.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const removed = removeFromWhitelist(target.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(removed ? 0x7D0C22 : 0x7D0C22)
          .setDescription(removed
            ? `✅ تمت إزالة <@${target.id}> من القائمة البيضاء.`
            : `⚠️ <@${target.id}> غير موجود في القائمة أو هو المالك.`)],
        ephemeral: true,
      });
    }

    if (interaction.commandName === 'whitelist') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ للمالك فقط.', ephemeral: true });
      const db = loadDb();
      const list = (db.whitelist || []).map((id, i) => `\`${i + 1}.\` <@${id}> (\`${id}\`)`).join('\n') || 'فارغة';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x7D0C22).setTitle('📋 القائمة البيضاء').setDescription(list)],
        ephemeral: true,
      });
    }

    if (interaction.commandName === 'say') {
      if (!userFullyAuth) return interaction.reply({ content: '❌ ليس لديك صلاحية.', ephemeral: true });
      const msgText = interaction.options.getString('message');
      const targetChannel = interaction.channel;
      const prisonChannel = interaction.guild?.channels?.cache?.find(c => c.name.toLowerCase() === 'prison' && c.isTextBased());
      if (prisonChannel) {
        await prisonChannel.send({
          embeds: [new EmbedBuilder()
            .setColor(0x7D0C22)
            .setTitle('📢 /say استُخدم')
            .setDescription(`**المستخدم:** <@${interaction.user.id}>\n**القناة:** <#${targetChannel.id}>\n**الرسالة:** ${msgText}`)
            .setTimestamp()]
        }).catch(() => {});
      }
      try {
        await targetChannel.send(msgText);
        return interaction.reply({ content: '✅ تم الإرسال', ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: `❌ فشل الإرسال: ${e.message}`, ephemeral: true });
      }
    }

    // /voicesetup — send music control panel
    if (interaction.commandName === 'voicesetup') {
      const panel = buildMusicPanel(interaction.guild.id);
      await interaction.channel.send(panel);
      return interaction.reply({ content: '✅ تم إرسال لوحة التحكم بالموسيقى', ephemeral: true });
    }

  } catch (err) {
    console.error('[interactionCreate]', err);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    } else {
      interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    }
  }
});


client.once('ready', c => {
  console.log(`✅ البوت شغّال! ${c.user.tag}`);
  registerSlashCommands();
  try {
    c.user.setActivity('Axis', { type: ActivityType.Streaming, url: 'https://www.twitch.tv/axisserver' });
  } catch {}
});

client.on('shardResume', (shardId, replayedEvents) => {
  console.log(`✅ Shard ${shardId} عاد للاتصال. (${replayedEvents} events)`);
  try {
    client.user.setActivity('Axis', { type: ActivityType.Streaming, url: 'https://www.twitch.tv/axisserver' });
  } catch {}
});

client.on('disconnect', () => {
  console.warn('⚠️ البوت انقطع! جارٍ إعادة الاتصال...');
  reconnect();
});
client.on('error', err => console.error('❌ خطأ في البوت:', err.message));
client.on('warn', info => console.warn('⚠️', info));
client.on('shardDisconnect', (event, shardId) => console.warn(`⚠️ Shard ${shardId} انقطع. كود: ${event.code}`));
client.on('shardError', (err, shardId) => console.error(`❌ خطأ Shard ${shardId}:`, err.message));
client.on('shardReconnecting', shardId => console.log(`🔄 Shard ${shardId} يعيد الاتصال...`));

process.on('uncaughtException', err => console.error('🔥 uncaughtException:', err));
process.on('unhandledRejection', reason => console.error('🔥 unhandledRejection:', reason));
process.on('SIGTERM', () => console.log('📛 SIGTERM — البوت مستمر...'));
process.on('SIGINT', () => console.log('📛 SIGINT — البوت مستمر...'));

function reconnect() {
  setTimeout(async () => {
    try { await client.login(TOKEN); console.log('✅ أعاد الاتصال بنجاح!'); }
    catch (e) { console.error('❌ فشل إعادة الاتصال:', e.message); reconnect(); }
  }, 5000);
}

setInterval(() => {
  if (!client.isReady()) { console.warn('💔 البوت غير متصل! جارٍ إعادة الاتصال...'); reconnect(); }
}, 30_000);
import play from 'play-dl';


import registerDotReply from './dotReply.js';
registerDotReply(client);

client.login(TOKEN);
