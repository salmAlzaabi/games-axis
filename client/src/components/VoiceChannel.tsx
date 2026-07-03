import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Volume2, Music } from 'lucide-react';
import type { User } from '../types';
import { api } from '../services/api';
import { clsx } from 'clsx';

interface VoiceMember {
  id: string;
  displayName: string;
  avatar: string;
  muted: boolean;
  deafened: boolean;
  speaking?: boolean;
}

interface Props {
  channel: any;
  members: User[];
  onLeave: () => void;
  guildId: string;
  onUserClick?: (userId: string) => void;
}

const SOUNDBOARD = [
  { label: '👏 تصفيق', emoji: '👏', sound: null },
  { label: '😂 ضحك', emoji: '😂', sound: null },
  { label: '🔔 جرس', emoji: '🔔', sound: null },
  { label: '💥 انفجار', emoji: '💥', sound: null },
  { label: '🎵 موسيقى', emoji: '🎵', sound: null },
  { label: '🥁 طبول', emoji: '🥁', sound: null },
  { label: '🎉 احتفال', emoji: '🎉', sound: null },
  { label: '😱 صرخة', emoji: '😱', sound: null },
];

export default function VoiceChannel({ channel, members, onLeave, guildId, onUserClick }: Props) {
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Build voice participants from channel.voiceMembers
  const voiceMembers: VoiceMember[] = (channel.voiceMembers || []).map((vm: any) => ({
    id: vm.id,
    displayName: vm.displayName,
    avatar: vm.avatar,
    muted: vm.muted || false,
    deafened: vm.deafened || false,
    speaking: speakingIds.has(vm.id),
  }));

  // Simulate speaking detection (random for demo)
  useEffect(() => {
    if (voiceMembers.length === 0) return;
    const interval = setInterval(() => {
      if (voiceMembers.length > 0) {
        const randomIdx = Math.floor(Math.random() * voiceMembers.length);
        const id = voiceMembers[randomIdx]?.id;
        if (id) {
          setSpeakingIds(new Set([id]));
          setTimeout(() => setSpeakingIds(new Set()), 1200);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [voiceMembers.length]);

  const doVoiceAction = async (action: string, fn: () => Promise<any>) => {
    setActionLoading(action);
    try { await fn(); } catch (e: any) { alert('خطأ: ' + e.message); }
    setActionLoading(null);
  };

  const handleSoundboard = (sound: typeof SOUNDBOARD[0]) => {
    // Play notification sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440 + Math.random() * 200;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0e0f14]">
      {/* Header */}
      <div className="h-12 flex items-center px-4 gap-3 border-b border-[#1a1d27] bg-[#13151c]">
        <Volume2 size={16} className="text-[#3ddc84]" />
        <span className="font-semibold text-sm text-[#e8eaf6]">{channel.name}</span>
        <span className="text-xs text-[#8b8fa8] bg-[#1e2130] px-2 py-0.5 rounded-full">
          {voiceMembers.length} متصل
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowSoundboard(v => !v)}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            showSoundboard ? 'bg-[#6c63ff] text-white' : 'bg-[#1e2130] text-[#8b8fa8] hover:text-[#e8eaf6] border border-[#2a2d3e]')}
        >
          <Music size={13} />
          Soundboard
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Participants */}
        <div className="flex-1 flex flex-col">
          {/* Participants grid */}
          <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
            {voiceMembers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 text-[#565a78]">
                <Volume2 size={48} className="opacity-20" />
                <p className="text-sm">لا يوجد أحد في القناة الصوتية</p>
                <p className="text-xs">انضم للقناة في ديسكورد لترى المتحدثين</p>
              </div>
            ) : (
              <div className={clsx(
                'grid gap-4 w-full max-w-2xl',
                voiceMembers.length === 1 ? 'grid-cols-1 max-w-xs' :
                voiceMembers.length === 2 ? 'grid-cols-2' :
                voiceMembers.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
              )}>
                {voiceMembers.map((p) => (
                  <ParticipantCard
                    key={p.id}
                    participant={p}
                    guildId={guildId}
                    onUserClick={onUserClick}
                    onVoiceAction={doVoiceAction}
                    actionLoading={actionLoading}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Soundboard */}
          <AnimatePresence>
            {showSoundboard && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-[#1a1d27] bg-[#13151c]">
                <div className="p-4">
                  <div className="text-xs font-bold text-[#565a78] uppercase tracking-wider mb-3">Soundboard</div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {SOUNDBOARD.map(s => (
                      <button key={s.label} onClick={() => handleSoundboard(s)}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-[#1e2130] border border-[#2a2d3e] hover:border-[#6c63ff]/50 hover:bg-[#252840] transition-all group">
                        <span className="text-2xl group-hover:scale-125 transition-transform">{s.emoji}</span>
                        <span className="text-[10px] text-[#565a78] text-center leading-tight">{s.label.split(' ').slice(1).join(' ')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 py-6 border-t border-[#1a1d27] bg-[#13151c]">
            <VoiceControl
              active={!muted}
              activeIcon={<Mic size={20} />}
              inactiveIcon={<MicOff size={20} />}
              activeColor="#3ddc84"
              inactiveColor="#ff5252"
              label={muted ? 'إلغاء الكتم' : 'كتم'}
              onClick={() => setMuted(!muted)}
            />
            <VoiceControl
              active={!deafened}
              activeIcon={<Headphones size={20} />}
              inactiveIcon={<HeadphoneOff size={20} />}
              activeColor="#3ddc84"
              inactiveColor="#ff5252"
              label={deafened ? 'إلغاء الإصمات' : 'إصمات'}
              onClick={() => setDeafened(!deafened)}
            />
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onLeave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff5252] text-white font-medium text-sm hover:bg-[#ff6b6b] transition-colors shadow-lg">
              <PhoneOff size={18} />
              مغادرة
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceControl({ active, activeIcon, inactiveIcon, activeColor, inactiveColor, label, onClick }: {
  active: boolean; activeIcon: React.ReactNode; inactiveIcon: React.ReactNode;
  activeColor: string; inactiveColor: string; label: string; onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onClick}
        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg"
        style={{ background: active ? `${activeColor}20` : `${inactiveColor}20`, color: active ? activeColor : inactiveColor, border: `1px solid ${active ? activeColor : inactiveColor}40` }}>
        {active ? activeIcon : inactiveIcon}
      </motion.button>
      <span className="text-[10px] text-[#565a78]">{label}</span>
    </div>
  );
}

function ParticipantCard({ participant, guildId, onUserClick, onVoiceAction, actionLoading }: {
  participant: VoiceMember; guildId: string;
  onUserClick?: (id: string) => void;
  onVoiceAction: (action: string, fn: () => Promise<any>) => void;
  actionLoading: string | null;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className={clsx('relative flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all cursor-pointer',
        participant.speaking ? 'border-[#3ddc84] bg-[#3ddc84]/5 shadow-[0_0_20px_rgba(61,220,132,0.15)]'
          : 'border-[#2a2d3e] bg-[#1e2130] hover:border-[#6c63ff]/30')}
      onClick={() => onUserClick?.(participant.id)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={{ minWidth: '130px' }}
    >
      {participant.speaking && <div className="absolute inset-0 rounded-2xl border-2 border-[#3ddc84] animate-pulse opacity-40" />}

      <div className="relative">
        <img src={participant.avatar} alt={participant.displayName} className="w-14 h-14 rounded-full" />
        {participant.speaking && <div className="absolute inset-0 rounded-full border-2 border-[#3ddc84] animate-pulse" />}
      </div>

      <div className="text-center">
        <div className="text-sm font-semibold text-[#e8eaf6] truncate max-w-[120px]">{participant.displayName}</div>
      </div>

      <div className="flex items-center gap-1.5">
        {participant.muted && <div className="p-1 rounded-full bg-[#ff5252]/20 text-[#ff5252]"><MicOff size={11} /></div>}
        {participant.deafened && <div className="p-1 rounded-full bg-[#ff5252]/20 text-[#ff5252]"><HeadphoneOff size={11} /></div>}
        {!participant.muted && !participant.deafened && <div className="p-1 rounded-full bg-[#3ddc84]/20 text-[#3ddc84]"><Mic size={11} /></div>}
      </div>

      {/* Quick actions on hover */}
      <AnimatePresence>
        {showActions && guildId && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="absolute -top-2 left-0 right-0 flex justify-center gap-1 z-10"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => onVoiceAction('mute-' + participant.id, () => api.voiceMute(guildId, participant.id, !participant.muted))}
              title={participant.muted ? 'رفع الكتم' : 'كتم'}
              className={clsx('p-1.5 rounded-lg text-xs font-bold shadow-lg border transition-all',
                participant.muted ? 'bg-[#ffd93d] text-black border-[#ffd93d]' : 'bg-[#1e2130] text-[#8b8fa8] border-[#2a2d3e] hover:border-[#ff5252] hover:text-[#ff5252]')}>
              {participant.muted ? '🔊' : '🔇'}
            </button>
            <button
              onClick={() => onVoiceAction('kick-' + participant.id, () => api.voiceKick(guildId, participant.id))}
              title="إخراج من الصوت"
              className="p-1.5 rounded-lg text-xs bg-[#1e2130] text-[#8b8fa8] border border-[#2a2d3e] hover:border-[#ff5252] hover:text-[#ff5252] shadow-lg transition-all">
              📤
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
