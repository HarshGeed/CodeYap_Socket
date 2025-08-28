# CodeYap Socket Server

Real-time WebSocket server for CodeYap chat application built with Socket.IO.

## Features

- 💬 Real-time messaging (private & group chats)
- 👥 User presence tracking (online/offline status)
- ✨ Typing indicators
- 📖 Message read receipts
- 🔄 Automatic reconnection handling
- 🌐 CORS configured for production

## Quick Start

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm install
npm start
```

## Environment Variables

Create a `.env` file with:

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-app-name.vercel.app
```

## API Endpoints

- `GET /health` - Health check
- `GET /online-users` - Get current online users and their status

## Socket Events

### Client → Server
- `register-user` - Register user for presence tracking
- `join-room` - Join a chat room
- `send-message` - Send private message
- `send-group-message` - Send group message
- `typing` - Typing indicator for private chats
- `group-typing` - Typing indicator for group chats
- `message-seen` - Mark message as read

### Server → Client
- `user-status` - User online/offline status updates
- `receive-message` - Receive private message
- `receive-group-message` - Receive group message
- `typing` - Typing indicator
- `group-typing` - Group typing indicator
- `message-seen` - Message read confirmation

## Deployment on Render

1. Create a new Web Service on Render
2. Connect this repository
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Add environment variables:
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://your-vercel-app.vercel.app`

## License

MIT
