export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  status: UserStatus;
  customStatus?: string;
  bio?: string;
  roles: string[];
  joinedAt: string;
  badges?: string[];
  banner?: string;
  bot?: boolean;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
  memberCount: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
  me: boolean;
}

export interface Attachment {
  id: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface Embed {
  title?: string;
  description?: string;
  color?: string;
  url?: string;
  author?: { name: string; iconUrl?: string };
  footer?: { text: string };
  image?: { url: string; width?: number; height?: number };
  thumbnail?: { url: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
}

export interface Message {
  id: string;
  content: string;
  author: User;
  timestamp: number;
  editedAt?: number;
  replyTo?: Message;
  reactions: Reaction[];
  attachments: Attachment[];
  embeds: Embed[];
  pinned?: boolean;
  thread?: { id: string; name: string; replyCount: number };
  type?: 'default' | 'system' | 'thread-created';
  systemText?: string;
}

export type ChannelType = 'text' | 'voice' | 'announcement' | 'thread' | 'stage' | 'forum';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  categoryId: string;
  topic?: string;
  unreadCount: number;
  mentionCount: number;
  lastMessage?: string;
  position: number;
  isNSFW?: boolean;
  slowMode?: number;
  userLimit?: number;
  currentUsers?: string[];
  isFavorite?: boolean;
  isLocked?: boolean;
  voiceMembers?: { id: string; displayName: string; avatar: string; muted: boolean; deafened: boolean }[];
}

export interface Category {
  id: string;
  name: string;
  position: number;
  collapsed: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  acronym: string;
  color: string;
  unreadCount: number;
  mentionCount: number;
  isOwner?: boolean;
  memberCount: number;
  onlineCount: number;
  boostLevel?: number;
}

export interface VoiceParticipant {
  user: User;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  cameraOn: boolean;
}

export interface Thread {
  id: string;
  name: string;
  channelId: string;
  ownerId: string;
  messageCount: number;
  memberCount: number;
  createdAt: number;
  lastActivity: number;
  archived?: boolean;
}

export type PanelView = 'members' | 'threads' | 'search' | 'pins' | 'profile';
