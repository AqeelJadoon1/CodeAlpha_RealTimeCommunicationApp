const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(
  session({
    secret: "change-this-to-a-long-random-string",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  }),
);
app.use(express.static("public"));

function requireLogin(req, res, next) {
  if (!req.session.userId)
    return res.status(401).json({ error: "Please log in" });
  next();
}

function generateRoomCode() {
  const words = [
    "red",
    "blue",
    "green",
    "gold",
    "swift",
    "calm",
    "wild",
    "bold",
  ];
  const animals = [
    "fox",
    "owl",
    "wolf",
    "hawk",
    "bear",
    "lynx",
    "crow",
    "puma",
  ];
  const word = words[Math.floor(Math.random() * words.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(Math.random() * 100);
  return `${word}-${animal}-${num}`;
}

// ---------- AUTH ----------
app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, email and password are required" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  }
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email);
  if (existing)
    return res.status(400).json({ error: "That email is already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
    .run(name, email, hash);

  req.session.userId = result.lastInsertRowid;
  req.session.userName = name;
  res.json({ id: result.lastInsertRowid, name, email });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong email or password" });
  }
  req.session.userId = user.id;
  req.session.userName = user.name;
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = db
    .prepare("SELECT id, name, email FROM users WHERE id = ?")
    .get(req.session.userId);
  res.json(user || null);
});

// ---------- ROOMS ----------
app.post("/api/rooms", requireLogin, (req, res) => {
  let code;
  do {
    code = generateRoomCode();
  } while (db.prepare("SELECT id FROM rooms WHERE code = ?").get(code));

  db.prepare("INSERT INTO rooms (code, created_by) VALUES (?, ?)").run(
    code,
    req.session.userId,
  );

  res.json({ code });
});

app.get("/api/rooms/:code", requireLogin, (req, res) => {
  const room = db
    .prepare("SELECT * FROM rooms WHERE code = ?")
    .get(req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(room);
});

// ---------- SIGNALING (Socket.io) ----------
const roomUsers = {}; // { roomCode: { socketId: userName } }

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomCode, userName }) => {
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.userName = userName;

    if (!roomUsers[roomCode]) roomUsers[roomCode] = {};
    roomUsers[roomCode][socket.id] = userName;

    socket.to(roomCode).emit("user-joined", { socketId: socket.id, userName });

    const others = Object.entries(roomUsers[roomCode])
      .filter(([id]) => id !== socket.id)
      .map(([id, name]) => ({ socketId: id, userName: name }));
    socket.emit("existing-users", others);
  });

  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      userName: socket.data.userName,
      data,
    });
  });

  socket.on("chat-message", ({ roomCode, encrypted }) => {
    socket
      .to(roomCode)
      .emit("chat-message", { userName: socket.data.userName, encrypted });
  });

  socket.on("chat-file", ({ roomCode, fileName, fileData }) => {
    socket.to(roomCode).emit("chat-file", {
      userName: socket.data.userName,
      fileName,
      fileData,
    });
  });

  socket.on("whiteboard-draw", (data) => {
    socket.to(data.roomCode).emit("whiteboard-draw", data);
  });

  socket.on("whiteboard-clear", ({ roomCode }) => {
    socket.to(roomCode).emit("whiteboard-clear");
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (roomCode && roomUsers[roomCode]) {
      delete roomUsers[roomCode][socket.id];
      socket.to(roomCode).emit("user-left", { socketId: socket.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`App running at http://localhost:${PORT}`);
});
