import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Pencil, Trash2, Check, Loader, Shield } from 'lucide-react';
import type { Role } from '../types';
import { api } from '../services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  guildId: string;
  roles: Role[];
  onRolesChange: () => void;
}

const PRESET_COLORS = ['#ff5252','#ff8c42','#ffd93d','#3ddc84','#4ecdc4','#6c63ff','#a29bfe','#fd79a8','#e84393','#0984e3','#00cec9','#e17055','#74b9ff','#55efc4'];

function RoleForm({ role, onSave, onCancel }: { role?: Partial<Role>; onSave: (data: any) => void; onCancel: () => void }) {
  const [name, setName] = useState(role?.name || '');
  const [color, setColor] = useState(role?.color || '#6c63ff');
  const [hoist, setHoist] = useState(false);
  const [mentionable, setMentionable] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), color, hoist, mentionable });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-bold text-[#565a78] uppercase tracking-wider block mb-1.5">اسم الرتبة</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: VIP"
          className="w-full bg-[#252840] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-[#e8eaf6] outline-none focus:border-[#6c63ff]/50 transition-colors"
          onKeyDown={e => e.key === 'Enter' && save()}
        />
      </div>
      <div>
        <label className="text-xs font-bold text-[#565a78] uppercase tracking-wider block mb-2">اللون</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
              style={{ background: c, borderColor: color === c ? '#e8eaf6' : 'transparent' }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 rounded cursor-pointer border-0 bg-transparent" />
          <input value={color} onChange={e => setColor(e.target.value)} className="flex-1 bg-[#252840] border border-[#2a2d3e] rounded-lg px-3 py-1.5 text-sm text-[#e8eaf6] outline-none font-mono" />
          <div className="w-8 h-8 rounded-lg border border-[#2a2d3e]" style={{ background: color }} />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={hoist} onChange={e => setHoist(e.target.checked)} className="rounded" />
          <span className="text-xs text-[#8b8fa8]">عرض منفصل</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={mentionable} onChange={e => setMentionable(e.target.checked)} className="rounded" />
          <span className="text-xs text-[#8b8fa8]">قابل للمنشن</span>
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 text-sm text-[#8b8fa8] hover:text-[#e8eaf6] transition-colors border border-[#2a2d3e] rounded-lg hover:bg-[#252840]">إلغاء</button>
        <button onClick={save} disabled={saving || !name.trim()} className="flex-1 py-2 bg-[#6c63ff] text-white rounded-lg text-sm font-medium hover:bg-[#7b73ff] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
          {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}حفظ
        </button>
      </div>
    </div>
  );
}

export default function ServerSettingsModal({ isOpen, onClose, guildId, roles, onRolesChange }: Props) {
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createRole = async (data: any) => {
    try {
      await api.createRole(guildId, data);
      onRolesChange();
      setCreating(false);
    } catch (e: any) { alert('خطأ: ' + e.message); }
  };

  const editRole = async (data: any) => {
    if (!editingRole) return;
    try {
      await api.updateRole(guildId, editingRole.id, data);
      onRolesChange();
      setEditingRole(null);
    } catch (e: any) { alert('خطأ: ' + e.message); }
  };

  const deleteRole = async (roleId: string) => {
    if (!window.confirm('حذف هذه الرتبة؟')) return;
    setDeletingId(roleId);
    try {
      await api.deleteRole(guildId, roleId);
      onRolesChange();
    } catch (e: any) { alert('خطأ: ' + e.message); }
    setDeletingId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="relative z-10 w-full max-w-md bg-[#1a1d27] rounded-2xl shadow-2xl border border-[#2a2d3e] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3e]">
              <div className="flex items-center gap-2"><Shield size={18} className="text-[#6c63ff]" /><span className="font-bold text-[#e8eaf6]">إعدادات السيرفر - الرتب</span></div>
              <button onClick={onClose} className="p-1.5 rounded-lg text-[#565a78] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all"><X size={16} /></button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
              {/* Create new role */}
              {creating ? (
                <div className="p-4 bg-[#252840] rounded-xl border border-[#6c63ff]/30">
                  <div className="text-sm font-bold text-[#e8eaf6] mb-3">إنشاء رتبة جديدة</div>
                  <RoleForm onSave={createRole} onCancel={() => setCreating(false)} />
                </div>
              ) : (
                <button onClick={() => setCreating(true)} className="w-full py-2.5 border border-dashed border-[#2a2d3e] rounded-xl text-sm text-[#565a78] hover:border-[#6c63ff]/40 hover:text-[#6c63ff] transition-all flex items-center justify-center gap-2">
                  <Plus size={16} />إضافة رتبة جديدة
                </button>
              )}

              {/* Edit form */}
              {editingRole && (
                <div className="p-4 bg-[#252840] rounded-xl border border-[#ffd93d]/30">
                  <div className="text-sm font-bold text-[#e8eaf6] mb-3">تعديل: {editingRole.name}</div>
                  <RoleForm role={editingRole} onSave={editRole} onCancel={() => setEditingRole(null)} />
                </div>
              )}

              {/* Roles list */}
              <div className="space-y-1.5">
                {roles.length === 0 && <div className="text-sm text-[#565a78] text-center py-4">لا توجد رتب</div>}
                {roles.map(role => (
                  <div key={role.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#252840] hover:bg-[#2d3150] transition-colors group">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: role.color !== '#000000' ? role.color : '#565a78' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: role.color !== '#000000' ? role.color : '#e8eaf6' }}>{role.name}</div>
                      <div className="text-xs text-[#565a78]">{role.memberCount || 0} عضو</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingRole(role); setCreating(false); }} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#ffd93d] hover:bg-[#1e2130] transition-all"><Pencil size={13} /></button>
                      <button onClick={() => deleteRole(role.id)} disabled={deletingId === role.id} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#ff5252] hover:bg-[#1e2130] transition-all disabled:opacity-50">
                        {deletingId === role.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
