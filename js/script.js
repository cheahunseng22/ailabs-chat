/**
 * AI CHAT APPLICATION
 * Features: Real streaming, Copy buttons, Markdown, Chat History, Stop Generation
 */

import { fetchAIResponse } from './api/api.js';

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

// Custom renderer for code blocks with copy button
const renderer = new marked.Renderer();
renderer.code = function(code, language) {
    const lang = language || 'code';
    const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    return `
<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="code-block-lang">${lang}</span>
    <button class="copy-btn" onclick="copyCode(this)" data-code="${escaped}">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      <span>Copy</span>
    </button>
  </div>
  <pre><code class="language-${lang}">${escaped}</code></pre>
</div>`;
};
marked.use({ renderer });

// Global copy function
window.copyCode = function(btn) {
    const code = btn.getAttribute('data-code')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
    navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied');
        btn.querySelector('span').textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('span').textContent = 'Copy';
        }, 2000);
    }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.classList.add('copied');
        btn.querySelector('span').textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('span').textContent = 'Copy';
        }, 2000);
    });
};

class AIChatApp {
    constructor() {
        this.messagesContainer = document.getElementById('messagesContainer');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearChatBtn');
        this.stopBtn = document.getElementById('stopBtn');

        this.isStreaming = false;
        this.currentChatId = null;
        this.chats = [];
        this.currentStreamingBubble = null;
        this.isStopped = false;
        this.streamingTimeout = null;
        this._abortController = null;

        this.loadChatsFromStorage();
        this.initEventListeners();
        this.setupChatHistoryUI();
        this.restoreOrCreateChat();
window.addEventListener('beforeunload', () => this.saveCurrentChat());
        this.userInput.focus();
    }

    initEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.stopBtn.addEventListener('click', () => this.stopGeneration());

        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto';
            this.userInput.style.height = Math.min(this.userInput.scrollHeight, 160) + 'px';
        });

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.createNewChat());
        }
    }

    stopGeneration() {
        if (!this.isStreaming) return;

        stopAIResponse();

        if (this.streamingTimeout) {
            clearTimeout(this.streamingTimeout);
            this.streamingTimeout = null;
        }

        this.isStopped = true;

        if (this.currentStreamingBubble) {
            this.currentStreamingBubble.classList.remove('streaming-cursor');
            const currentText = this.currentStreamingBubble.innerHTML;
            if (!currentText.includes('stopped')) {
                this.currentStreamingBubble.innerHTML = currentText + ' <span style="opacity:0.6;font-size:0.8em;">[stopped]</span>';
            }
        }

        this.isStreaming = false;
        this.currentStreamingBubble = null;
        this.hideStopButton();
        this.setInputState(true);
        this.saveCurrentChat();
        this.userInput.focus();
    }

    showStopButton() {
        this.stopBtn.style.display = 'flex';
        this.sendBtn.style.display = 'none';
    }

    hideStopButton() {
        this.stopBtn.style.display = 'none';
        this.sendBtn.style.display = 'flex';
    }

    setupChatHistoryUI() {
        const toggleBtn = document.getElementById('toggleHistoryBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const historyList = document.getElementById('chatHistoryList');
                if (historyList) {
                    const isHidden = historyList.style.display === 'none';
                    historyList.style.display = isHidden ? 'flex' : 'none';
                    toggleBtn.textContent = isHidden ? '▼' : '▶';
                }
            });
        }
        this.renderChatHistory();
    }

    renderChatHistory() {
        const historyList = document.getElementById('chatHistoryList');
        if (!historyList) return;

        if (this.chats.length === 0) {
            historyList.innerHTML = '<div class="empty-history">No saved chats yet</div>';
            return;
        }

        historyList.innerHTML = this.chats.map(chat => `
            <div class="history-item ${this.currentChatId === chat.id ? 'active' : ''}" data-chat-id="${chat.id}">
                <div class="history-preview">
                    <span class="history-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></span>
                    <div class="history-info">
                        <div class="history-title">${this.escapeHtml(chat.title)}</div>
                        <div class="history-date">${this.formatDate(chat.updatedAt)}</div>
                    </div>
                </div>
               <button class="delete-chat-btn" data-chat-id="${chat.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
                </button>
            </div>
        `).join('');

        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-chat-btn')) return;
                this.loadChat(item.dataset.chatId);
            });
        });

document.querySelectorAll('.delete-chat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        e.stopImmediatePropagation();
        this.showDeleteConfirm(btn.dataset.chatId);
    });
});
    }

    createNewChat() {
        if (this.isStreaming) this.stopGeneration();
        if (this.currentChatId && this.hasMessages()) this.saveCurrentChat();

        this.currentChatId = Date.now().toString();
        this.clearMessagesContainer();
        this.showWelcomeMessage();
        this.renderChatHistory();
        this.setInputState(true);
        this.userInput.focus();
        this.currentChatId = Date.now().toString();
localStorage.setItem('ai_current_chat_id', this.currentChatId); // ✅ add this
    }

    restoreOrCreateChat() {
    const lastChatId = localStorage.getItem('ai_current_chat_id');
    const lastChat = lastChatId ? this.chats.find(c => c.id === lastChatId) : null;

    if (lastChat) {
        this.currentChatId = lastChat.id;
        this.clearMessagesContainer();
        this.removeWelcomeMessage();
        lastChat.messages.forEach(msg => this.renderMessage(msg.text, msg.sender));
        this.renderChatHistory();
        this.scrollToBottom();
        this.setInputState(true);
    } else {
        this.createNewChat();
    }
}

loadChat(chatId) {
    if (this.isStreaming) this.stopGeneration();
    if (this.currentChatId && this.hasMessages()) this.saveCurrentChat();

    const chat = this.chats.find(c => c.id === chatId);
    if (!chat) return;

    this.currentChatId = chat.id;
    this.clearMessagesContainer();
    this.currentChatId = chat.id;
localStorage.setItem('ai_current_chat_id', this.currentChatId); // ✅ add this
    this.removeWelcomeMessage(); // ✅ ADD THIS - remove welcome screen
    chat.messages.forEach(msg => this.renderMessage(msg.text, msg.sender));
    this.renderChatHistory();
    this.scrollToBottom();
    this.setInputState(true);
}

    showDeleteConfirm(chatId) {
        const existing = document.getElementById('deletePopup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'deletePopup';
        popup.innerHTML = `
            <div class="delete-overlay">
                <div class="delete-dialog">
                    <div class="delete-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg></div>
                    <h4>Delete Conversation?</h4>
                    <p>This action cannot be undone.</p>
                    <div class="delete-actions">
                        <button class="btn-cancel" id="cancelDelete">Cancel</button>
                        <button class="btn-confirm" id="confirmDelete">Delete</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(popup);

        document.getElementById('cancelDelete').addEventListener('click', () => popup.remove());
        document.getElementById('confirmDelete').addEventListener('click', () => {
            popup.remove();
            const index = this.chats.findIndex(c => c.id === chatId);
            if (index !== -1) {
                this.chats.splice(index, 1);
                this.saveChatsToStorage();
                if (this.currentChatId === chatId) {
                    this.currentChatId = null;
                    this.clearMessagesContainer();
                    this.showWelcomeMessage();
                }
                this.renderChatHistory();
            }
        });
        popup.querySelector('.delete-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-overlay')) popup.remove();
        });
    }

    saveCurrentChat() {
        if (!this.currentChatId) return;
        const messages = this.getCurrentMessages();
        if (messages.length === 0) return;

        const existingIndex = this.chats.findIndex(c => c.id === this.currentChatId);
        const firstUserMsg = messages.find(m => m.sender === 'user');
        const title = firstUserMsg
            ? firstUserMsg.text.slice(0, 40) + (firstUserMsg.text.length > 40 ? '...' : '')
            : 'New Chat';

        const chatData = {
            id: this.currentChatId, title,
            messages,
            createdAt: existingIndex !== -1 ? this.chats[existingIndex].createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingIndex !== -1) {
            this.chats[existingIndex] = chatData;
        } else {
            this.chats.unshift(chatData);
        }

        if (this.chats.length > 50) this.chats = this.chats.slice(0, 50);
        this.saveChatsToStorage();
        this.renderChatHistory();
    }

    getCurrentMessages() {
        const messages = [];
        this.messagesContainer.querySelectorAll('.message').forEach(el => {
            const sender = el.classList.contains('user') ? 'user' : 'ai';
            const bubble = el.querySelector('.message-bubble');
            if (bubble && !el.closest('.welcome-message')) {
                let text = bubble.textContent.replace('[stopped]', '').trim();
                if (text) messages.push({ text, sender });
            }
        });
        return messages;
    }

    hasMessages() {
        return this.messagesContainer.querySelectorAll('.message:not(.welcome-message)').length > 0;
    }

    clearMessagesContainer() {
        this.messagesContainer.querySelectorAll('.message').forEach(msg => msg.remove());
    }

    showWelcomeMessage() {
        const existing = this.messagesContainer.querySelector('.welcome-message');
        if (existing) existing.remove();

        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.innerHTML = `
            <div class="welcome-icon"><i data-lucide="message-circle"></i></div>
            <h3>Streaming AI Chat</h3>
            <p>Ask me anything — responses stream in real time.<br>Click <strong>Stop Generating</strong> to interrupt anytime!</p>
            <div class="example-prompts">
                <button class="example-btn" data-prompt="Tell me a short story about a robot">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                    Story
                </button>
                <button class="example-btn" data-prompt="Explain quantum computing simply">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
                    Quantum
                </button>
                <button class="example-btn" data-prompt="Write a Python function to sort a list">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    Code
                </button>
            </div>`;
        this.messagesContainer.appendChild(welcomeDiv);
        lucide.createIcons();

        welcomeDiv.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.getAttribute('data-prompt');
                if (prompt) {
                    this.userInput.value = prompt;
                    this.sendMessage();
                }
            });
        });
    }

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message || this.isStreaming) return;

        this.removeWelcomeMessage();
        this.renderMessage(message, 'user');
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        this.setInputState(false);
        this.showStopButton();
        this.saveCurrentChat();

        const { bubbleElement } = this.createAIPlaceholder();
        this.currentStreamingBubble = bubbleElement;
        this.isStopped = false;
        this.isStreaming = true;

        try {
            bubbleElement.innerHTML = '';
            let fullText = '';
            

let lastRender = 0;

await fetchAIResponse(message, this.getCurrentMessages(), (chunk) => {
    if (this.isStopped) return;

    fullText += chunk;

    const now = Date.now();

    // update screen every 50ms
    if (now - lastRender > 50) {
        bubbleElement.textContent = fullText;
        lastRender = now;
    }
});

if (!this.isStopped) {
                bubbleElement.innerHTML = marked.parse(fullText);
                bubbleElement.classList.remove('streaming-cursor');
                this.isStreaming = false;
                this.saveCurrentChat();
                this.hideStopButton();
                this.setInputState(true);
                this.userInput.focus();
            }
        } catch (err) {
            bubbleElement.innerHTML = '<span style="color:#f87171;">Failed to reach API. Please try again.</span>';
            bubbleElement.classList.remove('streaming-cursor');
            console.error(err);
            this.isStreaming = false;
        }

if (this.isStopped) {
        this.hideStopButton();
        this.setInputState(true);
        this.userInput.focus();
    }
    }

createAIPlaceholder() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<i data-lucide="bot"></i>';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble streaming-cursor';

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
    this.messagesContainer.appendChild(messageDiv); // ✅ Append first

    lucide.createIcons({ nodes: [avatar] }); // ✅ Then create icons

    this.scrollToBottom();
    return { bubbleElement: bubble };
}

renderMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'user' ? '<i data-lucide="user"></i>' : '<i data-lucide="bot"></i>';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = sender === 'user' ? this.escapeHtml(text) : marked.parse(text);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
    this.messagesContainer.appendChild(messageDiv); // ✅ Append first
    lucide.createIcons({ nodes: [avatar] });         // ✅ Then icons
    this.scrollToBottom();
}

    removeWelcomeMessage() {
        const welcome = this.messagesContainer.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }

    setInputState(enabled) {
        this.userInput.disabled = !enabled;
        this.sendBtn.disabled = !enabled;
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    saveChatsToStorage() {
        localStorage.setItem('ai_chats', JSON.stringify(this.chats));
    }

    loadChatsFromStorage() {
        try {
            const saved = localStorage.getItem('ai_chats');
            this.chats = saved ? JSON.parse(saved) : [];
        } catch { this.chats = []; }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new AIChatApp();
});

// Mobile menu
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const sidebar = document.querySelector('.sidebar');
const body = document.body;

let overlay = document.querySelector('.sidebar-overlay');
if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
}

function isMobile() { return window.innerWidth <= 800; }

function toggleSidebar() {
    if (isMobile()) {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('active');
        body.classList.toggle('menu-open');
    }
}

function closeSidebar() {
    if (isMobile()) {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        body.classList.remove('menu-open');
    }
}

function handleResize() {
    if (!isMobile()) {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        body.classList.remove('menu-open');
        sidebar.style.transform = '';
    } else {
        sidebar.classList.remove('mobile-open');
        body.classList.remove('menu-open');
    }
}

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', toggleSidebar);
}

overlay.addEventListener('click', closeSidebar);
window.addEventListener('resize', handleResize);
handleResize();
// ✅ Close when clicking outside sidebar
document.addEventListener('click', (e) => {
    if (!isMobile()) return;
    if (!sidebar.classList.contains('mobile-open')) return;
    
    // If click is outside sidebar AND not the toggle button, close
    if (!sidebar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
        closeSidebar();
    }
});