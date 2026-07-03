import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, Calendar, Plus, Minus, UserX, Clock, Shield, Loader, Check, AlertTriangle } from 'lucide-react';
import type { User, Role } from '../types';
import { api } from '../services/api';

interface Props {
  user: User | null;
  roles: Role[];
  currentUser: User;
  guildId?: string;
  onClose: () => void;
  onDM?: (user: User) => void;
}

export default function UserProfileModal({ user, roles, currentUser, guildId, onClose, onDM }: Props) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'roles' | 'mod'>('info');
  const [timeoutMin, setTimeoutMin] = useState(5);
  const [kickReason, setKickReason] = useState('');
  const [showKickConfirm, setShowKickConfirm] = useState(false);
  const [showBanConfirm, setShowBanConfirm] = useState(false);

  const isCurrentUser = user?.id === currentUser.id;

  useEffect(() => {
    if (!user || !guildId) return;
    setLoading(true);
    setDetail(null);
    api.getMemberInfo(guildId, user.id)
      .then(d => { setDetail(d); setLoading(false); })
      .catch(() => { setDetail(null); setLoading(false); });
  }, [user?.id, guildId]);

  if (!user) return null;

  const memberRoles: { id: string; name: string; color: string }[] = detail?.roles || [];
  const memberRoleIds = new Set(memberRoles.map((r: any) => r.id));
  const availableToAdd = roles.filter(r => !memberRoleIds.has(r.id));

  const statusColors: Record<string, string> = { online: '#3ddc84', idle: '#f5c542', dnd: '#ff5252', offline: '#565a78' };
  const statusLabels: Record<string, string> = { online: 'متصل', idle: 'غائب', dnd: 'لا تزعج', offline: 'غير متصل' };

  const doAction = async (key: string, fn: () => Promise<any>, successMsg: string) => {
    setActionLoading(key);
    try {
      await fn();
      setSuccess(successMsg);
      setTimeout(() => setSuccess(null), 2500);
      if (guildId) {
        const d = await api.getMemberInfo(guildId, user.id).catch(() => null);
        if (d) setDetail(d);
      }
    } catch (e: any) { alert('خطأ: ' + e.message); }
    setActionLoading(null);
  };

  const joinDate = detail?.joinedAt ? new Date(detail.joinedAt).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }) : user.joinedAt ? new Date(user.joinedAt).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={e => e.stopPropagation()}
          className="relative z-10 w-full max-w-sm bg-[#1a1d27] rounded-2xl overflow-hidden shadow-2xl border border-[#2a2d3e]"
        >
          {/* Banner */}
          <div className="h-24 relative" style={{ background: detail?.banner ? `url(${detail.banner}) center/cover` : `linear-gradient(135deg, ${statusColors[user.status]}30, #6c63ff30, #1a1d27)` }}>
            <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"><X size={14} /></button>
          </div>

          {/* Avatar + actions */}
          <div className="relative px-4 pb-0">
            <div className="absolute -top-8 left-4">
              <div className="relative">
                <img src={detail?.avatar || user.avatar} alt={user.displayName} className="w-16 h-16 rounded-2xl border-4 border-[#1a1d27]" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#1a1d27]" style={{ background: statusColors[user.status] }} />
              </div>
            </div>
            {!isCurrentUser && (
              <div className="flex items-center justify-end gap-2 pt-2 mb-6">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { onDM?.(user); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6c63ff] text-white text-sm font-medium hover:bg-[#7b73ff] transition-colors">
                  <MessageSquare size={14} />رسالة خاصة
                </motion.button>
              </div>
            )}

            {/* User info */}
            <div className="mt-1 mb-3">
              <h3 className="text-lg font-bold" style={{ color: detail?.color || '#e8eaf6' }}>{detail?.displayName || user.displayName}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-[#8b8fa8]">@{user.username}</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: statusColors[user.status] }} />
                  <span className="text-xs text-[#565a78]">{statusLabels[user.status]}</span>
                </div>
                {user.bot && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#5865f2]/30 text-[#8fa0ff]">BOT</span>}
              </div>
              {detail?.customStatus && <div className="mt-1 text-xs text-[#8b8fa8] bg-[#252840] rounded-lg px-2 py-1">{detail.customStatus}</div>}
              {detail?.activity && <div className="text-xs text-[#565a78] mt-1">🎮 {detail.activity}</div>}
            </div>
          </div>

          {/* Tabs */}
          {guildId && !isCurrentUser && (
            <div className="flex gap-1 px-4 border-b border-[#2a2d3e] pb-0">
              {[{ id: 'info', label: 'معلومات' }, { id: 'roles', label: 'الرتب' }, { id: 'mod', label: 'إدارة' }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-all ${tab === t.id ? 'border-[#6c63ff] text-[#6c63ff]' : 'border-transparent text-[#565a78] hover:text-[#8b8fa8]'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-6"><Loader size={20} className="text-[#6c63ff] animate-spin" /></div>
            )}

            {success && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 px-3 py-2 bg-[#3ddc84]/10 border border-[#3ddc84]/30 rounded-lg text-sm text-[#3ddc84]">
                <Check size={14} />{success}
              </motion.div>
            )}

            {/* Info tab */}
            {(tab === 'info' || !guildId) && !loading && (
              <>
                <div>
                  <div className="text-[11px] font-bold text-[#565a78] uppercase tracking-wider mb-1">تاريخ الانضمام</div>
                  <div className="flex items-center gap-1.5 text-sm text-[#8b8fa8]"><Calendar size={13} />{joinDate}</div>
                </div>
                {memberRoles.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-[#565a78] uppercase tracking-wider mb-2">الرتب</div>
                    <div className="flex flex-wrap gap-1.5">
                      {memberRoles.map((r: any) => (
                        <div key={r.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ borderColor: r.color !== '#000000' ? r.color + '50' : '#2a2d3e', color: r.color !== '#000000' ? r.color : '#8b8fa8', background: r.color !== '#000000' ? r.color + '10' : '#1e2130' }}>
                          <div className="w-2 h-2 rounded-full" style={{ background: r.color !== '#000000' ? r.color : '#565a78' }} />
                          {r.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail?.inVoice && (
                  <div className="text-xs text-[#3ddc84] bg-[#3ddc84]/10 px-2 py-1 rounded-lg">🎤 في قناة صوتية</div>
                )}
              </>
            )}

            {/* Roles tab */}
            {tab === 'roles' && guildId && !loading && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-[#565a78] uppercase tracking-wider">الرتب الحالية</div>
                {memberRoles.length === 0 && <div className="text-xs text-[#565a78]">لا توجد رتب</div>}
                {memberRoles.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#252840]">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: r.color !== '#000000' ? r.color : '#565a78' }} />
                      <span className="text-sm text-[#e8eaf6]">{r.name}</span>
                    </div>
                    <button onClick={() => doAction(`rm-${r.id}`, () => api.removeRole(guildId, user.id, r.id), `تم إزالة ${r.name}`)}
                      disabled={actionLoading === `rm-${r.id}`}
                      className="p-1 rounded text-[#ff5252] hover:bg-[#ff5252]/10 transition-colors disabled:opacity-50">
                      {actionLoading === `rm-${r.id}` ? <Loader size={13} className="animate-spin" /> : <Minus size={13} />}
                    </button>
                  </div>
                ))}

                {availableToAdd.length > 0 && (
                  <>
                    <div className="text-[11px] font-bold text-[#565a78] uppercase tracking-wider mt-3">إضافة رتبة</div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {availableToAdd.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#252840] transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: r.color !== '#000000' ? r.color : '#565a78' }} />
                            <span className="text-sm text-[#8b8fa8]">{r.name}</span>
                          </div>
                          <button onClick={() => doAction(`add-${r.id}`, () => api.addRole(guildId, user.id, r.id), `تمت إضافة ${r.name}`)}
                            disabled={actionLoading === `add-${r.id}`}
                            className="p-1 rounded text-[#3ddc84] hover:bg-[#3ddc84]/10 transition-colors disabled:opacity-50">
                            {actionLoading === `add-${r.id}` ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Moderation tab */}
            {tab === 'mod' && guildId && !loading && (
              <div className="space-y-3">
                {/* Voice controls if in voice */}
                {detail?.inVoice && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[#565a78] uppercase tracking-wider">تحكم صوتي</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => doAction('mute', () => api.voiceMute(guildId, user.id, !detail.serverMuted), detail.serverMuted ? 'تم رفع الكتم' : 'تم كتم الصوت')}
                        disabled={!!actionLoading}
                        className={`py-2 rounded-lg text-xs font-medium transition-colors ${detail.serverMuted ? 'bg-[#ffd93d]/20 text-[#ffd93d] hover:bg-[#ffd93d]/30' : 'bg-[#252840] text-[#8b8fa8] hover:bg-[#2d3150]'}`}>
                        🔇 {detail.serverMuted ? 'رفع كتم' : 'كتم'}
                      </button>
                      <button onClick={() => doAction('deaf', () => api.voiceDeafen(guildId, user.id, !detail.serverDeafened), detail.serverDeafened ? 'تم رفع الصمم' : 'تم إصمات')}
                        disabled={!!actionLoading}
                        className={`py-2 rounded-lg text-xs font-medium transition-colors ${detail.serverDeafened ? 'bg-[#ffd93d]/20 text-[#ffd93d] hover:bg-[#ffd93d]/30' : 'bg-[#252840] text-[#8b8fa8] hover:bg-[#2d3150]'}`}>
                        🔕 {detail.serverDeafened ? 'رفع صمم' : 'إصمات'}
                      </button>
                      <button onClick={() => doAction('vkick', () => api.voiceKick(guildId, user.id), 'تم إخراجه من الصوت')}
                        disabled={!!actionLoading}
                        className="py-2 rounded-lg text-xs font-medium bg-[#252840] text-[#8b8fa8] hover:bg-[#ff5252]/10 hover:text-[#ff5252] transition-colors">
                        📤 إخراج
                      </button>
                    </div>
                  </div>
                )}

                {/* Timeout */}
                <div>
                  <div className="text-[11px] font-bold text-[#565a78] uppercase tracking-wider mb-2">تايم آوت</div>
                  <div className="flex gap-2">
                    <select value={timeoutMin} onChange={e => setTimeoutMin(Number(e.target.value))}
                      className="flex-1 bg-[#252840] border border-[#2a2d3e] rounded-lg px-2 py-1.5 text-sm text-[#e8eaf6] outline-none">
                      {[1, 5, 10, 30, 60, 1440, 10080].map(m => (
                        <option key={m} value={m}>{m < 60 ? `${m} دقيقة` : m < 1440 ? `${m/60} ساعة` : m < 10080 ? `${m/1440} يوم` : `${m/10080} أسبوع`}</option>
                      ))}
                    </select>
                    <button onClick={() => doAction('timeout', () => api.timeoutMember(guildId, user.id, timeoutMin), `تم إعطاء تايم آوت ${timeoutMin} دقيقة`)}
                      disabled={!!actionLoading}
                      className="px-3 py-1.5 bg-[#ffd93d]/20 text-[#ffd93d] rounded-lg text-xs font-medium hover:bg-[#ffd93d]/30 transition-colors disabled:opacity-50 flex items-center gap-1">
                      {actionLoading === 'timeout' ? <Loader size={13} className="animate-spin" /> : <Clock size={13} />}
                      تطبيق
                    </button>
                  </div>
                </div>

                {/* Kick */}
                {!showKickConfirm ? (
                  <button onClick={() => setShowKickConfirm(true)} className="w-full py-2 bg-[#ff8c42]/10 text-[#ff8c42] border border-[#ff8c42]/20 rounded-lg text-sm font-medium hover:bg-[#ff8c42]/20 transition-colors flex items-center justify-center gap-2">
                    <UserX size={14} />طرد من السيرفر
                  </button>
                ) : (
                  <div className="p-3 bg-[#ff8c42]/5 border border-[#ff8c42]/20 rounded-lg space-y-2">
                    <div className="text-xs text-[#ff8c42] flex items-center gap-1"><AlertTriangle size={12} />تأكيد الطرد؟</div>
                    <input value={kickReason} onChange={e => setKickReason(e.target.value)} placeholder="السبب (اختياري)" className="w-full bg-[#252840] border border-[#2a2d3e] rounded px-2 py-1 text-xs text-[#e8eaf6] outline-none" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowKickConfirm(false)} className="flex-1 py-1.5 text-xs text-[#8b8fa8] hover:text-[#e8eaf6] transition-colors">إلغاء</button>
                      <button onClick={() => { setShowKickConfirm(false); doAction('kick', () => api.kickMember(guildId, user.id, kickReason || undefined), 'تم الطرد'); }} disabled={!!actionLoading}
                        className="flex-1 py-1.5 bg-[#ff8c42] text-white rounded text-xs font-medium hover:bg-[#ff9f5c] transition-colors disabled:opacity-50">
                        تأكيد الطرد
                      </button>
                    </div>
                  </div>
                )}

                {/* Ban */}
                {!showBanConfirm ? (
                  <button onClick={() => setShowBanConfirm(true)} className="w-full py-2 bg-[#ff5252]/10 text-[#ff5252] border border-[#ff5252]/20 rounded-lg text-sm font-medium hover:bg-[#ff5252]/20 transition-colors flex items-center justify-center gap-2">
                    <Shield size={14} />حظر من السيرفر
                  </button>
                ) : (
                  <div className="p-3 bg-[#ff5252]/5 border border-[#ff5252]/20 rounded-lg space-y-2">
                    <div className="text-xs text-[#ff5252] flex items-center gap-1"><AlertTriangle size={12} />تأكيد الحظر الدائم؟</div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowBanConfirm(false)} className="flex-1 py-1.5 text-xs text-[#8b8fa8] hover:text-[#e8eaf6] transition-colors">إلغاء</button>
                      <button onClick={() => { setShowBanConfirm(false); doAction('ban', () => api.banMember(guildId, user.id), 'تم الحظر'); }} disabled={!!actionLoading}
                        className="flex-1 py-1.5 bg-[#ff5252] text-white rounded text-xs font-medium hover:bg-[#ff7070] transition-colors disabled:opacity-50">
                        تأكيد الحظر
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
