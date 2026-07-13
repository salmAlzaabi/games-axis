import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ensureUser, recordGameResult } from '../database.js';
import { sleep } from '../utils.js';

// ريبلكا
export const ريبلكاGames = new Map();
const REPLIKA_CATEGORIES = ['اسم','حيوان','نبات','دولة','مدينة','طعام','لون','مهنة','جماد','فاكهة'];
const ARABIC_LETTERS = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
function ريبلكاLobbyEmbed(players, endTs) {
  return new EmbedBuilder()
    .setTitle('🔤 ريبلكا')
    .setColor(0x7D0C22)
    .addFields(
      { name: '📖 طريقة اللعب', value: '1- شارك بالضغط على الزر أدناه\n2- كل جولة: حرف عشوائي + تصنيف عشوائي\n3- اللاعب المختار يكتب كلمة تبدأ بالحرف من التصنيف\n4- أعلى نقاط في 5 جولات يفوز!' },
      { name: '👥 اللاعبون', value: `${players.length}/10`, inline: true },
      { name: '⏱ البداية', value: `<t:${endTs}:R>`, inline: true },
    );
}
async function ريبلكاValidateAnswer(category, letter, answer) {
  const startsOk = answer.startsWith(letter) || answer.startsWith('ا');
  if (!startsOk) return false;
  if (!process.env.ANTHROPIC_API_KEY) return true; // ما فيه مفتاح API، يكتفي بفحص الحرف بس
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: 'أنت حكم لعبة "ريبلكا" العربية. رد فقط بكلمة true أو false بدون أي شرح.',
        messages: [{ role: 'user', content: `هل الكلمة "${answer}" إجابة صحيحة لتصنيف "${category}" وتبدأ فعلاً بحرف "${letter}"؟` }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim().toLowerCase() || '';
    return text.includes('true');
  } catch (e) {
    console.error('❌ Replika AI validation failed:', e.message);
    return true; // فشل الاتصال، يكتفي بفحص الحرف بس
  }
}
async function ريبلكاRunGame(channel, game, channelId) {
  const rounds = 5;
  for (let r = 1; r <= rounds; r++) {
    if (game.cancelled) return;
    const category = REPLIKA_CATEGORIES[Math.floor(Math.random() * REPLIKA_CATEGORIES.length)];
    await channel.send(`**📖 الجولة ${r}/${rounds} — التصنيف: ${category}**`);
    for (const target of game.players) {
      if (game.cancelled) return;
      const letter = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
      await channel.send(`<@${target.id}> **اكتب كلمة تبدأ بـ ${letter} من ${category}! (20 ثانية)**`);
      try {
        const collected = await channel.awaitMessages({ filter: m => m.author.id === target.id, max: 1, time: 20_000, errors: ['time'] });
        const answer = collected.first().content.trim();
        const isValid = await ريبلكاValidateAnswer(category, letter, answer);
        if (isValid) {
          target.score = (target.score || 0) + 1;
          await channel.send(`**✅ <@${target.id}> أجاب: ${answer} — صح! (+1)**`);
        } else {
          await channel.send(`**❌ <@${target.id}> أجاب: ${answer} — إجابة غير صحيحة!**`);
        }
      } catch { await channel.send(`**⏰ <@${target.id}> لم يجب في الوقت!**`); }
      await sleep(1500);
    }
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

export { cmdريبلكا };
