import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, Loader, Search, ArrowLeft } from 'lucide-react';
import type { User, Message } from '../types';
import { api } from '../services/api';
import MessageComposer from './MessageComposer';

interface DMUser {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  members: User[];
  initialUserId?: string | null;
}

function mapApiMessage(m: any): Message {
  return {
    id: m.id,
    content: m.content || '',
    author: {
      id: m.author.id,
      username: m.author.username,
      displayName: m.author.displayName || m.author.username,
      avatar: m.author.avatar,
      status: 'online',
      roles: [],
      joinedAt: '',
      bot: m.author.bot,
    } as any,
    timestamp: m.timestamp,
    editedAt: m.editedTimestamp || undefined,
    reactions: [],
    attachments: m.attachments || [],
    embeds: m.embeds || [],
    replyTo: m.referencedMessage ? mapApiMessage(m.referencedMessage) : undefined,
  };
}

export default function DMPanel({ isOpen, onClose, members, initialUserId }: Props) {
  const [dmUsers, setDMUsers] = useState<DMUser[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(initialUserId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load DM users from API + merge with members
  useEffect(() => {
    if (!isOpen) return;
    api.getDMs().then(data => setDMUsers(data.dms || [])).catch(() => {});
  }, [isOpen]);

  // Open a specific user on init
  useEffect(() => {
    if (initialUserId) openDM(initialUserId);
  }, [initialUserId]);

  const openDM = async (userId: string) => {
    setActiveUserId(userId);
    setLoading(true);
    setMessages([]);
    try {
      const data = await api.getDMMessages(userId);
      setMessages(data.messages.map(mapApiMessage));
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (content: string, imageBase64?: string, imageName?: string) => {
    if (!activeUserId) return;
    try {
      const data = await api.sendDM(activeUserId, content, imageBase64, imageName);
      if (data.message) setMessages(prev => [...prev, mapApiMessage(data.message)]);
    } catch (e: any) { alert('خطأ: ' + e.message); }
  };

  // Merge DM users with members for display
  const allUsers: DMUser[] = [
    ...dmUsers,
    ...members
      .filter(m => !dmUsers.some(d => d.userId === m.id) && !m.bot)
      .map(m => ({ id: m.id, userId: m.id, username: m.username, displayName: m.displayName, avatar: m.avatar })),
  ];

  const filtered = allUsers.filter(u =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  const activeUser = allUsers.find(u => u.userId === activeUserId);

  const formatTime = (ts: number) => new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ts));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            onClick={e => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl h-[80vh] bg-[#1a1d27] rounded-2xl shadow-2xl border border-[#2a2d3e] overflow-hidden flex"
          >
            {/* Users list */}
            <div className="w-64 flex-shrink-0 border-r border-[#2a2d3e] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2d3e]">
                <div className="flex items-center gap-2"><MessageSquare size={16} className="text-[#6c63ff]" /><span className="font-bold text-sm text-[#e8eaf6]">الرسائل الخاصة</span></div>
                <button onClick={onClose} className="p-1 rounded text-[#565a78] hover:text-[#e8eaf6]"><X size={14} /></button>
              </div>
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 bg-[#252840] rounded-lg px-2 py-1.5">
                  <Search size={13} className="text-[#565a78]" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="flex-1 bg-transparent text-sm text-[#e8eaf6] outline-none placeholder-[#565a78]" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filtered.map(u => (
                  <button key={u.userId} onClick={() => openDM(u.userId)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#252840] transition-colors ${activeUserId === u.userId ? 'bg-[#252840]' : ''}`}>
                    <img src={u.avatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0 object-cover" />
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-sm font-medium text-[#e8eaf6] truncate">{u.displayName || u.username}</div>
                      <div className="text-xs text-[#565a78] truncate">@{u.username}</div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <div className="text-center py-8 text-sm text-[#565a78]">لا يوجد مستخدمون</div>}
              </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0">
              {!activeUserId ? (
                <div className="flex-1 flex items-center justify-center flex-col gap-3 text-[#565a78]">
                  <div className="text-4xl opacity-30">💬</div>
                  <p className="text-sm">اختر شخصاً لبدء المحادثة</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2d3e] bg-[#13151c]">
                    <button onClick={() => setActiveUserId(null)} className="p-1 rounded text-[#565a78] hover:text-[#e8eaf6] md:hidden"><ArrowLeft size={16} /></button>
                    {activeUser && <img src={activeUser.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />}
                    <div>
                      <div className="text-sm font-semibold text-[#e8eaf6]">{activeUser?.displayName || activeUser?.username}</div>
                      <div className="text-xs text-[#565a78]">رسالة خاصة</div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                    {loading && <div className="flex justify-center py-8"><Loader size={20} className="text-[#6c63ff] animate-spin" /></div>}
                    {!loading && messages.length === 0 && (
                      <div className="flex flex-col items-center py-12 gap-3 text-[#565a78]">
                        {activeUser && <img src={activeUser.avatar} alt="" className="w-16 h-16 rounded-full opacity-60" />}
                        <div className="text-sm text-center">بداية محادثتك مع<br /><strong className="text-[#8b8fa8]">{activeUser?.displayName}</strong></div>
                      </div>
                    )}
                    {messages.map((msg, i) => {
                      const prev = messages[i - 1];
                      const grouped = !!(prev && prev.author.id === msg.author.id && msg.timestamp - prev.timestamp < 5 * 60 * 1000);
                      return (
                        <div key={msg.id} className={`flex gap-2.5 ${grouped ? 'mt-0.5' : 'mt-3'}`}>
                          {!grouped ? (
                            <img src={msg.author.avatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0 mt-0.5 object-cover" />
                          ) : <div className="w-9 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            {!grouped && (
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="text-sm font-semibold text-[#e8eaf6]">{msg.author.displayName}</span>
                                {(msg.author as any).bot && <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-[#5865f2]/30 text-[#8fa0ff]">BOT</span>}
                                <span className="text-[11px] text-[#565a78]">{formatTime(msg.timestamp)}</span>
                              </div>
                            )}
                            {msg.content && <div className="text-sm text-[#c9cdd9] leading-relaxed break-words">{msg.content}</div>}
                            {(msg.attachments || []).map((att, ai) => (
                              <div key={ai} className="mt-1">
                                {att.contentType?.startsWith('image/') ? (
                                  <img src={att.url} alt={att.name} className="max-w-xs max-h-48 rounded-lg border border-[#2a2d3e] cursor-pointer hover:opacity-90" onClick={() => window.open(att.url, '_blank')} />
                                ) : (
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#6c63ff] hover:underline">📎 {att.name}</a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>

                  {/* Composer */}
                  <MessageComposer
                    channelName={activeUser?.displayName || 'user'}
                    replyTo={null}
                    onCancelReply={() => {}}
                    onSend={handleSend}
                    autoFocus
                  />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
