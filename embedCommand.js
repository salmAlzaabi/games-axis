import { EmbedBuilder } from 'discord.js';

const OWNER_ID = '1195827812565798953';
const AUTHORIZED_ROLE_ID = '1518979586510028904';
const PREFIX = '-';

export default function registerEmbedCommand(client) {
  client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(`${PREFIX}embed`)) return;

    const memberHasAuth = message.member?.roles?.cache?.has(AUTHORIZED_ROLE_ID) ?? false;
    const isOwner = message.author.id === OWNER_ID;
    if (!isOwner && !memberHasAuth) return message.react('❌').catch(() => {});

    // مثال: -embed #القناة | العنوان | الوصف   (والصور ترفقها مع نفس الرسالة، لين 3 صور)
    const rest = message.content.slice(`${PREFIX}embed`.length).trim();

    const channelMatch = rest.match(/<#(\d+)>/);
    if (!channelMatch) {
      return message.reply('❌ لازم تحدد القناة أول شي، مثال:\n`-embed #القناة | العنوان | الوصف`').catch(() => {});
    }
    const targetChannel = message.guild.channels.cache.get(channelMatch[1]);
    if (!targetChannel?.isTextBased?.()) {
      return message.reply('❌ القناة اللي حددتها مو نصية أو مو موجودة.').catch(() => {});
    }

    const afterChannel = rest.replace(channelMatch[0], '').trim().replace(/^\|/, '').trim();
    const parts = afterChannel.split('|').map(p => p.trim()).filter(Boolean);
    const title = parts[0] || null;
    const description = parts[1] || null;

    const images = [...message.attachments.values()].slice(0, 3);

    if (!title && !description && images.length === 0) {
      return message.reply('❌ لازم تحط عنوان أو وصف أو صورة وحدة على الأقل.').catch(() => {});
    }

    const mainEmbed = new EmbedBuilder().setColor(0x7D0C22);
    if (title) mainEmbed.setTitle(title);
    if (description) mainEmbed.setDescription(description);
    if (images[0]) mainEmbed.setImage(images[0].url);

    const extraEmbeds = images.slice(1).map(img => new EmbedBuilder().setColor(0x7D0C22).setImage(img.url));

    try {
      await targetChannel.send({ embeds: [mainEmbed, ...extraEmbeds] });
      await message.reply(`✅ تم إرسال الإمبد في <#${targetChannel.id}>`).catch(() => {});
    } catch (e) {
      await message.reply(`❌ فشل الإرسال: ${e.message}`).catch(() => {});
    }
  });
}
