import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Save, Bot, Activity, Check } from 'lucide-react';
import { api } from '../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  botAvatar: string;
  botName: string;
}

const STATUS_OPTIONS = [
  { value: 'online', label: '🟢 متصل', color: '#3ddc84' },
  { value: 'idle', label: '🟡 غائب', color: '#f5c542' },
  { value: 'dnd', label: '🔴 لا تزعج', color: '#ff5252' },
  { value: 'invisible', label: '⚫ غير مرئي', color: '#565a78' },
];

const ACTIVITY_TYPES = [
  { value: 0, label: 'Playing' },
  { value: 1, label: 'Streaming' },
  { value: 2, label: 'Listening to' },
  { value: 3, label: 'Watching' },
  { value: 5, label: 'Competing in' },
];

export default function BotSettingsModal({ isOpen, onClose, botAvatar, botName }: Props) {
  const [tab, setTab] = useState<'profile' | 'status'>('profile');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(botAvatar);
  const [username, setUsername] = useState(botName);
  const [status, setStatus] = useState('online');
  const [activityType, setActivityType] = useState(0);
  const [activityText, setActivityText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvatarPreview(botAvatar);
    setUsername(botName);
  }, [botAvatar, botName]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result as string);
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.updateBotProfile({ username: username !== botName ? username : undefined, avatar: avatar || undefined });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert('خطأ: ' + e.message); }
    setSaving(false);
  };

  const saveStatus = async () => {
    setSaving(true);
    try {
      await api.updateBotStatus({ status, activityType, activityText });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert('خطأ: ' + e.message); }
    setSaving(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="relative z-10 w-full max-w-md bg-[#1a1d27] rounded-2xl shadow-2xl border border-[#2a2d3e] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3e]">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-[#6c63ff]" />
                <span className="font-bold text-[#e8eaf6]">إعدادات البوت</span>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-[#565a78] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all"><X size={16} /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-4">
              {[{ id: 'profile', label: 'الملف الشخصي' }, { id: 'status', label: 'الحالة' }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[#6c63ff] text-white' : 'text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840]'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {tab === 'profile' && (
                <>
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <img src={avatarPreview} alt="Bot" className="w-20 h-20 rounded-2xl border-2 border-[#2a2d3e] object-cover" />
                      <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[#6c63ff] text-white hover:bg-[#7b73ff] transition-colors shadow-lg">
                        <Upload size={12} />
                      </button>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#e8eaf6] mb-1">{username}</div>
                      <div className="text-xs text-[#565a78]">اضغط على أيقونة الرفع لتغيير الصورة</div>
                      <div className="text-xs text-[#565a78] mt-1">يدعم: PNG, JPG, GIF</div>
                    </div>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

                  {/* Username */}
                  <div>
                    <label className="text-xs font-bold text-[#565a78] uppercase tracking-wider block mb-1.5">اسم البوت</label>
                    <input value={username} onChange={e => setUsername(e.target.value)}
                      className="w-full bg-[#252840] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-[#e8eaf6] outline-none focus:border-[#6c63ff]/50 transition-colors"
                      placeholder="اسم البوت"
                    />
                  </div>

                  <button onClick={saveProfile} disabled={saving}
                    className="w-full py-2.5 bg-[#6c63ff] text-white rounded-lg font-medium text-sm hover:bg-[#7b73ff] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {saved ? <><Check size={16} /> تم الحفظ!</> : saving ? 'جاري الحفظ...' : <><Save size={16} /> حفظ التغييرات</>}
                  </button>
                </>
              )}

              {tab === 'status' && (
                <>
                  {/* Status */}
                  <div>
                    <label className="text-xs font-bold text-[#565a78] uppercase tracking-wider block mb-2">الحالة</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUS_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setStatus(opt.value)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${status === opt.value ? 'border-[#6c63ff]/50 bg-[#6c63ff]/10 text-[#e8eaf6]' : 'border-[#2a2d3e] text-[#8b8fa8] hover:border-[#2a2d3e] hover:bg-[#252840]'}`}>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: opt.color }} />
                          {opt.label.split(' ').slice(1).join(' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Activity type */}
                  <div>
                    <label className="text-xs font-bold text-[#565a78] uppercase tracking-wider block mb-2">نوع النشاط</label>
                    <select value={activityType} onChange={e => setActivityType(Number(e.target.value))}
                      className="w-full bg-[#252840] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-[#e8eaf6] outline-none focus:border-[#6c63ff]/50 transition-colors">
                      {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Activity text */}
                  <div>
                    <label className="text-xs font-bold text-[#565a78] uppercase tracking-wider block mb-1.5">نص الحالة</label>
                    <input value={activityText} onChange={e => setActivityText(e.target.value)}
                      className="w-full bg-[#252840] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-[#e8eaf6] outline-none focus:border-[#6c63ff]/50 transition-colors"
                      placeholder="مثال: Arabic Community"
                    />
                    {activityText && (
                      <div className="mt-2 text-xs text-[#565a78]">
                        معاينة: <span className="text-[#8b8fa8]">{ACTIVITY_TYPES[activityType]?.label} <strong className="text-[#e8eaf6]">{activityText}</strong></span>
                      </div>
                    )}
                  </div>

                  <button onClick={saveStatus} disabled={saving}
                    className="w-full py-2.5 bg-[#6c63ff] text-white rounded-lg font-medium text-sm hover:bg-[#7b73ff] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {saved ? <><Check size={16} /> تم التطبيق!</> : saving ? 'جاري التطبيق...' : <><Activity size={16} /> تطبيق الحالة</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
