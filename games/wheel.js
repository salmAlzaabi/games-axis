import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

// عجلة
const عجلةGames = new Map();
const LOCATIONS = ['🏠 البيت','🏫 المدرسة','🏖️ الشاطئ','🌲 الغابة','🏔️ الجبل','🏙️ المدينة','🎭 المسرح','🏪 المتجر','🌊 البحر','🏜️ الصحراء'];
function عجلةLobbyEmbed(players, endTs) {
  const playerList = players.length > 0 ? players.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n') : '> لا يوجد لاعبون بعد';
  return new EmbedBuilder()
    .setTitle('🎡 عجلة الموت')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: '1- شارك بالضغط على الزر أدناه\n2- تدور العجلة وتختار لاعباً\n3- اللاعب يختار مكاناً — واحد فقط هو مكان الموت!\n4- آخر لاعب يبقى يفوز بـ **1 نقطة**' },
      { name: '👥 اللاعبون', value: `${players.length}/4`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
      { name: '📋 المشاركون', value: playerList },
    );
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

export { cmdعجلة };
