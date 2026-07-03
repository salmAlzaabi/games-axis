import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Compass, Download } from 'lucide-react';
import type { Workspace } from '../types';
import { clsx } from 'clsx';

interface Props {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (id: string) => void;
}

const statusColors: Record<string, string> = {
  ws1: '#6c63ff',
  ws2: '#ff6b6b',
  ws3: '#4ecdc4',
  ws4: '#ffd93d',
  ws5: '#ff4757',
};

function WorkspaceIcon({ ws, isActive, onClick }: { ws: Workspace; isActive: boolean; onClick: () => void }) {
  return (
    <div className="relative flex items-center group" onClick={onClick}>
      {/* Active indicator */}
      <motion.div
        initial={false}
        animate={{
          height: isActive ? 40 : ws.unreadCount > 0 ? 8 : 0,
          opacity: isActive || ws.unreadCount > 0 ? 1 : 0,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="absolute -left-3 w-1 rounded-r-full"
        style={{ background: ws.color || '#6c63ff' }}
      />

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ borderRadius: isActive ? '16px' : '50%' }}
        transition={{ duration: 0.2 }}
        className="relative w-12 h-12 flex items-center justify-center cursor-pointer overflow-hidden shadow-lg"
        style={{
          background: isActive ? (ws.color || '#6c63ff') : '#1e2130',
          border: isActive ? 'none' : '1px solid #2a2d3e',
        }}
        title={ws.name}
      >
        {ws.icon ? (
          <img src={ws.icon} alt={ws.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white font-bold text-base select-none">
            {ws.acronym}
          </span>
        )}

        {/* Boost indicator */}
        {ws.boostLevel && ws.boostLevel > 0 && (
          <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#ff73fa] border-2 border-[#0e0f14] flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">{ws.boostLevel}</span>
          </div>
        )}
      </motion.button>

      {/* Mention badge */}
      {ws.mentionCount > 0 && !isActive && (
        <div className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-[#0e0f14]">
          {ws.mentionCount > 9 ? '9+' : ws.mentionCount}
        </div>
      )}

      {/* Tooltip */}
      <div className="absolute left-16 hidden group-hover:flex items-center z-50 pointer-events-none">
        <div className="bg-[#1a1d27] text-white text-sm font-medium px-3 py-2 rounded-lg shadow-2xl border border-[#2a2d3e] whitespace-nowrap">
          {ws.name}
          <div className="text-[11px] text-[#8b8fa8] mt-0.5">{ws.onlineCount} online • {ws.memberCount.toLocaleString()} members</div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceRail({ workspaces, activeId, onSelect }: Props) {
  return (
    <div className="w-[72px] bg-[#0e0f14] flex flex-col items-center py-3 gap-2 border-r border-[#1a1d27] overflow-y-auto overflow-x-visible">
      {workspaces.map((ws) => (
        <WorkspaceIcon
          key={ws.id}
          ws={ws}
          isActive={ws.id === activeId}
          onClick={() => onSelect(ws.id)}
        />
      ))}

      {/* Divider */}
      <div className="w-8 h-px bg-[#2a2d3e] my-1" />

      {/* Discover */}
      <motion.button
        whileHover={{ scale: 1.05, borderRadius: '16px' }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 rounded-full bg-[#1e2130] border border-[#2a2d3e] flex items-center justify-center text-[#3ddc84] hover:bg-[#3ddc84] hover:text-white transition-colors cursor-pointer group relative"
        title="Explore Communities"
      >
        <Compass size={20} />
        <div className="absolute left-16 hidden group-hover:flex items-center z-50 pointer-events-none">
          <div className="bg-[#1a1d27] text-white text-sm font-medium px-3 py-2 rounded-lg shadow-2xl border border-[#2a2d3e] whitespace-nowrap">
            Explore Communities
          </div>
        </div>
      </motion.button>

      {/* Create workspace */}
      <motion.button
        whileHover={{ scale: 1.05, borderRadius: '16px' }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 rounded-full bg-[#1e2130] border border-[#2a2d3e] flex items-center justify-center text-[#6c63ff] hover:bg-[#6c63ff] hover:text-white transition-colors cursor-pointer group relative"
        title="Create Workspace"
      >
        <Plus size={20} />
        <div className="absolute left-16 hidden group-hover:flex items-center z-50 pointer-events-none">
          <div className="bg-[#1a1d27] text-white text-sm font-medium px-3 py-2 rounded-lg shadow-2xl border border-[#2a2d3e] whitespace-nowrap">
            Create Workspace
          </div>
        </div>
      </motion.button>

      {/* Download app */}
      <motion.button
        whileHover={{ scale: 1.05, borderRadius: '16px' }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 rounded-full bg-[#1e2130] border border-[#2a2d3e] flex items-center justify-center text-[#8b8fa8] hover:bg-[#252840] hover:text-white transition-colors cursor-pointer group relative"
        title="Download Apps"
      >
        <Download size={18} />
        <div className="absolute left-16 hidden group-hover:flex items-center z-50 pointer-events-none">
          <div className="bg-[#1a1d27] text-white text-sm font-medium px-3 py-2 rounded-lg shadow-2xl border border-[#2a2d3e] whitespace-nowrap">
            Download Apps
          </div>
        </div>
      </motion.button>
    </div>
  );
}
