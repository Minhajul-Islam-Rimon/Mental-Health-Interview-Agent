// server.js (with improved crisis detection + dynamic start)
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
const PORT = 5000;
const JWT_SECRET = "your-secret-key";  // Use dotenv in production
const OLLAMA_URL = "http://localhost:11434/api/chat";

app.use(cors());
app.use(express.json());

// ✅ MongoDB connection
mongoose.connect("mongodb+srv://minhajulislamrimon28:vb3ZKLqxjaiZRVXB@cluster0.fpjdx66.mongodb.net/mindcare?retryWrites=true&w=majority")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB error:", err));


const User = mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String
}));
const Chat = mongoose.model("Chat", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  messages: [{ role: String, content: String, timestamp: { type: Date, default: Date.now } }],
  crisisDetected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}));

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ✅ Signup
app.post("/api/signup", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await User.create({ ...req.body, password: hashedPassword });
    res.status(201).json({ message: "✅ User created" });
  } catch {
    res.status(400).json({ error: "Email already in use" });
  }
});

// ✅ Login
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.password)))
    return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, name: user.name });
});

// ✅ Chat endpoint
app.post("/api/chat", verifyToken, async (req, res) => {
  const history = req.body.history || [];
  
  // 📝 Retrieve latest chat for this user
  let latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });

  // 🚨 Reset crisisDetected flag when starting a new conversation (if no previous chat or if flag is set)
  if (latestChat && latestChat.crisisDetected) {
    // Manually reset the crisisDetected flag to false
    latestChat.crisisDetected = false;
    await latestChat.save(); // save the reset flag
  }

  // 🟢 Start dynamic conversation if no history
  if (history.length === 0) {
    const introMessage = "Hello, I’m your mental health assistant. Let’s start a short PHQ-9 interview.";
    const firstQuestion = "Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";
    await Chat.create({
      userId: req.user.userId,
      messages: [
        { role: "assistant", content: introMessage },
        { role: "assistant", content: firstQuestion }
      ]
    });
    return res.json({ reply: `${introMessage} ${firstQuestion}` });
  }

  // 🚨 Crisis Detection (check all user inputs)
  const crisisKeywords = /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
  const userMessages = history.filter(msg => msg.role === "user");
  const crisisDetected = userMessages.some(msg => crisisKeywords.test(msg.content));

  if (crisisDetected) {
    const crisisReply = "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
    await Chat.create({
      userId: req.user.userId,
      messages: history.concat({ role: "assistant", content: crisisReply }),
      crisisDetected: true // Set flag here after detecting crisis
    });
    return res.json({ reply: crisisReply });
  }

  // 🌱 Continue interview (no crisis detected)
  const response = await axios.post(OLLAMA_URL, {
    model: "llama3",
    stream: false,
    messages: [
      {
        role: "system",
        content: `
You are a compassionate PHQ-9 interviewer.

- Ask ONE question at a time based on the user's last answer.
- Respond with "END" when the interview is complete.
- Avoid long summaries or advice.
        `.trim(),
      },
      ...history
    ]
  });

  let reply = response.data.message?.content?.trim() || "(No response)";

  // ✅ Auto score on END
  if (reply.includes("END")) {
    let totalScore = 0;
    let userAnswers = history.filter(msg => msg.role === "user");
    for (let i = 0; i < userAnswers.length; i++) {
      const prompt = `
Score this PHQ-9 answer from 0-3:
Q: ${userAnswers[i].content}
0 = Not at all
1 = Several days
2 = More than half the days
3 = Nearly every day
Only return the digit.`;
      const scoreRes = await axios.post(OLLAMA_URL, {
        model: "llama3",
        stream: false,
        messages: [{ role: "user", content: prompt }]
      });
      const score = parseInt(scoreRes.data.message?.content?.trim());
      if ([0, 1, 2, 3].includes(score)) totalScore += score;
    }

    const severity = totalScore >= 20 ? "Severe" :
      totalScore >= 15 ? "Moderately Severe" :
      totalScore >= 10 ? "Moderate" :
      totalScore >= 5 ? "Mild" : "Minimal";

    reply += `
Thank you for your time!
PHQ-9 Total Score: ${totalScore}
📊 Severity: ${severity}
(This is not a formal diagnosis. Please consult a healthcare professional.)
`;
  }

  // Save chat after processing
  await Chat.create({
    userId: req.user.userId,
    messages: history.concat({ role: "assistant", content: reply })
  });

  // Send the response to the user
  res.json({ reply });
});




// ✅ Chat history
app.get("/api/chat-history", verifyToken, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
  res.json(chats);
});
// DELETE Route to delete a chat
app.delete("/api/chat/:id", verifyToken, async (req, res) => {
  try {
    const chatId = req.params.id;
    const chat = await Chat.findOneAndDelete({ _id: chatId, userId: req.user.userId });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json({ message: "Chat deleted successfully" });
  } catch (err) {
    console.error("Error deleting chat:", err);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});


app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
