/**
 * AI CHAT - Minimal rewrite, same features
 * Streaming, Markdown, Chat History, Stop, Mobile sidebar
 */
import { fetchAIResponse, stopAIResponse } from './api/api.js';

marked.setOptions({ breaks: true, gfm: true });

// Code blocks with copy button
const renderer = new marked.Renderer();
renderer.code = (code, lang) => {
    lang = lang || 'code';
    const esc = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-block-lang">${lang}</span><button class="copy-btn" onclick="copyCode(this)" data-code="${esc}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span></button></div><pre><code class="language-${lang}">${esc}</code></pre></div>`;
};
marked.use({ renderer });

window.copyCode = (btn) => {
    const code = btn.dataset.code.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
    navigator.clipboard.writeText(code).catch(() => { const t=document.createElement('textarea');t.value=code;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t); });
    btn.classList.add('copied'); btn.querySelector('span').textContent='Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('span').textContent='Copy'; }, 2000);
};

// ── Storage helpers ──────────────────────────────────────────────
const store = {
    get: (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
    set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ── App ──────────────────────────────────────────────────────────
class Chat {
    constructor() {
        this.$ = id => document.getElementById(id);
        this.msgs  = this.$('messagesContainer');
        this.input = this.$('userInput');
        this.send  = this.$('sendBtn');
        this.stop  = this.$('stopBtn');
        this.chats = store.get('ai_chats', []);
        this.chatId = null;
        this.streaming = false;
        this.stopped = false;
        this.bubble = null;
        this.lastScroll = 0;
        this.init();
    }

    init() {
        this.send.onclick = () => this.sendMsg();
        this.stop.onclick = () => this.stopStream();
        this.$('clearChatBtn').onclick = () => this.newChat();
        this.input.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); this.sendMsg(); } });
        this.input.addEventListener('input', () => { this.input.style.height='auto'; this.input.style.height=Math.min(this.input.scrollHeight,160)+'px'; });
        this.$('toggleHistoryBtn')?.addEventListener('click', () => { const l=this.$('chatHistoryList'); l.style.display=l.style.display==='none'?'flex':'none'; });
        window.addEventListener('beforeunload', () => this.save());
        this.restoreOrNew();
        this.renderHistory();
        this.initMobile();
    }

    // ── Chat CRUD ────────────────────────────────────────────────
newChat() {
    if (this.streaming) this.stopStream();
    if (this.chatId) this.save();
    this.chatId = Date.now().toString();
    store.set('ai_current_chat_id', this.chatId);
    sessionStorage.setItem('ai_session_active', 'true');
    this.msgs.innerHTML = '';
    this.showWelcome();
    this.renderHistory();
    this.input.focus();
}

restoreOrNew() {
    // Check if this is a fresh session (browser just opened)
    const isFreshSession = !sessionStorage.getItem('ai_session_active');
    
    if (isFreshSession) {
        // First visit this session — start with new chat
        sessionStorage.setItem('ai_session_active', 'true');
        this.newChat();
        return;
    }
    
    // Normal page refresh during same session — restore current chat
    const id = store.get('ai_current_chat_id', null);
    const chat = id && this.chats.find(c => c.id === id);
    if (chat) { 
        this.chatId = chat.id; 
        this.msgs.innerHTML = ''; 
        chat.messages.forEach(m => this.render(m.text, m.sender)); 
        this.scrollBottom(true);
    } 
    else { 
        this.newChat(); 
    }
    this.renderHistory();
}

    loadChat(id) {
        if (this.streaming) this.stopStream();
        this.save();
        const chat = this.chats.find(c => c.id === id);
        if (!chat) return;
        this.chatId = id;
        store.set('ai_current_chat_id', id);
        this.msgs.innerHTML = '';
        chat.messages.forEach(m => this.render(m.text, m.sender));
        this.renderHistory();
        this.scrollBottom(true);
    }

    save() {
        if (!this.chatId) return;
        const messages = [...this.msgs.querySelectorAll('.message')].map(el => ({
            sender: el.classList.contains('user') ? 'user' : 'ai',
            text: el.querySelector('.message-bubble')?.textContent.replace('[stopped]','').trim() || ''
        })).filter(m => m.text);
        if (!messages.length) return;
        const title = messages.find(m=>m.sender==='user')?.text.slice(0,40) || 'New Chat';
        const idx = this.chats.findIndex(c => c.id === this.chatId);
        const data = { id: this.chatId, title, messages, updatedAt: new Date().toISOString(), createdAt: idx>=0 ? this.chats[idx].createdAt : new Date().toISOString() };
        if (idx >= 0) this.chats[idx] = data; else this.chats.unshift(data);
        if (this.chats.length > 50) this.chats = this.chats.slice(0, 50);
        store.set('ai_chats', this.chats);
        this.renderHistory();
    }

    deleteChat(id) {
        const popup = document.createElement('div');
        popup.id = 'deletePopup';
        popup.innerHTML = `<div class="delete-overlay"><div class="delete-dialog"><div class="delete-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg></div><h4>Delete Conversation?</h4><p>This action cannot be undone.</p><div class="delete-actions"><button class="btn-cancel" id="cancelDelete">Cancel</button><button class="btn-confirm" id="confirmDelete">Delete</button></div></div></div>`;
        document.body.appendChild(popup);
        popup.querySelector('#cancelDelete').onclick = () => popup.remove();
        popup.querySelector('#confirmDelete').onclick = () => {
            popup.remove();
            this.chats = this.chats.filter(c => c.id !== id);
            store.set('ai_chats', this.chats);
            if (this.chatId === id) this.newChat();
            else this.renderHistory();
        };
        popup.querySelector('.delete-overlay').onclick = e => { if (e.target.classList.contains('delete-overlay')) popup.remove(); };
    }

    // ── Rendering ────────────────────────────────────────────────
    render(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        const esc = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
        div.innerHTML = `<div class="message-avatar"><i data-lucide="${sender==='user'?'user':'bot'}"></i></div><div class="message-bubble">${sender==='user'?esc(text):marked.parse(text)}</div>`;
        this.msgs.appendChild(div);
        lucide.createIcons({ nodes: [div.querySelector('.message-avatar')] });
        this.scrollBottom();
    }

    showWelcome() {
        this.msgs.innerHTML = `<div class="welcome-message"><div class="welcome-icon"><i data-lucide="message-circle"></i></div><h3>Streaming AI Chat</h3><p>Ask me anything — responses stream in real time.<br>Click <strong>Stop Generating</strong> to interrupt anytime!</p><div class="example-prompts"><button class="example-btn" data-prompt="Tell me a short story about a robot">Story</button><button class="example-btn" data-prompt="Explain quantum computing simply">Quantum</button><button class="example-btn" data-prompt="Write a Python function to sort a list">Code</button></div></div>`;
        lucide.createIcons();
        this.msgs.querySelectorAll('.example-btn').forEach(btn => btn.onclick = () => { this.input.value=btn.dataset.prompt; this.sendMsg(); });
    }

    renderHistory() {
        const list = this.$('chatHistoryList');
        if (!list) return;
        if (!this.chats.length) { list.innerHTML = '<div class="empty-history">No saved chats yet</div>'; return; }
        const fmt = d => { const diff=Date.now()-new Date(d); const m=Math.floor(diff/60000),h=Math.floor(diff/3600000),dy=Math.floor(diff/86400000); return m<1?'Just now':m<60?`${m}m ago`:h<24?`${h}h ago`:dy<7?`${dy}d ago`:new Date(d).toLocaleDateString(); };
        list.innerHTML = this.chats.map(c => `<div class="history-item${this.chatId===c.id?' active':''}" data-id="${c.id}"><div class="history-preview"><div class="history-info"><div class="history-title">${c.title}</div><div class="history-date">${fmt(c.updatedAt)}</div></div></div><button class="delete-chat-btn" data-id="${c.id}">✕</button></div>`).join('');
        list.querySelectorAll('.history-item').forEach(el => el.onclick = e => { if (!e.target.closest('.delete-chat-btn')) this.loadChat(el.dataset.id); });
        list.querySelectorAll('.delete-chat-btn').forEach(btn => btn.onclick = e => { e.stopPropagation(); this.deleteChat(btn.dataset.id); });
    }

    scrollBottom(force = false) {
        const now = Date.now();
       if (force || now - this.lastScroll > 200) {
            this.lastScroll = now;
            requestAnimationFrame(() => this.msgs.scrollTop = this.msgs.scrollHeight);
        }
    }

    // ── Streaming ────────────────────────────────────────────────
    async sendMsg() {
        const text = this.input.value.trim();
        if (!text || this.streaming) return;
        this.msgs.querySelector('.welcome-message')?.remove();
        this.render(text, 'user');
        this.input.value = ''; this.input.style.height = 'auto';
        this.input.disabled = true; this.send.disabled = true;
        this.stop.style.display='flex'; this.send.style.display='none';
        this.save();

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai';
        msgDiv.innerHTML = '<div class="message-avatar"><i data-lucide="bot"></i></div><div class="message-bubble"></div>';
        this.msgs.appendChild(msgDiv);
        lucide.createIcons({ nodes: [msgDiv.querySelector('.message-avatar')] });
        this.bubble = msgDiv.querySelector('.message-bubble');
        this.streaming = true; this.stopped = false;

        const history = [...this.msgs.querySelectorAll('.message')].slice(0,-1).map(el=>({ sender:el.classList.contains('user')?'user':'ai', text:el.querySelector('.message-bubble')?.textContent||'' }));

        let full = '', lastRender = 0;
        try {
await fetchAIResponse(text, history, chunk => {
    if (this.stopped) return;

    full += chunk;
    const now = Date.now();

    // ✅ Only update UI every ~80ms
    if (now - lastRender > 80) {

        // ✅ FAST: append only new chunk (NOT full re-render)
        this.bubble.insertAdjacentHTML(
            "beforeend",
            marked.parse(chunk)
        );

        lastRender = now;

        // ✅ reduce scroll spam
        this.scrollBottom();
    }
});
if (!this.stopped) {
    // final full render (only once at end)
    this.bubble.innerHTML = marked.parse(full);
    this.save();
}
        } catch(e) {
            this.bubble.innerHTML = '<span style="color:#f87171">Failed to reach API. Try again.</span>';
        }
        this.streaming = false;
        this.stop.style.display='none'; this.send.style.display='flex';
        this.input.disabled=false; this.send.disabled=false;
        this.input.focus();
    }

    stopStream() {
        if (!this.streaming) return;
        stopAIResponse();
        this.stopped = true; this.streaming = false;
        if (this.bubble) { this.bubble.innerHTML += ' <span style="opacity:0.6;font-size:0.8em">[stopped]</span>'; }
        this.stop.style.display='none'; this.send.style.display='flex';
        this.input.disabled=false; this.send.disabled=false;
        this.save(); this.input.focus();
    }

    // ── Mobile sidebar ───────────────────────────────────────────
    initMobile() {
        const toggle = this.$('mobileMenuToggle');
        const sidebar = document.querySelector('.sidebar');
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) { overlay = document.createElement('div'); overlay.className='sidebar-overlay'; document.body.appendChild(overlay); }
        const isMob = () => window.innerWidth <= 800;
        const open = () => { sidebar.classList.add('mobile-open'); overlay.classList.add('active'); document.body.classList.add('menu-open'); };
        const close = () => { sidebar.classList.remove('mobile-open'); overlay.classList.remove('active'); document.body.classList.remove('menu-open'); };
        toggle?.addEventListener('click', () => isMob() && (sidebar.classList.contains('mobile-open') ? close() : open()));
        overlay.addEventListener('click', close);
        document.addEventListener('click', e => { if (!isMob()||!sidebar.classList.contains('mobile-open')) return; if (!sidebar.contains(e.target)&&!toggle?.contains(e.target)) close(); });
        window.addEventListener('resize', () => { if (!isMob()) close(); });
    }
}

document.addEventListener('DOMContentLoaded', () => new Chat());