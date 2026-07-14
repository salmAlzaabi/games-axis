const roles = {
  "1501984363536060437": "نورتي السيرفر يا ملكه 💗.",
  "1501984361258684416": "نورت السيرفر يالشيخ💗."
};
const users = {
  "1373005291880316928": "ارحبيي يالامبراطوره 💗.",
  "1195827812565798953": "نورت سيرفرك يا الاونر الاعظم💗."
};
const cooldowns = new Map();
const COOLDOWN_MS = 60_000;

const tafshRoles = {
  "1373005291880316928": {
    question: "وش اسوي لك انتي بعد اقوم ارقص ؟",
    image: "https://cdn.discordapp.com/attachments/1520910367218208898/1526655732185960578/image.png?ex=6a57d072&is=6a567ef2&hm=7ad7c3bae12b3c95b05d715849e959e570fa93a0e10360e7476f0c9be073d898"
  },
  "1501984361258684416": {
    question: "وش اسوي لك انت بعد اقوم ارقص لك ؟",
    image: "https://cdn.discordapp.com/attachments/1226561892177412187/1526656241324261376/image.png?ex=6a57d0eb&is=6a567f6b&hm=2244fa7b512779deee969cd25d23ade255d841c873d1de2f886ab208da5e2478"
  }
};

let lastTafshUse = 0;
const TAFSH_COOLDOWN_MS = 120_000;
const pendingTafsh = new Map();

export default function registerDotReply(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const member = message.member;
    if (!member) return;

    if (message.content.trim() === "طفش") {
      const now = Date.now();
      if (now - lastTafshUse < TAFSH_COOLDOWN_MS) return;
      const roleId = Object.keys(tafshRoles).find((id) => member.roles.cache.has(id));
      if (!roleId) return;
      lastTafshUse = now;
      const sent = await message.reply(tafshRoles[roleId].question);
      pendingTafsh.set(sent.id, { userId: message.author.id, roleId });
      setTimeout(() => pendingTafsh.delete(sent.id), 5 * 60_000);
      return;
    }

    if (message.reference?.messageId && pendingTafsh.has(message.reference.messageId)) {
      const pending = pendingTafsh.get(message.reference.messageId);
      if (pending.userId === message.author.id && message.content.trim() === "اي") {
        pendingTafsh.delete(message.reference.messageId);
        message.reply(tafshRoles[pending.roleId].image);
      }
      return;
    }

    if (message.content.trim() !== ".") return;
    const now = Date.now();
    const lastReply = cooldowns.get(message.author.id);
    if (lastReply && now - lastReply < COOLDOWN_MS) return;
    const replies = [];
    if (users[message.author.id]) {
      replies.push(users[message.author.id]);
    }
    for (const roleId in roles) {
      if (member.roles.cache.has(roleId)) {
        replies.push(roles[roleId]);
      }
    }
    if (replies.length > 0) {
      cooldowns.set(message.author.id, now);
      message.reply(replies.join("\n"));
    }
  });
}
