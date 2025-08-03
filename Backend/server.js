// server.js (robust: always saves chat, robust scoring, never mutates messages)
const phq9 = require("./phq9.js");
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

// MongoDB connection
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

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await User.create({ ...req.body, password: hashedPassword });
    res.status(201).json({ message: "✅ User created" });
  } catch {
    res.status(400).json({ error: "Email already in use" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.password)))
    return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, name: user.name });
});

// ======= CHAT ENDPOINT: robust saving & scoring =======
app.post("/api/chat", verifyToken, async (req, res) => {
  const history = req.body.history || [];
  let latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });

  if (latestChat && latestChat.crisisDetected) {
    latestChat.crisisDetected = false;
    await latestChat.save();
  }

  if (history.length === 0 || !latestChat || latestChat.messages.length === 0) {
    const introMessage = "Hello, I’m your mental health assistant. Let’s start a short PHQ-9 interview.";
    const firstQuestion = "Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";
    latestChat = await Chat.create({
      userId: req.user.userId,
      messages: [
        { role: "assistant", content: introMessage },
        { role: "assistant", content: firstQuestion }
      ]
    });
    return res.json({ reply: `${introMessage} ${firstQuestion}` });
  }

  const crisisKeywords = /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
  const userMessages = history.filter(msg => msg.role === "user");
  const crisisDetected = userMessages.some(msg => crisisKeywords.test(msg.content));
  if (crisisDetected) {
    const crisisReply = "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
    latestChat.messages = history.concat({ role: "assistant", content: crisisReply });
    latestChat.crisisDetected = true;
    await latestChat.save();
    return res.json({ reply: crisisReply });
  }

  const response = await axios.post(OLLAMA_URL, {
    model: "llama3",
    stream: false,
    messages: [
      {
        role: "system",
        content: `
You are a warm, conversational interviewer conducting the PHQ-9 depression assessment.
- Paraphrase or rephrase each topic in your own words—never robotic or clinical.
- Never mention or show any scoring scale, rubric, or numbers to the user.
- If a user's answer is unclear, ask a gentle follow-up in new words. Do NOT tell them how to answer.
- Never say "please rate", "using words like...", or show options or numbers.
- Move to the next topic only when confident.
- At the end, say "END" and briefly summarize (no score, rubric, or explanation in chat).
- Never mention PHQ-9 or diagnosis in the chat—just move through the topics naturally.
        `.trim(),
      },
      ...history,
    ],
  });

  let reply = response.data.message?.content?.trim() || "(No response)";
  reply = reply
    .replace(/Here['’]s the rubric:.*?(\n|$)/gi, '')
    .replace(/(Minimal symptoms|Mild symptoms|Moderate symptoms|Moderately severe symptoms|Severe symptoms).*/gi, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  if (/END/i.test(reply)) {
    let totalScore = 0;
    let userAnswers = history.filter(msg => msg.role === "user");
    let clarifiedAnswers = [];
    let askClarifyNow = false;
    let clarifyIdx = null;

    for (let i = 0; i < phq9.length; i++) {
      let questionText = phq9[i].question;
      let userText = userAnswers[i]?.content || "";
      let gotScore = false;
      let score = null;
      let attempts = 0;

      while (!gotScore && attempts < 2) {
        const scoringPrompt = `
Given this PHQ-9 question and user's answer, reply with ONLY a digit (0, 1, 2, or 3) for the best fit.
If unsure or unclear, reply exactly: "UNCLEAR".

Question: ${questionText}
User answer: ${userText}
0 = Not at all
1 = Several days
2 = More than half the days
3 = Nearly every day
Your reply:
        `.trim();

        const scoreRes = await axios.post(OLLAMA_URL, {
          model: "llama3",
          stream: false,
          messages: [{ role: "user", content: scoringPrompt }],
        });
        const raw = scoreRes.data.message?.content?.trim();
        score = parseInt(raw);
        if ([0, 1, 2, 3].includes(score)) {
          gotScore = true;
          clarifiedAnswers.push({ question: questionText, answer: userText, score });
        } else if (/UNCLEAR/i.test(raw) && attempts === 0) {
          askClarifyNow = true;
          clarifyIdx = i;
          break;
        }
        attempts++;
      }

      if (askClarifyNow) break;
      if (!gotScore) clarifiedAnswers.push({ question: questionText, answer: userText, score: 0 });
      if (gotScore) totalScore += clarifiedAnswers[clarifiedAnswers.length - 1].score;
    }

    if (askClarifyNow && clarifyIdx !== null) {
      const clarifyMsg = `Just to be sure, could you tell me in your own words how often "${phq9[clarifyIdx].question}" has applied to you recently?`;
      latestChat.messages = history.concat({ role: "assistant", content: clarifyMsg });
      await latestChat.save();
      return res.json({ reply: clarifyMsg });
    }

    const severity = totalScore >= 20 ? "Severe"
                    : totalScore >= 15 ? "Moderately Severe"
                    : totalScore >= 10 ? "Moderate"
                    : totalScore >= 5  ? "Mild"
                    : "Minimal";

    reply += `
Thank you for completing the interview. 
If you would like to review your results or see a summary, please visit your Reports page.
Take care, and remember this is just a screening—if you need help, don’t hesitate to reach out.
    `.trim();

    const reportSummary = `
PHQ-9 Total Score: ${totalScore}
Severity: ${severity}
(Automatically scored for reporting. Not shown to user.)
    `.trim();

    latestChat.messages = history.concat(
      { role: "assistant", content: reply },
      { role: "assistant", content: reportSummary }
    );
    await latestChat.save();
    return res.json({ reply });
  } else {
    latestChat.messages = history.concat({ role: "assistant", content: reply });
    await latestChat.save();
    return res.json({ reply });
  }
}); // ✅ FIXED: closing the /api/chat route

// Chat history
app.get("/api/chat-history", verifyToken, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
  res.json(chats);
});

// Delete chat
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

// Single latest report
app.get("/api/report", verifyToken, async (req, res) => {
  try {
    const latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });
    if (!latestChat) {
      return res.json({ error: "No report found for this user." });
    }
    let reportMsg = [...latestChat.messages].reverse().find(
      m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
    );
    let score = "N/A";
    let severity = "N/A";
    let summary = "";
    if (reportMsg) {
      const scoreMatch = reportMsg.content.match(/PHQ-9 Total Score: (\d+)/);
      const severityMatch = reportMsg.content.match(/Severity: ([\w\s]+)/);
      if (scoreMatch) score = scoreMatch[1];
      if (severityMatch) severity = severityMatch[1];
      summary = reportMsg.content;
    }
    const user = await User.findById(req.user.userId);
    res.json({
      name: user?.name || "",
      date: latestChat.createdAt,
      score,
      severity,
      summary
    });
  } catch (err) {
    console.error("Report fetch error:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// Multi-report (date range)
app.get("/api/reports-by-date", verifyToken, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: "Missing start or end date." });

    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    const chats = await Chat.find({
      userId: req.user.userId,
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: -1 });

    const reports = chats.map(chat => {
      const reportMsg = [...chat.messages].reverse().find(
        m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
      );
      const scoreMatch = reportMsg?.content.match(/PHQ-9 Total Score: (\d+)/);
      const severityMatch = reportMsg?.content.match(/Severity: ([\w\s]+)/);
      return reportMsg
        ? {
            id: chat._id,
            date: chat.createdAt,
            score: scoreMatch ? scoreMatch[1] : "N/A",
            severity: severityMatch ? severityMatch[1] : "N/A",
            summary: reportMsg.content
          }
        : null;
    }).filter(Boolean);

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
