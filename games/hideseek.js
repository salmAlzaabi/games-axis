import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

export const غميضةGames = new Map();

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
    .setTitle('🙈 لعبة الاختباء')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: '1- اضغط على الزر أدناه لدخول اللعبة\n2- يجب على اللاعبين اختيار مكان للاختباء فيه\n3- يتم اختيار شخص كل جولة لكشف المختبئين\n4- إذا وُجد لاعب مختبئاً يتم طرده\n5- تنتهي اللعبة بفوز آخر لاعب مختبئ' },
      { name: '👥 اللاعبون', value: `${count}/15`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
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
        .addFields({ name: '🎉 الفائز', value: `<@${winnerId}>`, inline: true }, { name: '💰 الجائزة', value: '+3 نقاط', inline: true })
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

export function registerHideSeekButtons(client) {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('gmydh_') && !interaction.customId.startsWith('gmyds_')) return;

    if (interaction.customId.startsWith('gmydh_')) {
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

    if (interaction.customId.startsWith('gmyds_')) {
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
  });
}

export { cmdغميضة };
