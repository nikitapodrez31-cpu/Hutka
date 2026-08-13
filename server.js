const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 3000);

const JWT_SECRET =
  process.env.JWT_SECRET || 'CHANGE_ME_HUTKA_SECRET';

const ROOT = __dirname;

const DB_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DB_DIR, 'hutka.json');

const UPLOAD_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });


/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
  'https://nikitapodrez31-cpu.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS'
  );

  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});


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
   DATABASE
========================================================= */

function emptyDB() {
  return {
    users: [],
    posts: [],
    likes: [],
    comments: []
  };
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return emptyDB();
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(DB_FILE, 'utf8')
    );

    return {
      users: Array.isArray(data.users)
        ? data.users
        : [],

      posts: Array.isArray(data.posts)
        ? data.posts
        : [],

      likes: Array.isArray(data.likes)
        ? data.likes
        : [],

      comments: Array.isArray(data.comments)
        ? data.comments
        : []
    };
  } catch (error) {
    console.error(
      'Ошибка чтения базы:',
      error
    );

    return emptyDB();
  }
}

let db = loadDB();


function saveDB() {
  try {
    const tmp =
      DB_FILE + '.tmp';

    fs.writeFileSync(
      tmp,
      JSON.stringify(
        db,
        null,
        2
      ),
      'utf8'
    );

    fs.renameSync(
      tmp,
      DB_FILE
    );
  } catch (error) {
    console.error(
      'Ошибка сохранения базы:',
      error
    );
  }
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
    bcrypt.hashSync(
      'hutka123',
      10
    );

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

  db.comments = [];

  saveDB();
}


/* =========================================================
   UPLOADS
========================================================= */

const storage =
  multer.diskStorage({

    destination: (_, __, callback) => {
      callback(
        null,
        UPLOAD_DIR
      );
    },

    filename: (_, file, callback) => {

      const ext =
        path
          .extname(
            file.originalname
          )
          .toLowerCase()
          .replace(
            /[^.a-z0-9]/g,
            ''
          );

      const filename =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}${ext || '.jpg'}`;

      callback(
        null,
        filename
      );
    }
  });


const upload =
  multer({

    storage,

    limits: {
      fileSize:
        8 * 1024 * 1024
    },

    fileFilter: (
      _,
      file,
      callback
    ) => {

      const allowed =
        /^image\/(jpeg|png|webp|gif)$/i;

      if (
        allowed.test(
          file.mimetype
        )
      ) {
        callback(
          null,
          true
        );
      } else {
        callback(
          new Error(
            'Разрешены только изображения JPG, PNG, WEBP или GIF'
          )
        );
      }
    }
  });


/* =========================================================
   AUTH
========================================================= */

function sign(userId) {
  return jwt.sign(
    {
      id: userId
    },
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

  if (!user) {
    return null;
  }

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
   COOKIE
========================================================= */

function setSessionCookie(
  res,
  userId
) {

  res.cookie(
    'hutka_session',
    sign(userId),
    {
      httpOnly: true,

      sameSite:
        'none',

      secure: true,

      maxAge:
        30 *
        24 *
        60 *
        60 *
        1000,

      path: '/'
    }
  );
}


/* =========================================================
   POST SHAPE
========================================================= */

function postShape(
  post,
  viewerId
) {

  const user =
    db.users.find(
      u =>
        u.id ===
        post.user_id
    );

  const likes =
    db.likes.filter(
      like =>
        like.post_id ===
        post.id
    ).length;

  const liked =
    !!db.likes.find(
      like =>
        like.post_id ===
          post.id &&
        like.user_id ===
          viewerId
    );

  const comments =
    db.comments.filter(
      comment =>
        comment.post_id ===
        post.id
    ).length;

  return {

    id: post.id,

    text:
      post.text || '',

    media:
      post.media || null,

    createdAt:
      post.created_at,

    likes,

    liked,

    comments,

    reposts: 0,

    user:
      safeUser(user)
  };
}


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  '/api/health',
  (req, res) => {

    res.json({
      ok: true,
      service: 'Hutka',
      time:
        new Date().toISOString()
    });
  }
);


/* =========================================================
   ME
========================================================= */

app.get(
  '/api/me',
  (req, res) => {

    const user =
      userFromReq(req);

    res.json({
      user:
        user
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

    try {

      const name =
        String(
          req.body.name || ''
        ).trim();

      const username =
        String(
          req.body.username || ''
        )
          .trim()
          .replace(
            /^@/,
            ''
          )
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

        id:
          nextId(db.users),

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

      setSessionCookie(
        res,
        user.id
      );

      res.json({
        user:
          safeUser(user)
      });

    } catch (error) {

      console.error(error);

      res
        .status(500)
        .json({
          error:
            'Ошибка регистрации'
        });
    }
  }
);


/* =========================================================
   LOGIN
========================================================= */

app.post(
  '/api/auth/login',
  async (req, res) => {

    try {

      const username =
        String(
          req.body.username || ''
        )
          .trim()
          .replace(
            /^@/,
            ''
          )
          .toLowerCase();

      const password =
        String(
          req.body.password || ''
        );

      const user =
        db.users.find(
          u =>
            u.username ===
            username
        );

      if (
        !user ||
        !(
          await bcrypt.compare(
            password,
            user.password_hash
          )
        )
      ) {

        return res
          .status(401)
          .json({
            error:
              'Неверный username или пароль'
          });
      }

      setSessionCookie(
        res,
        user.id
      );

      res.json({
        user:
          safeUser(user)
      });

    } catch (error) {

      console.error(error);

      res
        .status(500)
        .json({
          error:
            'Ошибка входа'
        });
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

app.post(
  '/api/auth/logout',
  (req, res) => {

    res.clearCookie(
      'hutka_session',
      {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/'
      }
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
        posts.map(
          post =>
            postShape(
              post,
              viewer?.id
            )
        )
    });
  }
);


/* CREATE POST */

app.post(
  '/api/posts',
  requireAuth,
  upload.single('photo'),
  (req, res) => {

    try {

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

        id:
          nextId(db.posts),

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

    } catch (error) {

      console.error(error);

      res
        .status(500)
        .json({
          error:
            'Не удалось создать пост'
        });
    }
  }
);


/* =========================================================
   LIKES
========================================================= */

app.post(
  '/api/posts/:id/like',
  requireAuth,
  (req, res) => {

    const postId =
      Number(
        req.params.id
      );

    if (
      !db.posts.some(
        post =>
          post.id ===
          postId
      )
    ) {
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

    let liked;

    if (index >= 0) {

      db.likes.splice(
        index,
        1
      );

      liked = false;

    } else {

      db.likes.push({
        user_id:
          req.user.id,

        post_id:
          postId
      });

      liked = true;
    }

    saveDB();

    res.json({
      liked,

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
   COMMENTS
========================================================= */


/* GET COMMENTS */

app.get(
  '/api/posts/:id/comments',
  (req, res) => {

    const postId =
      Number(
        req.params.id
      );

    const post =
      db.posts.find(
        p =>
          p.id ===
          postId
      );

    if (!post) {
      return res
        .status(404)
        .json({
          error:
            'Пост не найден'
        });
    }

    const comments =
      db.comments
        .filter(
          comment =>
            comment.post_id ===
            postId
        )
        .sort(
          (a, b) =>
            a.id - b.id
        )
        .map(
          comment => {

            const user =
              db.users.find(
                u =>
                  u.id ===
                  comment.user_id
              );

            return {

              id:
                comment.id,

              text:
                comment.text,

              createdAt:
                comment.created_at,

              user:
                safeUser(user)
            };
          }
        );

    res.json({
      comments
    });
  }
);


/* CREATE COMMENT */

app.post(
  '/api/posts/:id/comments',
  requireAuth,
  (req, res) => {

    const postId =
      Number(
        req.params.id
      );

    const post =
      db.posts.find(
        p =>
          p.id ===
          postId
      );

    if (!post) {
      return res
        .status(404)
        .json({
          error:
            'Пост не найден'
        });
    }

    const text =
      String(
        req.body.text || ''
      ).trim();

    if (!text) {
      return res
        .status(400)
        .json({
          error:
            'Комментарий не может быть пустым'
        });
    }

    if (
      text.length > 500
    ) {
      return res
        .status(400)
        .json({
          error:
            'Комментарий максимум 500 символов'
        });
    }

    const comment = {

      id:
        nextId(
          db.comments
        ),

      post_id:
        postId,

      user_id:
        req.user.id,

      text,

      created_at:
        new Date().toISOString()
    };

    db.comments.push(
      comment
    );

    saveDB();

    res.json({
      comment: {

        id:
          comment.id,

        text:
          comment.text,

        createdAt:
          comment.created_at,

        user:
          safeUser(
            req.user
          )
      }
    });
  }
);


/* DELETE COMMENT */

app.delete(
  '/api/comments/:id',
  requireAuth,
  (req, res) => {

    const commentId =
      Number(
        req.params.id
      );

    const index =
      db.comments.findIndex(
        comment =>
          comment.id ===
            commentId &&
          comment.user_id ===
            req.user.id
      );

    if (index < 0) {
      return res
        .status(404)
        .json({
          error:
            'Комментарий не найден'
        });
    }

    db.comments.splice(
      index,
      1
    );

    saveDB();

    res.json({
      ok: true
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

    const q =
      raw.toLowerCase();

    const users =
      db.users
        .filter(
          user =>
            user.name
              .toLowerCase()
              .includes(q) ||

            user.username
              .toLowerCase()
              .includes(q)
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
              u =>
                u.id ===
                post.user_id
            );

          return (

            post.text
              .toLowerCase()
              .includes(q) ||

            user.name
              .toLowerCase()
              .includes(q) ||

            user.username
              .toLowerCase()
              .includes(q)
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
        posts.map(
          post =>
            postShape(
              post,
              viewer?.id
            )
        )
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
        .replace(
          /^@/,
          ''
        )
        .toLowerCase();

    const bio =
      String(
        req.body.bio ||
          req.user.bio ||
          ''
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
      req.params.username
        .replace(/^@/, '')
        .toLowerCase();

    const user =
      db.users.find(
        u =>
          u.username ===
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
   STATIC FRONTEND
========================================================= */

app.use(
  express.static(ROOT)
);


/*
   Если открыть Render напрямую,
   отдаём index.html.
*/

app.get(
  '*',
  (req, res) => {

    const indexPath =
      path.join(
        ROOT,
        'index.html'
      );

    if (
      fs.existsSync(
        indexPath
      )
    ) {
      return res.sendFile(
        indexPath
      );
    }

    res
      .status(404)
      .send(
        'Hutka server работает, но index.html не найден.'
      );
  }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      'SERVER ERROR:',
      error
    );

    if (
      error instanceof
      multer.MulterError
    ) {
      return res
        .status(400)
        .json({
          error:
            'Ошибка загрузки файла: ' +
            error.message
        });
    }

    res
      .status(500)
      .json({
        error:
          error.message ||
          'Внутренняя ошибка сервера'
      });
  }
);


/* =========================================================
   START
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
