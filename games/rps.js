import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

// حجرة
export const حجرةGames = new Map();
const RPS_CHOICES = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const RPS_EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
function حجرةLobbyEmbed(players, endTs) {
  const playerList = players.length > 0 ? players.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n') : '> لا يوجد لاعبون بعد';
  return new EmbedBuilder()
    .setTitle('🪨 حجرة ورقة مقص')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: 'يتم اختيار اللاعبين عشوائياً للمنافسة، الخاسر يُطرد والفائز يكمل. عند التعادل تُعاد الجولة بين المتعادلَين. آخر لاعب يفوز بـ **1 نقطة**' },
      { name: '👥 اللاعبون', value: `${players.length}/20`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
      { name: '📋 المشاركون', value: playerList },
    );
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
    if (game.cancelled) return;
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
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x7D0C22).setTitle('🏆 الفائز!').addFields({ name: '🎉 الفائز', value: `<@${winner.id}>`, inline: true }, { name: '💰 الجائزة', value: '+1 نقطة', inline: true }).setFooter({ text: 'مبروك! 🎊' })] });
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

export { cmdحجرة };
