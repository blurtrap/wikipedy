// Конфигурация
const STORAGE_KEY = 'wiki_posts';
const ADMIN_PASSWORD = '119900';

// ---------------------- Работа с постами ----------------------

// Получаем все посты
async function getAllPosts() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// Сохраняем пост (создание или обновление)
async function savePost(title, content, author = 'user') {
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();
    if (!normalizedTitle || !normalizedContent) return false;

    const posts = await getAllPosts();
    const index = posts.findIndex(p => p.title.toLowerCase() === normalizedTitle.toLowerCase());

    const now = new Date().toISOString();
    const post = {
        title: normalizedTitle,
        content: normalizedContent,
        author,
        createdAt: index !== -1 ? posts[index].createdAt : now,
        updatedAt: now
    };

    if (index !== -1) {
        posts[index] = post;
    } else {
        posts.push(post);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    return true;
}

// Найти пост по названию
async function findPost(title) {
    const posts = await getAllPosts();
    return posts.find(p => p.title.toLowerCase() === title.toLowerCase());
}

// Удалить пост
async function deletePost(title) {
    const posts = await getAllPosts();
    const filtered = posts.filter(p => p.title.toLowerCase() !== title.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
}

// ---------------------- Форматирование ----------------------

function formatWikiText(text) {
    let formatted = text.replace(/[&<>"]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&quot;');

    formatted = formatted.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.*?)$/gm, '<h2>$1</h2>');

    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    formatted = formatted.replace(/\[\[(.*?)\]\]/g, (match, title) => {
        return `<a href="#" onclick='viewPost(${JSON.stringify(title)}); return false;' class="wiki-link">${title}</a>`;
    });

    formatted = formatted.split('\n\n').map(para => {
        if (para.trim() && !para.match(/^<[h|a]/)) return `<p>${para.replace(/\n/g, '<br>')}</p>`;
        return para.replace(/\n/g, '<br>');
    }).join('');

    formatted = formatted.replace(/^\- (.*?)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    return formatted;
}

// ---------------------- Навигация ----------------------

function viewPost(title) {
    window.location.href = `article.html?title=${encodeURIComponent(title)}`;
}

function editPost(title) {
    window.location.href = `edit.html?title=${encodeURIComponent(title)}`;
}

// ---------------------- Автосохранение ----------------------

let autoSaveTimeout;
function autoSave(title, content) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        const autoSaveIndicator = document.getElementById('autoSaveIndicator');
        if (autoSaveIndicator) {
            autoSaveIndicator.textContent = '💾 Сохранение...';
            autoSaveIndicator.style.opacity = '1';
        }

        savePost(title, content).then(() => {
            if (autoSaveIndicator) {
                autoSaveIndicator.textContent = '✓ Автосохранено';
                setTimeout(() => autoSaveIndicator.style.opacity = '0', 2000);
            }
        });
    }, 2000);
}

// ---------------------- Инициализация страниц ----------------------

async function initIndexPage() {
    const articlesList = document.getElementById('articlesList');
    if (!articlesList) return;

    articlesList.innerHTML = '<div class="loading">Загрузка статей...</div>';

    const posts = await getAllPosts();
    if (posts.length === 0) {
        articlesList.innerHTML = '<p>Нажмите "Создать пост" чтобы добавить первую запись.</p>';
        return;
    }

    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let html = '<div class="articles-grid">';
    posts.forEach(post => {
        const preview = post.content.substring(0, 150).replace(/\n/g, ' ').replace(/\[\[.*?\]\]/g, '') + '...';
        const date = post.createdAt ? new Date(post.createdAt).toLocaleDateString('ru-RU') : 'Недавно';

        html += `
            <div class="article-card">
                <h3><a href="#" onclick='viewPost(${JSON.stringify(post.title)}); return false;'>${post.title}</a></h3>
                <p class="article-preview">${preview}</p>
                <div class="article-meta">
                    <span class="article-date">📅 ${date}</span>
                    <div class="article-actions">
                        <a href="#" onclick='editPost(${JSON.stringify(post.title)}); return false;' class="edit-link">✏️ Редактировать</a>
                        <a href="#" onclick='if(confirm("Удалить пост?")) { deletePostAndReload(${JSON.stringify(post.title)}); } return false;' class="delete-link">🗑️</a>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    articlesList.innerHTML = html;

    // Поиск
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', async () => {
            const term = searchInput.value.trim().toLowerCase();
            const filtered = term ? posts.filter(p => p.title.toLowerCase().includes(term) || p.content.toLowerCase().includes(term)) : posts;
            let html = '<div class="articles-grid">';
            filtered.forEach(post => {
                const preview = post.content.substring(0, 150).replace(/\n/g, ' ') + '...';
                html += `<div class="article-card"><h3><a href="#" onclick='viewPost(${JSON.stringify(post.title)}); return false;'>${post.title}</a></h3><p>${preview}</p></div>`;
            });
            html += '</div>';
            articlesList.innerHTML = html;
        });
    }
}

async function deletePostAndReload(title) {
    await deletePost(title);
    initIndexPage();
}

async function initArticlePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get('title');
    const articleContent = document.getElementById('articleContent');
    if (!articleContent || !title) return;

    const post = await findPost(title);
    if (!post) {
        articleContent.innerHTML = `<p>Статья "${title}" не найдена. <a href="edit.html?title=${encodeURIComponent(title)}">Создать её</a></p>`;
        return;
    }

    document.title = `${post.title} - Моя Википедия`;
    const date = post.createdAt ? new Date(post.createdAt).toLocaleDateString('ru-RU') : 'Недавно';
    articleContent.innerHTML = `
        <h2>${post.title}</h2>
        <div class="wiki-content">${formatWikiText(post.content)}</div>
        <p>📅 Создано: ${date}</p>
        ${post.author ? `<p>👤 Автор: ${post.author}</p>` : ''}
    `;
}

async function initEditPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get('title');
    const pageTitle = document.getElementById('pageTitle');
    const pageContent = document.getElementById('pageContent');
    const errorDiv = document.getElementById('error');
    if (!pageTitle || !pageContent) return;

    if (title) {
        pageTitle.value = title;
        pageTitle.readOnly = true;
        const post = await findPost(title);
        if (post) pageContent.value = post.content;
    }

    pageContent.addEventListener('input', () => {
        if (pageTitle.value.trim()) autoSave(pageTitle.value.trim(), pageContent.value);
    });

    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', async e => {
            e.preventDefault();
            const success = await savePost(pageTitle.value.trim(), pageContent.value.trim());
            if (success) viewPost(pageTitle.value.trim());
            else {
                if (errorDiv) {
                    errorDiv.textContent = 'Ошибка сохранения';
                    errorDiv.style.display = 'block';
                }
            }
        });
    }
}

// ---------------------- Админ ----------------------

function isAdmin() {
    return localStorage.getItem('isAdmin') === 'true';
}

function adminLogin() {
    if (isAdmin()) return alert('Вы уже вошли как админ');
    const pass = prompt('Введите пароль админа');
    if (pass === ADMIN_PASSWORD) {
        localStorage.setItem('isAdmin', 'true');
        updateAdminButtons();
        alert('Вы вошли как админ');
    } else alert('Неверный пароль');
}

function logoutAdmin() {
    localStorage.removeItem('isAdmin');
    updateAdminButtons();
}

function updateAdminButtons() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (isAdmin()) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

// ---------------------- Запуск ----------------------

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('article.html')) initArticlePage();
    else if (path.includes('edit.html')) initEditPage();
    else initIndexPage();
    updateAdminButtons();

    if (!document.getElementById('autoSaveIndicator')) {
        const div = document.createElement('div');
        div.id = 'autoSaveIndicator';
        div.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 20px;background:rgba(99,102,241,0.9);color:white;border-radius:10px;opacity:0;transition:opacity 0.3s;z-index:1000;';
        document.body.appendChild(div);
    }
});
