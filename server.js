const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');

const PORT = 3000;
// Пароль администратора: по умолчанию 119900, лучше переопределить через переменную окружения
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '119900';
// Пользовательская просьба: хранить статьи в папке "article"
const ARTICLES_DIR = path.join(__dirname, 'article');
const LEGACY_ARTICLES_DIR = path.join(__dirname, 'articles');

async function pathExists(p) {
    try {
        await fs.stat(p);
        return true;
    } catch (_) {
        return false;
    }
}

// Создаем папку article если её нет (и мигрируем со старого "articles")
async function ensureArticlesDir() {
    try {
        const legacyExists = await pathExists(LEGACY_ARTICLES_DIR);
        const targetExists = await pathExists(ARTICLES_DIR);

        if (legacyExists && !targetExists) {
            // Мягкая миграция: переименуем папку (если возможно)
            await fs.rename(LEGACY_ARTICLES_DIR, ARTICLES_DIR);
        }
        await fs.mkdir(ARTICLES_DIR, { recursive: true });
    } catch (error) {
        console.error('Ошибка создания папки article:', error);
    }
}

// Получить все статьи
async function getAllArticles() {
    try {
        const files = await fs.readdir(ARTICLES_DIR);
        const articles = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(ARTICLES_DIR, file);
                const content = await fs.readFile(filePath, 'utf-8');
                articles.push(JSON.parse(content));
            }
        }
        
        return articles;
    } catch (error) {
        console.error('Ошибка чтения статей:', error);
        return [];
    }
}

// Сохранить статью
async function saveArticle(article) {
    try {
        const fileName = article.title.toLowerCase()
            .replace(/[^a-zа-яё0-9\s]/g, '')
            .replace(/\s+/g, '_') + '.json';
        const filePath = path.join(ARTICLES_DIR, fileName);
        
        article.updatedAt = new Date().toISOString();
        if (!article.createdAt) {
            article.createdAt = new Date().toISOString();
        }
        
        await fs.writeFile(filePath, JSON.stringify(article, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error('Ошибка сохранения статьи:', error);
        return false;
    }
}

// Удалить статью
async function deleteArticle(title) {
    try {
        const fileName = title.toLowerCase()
            .replace(/[^a-zа-яё0-9\s]/g, '')
            .replace(/\s+/g, '_') + '.json';
        const filePath = path.join(ARTICLES_DIR, fileName);
        
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        console.error('Ошибка удаления статьи:', error);
        return false;
    }
}

// Найти статью по названию
async function findArticle(title) {
    try {
        const fileName = title.toLowerCase()
            .replace(/[^a-zа-яё0-9\s]/g, '')
            .replace(/\s+/g, '_') + '.json';
        const filePath = path.join(ARTICLES_DIR, fileName);
        
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        return null;
    }
}

// Сервер
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Статические файлы
    if (pathname === '/' || pathname === '/index.html') {
        try {
            const content = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
            return;
        } catch (error) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
    }
    
    if (pathname === '/article.html') {
        try {
            const content = await fs.readFile(path.join(__dirname, 'article.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
            return;
        } catch (error) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
    }
    
    if (pathname === '/edit.html') {
        try {
            const content = await fs.readFile(path.join(__dirname, 'edit.html'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
            return;
        } catch (error) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
    }
    
    if (pathname === '/style.css') {
        try {
            const content = await fs.readFile(path.join(__dirname, 'style.css'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(content);
            return;
        } catch (error) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
    }
    
    if (pathname === '/script.js') {
        try {
            const content = await fs.readFile(path.join(__dirname, 'script.js'), 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(content);
            return;
        } catch (error) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
    }
    
    // API endpoints
    if (pathname === '/api/articles' && req.method === 'GET') {
        const articles = await getAllArticles();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(articles));
        return;
    }
    
    if (pathname === '/api/articles' && req.method === 'POST') {
        const password = req.headers['x-admin-password'];
        if (password !== ADMIN_PASSWORD) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Неверный пароль администратора' }));
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const article = JSON.parse(body);
                const success = await saveArticle(article);
                
                if (success) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: 'Ошибка сохранения' }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: 'Неверный формат данных' }));
            }
        });
        return;
    }
    
    if (pathname.startsWith('/api/articles/') && req.method === 'GET') {
        const title = decodeURIComponent(pathname.replace('/api/articles/', ''));
        const article = await findArticle(title);
        
        if (article) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(article));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Статья не найдена' }));
        }
        return;
    }
    
    if (pathname.startsWith('/api/articles/') && req.method === 'DELETE') {
        const password = req.headers['x-admin-password'];
        if (password !== ADMIN_PASSWORD) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Неверный пароль администратора' }));
            return;
        }

        const title = decodeURIComponent(pathname.replace('/api/articles/', ''));
        const success = await deleteArticle(title);
        
        if (success) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Ошибка удаления' }));
        }
        return;
    }
    
    res.writeHead(404);
    res.end('404 Not Found');
});

// Запуск сервера
ensureArticlesDir().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
        console.log(`📁 Статьи сохраняются в папку: ${ARTICLES_DIR}`);
    });
});
