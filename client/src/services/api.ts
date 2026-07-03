const TOKEN = 'meow';
const H = { 'Content-Type': 'application/json', 'x-dashboard-token': TOKEN };

async function get(path: string) {
  const r = await fetch(path, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}
async function post(path: string, body: object) {
  const r = await fetch(path, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}
async function patch(path: string, body: object) {
  const r = await fetch(path, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}
async function del(path: string, body?: object) {
  const r = await fetch(path, { method: 'DELETE', headers: H, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

export const api = {
  // Core
  getGuilds: () => get('/api/guilds'),
  getChannels: (guildId: string) => get(`/api/channels-full/${guildId}`),
  getMessages: (channelId: string, before?: string) => get(`/api/messages/${channelId}${before ? `?before=${before}` : ''}`),
  getMembers: (guildId: string) => get(`/api/members/${guildId}`),
  getRoles: (guildId: string) => get(`/api/roles/${guildId}`),
  getMemberInfo: (guildId: string, userId: string) => get(`/api/member-info/${guildId}/${userId}`),
  sendMessage: (channelId: string, content: string, replyTo?: string) => post(`/api/send/${channelId}`, { content, replyTo }),
  sendImage: (channelId: string, imageBase64: string, imageName: string, content?: string, replyTo?: string) =>
    post(`/api/send/${channelId}`, { content, imageBase64, imageName, replyTo }),

  // Bot
  updateBotProfile: (data: { username?: string; avatar?: string }) => patch('/api/bot/profile', data),
  updateBotStatus: (data: { status: string; activityType?: number; activityText?: string }) => patch('/api/bot/status', data),

  // Roles
  createRole: (guildId: string, data: { name: string; color?: string; hoist?: boolean; mentionable?: boolean }) =>
    post(`/api/guilds/${guildId}/roles`, data),
  updateRole: (guildId: string, roleId: string, data: object) => patch(`/api/guilds/${guildId}/roles/${roleId}`, data),
  deleteRole: (guildId: string, roleId: string) => del(`/api/guilds/${guildId}/roles/${roleId}`),

  // Member management
  addRole: (guildId: string, userId: string, roleId: string) => post(`/api/members/${guildId}/${userId}/roles/${roleId}`, {}),
  removeRole: (guildId: string, userId: string, roleId: string) => del(`/api/members/${guildId}/${userId}/roles/${roleId}`),
  kickMember: (guildId: string, userId: string, reason?: string) => post(`/api/members/${guildId}/${userId}/kick`, { reason }),
  timeoutMember: (guildId: string, userId: string, minutes: number) => post(`/api/members/${guildId}/${userId}/timeout`, { minutes }),
  banMember: (guildId: string, userId: string, reason?: string) => post(`/api/members/${guildId}/${userId}/ban`, { reason }),

  // Voice
  voiceMute: (guildId: string, userId: string, mute: boolean) => patch(`/api/voice/${guildId}/${userId}/mute`, { mute }),
  voiceDeafen: (guildId: string, userId: string, deafen: boolean) => patch(`/api/voice/${guildId}/${userId}/deafen`, { deafen }),
  voiceKick: (guildId: string, userId: string) => del(`/api/voice/${guildId}/${userId}`),

  // Messages
  deleteMessage: (channelId: string, messageId: string) => del(`/api/messages/${channelId}/${messageId}`),
  editMessage: (channelId: string, messageId: string, content: string) => patch(`/api/messages/${channelId}/${messageId}`, { content }),
  addReaction: (channelId: string, messageId: string, emoji: string) => post(`/api/messages/${channelId}/${messageId}/react`, { emoji }),
  removeReaction: (channelId: string, messageId: string, emoji: string) => del(`/api/messages/${channelId}/${messageId}/react`, { emoji }),

  // DMs
  getDMs: () => get('/api/dms'),
  getDMMessages: (userId: string) => get(`/api/dms/${userId}`),
  sendDM: (userId: string, content: string, imageBase64?: string, imageName?: string) =>
    post(`/api/dms/${userId}`, { content, imageBase64, imageName }),
};

export type SSEHandler = (event: string, data: unknown) => void;

export function connectSSE(handler: SSEHandler): () => void {
  const es = new EventSource(`/api/events?token=${TOKEN}`);
  ['message', 'messageDelete', 'typing', 'presence'].forEach(evt =>
    es.addEventListener(evt, (e: any) => handler(evt, JSON.parse(e.data)))
  );
  return () => es.close();
}
