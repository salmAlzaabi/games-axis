import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { User, Role } from '../types';
import { clsx } from 'clsx';

interface Props {
  members: User[];
  roles: Role[];
  onClose: () => void;
  onSelectUser: (user: User) => void;
  onDM?: (user: User) => void;
}

export default function MemberPanel({ members, roles, onClose, onSelectUser, onDM }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['offline']));

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Group by role (use first role name) or status
  const onlineMembers = members.filter(m => m.status !== 'offline');
  const offlineMembers = members.filter(m => m.status === 'offline');

  // Build role-based groups from the first high-priority role
  const roleGroups = new Map<string, { label: string; color: string; members: User[] }>();
  const noRoleMembers: User[] = [];

  onlineMembers.forEach(m => {
    if (m.roles.length === 0) { noRoleMembers.push(m); return; }
    const topRole = m.roles[0];
    if (!roleGroups.has(topRole)) {
      const roleObj = roles.find(r => r.name === topRole);
      roleGroups.set(topRole, { label: topRole, color: roleObj?.color || '#8b8fa8', members: [] });
    }
    roleGroups.get(topRole)!.members.push(m);
  });

  const groups = [
    ...[...roleGroups.values()],
    ...(noRoleMembers.length > 0 ? [{ key: 'online', label: 'الأعضاء', color: '#8b8fa8', members: noRoleMembers }] : []),
    { key: 'offline', label: 'Offline', color: '#565a78', members: offlineMembers },
  ].filter(g => g.members.length > 0);

  const onlineCount = members.filter(m => m.status !== 'offline').length;

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-[#13151c] border-l border-[#1a1d27] flex flex-col flex-shrink-0 h-full overflow-x-hidden"
    >
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1a1d27] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#e8eaf6]">الأعضاء</span>
          <span className="text-xs text-[#8b8fa8] bg-[#1e2130] px-1.5 py-0.5 rounded-full">{onlineCount} متصل</span>
        </div>
        <button onClick={onClose} className="p-1 rounded text-[#565a78] hover:text-[#e8eaf6] hover:bg-[#1e2130] transition-all">
          <X size={16} />
        </button>
      </div>

      {/* Members list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <button onClick={() => toggleGroup(group.label)}
              className="flex items-center gap-1.5 px-2 py-1 w-full hover:text-[#e8eaf6] transition-colors mb-1">
              {collapsedGroups.has(group.label) ? (
                <ChevronRight size={11} className="text-[#565a78]" />
              ) : (
                <ChevronDown size={11} className="text-[#565a78]" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: group.color }}>
                {group.label}
              </span>
              <span className="text-[10px] text-[#565a78] ml-auto">{group.members.length}</span>
            </button>

            <AnimatePresence initial={false}>
              {!collapsedGroups.has(group.label) && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                  transition={{ duration: 0.15 }} className="overflow-hidden">
                  <div className="space-y-0.5">
                    {group.members.map(member => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        roleColor={group.color}
                        isHovered={hoveredId === member.id}
                        onHover={() => setHoveredId(member.id)}
                        onLeave={() => setHoveredId(null)}
                        onClick={() => onSelectUser(member)}
                        onDM={onDM ? () => onDM(member) : undefined}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function MemberRow({ member, roleColor, isHovered, onHover, onLeave, onClick, onDM }: {
  member: User; roleColor: string; isHovered: boolean;
  onHover: () => void; onLeave: () => void; onClick: () => void;
  onDM?: () => void;
}) {
  const isOffline = member.status === 'offline';
  const statusColors: Record<string, string> = {
    online: '#3ddc84', idle: '#f5c542', dnd: '#ff5252', offline: '#565a78',
  };

  return (
    <motion.div whileTap={{ scale: 0.98 }} onMouseEnter={onHover} onMouseLeave={onLeave} onClick={onClick}
      className={clsx('flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all',
        isHovered ? 'bg-[#1e2130]' : '')}>
      <div className="relative flex-shrink-0">
        <img src={member.avatar} alt={member.displayName}
          className={clsx('w-8 h-8 rounded-full transition-opacity object-cover', isOffline ? 'opacity-40' : '')} />
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#13151c]"
          style={{ background: statusColors[member.status] || statusColors.offline }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={clsx('text-sm font-medium truncate transition-colors', isOffline ? 'text-[#565a78]' : 'text-[#c9cdd9]')}>
          {member.displayName}
        </div>
        {member.customStatus && !isOffline && (
          <div className="text-[10px] text-[#565a78] truncate">{member.customStatus}</div>
        )}
      </div>

      {isHovered && onDM && !isOffline && (
        <button
          className="p-1 rounded text-[#8b8fa8] hover:text-[#6c63ff] hover:bg-[#252840] transition-all flex-shrink-0"
          title="رسالة خاصة"
          onClick={e => { e.stopPropagation(); onDM(); }}
        >
          <MessageSquare size={12} />
        </button>
      )}
    </motion.div>
  );
}
