import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

// مافيا
export const مافياGames = new Map();
function مافياLobbyEmbed(players, endTs) {
  const playerList = players.length > 0 ? players.map((p, i) => `\`${i + 1}\` ${p.nickname || p.username}`).join('\n') : '> لا يوجد لاعبون بعد';
  return new EmbedBuilder()
    .setTitle('🔫 مافيا')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: '1- شارك بالضغط على الزر أدناه\n2- توزيع الأدوار: مافيا، طبيب، مواطنين\n3- الليل: المافيا تختار ضحية، الطبيب يحمي أحداً\n4- النهار: الجميع يصوت لطرد مشتبه به\n5- المواطنون يفوزون بطرد المافيا، المافيا تفوز بمساواة العدد' },
      { name: '👥 اللاعبون', value: `${players.length}/15`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
      { name: '📋 المشاركون', value: playerList },
    )
    .setFooter({ text: 'يحتاج 4 لاعبين على الأقل' });
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
    if (game.cancelled) return;
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
    const voteRow = new ActionRowBuilder().addComponents(stillAlive.slice(0, 5).map(p => new ButtonBuilder().setCustomId(`vote_${p.id}`).setLabel((p.nickname || p.username).slice(0, 20)).setStyle(ButtonStyle.Primary)));
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
        g.players.push({ id: i.user.id, username: i.user.username, nickname: i.member?.displayName || i.user.username, role: null, alive: true });
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

export { cmdمافيا };
