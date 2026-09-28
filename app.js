const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'trade_platform_secret_key_2024';

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'dist')));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 认证中间件
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: '登录已过期' });
  }
};

// ========== 登录接口 ==========
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (!user) return res.status(400).json({ message: '用户名或密码错误' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: '用户名或密码错误' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// ========== 产品接口 ==========
app.get('/api/products', (req, res) => {
  const { keyword, category, status, page = 1, pageSize = 20 } = req.query;
  let sql = "SELECT * FROM products WHERE 1=1";
  let params = [];
  if (keyword) {
    sql += " AND (name_cn LIKE ? OR name_en LIKE ? OR sku LIKE ?)";
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(Number(pageSize), (page - 1) * pageSize);
  db.all(sql, params, (err, rows) => {
    db.get("SELECT COUNT(*) as total FROM products", (err, count) => {
      res.json({ list: rows, total: count.total });
    });
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get("SELECT * FROM products WHERE id = ?", [req.params.id], (err, row) => res.json(row));
});

app.post('/api/products', auth, (req, res) => {
  const { sku, name_cn, name_en, specification, material, hs_code, moq, price, status, category, tags, description } = req.body;
  db.run(`INSERT INTO products 
    (sku, name_cn, name_en, specification, material, hs_code, moq, price, status, category, tags, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sku, name_cn, name_en, specification, material, hs_code, moq, price, status, category, tags, description],
    function(err) {
      if (err) return res.status(400).json({ message: 'SKU已存在' });
      res.json({ id: this.lastID });
    });
});

app.put('/api/products/:id', auth, (req, res) => {
  const { sku, name_cn, name_en, specification, material, hs_code, moq, price, status, category, tags, description } = req.body;
  db.run(`UPDATE products SET 
    sku=?, name_cn=?, name_en=?, specification=?, material=?, hs_code=?, 
    moq=?, price=?, status=?, category=?, tags=?, description=? WHERE id=?`,
    [sku, name_cn, name_en, specification, material, hs_code, moq, price, status, category, tags, description, req.params.id],
    () => res.json({ success: true }));
});

app.delete('/api/products/:id', auth, (req, res) => {
  db.run("DELETE FROM products WHERE id = ?", [req.params.id], () => res.json({ success: true }));
});

// ========== 素材接口 ==========
app.post('/api/materials/upload', auth, upload.single('file'), (req, res) => {
  const { product_id, type } = req.body;
  const file = req.file;
  db.run(`INSERT INTO materials (product_id, name, type, url, size) VALUES (?, ?, ?, ?, ?)`,
    [product_id, file.originalname, type, `/uploads/${file.filename}`, file.size],
    function(err) {
      res.json({ id: this.lastID, url: `/uploads/${file.filename}`, name: file.originalname });
    });
});

app.get('/api/materials/product/:productId', (req, res) => {
  db.all("SELECT * FROM materials WHERE product_id = ? ORDER BY id DESC", 
    [req.params.productId], (err, rows) => res.json(rows));
});

app.delete('/api/materials/:id', auth, (req, res) => {
  db.get("SELECT * FROM materials WHERE id = ?", [req.params.id], (err, row) => {
    if (row) {
      const filePath = path.join(__dirname, row.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.run("DELETE FROM materials WHERE id = ?", [req.params.id], () => res.json({ success: true }));
  });
});

// ========== 知识库接口 ==========
app.get('/api/knowledge', (req, res) => {
  const { keyword, category } = req.query;
  let sql = "SELECT * FROM knowledge WHERE 1=1";
  let params = [];
  if (keyword) { sql += " AND title LIKE ? OR content LIKE ?"; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (category) { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY id DESC";
  db.all(sql, params, (err, rows) => res.json(rows));
});

app.post('/api/knowledge', auth, (req, res) => {
  const { title, content, category, product_ids } = req.body;
  db.run(`INSERT INTO knowledge (title, content, category, product_ids) VALUES (?, ?, ?, ?)`,
    [title, content, category, product_ids], function(err) { res.json({ id: this.lastID }); });
});

app.put('/api/knowledge/:id', auth, (req, res) => {
  const { title, content, category, product_ids } = req.body;
  db.run(`UPDATE knowledge SET title=?, content=?, category=?, product_ids=? WHERE id=?`,
    [title, content, category, product_ids, req.params.id], () => res.json({ success: true }));
});

app.delete('/api/knowledge/:id', auth, (req, res) => {
  db.run("DELETE FROM knowledge WHERE id = ?", [req.params.id], () => res.json({ success: true }));
});

// 前端路由兜底
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`平台运行在 http://localhost:${PORT}`);
});
