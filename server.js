const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_HUTKA_SECRET';

const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DB_DIR, 'hutka.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], posts: [], likes: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: [], posts: [], likes: [] };
  }
}

let db = loadDB();

function saveDB() {
  const tmp = DB_FILE + '.tmp';

  fs.writeFileSync(
    tmp,
    JSON.stringify(db, null, 2),
    'utf8'
  );

  fs.renameSync(tmp, DB_FILE);
}

function nextId(items) {
  return (
    items.reduce(
      (m, x) => Math.max(m, Number(x.id) || 0),
      0
    ) + 1
  );
}

/* Создаём демо-данные при первом запуске */

if (!db.users.length) {
  const password = bcrypt.hashSync('hutka123', 10);

  db.users = [
    {
      id: 1,
      name: 'Аня Н.',
      username: 'anya',
      password_hash: password,
      bio: 'Гуляю, думаю, фатаграфую.',
      avatar: null,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      name: 'Дзіма К.',
      username: 'dzima',
      password_hash: password,
      bio: 'Музыка, Мінск і добрыя людзі.',
      avatar: null,
      created_at: new Date().toISOString()
    },
    {
      id: 3,
      name: 'Вольга',
      username: 'volha',
      password_hash: password,
      bio: 'Маленькія рэчы маюць значэнне.',
      avatar: null,
      created_at: new Date().toISOString()
    }
  ];

  db.posts = [
    {
      id: 1,
      user_id: 1,
      text: 'Добры вечар, Hutka! 🇧🇾',
      media: null,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      user_id: 2,
      text: 'Мінск сёння асабліва прыгожы.',
      media: null,
      created_at: new Date().toISOString()
    }
  ];

  db.likes = [];

  saveDB();
}

/* Middleware */

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
  '/uploads',
  express.static(UPLOAD_DIR)
);

/* Загрузка изображений */

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (_, file, cb) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/[^.a-z0-9]/9
