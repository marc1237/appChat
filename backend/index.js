const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");
const csv = require("csv-parser");
const fs = require("fs");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const os = require("os");
const twilio = require("twilio");
const {
  uploadAndCompressImage,
  uploadMedia,
} = require("./services/azureStorage");

dotenv.config();

// --- Moderator Bot Logic ---
class ModeratorBot {
  constructor() {
    this.name = "ME-Moderator";
    this.id = "bot-moderator-id";
    this.scamDatabase = [
      "bit.ly/scam",
      "crypto-rewards.xyz",
      "bank-verify.info",
      "win-prize-now.com",
      "login-support-me.com",
    ];
    this.bannedUserIds = new Set();
    this.spamPatterns = [
      /win \d+ dollars/i,
      /claim your reward/i,
      /urgent: verify your account/i,
      /inheritance from .* relative/i,
    ];

    // Periodically "self-inform" (update knowledge)
    setInterval(() => this.updateKnowledge(), 60000 * 60); // Every hour
  }

  updateKnowledge() {
    console.log(
      "[BOT] ME-Moderator is updating its scam database from global sources...",
    );
    // Mocking an update from external scam APIs
    const newScams = ["gift-card-free.net", "verify-password.tech"];
    this.scamDatabase = [...new Set([...this.scamDatabase, ...newScams])];
  }

  analyzeMessage(content, senderId) {
    if (this.bannedUserIds.has(senderId))
      return { shouldBlock: true, reason: "User is banned" };

    let score = 0;
    const lowerContent = content.toLowerCase();

    // Check against patterns
    this.spamPatterns.forEach((pattern) => {
      if (pattern.test(content)) score += 2;
    });

    // Check against scam database URLs
    this.scamDatabase.forEach((url) => {
      if (lowerContent.includes(url)) score += 3;
    });

    // Check for excessive caps
    if (content.length > 20 && content === content.toUpperCase()) score += 1;

    const isSpam = score >= 3;
    const shouldBan = score >= 5;

    if (shouldBan) {
      this.bannedUserIds.add(senderId);
      return {
        isSpam: true,
        shouldBlock: true,
        reason: "Auto-banned for scamming",
      };
    }

    return { isSpam, shouldBlock: false };
  }
}

const meBot = new ModeratorBot();

const app = express();
let prisma;
try {
  prisma = new PrismaClient();
  console.log("✅ Prisma Client inizializzato.");
} catch (e) {
  console.warn("⚠️ Errore inizializzazione Prisma. Utilizzo modalità Mock.");
  const DATA_FILE = path.join(__dirname, "data.json");
  const loadData = () => {
    try {
      if (fs.existsSync(DATA_FILE))
        return JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (e) {}
    return { contacts: [], messages: [], chats: [] };
  };
  const saveData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  };

  prisma = {
    user: {
      upsert: async (args) => ({
        id: "mock-user-id-123",
        phoneNumber: args.create.phoneNumber,
        isOnline: true,
      }),
      findUnique: async () => null,
    },
    contact: {
      upsert: async (args) => {
        const { userId, contactPhone } = args.create;
        const data = loadData();
        let contact = data.contacts.find(
          (c) => c.userId === userId && c.contactPhone === contactPhone,
        );
        if (contact) {
          contact.contactName = args.create.contactName;
        } else {
          contact = {
            id: Date.now().toString() + Math.random(),
            ...args.create,
          };
          data.contacts.push(contact);
        }
        saveData(data);
        return contact;
      },
      findMany: async (args) => {
        const data = loadData();
        if (args && args.where && args.where.userId) {
          return data.contacts.filter((c) => c.userId === args.where.userId);
        }
        return data.contacts;
      },
      deleteMany: async (args) => {
        const data = loadData();
        if (args && args.where && args.where.userId) {
          data.contacts = data.contacts.filter(
            (c) => c.userId !== args.where.userId,
          );
        } else {
          data.contacts = [];
        }
        saveData(data);
        return { count: 0 };
      },
      delete: async (args) => {
        const data = loadData();
        data.contacts = data.contacts.filter((c) => c.id !== args.where.id);
        saveData(data);
        return { id: args.where.id };
      },
    },
    chat: {
      create: async ({ data: chatData }) => {
        const data = loadData();
        const chat = {
          id: Date.now().toString(),
          ...chatData,
          createdAt: new Date(),
        };
        data.chats.push(chat);
        saveData(data);
        return chat;
      },
      findMany: async (args) => {
        const data = loadData();
        return data.chats;
      },
    },
    message: {
      create: async ({ data: msgData }) => {
        const data = loadData();
        const msg = {
          id: Date.now().toString(),
          ...msgData,
          createdAt: new Date(),
        };
        data.messages.push(msg);
        saveData(data);
        return msg;
      },
      findMany: async (args) => {
        const data = loadData();
        if (args && args.where && args.where.chatId) {
          return data.messages.filter((m) => m.chatId === args.where.chatId);
        }
        return data.messages;
      },
      update: async (args) => {
        const data = loadData();
        const msg = data.messages.find((m) => m.id === args.where.id);
        if (msg) {
          msg.content = args.data.content;
          saveData(data);
          return msg;
        }
        return null;
      },
      delete: async (args) => {
        const data = loadData();
        data.messages = data.messages.filter((m) => m.id !== args.where.id);
        saveData(data);
        return { id: args.where.id };
      },
    },
    status: { create: async () => ({}) },
  };
}
const upload = multer({ storage: multer.memoryStorage() });

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Origin",
    "X-Requested-With",
    "Accept",
    "bypass-tunnel-reminder",
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(
    "<h1>ME Communications API is running</h1><p>Please use the frontend to interact with the app.</p>",
  );
});

// Basic health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "ME Comunications API is running" });
});

// --- Auth Routes ---
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const twilioClient =
  twilioSid &&
  twilioAuthToken &&
  twilioPhoneNumber &&
  twilioSid.startsWith("AC")
    ? twilio(twilioSid, twilioAuthToken)
    : null;

// --- Auth & Safety Storage ---
global.tempOTPs = global.tempOTPs || {};
global.reports = global.reports || []; // Store reports in memory for demo

const OTP_TTL_MS = 5 * 60 * 1000;

function normalizePhoneNumber(phone) {
  if (!phone) return "";
  return phone.toString().trim().replace(/[\s()-]/g, "");
}

function isOtpExpired(entry) {
  return !entry || !entry.expiresAt || Date.now() > entry.expiresAt;
}

app.post("/api/auth/send-otp", async (req, res) => {
  let { phone } = req.body;
  phone = normalizePhoneNumber(phone);
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  if (!twilioClient || !twilioPhoneNumber) {
    return res.status(503).json({
      error:
        "Twilio non configurato. Compila TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_PHONE_NUMBER per inviare SMS veri.",
    });
  }

  try {
      await twilioClient.messages.create({
        body: `Il tuo codice di verifica ME Comunications è: ${otp}`,
        from: twilioPhoneNumber,
        to: phone,
      });
      global.tempOTPs = global.tempOTPs || {};
      global.tempOTPs[phone] = {
        code: otp,
        expiresAt: Date.now() + OTP_TTL_MS,
      };

      console.log(`[AUTH] OTP inviato via SMS a ${phone}`);
      res.json({ success: true, message: "OTP inviato via SMS" });
    } catch (err) {
      console.error("Twilio Error:", err);
      res.status(500).json({ error: "Errore invio SMS" });
    }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  let { phone, otp } = req.body;
  phone = normalizePhoneNumber(phone);
  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone number and OTP required" });
  }

  const storedOtp = global.tempOTPs ? global.tempOTPs[phone] : null;

  console.log(
    `[AUTH] Verifica per ${phone}. Ricevuto: "${otp}", Stato: "${
      storedOtp ? "presente" : "assente"
    }"`,
  );

  if (
    storedOtp &&
    !isOtpExpired(storedOtp) &&
    storedOtp.code.toString() === otp.toString()
  ) {
    try {
      const user = await prisma.user.upsert({
        where: { phoneNumber: phone },
        update: { isOnline: true },
        create: { phoneNumber: phone, isOnline: true },
      });
      delete global.tempOTPs[phone];
      res.json({ success: true, token: `jwt-${user.id}`, user });
    } catch (error) {
      console.error("[DATABASE ERROR]", error);
      res.status(500).json({ error: error.message });
    }
  } else {
    if (storedOtp && isOtpExpired(storedOtp)) {
      delete global.tempOTPs[phone];
    }
    res.status(400).json({ error: "OTP non valido o scaduto" });
  }
});

// --- Media Upload ---
app.get("/api/messages/:chatId", async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { chatId: req.params.chatId },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/messages/:id", async (req, res) => {
  try {
    await prisma.message.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload", upload.single("media"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const type = req.body.type || "image";

  console.log(
    `[UPLOAD] Receiving ${type}: ${req.file.originalname} (${req.file.size} bytes)`,
  );

  try {
    let url;
    if (type === "image") {
      url = await uploadAndCompressImage(
        req.file.buffer,
        req.file.originalname,
      );
    } else {
      url = await uploadMedia(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );
    }

    console.log(`[UPLOAD] Success: ${url}`);
    res.json({ success: true, url });
  } catch (err) {
    console.error("[UPLOAD ERROR]", err);
    res
      .status(500)
      .json({
        error: "Errore durante il caricamento del file. Per favore riprova.",
      });
  }
});

// --- Contact & Group Routes ---
app.post("/api/contacts/import", upload.single("csvFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const results = [];
  const { userId } = req.body;
  const stream = require("stream");
  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);
  bufferStream
    .pipe(
      csv({ separator: req.file.buffer.toString().includes(";") ? ";" : "," }),
    ) // Auto-detect separator
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      try {
        console.log("[CSV] Inizio importazione per userId:", userId);

        // Pulizia contatti precedenti per questo utente per evitare duplicati
        await prisma.contact.deleteMany({ where: { userId: userId } });

        // Dedup results in-memory first
        const uniqueMap = new Map();
        for (const r of results) {
          const keys = Object.keys(r);
          const name =
            r.name ||
            r.contactName ||
            r.Nome ||
            r.nome ||
            r[keys[0]] ||
            "Sconosciuto";
          let phone =
            r.phone || r.contactPhone || r.Telefono || r.telefono || r[keys[1]];

          if (!phone || phone === "N/A") {
            // Deterministic ID based on name to prevent duplicates on re-import
            phone = "TEMP-" + Buffer.from(name).toString("hex").substr(0, 10);
          }

          uniqueMap.set(name + phone, { name, phone });
        }

        for (const [key, contact] of uniqueMap) {
          await prisma.contact.upsert({
            where: {
              userId_contactPhone: {
                userId: userId,
                contactPhone: contact.phone,
              },
            },
            update: { contactName: contact.name },
            create: {
              userId: userId,
              contactPhone: contact.phone,
              contactName: contact.name,
            },
          });
        }
        res.json({ success: true, count: uniqueMap.size });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
});

app.get("/api/contacts/:userId", async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: req.params.userId },
    });

    // Check which contacts are already users
    const enrichedContacts = await Promise.all(
      contacts.map(async (c) => {
        const targetUser = await prisma.user.findUnique({
          where: { phoneNumber: c.contactPhone },
        });
        return { ...c, targetUserId: targetUser ? targetUser.id : null };
      }),
    );

    res.json(enrichedContacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/groups/create", async (req, res) => {
  const { name, adminId, participantIds, isGroup } = req.body;
  try {
    const chat = await prisma.chat.create({
      data: {
        isGroup: true,
        name,
        adminId, // In a real app we'd have a participants relation
      },
    });
    res.json({ success: true, chat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/chats/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const groups =
      prisma.chat && prisma.chat.findMany
        ? await prisma.chat.findMany({ where: { isGroup: true } })
        : [];

    // Fetch contacts for this user
    let contacts = await prisma.contact.findMany({ where: { userId: userId } });

    // Fallback logic for demo/testing: if no contacts, try the mock user ID
    if (contacts.length === 0 && userId !== "mock-user-id-123") {
      contacts = await prisma.contact.findMany({
        where: { userId: "mock-user-id-123" },
      });
    }

    // Check which contacts are already users to enable real P2P
    const enrichedContacts = await Promise.all(
      contacts.map(async (c) => {
        const targetUser = await prisma.user.findUnique({
          where: { phoneNumber: c.contactPhone },
        });
        return {
          ...c,
          isGroup: false,
          targetUserId: targetUser ? targetUser.id : c.contactPhone, // Use phone as fallback ID
        };
      }),
    );

    const sidebarItems = [
      ...enrichedContacts,
      ...groups.map((g) => ({
        id: g.id,
        contactName: g.name,
        isGroup: true,
        contactPhone: "Gruppo",
        targetUserId: g.id,
      })),
    ];

    res.json(sidebarItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post Status with optional audio mix
app.post(
  "/api/status/post",
  upload.fields([
    { name: "media", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files.media)
      return res.status(400).json({ error: "No media uploaded" });

    const { userId } = req.body;
    const mediaFile = req.files.media[0];
    const audioFile = req.files.audio ? req.files.audio[0] : null;

    try {
      let finalUrl;
      if (audioFile) {
        // Logic to mix audio and video/image using FFmpeg
        const tempMedia = path.join(
          os.tmpdir(),
          `temp_${Date.now()}_${mediaFile.originalname}`,
        );
        const tempAudio = path.join(
          os.tmpdir(),
          `temp_${Date.now()}_${audioFile.originalname}`,
        );
        const output = path.join(os.tmpdir(), `status_${Date.now()}.mp4`);

        fs.writeFileSync(tempMedia, mediaFile.buffer);
        fs.writeFileSync(tempAudio, audioFile.buffer);

        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(tempMedia)
            .input(tempAudio)
            .outputOptions("-c:v copy")
            .outputOptions("-c:a aac")
            .outputOptions("-map 0:v:0")
            .outputOptions("-map 1:a:0")
            .save(output)
            .on("end", resolve)
            .on("error", reject);
        });

        const outputBuffer = fs.readFileSync(output);
        finalUrl = await uploadMedia(outputBuffer, "status.mp4", "video/mp4");

        // Cleanup
        fs.unlinkSync(tempMedia);
        fs.unlinkSync(tempAudio);
        fs.unlinkSync(output);
      } else {
        finalUrl = await uploadMedia(
          mediaFile.buffer,
          mediaFile.originalname,
          mediaFile.mimetype,
        );
      }

      await prisma.status.create({
        data: {
          userId,
          mediaUrl: finalUrl,
          mediaType: "video",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      res.json({ success: true, url: finalUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.get("/api/status", async (req, res) => {
  try {
    const statuses = await prisma.status.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { user: true },
    });
    res.json(statuses);
  } catch (err) {
    // If mock, just return empty for now or mock data
    res.json([]);
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({ take: 20 });
    res.json(users);
  } catch (err) {
    res.json([]);
  }
});

// --- Blocking & Reporting ---
app.post("/api/users/block", async (req, res) => {
  const { userId, targetId, isGroup } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const blockedList = user.blockedIds || [];
    if (!blockedList.includes(targetId)) {
      blockedList.push(targetId);
      await prisma.user.update({
        where: { id: userId },
        data: { blockedIds: blockedList },
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users/report", async (req, res) => {
  const { userId, targetId, reason } = req.body;

  // In-memory report storage
  global.reports.push({ userId, targetId, reason, timestamp: new Date() });

  console.log(
    `[SAFETY] Report received: User ${userId} reported ${targetId} for: ${reason}`,
  );

  // Auto-block logic: if a user gets more than 5 reports, flag them in the system
  const targetReports = global.reports.filter((r) => r.targetId === targetId);
  if (targetReports.length >= 5) {
    console.warn(
      `[SAFETY ALERT] User ${targetId} has reached the report threshold!`,
    );
  }

  res.json({ success: true });
});

// --- Socket.io ---
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.on("register", (userId) => {
    socket.userId = userId;
    socket.join(`user_${userId}`);
    io.emit("user_status", { userId, isOnline: true });
  });
  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`);
  });
  socket.on("send_message", async (data) => {
    const { senderId, chatId, content, type, mediaUrl, recipientId } = data;

    // Bot Analysis
    const botResult = meBot.analyzeMessage(content || "", senderId);
    if (botResult.shouldBlock) {
      console.log(
        `[BOT BAN] Blocking message from ${senderId}: ${botResult.reason}`,
      );
      socket.emit("bot_notification", {
        message: `Il tuo account è stato sospeso: ${botResult.reason}`,
        type: "error",
      });
      return;
    }

    const isSpam = botResult.isSpam;

    try {
      // Check if recipient has blocked sender
      if (recipientId) {
        const recipient = await prisma.user.findUnique({
          where: { id: recipientId },
        });
        if (
          recipient &&
          recipient.blockedIds &&
          recipient.blockedIds.includes(senderId)
        ) {
          console.log(
            `[BLOCK] Message from ${senderId} blocked by ${recipientId}`,
          );
          return;
        }
      }

      const message = await prisma.message.create({
        data: {
          content,
          mediaUrl,
          senderId,
          chatId,
          mediaType: type || "text",
          isSpam,
        },
      });

      io.in(`chat_${chatId}`).emit("receive_message", {
        ...data,
        id: message.id,
        isSpam,
      });
    } catch (err) {
      console.error("Socket error in send_message:", err);
    }
  });

  socket.on("edit_message", async (data) => {
    const { id, content, chatId } = data;
    try {
      await prisma.message.update({
        where: { id },
        data: { content },
      });
      io.in(`chat_${chatId}`).emit("message_edited", data);
    } catch (err) {
      console.error("Error editing message:", err);
    }
  });

  socket.on("add_reaction", async (data) => {
    const { messageId, emoji, chatId, userId } = data;
    try {
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      let reactions = msg.reactions || [];
      // Simple reaction logic: one reaction per user
      reactions = reactions.filter((r) => r.userId !== userId);
      reactions.push({ userId, emoji });

      await prisma.message.update({
        where: { id: messageId },
        data: { reactions },
      });

      io.in(`chat_${chatId}`).emit("reaction_added", { messageId, reactions });
    } catch (err) {
      console.error("Error adding reaction:", err);
    }
  });

  socket.on("delete_message", async (data) => {
    const { id, chatId } = data;
    try {
      await prisma.message.delete({ where: { id } });
      io.in(`chat_${chatId}`).emit("message_deleted", { id });
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  });

  // --- WebRTC Signaling ---
  socket.on("call_user", async ({ to, offer }) => {
    try {
      const recipient = await prisma.user.findUnique({ where: { id: to } });
      if (
        recipient &&
        recipient.blockedIds &&
        recipient.blockedIds.includes(socket.userId)
      ) {
        console.log(`[BLOCK] Call from ${socket.userId} to ${to} blocked.`);
        return;
      }
      console.log(`[CALL] da ${socket.userId} a ${to}`);
      socket
        .to(`user_${to}`)
        .emit("call_incoming", { from: socket.userId, offer });
    } catch (err) {
      console.error("Socket error in call_user:", err);
    }
  });

  socket.on("answer_call", ({ to, answer }) => {
    console.log(`[CALL] risposta per ${to}`);
    socket.to(`user_${to}`).emit("call_answered", { answer });
  });

  socket.on("ice_candidate", ({ to, candidate }) => {
    socket.to(`user_${to}`).emit("ice_candidate", { candidate });
  });

  socket.on("end_call", ({ to }) => {
    socket.to(`user_${to}`).emit("call_ended");
  });
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
