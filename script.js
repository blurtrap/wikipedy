// Конфигурация API
const API_BASE_URL = window.location.origin;
const USE_API = true; // Использовать API сервер или localStorage

// Ключ для localStorage (fallback)
const STORAGE_KEY = 'wiki_articles';
const ADMIN_PASSWORD_STORAGE_KEY = 'wiki_admin_password';

function normalizeTitleFromUrlParam(value) {
    if (typeof value !== 'string') return value;
    // URLSearchParams обычно уже декодирует, но если раньше было двойное кодирование,
    // сюда прилетает строка вида "%D0%BF%D0..." — попробуем декодировать ещё раз.
    try {
        if (/%[0-9A-Fa-f]{2}/.test(value)) return decodeURIComponent(value);
    } catch (_) {
        // ignore
    }
    return value;
}

// Проверка доступности API
async function checkApiAvailable() {
    if (!USE_API) return false;
    try {
        const response = await fetch(`${API_BASE_URL}/api/articles`);
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Получить (и при необходимости спросить) пароль администратора
async function getAdminPasswordInteractive() {
    let pwd = sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY);
    if (pwd) return pwd;

    // Просим пароль у пользователя
    pwd = window.prompt('Введите пароль администратора (для сохранения/удаления статей):');
    if (!pwd) {
        throw new Error('Пароль администратора не введён');
    }
    sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, pwd);
    return pwd;
}

// Получить все статьи
async function getAllArticles() {
    const apiAvailable = await checkApiAvailable();
    
    if (apiAvailable) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/articles`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Ошибка API:', error);
        }
    }
    
    // Fallback на localStorage
    const articles = localStorage.getItem(STORAGE_KEY);
    return articles ? JSON.parse(articles) : [];
}

// Найти статью по названию
async function findArticle(title) {
    const apiAvailable = await checkApiAvailable();
    
    if (apiAvailable) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/articles/${encodeURIComponent(title)}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Ошибка API:', error);
        }
    }
    
    // Fallback на localStorage
    const articles = await getAllArticles();
    return articles.find(a => a.title.toLowerCase() === title.toLowerCase());
}

// Сохранить статью (упрощенная версия)
async function saveArticle(title, content, author = 'user') {
    const apiAvailable = await checkApiAvailable();
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();

    // Важно: при редактировании не перезатираем createdAt
    let createdAt = new Date().toISOString();
    try {
        const existing = await findArticle(normalizedTitle);
        if (existing?.createdAt) createdAt = existing.createdAt;
    } catch (_) {
        // ignore
    }

    const article = {
        title: normalizedTitle,
        content: normalizedContent,
        author: author,
        createdAt,
        updatedAt: new Date().toISOString()
    };
    
    if (apiAvailable) {
        try {
            const adminPassword = await getAdminPasswordInteractive();
            const response = await fetch(`${API_BASE_URL}/api/articles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Password': adminPassword
                },
                body: JSON.stringify(article)
            });
            
            if (response.ok) {
                return true;
            } else if (response.status === 401) {
                // Сбросим пароль и покажем ошибку
                sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
                alert('Неверный пароль администратора. Попробуйте ещё раз.');
                return false;
            }
        } catch (error) {
            console.error('Ошибка API:', error);
        }
    }
    
    // Fallback на localStorage
    const articles = await getAllArticles();
    const index = articles.findIndex(a => a.title.toLowerCase() === title.toLowerCase());
    
    if (index !== -1) {
        articles[index] = { ...articles[index], ...article };
    } else {
        articles.push(article);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    return true;
}

// Удалить статью
async function deleteArticle(title) {
    const apiAvailable = await checkApiAvailable();
    
    if (apiAvailable) {
        try {
            const adminPassword = await getAdminPasswordInteractive();
            const response = await fetch(`${API_BASE_URL}/api/articles/${encodeURIComponent(title)}`, {
                method: 'DELETE',
                headers: {
                    'X-Admin-Password': adminPassword
                }
            });
            if (response.ok) {
                return true;
            } else if (response.status === 401) {
                sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
                alert('Неверный пароль администратора. Удаление запрещено.');
                return false;
            }
        } catch (error) {
            console.error('Ошибка API:', error);
        }
    }
    
    // Fallback на localStorage
    const articles = await getAllArticles();
    const filtered = articles.filter(a => a.title.toLowerCase() !== title.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
}

// Форматирование текста с вики-ссылками и улучшенным форматированием
function formatWikiText(text) {
    // Экранируем HTML
    let formatted = text.replace(/[&<>"]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
    
    // Заголовки
    formatted = formatted.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.*?)$/gm, '<h2>$1</h2>');
    
    // Жирный текст
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Курсив
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Вики-ссылки [[Название]]
    formatted = formatted.replace(/\[\[(.*?)\]\]/g, function(match, title) {
        // Передаём "сырое" значение, кодирование делаем только в viewArticle()
        return `<a href="#" onclick='viewArticle(${JSON.stringify(title)}); return false;' class="wiki-link">${title}</a>`;
    });
    
    // Разделение на абзацы
    formatted = formatted.split('\n\n').map(para => {
        if (para.trim() && !para.match(/^<[h|a]/)) {
            return `<p>${para.replace(/\n/g, '<br>')}</p>`;
        }
        return para.replace(/\n/g, '<br>');
    }).join('');
    
    // Списки
    formatted = formatted.replace(/^\- (.*?)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return formatted;
}

// Функции для навигации
function viewArticle(title) {
    window.location.href = `article.html?title=${encodeURIComponent(title)}`;
}

function editArticle(title) {
    window.location.href = `edit.html?title=${encodeURIComponent(title)}`;
}

// Автосохранение (debounce)
let autoSaveTimeout;
function autoSave(title, content) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        const autoSaveIndicator = document.getElementById('autoSaveIndicator');
        if (autoSaveIndicator) {
            autoSaveIndicator.textContent = '💾 Сохранение...';
            autoSaveIndicator.style.opacity = '1';
        }
        
        saveArticle(title, content).then(() => {
            if (autoSaveIndicator) {
                autoSaveIndicator.textContent = '✓ Автосохранено';
                setTimeout(() => {
                    autoSaveIndicator.style.opacity = '0';
                }, 2000);
            }
        });
    }, 2000);
}

// Инициализация главной страницы
async function initIndexPage() {
    const articlesList = document.getElementById('articlesList');
    
    if (articlesList) {
        articlesList.innerHTML = '<div class="loading">Загрузка статей...</div>';
        
        try {
            const articles = await getAllArticles();
            
            if (articles.length === 0) {
                articlesList.innerHTML = '<div class="empty-state"><p class="empty-message">Нажмите кнопку "➕Создать новую историю/смехуятинку" выше, чтобы создать пост.</p></div>';
            } else {
                let html = '<div class="articles-grid">';
                articles.sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                    const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                    return dateB - dateA;
                });
                
                articles.forEach(article => {
                    const preview = article.content.substring(0, 150).replace(/\n/g, ' ').replace(/\[\[.*?\]\]/g, '') + '...';
                    const date = article.createdAt ? new Date(article.createdAt).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }) : 'Недавно';
                    
                    html += `
                        <div class="article-card">
                            <h3><a href="#" onclick='viewArticle(${JSON.stringify(article.title)}); return false;'>${article.title}</a></h3>
                            <p class="article-preview">${preview}</p>
                            <div class="article-meta">
                                <span class="article-date">📅 ${date}</span>
                                <div class="article-actions">
                                    <a href="#" onclick='editArticle(${JSON.stringify(article.title)}); return false;' class="edit-link">✏️ Редактировать</a>
                                    <a href="#" onclick='if(confirm("Удалить статью?")) deleteArticleAndReload(${JSON.stringify(article.title)}); return false;' class="delete-link">🗑️</a>
                                </div>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                articlesList.innerHTML = html;
            }
        } catch (error) {
            articlesList.innerHTML = '<div class="error">Ошибка загрузки статей. Попробуйте обновить страницу.</div>';
        }
    }
    
    // Улучшенный поиск с фильтрацией
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    
    if (searchForm) {
        searchForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const searchTerm = searchInput.value.trim();
            if (searchTerm) {
                const article = await findArticle(searchTerm);
                if (article) {
                    viewArticle(searchTerm);
                } else {
                    if (confirm(`Статья "${searchTerm}" не найдена. Создать её?`)) {
                        editArticle(searchTerm);
                    }
                }
            }
        });
    }
    
    // Поиск в реальном времени
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            const term = this.value.trim().toLowerCase();
            
            if (term.length > 0) {
                searchTimeout = setTimeout(async () => {
                    const articles = await getAllArticles();
                    const filtered = articles.filter(a => 
                        a.title.toLowerCase().includes(term) || 
                        a.content.toLowerCase().includes(term)
                    );
                    
                    const articlesList = document.getElementById('articlesList');
                    if (articlesList && filtered.length > 0) {
                        let html = '<div class="articles-grid">';
                        filtered.forEach(article => {
                            const preview = article.content.substring(0, 150).replace(/\n/g, ' ') + '...';
                            html += `
                                <div class="article-card">
                                    <h3><a href="#" onclick='viewArticle(${JSON.stringify(article.title)}); return false;'>${article.title}</a></h3>
                                    <p class="article-preview">${preview}</p>
                                </div>
                            `;
                        });
                        html += '</div>';
                        articlesList.innerHTML = html;
                    }
                }, 300);
            } else {
                initIndexPage();
            }
        });
    }
}

// Удалить статью и перезагрузить
async function deleteArticleAndReload(title) {
    await deleteArticle(title);
    initIndexPage();
}

// Инициализация страницы статьи
async function initArticlePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const title = normalizeTitleFromUrlParam(urlParams.get('title'));
    
    const articleContent = document.getElementById('articleContent');
    const editLink = document.getElementById('editLink');
    
    if (!title) {
        window.location.href = 'index.html';
        return;
    }
    
    if (editLink) {
        editLink.href = `edit.html?title=${encodeURIComponent(title)}`;
    }
    
    articleContent.innerHTML = '<div class="loading">Загрузка статьи...</div>';
    
    const article = await findArticle(title);
    
    if (article) {
        document.title = `${article.title} - Моя Википедия`;
        
        const date = article.createdAt ? new Date(article.createdAt).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'Недавно';
        
        let html = `
            <h2>${article.title}</h2>
            <div class="wiki-content">
                ${formatWikiText(article.content)}
            </div>
            <div class="page-info">
                <p>📅 Создано: ${date}</p>
                ${article.author ? `<p>👤 Автор: ${article.author}</p>` : ''}
            </div>
        `;
        
        articleContent.innerHTML = html;
    } else {
        articleContent.innerHTML = `
            <div class="empty-state">
                <h2>Страница не найдена</h2>
                <p>Статья "${title}" пока не создана.</p>
                <a href="edit.html?title=${encodeURIComponent(title)}" class="btn-create">Создать эту статью</a>
            </div>
        `;
    }
}

// Инициализация страницы редактирования (упрощенная)
async function initEditPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const title = normalizeTitleFromUrlParam(urlParams.get('title'));
    
    const editTitle = document.getElementById('editTitle');
    const pageTitle = document.getElementById('pageTitle');
    const pageContent = document.getElementById('pageContent');
    const viewLink = document.getElementById('viewLink');
    const errorDiv = document.getElementById('error');
    
    // Добавляем индикатор автосохранения
    if (!document.getElementById('autoSaveIndicator')) {
        const autoSaveDiv = document.createElement('div');
        autoSaveDiv.id = 'autoSaveIndicator';
        autoSaveDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: rgba(99, 102, 241, 0.9); color: white; border-radius: 10px; opacity: 0; transition: opacity 0.3s; z-index: 1000;';
        document.body.appendChild(autoSaveDiv);
    }
    
    if (title) {
        editTitle.textContent = `Редактирование: ${title}`;
        pageTitle.value = title;
        pageTitle.readOnly = true;
        
        if (viewLink) {
            viewLink.style.display = 'inline';
            viewLink.href = `article.html?title=${encodeURIComponent(title)}`;
        }
        
        const article = await findArticle(title);
        if (article) {
            pageContent.value = article.content;
        }
    } else {
        editTitle.textContent = 'Создание новой статьи';
        if (viewLink) {
            viewLink.style.display = 'none';
        }
    }
    
    // Автосохранение при вводе
    if (pageContent) {
        pageContent.addEventListener('input', function() {
            if (pageTitle.value.trim()) {
                autoSave(pageTitle.value.trim(), this.value);
            }
        });
    }
    
    // Обработка формы (упрощенная - просто сохранить)
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const newTitle = pageTitle.value.trim();
            const newContent = pageContent.value.trim();
            
            if (!newTitle || !newContent) {
                errorDiv.textContent = 'Заполните все поля!';
                errorDiv.style.display = 'block';
                return;
            }
            
            errorDiv.style.display = 'none';
            const success = await saveArticle(newTitle, newContent);
            
            if (success) {
                window.location.href = `article.html?title=${encodeURIComponent(newTitle)}`;
            } else {
                errorDiv.textContent = 'Ошибка сохранения статьи!';
                errorDiv.style.display = 'block';
            }
        });
    }
}

// Запуск соответствующей инициализации
document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname;
    
    if (path.includes('article.html')) {
        initArticlePage();
    } else if (path.includes('edit.html')) {
        initEditPage();
    } else {
        initIndexPage();
    }
});

function adminLogin() {
  const pass = prompt("Введите пароль админа");

  if (pass === "119900") {
    localStorage.setItem("isAdmin", "true");
    alert("Вы вошли как админ");
    location.reload();
  } else {
    alert("Неверный пароль");
  }
}

function isAdmin() {
  return localStorage.getItem("isAdmin") === "true";
}

function logoutAdmin() {
  localStorage.removeItem("isAdmin");
  location.reload();
}

const ADMIN_PASSWORD = "119900";

function adminLogin() {

  if (localStorage.getItem("isAdmin") === "true") {
    alert("Вы уже вошли как админ");
    return;
  }

  const pass = prompt("Введите пароль админа");

  if (pass === ADMIN_PASSWORD) {
    localStorage.setItem("isAdmin", "true");
    updateAdminButtons();
    alert("Вы вошли как админ");
  } else {
    alert("Неверный пароль");
  }
}

function logoutAdmin() {
  localStorage.removeItem("isAdmin");
  updateAdminButtons();
}

function updateAdminButtons() {

  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (localStorage.getItem("isAdmin") === "true") {
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
  } else {
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
  }

}

document.addEventListener("DOMContentLoaded", updateAdminButtons);