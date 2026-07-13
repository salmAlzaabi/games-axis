import path from 'path';
import { fileURLToPath } from 'url';
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


import {
  loadDb, saveDb, userKey, initDatabase, getUser, ensureUser, addPoints, setPoints,
  recordGameResult, getLeaderboard, getTopWins, getUserRank, getUserGameHistory,
  updateUserField, savePrisoner, getPrisoner, removePrisoner,
} from './database.js';
import { sleep } from './utils.js';
import { cmdXo } from './games/xo.js';
import { cmdحجرة } from './games/rps.js';
import { cmdروليت } from './games/roulette.js';
import { cmdريبلكا } from './games/replika.js';
import { cmdعجلة } from './games/wheel.js';
import { cmdكراسي } from './games/chairs.js';
import { cmdمافيا } from './games/mafia.js';
import { cmdغميضة, registerHideSeekButtons } from './games/hideseek.js';


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
    .setDescription('**Choose a ticket type below to open a request and get support from the staff team.**')
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
    await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔄 اعكس الكلمة!').setColor(0x7D0C22).addFields({ name: '🔤 الكلمة المعكوسة', value: `\`${reversed}\`` }, { name: '⏱ الوقت', value: '20 ثانية', inline: true }).setFooter({ text: 'أسرع لاعب يكتب الجواب يفوز!' })] });
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

import registerEmbedCommand from './embedCommand.js';
registerEmbedCommand(client);

registerHideSeekButtons(client);

client.login(TOKEN);
