import { EmbedBuilder } from 'discord.js';

const OWNER_ID = '1195827812565798953';
const AUTHORIZED_ROLE_ID = '1518979586510028904';
const PREFIX = '-';

export default function registerEmbedCommand(client) {
  client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(`${PREFIX}امبد`)) return;

    const memberHasAuth = message.member?.roles?.cache?.has(AUTHORIZED_ROLE_ID) ?? false;
    const isOwner = message.author.id === OWNER_ID;
    if (!isOwner && !memberHasAuth) return message.react('❌').catch(() => {});

    // الاستخدام: -امبد النص اللي تبيه + رفقّ الصور بنفس الرسالة (لين 3 صور)
    const text = message.content.slice(`${PREFIX}امبد`.length).trim();
    const images = [...message.attachments.values()].slice(0, 3);

    if (!text && images.length === 0) {
      return message.reply('❌ لازم تكتب نص أو ترفق صورة وحدة على الأقل.').catch(() => {});
    }

    const mainEmbed = new EmbedBuilder().setColor(0x7D0C22);
    if (text) mainEmbed.setDescription(text);
    if (images[0]) mainEmbed.setImage(images[0].url);

    const extraEmbeds = images.slice(1).map(img => new EmbedBuilder().setColor(0x7D0C22).setImage(img.url));

    try {
      await message.channel.send({ embeds: [mainEmbed, ...extraEmbeds] });
      await message.delete().catch(() => {});
    } catch (e) {
      await message.reply(`❌ فشل الإرسال: ${e.message}`).catch(() => {});
    }
  });
}
