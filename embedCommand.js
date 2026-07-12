import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

const OWNER_ID = '1195827812565798953';
const AUTHORIZED_ROLE_ID = '1518979586510028904';

const embedCommandData = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('أرسل إمبد مخصص بعنوان ووصف وصور')
  .addChannelOption(o => o.setName('channel').setDescription('القناة اللي ينرسل فيها الإمبد').setRequired(true))
  .addStringOption(o => o.setName('title').setDescription('عنوان الإمبد (اختياري)').setRequired(false))
  .addStringOption(o => o.setName('description').setDescription('وصف الإمبد (اختياري)').setRequired(false))
  .addAttachmentOption(o => o.setName('image1').setDescription('صورة أولى (اختياري)').setRequired(false))
  .addAttachmentOption(o => o.setName('image2').setDescription('صورة ثانية (اختياري)').setRequired(false))
  .addAttachmentOption(o => o.setName('image3').setDescription('صورة ثالثة (اختياري)').setRequired(false))
  .toJSON();

export default function registerEmbedCommand(client) {
  // يسجل أمر /embed لحاله بدون ما يأثر على باقي أوامر السلاش المسجلة
  client.once('clientReady', async () => {
    try {
      await client.application.commands.create(embedCommandData);
      console.log('✅ /embed command registered');
    } catch (e) {
      console.error('❌ /embed command registration failed:', e.message);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'embed') return;

    const memberHasAuth = interaction.member?.roles?.cache?.has(AUTHORIZED_ROLE_ID) ?? false;
    const isOwner = interaction.user.id === OWNER_ID;
    if (!isOwner && !memberHasAuth) {
      return interaction.reply({ content: '❌ ليس لديك صلاحية.', ephemeral: true });
    }

    const targetChannel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const images = [1, 2, 3].map(n => interaction.options.getAttachment(`image${n}`)).filter(Boolean);

    if (!title && !description && images.length === 0) {
      return interaction.reply({ content: '❌ لازم تحط عنوان أو وصف أو صورة وحدة على الأقل.', ephemeral: true });
    }
    if (!targetChannel?.isTextBased?.()) {
      return interaction.reply({ content: '❌ لازم تختار قناة نصية صحيحة.', ephemeral: true });
    }

    const mainEmbed = new EmbedBuilder().setColor(0x7D0C22);
    if (title) mainEmbed.setTitle(title);
    if (description) mainEmbed.setDescription(description);
    if (images[0]) mainEmbed.setImage(images[0].url);

    const extraEmbeds = images.slice(1).map(img => new EmbedBuilder().setColor(0x7D0C22).setImage(img.url));

    try {
      await targetChannel.send({ embeds: [mainEmbed, ...extraEmbeds] });
      return interaction.reply({ content: `✅ تم إرسال الإمبد في <#${targetChannel.id}>`, ephemeral: true });
    } catch (e) {
      return interaction.reply({ content: `❌ فشل الإرسال: ${e.message}`, ephemeral: true });
    }
  });
}
