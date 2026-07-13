import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, addPoints } from '../database.js';
import { sleep } from '../utils.js';

// روليت
export const روليتGames = new Map();
const LOBBY_DURATION = 30_000;
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
    if (game.cancelled) return;
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

export { cmdروليت };
