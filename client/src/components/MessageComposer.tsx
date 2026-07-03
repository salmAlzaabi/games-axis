import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Smile, Paperclip, Mic, X, Bold, Italic, Code, Image, Send } from 'lucide-react';
import type { Message } from '../types';
import { clsx } from 'clsx';

interface Props {
  channelName: string;
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (content: string, imageBase64?: string, imageName?: string) => void;
  autoFocus?: boolean;
}

const EMOJIS = ['😀','😂','❤️','🔥','✨','🎉','👍','🚀','💯','🙌','😭','🤔','😎','🥳','💀','🤣','👀','🫡','💪','🎊'];

export default function MessageComposer({ channelName, replyTo, onCancelReply, onSend, autoFocus }: Props) {
  const [content, setContent] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ base64: string; name: string; url: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus, channelName]);

  // Auto-resize textarea
  const resize = () => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 128) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape' && replyTo) onCancelReply();
  };

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed && !imagePreview) return;
    onSend(trimmed, imagePreview?.base64, imagePreview?.name);
    setContent('');
    setImagePreview(null);
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.focus(); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview({ base64: reader.result as string, name: file.name, url: URL.createObjectURL(file) });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const insertFormat = (prefix: string, suffix = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = content.slice(s, e);
    setContent(content.slice(0, s) + prefix + sel + suffix + content.slice(e));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + prefix.length, e + prefix.length); }, 0);
  };

  const canSend = content.trim().length > 0 || !!imagePreview;

  return (
    <div className="px-4 pb-4 flex-shrink-0" onClick={() => textareaRef.current?.focus()}>
      {/* Reply bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#1e2130] rounded-t-lg border border-b-0 border-[#2a2d3e] text-sm">
              <span className="text-[#8b8fa8]">رداً على</span>
              <span className="text-[#6c63ff] font-medium">{replyTo.author.displayName}</span>
              <span className="text-[#565a78] truncate flex-1">{replyTo.content.slice(0, 50)}</span>
              <button onClick={onCancelReply} className="text-[#565a78] hover:text-[#e8eaf6] transition-colors ml-auto flex-shrink-0"><X size={14} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Formatting toolbar */}
      <AnimatePresence>
        {formatting && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
            <div className={clsx('flex items-center gap-1 px-2 py-1.5 bg-[#1e2130] border-x border-t border-[#2a2d3e]', replyTo ? '' : 'rounded-t-lg')}>
              {[
                { icon: <Bold size={13} />, label: 'Bold', fn: () => insertFormat('**') },
                { icon: <Italic size={13} />, label: 'Italic', fn: () => insertFormat('_') },
                { icon: <Code size={13} />, label: 'Code', fn: () => insertFormat('`') },
              ].map(({ icon, label, fn }) => (
                <button key={label} title={label} onClick={fn} className="p-1.5 rounded text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all">{icon}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image preview */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={clsx('flex items-center gap-3 px-3 py-2 bg-[#1e2130] border-x border-t border-[#2a2d3e]', replyTo || formatting ? '' : 'rounded-t-lg')}>
              <img src={imagePreview.url} alt="" className="h-14 w-14 rounded-lg object-cover border border-[#2a2d3e]" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#e8eaf6] truncate">{imagePreview.name}</div>
                <div className="text-xs text-[#565a78]">صورة جاهزة للإرسال</div>
              </div>
              <button onClick={() => setImagePreview(null)} className="text-[#565a78] hover:text-[#ff5252] transition-colors flex-shrink-0"><X size={16} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input */}
      <div className={clsx('flex items-end gap-1 bg-[#1e2130] border border-[#2a2d3e] px-2', replyTo || formatting || imagePreview ? 'rounded-b-xl' : 'rounded-xl')}>
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />

        {/* Attachment button */}
        <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 p-2 mb-1 text-[#8b8fa8] hover:text-[#6c63ff] transition-colors rounded-full hover:bg-[#252840]" title="إرسال صورة">
          <Image size={20} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => { setContent(e.target.value); resize(); }}
          onKeyDown={handleKeyDown}
          placeholder={`رسالة #${channelName}`}
          rows={1}
          maxLength={2000}
          className="flex-1 bg-transparent text-[#e8eaf6] text-sm placeholder-[#565a78] resize-none py-3 outline-none leading-relaxed max-h-32 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
          dir="auto"
        />

        <div className="flex items-center gap-0.5 mb-1 flex-shrink-0">
          {content.length > 1800 && (
            <span className={clsx('text-xs tabular-nums mr-1', content.length > 1950 ? 'text-[#ff5252]' : 'text-[#ffd93d]')}>{2000 - content.length}</span>
          )}

          {/* Emoji */}
          <div className="relative">
            <button onClick={() => setEmojiOpen(v => !v)} className={clsx('p-1.5 rounded-full transition-all', emojiOpen ? 'text-[#ffd93d] bg-[#252840]' : 'text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840]')}>
              <Smile size={20} />
            </button>
            <AnimatePresence>
              {emojiOpen && (
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 8 }} transition={{ duration: 0.12 }}
                  className="absolute bottom-10 right-0 bg-[#1e2130] rounded-xl border border-[#2a2d3e] shadow-2xl p-3 z-50 w-60"
                >
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => { setContent(c => c + e); setEmojiOpen(false); textareaRef.current?.focus(); }}
                        className="text-lg p-1 rounded hover:bg-[#252840] transition-colors hover:scale-125">{e}</button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={() => setFormatting(v => !v)} className={clsx('p-1.5 rounded-full transition-all', formatting ? 'text-[#6c63ff] bg-[#252840]' : 'text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840]')} title="تنسيق">
            <Bold size={18} />
          </button>

          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-full text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all" title="ملف">
            <Paperclip size={18} />
          </button>

          {canSend ? (
            <motion.button initial={{ scale: 0.8 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }}
              onClick={handleSend}
              className="p-1.5 rounded-full bg-[#6c63ff] text-white hover:bg-[#7b73ff] transition-all shadow-lg">
              <Send size={18} />
            </motion.button>
          ) : (
            <button className="p-1.5 rounded-full text-[#8b8fa8] hover:text-[#e8eaf6] hover:bg-[#252840] transition-all"><Mic size={18} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
