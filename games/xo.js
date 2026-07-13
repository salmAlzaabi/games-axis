import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

export const xoGames = new Map();
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
  return new EmbedBuilder()
    .setTitle('❌⭕ XO')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: '1- شارك بالضغط على الزر أدناه\n2- سيتم اختيار اللاعبين بشكل عشوائي للمنافسة\n3- الخاسر يُطرد، الفائز يكمل حتى النهاية\n4- آخر لاعب يبقى يفوز بـ **1 نقطة**' },
      { name: '👥 اللاعبون', value: `${players.length}/20`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
    );
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
    if (game.cancelled) return;
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

export { cmdXo };
