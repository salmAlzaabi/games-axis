import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

export let client;
export function setClient(c) { client = c; attachClientEvents(); }

process.on('exit', (code) => console.error(`[EXIT] Process exiting with code ${code}`));
setInterval(() => {}, 1000 * 60 * 60);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_TOKEN || 'meow';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get('/healthz', (_req, res) => res.status(200).send('OK'));
app.get('/_health', (_req, res) => res.status(200).send('OK'));

function requireAuth(req, res, next) {
  const token = req.headers['x-dashboard-token'] || req.query.token;
  if (token === DASHBOARD_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

async function formatMessage(msg, botId) {
  let referencedMessage = null;
  if (msg.reference?.messageId) {
    try {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId).catch(() => null);
      if (ref) {
        referencedMessage = {
          id: ref.id,
          content: ref.content || '',
          author: {
            id: ref.author.id,
            username: ref.author.username,
            displayName: ref.member?.displayName || ref.author.username,
            avatar: ref.author.displayAvatarURL({ size: 32, forceStatic: true }),
            bot: ref.author.bot,
          },
          attachments: [...ref.attachments.values()].map(a => ({ url: a.url, name: a.name, contentType: a.contentType })),
        };
      }
    } catch (_) {}
  }

  const mentionsBot = botId ? msg.mentions.has(botId) : false;
  const repliesToBot = referencedMessage?.author?.id === botId;

  return {
    id: msg.id,
    content: msg.content || '',
    author: {
      id: msg.author.id,
      username: msg.author.username,
      displayName: msg.member?.displayName || msg.author.username,
      avatar: msg.author.displayAvatarURL({ size: 64, forceStatic: true }),
      bot: msg.author.bot,
      color: msg.member?.displayHexColor || null,
    },
    timestamp: msg.createdTimestamp,
    editedTimestamp: msg.editedTimestamp || null,
    attachments: [...msg.attachments.values()].map(a => ({
      id: a.id, url: a.url, name: a.name,
      contentType: a.contentType || '',
      width: a.width, height: a.height, size: a.size,
    })),
    embeds: msg.embeds.map(e => ({
      title: e.title || null,
      description: e.description || null,
      color: e.color != null ? '#' + e.color.toString(16).padStart(6, '0') : null,
      url: e.url || null,
      author: e.author ? { name: e.author.name, iconURL: e.author.iconURL, url: e.author.url } : null,
      footer: e.footer ? { text: e.footer.text, iconURL: e.footer.iconURL } : null,
      image: e.image ? { url: e.image.url, width: e.image.width, height: e.image.height } : null,
      thumbnail: e.thumbnail ? { url: e.thumbnail.url } : null,
      fields: (e.fields || []).map(f => ({ name: f.name, value: f.value, inline: f.inline })),
      timestamp: e.timestamp || null,
    })),
    referencedMessage,
    mentionsBot,
    repliesToBot,
    highlight: mentionsBot || repliesToBot,
  };
}

app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const db = JSON.parse(readFileSync(path.join(__dirname, 'data', 'bot.json'), 'utf-8'));
    const guilds = client.guilds?.cache?.map(g => ({
      id: g.id, name: g.name, memberCount: g.memberCount,
      icon: g.iconURL({ size: 64, forceStatic: true }),
    })) || [];
    const users = Object.values(db.users || {});
    const totalPoints = users.reduce((s, u) => s + (u.points || 0), 0);
    const topUsers = users.sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 10);
    res.json({
      botTag: client.user?.tag || 'Not connected',
      botId: client.user?.id || '',
      botAvatar: client.user?.displayAvatarURL({ size: 64, forceStatic: true }) || '',
      botStatus: client.isReady() ? 'online' : 'offline',
      guilds, userCount: users.length, totalPoints, topUsers,
      transactions: (db.transactions || []).slice(-20).reverse(),
      gameHistory: (db.game_history || []).slice(-20).reverse(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/channels/:guildId', requireAuth, (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const categories = new Map();
    guild.channels.cache
      .filter(c => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .forEach(cat => categories.set(cat.id, { id: cat.id, name: cat.name, channels: [] }));
    const uncategorized = [];
    guild.channels.cache
      .filter(c => c.type === 0 || c.type === 5)
      .sort((a, b) => a.position - b.position)
      .forEach(ch => {
        const d = { id: ch.id, name: ch.name, type: ch.type };
        const cat = ch.parentId ? categories.get(ch.parentId) : null;
        if (cat) cat.channels.push(d); else uncategorized.push(d);
      });
    res.json({ categories: [...categories.values()].filter(c => c.channels.length > 0), uncategorized });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages/:channelId', requireAuth, async (req, res) => {
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Channel not found' });
    const options = { limit: 50 };
    if (req.query.before) options.before = req.query.before;
    const msgs = await channel.messages.fetch(options);
    const botId = client.user?.id;
    const formatted = await Promise.all([...msgs.values()].map(m => formatMessage(m, botId)));
    res.json({ messages: formatted.reverse() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/send/:channelId', requireAuth, async (req, res) => {
  try {
    const channel = client.channels.cache.get(req.params.channelId);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: 'Channel not found' });
    const { content, replyTo, imageBase64, imageName } = req.body;
    const payload = {};
    if (content?.trim()) payload.content = content.trim();
    if (imageBase64) {
      const raw = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      payload.files = [{ attachment: buf, name: imageName || 'image.png' }];
    }
    if (!payload.content && !payload.files) return res.status(400).json({ error: 'Empty message' });
    let sent;
    if (replyTo) {
      const ref = await channel.messages.fetch(replyTo).catch(() => null);
      sent = ref ? await ref.reply(payload) : await channel.send(payload);
    } else {
      sent = await channel.send(payload);
    }
    const formatted = await formatMessage(sent, client.user?.id);
    res.json({ success: true, message: formatted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
app.use(express.static(CLIENT_DIST));
app.get('/', (req, res) => { res.sendFile(path.join(CLIENT_DIST, 'index.html')); });

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Axis Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0010;
      --surface: #12002a;
      --surface2: #1a003d;
      --surface3: #220050;
      --accent: #9b59b6;
      --accent2: #6c3483;
      --glow: rgba(155,89,182,0.4);
      --text: #e8d5f5;
      --text-muted: #a090b5;
      --gold: #f1c40f;
      --success: #2ecc71;
      --error: #e74c3c;
      --highlight: rgba(255, 210, 0, 0.09);
      --highlight-border: #d4aa00;
      --sidebar-w: 240px;
    }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Cairo',sans-serif; background:var(--bg); color:var(--text); height:100vh; overflow:hidden; display:flex; flex-direction:column; }
    body::before { content:''; position:fixed; inset:0; background:radial-gradient(circle at 20% 30%,rgba(155,89,182,.07) 0%,transparent 50%),radial-gradient(circle at 80% 70%,rgba(108,52,131,.07) 0%,transparent 50%); pointer-events:none; z-index:0; }

    /* Login */
    #login-overlay { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; background:rgba(10,0,16,.97); backdrop-filter:blur(20px); }
    .login-card { background:var(--surface); border:1px solid rgba(155,89,182,.3); border-radius:24px; padding:48px 40px; width:380px; max-width:90vw; text-align:center; box-shadow:0 0 80px rgba(155,89,182,.2); animation:fadeInUp .6s ease; }
    .login-title { font-size:28px; font-weight:900; background:linear-gradient(135deg,#c39bd3,#9b59b6,#6c3483); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; margin-bottom:8px; }
    .login-sub { color:var(--text-muted); font-size:14px; margin-bottom:32px; }
    .login-input { width:100%; padding:14px 20px; background:rgba(155,89,182,.1); border:1px solid rgba(155,89,182,.3); border-radius:12px; color:var(--text); font-family:'Cairo',sans-serif; font-size:16px; text-align:center; letter-spacing:4px; margin-bottom:16px; transition:all .3s; outline:none; }
    .login-input:focus { border-color:var(--accent); box-shadow:0 0 20px rgba(155,89,182,.3); }
    .login-btn { width:100%; padding:14px; background:linear-gradient(135deg,#9b59b6,#6c3483); border:none; border-radius:12px; color:#fff; font-family:'Cairo',sans-serif; font-size:16px; font-weight:700; cursor:pointer; transition:all .3s; }
    .login-btn:hover { transform:translateY(-2px); box-shadow:0 8px 30px rgba(155,89,182,.5); }
    .login-error { color:var(--error); font-size:14px; margin-top:12px; display:none; }

    /* App shell */
    #app { display:none; flex-direction:column; height:100vh; position:relative; z-index:1; }

    /* Top nav */
    .topnav { display:flex; align-items:center; gap:12px; padding:0 20px; height:56px; background:rgba(18,0,42,.95); border-bottom:1px solid rgba(155,89,182,.2); backdrop-filter:blur(20px); flex-shrink:0; z-index:10; }
    .nav-logo { font-size:22px; filter:drop-shadow(0 0 8px rgba(155,89,182,.8)); }
    .nav-title { font-size:18px; font-weight:900; background:linear-gradient(135deg,#c39bd3,#9b59b6); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
    .nav-tabs { display:flex; gap:4px; margin-right:auto; }
    .nav-tab { padding:6px 18px; border-radius:8px; font-family:'Cairo',sans-serif; font-size:13px; font-weight:600; cursor:pointer; border:1px solid transparent; transition:all .25s; color:var(--text-muted); background:transparent; }
    .nav-tab.active, .nav-tab:hover { background:rgba(155,89,182,.15); border-color:rgba(155,89,182,.3); color:var(--text); }
    .nav-tab.active { background:rgba(155,89,182,.25); color:#c39bd3; }
    .status-pill { display:flex; align-items:center; gap:6px; background:rgba(46,204,113,.1); border:1px solid rgba(46,204,113,.25); border-radius:100px; padding:4px 12px; font-size:12px; color:var(--success); }
    .status-dot { width:7px; height:7px; border-radius:50%; background:var(--success); animation:blink 2s ease-in-out infinite; }
    .logout-btn { padding:6px 14px; background:rgba(231,76,60,.12); border:1px solid rgba(231,76,60,.25); border-radius:8px; color:var(--error); cursor:pointer; font-family:'Cairo',sans-serif; font-size:12px; transition:all .25s; }
    .logout-btn:hover { background:rgba(231,76,60,.22); }

    /* Pages */
    .page { flex:1; overflow:hidden; display:none; }
    .page.active { display:flex; }

    /* STATS PAGE */
    #stats-page { flex-direction:column; overflow-y:auto; padding:28px 32px; gap:24px; }
    .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; }
    .stat-card { background:var(--surface); border:1px solid rgba(155,89,182,.2); border-radius:16px; padding:22px; text-align:center; position:relative; overflow:hidden; transition:transform .3s; }
    .stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#9b59b6,#6c3483); }
    .stat-card:hover { transform:translateY(-3px); }
    .stat-icon { font-size:28px; margin-bottom:10px; }
    .stat-value { font-size:28px; font-weight:900; background:linear-gradient(135deg,#c39bd3,#9b59b6); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
    .stat-label { color:var(--text-muted); font-size:12px; margin-top:4px; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    @media(max-width:800px) { .grid-2 { grid-template-columns:1fr; } }
    .card { background:var(--surface); border:1px solid rgba(155,89,182,.2); border-radius:18px; padding:20px; }
    .card-title { font-size:15px; font-weight:700; color:var(--accent); margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid rgba(155,89,182,.13); display:flex; align-items:center; gap:8px; }
    .lb-item { display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:10px; margin-bottom:6px; background:rgba(155,89,182,.05); border:1px solid rgba(155,89,182,.08); transition:all .25s; }
    .lb-item:hover { background:rgba(155,89,182,.1); transform:translateX(-3px); }
    .lb-rank { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:12px; flex-shrink:0; }
    .rank-1 { background:linear-gradient(135deg,#f1c40f,#f39c12); color:#000; }
    .rank-2 { background:linear-gradient(135deg,#bdc3c7,#95a5a6); color:#000; }
    .rank-3 { background:linear-gradient(135deg,#cd7f32,#a0522d); color:#fff; }
    .rank-n { background:rgba(155,89,182,.2); color:var(--accent); }
    .lb-name { flex:1; font-size:13px; }
    .lb-pts { font-weight:700; font-size:14px; color:var(--gold); }
    .act-item { display:flex; align-items:flex-start; gap:10px; padding:10px; border-radius:8px; margin-bottom:6px; background:rgba(155,89,182,.05); border-right:3px solid var(--accent2); }
    .act-icon { font-size:18px; }
    .act-text { flex:1; font-size:12px; }
    .act-time { color:var(--text-muted); font-size:11px; }

    /* CHAT PAGE */
    #chat-page { flex-direction:row; height:100%; overflow:hidden; }

    /* Sidebar */
    .sidebar { width:var(--sidebar-w); background:rgba(12,0,28,.8); border-left:1px solid rgba(155,89,182,.15); display:flex; flex-direction:column; flex-shrink:0; overflow:hidden; }
    .sidebar-header { padding:14px 16px; border-bottom:1px solid rgba(155,89,182,.15); }
    .server-select { width:100%; background:rgba(155,89,182,.1); border:1px solid rgba(155,89,182,.2); border-radius:8px; color:var(--text); font-family:'Cairo',sans-serif; font-size:12px; padding:7px 10px; outline:none; cursor:pointer; }
    .server-select option { background:#1a003d; }
    .sidebar-channels { flex:1; overflow-y:auto; padding:8px 0; }
    .sidebar-channels::-webkit-scrollbar { width:4px; }
    .sidebar-channels::-webkit-scrollbar-track { background:transparent; }
    .sidebar-channels::-webkit-scrollbar-thumb { background:rgba(155,89,182,.3); border-radius:2px; }
    .ch-category { padding:14px 12px 4px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.8px; }
    .ch-item { display:flex; align-items:center; gap:8px; padding:7px 12px; margin:1px 6px; border-radius:8px; cursor:pointer; font-size:13px; color:var(--text-muted); transition:all .2s; }
    .ch-item:hover { background:rgba(155,89,182,.1); color:var(--text); }
    .ch-item.active { background:rgba(155,89,182,.2); color:var(--text); }
    .ch-icon { font-size:14px; opacity:.7; }
    .ch-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* Main chat area */
    .chat-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
    .chat-header { padding:0 20px; height:52px; display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(155,89,182,.15); background:rgba(18,0,42,.6); flex-shrink:0; }
    .chat-header-icon { color:var(--text-muted); font-size:16px; }
    .chat-header-name { font-weight:700; font-size:15px; }
    .chat-header-right { margin-right:auto; display:flex; gap:8px; }
    .hdr-btn { padding:5px 12px; border-radius:7px; font-family:'Cairo',sans-serif; font-size:12px; cursor:pointer; border:1px solid rgba(155,89,182,.25); background:rgba(155,89,182,.1); color:var(--text-muted); transition:all .2s; }
    .hdr-btn:hover { background:rgba(155,89,182,.2); color:var(--text); }

    /* Messages */
    .messages-wrap { flex:1; overflow-y:auto; padding:16px 0; display:flex; flex-direction:column; }
    .messages-wrap::-webkit-scrollbar { width:6px; }
    .messages-wrap::-webkit-scrollbar-track { background:transparent; }
    .messages-wrap::-webkit-scrollbar-thumb { background:rgba(155,89,182,.25); border-radius:3px; }
    .load-more-btn { margin:8px auto; padding:7px 20px; background:rgba(155,89,182,.12); border:1px solid rgba(155,89,182,.2); border-radius:8px; color:var(--text-muted); font-family:'Cairo',sans-serif; font-size:12px; cursor:pointer; transition:all .2s; }
    .load-more-btn:hover { background:rgba(155,89,182,.22); color:var(--text); }

    .msg-group { padding:4px 16px; position:relative; transition:background .15s; }
    .msg-group:hover { background:rgba(155,89,182,.04); }
    .msg-group:hover .msg-actions { opacity:1; }
    .msg-group.highlight { background:var(--highlight); border-right:3px solid var(--highlight-border); }
    .msg-group.highlight:hover { background:rgba(255,210,0,.13); }

    /* Reply ref */
    .reply-ref { display:flex; align-items:center; gap:6px; margin-bottom:2px; padding-right:4px; cursor:pointer; opacity:.75; transition:opacity .2s; }
    .reply-ref:hover { opacity:1; }
    .reply-line { width:2px; height:14px; background:rgba(155,89,182,.4); border-radius:2px; flex-shrink:0; margin-right:2px; align-self:flex-end; }
    .reply-avatar { width:16px; height:16px; border-radius:50%; object-fit:cover; }
    .reply-name { font-size:11px; font-weight:700; color:var(--accent); }
    .reply-content { font-size:11px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:300px; }
    .reply-ref.hl-ref .reply-name { color:var(--gold); }

    /* Message row */
    .msg-row { display:flex; gap:12px; align-items:flex-start; }
    .msg-avatar { width:36px; height:36px; border-radius:50%; object-fit:cover; flex-shrink:0; cursor:pointer; transition:transform .2s; }
    .msg-avatar:hover { transform:scale(1.1); }
    .msg-avatar-spacer { width:36px; flex-shrink:0; }
    .msg-body { flex:1; min-width:0; }
    .msg-header { display:flex; align-items:baseline; gap:8px; margin-bottom:2px; }
    .msg-author { font-size:14px; font-weight:700; cursor:pointer; }
    .msg-author:hover { text-decoration:underline; }
    .bot-badge { font-size:9px; padding:1px 6px; background:#5865f2; border-radius:4px; color:#fff; font-weight:700; text-transform:uppercase; vertical-align:middle; }
    .msg-time { font-size:11px; color:var(--text-muted); }
    .msg-content { font-size:14px; line-height:1.55; word-break:break-word; white-space:pre-wrap; }
    .msg-content a { color:#7289da; text-decoration:none; }
    .msg-content a:hover { text-decoration:underline; }
    .mention-highlight { background:rgba(88,101,242,.2); color:#a5b4fc; padding:0 3px; border-radius:3px; }
    .msg-edited { font-size:10px; color:var(--text-muted); margin-right:4px; }

    /* Embeds */
    .embed { margin-top:6px; border-radius:6px; overflow:hidden; border-right:4px solid #4f545c; background:rgba(30,0,60,.5); padding:12px 14px; max-width:500px; }
    .embed-author { display:flex; align-items:center; gap:6px; margin-bottom:6px; font-size:12px; font-weight:600; }
    .embed-author-icon { width:20px; height:20px; border-radius:50%; }
    .embed-title { font-size:14px; font-weight:700; color:#00b0f4; margin-bottom:4px; }
    .embed-title a { color:#00b0f4; text-decoration:none; }
    .embed-title a:hover { text-decoration:underline; }
    .embed-desc { font-size:13px; color:var(--text); line-height:1.45; white-space:pre-wrap; margin-bottom:8px; }
    .embed-fields { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
    .embed-field { min-width:120px; flex:1; }
    .embed-field-inline { flex:0 0 auto; max-width:200px; }
    .embed-field-name { font-size:12px; font-weight:700; color:var(--text); margin-bottom:2px; }
    .embed-field-value { font-size:12px; color:var(--text-muted); white-space:pre-wrap; }
    .embed-image { margin-top:8px; border-radius:6px; max-width:100%; max-height:260px; object-fit:contain; cursor:pointer; }
    .embed-thumb { float:left; margin-right:8px; width:72px; height:72px; border-radius:6px; object-fit:cover; }
    .embed-footer { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-muted); margin-top:8px; border-top:1px solid rgba(255,255,255,.06); padding-top:8px; }
    .embed-footer-icon { width:16px; height:16px; border-radius:50%; }

    /* Attachments */
    .attachments { margin-top:6px; display:flex; flex-wrap:wrap; gap:8px; }
    .attach-img { border-radius:8px; max-width:320px; max-height:240px; object-fit:contain; cursor:pointer; transition:transform .2s; }
    .attach-img:hover { transform:scale(1.02); }
    .attach-file { display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(155,89,182,.1); border:1px solid rgba(155,89,182,.2); border-radius:8px; font-size:12px; }
    .attach-file a { color:var(--accent); text-decoration:none; }

    /* Actions */
    .msg-actions { position:absolute; left:12px; top:4px; display:flex; gap:4px; opacity:0; transition:opacity .2s; background:var(--surface2); border:1px solid rgba(155,89,182,.2); border-radius:8px; padding:3px 6px; }
    .act-btn { padding:4px 8px; border:none; background:transparent; color:var(--text-muted); cursor:pointer; font-size:13px; border-radius:5px; transition:all .15s; font-family:'Cairo',sans-serif; }
    .act-btn:hover { background:rgba(155,89,182,.2); color:var(--text); }

    /* Input area */
    .input-area { padding:12px 16px; background:rgba(12,0,28,.7); border-top:1px solid rgba(155,89,182,.15); flex-shrink:0; }
    .reply-banner { display:none; align-items:center; gap:8px; padding:8px 12px; background:rgba(155,89,182,.1); border-radius:8px 8px 0 0; border:1px solid rgba(155,89,182,.2); border-bottom:none; font-size:12px; color:var(--text-muted); }
    .reply-banner.show { display:flex; }
    .reply-banner span { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .reply-cancel { cursor:pointer; font-size:16px; color:var(--text-muted); transition:color .2s; line-height:1; }
    .reply-cancel:hover { color:var(--error); }
    .input-row { display:flex; align-items:flex-end; gap:8px; }
    .msg-input { flex:1; background:rgba(155,89,182,.08); border:1px solid rgba(155,89,182,.2); border-radius:10px; color:var(--text); font-family:'Cairo',sans-serif; font-size:14px; padding:10px 14px; resize:none; outline:none; max-height:140px; min-height:42px; transition:border-color .2s; line-height:1.45; }
    .msg-input:focus { border-color:rgba(155,89,182,.5); background:rgba(155,89,182,.12); }
    .msg-input::placeholder { color:var(--text-muted); }
    .attach-label { padding:9px 12px; background:rgba(155,89,182,.1); border:1px solid rgba(155,89,182,.2); border-radius:10px; cursor:pointer; font-size:18px; transition:all .2s; display:flex; align-items:center; }
    .attach-label:hover { background:rgba(155,89,182,.2); }
    #file-input { display:none; }
    .img-preview-wrap { display:none; align-items:center; gap:8px; padding:8px; background:rgba(155,89,182,.08); border-radius:8px; margin-top:8px; }
    .img-preview-wrap.show { display:flex; }
    .img-preview { max-height:60px; border-radius:6px; }
    .img-preview-name { flex:1; font-size:12px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .img-remove { cursor:pointer; color:var(--error); font-size:18px; line-height:1; }
    .send-btn { padding:9px 18px; background:linear-gradient(135deg,#9b59b6,#6c3483); border:none; border-radius:10px; color:#fff; font-family:'Cairo',sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all .25s; white-space:nowrap; }
    .send-btn:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(155,89,182,.45); }
    .send-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }

    /* Image lightbox */
    #lightbox { display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.9); backdrop-filter:blur(8px); align-items:center; justify-content:center; cursor:zoom-out; }
    #lightbox.show { display:flex; }
    #lightbox img { max-width:92vw; max-height:92vh; border-radius:10px; object-fit:contain; }

    /* Empty/loading states */
    .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; color:var(--text-muted); gap:12px; }
    .empty-icon { font-size:56px; opacity:.4; }
    .spinner { width:40px; height:40px; border:3px solid rgba(155,89,182,.2); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; margin:30px auto; }

    /* Animations */
    @keyframes fadeInUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes msgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

    /* Scrollbar */
    #stats-page::-webkit-scrollbar { width:6px; }
    #stats-page::-webkit-scrollbar-track { background:transparent; }
    #stats-page::-webkit-scrollbar-thumb { background:rgba(155,89,182,.25); border-radius:3px; }

    .particles { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
    .particle { position:absolute; width:2px; height:2px; border-radius:50%; background:rgba(155,89,182,.5); animation:float linear infinite; }
    @keyframes float { 0%{transform:translateY(100vh) scale(0);opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{transform:translateY(-20px) scale(1);opacity:0} }

    .no-channel { display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:16px; color:var(--text-muted); text-align:center; }
    .no-channel-icon { font-size:64px; opacity:.3; }

    /* MOBILE RESPONSIVE */
    .sidebar-toggle { display:none; padding:6px 10px; background:rgba(155,89,182,.15); border:1px solid rgba(155,89,182,.25); border-radius:8px; color:var(--text); cursor:pointer; font-size:16px; }
    .sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:49; backdrop-filter:blur(4px); }
    .sidebar-overlay.show { display:block; }
    .open-sidebar-btn { display:none; margin-top:12px; padding:10px 22px; background:rgba(155,89,182,.25); border:1px solid rgba(155,89,182,.4); border-radius:10px; color:var(--text); cursor:pointer; font-family:'Cairo',sans-serif; font-size:14px; font-weight:600; transition:background .2s; }
    .open-sidebar-btn:hover { background:rgba(155,89,182,.4); }
    @media (max-width: 768px) { .open-sidebar-btn { display:block; } }

    @media (max-width: 768px) {
      body { overflow:hidden; }
      .topnav { padding:0 12px; gap:8px; }
      .nav-title { font-size:15px; }
      .nav-tabs { gap:2px; }
      .nav-tab { padding:5px 10px; font-size:12px; }
      .status-pill { display:none; }
      .sidebar-toggle { display:flex; align-items:center; order:-1; }

      /* Sidebar becomes a slide-in drawer */
      .sidebar {
        position:fixed;
        right:0; top:56px; bottom:0;
        width:280px;
        transform:translateX(100%);
        transition:transform .3s cubic-bezier(.4,0,.2,1);
        z-index:50;
        border-left:1px solid rgba(155,89,182,.25);
        box-shadow:-8px 0 30px rgba(0,0,0,.5);
      }
      .sidebar.open { transform:translateX(0); }

      #chat-page { position:relative; }

      /* Chat main full width */
      .chat-main { width:100%; }
      .chat-header { padding:0 12px; }
      .chat-header-name { font-size:13px; }

      /* Messages */
      .messages-wrap { padding:8px 0; }
      .msg-group { padding:3px 10px; }
      .msg-avatar { width:30px; height:30px; }
      .msg-avatar-spacer { width:30px; }
      .msg-row { gap:8px; }
      .msg-content { font-size:13px; }
      .attach-img { max-width:220px; max-height:180px; }
      .embed { max-width:100%; }
      .msg-actions { left:8px; }

      /* Reply ref */
      .reply-ref { margin-bottom:4px; }
      .reply-content { max-width:180px; }

      /* Input */
      .input-area { padding:8px 10px; }
      .input-row { gap:6px; }
      .msg-input { font-size:13px; padding:8px 10px; }
      .attach-label { padding:7px 9px; font-size:16px; }
      .send-btn { padding:8px 12px; font-size:13px; }

      /* Stats page */
      #stats-page { padding:16px; gap:16px; }
      .stats-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
      .stat-card { padding:16px; }
      .stat-value { font-size:22px; }
      .grid-2 { grid-template-columns:1fr; }
      .card { padding:14px; }
    }

    @media (max-width: 480px) {
      .nav-tabs { display:none; }
      .mobile-page-tabs { display:flex; gap:2px; }
      .stats-grid { grid-template-columns:1fr 1fr; }
    }

    /* Mobile tab bar (bottom nav for very small screens) */
    .mobile-page-tabs { display:none; }
    .mobile-nav { display:none; }
    @media (max-width: 480px) {
      .mobile-nav {
        display:flex;
        position:fixed;
        bottom:0; left:0; right:0;
        background:rgba(18,0,42,.98);
        border-top:1px solid rgba(155,89,182,.2);
        z-index:40;
        height:56px;
        align-items:stretch;
      }
      .mobile-nav-btn {
        flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:2px; cursor:pointer; border:none; background:transparent;
        color:var(--text-muted); font-family:'Cairo',sans-serif; font-size:10px;
        transition:color .2s;
      }
      .mobile-nav-btn.active { color:#c39bd3; }
      .mobile-nav-btn span:first-child { font-size:20px; }
      #app { padding-bottom:56px; }
      .topnav .nav-tabs { display:none; }
      .topnav .logout-btn { font-size:11px; padding:5px 9px; }
    }

    /* Improved reply display */
    .reply-ref {
      background:rgba(155,89,182,.08);
      border-radius:6px;
      padding:4px 8px;
      margin-bottom:3px;
      border-right:2px solid rgba(155,89,182,.4);
    }
    .reply-ref.hl-ref { border-right-color:var(--highlight-border); background:rgba(255,210,0,.06); }
    .reply-line { display:none; }

    /* Better highlight */
    .msg-group.highlight { border-right:3px solid var(--highlight-border); padding-right:13px; }
  </style>
</head>
<body>
  <div class="particles" id="particles"></div>

  <!-- Login -->
  <div id="login-overlay">
    <div class="login-card">
      <div style="font-size:64px;margin-bottom:16px;filter:drop-shadow(0 0 14px rgba(155,89,182,.8))">🔮</div>
      <div class="login-title">Axis Dashboard</div>
      <div class="login-sub">أدخل كلمة السر للدخول</div>
      <input type="password" class="login-input" id="pw-input" placeholder="••••••••" autofocus>
      <button class="login-btn" onclick="doLogin()">🚀 دخول</button>
      <div class="login-error" id="login-err">❌ كلمة السر غير صحيحة!</div>
    </div>
  </div>

  <!-- App -->
  <div id="app">
    <!-- Top nav -->
    <nav class="topnav">
      <div class="nav-logo">⚙️</div>
      <div>
        <div class="nav-title">Axis Dashboard</div>
        <div style="font-size:10px;color:var(--text-muted)" id="bot-tag-nav">...</div>
      </div>
      <div class="nav-tabs">
        <button class="nav-tab active" onclick="switchPage('stats')">📊 الإحصائيات</button>
        <button class="nav-tab" onclick="switchPage('chat')">💬 الشات</button>
      </div>
      <div class="status-pill" id="status-pill"><div class="status-dot"></div><span>متصل</span></div>
      <button class="logout-btn" onclick="logout()">خروج</button>
    </nav>

    <!-- Stats page -->
    <div class="page active" id="stats-page">
      <div class="stats-grid" id="sg">
        <div class="stat-card"><div class="stat-icon">⚡</div><div class="stat-value" id="s-guilds">-</div><div class="stat-label">السيرفرات</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value" id="s-users">-</div><div class="stat-label">المستخدمون</div></div>
        <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value" id="s-pts">-</div><div class="stat-label">إجمالي النقاط</div></div>
        <div class="stat-card"><div class="stat-icon">🎮</div><div class="stat-value" id="s-games">-</div><div class="stat-label">الألعاب</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-title">🏆 المتصدرون</div><div id="lb-list"><div class="spinner"></div></div></div>
        <div class="card"><div class="card-title">📊 آخر الأنشطة</div><div id="act-list"><div class="spinner"></div></div></div>
      </div>
    </div>

    <!-- Chat page -->
    <div class="page" id="chat-page">
      <!-- Sidebar -->
      <div class="sidebar">
        <div class="sidebar-header">
          <select class="server-select" id="guild-select" onchange="onGuildChange()">
            <option value="">-- اختر السيرفر --</option>
          </select>
        </div>
        <div class="sidebar-channels" id="channels-list">
          <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">اختر سيرفر أولاً</div>
        </div>
      </div>

      <!-- Sidebar overlay (mobile) -->
      <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>

      <!-- Main -->
      <div class="chat-main" id="chat-main">
        <div class="no-channel" id="no-channel">
          <div class="no-channel-icon">💬</div>
          <div style="font-size:16px;font-weight:700">اختر قناة للبدء</div>
          <div style="font-size:13px;color:var(--text-muted)">اختر سيرفر وقناة من القائمة الجانبية</div>
          <button class="open-sidebar-btn" onclick="toggleSidebar()">☰ افتح قائمة القنوات</button>
        </div>

        <div id="channel-view" style="display:none;flex-direction:column;flex:1;overflow:hidden">
          <div class="chat-header">
            <button class="sidebar-toggle" onclick="toggleSidebar()" title="القنوات">☰</button>
            <span class="chat-header-icon">#</span>
            <span class="chat-header-name" id="ch-name">...</span>
            <div class="chat-header-right">
              <button class="hdr-btn" onclick="refreshMessages()">↻ تحديث</button>
            </div>
          </div>
          <div class="messages-wrap" id="messages-wrap">
            <button class="load-more-btn" id="load-more" onclick="loadMoreMessages()" style="display:none">↑ تحميل المزيد</button>
            <div id="msgs-container"></div>
          </div>
          <div class="input-area">
            <div class="reply-banner" id="reply-banner">
              <span id="reply-label">الرد على ...</span>
              <span class="reply-cancel" onclick="cancelReply()">✕</span>
            </div>
            <div class="input-row">
              <label class="attach-label" title="إرفاق صورة">
                📎
                <input type="file" id="file-input" accept="image/*" onchange="onFileSelect(event)">
              </label>
              <textarea class="msg-input" id="msg-input" placeholder="اكتب رسالتك هنا..." rows="1"
                onkeydown="onInputKeydown(event)" oninput="autoGrow(this)"></textarea>
              <button class="send-btn" id="send-btn" onclick="sendMessage()">إرسال ✈️</button>
            </div>
            <div class="img-preview-wrap" id="img-preview-wrap">
              <img id="img-preview" class="img-preview" src="" alt="">
              <span class="img-preview-name" id="img-preview-name"></span>
              <span class="img-remove" onclick="removeImage()" title="إزالة الصورة">✕</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Lightbox -->
  <div id="lightbox" onclick="closeLightbox()"><img id="lb-img" src="" alt=""></div>

  <!-- Mobile bottom nav -->
  <nav class="mobile-nav">
    <button class="mobile-nav-btn active" id="mnav-stats" onclick="switchPage('stats',this)"><span>📊</span><span>الإحصائيات</span></button>
    <button class="mobile-nav-btn" id="mnav-chat" onclick="switchPage('chat',this)"><span>💬</span><span>الشات</span></button>
  </nav>

  <script>
    // State
    let TOKEN = '';
    let BOT_ID = '';
    let state = {
      guilds: [],
      selectedGuild: null,
      selectedChannel: null,
      messages: [],
      replyingTo: null,
      pendingFile: null,
      oldestMsgId: null,
    };
    let pollTimer = null;

    // Particles
    (function() {
      const c = document.getElementById('particles');
      for (let i = 0; i < 25; i++) {
        const p = document.createElement('div'); p.className = 'particle';
        p.style.left = Math.random()*100+'vw';
        p.style.animationDuration = (Math.random()*14+7)+'s';
        p.style.animationDelay = (Math.random()*8)+'s';
        p.style.width = p.style.height = (Math.random()*3+1)+'px';
        c.appendChild(p);
      }
    })();

    // Auth
    async function doLogin() {
      const pw = document.getElementById('pw-input').value;
      TOKEN = pw;
      const r = await fetch('/api/stats', { headers: { 'x-dashboard-token': TOKEN } });
      if (r.ok) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        loadStats();
      } else {
        document.getElementById('login-err').style.display = 'block';
        document.getElementById('pw-input').value = '';
        TOKEN = '';
        setTimeout(() => document.getElementById('login-err').style.display='none', 3000);
      }
    }
    document.getElementById('pw-input').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
    function logout() {
      TOKEN=''; BOT_ID='';
      document.getElementById('login-overlay').style.display='flex';
      document.getElementById('app').style.display='none';
      document.getElementById('pw-input').value='';
      clearInterval(pollTimer);
    }

    // Page switch
    function switchPage(page, mobileBtn) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mobile-nav-btn').forEach(t => t.classList.remove('active'));
      document.getElementById(page+'-page').classList.add('active');
      // highlight desktop tab
      const desktopTab = [...document.querySelectorAll('.nav-tab')].find(t => t.getAttribute('onclick')?.includes("'"+page+"'"));
      if (desktopTab) desktopTab.classList.add('active');
      // highlight mobile tab
      if (mobileBtn) mobileBtn.classList.add('active');
      else { const mb = document.getElementById('mnav-'+page); if (mb) mb.classList.add('active'); }
      if (page === 'chat' && state.guilds.length > 0) populateGuildSelect();
      closeSidebar();
    }

    // Sidebar (mobile)
    function toggleSidebar() {
      const sb = document.getElementById('chat-page').querySelector('.sidebar');
      const ov = document.getElementById('sidebar-overlay');
      if (sb.classList.contains('open')) { sb.classList.remove('open'); ov.classList.remove('show'); }
      else { sb.classList.add('open'); ov.classList.add('show'); }
    }
    function closeSidebar() {
      const sb = document.querySelector('.sidebar');
      const ov = document.getElementById('sidebar-overlay');
      if (sb) sb.classList.remove('open');
      if (ov) ov.classList.remove('show');
    }

    // Stats
    async function loadStats() {
      const r = await fetch('/api/stats', { headers: { 'x-dashboard-token': TOKEN } });
      const d = await r.json();
      BOT_ID = d.botId;
      state.guilds = d.guilds;
      document.getElementById('bot-tag-nav').textContent = d.botTag;
      document.getElementById('s-guilds').textContent = d.guilds.length;
      document.getElementById('s-users').textContent = d.userCount;
      document.getElementById('s-pts').textContent = d.totalPoints.toLocaleString();
      document.getElementById('s-games').textContent = d.gameHistory.length+'+';
      const pill = document.getElementById('status-pill');
      if (d.botStatus==='online') { pill.innerHTML='<div class="status-dot"></div><span>متصل</span>'; }
      else { pill.style.color='var(--error)'; pill.innerHTML='<div class="status-dot" style="background:var(--error)"></div><span>غير متصل</span>'; }

      // Leaderboard
      const lb = document.getElementById('lb-list');
      if (!d.topUsers.length) { lb.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:20px">لا يوجد بيانات</div>'; }
      else lb.innerHTML = d.topUsers.map((u,i) => {
        const rc = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-n';
        const m = i===0?'👑':i===1?'🥈':i===2?'🥉':(i+1);
        return \`<div class="lb-item"><div class="lb-rank \${rc}">\${m}</div><div class="lb-name">\${esc(u.username||u.user_id)}</div><div style="font-size:11px;color:var(--text-muted)">✅\${u.wins||0} ❌\${u.losses||0}</div><div class="lb-pts">\${(u.points||0).toLocaleString()} 💰</div></div>\`;
      }).join('');

      // Activity
      const act = document.getElementById('act-list');
      if (!d.gameHistory.length) { act.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:20px">لا يوجد نشاط</div>'; }
      else act.innerHTML = d.gameHistory.slice(0,10).map((g,i) => {
        const icon=g.result==='win'?'🏆':'💀'; const col=g.result==='win'?'#2ecc71':'#e74c3c';
        const t=new Date(g.created_at).toLocaleTimeString('ar-SA');
        return \`<div class="act-item" style="border-right-color:\${col}"><div class="act-icon">\${icon}</div><div class="act-text"><div style="font-weight:600">\${g.game||'لعبة'}</div><div style="color:var(--text-muted);font-size:11px">\${g.user_id}</div></div><div class="act-time">\${t}</div></div>\`;
      }).join('');

      populateGuildSelect();
    }

    // Guild / Channel select
    function populateGuildSelect() {
      const sel = document.getElementById('guild-select');
      sel.innerHTML = '<option value="">-- اختر السيرفر --</option>' +
        state.guilds.map(g => \`<option value="\${g.id}" \${state.selectedGuild===g.id?'selected':''}>\${esc(g.name)}</option>\`).join('');
      if (state.selectedGuild) loadChannels(state.selectedGuild);
    }

    async function onGuildChange() {
      const gid = document.getElementById('guild-select').value;
      state.selectedGuild = gid;
      state.selectedChannel = null;
      state.messages = [];
      document.getElementById('no-channel').style.display='flex';
      document.getElementById('channel-view').style.display='none';
      if (gid) loadChannels(gid);
    }

    async function loadChannels(gid) {
      document.getElementById('channels-list').innerHTML = '<div class="spinner"></div>';
      const r = await fetch(\`/api/channels/\${gid}\`, { headers: { 'x-dashboard-token': TOKEN } });
      const d = await r.json();
      let html = '';
      if (d.uncategorized && d.uncategorized.length) {
        d.uncategorized.forEach(ch => { html += chItem(ch); });
      }
      (d.categories||[]).forEach(cat => {
        html += \`<div class="ch-category">\${esc(cat.name)}</div>\`;
        cat.channels.forEach(ch => { html += chItem(ch); });
      });
      document.getElementById('channels-list').innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">لا توجد قنوات</div>';
    }

    function chItem(ch) {
      const icon = ch.type===5?'📢':'💬';
      const active = ch.id===state.selectedChannel?'active':'';
      return \`<div class="ch-item \${active}" id="chi-\${ch.id}" onclick="selectChannel('\${ch.id}','\${esc(ch.name)}')">\${icon} <span class="ch-name">\${esc(ch.name)}</span></div>\`;
    }

    async function selectChannel(chId, chName) {
      if (state.selectedChannel === chId) { closeSidebar(); return; }
      closeSidebar();
      clearInterval(pollTimer);
      state.selectedChannel = chId;
      state.messages = [];
      state.replyingTo = null;
      state.pendingFile = null;
      state.oldestMsgId = null;
      cancelReply(); removeImage();

      document.querySelectorAll('.ch-item').forEach(el => el.classList.remove('active'));
      const el = document.getElementById('chi-'+chId);
      if (el) el.classList.add('active');

      document.getElementById('ch-name').textContent = chName;
      document.getElementById('no-channel').style.display='none';
      document.getElementById('channel-view').style.display='flex';
      document.getElementById('msgs-container').innerHTML='<div class="spinner"></div>';
      document.getElementById('load-more').style.display='none';

      await loadMessages(true);
      pollTimer = setInterval(() => pollMessages(), 5000);
    }

    // Messages
    async function loadMessages(scrollBottom=false) {
      const r = await fetch(\`/api/messages/\${state.selectedChannel}\`, { headers: { 'x-dashboard-token': TOKEN } });
      const d = await r.json();
      if (!d.messages) return;
      state.messages = d.messages;
      state.oldestMsgId = d.messages.length ? d.messages[0].id : null;
      renderMessages();
      if (scrollBottom) setTimeout(scrollToBottom, 80);
      if (d.messages.length >= 50) document.getElementById('load-more').style.display='block';
    }

    async function loadMoreMessages() {
      if (!state.oldestMsgId) return;
      const btn = document.getElementById('load-more');
      btn.textContent = '...';
      btn.disabled = true;
      const r = await fetch(\`/api/messages/\${state.selectedChannel}?before=\${state.oldestMsgId}\`, { headers: { 'x-dashboard-token': TOKEN } });
      const d = await r.json();
      btn.textContent = '↑ تحميل المزيد'; btn.disabled = false;
      if (!d.messages || !d.messages.length) { btn.style.display='none'; return; }
      const wrap = document.getElementById('messages-wrap');
      const prevH = wrap.scrollHeight;
      state.messages = [...d.messages, ...state.messages];
      state.oldestMsgId = d.messages[0].id;
      renderMessages();
      wrap.scrollTop = wrap.scrollHeight - prevH;
      if (d.messages.length < 50) btn.style.display='none';
    }

    async function pollMessages() {
      if (!state.selectedChannel) return;
      const r = await fetch(\`/api/messages/\${state.selectedChannel}\`, { headers: { 'x-dashboard-token': TOKEN } }).catch(()=>null);
      if (!r || !r.ok) return;
      const d = await r.json();
      if (!d.messages) return;
      const newMsgs = d.messages.filter(m => !state.messages.find(x => x.id===m.id));
      if (newMsgs.length) {
        state.messages = [...state.messages, ...newMsgs];
        const wrap = document.getElementById('messages-wrap');
        const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80;
        renderMessages();
        if (atBottom) setTimeout(scrollToBottom, 60);
      }
    }

    async function refreshMessages() { await loadMessages(true); }

    function renderMessages() {
      const container = document.getElementById('msgs-container');
      if (!state.messages.length) { container.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:30px">لا توجد رسائل</div>'; return; }
      let html = '';
      let prevAuthorId = null, prevTs = 0;
      state.messages.forEach((msg, idx) => {
        const sameAuthor = msg.author.id === prevAuthorId && (msg.timestamp - prevTs) < 5*60*1000;
        const hasRef = !!msg.referencedMessage;
        const showAvatar = !sameAuthor || hasRef;
        html += renderMsg(msg, showAvatar);
        prevAuthorId = msg.author.id;
        prevTs = msg.timestamp;
      });
      container.innerHTML = html;
    }

    function renderMsg(msg, showAvatar) {
      const hl = msg.highlight ? 'highlight' : '';
      const authorColor = msg.author.color && msg.author.color !== '#000000' ? msg.author.color : 'var(--text)';
      const time = new Date(msg.timestamp).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'});
      const fullTime = new Date(msg.timestamp).toLocaleString('ar-SA');

      // Reply reference
      let refHtml = '';
      if (msg.referencedMessage) {
        const ref = msg.referencedMessage;
        const refHl = (ref.author.id === BOT_ID) ? 'hl-ref' : '';
        const refContent = ref.content || (ref.attachments?.length ? '📎 صورة/ملف' : '...');
        refHtml = \`<div class="reply-ref \${refHl}" onclick="scrollToMsg('\${ref.id}')">
          <div class="reply-line"></div>
          <img class="reply-avatar" src="\${ref.author.avatar}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="">
          <span class="reply-name">\${esc(ref.author.displayName)}</span>
          <span class="reply-content">\${esc(refContent.slice(0,100))}</span>
        </div>\`;
      }

      // Avatar or spacer
      let avatarHtml = '';
      if (showAvatar) {
        avatarHtml = \`<img class="msg-avatar" src="\${msg.author.avatar}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="" title="\${esc(msg.author.displayName)}">\`;
      } else {
        avatarHtml = '<div class="msg-avatar-spacer"></div>';
      }

      // Header
      const headerHtml = showAvatar ? \`<div class="msg-header">
        <span class="msg-author" style="color:\${authorColor}" title="\${esc(msg.author.username)}">\${esc(msg.author.displayName)}\${msg.author.bot ? ' <span class="bot-badge">BOT</span>' : ''}</span>
        <span class="msg-time" title="\${fullTime}">\${time}\${msg.editedTimestamp ? ' <span class="msg-edited">(معدّل)</span>' : ''}</span>
      </div>\` : '';

      // Content
      let contentHtml = '';
      if (msg.content) {
        let c = esc(msg.content);
        c = c.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention-highlight">@$1</span>');
        c = c.replace(/&lt;#(\d+)&gt;/g, '<span class="mention-highlight">#$1</span>');
        c = c.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        contentHtml = \`<div class="msg-content">\${c}\${!showAvatar && msg.editedTimestamp ? ' <span class="msg-edited">(معدّل)</span>' : ''}</div>\`;
      }

      // Attachments
      let attHtml = '';
      if (msg.attachments.length) {
        attHtml = '<div class="attachments">';
        msg.attachments.forEach(a => {
          if (a.contentType && a.contentType.startsWith('image/')) {
            attHtml += \`<img class="attach-img" src="\${a.url}" alt="\${esc(a.name)}" onclick="openLightbox('\${a.url}')" loading="lazy">\`;
          } else {
            attHtml += \`<div class="attach-file">📎 <a href="\${a.url}" target="_blank">\${esc(a.name)}</a></div>\`;
          }
        });
        attHtml += '</div>';
      }

      // Embeds
      let embedHtml = '';
      msg.embeds.forEach(e => { embedHtml += renderEmbed(e); });

      return \`<div class="msg-group \${hl}" id="msg-\${msg.id}" data-id="\${msg.id}">
        \${refHtml}
        <div class="msg-row">
          \${avatarHtml}
          <div class="msg-body">
            \${headerHtml}
            \${contentHtml}
            \${attHtml}
            \${embedHtml}
          </div>
        </div>
        <div class="msg-actions">
          <button class="act-btn" onclick="startReply('\${msg.id}','\${esc(msg.author.displayName)}')" title="رد">↩️ رد</button>
        </div>
      </div>\`;
    }

    function renderEmbed(e) {
      const borderColor = e.color || '#4f545c';
      let html = \`<div class="embed" style="border-right-color:\${borderColor}">\`;
      if (e.thumbnail) html += \`<img class="embed-thumb" src="\${e.thumbnail.url}" alt="" onclick="openLightbox('\${e.thumbnail.url}')" loading="lazy">\`;
      if (e.author) html += \`<div class="embed-author">\${e.author.iconURL ? \`<img class="embed-author-icon" src="\${e.author.iconURL}" onerror="this.style.display='none'" alt="">\` : ''}<span>\${esc(e.author.name||'')}</span></div>\`;
      if (e.title) html += \`<div class="embed-title">\${e.url ? \`<a href="\${e.url}" target="_blank">\${esc(e.title)}</a>\` : esc(e.title)}</div>\`;
      if (e.description) {
        let d = esc(e.description);
        d = d.replace(/(https?:\\/\\/[^\\s]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
        html += \`<div class="embed-desc">\${d}</div>\`;
      }
      if (e.fields && e.fields.length) {
        html += '<div class="embed-fields">';
        e.fields.forEach(f => {
          html += \`<div class="embed-field \${f.inline?'embed-field-inline':''}"><div class="embed-field-name">\${esc(f.name)}</div><div class="embed-field-value">\${esc(f.value)}</div></div>\`;
        });
        html += '</div>';
      }
      if (e.image) html += \`<img class="embed-image" src="\${e.image.url}" alt="" onclick="openLightbox('\${e.image.url}')" loading="lazy">\`;
      if (e.footer || e.timestamp) {
        html += '<div class="embed-footer" style="clear:both">';
        if (e.footer?.iconURL) html += \`<img class="embed-footer-icon" src="\${e.footer.iconURL}" onerror="this.style.display='none'" alt="">\`;
        if (e.footer?.text) html += \`<span>\${esc(e.footer.text)}</span>\`;
        if (e.footer && e.timestamp) html += '<span>•</span>';
        if (e.timestamp) html += \`<span>\${new Date(e.timestamp).toLocaleDateString('ar-SA')}</span>\`;
        html += '</div>';
      }
      html += '<div style="clear:both"></div></div>';
      return html;
    }

    // Reply
    function startReply(msgId, authorName) {
      state.replyingTo = msgId;
      document.getElementById('reply-label').textContent = \`الرد على \${authorName}\`;
      document.getElementById('reply-banner').classList.add('show');
      document.getElementById('msg-input').focus();
    }
    function cancelReply() {
      state.replyingTo = null;
      document.getElementById('reply-banner').classList.remove('show');
    }

    // Image attach
    function onFileSelect(e) {
      const file = e.target.files[0];
      if (!file) return;
      state.pendingFile = file;
      const url = URL.createObjectURL(file);
      document.getElementById('img-preview').src = url;
      document.getElementById('img-preview-name').textContent = file.name;
      document.getElementById('img-preview-wrap').classList.add('show');
    }
    function removeImage() {
      state.pendingFile = null;
      document.getElementById('img-preview-wrap').classList.remove('show');
      document.getElementById('img-preview').src='';
      document.getElementById('file-input').value='';
    }

    // Send
    async function sendMessage() {
      const input = document.getElementById('msg-input');
      const content = input.value.trim();
      if (!content && !state.pendingFile) return;
      const btn = document.getElementById('send-btn');
      btn.disabled = true; btn.textContent = '...';

      const body = { content, replyTo: state.replyingTo };
      if (state.pendingFile) {
        const b64 = await fileToBase64(state.pendingFile);
        body.imageBase64 = b64;
        body.imageName = state.pendingFile.name;
      }

      const r = await fetch(\`/api/send/\${state.selectedChannel}\`, {
        method: 'POST',
        headers: { 'content-type':'application/json', 'x-dashboard-token': TOKEN },
        body: JSON.stringify(body),
      }).catch(() => null);

      btn.disabled = false; btn.textContent = 'إرسال ✈️';

      if (r && r.ok) {
        const d = await r.json();
        input.value = ''; autoGrow(input);
        cancelReply(); removeImage();
        // Add to messages
        const existing = state.messages.find(m => m.id === d.message.id);
        if (!existing) {
          state.messages.push(d.message);
          renderMessages();
          setTimeout(scrollToBottom, 60);
        }
      }
    }

    function onInputKeydown(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }
    function autoGrow(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    }
    function fileToBase64(file) {
      return new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    }

    // Scroll / Nav
    function scrollToBottom() {
      const w = document.getElementById('messages-wrap');
      w.scrollTop = w.scrollHeight;
    }
    function scrollToMsg(id) {
      const el = document.getElementById('msg-'+id);
      if (!el) return;
      el.scrollIntoView({ behavior:'smooth', block:'center' });
      el.style.background = 'rgba(155,89,182,.15)';
      setTimeout(() => { el.style.background = ''; }, 1500);
    }

    // Lightbox
    function openLightbox(url) {
      document.getElementById('lb-img').src = url;
      document.getElementById('lightbox').classList.add('show');
    }
    function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }
    document.addEventListener('keydown', e => { if (e.key==='Escape') closeLightbox(); });

    // Helpers
    function esc(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Auto-refresh stats every 30s
    setInterval(() => { if (TOKEN) loadStats(); }, 30000);
  </script>
</body>
</html>`;
}

// ---

// Bot profile
app.patch('/api/bot/profile', requireAuth, async (req, res) => {
  const { username, avatar } = req.body;
  try {
    const opts = {};
    if (username) opts.username = username;
    if (avatar) opts.avatar = avatar;
    if (Object.keys(opts).length) await client.user.edit(opts);
    res.json({ success: true, username: client.user.username, avatar: client.user.displayAvatarURL({ size: 128, forceStatic: true }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/bot/status', requireAuth, (req, res) => {
  const { status, activityType, activityText } = req.body;
  try {
    const presence = { status: status || 'online', activities: activityText ? [{ name: activityText, type: activityType ?? 0 }] : [] };
    client.user.setPresence(presence);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Member detail
app.get('/api/member-info/:guildId/:userId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const member = await guild.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({
      id: member.id, username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ size: 128, forceStatic: true }),
      banner: member.user.banner ? member.user.bannerURL({ size: 512 }) : null,
      bot: member.user.bot,
      color: member.displayHexColor !== '#000000' ? member.displayHexColor : null,
      status: member.presence?.status || 'offline',
      customStatus: member.presence?.activities?.find(a => a.type === 4)?.state || null,
      activity: member.presence?.activities?.find(a => a.type !== 4)?.name || null,
      roles: member.roles.cache.filter(r => r.name !== '@everyone').sort((a,b) => b.position - a.position)
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
      joinedAt: member.joinedAt?.toISOString() || null,
      createdAt: member.user.createdAt?.toISOString() || null,
      inVoice: !!member.voice?.channelId, voiceChannelId: member.voice?.channelId || null,
      serverMuted: member.voice?.serverMute || false, serverDeafened: member.voice?.serverDeaf || false,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Role management on member
app.post('/api/members/:guildId/:userId/roles/:roleId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.roles.add(req.params.roleId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:guildId/:userId/roles/:roleId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.roles.remove(req.params.roleId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kick / timeout / ban
app.post('/api/members/:guildId/:userId/kick', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.kick(req.body.reason || 'Kicked via dashboard');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/:guildId/:userId/timeout', requireAuth, async (req, res) => {
  const { minutes } = req.body;
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.timeout(minutes > 0 ? minutes * 60 * 1000 : null);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/:guildId/:userId/ban', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    await guild.members.ban(req.params.userId, { reason: req.body.reason || 'Banned via dashboard' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Voice controls
app.patch('/api/voice/:guildId/:userId/mute', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.voice.setMute(req.body.mute);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/voice/:guildId/:userId/deafen', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.voice.setDeaf(req.body.deafen);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/voice/:guildId/:userId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const member = await guild?.members.fetch(req.params.userId).catch(() => null);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await member.voice.disconnect();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roles CRUD
app.post('/api/guilds/:guildId/roles', requireAuth, async (req, res) => {
  const { name, color, hoist, mentionable } = req.body;
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const role = await guild.roles.create({ name: name || 'New Role', color: color || '#99aab5', hoist: !!hoist, mentionable: !!mentionable });
    res.json({ role: { id: role.id, name: role.name, color: role.hexColor, position: role.position, memberCount: role.members.size } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/guilds/:guildId/roles/:roleId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const role = guild?.roles.cache.get(req.params.roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    const { name, color, hoist, mentionable } = req.body;
    const opts = {};
    if (name !== undefined) opts.name = name;
    if (color !== undefined) opts.color = color;
    if (hoist !== undefined) opts.hoist = hoist;
    if (mentionable !== undefined) opts.mentionable = mentionable;
    await role.edit(opts);
    res.json({ success: true, role: { id: role.id, name: role.name, color: role.hexColor } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/guilds/:guildId/roles/:roleId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    const role = guild?.roles.cache.get(req.params.roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    await role.delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reactions
app.post('/api/messages/:channelId/:messageId/react', requireAuth, async (req, res) => {
  try {
    const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
    const msg = await ch?.messages?.fetch(req.params.messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    await msg.react(req.body.emoji);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/messages/:channelId/:messageId/react', requireAuth, async (req, res) => {
  try {
    const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
    const msg = await ch?.messages?.fetch(req.params.messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const reaction = msg.reactions.cache.find(r =>
      r.emoji.name === req.body.emoji || r.emoji.toString() === req.body.emoji
    );
    if (reaction) await reaction.users.remove(client.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete / edit message
app.delete('/api/messages/:channelId/:messageId', requireAuth, async (req, res) => {
  try {
    const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
    const msg = await ch?.messages?.fetch(req.params.messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    await msg.delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/messages/:channelId/:messageId', requireAuth, async (req, res) => {
  try {
    const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
    const msg = await ch?.messages?.fetch(req.params.messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.author.id !== client.user.id) return res.status(403).json({ error: 'Can only edit own messages' });
    const edited = await msg.edit(req.body.content);
    res.json({ success: true, message: await formatMessage(edited, client.user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DMs
app.get('/api/dms', requireAuth, (req, res) => {
  try {
    const dms = [...client.channels.cache.filter(c => c.type === 1).values()].map(c => ({
      id: c.id, userId: c.recipient?.id,
      username: c.recipient?.username, displayName: c.recipient?.username,
      avatar: c.recipient?.displayAvatarURL({ size: 64, forceStatic: true }),
    }));
    res.json({ dms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dms/:userId', requireAuth, async (req, res) => {
  try {
    const user = await client.users.fetch(req.params.userId).catch(() => null);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const dm = await user.createDM();
    const msgs = await dm.messages.fetch({ limit: 50 });
    const formatted = await Promise.all([...msgs.values()].reverse().map(m => formatMessage(m, client.user.id)));
    res.json({ messages: formatted, channelId: dm.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dms/:userId', requireAuth, async (req, res) => {
  const { content, imageBase64, imageName } = req.body;
  try {
    const user = await client.users.fetch(req.params.userId).catch(() => null);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const dm = await user.createDM();
    const payload = {};
    if (content?.trim()) payload.content = content.trim();
    if (imageBase64) {
      const buf = Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      payload.files = [{ attachment: buf, name: imageName || 'image.png' }];
    }
    if (!payload.content && !payload.files) return res.status(400).json({ error: 'Empty message' });
    const sent = await dm.send(payload);
    res.json({ success: true, message: await formatMessage(sent, client.user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE for DM messages (registered in setClient once the bot client exists)

// ---

app.get('/api/guilds', requireAuth, (req, res) => {
  try {
    const guilds = [...(client.guilds?.cache?.values() || [])].map(g => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 128, forceStatic: true }),
      memberCount: g.memberCount,
      onlineCount: g.approximatePresenceCount || 0,
      ownerId: g.ownerId,
      description: g.description,
      boostLevel: g.premiumTier,
      boostCount: g.premiumSubscriptionCount || 0,
    }));
    res.json({ guilds, botId: client.user?.id, botTag: client.user?.tag, botAvatar: client.user?.displayAvatarURL({ size: 128, forceStatic: true }) || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/members/:guildId', requireAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    let members;
    try { members = await guild.members.fetch({ limit: 100 }); }
    catch { members = guild.members.cache; }
    const list = [...members.values()].map(m => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      avatar: m.user.displayAvatarURL({ size: 64, forceStatic: true }),
      bot: m.user.bot,
      color: m.displayHexColor !== '#000000' ? m.displayHexColor : null,
      status: m.presence?.status || 'offline',
      customStatus: m.presence?.activities?.find(a => a.type === 4)?.state || null,
      activity: m.presence?.activities?.find(a => a.type !== 4)?.name || null,
      roles: m.roles.cache.filter(r => r.name !== '@everyone').sort((a,b) => b.position - a.position)
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
      joinedAt: m.joinedAt?.toISOString() || null,
    }));
    res.json({ members: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/channels-full/:guildId', requireAuth, (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const typeMap = { 0: 'text', 2: 'voice', 5: 'announcement', 13: 'stage', 15: 'forum' };
    const categories = new Map();
    guild.channels.cache.filter(c => c.type === 4).sort((a,b) => a.position - b.position)
      .forEach(cat => categories.set(cat.id, { id: cat.id, name: cat.name, channels: [], position: cat.position }));
    const uncategorized = [];
    guild.channels.cache.filter(c => [0,2,5,13,15].includes(c.type)).sort((a,b) => a.position - b.position)
      .forEach(ch => {
        const d = {
          id: ch.id, name: ch.name, type: typeMap[ch.type] || 'text',
          position: ch.position, topic: ch.topic || null, nsfw: ch.nsfw || false,
          userLimit: ch.userLimit || null,
          voiceMembers: ch.type === 2 ? [...(ch.members?.values() || [])].map(m => ({
            id: m.id, displayName: m.displayName,
            avatar: m.user.displayAvatarURL({ size: 32, forceStatic: true }),
            muted: m.voice?.selfMute || false, deafened: m.voice?.selfDeaf || false,
          })) : null,
        };
        const cat = ch.parentId ? categories.get(ch.parentId) : null;
        if (cat) cat.channels.push(d); else uncategorized.push(d);
      });
    res.json({ categories: [...categories.values()].filter(c => c.channels.length > 0), uncategorized });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/roles/:guildId', requireAuth, (req, res) => {
  try {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const roles = guild.roles.cache.filter(r => r.name !== '@everyone').sort((a,b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position, memberCount: r.members?.size || 0 }));
    res.json({ roles });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE for real-time updates
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  const token = req.headers['x-dashboard-token'] || req.query.token;
  if (token !== DASHBOARD_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const hb = setInterval(() => { try { res.write(':\n\n'); } catch {} }, 20000);
  sseClients.add(res);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
});

function pushSSE(event, data) {
  if (sseClients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => {
    try { c.write(payload); } catch {}
  });
}

export function attachClientEvents() {
  client.on('messageCreate', async (msg) => {
    if (msg.guild || sseClients.size === 0) return;
  });
  client.on('messageCreate', async (msg) => {
    if (!msg.guild || sseClients.size === 0) return;
    try {
      const formatted = await formatMessage(msg, client.user?.id);
      pushSSE('message', { channelId: msg.channelId, guildId: msg.guildId, message: formatted });
    } catch {}
  });

  client.on('messageDelete', (msg) => {
    if (!msg.guild) return;
    pushSSE('messageDelete', { id: msg.id, channelId: msg.channelId, guildId: msg.guildId });
  });

  client.on('typingStart', (typing) => {
    if (!typing.guild) return;
    pushSSE('typing', {
      channelId: typing.channel?.id, guildId: typing.guild?.id,
      userId: typing.user?.id, username: typing.user?.username,
      displayName: typing.member?.displayName || typing.user?.username,
    });
  });

  client.on('presenceUpdate', (oldP, newP) => {
    if (!newP?.guild) return;
    pushSSE('presence', {
      userId: newP.userId, guildId: newP.guild?.id,
      status: newP.status || 'offline',
      activity: newP.activities?.find(a => a.type !== 4)?.name || null,
    });
  });
}

// ---

app.get(/^\/(?!api\/|healthz|_health).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Dashboard running on port ${PORT}`);
});
