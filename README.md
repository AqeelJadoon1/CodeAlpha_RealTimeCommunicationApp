# CodeAlpha Real-Time Communication App

Task 4 of the CodeAlpha Full Stack Development internship — a browser-based video calling app with screen sharing, chat, file sharing, and a whiteboard. The big one.

## What it does

Log in, start a call, share the room code with someone, and they join from their own browser. Multiple people can be in the same call, each one can share their screen, there's a sidebar for text chat and file sharing, and a shared whiteboard everyone in the room can draw on live.

## Features

- Multi-user video calling (peer-to-peer, via WebRTC — no video ever touches my server)
- Screen sharing, swapped in live without dropping the call
- Text chat, end-to-end encrypted with AES-GCM (key derived from the room code — my server only ever sees encrypted bytes, it can't read the messages)
- File sharing in the chat sidebar
- Shared whiteboard (canvas, synced live over Socket.io)
- Auth (bcrypt + sessions), shareable room codes instead of public room listings

## Tech stack

- Frontend: plain HTML/CSS/JS + the browser's native WebRTC APIs
- Signaling: Socket.io (just relays the WebRTC handshake, nothing more)
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`) — just for users and room codes
- Auth: bcrypt + express-session
- Encryption: WebRTC media is encrypted by default (DTLS-SRTP, built into the browser, can't be turned off); chat is encrypted separately with the Web Crypto API

## Running it locally

```bash
git clone https://github.com/AqeelJadoon1/CodeAlpha_RealTimeCommunicationApp.git
cd CodeAlpha_RealTimeCommunicationApp
npm install
node server.js
```

Open `http://localhost:3000` in two different browsers, log in as two different accounts, start a call in one and join with the room code in the other.

## Project structure

```
server.js       - auth, room creation, and the Socket.io signaling server
db.js           - SQLite schema (users, rooms)
public/
  index.html    - lobby: start or join a call
  room.html     - the actual call: video, chat, whiteboard, controls
  account.html  - login / register
```

## How the video calling actually works

Two browsers can't just magically find each other — they need to exchange some setup info first (called "signaling"): network info, codecs, etc. That's what Socket.io is doing here, nothing more — it's not carrying any video. Once the setup is done, video flows directly between the two browsers over WebRTC. With more than 2 people in a call, each browser opens a separate connection to every other person (a "mesh") — simple to build, works well for small calls, wouldn't scale past 5–6 people without a media server, which is a known tradeoff for a project at this scale.

## Bugs I actually hit building this (for the honest record)

- `node --watch` was restarting the whole server every time the SQLite file changed (i.e. constantly), which silently killed every active call mid-connection. Fixed by scoping the watch to just the source files.
- A race condition where, if the browser's camera permission was already granted from a previous visit, the socket would connect *before* my code had registered the listener that sends the "join room" message — so the join silently never happened. Fixed by decoupling "socket connected" from "ready to join" and checking both.

## Known limitations

- Mesh topology doesn't scale past a handful of participants
- No chat history for someone who joins a call already in progress
- Only chat is end-to-end encrypted in the strict sense; file transfers use the same relay but aren't separately encrypted beyond that
