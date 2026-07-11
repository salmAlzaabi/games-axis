const roles = {
  "1501984363536060437": "نورتي السيرفر يا ملكه 💗.",
  "1501984361258684416": "نورت السيرفر يالشيخ💗."
};

const users = {
  "1373005291880316928": "ارحبيي يالامبراطوره💗."
};

export default function registerDotReply(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim() !== ".") return;
    const member = message.member;
    if (!member) return;
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
      message.reply(replies.join("\n"));
    }
  });
}
