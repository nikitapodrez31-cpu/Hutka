const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET =
  process.env.JWT_SECRET || 'CHANGE_ME_HUTKA_SECRET';

const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DB_DIR, 'hutka.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      users: [],
      posts: [],
      likes: []
    };
  }

  try {
    return JSON.parse(
      fs.readFileSync(DB_FILE, 'utf8')
    );
  } catch {
    return {
      users: [],
      posts: [],
      likes: []
    };
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
      (max, item) =>
        Math.max(
          max,
          Number(item.id) || 0
        ),
      0
    ) + 1
  );
}

/* =========================================================
   DEMO DATA
========================================================= */

if (!db.users.length) {
  const password =
    bcrypt.hashSync('hutka123', 10);

  db.users = [
    {
      id: 1,
      name: 'Аня Н.',
      username: 'anya',
      password_hash: password,
      bio: 'Гуляю, думаю, фатаграфую.',
      avatar: null,
      created_at:
        new Date().toISOString()
    },
    {
      id: 2,
      name: 'Дзіма К.',
      username: 'dzima',
      password_hash: password,
      bio: 'Музыка, Мінск і добрыя людзі.',
      avatar: null,
      created_at:
        new Date().toISOString()
    },
    {
      id: 3,
      name: 'Вольга',
      username: 'volha',
      password_hash: password,
      bio: 'Маленькія рэчы маюць значэнне.',
      avatar: null,
      created_at:
        new Date().toISOString()
    }
  ];

  db.posts = [
    {
      id: 1,
      user_id: 1,
      text: 'Добры вечар, Hutka! 🇧🇾',
      media: null,
      created_at:
        new Date().toISOString()
    },
    {
      id: 2,
      user_id: 2,
      text: 'Мінск сёння асабліва прыгожы.',
      media: null,
      created_at:
        new Date().toISOString()
    }
  ];

  db.likes = [];

  saveDB();
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(cookieParser());

app.use(
  '/uploads',
  express.static(UPLOAD_DIR)
);

/* =========================================================
   MULTER / IMAGE UPLOAD
========================================================= */

const storage =
  multer.diskStorage({
    destination: (_, __, cb) => {
      cb(null, UPLOAD_DIR);
    },

    filename: (_, file, cb) => {
      const ext = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(
          /[^.a-z0-9]/g,
          ''
        );

      const filename =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${ext || '.jpg'}`;

      cb(
        null,
        filename
      );
    }
  });

const upload = multer({
  storage,

  limits: {
    fileSize:
      8 * 1024 * 1024
  },

  fileFilter: (_, file, cb) => {
    const allowed =
      /^image\/(jpeg|png|webp|gif)$/i.test(
        file.mimetype
      );

    cb(null, allowed);
  }
});

/* =========================================================
   AUTH
========================================================= */

function sign(id) {
  return jwt.sign(
    { id },
    JWT_SECRET,
    {
      expiresIn: '30d'
    }
  );
}

function userFromReq(req) {
  try {
    const token =
      req.cookies.hutka_session;

    if (!token) {
      return null;
    }

    const payload =
      jwt.verify(
        token,
        JWT_SECRET
      );

    return (
      db.users.find(
        user =>
          user.id ===
          Number(payload.id)
      ) || null
    );
  } catch {
    return null;
  }
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    handle:
      '@' + user.username,
    username:
      user.username,
    bio:
      user.bio || '',
    avatar:
      user.avatar || null
  };
}

function requireAuth(
  req,
  res,
  next
) {
  const user =
    userFromReq(req);

  if (!user) {
    return res
      .status(401)
      .json({
        error:
          'AUTH_REQUIRED'
      });
  }

  req.user = user;

  next();
}

/* =========================================================
   POST FORMAT
========================================================= */

function postShape(
  post,
  viewerId
) {
  const user =
    db.users.find(
      item =>
        item.id ===
        post.user_id
    );

  if (!user) {
    return null;
  }

  const likes =
    db.likes.filter(
      like =>
        like.post_id ===
        post.id
    ).length;

  const liked =
    viewerId
      ? db.likes.some(
          like =>
            like.post_id ===
              post.id &&
            like.user_id ===
              viewerId
        )
      : false;

  return {
    id: post.id,
    text: post.text,
    media: post.media,
    createdAt:
      post.created_at,
    likes,
    liked,
    comments: 0,
    reposts: 0,
    user:
      safeUser(user)
  };
}

/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  '/api/me',
  (req, res) => {
    const user =
      userFromReq(req);

    res.json({
      user: user
        ? safeUser(user)
        : null
    });
  }
);

/* =========================================================
   REGISTER
========================================================= */

app.post(
  '/api/auth/register',
  async (req, res) => {
    const name =
      String(
        req.body.name || ''
      ).trim();

    const username =
      String(
        req.body.username || ''
      )
        .trim()
        .replace(/^@/, '')
        .toLowerCase();

    const password =
      String(
        req.body.password || ''
      );

    if (
      name.length < 2 ||
      name.length > 50
    ) {
      return res
        .status(400)
        .json({
          error:
            'Имя должно быть от 2 до 50 символов'
        });
    }

    if (
      !/^[a-z0-9_]{3,24}$/.test(
        username
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Username: 3–24 символа, только a-z, 0-9 и _'
        });
    }

    if (
      password.length < 6
    ) {
      return res
        .status(400)
        .json({
          error:
            'Пароль минимум 6 символов'
        });
    }

    if (
      db.users.some(
        user =>
          user.username ===
          username
      )
    ) {
      return res
        .status(409)
        .json({
          error:
            'Этот username уже занят'
        });
    }

    const user = {
      id: nextId(
        db.users
      ),
      name,
      username,
      password_hash:
        await bcrypt.hash(
          password,
          10
        ),
      bio: '',
      avatar: null,
      created_at:
        new Date().toISOString()
    };

    db.users.push(user);

    saveDB();

    res.cookie(
      'hutka_session',
      sign(user.id),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure:
          process.env.NODE_ENV ===
          'production',
        maxAge:
          30 *
          24 *
          60 *
          60 *
          1000
      }
    );

    res.json({
      user:
        safeUser(user)
    });
  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  '/api/auth/login',
  async (req, res) => {
    const username =
      String(
        req.body.username || ''
      )
        .trim()
        .replace(/^@/, '')
        .toLowerCase();

    const password =
      String(
        req.body.password || ''
      );

    const user =
      db.users.find(
        item =>
          item.username ===
          username
      );

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {
      return res
        .status(401)
        .json({
          error:
            'Неверный username или пароль'
        });
    }

    res.cookie(
      'hutka_session',
      sign(user.id),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure:
          process.env.NODE_ENV ===
          'production',
        maxAge:
          30 *
          24 *
          60 *
          60 *
          1000
      }
    );

    res.json({
      user:
        safeUser(user)
    });
  }
);

/* =========================================================
   LOGOUT
========================================================= */

app.post(
  '/api/auth/logout',
  (req, res) => {
    res.clearCookie(
      'hutka_session'
    );

    res.json({
      ok: true
    });
  }
);

/* =========================================================
   POSTS
========================================================= */

app.get(
  '/api/posts',
  (req, res) => {
    const viewer =
      userFromReq(req);

    const posts =
      [...db.posts]
        .sort(
          (a, b) =>
            b.id - a.id
        )
        .slice(0, 100);

    res.json({
      posts:
        posts
          .map(post =>
            postShape(
              post,
              viewer?.id
            )
          )
          .filter(Boolean)
    });
  }
);

/* =========================================================
   CREATE POST
========================================================= */

app.post(
  '/api/posts',
  requireAuth,
  upload.single('photo'),
  (req, res) => {
    const text =
      String(
        req.body.text || ''
      ).trim();

    if (
      !text &&
      !req.file
    ) {
      return res
        .status(400)
        .json({
          error:
            'Добавь текст или фото'
        });
    }

    if (
      text.length > 280
    ) {
      return res
        .status(400)
        .json({
          error:
            'Максимум 280 символов'
        });
    }

    const post = {
      id: nextId(
        db.posts
      ),
      user_id:
        req.user.id,
      text,
      media:
        req.file
          ? `/uploads/${req.file.filename}`
          : null,
      created_at:
        new Date().toISOString()
    };

    db.posts.push(post);

    saveDB();

    res.json({
      post:
        postShape(
          post,
          req.user.id
        )
    });
  }
);

/* =========================================================
   LIKE
========================================================= */

app.post(
  '/api/posts/:id/like',
  requireAuth,
  (req, res) => {
    const postId =
      Number(
        req.params.id
      );

    const postExists =
      db.posts.some(
        post =>
          post.id ===
          postId
      );

    if (!postExists) {
      return res
        .status(404)
        .json({
          error:
            'Пост не найден'
        });
    }

    const index =
      db.likes.findIndex(
        like =>
          like.user_id ===
            req.user.id &&
          like.post_id ===
            postId
      );

    if (index >= 0) {
      db.likes.splice(
        index,
        1
      );
    } else {
      db.likes.push({
        user_id:
          req.user.id,
        post_id:
          postId
      });
    }

    saveDB();

    res.json({
      liked:
        index < 0,
      likes:
        db.likes.filter(
          like =>
            like.post_id ===
            postId
        ).length
    });
  }
);

/* =========================================================
   SEARCH
========================================================= */

app.get(
  '/api/search',
  (req, res) => {
    const raw =
      String(
        req.query.q || ''
      ).trim();

    if (!raw) {
      return res.json({
        users: [],
        posts: []
      });
    }

    const query =
      raw.toLowerCase();

    const users =
      db.users
        .filter(
          user =>
            user.name
              .toLowerCase()
              .includes(query) ||
            user.username
              .toLowerCase()
              .includes(query)
        )
        .slice(0, 20)
        .map(safeUser);

    const viewer =
      userFromReq(req);

    const posts =
      db.posts
        .filter(post => {
          const user =
            db.users.find(
              item =>
                item.id ===
                post.user_id
            );

          if (!user) {
            return false;
          }

          return (
            post.text
              .toLowerCase()
              .includes(query) ||
            user.name
              .toLowerCase()
              .includes(query) ||
            user.username
              .toLowerCase()
              .includes(query)
          );
        })
        .sort(
          (a, b) =>
            b.id - a.id
        )
        .slice(0, 50);

    res.json({
      users,
      posts:
        posts
          .map(post =>
            postShape(
              post,
              viewer?.id
            )
          )
          .filter(Boolean)
    });
  }
);

/* =========================================================
   EDIT PROFILE
========================================================= */

app.put(
  '/api/me',
  requireAuth,
  upload.single('avatar'),
  (req, res) => {
    const name =
      String(
        req.body.name ||
          req.user.name
      ).trim();

    const username =
      String(
        req.body.username ||
          req.user.username
      )
        .trim()
        .replace(/^@/, '')
        .toLowerCase();

    const bio =
      String(
        req.body.bio || ''
      ).trim();

    if (
      name.length < 2 ||
      name.length > 50
    ) {
      return res
        .status(400)
        .json({
          error:
            'Некорректное имя'
        });
    }

    if (
      !/^[a-z0-9_]{3,24}$/.test(
        username
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Некорректный username'
        });
    }

    if (
      db.users.some(
        user =>
          user.username ===
            username &&
          user.id !==
            req.user.id
      )
    ) {
      return res
        .status(409)
        .json({
          error:
            'Этот username уже занят'
        });
    }

    req.user.name =
      name;

    req.user.username =
      username;

    req.user.bio =
      bio;

    if (req.file) {
      req.user.avatar =
        `/uploads/${req.file.filename}`;
    }

    saveDB();

    res.json({
      user:
        safeUser(
          req.user
        )
    });
  }
);

/* =========================================================
   USER PROFILE
========================================================= */

app.get(
  '/api/users/:username',
  (req, res) => {
    const username =
      String(
        req.params.username
      )
        .replace(/^@/, '')
        .toLowerCase();

    const user =
      db.users.find(
        item =>
          item.username ===
          username
      );

    if (!user) {
      return res
        .status(404)
        .json({
          error:
            'Пользователь не найден'
        });
    }

    const posts =
      db.posts.filter(
        post =>
          post.user_id ===
          user.id
      ).length;

    res.json({
      user: {
        ...safeUser(user),
        posts,
        followers: 0,
        following: 0
      }
    });
  }
);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  express.static(ROOT)
);

/*
 * ВАЖНО:
 * Этот маршрут должен быть последним,
 * чтобы /api/* и /uploads/* обрабатывались
 * своими обработчиками.
 */

app.get(
  '*',
  (req, res) => {
    res.sendFile(
      path.join(
        ROOT,
        'index.html'
      )
    );
  }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Hutka online listening on ${PORT}`
    );
  }
);
