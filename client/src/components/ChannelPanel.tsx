import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash, Volume2, Megaphone, ChevronDown, ChevronRight,
  Plus, Settings, Search, Star, Lock, Users,
  Mic, MicOff, Headphones, PhoneOff, Shield
} from 'lucide-react';
import type { Channel, Category, Workspace } from '../types';
import { clsx } from 'clsx';

interface Props {
  workspace: Workspace;
  channels: Channel[];
  categories: Category[];
  activeChannelId: string;
  onSelectChannel: (id: string) => void;
  inVoice: boolean;
  voiceChannelId: string | null;
  onJoinVoice: (channelId: string) => void;
  onLeaveVoice: () => void;
  onOpenSettings: () => void;
  onOpenServerSettings: () => void;
}

function ChannelIcon({ type }: { type: string }) {
  if (type === 'voice') return <Volume2 size={16} className="text-[#8b8fa8]" />;
  if (type === 'announcement') return <Megaphone size={16} className="text-[#8b8fa8]" />;
  return <Hash size={16} className="text-[#8b8fa8]" />;
}

export default function ChannelPanel({
  workspace, channels, categories, activeChannelId,
  onSelectChannel, inVoice, voiceChannelId,
  onJoinVoice, onLeaveVoice, onOpenSettings, onOpenServerSettings
}: Props) {
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(
    new Set(categories.filter(c => c.collapsed).map(c => c.id))
  );
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategory = (id: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const favorites = channels.filter(c => c.isFavorite);

  const filteredChannels = searchQuery
    ? channels.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  return (
    <div className="w-[240px] bg-[#13151c] flex flex-col border-r border-[#1a1d27] h-full">
      {/* Workspace Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#1a1d27] hover:bg-[#1a1d27] transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#e8eaf6] text-sm truncate">{workspace.name}</span>
          {workspace.boostLevel && workspace.boostLevel > 0 && (
            <span className="text-[10px] text-[#ff73fa] font-semibold bg-[#ff73fa]/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
              BOOST {workspace.boostLevel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onOpenServerSettings} title="إعدادات السيرفر" className="p-1 rounded text-[#565a78] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all">
            <Shield size={14} />
          </button>
          <ChevronDown size={16} className="text-[#8b8fa8]" />
        </div>
      </div>

      {/* Channel Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-[#0e0f14] rounded-md px-2.5 py-1.5 border border-[#2a2d3e]">
          <Search size={13} className="text-[#565a78] flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث في القنوات..."
            className="bg-transparent text-[#e8eaf6] text-xs flex-1 placeholder-[#565a78] outline-none"
          />
        </div>
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {/* Search results */}
        {filteredChannels !== null ? (
          <>
            <div className="px-1 py-1 text-[10px] font-semibold text-[#565a78] uppercase tracking-wider">نتائج البحث</div>
            {filteredChannels.length === 0 && <div className="text-xs text-[#565a78] px-2 py-3 text-center">لا توجد نتائج</div>}
            {filteredChannels.map(ch => (
              <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId}
                inVoice={inVoice && voiceChannelId === ch.id}
                onClick={() => ch.type === 'voice' ? onJoinVoice(ch.id) : onSelectChannel(ch.id)} />
            ))}
          </>
        ) : (
          <>
            {/* Favorites */}
            {favorites.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-1 py-1 mt-1">
                  <Star size={11} className="text-[#565a78]" />
                  <span className="text-[10px] font-semibold text-[#565a78] uppercase tracking-wider">المفضلة</span>
                </div>
                {favorites.map(ch => (
                  <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId}
                    inVoice={inVoice && voiceChannelId === ch.id}
                    onClick={() => ch.type === 'voice' ? onJoinVoice(ch.id) : onSelectChannel(ch.id)} />
                ))}
                <div className="h-px bg-[#1f2235] mx-1 my-2" />
              </>
            )}

            {/* Categories */}
            {categories.map(cat => {
              const catChannels = channels.filter(c => c.categoryId === cat.id);
              if (catChannels.length === 0) return null;
              const isCollapsed = collapsedCats.has(cat.id);

              return (
                <div key={cat.id} className="mb-1">
                  <button onClick={() => toggleCategory(cat.id)}
                    className="flex items-center gap-1 px-1 py-1 w-full hover:text-[#e8eaf6] transition-colors group">
                    {isCollapsed ? (
                      <ChevronRight size={11} className="text-[#565a78] group-hover:text-[#8b8fa8]" />
                    ) : (
                      <ChevronDown size={11} className="text-[#565a78] group-hover:text-[#8b8fa8]" />
                    )}
                    <span className="text-[10px] font-semibold text-[#565a78] group-hover:text-[#8b8fa8] uppercase tracking-wider flex-1 text-left">
                      {cat.name}
                    </span>
                    <Plus size={13} className="text-[#565a78] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }} className="overflow-hidden">
                        <div className="space-y-0.5">
                          {catChannels.map(ch => (
                            <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId}
                              inVoice={inVoice && voiceChannelId === ch.id}
                              onClick={() => ch.type === 'voice' ? onJoinVoice(ch.id) : onSelectChannel(ch.id)} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Uncategorized */}
            {channels.filter(c => c.categoryId === 'uncategorized').length > 0 && (
              <div className="space-y-0.5 mt-2">
                {channels.filter(c => c.categoryId === 'uncategorized').map(ch => (
                  <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId}
                    inVoice={inVoice && voiceChannelId === ch.id}
                    onClick={() => ch.type === 'voice' ? onJoinVoice(ch.id) : onSelectChannel(ch.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Voice connected bar */}
      {inVoice && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mx-2 mb-2 p-2 bg-[#1e2130] rounded-lg border border-[#3ddc84]/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#3ddc84] animate-pulse" />
              <span className="text-[11px] text-[#3ddc84] font-medium">متصل بالصوت</span>
            </div>
            <button onClick={onLeaveVoice} className="text-[#ff5252] hover:text-[#ff6b6b] transition-colors">
              <PhoneOff size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMuted(!muted)}
              className={clsx('flex-1 flex items-center justify-center py-1 rounded text-xs font-medium transition-colors',
                muted ? 'bg-[#ff5252]/20 text-[#ff5252]' : 'bg-[#252840] text-[#8b8fa8] hover:text-white')}>
              {muted ? <MicOff size={12} /> : <Mic size={12} />}
            </button>
            <button onClick={() => setDeafened(!deafened)}
              className={clsx('flex-1 flex items-center justify-center py-1 rounded text-xs font-medium transition-colors',
                deafened ? 'bg-[#ff5252]/20 text-[#ff5252]' : 'bg-[#252840] text-[#8b8fa8] hover:text-white')}>
              <Headphones size={12} />
            </button>
          </div>
        </motion.div>
      )}

      {/* User panel */}
      <div className="p-2 bg-[#0e0f14] border-t border-[#1a1d27] flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[#e8eaf6] truncate">البوت</div>
          <div className="text-[10px] text-[#565a78]">متصل</div>
        </div>
        <div className="flex items-center gap-1">
          <button className={clsx('p-1 rounded transition-colors hover:bg-[#252840]', muted ? 'text-[#ff5252]' : 'text-[#8b8fa8] hover:text-white')} onClick={() => setMuted(!muted)}>
            {muted ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button className={clsx('p-1 rounded transition-colors hover:bg-[#252840]', deafened ? 'text-[#ff5252]' : 'text-[#8b8fa8] hover:text-white')} onClick={() => setDeafened(!deafened)}>
            <Headphones size={15} />
          </button>
          <button className="p-1 rounded text-[#8b8fa8] hover:text-white hover:bg-[#252840] transition-colors" onClick={onOpenSettings} title="إعدادات البوت">
            <Settings size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelItem({ channel, isActive, inVoice, onClick }: {
  channel: Channel; isActive: boolean; inVoice: boolean; onClick: () => void;
}) {
  const hasUnread = channel.unreadCount > 0;
  const hasMention = channel.mentionCount > 0;
  const voiceCount = (channel as any).voiceMembers?.length || channel.currentUsers?.length || 0;

  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={onClick}
      className={clsx(
        'channel-item w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all',
        isActive ? 'bg-[#2d3150] text-[#e8eaf6]'
          : inVoice ? 'bg-[#3ddc84]/10 text-[#3ddc84]'
          : hasUnread ? 'text-[#e8eaf6] hover:bg-[#1e2130]'
          : 'text-[#565a78] hover:text-[#8b8fa8] hover:bg-[#1e2130]'
      )}>
      <div className={clsx('flex-shrink-0', isActive ? 'text-[#e8eaf6]' : 'text-[#565a78]')}>
        {channel.isLocked ? <Lock size={15} /> : <ChannelIcon type={channel.type} />}
      </div>
      <span className={clsx('flex-1 text-sm truncate', hasUnread && !isActive ? 'font-semibold' : 'font-medium')}>
        {channel.name}
      </span>

      {/* Voice users count */}
      {channel.type === 'voice' && voiceCount > 0 && (
        <span className="text-[10px] text-[#3ddc84] flex items-center gap-0.5 flex-shrink-0">
          <Users size={10} />{voiceCount}
        </span>
      )}

      {/* Mention badge */}
      {hasMention && (
        <span className="min-w-[18px] h-[18px] rounded-full bg-[#6c63ff] text-white text-[10px] font-bold flex items-center justify-center px-1 flex-shrink-0">
          {channel.mentionCount > 9 ? '9+' : channel.mentionCount}
        </span>
      )}
      {hasUnread && !hasMention && <div className="w-2 h-2 rounded-full bg-[#e8eaf6] flex-shrink-0" />}
    </motion.button>
  );
}
