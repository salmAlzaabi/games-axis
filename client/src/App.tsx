import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import WorkspaceRail from './components/WorkspaceRail';
import ChannelPanel from './components/ChannelPanel';
import MessageArea from './components/MessageArea';
import MemberPanel from './components/MemberPanel';
import VoiceChannel from './components/VoiceChannel';
import UserProfileModal from './components/UserProfileModal';
import SearchModal from './components/SearchModal';
import BotSettingsModal from './components/BotSettingsModal';
import ServerSettingsModal from './components/ServerSettingsModal';
import DMPanel from './components/DMPanel';
import { useDiscordData } from './hooks/useDiscordData';
import type { User } from './types';
import { Bell, Search, Settings, WifiOff, Loader, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

export default function App() {
  const {
    workspaces, activeGuildId, selectGuild,
    categories, channels, activeChannelId, selectChannel, loadingChannels,
    messages, loadingMessages, loadMoreMessages,
    members, roles, sendMessage, connected, error,
    typingUsers, botId, botAvatar, botName,
    reloadRoles,
  } = useDiscordData();

  const [memberPanelOpen, setMemberPanelOpen] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [botSettingsOpen, setBotSettingsOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [dmPanelOpen, setDmPanelOpen] = useState(false);
  const [dmInitialUser, setDmInitialUser] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeWorkspace = workspaces.find(w => w.id === activeGuildId);
  const activeChannel = channels.find(c => c.id === activeChannelId);
  const isInVoice = !!voiceChannelId;

  // Build membersMap: id → displayName
  const membersMap = new Map<string, string>(members.map(m => [m.id, m.displayName]));

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') { setSearchOpen(false); setSelectedUser(null); setBotSettingsOpen(false); setServerSettingsOpen(false); setDmPanelOpen(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleJoinVoice = (channelId: string) => {
    setVoiceChannelId(channelId);
    selectChannel(channelId);
    setSidebarOpen(false);
  };
  const handleLeaveVoice = () => {
    setVoiceChannelId(null);
    const first = channels.find(c => c.type === 'text');
    if (first) selectChannel(first.id);
  };

  const handleOpenDM = useCallback((user: User) => {
    setDmInitialUser(user.id);
    setDmPanelOpen(true);
    setSelectedUser(null);
  }, []);

  const handleUserClick = useCallback((userId: string) => {
    const user = members.find(m => m.id === userId);
    if (user) setSelectedUser(user);
  }, [members]);

  // Loading state
  if (!connected && !error) {
    return (
      <div className="flex h-screen bg-[#0e0f14] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <Loader size={32} className="text-[#6c63ff]" />
          </motion.div>
          <p className="text-[#8b8fa8] text-sm">جاري الاتصال بالبوت...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || workspaces.length === 0) {
    return (
      <div className="flex h-screen bg-[#0e0f14] items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-[#ff5252]/10 flex items-center justify-center">
            <WifiOff size={28} className="text-[#ff5252]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#e8eaf6] mb-1">البوت غير متصل</h2>
            <p className="text-sm text-[#8b8fa8]">{error || 'البوت لا يعمل. شغّل البوت أولاً.'}</p>
          </div>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#6c63ff] text-white rounded-lg text-sm font-medium hover:bg-[#7b73ff] transition-colors">
            إعادة المحاولة
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0e0f14] overflow-hidden">
      {/* Workspace Rail */}
      <WorkspaceRail
        workspaces={workspaces}
        activeId={activeGuildId || ''}
        onSelect={id => { selectGuild(id); setSidebarOpen(false); }}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <div className="h-12 flex items-center justify-between px-3 sm:px-4 bg-[#13151c] border-b border-[#1a1d27] flex-shrink-0 gap-2">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="sm:hidden p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="font-semibold text-[#e8eaf6] truncate">{activeWorkspace?.name || 'Community Hub'}</span>
            {activeChannel && (
              <>
                <span className="text-[#565a78] hidden sm:block">/</span>
                <span className="text-[#8b8fa8] hidden sm:block truncate">#{activeChannel.name}</span>
              </>
            )}
          </div>

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-1.5 text-sm text-[#565a78] hover:border-[#6c63ff]/50 hover:text-[#8b8fa8] transition-all min-w-40 group"
          >
            <Search size={14} className="group-hover:text-[#6c63ff] transition-colors" />
            <span>بحث...</span>
            <kbd className="ml-auto text-[10px] bg-[#252840] px-1.5 py-0.5 rounded border border-[#2a2d3e]">⌘K</kbd>
          </button>

          {/* Right controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className={clsx(
              'hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium mr-1',
              connected ? 'bg-[#3ddc84]/10 text-[#3ddc84]' : 'bg-[#ff5252]/10 text-[#ff5252]'
            )}>
              {connected ? (
                <><div className="w-1.5 h-1.5 rounded-full bg-[#3ddc84] animate-pulse" />{activeWorkspace?.onlineCount || 0} online</>
              ) : (
                <><WifiOff size={12} />Offline</>
              )}
            </div>

            <button onClick={() => setSearchOpen(true)} className="sm:hidden p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all">
              <Search size={18} />
            </button>
            <button onClick={() => setDmPanelOpen(true)} title="الرسائل الخاصة" className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all">
              <MessageSquare size={18} />
            </button>
            <button className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all">
              <Bell size={18} />
            </button>
            <button onClick={() => setBotSettingsOpen(true)} title="إعدادات البوت" className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all">
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Main columns */}
        <div className="flex flex-1 min-h-0 relative">
          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 sm:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Channel panel */}
          {activeWorkspace && (
            <div className={clsx(
              'fixed sm:relative z-40 sm:z-auto h-full sm:h-auto transition-transform duration-200',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
            )}>
              <ChannelPanel
                workspace={activeWorkspace}
                channels={channels}
                categories={categories}
                activeChannelId={activeChannelId || ''}
                onSelectChannel={id => { selectChannel(id); setSidebarOpen(false); }}
                inVoice={isInVoice}
                voiceChannelId={voiceChannelId}
                onJoinVoice={handleJoinVoice}
                onLeaveVoice={handleLeaveVoice}
                onOpenSettings={() => setBotSettingsOpen(true)}
                onOpenServerSettings={() => setServerSettingsOpen(true)}
              />
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 flex relative min-w-0">
            {loadingChannels && (
              <div className="flex-1 flex items-center justify-center">
                <Loader size={24} className="text-[#6c63ff] animate-spin" />
              </div>
            )}

            {!loadingChannels && isInVoice && activeChannel?.type === 'voice' ? (
              <VoiceChannel
                channel={activeChannel}
                members={members}
                onLeave={handleLeaveVoice}
                guildId={activeGuildId || ''}
                onUserClick={handleUserClick}
              />
            ) : !loadingChannels && activeChannel ? (
              <MessageArea
                channel={activeChannel}
                messages={messages}
                loading={loadingMessages}
                onToggleMemberPanel={() => setMemberPanelOpen(p => !p)}
                memberPanelOpen={memberPanelOpen}
                onSendMessage={sendMessage}
                onLoadMore={loadMoreMessages}
                typingUsers={typingUsers}
                botId={botId}
                channelId={activeChannelId || ''}
                guildId={activeGuildId || ''}
                membersMap={membersMap}
                onUserClick={handleUserClick}
              />
            ) : !loadingChannels ? (
              <div className="flex-1 flex items-center justify-center flex-col gap-3 text-[#565a78]">
                <div className="text-4xl opacity-30">💬</div>
                <p className="text-sm">اختر قناة للبدء</p>
              </div>
            ) : null}
          </div>

          {/* Member panel */}
          <AnimatePresence>
            {memberPanelOpen && !isInVoice && members.length > 0 && (
              <div className="hidden md:block h-full">
                <MemberPanel
                  members={members}
                  roles={roles}
                  onClose={() => setMemberPanelOpen(false)}
                  onSelectUser={setSelectedUser}
                  onDM={handleOpenDM}
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modals */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        messages={messages}
        users={members}
        channels={channels}
      />

      <BotSettingsModal
        isOpen={botSettingsOpen}
        onClose={() => setBotSettingsOpen(false)}
        botAvatar={botAvatar}
        botName={botName}
      />

      <ServerSettingsModal
        isOpen={serverSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
        guildId={activeGuildId || ''}
        roles={roles}
        onRolesChange={reloadRoles}
      />

      <DMPanel
        isOpen={dmPanelOpen}
        onClose={() => { setDmPanelOpen(false); setDmInitialUser(null); }}
        members={members}
        initialUserId={dmInitialUser}
      />

      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          roles={roles}
          currentUser={{ id: botId, username: botName, displayName: botName, avatar: botAvatar, status: 'online', roles: [], joinedAt: '' }}
          guildId={activeGuildId || ''}
          onClose={() => setSelectedUser(null)}
          onDM={handleOpenDM}
        />
      )}
    </div>
  );
}
