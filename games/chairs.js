import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

// كراسي
const كراسيGames = new Map();
function كراسيLobbyEmbed(players, endTs) {
  const playerList = players.length > 0 ? players.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n') : '> لا يوجد لاعبون بعد';
  return new EmbedBuilder()
    .setTitle('🪑 كراسي')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: '1- شارك بالضغط على الزر أدناه\n2- تظهر الأزرار فجأة، اضغط على كرسي بسرعة!\n3- عدد الكراسي = عدد اللاعبين - 1\n4- من لا يجد كرسياً يُطرد\n5- آخر لاعب يبقى يفوز!' },
      { name: '👥 اللاعبون', value: `${players.length}/20`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
      { name: '📋 المشاركون', value: playerList },
    );
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

export { cmdكراسي };
