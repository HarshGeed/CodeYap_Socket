import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const onlineUsers = new Map(); // userId -> socketId
const userStatuses = new Map(); // userId -> { status, lastSeen }

// Health check and online users endpoint
httpServer.on('request', (req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      onlineCount: onlineUsers.size 
    }));
    return;
  }

  if (req.url === '/online-users' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      onlineUsers: Array.from(onlineUsers.keys()),
      userStatuses: Object.fromEntries(userStatuses)
    }));
    return;
  }

  // Default 404 response
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          process.env.FRONTEND_URL || "https://your-app-name.vercel.app",
          /^https:\/\/.*\.vercel\.app$/  // Allow all Vercel preview deployments
        ] 
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Support both transports for better compatibility
});

io.on("connection", (socket) => {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);
  console.log(`Current online users: ${onlineUsers.size}`);

  // Register user for presence tracking
  socket.on("register-user", (userId) => {
    try {
      console.log(`[${new Date().toISOString()}] Registering user: ${userId}`);
      
      // Remove user from any existing socket connection
      for (const [existingUserId, existingSocketId] of onlineUsers.entries()) {
        if (existingUserId === userId && existingSocketId !== socket.id) {
          onlineUsers.delete(existingUserId);
          console.log(`Removed duplicate connection for user ${userId}`);
        }
      }

      onlineUsers.set(userId, socket.id);
      userStatuses.set(userId, {
        status: "online",
        lastSeen: new Date().toISOString()
      });
      
      // Emit status update to all clients
      io.emit("user-status", { 
        userId, 
        status: "online",
        lastSeen: new Date().toISOString()
      });

      // Send current user statuses to the newly connected user
      for (const [otherUserId, statusObj] of userStatuses.entries()) {
        if (otherUserId !== userId) {
          socket.emit("user-status", {
            userId: otherUserId,
            status: statusObj.status,
            lastSeen: statusObj.lastSeen,
          });
        }
      }

      console.log(`User ${userId} registered successfully. Total online: ${onlineUsers.size}`);
    } catch (error) {
      console.error("Error registering user:", error);
    }
  });

  // Handle joining rooms for private chats
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Handle private messages
  socket.on("send-message", (message) => {
    console.log(`Message sent in room ${message.roomId}`);
    socket.to(message.roomId).emit("receive-message", message);
  });

  // Handle group messages
  socket.on("send-group-message", (message) => {
    console.log(`Group message sent to group ${message.groupId}`);
    socket.broadcast.emit("receive-group-message", message);
  });

  // Handle typing indicators for private chats
  socket.on("typing", (data) => {
    socket.to(data.roomId).emit("typing", data);
  });

  // Handle typing indicators for group chats
  socket.on("group-typing", (data) => {
    socket.to(data.groupId).emit("group-typing", data);
  });

  // Handle message seen status
  socket.on("message-seen", (data) => {
    socket.to(data.roomId).emit("message-seen", data);
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);
    
    // Find and remove the user from online users
    let disconnectedUserId = null;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      // Update user status to offline
      userStatuses.set(disconnectedUserId, {
        status: "offline",
        lastSeen: new Date().toISOString()
      });

      // Emit status update to all clients
      io.emit("user-status", {
        userId: disconnectedUserId,
        status: "offline",
        lastSeen: new Date().toISOString()
      });

      console.log(`User ${disconnectedUserId} went offline. Total online: ${onlineUsers.size}`);
    }
  });

  // Handle errors
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Cleanup old statuses periodically (remove offline users after 24 hours)
setInterval(() => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  for (const [userId, statusObj] of userStatuses.entries()) {
    if (statusObj.status === "offline" && new Date(statusObj.lastSeen) < oneDayAgo) {
      userStatuses.delete(userId);
      console.log(`Cleaned up old status for user ${userId}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Start the server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CodeYap Socket Server running on port ${PORT}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`👥 User status tracking: In-memory + Real-time updates`);
  
  // Broadcast current statuses every 30 seconds to ensure consistency
  setInterval(() => {
    if (onlineUsers.size > 0) {
      console.log(`📊 Broadcasting statuses for ${onlineUsers.size} online users`);
      for (const [userId, statusObj] of userStatuses.entries()) {
        io.emit("user-status", {
          userId,
          status: statusObj.status,
          lastSeen: statusObj.lastSeen,
        });
      }
    }
  }, 30000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('✅ Socket server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    console.log('✅ Socket server closed');
    process.exit(0);
  });
});
