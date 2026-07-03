import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Hash, Users, Clock, ArrowRight, Filter } from 'lucide-react';
import type { Message, User, Channel } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  users: User[];
  channels: Channel[];
}

type ResultType = 'message' | 'user' | 'channel';
interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle?: string;
  avatar?: string;
  icon?: React.ReactNode;
}

export default function SearchModal({ isOpen, onClose, messages, users, channels }: Props) {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ResultType | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = query.toLowerCase();
    const res: SearchResult[] = [];

    if (activeFilter === 'all' || activeFilter === 'channel') {
      channels
        .filter(c => c.name.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach(c => res.push({
          type: 'channel',
          id: c.id,
          title: `#${c.name}`,
          subtitle: c.topic,
          icon: <Hash size={14} />,
        }));
    }

    if (activeFilter === 'all' || activeFilter === 'user') {
      users
        .filter(u =>
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
        )
        .slice(0, 5)
        .forEach(u => res.push({
          type: 'user',
          id: u.id,
          title: u.displayName,
          subtitle: `@${u.username}`,
          avatar: u.avatar,
        }));
    }

    if (activeFilter === 'all' || activeFilter === 'message') {
      messages
        .filter(m => m.content.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach(m => res.push({
          type: 'message',
          id: m.id,
          title: m.content.slice(0, 80) + (m.content.length > 80 ? '...' : ''),
          subtitle: `${m.author.displayName} in #general`,
          avatar: m.author.avatar,
        }));
    }

    setResults(res);
    setSelectedIdx(0);
  }, [query, activeFilter, messages, users, channels]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    if (e.key === 'ArrowUp') setSelectedIdx(i => Math.max(i - 1, 0));
    if (e.key === 'Enter' && results[selectedIdx]) onClose();
  };

  const recentSearches = ['design system', 'alex storm', '#dev-chat'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={e => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl bg-[#1a1d27] rounded-2xl shadow-2xl border border-[#2a2d3e] overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2d3e]">
              <Search size={18} className="text-[#6c63ff] flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search messages, users, channels..."
                className="flex-1 bg-transparent text-[#e8eaf6] text-base placeholder-[#565a78] outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[#565a78] hover:text-[#e8eaf6] transition-colors">
                  <X size={16} />
                </button>
              )}
              <kbd className="px-2 py-0.5 rounded bg-[#252840] text-[#565a78] text-xs border border-[#2a2d3e]">ESC</kbd>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a2d3e]">
              {(['all', 'message', 'user', 'channel'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all capitalize ${
                    activeFilter === filter
                      ? 'bg-[#6c63ff] text-white'
                      : 'bg-[#252840] text-[#8b8fa8] hover:bg-[#2d3150] hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {!query && (
                <div className="p-4">
                  <div className="text-xs font-semibold text-[#565a78] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Clock size={11} /> Recent
                  </div>
                  {recentSearches.map(s => (
                    <button
                      key={s}
                      onClick={() => setQuery(s)}
                      className="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-[#8b8fa8] hover:bg-[#252840] hover:text-[#e8eaf6] transition-all text-sm"
                    >
                      <Clock size={13} className="text-[#565a78]" />
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {query && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-[#565a78]">
                  <Search size={32} className="mb-3 opacity-30" />
                  <p className="text-sm">No results for "{query}"</p>
                </div>
              )}

              {results.length > 0 && (
                <div className="p-2">
                  {results.map((result, i) => (
                    <motion.button
                      key={result.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={onClose}
                      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all text-left ${
                        i === selectedIdx ? 'bg-[#6c63ff]/20 border border-[#6c63ff]/30' : 'hover:bg-[#252840]'
                      }`}
                    >
                      {result.avatar ? (
                        <img src={result.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#252840] flex items-center justify-center text-[#6c63ff] flex-shrink-0">
                          {result.icon}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#e8eaf6] font-medium truncate">{result.title}</div>
                        {result.subtitle && (
                          <div className="text-xs text-[#565a78] truncate">{result.subtitle}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[#565a78] flex-shrink-0">
                        <span className="capitalize bg-[#252840] px-2 py-0.5 rounded-full">{result.type}</span>
                        <ArrowRight size={12} />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-[#2a2d3e] text-[#565a78] text-xs">
              <span className="flex items-center gap-1"><kbd className="bg-[#252840] px-1.5 rounded border border-[#2a2d3e]">↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className="bg-[#252840] px-1.5 rounded border border-[#2a2d3e]">↵</kbd> Select</span>
              <span className="flex items-center gap-1"><kbd className="bg-[#252840] px-1.5 rounded border border-[#2a2d3e]">ESC</kbd> Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
