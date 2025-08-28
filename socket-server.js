import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const onlineUsers = new Map(); // userId -> socketId
const userStatuses = new Map(); // userId -> { status, lastSeen }

// Add a simple endpoint to check online users
httpServer.on('request', (req, res) => {
  if (req.url === '/online-users' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      onlineUsers: Array.from(onlineUsers.keys()),
      userStatuses: Object.fromEntries(userStatuses)
    }));
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL || "https://your-app-name.vercel.app"] 
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  console.log("Current online users:", Array.from(onlineUsers.keys()));
  console.log("Current user statuses:", Object.fromEntries(userStatuses));

  // Register user for presence tracking
  socket.on("register-user", (userId) => {
    try {
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

      // Send all currently online users to the new user
      console.log("Sending current user statuses to new user:", userId);
      for (const [otherUserId, statusObj] of userStatuses.entries()) {
        if (otherUserId !== userId) {
          console.log(`Sending status for ${otherUserId}:`, statusObj);
          socket.emit("user-status", {
            userId: otherUserId,
            status: statusObj.status,
            lastSeen: statusObj.lastSeen,
          });
        }
      }
      
      console.log(`User ${userId} registered as online`);
      console.log(`Currently ${onlineUsers.size} users online:`, Array.from(onlineUsers.keys()));
    } catch (error) {
      console.error("Error registering user:", error);
    }
  });

  // Private chat room
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on("send-message", (msgObj) => {
    io.to(msgObj.roomId).emit("receive-message", msgObj);
  });

  // Typing event for private chat
  socket.on("typing", (data) => {
    // data: { roomId, userId }
    socket.to(data.roomId).emit("typing", data);
  });

  // --- GROUP CHAT SUPPORT ---
  socket.on("join-group", (groupId) => {
    socket.join(groupId);
    console.log(`Socket ${socket.id} joined group ${groupId}`);
  });

  socket.on("leave-group", (groupId) => {
    socket.leave(groupId);
    console.log(`Socket ${socket.id} left group ${groupId}`);
  });

  socket.on("send-group-message", (msgObj) => {
    io.to(msgObj.groupId).emit("receive-group-message", msgObj);
  });

  // Typing event for group chat
  socket.on("group-typing", (data) => {
    // data: { groupId, userId }
    socket.to(data.groupId).emit("group-typing", data);
  });

  // Message seen event for private chat
  socket.on("message-seen", ({ roomId, messageId, seenBy }) => {
    io.to(roomId).emit("message-seen", { messageId, seenBy });
  });

  socket.on("disconnect", () => {
    for (const [userId, id] of onlineUsers.entries()) {
      if (id === socket.id) {
        onlineUsers.delete(userId);
  
        const lastSeen = new Date().toISOString();
        userStatuses.set(userId, {
          status: "offline",
          lastSeen: lastSeen
        });
  
        // Emit status update to all clients
        io.emit("user-status", {
          userId,
          status: "offline",
          lastSeen: lastSeen,
        });
  
        // --- ADD THIS: Update lastSeen in the database ---
        fetch(`http://localhost:3000/api/updateLastSeen/${userId}`, {
          method: "PATCH"
        }).catch((err) => {
          console.error("Failed to update lastSeen in DB:", err);
        });
  
        console.log(`User ${userId} disconnected and marked as offline`);
        console.log(`Currently ${onlineUsers.size} users online:`, Array.from(onlineUsers.keys()));
        break;
      }
    }
    console.log("A user disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log("User status tracking: In-memory + Real-time updates");
  console.log(`Currently ${onlineUsers.size} users online`);
  
  // Broadcast current statuses every 30 seconds to ensure consistency
  setInterval(() => {
    console.log("Broadcasting current statuses to all clients");
    for (const [userId, statusObj] of userStatuses.entries()) {
      io.emit("user-status", {
        userId,
        status: statusObj.status,
        lastSeen: statusObj.lastSeen,
      });
    }
  }, 30000);
});