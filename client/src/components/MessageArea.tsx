import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Pin, Users, Search, Bell, Inbox, HelpCircle, ChevronDown, Loader, Megaphone } from 'lucide-react';
import type { Channel, Message } from '../types';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

interface Props {
  channel: Channel;
  messages: Message[];
  loading?: boolean;
  onToggleMemberPanel: () => void;
  memberPanelOpen: boolean;
  onSendMessage: (content: string, replyTo?: string, imageBase64?: string, imageName?: string) => void;
  onLoadMore?: () => void;
  typingUsers?: string[];
  botId?: string;
  channelId: string;
  guildId: string;
  membersMap: Map<string, string>;
  onUserClick?: (userId: string) => void;
}

export default function MessageArea({
  channel, messages, loading = false,
  onToggleMemberPanel, memberPanelOpen, onSendMessage,
  onLoadMore, typingUsers = [], botId = '',
  channelId, guildId, membersMap, onUserClick,
}: Props) {
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // These refs avoid state/re-render overhead
  const isAtBottom = useRef(true);
  const initialScrollDone = useRef(false);   // did we scroll-to-bottom after load?
  const loadMoreEnabled = useRef(false);     // prevent loadMore on initial render
  const isLoadingMore = useRef(false);       // currently fetching older messages?
  const preLoadScrollHeight = useRef(0);     // scrollHeight before prepend
  const prevMsgCount = useRef(0);

  /* ── Reset everything when channel changes ── */
  useEffect(() => {
    initialScrollDone.current = false;
    loadMoreEnabled.current = false;
    isLoadingMore.current = false;
    preLoadScrollHeight.current = 0;
    prevMsgCount.current = 0;
    isAtBottom.current = true;
    setReplyTo(null);
    setShowScrollDown(false);
  }, [channel.id]);

  /* ── ResizeObserver: keep bottom-pinned when composer grows/shrinks ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (isAtBottom.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Scroll to BOTTOM before browser paints (no flash) ── */
  useLayoutEffect(() => {
    // Only when loading finishes and we haven't done initial scroll yet
    if (!loading && !initialScrollDone.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isAtBottom.current = true;
      initialScrollDone.current = true;
      prevMsgCount.current = messages.length;
      // Enable loadMore 600 ms later so user must deliberately scroll up
      setTimeout(() => { loadMoreEnabled.current = true; }, 600);
    }
  }); // no deps → runs after every commit, the guards above prevent repeat work

  /* ── Restore scroll position after prepending older messages ── */
  useLayoutEffect(() => {
    if (isLoadingMore.current && preLoadScrollHeight.current > 0 && scrollRef.current) {
      const gained = scrollRef.current.scrollHeight - preLoadScrollHeight.current;
      scrollRef.current.scrollTop = gained > 0 ? gained : 0;
      isLoadingMore.current = false;
      preLoadScrollHeight.current = 0;
    }
  });

  /* ── Auto-scroll when NEW messages arrive (only if at bottom) ── */
  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMsgCount.current && !isLoadingMore.current && isAtBottom.current && initialScrollDone.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMsgCount.current = newCount;
  }, [messages.length]);

  /* ── Scroll listener ── */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const fromBottom = scrollHeight - scrollTop - clientHeight;
    isAtBottom.current = fromBottom < 120;
    setShowScrollDown(fromBottom > 400);

    // Load older messages only when user scrolled near top deliberately
    if (
      scrollTop < 80 &&
      onLoadMore &&
      messages.length > 0 &&
      loadMoreEnabled.current &&
      !isLoadingMore.current
    ) {
      isLoadingMore.current = true;
      preLoadScrollHeight.current = scrollHeight;
      onLoadMore();
    }
  }, [onLoadMore, messages.length]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) { el.scrollTop = el.scrollHeight; }
    isAtBottom.current = true;
    setShowScrollDown(false);
  };

  /* ── Global keypress → focus composer ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      document.querySelector<HTMLTextAreaElement>('textarea[placeholder]')?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ── Group consecutive messages from same author ── */
  const grouped = messages.map((msg, i) => {
    const prev = messages[i - 1];
    const isGrouped = !!(
      prev &&
      prev.author.id === msg.author.id &&
      msg.timestamp - prev.timestamp < 5 * 60 * 1000 &&
      !msg.replyTo
    );
    return { ...msg, isGrouped };
  });

  const channelIcon = channel.type === 'announcement' ? <Megaphone size={16} /> : <Hash size={16} />;

  return (
    <div className="flex-1 flex flex-col bg-[#13151c] min-w-0 relative">
      {/* ── Top bar ── */}
      <div className="h-12 flex items-center px-4 gap-3 border-b border-[#1a1d27] bg-[#13151c] flex-shrink-0 z-10">
        <span className="text-[#8b8fa8]">{channelIcon}</span>
        <span className="font-semibold text-sm text-[#e8eaf6]">{channel.name}</span>
        {channel.topic && (
          <>
            <div className="w-px h-4 bg-[#2a2d3e] hidden sm:block" />
            <span className="text-[#8b8fa8] text-xs truncate flex-1 max-w-md hidden sm:block">{channel.topic}</span>
          </>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {[
            { icon: <Bell size={18} />, label: 'إشعارات' },
            { icon: <Pin size={18} />, label: 'المثبتات' },
            { icon: <Search size={18} />, label: 'بحث' },
            { icon: <Inbox size={18} />, label: 'صندوق الوارد' },
            { icon: <HelpCircle size={18} />, label: 'مساعدة' },
          ].map(({ icon, label }) => (
            <button key={label} title={label}
              className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all hidden sm:flex">
              {icon}
            </button>
          ))}
          <button
            onClick={onToggleMemberPanel}
            className={`p-1.5 rounded transition-all ${memberPanelOpen
              ? 'bg-[#2d3150] text-[#e8eaf6]'
              : 'text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#1e2130]'
            }`}
          >
            <Users size={18} />
          </button>
        </div>
      </div>

      {/* ── Messages scroll container ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-4"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-40">
            <Loader size={28} className="text-[#6c63ff] animate-spin" />
          </div>
        ) : (
          <>
            {/* Channel intro */}
            <div className="mb-8 mt-2">
              <div className="w-14 h-14 rounded-2xl bg-[#6c63ff]/20 flex items-center justify-center mb-4">
                <span className="text-[#6c63ff] text-2xl">{channelIcon}</span>
              </div>
              <h2 className="text-2xl font-bold text-[#e8eaf6] mb-1">مرحباً في #{channel.name}</h2>
              <p className="text-[#8b8fa8] text-sm">
                {channel.topic || `هذه بداية قناة #${channel.name}.`}
              </p>
            </div>

            {/* Messages */}
            {grouped.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                currentUser={{
                  id: botId, username: 'bot', displayName: 'bot',
                  avatar: '', status: 'online', roles: [], joinedAt: '',
                } as any}
                channelId={channelId}
                guildId={guildId}
                membersMap={membersMap}
                onReply={() => setReplyTo(msg)}
                onDelete={() => {}}
                onUserClick={onUserClick}
              />
            ))}

            {messages.length === 0 && (
              <p className="text-center py-6 text-[#565a78] text-sm">
                لا توجد رسائل بعد. كن أول من يتحدث!
              </p>
            )}
          </>
        )}

        {/* Typing indicator */}
        <AnimatePresence>
          {typingUsers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-2 text-[#8b8fa8] text-xs mt-2 h-6"
            >
              <div className="flex gap-0.5 items-end">
                {[0, 1, 2].map(i => (
                  <motion.div key={i}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    className="w-1.5 h-1.5 rounded-full bg-[#8b8fa8]"
                  />
                ))}
              </div>
              <span>
                {typingUsers.length === 1
                  ? <><strong className="text-[#e8eaf6]">{typingUsers[0]}</strong> يكتب...</>
                  : <><strong className="text-[#e8eaf6]">{typingUsers.length}</strong> يكتبون...</>}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            onClick={scrollToBottom}
            className="absolute bottom-24 right-6 z-10 p-2.5 rounded-full bg-[#6c63ff] text-white shadow-xl hover:bg-[#7b73ff] transition-colors"
          >
            <ChevronDown size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Composer */}
      <MessageComposer
        channelName={channel.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={(content, imageBase64, imageName) => {
          onSendMessage(content, replyTo?.id, imageBase64, imageName);
          setReplyTo(null);
          // Scroll to bottom after send
          requestAnimationFrame(() => scrollToBottom());
        }}
        autoFocus
      />
    </div>
  );
}
