import { useState, useEffect, useCallback, useRef } from 'react';
import { api, connectSSE } from '../services/api';
import type { User, Workspace, Channel, Category, Message, Role } from '../types';

function mapGuildToWorkspace(g: any): Workspace {
  return {
    id: g.id,
    name: g.name,
    icon: g.icon || undefined,
    acronym: g.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
    color: '#6c63ff',
    unreadCount: 0,
    mentionCount: 0,
    memberCount: g.memberCount || 0,
    onlineCount: g.onlineCount || 0,
    boostLevel: g.boostLevel || 0,
    isOwner: false,
  };
}

function mapApiChannel(ch: any): Channel {
  return {
    id: ch.id,
    name: ch.name,
    type: ch.type as any,
    categoryId: '',
    topic: ch.topic || undefined,
    unreadCount: 0,
    mentionCount: 0,
    position: ch.position,
    isNSFW: ch.nsfw,
    userLimit: ch.userLimit || undefined,
    currentUsers: ch.voiceMembers?.map((m: any) => m.id) || [],
    voiceMembers: ch.voiceMembers || [],
    isFavorite: false,
    isLocked: false,
  };
}

function mapApiMessage(m: any, existingUsers: Map<string, User>): Message {
  const author: User = {
    id: m.author.id,
    username: m.author.username,
    displayName: m.author.displayName,
    avatar: m.author.avatar,
    status: 'online',
    roles: [],
    joinedAt: '',
    bot: m.author.bot,
  } as any;
  existingUsers.set(author.id, author);

  return {
    id: m.id,
    content: m.content,
    author,
    timestamp: m.timestamp,
    editedAt: m.editedTimestamp || undefined,
    reactions: (m.reactions || []),
    attachments: m.attachments || [],
    embeds: m.embeds || [],
    replyTo: m.referencedMessage ? mapApiMessage(m.referencedMessage, existingUsers) : undefined,
  };
}

function mapApiMember(m: any): User {
  return {
    id: m.id,
    username: m.username,
    displayName: m.displayName,
    avatar: m.avatar,
    status: (m.status || 'offline') as any,
    customStatus: m.customStatus || undefined,
    bio: m.activity || undefined,
    roles: m.roles?.map((r: any) => r.name) || [],
    joinedAt: m.joinedAt || '',
    bot: m.bot || false,
    color: m.color || null,
  } as any;
}

function mapApiRole(r: any): Role {
  return {
    id: r.id,
    name: r.name,
    color: r.color !== '#000000' ? r.color : '#8b8fa8',
    position: r.position,
    permissions: [],
    memberCount: r.memberCount || 0,
  };
}

export function useDiscordData() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; timeout: ReturnType<typeof setTimeout> }>>(new Map());
  const [botId, setBotId] = useState<string>('');
  const [botAvatar, setBotAvatar] = useState<string>('');
  const [botName, setBotName] = useState<string>('Bot');
  const userCache = useRef<Map<string, User>>(new Map());
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load guilds on mount
  useEffect(() => {
    api.getGuilds()
      .then(data => {
        const mapped = data.guilds.map(mapGuildToWorkspace);
        setWorkspaces(mapped);
        setBotId(data.botId || '');
        setBotAvatar(data.botAvatar || '');
        if (data.botTag) setBotName(data.botTag.split('#')[0] || 'Bot');
        setConnected(true);
        if (mapped.length > 0) setActiveGuildId(mapped[0].id);
      })
      .catch(() => {
        setError('Cannot connect to Discord bot. Make sure the bot is running.');
        setConnected(false);
      });
  }, []);

  // Load channels when guild changes
  useEffect(() => {
    if (!activeGuildId) return;
    setLoadingChannels(true);
    setChannels([]);
    setCategories([]);
    setActiveChannelId(null);
    setMessages([]);

    api.getChannels(activeGuildId).then(data => {
      const cats: Category[] = data.categories.map((c: any, i: number) => ({
        id: c.id, name: c.name, position: c.position || i, collapsed: false,
      }));
      setCategories(cats);

      const allChannels: Channel[] = [];
      data.categories.forEach((cat: any) => {
        cat.channels.forEach((ch: any) => {
          allChannels.push({ ...mapApiChannel(ch), categoryId: cat.id });
        });
      });
      data.uncategorized?.forEach((ch: any) => {
        allChannels.push({ ...mapApiChannel(ch), categoryId: 'uncategorized' });
      });
      setChannels(allChannels);
      setLoadingChannels(false);

      // Auto-select first text channel
      const first = allChannels.find(c => c.type === 'text' || c.type === 'announcement');
      if (first) setActiveChannelId(first.id);
    }).catch(() => setLoadingChannels(false));

    // Load members and roles in parallel
    api.getMembers(activeGuildId).then(data => {
      setMembers(data.members.map(mapApiMember));
    }).catch(() => {});

    api.getRoles(activeGuildId).then(data => {
      setRoles(data.roles.map(mapApiRole));
    }).catch(() => {});
  }, [activeGuildId]);

  // Load messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return;
    const ch = channels.find(c => c.id === activeChannelId);
    if (!ch || ch.type === 'voice') return;

    setLoadingMessages(true);
    setMessages([]);
    api.getMessages(activeChannelId).then(data => {
      const msgs = data.messages.map((m: any) => mapApiMessage(m, userCache.current));
      setMessages(msgs);
      setLoadingMessages(false);
    }).catch(() => setLoadingMessages(false));
  }, [activeChannelId]);

  // SSE real-time updates
  useEffect(() => {
    if (!connected) return;
    const disconnect = connectSSE((event, data: any) => {
      if (event === 'message') {
        if (data.channelId === activeChannelId) {
          const msg = mapApiMessage(data.message, userCache.current);
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
        if (data.channelId !== activeChannelId) {
          setChannels(prev => prev.map(c =>
            c.id === data.channelId ? { ...c, unreadCount: c.unreadCount + 1 } : c
          ));
        }
      } else if (event === 'messageDelete') {
        setMessages(prev => prev.filter(m => m.id !== data.id));
      } else if (event === 'typing') {
        if (data.channelId !== activeChannelId || data.userId === botId) return;
        const key = `${data.channelId}:${data.userId}`;
        const existing = typingTimers.current.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          setTypingUsers(prev => { const n = new Map(prev); n.delete(key); return n; });
          typingTimers.current.delete(key);
        }, 5000);
        typingTimers.current.set(key, timer);
        setTypingUsers(prev => new Map(prev).set(key, { name: data.displayName || data.username, timeout: timer }));
      } else if (event === 'presence') {
        setMembers(prev => prev.map(m =>
          m.id === data.userId ? { ...m, status: data.status } : m
        ));
      }
    });
    return disconnect;
  }, [connected, activeChannelId, botId]);

  const sendMessage = useCallback(async (content: string, replyTo?: string, imageBase64?: string, imageName?: string) => {
    if (!activeChannelId || (!content.trim() && !imageBase64)) return;
    try {
      let data;
      if (imageBase64) {
        data = await api.sendImage(activeChannelId, imageBase64, imageName || 'image.png', content || undefined, replyTo);
      } else {
        data = await api.sendMessage(activeChannelId, content, replyTo);
      }
      if (data.message) {
        const msg = mapApiMessage(data.message, userCache.current);
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    } catch (e: any) {
      console.error('Send failed:', e.message);
    }
  }, [activeChannelId]);

  const selectGuild = useCallback((id: string) => {
    setActiveGuildId(id);
  }, []);

  const selectChannel = useCallback((id: string) => {
    setActiveChannelId(id);
    setChannels(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0, mentionCount: 0 } : c));
  }, []);

  const loadMoreMessages = useCallback(async () => {
    if (!activeChannelId || messages.length === 0) return;
    const oldest = messages[0];
    try {
      const data = await api.getMessages(activeChannelId, oldest.id);
      const older = data.messages.map((m: any) => mapApiMessage(m, userCache.current));
      setMessages(prev => [...older.filter((m: Message) => !prev.some(p => p.id === m.id)), ...prev]);
    } catch {}
  }, [activeChannelId, messages]);

  const reloadRoles = useCallback(() => {
    if (!activeGuildId) return;
    api.getRoles(activeGuildId).then(data => {
      setRoles(data.roles.map(mapApiRole));
    }).catch(() => {});
  }, [activeGuildId]);

  // Get current typing users for active channel
  const currentTyping = [...typingUsers.entries()]
    .filter(([key]) => key.startsWith(activeChannelId + ':'))
    .map(([, v]) => v.name);

  return {
    workspaces, activeGuildId, selectGuild,
    categories, channels, activeChannelId, selectChannel, loadingChannels,
    messages, loadingMessages, loadMoreMessages,
    members, roles, sendMessage, connected, error,
    typingUsers: currentTyping, botId, botAvatar, botName,
    reloadRoles,
  };
}
