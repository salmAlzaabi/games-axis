import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, Smile, Pencil, Trash2, Copy, Check, X } from 'lucide-react';
import type { Message, User } from '../types';
import { api } from '../services/api';
import { clsx } from 'clsx';

interface Props {
  message: Message & { isGrouped: boolean };
  currentUser: User;
  channelId: string;
  guildId?: string;
  membersMap?: Map<string, string>;
  onReply: () => void;
  onDelete?: (id: string) => void;
  onUserClick?: (userId: string) => void;
}

function formatTime(ts: number) {
  return new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));
}

function renderContent(content: string, membersMap?: Map<string, string>): React.ReactNode {
  if (!content) return null;
  // Parse Discord mentions, bold, italic, code
  const parts = content.split(/(<@!?\d+>|<#\d+>|<@&\d+>|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g);
  return parts.map((part, i) => {
    const userMatch = part.match(/^<@!?(\d+)>$/);
    if (userMatch) {
      const name = membersMap?.get(userMatch[1]) || `@${userMatch[1].slice(0, 6)}...`;
      return <span key={i} className="mention cursor-pointer font-medium px-1 py-0.5 rounded bg-[#6c63ff]/20 text-[#a5a0ff] hover:bg-[#6c63ff]/30 transition-colors">@{name}</span>;
    }
    const channelMatch = part.match(/^<#(\d+)>$/);
    if (channelMatch) return <span key={i} className="mention text-[#6c63ff] cursor-pointer hover:underline">#{channelMatch[1].slice(0, 6)}...</span>;
    const roleMatch = part.match(/^<@&(\d+)>$/);
    if (roleMatch) return <span key={i} className="mention px-1 py-0.5 rounded bg-[#ffd93d]/10 text-[#ffd93d]">@role</span>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="px-1.5 py-0.5 rounded bg-[#252840] text-[#e8eaf6] text-[13px] font-mono">{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-[#e8eaf6]">{part.slice(2, -2)}</strong>;
    if (part.startsWith('__') && part.endsWith('__')) return <u key={i}>{part.slice(2, -2)}</u>;
    // Linkify URLs
    const urlParts = part.split(/(https?:\/\/[^\s]+)/g);
    return urlParts.map((p, j) =>
      p.startsWith('http') ? <a key={j} href={p} target="_blank" rel="noopener noreferrer" className="text-[#6c63ff] hover:underline">{p}</a> : p
    );
  });
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '✨', '🎉', '😮', '😢'];

export default function MessageBubble({ message, currentUser, channelId, guildId, membersMap, onReply, onDelete, onUserClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [reactions, setReactions] = useState(message.reactions);
  const [copied, setCopied] = useState(false);
  const [localDeleted, setLocalDeleted] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isBotMsg = message.author.bot || message.author.id === currentUser.id;
  const statusColor = { online: '#3ddc84', idle: '#f5c542', dnd: '#ff5252', offline: '#565a78' }[message.author.status as string] || '#565a78';

  const handleReact = async (emoji: string) => {
    setEmojiOpen(false);
    const existing = reactions.find(r => r.emoji === emoji);
    const prevReacted = existing?.me;
    // Optimistic update
    setReactions(prev => {
      const e = prev.find(r => r.emoji === emoji);
      if (e) {
        if (e.me) return prev.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, me: false } : r).filter(r => r.count > 0);
        return prev.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, me: true } : r);
      }
      return [...prev, { emoji, count: 1, me: true, users: [] }];
    });
    try {
      if (prevReacted) await api.removeReaction(channelId, message.id, emoji);
      else await api.addReaction(channelId, message.id, emoji);
    } catch { /* revert optimistic */ }
  };

  const handleDelete = async () => {
    if (!window.confirm('حذف الرسالة؟')) return;
    try {
      await api.deleteMessage(channelId, message.id);
      setLocalDeleted(true);
      onDelete?.(message.id);
    } catch (e: any) { alert('خطأ: ' + e.message); }
  };

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === message.content) { setEditing(false); return; }
    try {
      await api.editMessage(channelId, message.id, editContent);
      setEditing(false);
    } catch (e: any) { alert('خطأ: ' + e.message); }
  };

  const copyId = () => {
    navigator.clipboard.writeText(message.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (localDeleted) return null;

  if (message.type === 'system') {
    return (
      <div className="flex items-center gap-3 px-2 py-1 my-1">
        <div className="flex-1 h-px bg-[#2a2d3e]" />
        <span className="text-[11px] text-[#565a78] px-2">{message.systemText}</span>
        <div className="flex-1 h-px bg-[#2a2d3e]" />
      </div>
    );
  }

  return (
    <div
      className={clsx('message-hover relative group px-2 rounded-lg transition-colors', hovered ? 'bg-[#1a1d27]' : '', message.isGrouped ? 'pt-0.5 pb-0.5' : 'pt-3 pb-0.5')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setEmojiOpen(false); }}
    >
      {/* Reply context */}
      {message.replyTo && (
        <div className="flex items-center gap-2 ml-10 mb-1 cursor-pointer group/reply">
          <div className="w-5 h-px bg-[#565a78] mt-2" />
          <img src={message.replyTo.author.avatar} alt="" className="w-4 h-4 rounded-full" />
          <span className="text-xs text-[#8b8fa8] font-medium group-hover/reply:text-[#6c63ff] transition-colors">
            @{message.replyTo.author.displayName}
          </span>
          <span className="text-xs text-[#565a78] truncate max-w-xs">
            {message.replyTo.content.slice(0, 60)}{message.replyTo.content.length > 60 ? '…' : ''}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar / timestamp */}
        {!message.isGrouped ? (
          <div className="flex-shrink-0 relative">
            <img
              src={message.author.avatar}
              alt={message.author.displayName}
              onClick={() => onUserClick?.(message.author.id)}
              className="w-10 h-10 rounded-full cursor-pointer hover:opacity-90 transition-opacity"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#13151c]" style={{ background: statusColor }} />
          </div>
        ) : (
          <div className="w-10 flex-shrink-0 flex items-center justify-end">
            {hovered && <span className="text-[10px] text-[#565a78] tabular-nums">{formatTime(message.timestamp)}</span>}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {!message.isGrouped && (
            <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
              <span
                className="font-semibold text-sm cursor-pointer hover:underline"
                style={{ color: (message.author as any).color || '#e8eaf6' }}
                onClick={() => onUserClick?.(message.author.id)}
              >
                {message.author.displayName}
              </span>
              {message.author.bot && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#5865f2]/30 text-[#8fa0ff]">BOT</span>
              )}
              <span className="text-[11px] text-[#565a78]">{formatTime(message.timestamp)}</span>
              {message.editedAt && <span className="text-[10px] text-[#565a78] italic">(edited)</span>}
            </div>
          )}

          {/* Text content */}
          {editing ? (
            <div className="mt-1">
              <textarea
                ref={editRef}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
                autoFocus
                rows={2}
                className="w-full bg-[#252840] text-[#e8eaf6] text-sm rounded-lg px-3 py-2 outline-none border border-[#6c63ff]/50 resize-none"
              />
              <div className="flex gap-2 mt-1 text-xs text-[#565a78]">
                <span>Esc لإلغاء · Enter للحفظ</span>
                <button onClick={() => setEditing(false)} className="ml-auto text-[#ff5252] hover:text-[#ff7070]">إلغاء</button>
                <button onClick={handleEdit} className="text-[#3ddc84] hover:text-[#5deca4]">حفظ</button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#c9cdd9] leading-relaxed break-words">
              {renderContent(message.content, membersMap)}
            </div>
          )}

          {/* Attachments */}
          {(message.attachments || []).map((att, i) => (
            <div key={i} className="mt-2">
              {att.contentType?.startsWith('image/') ? (
                <img
                  src={att.url}
                  alt={att.name}
                  className="max-w-sm max-h-72 rounded-lg border border-[#2a2d3e] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(att.url, '_blank')}
                />
              ) : (
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-[#1e2130] rounded-lg border border-[#2a2d3e] max-w-xs hover:border-[#6c63ff]/40 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-[#6c63ff]/20 flex items-center justify-center text-xl">📎</div>
                  <div>
                    <div className="text-sm text-[#e8eaf6] font-medium truncate">{att.name}</div>
                    <div className="text-xs text-[#565a78]">{att.size ? (att.size / 1024).toFixed(0) + ' KB' : ''}</div>
                  </div>
                </a>
              )}
            </div>
          ))}

          {/* Embeds */}
          {(message.embeds || []).map((embed, i) => (
            <div key={i} className="mt-2 pl-3 py-2 pr-3 rounded-lg bg-[#1e2130] border-l-4 max-w-lg" style={{ borderLeftColor: embed.color || '#6c63ff' }}>
              {embed.author && <div className="text-xs font-medium text-[#8b8fa8] mb-1 flex items-center gap-1.5">
                {embed.author.iconUrl && <img src={embed.author.iconUrl} className="w-4 h-4 rounded-full" alt="" />}
                {embed.author.name}
              </div>}
              {embed.title && <div className={clsx('text-sm font-semibold mb-1', embed.url ? 'text-[#6c63ff] hover:underline cursor-pointer' : 'text-[#e8eaf6]')} onClick={() => embed.url && window.open(embed.url, '_blank')}>{embed.title}</div>}
              {embed.description && <div className="text-xs text-[#8b8fa8] leading-relaxed whitespace-pre-wrap">{embed.description.slice(0, 300)}{embed.description.length > 300 ? '…' : ''}</div>}
              {embed.fields && embed.fields.slice(0, 4).map((f, fi) => (
                <div key={fi} className={clsx('mt-2', f.inline ? 'inline-block mr-4' : '')}>
                  <div className="text-xs font-semibold text-[#e8eaf6]">{f.name}</div>
                  <div className="text-xs text-[#8b8fa8]">{f.value.slice(0, 100)}</div>
                </div>
              ))}
              {embed.image?.url && <img src={embed.image.url} alt="" className="mt-2 rounded-md max-w-xs max-h-48 object-cover" />}
              {embed.footer && <div className="text-[11px] text-[#565a78] mt-2 border-t border-[#2a2d3e] pt-2">{embed.footer.text}</div>}
            </div>
          ))}

          {/* Reactions */}
          {reactions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reactions.map(reaction => (
                <motion.button key={reaction.emoji} whileTap={{ scale: 0.9 }}
                  onClick={() => handleReact(reaction.emoji)}
                  className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                    reaction.me ? 'bg-[#6c63ff]/20 border-[#6c63ff]/50 text-[#a5a0ff]' : 'bg-[#1e2130] border-[#2a2d3e] text-[#8b8fa8] hover:border-[#6c63ff]/30 hover:bg-[#6c63ff]/10'
                  )}>
                  <span>{reaction.emoji}</span><span>{reaction.count}</span>
                </motion.button>
              ))}
              <button onClick={() => setEmojiOpen(true)} className="flex items-center px-2 py-0.5 rounded-full text-xs text-[#565a78] border border-dashed border-[#2a2d3e] hover:border-[#6c63ff]/30 transition-all">
                <Smile size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <AnimatePresence>
        {hovered && !editing && (
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 4 }} transition={{ duration: 0.1 }}
            className="message-actions absolute right-2 -top-4 flex items-center gap-0.5 bg-[#1e2130] rounded-lg border border-[#2a2d3e] shadow-xl px-1 py-1 z-10"
          >
            {QUICK_EMOJIS.slice(0, 4).map(emoji => (
              <button key={emoji} onClick={() => handleReact(emoji)} className="px-1.5 py-1 rounded hover:bg-[#252840] transition-colors text-base leading-none">{emoji}</button>
            ))}
            <div className="w-px h-4 bg-[#2a2d3e] mx-0.5" />
            <button title="المزيد من الإيموجي" onClick={() => setEmojiOpen(v => !v)} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all"><Smile size={15} /></button>
            <button title="رد" onClick={onReply} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all"><Reply size={15} /></button>
            {isBotMsg && <button title="تعديل" onClick={() => { setEditing(true); setEditContent(message.content); }} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#ffd93d] hover:bg-[#252840] transition-all"><Pencil size={15} /></button>}
            <button title="حذف" onClick={handleDelete} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#ff5252] hover:bg-[#252840] transition-all"><Trash2 size={15} /></button>
            <button title="نسخ الID" onClick={copyId} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all">
              {copied ? <Check size={15} className="text-[#3ddc84]" /> : <Copy size={15} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker */}
      <AnimatePresence>
        {emojiOpen && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="absolute right-2 top-6 z-50 bg-[#1e2130] rounded-xl border border-[#2a2d3e] shadow-2xl p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#565a78] font-medium">إضافة رد فعل</span>
              <button onClick={() => setEmojiOpen(false)} className="text-[#565a78] hover:text-[#e8eaf6]"><X size={13} /></button>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {QUICK_EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => handleReact(emoji)} className="text-xl p-1.5 rounded hover:bg-[#252840] transition-colors hover:scale-125">{emoji}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
