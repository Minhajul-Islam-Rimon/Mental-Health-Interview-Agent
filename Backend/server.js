// // server.js (robust: always saves chat, robust scoring, never mutates messages)
// const phq9 = require("./phq9.js");
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const axios = require("axios");
// const http = require("http");
// const https = require("https");

// const app = express();
// const PORT = 5000;
// const JWT_SECRET = "your-secret-key"; // Use dotenv in production

// // --- Ollama client: force IPv4 + better errors ---
// const OLLAMA_BASE = process.env.OLLAMA_URL || "http://127.0.0.1:11434"; // IPv4 default
// const ax = axios.create({
//   baseURL: OLLAMA_BASE,
//   timeout: 30000,
//   httpAgent: new http.Agent({ keepAlive: true, family: 4 }),
//   httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
// });

// async function callOllamaChat(payload) {
//   try {
//     const { data } = await ax.post("/api/chat", payload);
//     return data;
//   } catch (err) {
//     const msg =
//       err?.code === "ECONNREFUSED"
//         ? "Cannot reach Ollama at 127.0.0.1:11434. Is it running? (Use `ollama serve`)"
//         : (err?.response?.data?.error || err.message);
//     console.error("❌ Ollama error:", msg, { baseURL: OLLAMA_BASE });
//     throw new Error(msg);
//   }
// }

// // Health endpoint to verify backend → Ollama connectivity
// app.get("/health/ollama", async (_req, res) => {
//   try {
//     const { data } = await ax.get("/api/tags");
//     res.json({ ok: true, baseURL: OLLAMA_BASE, models: data });
//   } catch (e) {
//     res.status(503).json({ ok: false, baseURL: OLLAMA_BASE, error: e.message });
//   }
// });

// app.use(cors());
// app.use(express.json());

// // MongoDB connection
// mongoose
//   .connect(
//     "mongodb+srv://minhajulislamrimon28:vb3ZKLqxjaiZRVXB@cluster0.fpjdx66.mongodb.net/mindcare?retryWrites=true&w=majority"
//   )
//   .then(() => console.log("✅ Connected to MongoDB"))
//   .catch((err) => console.error("❌ MongoDB error:", err));

// const User = mongoose.model(
//   "User",
//   new mongoose.Schema({
//     name: String,
//     email: { type: String, unique: true },
//     password: String,
//   })
// );
// const Chat = mongoose.model(
//   "Chat",
//   new mongoose.Schema({
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//     messages: [
//       { role: String, content: String, timestamp: { type: Date, default: Date.now } },
//     ],
//     crisisDetected: { type: Boolean, default: false },
//     createdAt: { type: Date, default: Date.now },
//   })
// );

// function verifyToken(req, res, next) {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ error: "No token provided" });
//   try {
//     req.user = jwt.verify(token, JWT_SECRET);
//     next();
//   } catch {
//     return res.status(401).json({ error: "Invalid token" });
//   }
// }

// // Signup
// app.post("/api/signup", async (req, res) => {
//   try {
//     const hashedPassword = await bcrypt.hash(req.body.password, 10);
//     await User.create({ ...req.body, password: hashedPassword });
//     res.status(201).json({ message: "✅ User created" });
//   } catch {
//     res.status(400).json({ error: "Email already in use" });
//   }
// });

// // Login
// app.post("/api/login", async (req, res) => {
//   const user = await User.findOne({ email: req.body.email });
//   if (!user || !(await bcrypt.compare(req.body.password, user.password)))
//     return res.status(401).json({ error: "Invalid credentials" });
//   const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, {
//     expiresIn: "1d",
//   });
//   res.json({ token, name: user.name });
// });

// // ======= CHAT ENDPOINT: robust saving & scoring =======
// app.post("/api/chat", verifyToken, async (req, res) => {
//   const history = req.body.history || [];
//   let latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });

//   if (latestChat && latestChat.crisisDetected) {
//     latestChat.crisisDetected = false;
//     await latestChat.save();
//   }

//   if (history.length === 0 || !latestChat || latestChat.messages.length === 0) {
//     const introMessage =
//       "Hello, I’m your mental health assistant. Let’s start a short PHQ-9 interview.";
//     const firstQuestion =
//       "Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";
//     latestChat = await Chat.create({
//       userId: req.user.userId,
//       messages: [
//         { role: "assistant", content: introMessage },
//         { role: "assistant", content: firstQuestion },
//       ],
//     });
//     return res.json({ reply: `${introMessage} ${firstQuestion}` });
//   }

//   const crisisKeywords =
//     /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
//   const userMessages = history.filter((msg) => msg.role === "user");
//   const crisisDetected = userMessages.some((msg) => crisisKeywords.test(msg.content));
//   if (crisisDetected) {
//     const crisisReply =
//       "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
//     latestChat.messages = history.concat({ role: "assistant", content: crisisReply });
//     latestChat.crisisDetected = true;
//     await latestChat.save();
//     return res.json({ reply: crisisReply });
//   }

//   // --- call Ollama for main chat turn ---
//   const response = await callOllamaChat({
//     model: "llama3",
//     stream: false,
//     messages: [
//       {
//         role: "system",
//         content: `
// You are a warm, conversational interviewer conducting the PHQ-9 depression assessment.
// - Paraphrase or rephrase each topic in your own words—never robotic or clinical.
// - Never mention or show any scoring scale, rubric, or numbers to the user.
// - If a user's answer is unclear, ask a gentle follow-up in new words. Do NOT tell them how to answer.
// - Never say "please rate", "using words like...", or show options or numbers.
// - Move to the next topic only when confident.
// - At the end, say "END" and briefly summarize (no score, rubric, or explanation in chat).
// - Never mention PHQ-9 or diagnosis in the chat—just move through the topics naturally.
//         `.trim(),
//       },
//       ...history,
//     ],
//   });

//   let reply = response.message?.content?.trim() || "(No response)";
//   reply = reply
//     .replace(/Here['’]s the rubric:.*?(\n|$)/gi, "")
//     .replace(
//       /(Minimal symptoms|Mild symptoms|Moderate symptoms|Moderately severe symptoms|Severe symptoms).*/gi,
//       ""
//     )
//     .replace(/\n\s*\n/g, "\n")
//     .trim();

//   if (/END/i.test(reply)) {
//     let totalScore = 0;
//     let userAnswers = history.filter((msg) => msg.role === "user");
//     let clarifiedAnswers = [];
//     let askClarifyNow = false;
//     let clarifyIdx = null;

//     for (let i = 0; i < phq9.length; i++) {
//       let questionText = phq9[i].question;
//       let userText = userAnswers[i]?.content || "";
//       let gotScore = false;
//       let score = null;
//       let attempts = 0;

//       while (!gotScore && attempts < 2) {
//         const scoringPrompt = `
// Given this PHQ-9 question and user's answer, reply with ONLY a digit (0, 1, 2, or 3) for the best fit.
// If unsure or unclear, reply exactly: "UNCLEAR".

// Question: ${questionText}
// User answer: ${userText}
// 0 = Not at all
// 1 = Several days
// 2 = More than half the days
// 3 = Nearly every day
// Your reply:
//         `.trim();

//         // --- call Ollama for scoring ---
//         const scoreRes = await callOllamaChat({
//           model: "llama3",
//           stream: false,
//           messages: [{ role: "user", content: scoringPrompt }],
//         });

//         const raw = scoreRes.message?.content?.trim();
//         score = parseInt(raw);
//         if ([0, 1, 2, 3].includes(score)) {
//           gotScore = true;
//           clarifiedAnswers.push({ question: questionText, answer: userText, score });
//         } else if (/UNCLEAR/i.test(raw) && attempts === 0) {
//           askClarifyNow = true;
//           clarifyIdx = i;
//           break;
//         }
//         attempts++;
//       }

//       if (askClarifyNow) break;
//       if (!gotScore)
//         clarifiedAnswers.push({ question: questionText, answer: userText, score: 0 });
//       if (gotScore) totalScore += clarifiedAnswers[clarifiedAnswers.length - 1].score;
//     }

//     if (askClarifyNow && clarifyIdx !== null) {
//       const clarifyMsg = `Just to be sure, could you tell me in your own words how often "${phq9[clarifyIdx].question}" has applied to you recently?`;
//       latestChat.messages = history.concat({ role: "assistant", content: clarifyMsg });
//       await latestChat.save();
//       return res.json({ reply: clarifyMsg });
//     }

//     const severity =
//       totalScore >= 20
//         ? "Severe"
//         : totalScore >= 15
//         ? "Moderately Severe"
//         : totalScore >= 10
//         ? "Moderate"
//         : totalScore >= 5
//         ? "Mild"
//         : "Minimal";

//     reply += `
// Thank you for completing the interview. 
// If you would like to review your results or see a summary, please visit your Reports page.
// Take care, and remember this is just a screening—if you need help, don’t hesitate to reach out.
//     `.trim();

//     const reportSummary = `
// PHQ-9 Total Score: ${totalScore}
// Severity: ${severity}
// (Automatically scored for reporting. Not shown to user.)
//     `.trim();

//     latestChat.messages = history.concat(
//       { role: "assistant", content: reply },
//       { role: "assistant", content: reportSummary }
//     );
//     await latestChat.save();
//     return res.json({ reply });
//   } else {
//     latestChat.messages = history.concat({ role: "assistant", content: reply });
//     await latestChat.save();
//     return res.json({ reply });
//   }
// }); // ✅ FIXED: closing the /api/chat route

// // Chat history
// app.get("/api/chat-history", verifyToken, async (req, res) => {
//   const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
//   res.json(chats);
// });

// // Delete chat
// app.delete("/api/chat/:id", verifyToken, async (req, res) => {
//   try {
//     const chatId = req.params.id;
//     const chat = await Chat.findOneAndDelete({
//       _id: chatId,
//       userId: req.user.userId,
//     });
//     if (!chat) {
//       return res.status(404).json({ error: "Chat not found" });
//     }
//     res.json({ message: "Chat deleted successfully" });
//   } catch (err) {
//     console.error("Error deleting chat:", err);
//     res.status(500).json({ error: "Failed to delete chat" });
//   }
// });

// // Single latest report
// app.get("/api/report", verifyToken, async (req, res) => {
//   try {
//     const latestChat = await Chat.findOne({ userId: req.user.userId }).sort({
//       createdAt: -1,
//     });
//     if (!latestChat) {
//       return res.json({ error: "No report found for this user." });
//     }
//     let reportMsg = [...latestChat.messages]
//       .reverse()
//       .find((m) => m.role === "assistant" && m.content.includes("PHQ-9 Total Score"));
//     let score = "N/A";
//     let severity = "N/A";
//     let summary = "";
//     if (reportMsg) {
//       const scoreMatch = reportMsg.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg.content.match(/Severity: ([\w\s]+)/);
//       if (scoreMatch) score = scoreMatch[1];
//       if (severityMatch) severity = severityMatch[1];
//       summary = reportMsg.content;
//     }
//     const user = await User.findById(req.user.userId);
//     res.json({
//       name: user?.name || "",
//       date: latestChat.createdAt,
//       score,
//       severity,
//       summary,
//     });
//   } catch (err) {
//     console.error("Report fetch error:", err);
//     res.status(500).json({ error: "Failed to fetch report" });
//   }
// });

// // Multi-report (date range)
// app.get("/api/reports-by-date", verifyToken, async (req, res) => {
//   try {
//     const { start, end } = req.query;
//     if (!start || !end)
//       return res.status(400).json({ error: "Missing start or end date." });

//     const startDate = new Date(start);
//     const endDate = new Date(end);
//     endDate.setHours(23, 59, 59, 999);

//     const chats = await Chat.find({
//       userId: req.user.userId,
//       createdAt: { $gte: startDate, $lte: endDate },
//     }).sort({ createdAt: -1 });

//     const reports = chats
//       .map((chat) => {
//         const reportMsg = [...chat.messages]
//           .reverse()
//           .find(
//             (m) => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//           );
//         const scoreMatch = reportMsg?.content.match(/PHQ-9 Total Score: (\d+)/);
//         const severityMatch = reportMsg?.content.match(/Severity: ([\w\s]+)/);
//         return reportMsg
//           ? {
//               id: chat._id,
//               date: chat.createdAt,
//               score: scoreMatch ? scoreMatch[1] : "N/A",
//               severity: severityMatch ? severityMatch[1] : "N/A",
//               summary: reportMsg.content,
//             }
//           : null;
//       })
//       .filter(Boolean);

//     res.json(reports);
//   } catch (err) {
//     res.status(500).json({ error: "Failed to fetch reports" });
//   }
// });
// // ===== HEALTH CHECK FOR OLLAMA =====
// app.get("/health/ollama", async (_req, res) => {
//   try {
//     const { data } = await axios.get("http://127.0.0.1:11434/api/tags");
//     res.json({ ok: true, baseURL: "http://127.0.0.1:11434", models: data });
//   } catch (e) {
//     res.status(503).json({ ok: false, error: e.message });
//   }
// });

// app.listen(PORT, () =>
//   console.log(`🚀 Server running on http://localhost:${PORT}`)
// );


//conversation worked but problem with followup and scoring

//new one .............

// server.js — free-flow PHQ-9 with reliable scoring + IPv4 Ollama + health check

// const phq9 = require("./phq9.js");
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const axios = require("axios");

// const app = express();
// const PORT = 5000;
// const JWT_SECRET = "your-secret-key"; // use dotenv in production

// // Force IPv4 for Ollama to avoid ::1 issues and allow overriding via env if needed
// const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
// const OLLAMA_CHAT = `${OLLAMA_BASE}/api/chat`;
// const OLLAMA_TAGS = `${OLLAMA_BASE}/api/tags`;

// app.use(cors());
// app.use(express.json());

// // ===== MongoDB =====
// mongoose.connect("mongodb+srv://minhajulislamrimon28:vb3ZKLqxjaiZRVXB@cluster0.fpjdx66.mongodb.net/mindcare?retryWrites=true&w=majority")
//   .then(() => console.log("✅ Connected to MongoDB"))
//   .catch(err => console.error("❌ MongoDB error:", err));

// const User = mongoose.model("User", new mongoose.Schema({
//   name: String,
//   email: { type: String, unique: true },
//   password: String
// }));

// // We add `answers` (per topic) and keep messages RAW (assistant messages include hidden [Qn] tags)
// const Chat = mongoose.model("Chat", new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   messages: [{ role: String, content: String, timestamp: { type: Date, default: Date.now } }],
//   answers: [{ index: Number, text: String }], // index = 1..9, text = user's latest answer for that topic
//   currentQ: { type: Number, default: 1 },     // optional state hint (not strictly required)
//   crisisDetected: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now }
// }));

// // ===== Auth =====
// function verifyToken(req, res, next) {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ error: "No token provided" });
//   try {
//     req.user = jwt.verify(token, JWT_SECRET);
//     next();
//   } catch {
//     return res.status(401).json({ error: "Invalid token" });
//   }
// }

// app.post("/api/signup", async (req, res) => {
//   try {
//     const hashedPassword = await bcrypt.hash(req.body.password, 10);
//     await User.create({ ...req.body, password: hashedPassword });
//     res.status(201).json({ message: "✅ User created" });
//   } catch {
//     res.status(400).json({ error: "Email already in use" });
//   }
// });

// app.post("/api/login", async (req, res) => {
//   const user = await User.findOne({ email: req.body.email });
//   if (!user || !(await bcrypt.compare(req.body.password, user.password)))
//     return res.status(401).json({ error: "Invalid credentials" });
//   const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
//   res.json({ token, name: user.name });
// });

// // ===== Helpers =====
// const SYSTEM_PROMPT = `
// You are a warm, conversational interviewer doing a PHQ-9 style check-in.

// Rules (IMPORTANT):
// - There are 9 core topics. Ask them naturally, one at a time, but you may ask brief, context-aware follow-ups when useful.
// - When you ask (or re-ask) a core topic, prefix that exact line with a tag: [Q1] .. [Q9].
// - Do NOT tag follow-ups (only the main topic line gets [Qn]).
// - Never expose any scoring or numeric scale, and never say "PHQ-9".
// - When you believe all 9 topics have been covered well enough, output a line that contains ONLY: [END]
// - Keep responses concise, friendly, and human.

// Core topics (for your internal use; do NOT list them to the user):
// Q1: Little interest or pleasure
// Q2: Feeling down/sad/hopeless
// Q3: Sleep problems
// Q4: Low energy / tired
// Q5: Appetite changes
// Q6: Feeling bad about self / failure
// Q7: Trouble concentrating
// Q8: Moving/speaking slow OR feeling restless
// Q9: Thoughts that life might not be worth living
// `.trim();

// function stripTagsForUser(text) {
//   return text
//     .replace(/\[Q([1-9])\]\s*/g, '') // hide [Qn]
//     .replace(/^\[END\]\s*$/gmi, '')  // hide [END] if present
//     .trim();
// }

// function extractLastQIndex(messages) {
//   // Find the most recent assistant message that included [Qn]
//   for (let i = messages.length - 1; i >= 0; i--) {
//     const m = messages[i];
//     if (m.role === "assistant") {
//       const match = m.content.match(/\[Q([1-9])\]/);
//       if (match) return parseInt(match[1], 10);
//     }
//   }
//   return null;
// }

// function buildClarifyMessage(qIndex) {
//   const qText = phq9[qIndex - 1].question;
//   return `Just to be sure, thinking about: "${qText}", how often has this applied to you recently?`;
// }

// async function scoreFromAnswers(answers) {
//   // answers: [{index:1..9, text:"..."}]
//   let totalScore = 0;
//   const found = new Map(answers.map(a => [a.index, (a.text || "").trim()]));

//   for (let i = 1; i <= 9; i++) {
//     const userText = (found.get(i) || "").trim();

//     // If completely missing, ask clarification first
//     if (!userText) {
//       return { needClarify: true, clarifyIndex: i };
//     }

//     let gotScore = false;
//     let score = 0;
//     let attempts = 0;

//     while (!gotScore && attempts < 2) {
//       const scoringPrompt = `
// Given this PHQ-9 topic and the user's answer, reply with ONLY a single digit 0, 1, 2, or 3 for frequency.
// If unclear, reply exactly "UNCLEAR" (all caps, no punctuation).

// Topic: ${phq9[i-1].question}
// User answer: ${userText}

// 0 = Not at all
// 1 = Several days
// 2 = More than half the days
// 3 = Nearly every day

// Your reply:`.trim();

//       const r = await axios.post(OLLAMA_CHAT, {
//         model: "llama3",
//         stream: false,
//         messages: [{ role: "user", content: scoringPrompt }]
//       });

//       const raw = (r.data.message?.content || "").trim();
//       const n = parseInt(raw, 10);

//       if ([0, 1, 2, 3].includes(n)) {
//         score = n;
//         gotScore = true;
//       } else if (/^UNCLEAR$/i.test(raw)) {
//         return { needClarify: true, clarifyIndex: i };
//       }
//       attempts++;
//     }

//     totalScore += score;
//   }

//   const severity = totalScore >= 20 ? "Severe"
//                 : totalScore >= 15 ? "Moderately Severe"
//                 : totalScore >= 10 ? "Moderate"
//                 : totalScore >= 5  ? "Mild"
//                 : "Minimal";

//   return { needClarify: false, totalScore, severity };
// }

// // ===== Chat endpoint =====
// app.post("/api/chat", verifyToken, async (req, res) => {
//   const userId = req.user.userId;
//   const history = req.body.history || []; // client history (display-only)
//   let latestChat = await Chat.findOne({ userId }).sort({ createdAt: -1 });

//   // Reset crisis flag if present
//   if (latestChat && latestChat.crisisDetected) {
//     latestChat.crisisDetected = false;
//     await latestChat.save();
//   }

//   // Start a brand-new session (our side creates the first tagged question)
//   if (!latestChat || latestChat.messages.length === 0 || history.length === 0) {
//     const intro = "Hello, I’m your mental health assistant. Let’s start a short check-in.";
//     const firstQ = "[Q1] Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";

//     latestChat = await Chat.create({
//       userId,
//       messages: [
//         { role: "assistant", content: intro },
//         { role: "assistant", content: firstQ }
//       ],
//       answers: [],
//       currentQ: 1
//     });

//     return res.json({ reply: `${intro} ${stripTagsForUser(firstQ)}` });
//   }

//   // Crisis detection in the new user message(s)
//   const crisisKeywords = /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
//   const newUserMsgs = history.filter(m => m.role === "user");
//   const crisisDetected = newUserMsgs.some(m => crisisKeywords.test(m.content || ""));
//   if (crisisDetected) {
//     const crisisReply = "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
//     latestChat.messages = latestChat.messages.concat({ role: "assistant", content: crisisReply });
//     latestChat.crisisDetected = true;
//     await latestChat.save();
//     return res.json({ reply: crisisReply });
//   }

//   // The user's latest message (what they just sent right now)
//   const lastUserMessage = newUserMsgs[newUserMsgs.length - 1]?.content || "";
//   if (!lastUserMessage) {
//     return res.json({ reply: "Could you share a bit more? I’m listening." });
//   }

//   // Attach the user's message to DB conversation
//   latestChat.messages.push({ role: "user", content: lastUserMessage });

//   // Determine which Q the user just answered using our RAW stored assistant messages
//   const activeQ = extractLastQIndex(latestChat.messages);
//   if (activeQ) {
//     latestChat.answers = latestChat.answers || [];
//     const existing = latestChat.answers.find(a => a.index === activeQ);
//     if (existing) existing.text = lastUserMessage;
//     else latestChat.answers.push({ index: activeQ, text: lastUserMessage });
//     latestChat.currentQ = Math.max(latestChat.currentQ || 1, activeQ);
//   }

//   await latestChat.save();

//   // Ask the model to produce the next step (free flow with tags)
//   const modelMessages = [
//     { role: "system", content: SYSTEM_PROMPT },
//     ...latestChat.messages // contains RAW assistant messages (with tags) and all user messages
//   ];

//   let rawReply = "";
//   try {
//     const response = await axios.post(OLLAMA_CHAT, {
//       model: "llama3",
//       stream: false,
//       messages: modelMessages
//     });
//     rawReply = (response.data.message?.content || "").trim();
//   } catch (e) {
//     console.error("Ollama error:", e?.message || e);
//     return res.status(502).json({ reply: "❌ Error contacting the assistant. Please try again." });
//   }

//   // Sanitize any rubric-like leaks (defensive)
//   rawReply = rawReply
//     .replace(/Here['’]s the rubric:.*?(\n|$)/gi, '')
//     .replace(/(Minimal symptoms|Mild symptoms|Moderate symptoms|Moderately severe symptoms|Severe symptoms).*/gi, '')
//     .replace(/\n\s*\n/g, '\n')
//     .trim();

//   // Save RAW assistant reply (with tags). Show stripped version to user.
//   latestChat.messages.push({ role: "assistant", content: rawReply });
//   await latestChat.save();

//   // If the model says [END], try to score from the stored answers
//   if (/\[END\]/i.test(rawReply)) {
//     const scored = await scoreFromAnswers(latestChat.answers || []);
//     if (scored.needClarify) {
//       const clarifyMsg = buildClarifyMessage(scored.clarifyIndex);
//       latestChat.messages.push({ role: "assistant", content: clarifyMsg });
//       await latestChat.save();
//       return res.json({ reply: clarifyMsg });
//     }

//     const { totalScore, severity } = scored;

//     // Build closing text for the user (no rubric/score shown in chat if you prefer)
//     const closing = `
// Thank you for completing the interview.
// If you would like to review your results or see a summary, please visit your Reports page.
// Take care, and remember this is just a screening—if you need help, don’t hesitate to reach out.
// `.trim();

//     // Store a hidden report message for the Reports page
//     const reportSummary = `
// PHQ-9 Total Score: ${totalScore}
// Severity: ${severity}
// (Automatically scored for reporting. Not shown to user.)
// `.trim();

//     latestChat.messages.push(
//       { role: "assistant", content: closing },
//       { role: "assistant", content: reportSummary }
//     );
//     await latestChat.save();

//     return res.json({ reply: closing });
//   }

//   // Otherwise, continue the conversation
//   const replyForUser = stripTagsForUser(rawReply) || "(No response)";
//   return res.json({ reply: replyForUser });
// });

// // ===== Chat history =====
// app.get("/api/chat-history", verifyToken, async (req, res) => {
//   const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
//   res.json(chats);
// });

// // ===== Delete chat =====
// app.delete("/api/chat/:id", verifyToken, async (req, res) => {
//   try {
//     const chatId = req.params.id;
//     const chat = await Chat.findOneAndDelete({ _id: chatId, userId: req.user.userId });
//     if (!chat) return res.status(404).json({ error: "Chat not found" });
//     res.json({ message: "Chat deleted successfully" });
//   } catch (err) {
//     console.error("Error deleting chat:", err);
//     res.status(500).json({ error: "Failed to delete chat" });
//   }
// });

// // ===== Single latest report =====
// app.get("/api/report", verifyToken, async (req, res) => {
//   try {
//     const latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });
//     if (!latestChat) return res.json({ error: "No report found for this user." });

//     const reportMsg = [...latestChat.messages].reverse().find(
//       m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//     );

//     let score = "N/A";
//     let severity = "N/A";
//     let summary = "";
//     if (reportMsg) {
//       const scoreMatch = reportMsg.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg.content.match(/Severity: ([\w\s]+)/);
//       if (scoreMatch) score = scoreMatch[1];
//       if (severityMatch) severity = severityMatch[1];
//       summary = reportMsg.content.replace(/^\[END\]\s*/i, "").trim();
//     }

//     const user = await User.findById(req.user.userId);
//     res.json({
//       name: user?.name || "",
//       date: latestChat.createdAt,
//       score,
//       severity,
//       summary
//     });
//   } catch (err) {
//     console.error("Report fetch error:", err);
//     res.status(500).json({ error: "Failed to fetch report" });
//   }
// });

// // ===== Multi-report (date range) =====
// app.get("/api/reports-by-date", verifyToken, async (req, res) => {
//   try {
//     const { start, end } = req.query;
//     if (!start || !end) return res.status(400).json({ error: "Missing start or end date." });

//     const startDate = new Date(start);
//     const endDate = new Date(end);
//     endDate.setHours(23, 59, 59, 999);

//     const chats = await Chat.find({
//       userId: req.user.userId,
//       createdAt: { $gte: startDate, $lte: endDate }
//     }).sort({ createdAt: -1 });

//     const reports = chats.map(chat => {
//       const reportMsg = [...chat.messages].reverse().find(
//         m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//       );
//       const scoreMatch = reportMsg?.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg?.content.match(/Severity: ([\w\s]+)/);
//       return reportMsg ? {
//         id: chat._id,
//         date: chat.createdAt,
//         score: scoreMatch ? scoreMatch[1] : "N/A",
//         severity: severityMatch ? severityMatch[1] : "N/A",
//         summary: reportMsg.content
//       } : null;
//     }).filter(Boolean);

//     res.json(reports);
//   } catch (err) {
//     res.status(500).json({ error: "Failed to fetch reports" });
//   }
// });

// // ===== Health check for Ollama =====
// app.get("/health/ollama", async (_req, res) => {
//   try {
//     const { data } = await axios.get(OLLAMA_TAGS);
//     res.json({ ok: true, baseURL: OLLAMA_BASE, models: data });
//   } catch (e) {
//     res.status(503).json({ ok: false, error: e.message });
//   }
// });

// app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

//*********** another one

// server.js — Free-flow PHQ-9 with reliable scoring + IPv4 Ollama + health check

// const phq9 = require("./phq9.js");
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const axios = require("axios");

// const app = express();
// const PORT = 5000;
// const JWT_SECRET = "your-secret-key"; // use dotenv in production

// // Force IPv4 for Ollama to avoid ::1 issues and allow overriding via env if needed
// const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
// const OLLAMA_CHAT = `${OLLAMA_BASE}/api/chat`;
// const OLLAMA_TAGS = `${OLLAMA_BASE}/api/tags`;

// app.use(cors());
// app.use(express.json());

// // ===== MongoDB =====
// mongoose.connect("mongodb+srv://minhajulislamrimon28:vb3ZKLqxjaiZRVXB@cluster0.fpjdx66.mongodb.net/mindcare?retryWrites=true&w=majority")
//   .then(() => console.log("✅ Connected to MongoDB"))
//   .catch(err => console.error("❌ MongoDB error:", err));

// const User = mongoose.model("User", new mongoose.Schema({
//   name: String,
//   email: { type: String, unique: true },
//   password: String
// }));

// // We add `answers` (per topic) and keep messages RAW (assistant messages include hidden [Qn] tags)
// const Chat = mongoose.model("Chat", new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   messages: [{ role: String, content: String, timestamp: { type: Date, default: Date.now } }],
//   answers: [{ index: Number, text: String }], // index = 1..9, text = user's latest answer for that topic
//   currentQ: { type: Number, default: 1 },     // optional state hint (not strictly required)
//   crisisDetected: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now }
// }));

// // ===== Auth =====
// function verifyToken(req, res, next) {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ error: "No token provided" });
//   try {
//     req.user = jwt.verify(token, JWT_SECRET);
//     next();
//   } catch {
//     return res.status(401).json({ error: "Invalid token" });
//   }
// }

// app.post("/api/signup", async (req, res) => {
//   try {
//     const hashedPassword = await bcrypt.hash(req.body.password, 10);
//     await User.create({ ...req.body, password: hashedPassword });
//     res.status(201).json({ message: "✅ User created" });
//   } catch {
//     res.status(400).json({ error: "Email already in use" });
//   }
// });

// app.post("/api/login", async (req, res) => {
//   const user = await User.findOne({ email: req.body.email });
//   if (!user || !(await bcrypt.compare(req.body.password, user.password)))
//     return res.status(401).json({ error: "Invalid credentials" });
//   const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
//   res.json({ token, name: user.name });
// });

// // ===== Helpers =====
// const SYSTEM_PROMPT = `
// You are a warm, conversational interviewer doing a PHQ-9 style check-in.

// Rules (IMPORTANT):
// - There are 9 core topics. Ask them naturally, one at a time, but you may ask brief, context-aware follow-ups when useful.
// - When you ask (or re-ask) a core topic, prefix that exact line with a tag: [Q1] .. [Q9].
// - Do NOT tag follow-ups (only the main topic line gets [Qn]).
// - Never expose any scoring or numeric scale, and never say "PHQ-9".
// - When you believe all 9 topics have been covered well enough, output a line that contains ONLY: [END]
// - Keep responses concise, friendly, and human.

// Core topics (for your internal use; do NOT list them to the user):
// Q1: Little interest or pleasure
// Q2: Feeling down/sad/hopeless
// Q3: Sleep problems
// Q4: Low energy / tired
// Q5: Appetite changes
// Q6: Feeling bad about self / failure
// Q7: Trouble concentrating
// Q8: Moving/speaking slow OR feeling restless
// Q9: Thoughts that life might not be worth living
// `.trim();

// function stripTagsForUser(text) {
//   return text
//     .replace(/\[Q([1-9])\]\s*/g, '') // hide [Qn]
//     .replace(/^\[END\]\s*$/gmi, '')  // hide [END] if present
//     .trim();
// }

// function extractLastQIndex(messages) {
//   // Find the most recent assistant message that included [Qn]
//   for (let i = messages.length - 1; i >= 0; i--) {
//     const m = messages[i];
//     if (m.role === "assistant") {
//       const match = m.content.match(/\[Q([1-9])\]/);
//       if (match) return parseInt(match[1], 10);
//     }
//   }
//   return null;
// }

// function buildClarifyMessage(qIndex) {
//   const qText = phq9[qIndex - 1].question;
//   return `Just to be sure, thinking about: "${qText}", how often has this applied to you recently?`;
// }

// async function scoreFromAnswers(answers) {
//   // answers: [{index:1..9, text:"..."}]
//   let totalScore = 0;
//   const found = new Map(answers.map(a => [a.index, (a.text || "").trim()]));

//   for (let i = 1; i <= 9; i++) {
//     const userText = (found.get(i) || "").trim();

//     // If completely missing, ask clarification first
//     if (!userText) {
//       return { needClarify: true, clarifyIndex: i };
//     }

//     let gotScore = false;
//     let score = 0;
//     let attempts = 0;

//     while (!gotScore && attempts < 2) {
//       const scoringPrompt = `
// Given this PHQ-9 topic and the user's answer, reply with ONLY a single digit 0, 1, 2, or 3 for frequency.
// If unclear, reply exactly "UNCLEAR" (all caps, no punctuation).

// Topic: ${phq9[i-1].question}
// User answer: ${userText}

// 0 = Not at all
// 1 = Several days
// 2 = More than half the days
// 3 = Nearly every day

// Your reply:`.trim();

//       const r = await axios.post(OLLAMA_CHAT, {
//         model: "llama3",
//         stream: false,
//         messages: [{ role: "user", content: scoringPrompt }]
//       });

//       const raw = (r.data.message?.content || "").trim();
//       const n = parseInt(raw, 10);

//       if ([0, 1, 2, 3].includes(n)) {
//         score = n;
//         gotScore = true;
//       } else if (/^UNCLEAR$/i.test(raw)) {
//         return { needClarify: true, clarifyIndex: i };
//       }
//       attempts++;
//     }

//     totalScore += score;
//   }

//   const severity = totalScore >= 20 ? "Severe"
//                 : totalScore >= 15 ? "Moderately Severe"
//                 : totalScore >= 10 ? "Moderate"
//                 : totalScore >= 5  ? "Mild"
//                 : "Minimal";

//   return { needClarify: false, totalScore, severity };
// }

// // ===== Chat endpoint =====
// app.post("/api/chat", verifyToken, async (req, res) => {
//   const userId = req.user.userId;
//   const history = req.body.history || []; // client history (display-only)
//   let latestChat = await Chat.findOne({ userId }).sort({ createdAt: -1 });

//   // Reset crisis flag if present
//   if (latestChat && latestChat.crisisDetected) {
//     latestChat.crisisDetected = false;
//     await latestChat.save();
//   }

//   // Start a brand-new session (our side creates the first tagged question)
//   if (!latestChat || latestChat.messages.length === 0 || history.length === 0) {
//     const intro = "Hello, I’m your mental health assistant. Let’s start a short check-in.";
//     const firstQ = "[Q1] Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";

//     latestChat = await Chat.create({
//       userId,
//       messages: [
//         { role: "assistant", content: intro },
//         { role: "assistant", content: firstQ }
//       ],
//       answers: [],
//       currentQ: 1
//     });

//     return res.json({ reply: `${intro} ${stripTagsForUser(firstQ)}` });
//   }

//   // Crisis detection in the new user message(s)
//   const crisisKeywords = /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
//   const newUserMsgs = history.filter(m => m.role === "user");
//   const crisisDetected = newUserMsgs.some(m => crisisKeywords.test(m.content || ""));
//   if (crisisDetected) {
//     const crisisReply = "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
//     latestChat.messages = latestChat.messages.concat({ role: "assistant", content: crisisReply });
//     latestChat.crisisDetected = true;
//     await latestChat.save();
//     return res.json({ reply: crisisReply });
//   }

//   // The user's latest message (what they just sent right now)
//   const lastUserMessage = newUserMsgs[newUserMsgs.length - 1]?.content || "";
//   if (!lastUserMessage) {
//     return res.json({ reply: "Could you share a bit more? I’m listening." });
//   }

//   // Attach the user's message to DB conversation
//   latestChat.messages.push({ role: "user", content: lastUserMessage });

//   // Determine which Q the user just answered using our RAW stored assistant messages
//   const activeQ = extractLastQIndex(latestChat.messages);
//   if (activeQ) {
//     latestChat.answers = latestChat.answers || [];
//     const existing = latestChat.answers.find(a => a.index === activeQ);
//     if (existing) existing.text = lastUserMessage;
//     else latestChat.answers.push({ index: activeQ, text: lastUserMessage });
//     latestChat.currentQ = Math.max(latestChat.currentQ || 1, activeQ);
//   }

//   await latestChat.save();

//   // Ask the model to produce the next step (free flow with tags)
//   const modelMessages = [
//     { role: "system", content: SYSTEM_PROMPT },
//     ...latestChat.messages // contains RAW assistant messages (with tags) and all user messages
//   ];

//   let rawReply = "";
//   try {
//     const response = await axios.post(OLLAMA_CHAT, {
//       model: "llama3",
//       stream: false,
//       messages: modelMessages
//     });
//     rawReply = (response.data.message?.content || "").trim();
//   } catch (e) {
//     console.error("Ollama error:", e?.message || e);
//     return res.status(502).json({ reply: "❌ Error contacting the assistant. Please try again." });
//   }

//   // Sanitize any rubric-like leaks (defensive)
//   rawReply = rawReply
//     .replace(/Here['’]s the rubric:.*?(\n|$)/gi, '')
//     .replace(/(Minimal symptoms|Mild symptoms|Moderate symptoms|Moderately severe symptoms|Severe symptoms).*/gi, '')
//     .replace(/\n\s*\n/g, '\n')
//     .trim();

//   // Save RAW assistant reply (with tags). Show stripped version to user.
//   latestChat.messages.push({ role: "assistant", content: rawReply });
//   await latestChat.save();

//   // If the model says [END], try to score from the stored answers
//   if (/\[END\]/i.test(rawReply)) {
//     const scored = await scoreFromAnswers(latestChat.answers || []);
//     if (scored.needClarify) {
//       const clarifyMsg = buildClarifyMessage(scored.clarifyIndex);
//       latestChat.messages.push({ role: "assistant", content: clarifyMsg });
//       await latestChat.save();
//       return res.json({ reply: clarifyMsg });
//     }

//     const { totalScore, severity } = scored;

//     // Build closing text for the user (no rubric/score shown in chat if you prefer)
//     const closing = `
// Thank you for completing the interview.
// If you would like to review your results or see a summary, please visit your Reports page.
// Take care, and remember this is just a screening—if you need help, don’t hesitate to reach out.
// `.trim();

//     // Store a hidden report message for the Reports page
//     const reportSummary = `
// PHQ-9 Total Score: ${totalScore}
// Severity: ${severity}
// (Automatically scored for reporting. Not shown to user.)
// `.trim();

//     latestChat.messages.push(
//       { role: "assistant", content: closing },
//       { role: "assistant", content: reportSummary }
//     );
//     await latestChat.save();

//     return res.json({ reply: closing });
//   }

//   // Otherwise, continue the conversation
//   const replyForUser = stripTagsForUser(rawReply) || "(No response)";
//   return res.json({ reply: replyForUser });
// });

// // ===== Chat history =====
// app.get("/api/chat-history", verifyToken, async (req, res) => {
//   const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
//   res.json(chats);
// });

// // ===== Delete chat =====
// app.delete("/api/chat/:id", verifyToken, async (req, res) => {
//   try {
//     const chatId = req.params.id;
//     const chat = await Chat.findOneAndDelete({ _id: chatId, userId: req.user.userId });
//     if (!chat) return res.status(404).json({ error: "Chat not found" });
//     res.json({ message: "Chat deleted successfully" });
//   } catch (err) {
//     console.error("Error deleting chat:", err);
//     res.status(500).json({ error: "Failed to delete chat" });
//   }
// });

// // ===== Single latest report =====
// app.get("/api/report", verifyToken, async (req, res) => {
//   try {
//     const latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });
//     if (!latestChat) return res.json({ error: "No report found for this user." });

//     const reportMsg = [...latestChat.messages].reverse().find(
//       m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//     );

//     let score = "N/A";
//     let severity = "N/A";
//     let summary = "";
//     if (reportMsg) {
//       const scoreMatch = reportMsg.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg.content.match(/Severity: ([\w\s]+)/);
//       if (scoreMatch) score = scoreMatch[1];
//       if (severityMatch) severity = severityMatch[1];
//       summary = reportMsg.content.replace(/^\[END\]\s*/i, "").trim();
//     }

//     const user = await User.findById(req.user.userId);
//     res.json({
//       name: user?.name || "",
//       date: latestChat.createdAt,
//       score,
//       severity,
//       summary
//     });
//   } catch (err) {
//     console.error("Report fetch error:", err);
//     res.status(500).json({ error: "Failed to fetch report" });
//   }
// });

// // ===== Multi-report (date range) =====
// app.get("/api/reports-by-date", verifyToken, async (req, res) => {
//   try {
//     const { start, end } = req.query;
//     if (!start || !end) return res.status(400).json({ error: "Missing start or end date." });

//     const startDate = new Date(start);
//     const endDate = new Date(end);
//     endDate.setHours(23, 59, 59, 999);

//     const chats = await Chat.find({
//       userId: req.user.userId,
//       createdAt: { $gte: startDate, $lte: endDate }
//     }).sort({ createdAt: -1 });

//     const reports = chats.map(chat => {
//       const reportMsg = [...chat.messages].reverse().find(
//         m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//       );
//       const scoreMatch = reportMsg?.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg?.content.match(/Severity: ([\w\s]+)/);
//       return reportMsg ? {
//         id: chat._id,
//         date: chat.createdAt,
//         score: scoreMatch ? scoreMatch[1] : "N/A",
//         severity: severityMatch ? severityMatch[1] : "N/A",
//         summary: reportMsg.content
//       } : null;
//     }).filter(Boolean);

//     res.json(reports);
//   } catch (err) {
//     res.status(500).json({ error: "Failed to fetch reports" });
//   }
// });

// // ===== Health check for Ollama =====
// app.get("/health/ollama", async (_req, res) => {
//   try {
//     const { data } = await axios.get(OLLAMA_TAGS);
//     res.json({ ok: true, baseURL: OLLAMA_BASE, models: data });
//   } catch (e) {
//     res.status(503).json({ ok: false, error: e.message });
//   }
// });

// app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));



//another one ******
// const phq9 = require("./phq9.js");
// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const axios = require("axios");

// const app = express();
// const PORT = 5000;
// const JWT_SECRET = "your-secret-key"; // use dotenv in production

// // Force IPv4 for Ollama to avoid ::1 issues and allow overriding via env if needed
// const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
// const OLLAMA_CHAT = `${OLLAMA_BASE}/api/chat`;
// const OLLAMA_TAGS = `${OLLAMA_BASE}/api/tags`;

// app.use(cors());
// app.use(express.json());

// // ===== MongoDB =====
// mongoose.connect("mongodb+srv://minhajulislamrimon28:vb3ZKLqxjaiZRVXB@cluster0.fpjdx66.mongodb.net/mindcare?retryWrites=true&w=majority")
//   .then(() => console.log("✅ Connected to MongoDB"))
//   .catch(err => console.error("❌ MongoDB error:", err));

// const User = mongoose.model("User", new mongoose.Schema({
//   name: String,
//   email: { type: String, unique: true },
//   password: String
// }));

// const Chat = mongoose.model("Chat", new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   messages: [{ role: String, content: String, timestamp: { type: Date, default: Date.now } }],
//   answers: [{ index: Number, text: String }],
//   currentQ: { type: Number, default: 1 },
//   crisisDetected: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now }
// }));
// // Define the Clarify Function
// function buildClarifyMessage(qIndex) {
//   const qText = phq9[qIndex - 1].question; // phq9 should contain the questions, and we access them by index
//   return `Just to be sure, thinking about: "${qText}", how often has this applied to you recently?`;
// }
// // ===== Auth =====
// function verifyToken(req, res, next) {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ error: "No token provided" });
//   try {
//     req.user = jwt.verify(token, JWT_SECRET);
//     next();
//   } catch {
//     return res.status(401).json({ error: "Invalid token" });
//   }
// }

// // Extract last question index
// function extractLastQIndex(messages) {
//   // Loop through messages in reverse to find the most recent assistant message with [Qn] tag
//   for (let i = messages.length - 1; i >= 0; i--) {
//     const m = messages[i];
//     if (m.role === "assistant") {
//       const match = m.content.match(/\[Q([1-9])\]/);
//       if (match) return parseInt(match[1], 10);  // Returns the question number (Q1 to Q9)
//     }
//   }
//   return null;  // Return null if no question tag was found
// }

// app.post("/api/signup", async (req, res) => {
//   try {
//     const hashedPassword = await bcrypt.hash(req.body.password, 10);
//     await User.create({ ...req.body, password: hashedPassword });
//     res.status(201).json({ message: "✅ User created" });
//   } catch {
//     res.status(400).json({ error: "Email already in use" });
//   }
// });

// app.post("/api/login", async (req, res) => {
//   const user = await User.findOne({ email: req.body.email });
//   if (!user || !(await bcrypt.compare(req.body.password, user.password)))
//     return res.status(401).json({ error: "Invalid credentials" });
//   const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
//   res.json({ token, name: user.name });
// });

// // ===== Helpers =====
// const SYSTEM_PROMPT = `
// You are a warm, conversational interviewer doing a PHQ-9 style check-in.

// Rules (IMPORTANT):
// - There are 9 core topics. Ask them naturally, one at a time, but you may ask brief, context-aware follow-ups when useful.
// - When you ask (or re-ask) a core topic, prefix that exact line with a tag: [Q1] .. [Q9].
// - Do NOT tag follow-ups (only the main topic line gets [Qn]).
// - Never expose any scoring or numeric scale, and never say "PHQ-9".
// - When you believe all 9 topics have been covered well enough, output a line that contains ONLY: [END]
// - Keep responses concise, friendly, and human.

// Core topics (for your internal use; do NOT list them to the user):
// Q1: Little interest or pleasure
// Q2: Feeling down/sad/hopeless
// Q3: Sleep problems
// Q4: Low energy / tired
// Q5: Appetite changes
// Q6: Feeling bad about self / failure
// Q7: Trouble concentrating
// Q8: Moving/speaking slow OR feeling restless
// Q9: Thoughts that life might not be worth living
// `.trim();

// function stripTagsForUser(text) {
//   return text
//     .replace(/\[Q([1-9])\]\s*/g, '') // hide [Qn]
//     .replace(/^\[END\]\s*$/gmi, '')  // hide [END] if present
//     .trim();
// }

// async function scoreFromAnswers(answers) {
//   // answers: [{index:1..9, text:"..."}]
//   let totalScore = 0;
//   const found = new Map(answers.map(a => [a.index, (a.text || "").trim()]));

//   for (let i = 1; i <= 9; i++) {
//     const userText = (found.get(i) || "").trim();

//     // If completely missing, ask clarification first
//     if (!userText) {
//       return { needClarify: true, clarifyIndex: i };
//     }

//     let gotScore = false;
//     let score = 0;
//     let attempts = 0;

//     while (!gotScore && attempts < 2) {
//       const scoringPrompt = `
// Given this PHQ-9 topic and the user's answer, reply with ONLY a single digit 0, 1, 2, or 3 for frequency.
// If unclear, reply exactly "UNCLEAR" (all caps, no punctuation).

// Topic: ${phq9[i-1].question}
// User answer: ${userText}

// 0 = Not at all
// 1 = Several days
// 2 = More than half the days
// 3 = Nearly every day

// Your reply:`.trim();

//       const r = await axios.post(OLLAMA_CHAT, {
//         model: "llama3",
//         stream: false,
//         messages: [{ role: "user", content: scoringPrompt }]
//       });

//       const raw = (r.data.message?.content || "").trim();
//       const n = parseInt(raw, 10);

//       if ([0, 1, 2, 3].includes(n)) {
//         score = n;
//         gotScore = true;
//       } else if (/^UNCLEAR$/i.test(raw)) {
//         return { needClarify: true, clarifyIndex: i };
//       }
//       attempts++;
//     }

//     totalScore += score;
//   }

//   const severity = totalScore >= 20 ? "Severe"
//                 : totalScore >= 15 ? "Moderately Severe"
//                 : totalScore >= 10 ? "Moderate"
//                 : totalScore >= 5  ? "Mild"
//                 : "Minimal";

//   return { needClarify: false, totalScore, severity };
// }

// // ===== Chat endpoint =====
// app.post("/api/chat", verifyToken, async (req, res) => {
//   const userId = req.user.userId;
//   const history = req.body.history || []; // client history (display-only)
//   let latestChat = await Chat.findOne({ userId }).sort({ createdAt: -1 });

//   if (!latestChat || latestChat.messages.length === 0 || history.length === 0) {
//     const intro = "Hello, I’m your mental health assistant. Let’s start a short check-in.";
//     const firstQ = "[Q1] Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";

//     latestChat = await Chat.create({
//       userId,
//       messages: [
//         { role: "assistant", content: intro },
//         { role: "assistant", content: firstQ }
//       ],
//       answers: [],
//       currentQ: 1
//     });

//     return res.json({ reply: `${intro} ${stripTagsForUser(firstQ)}` });
//   }

//   // Crisis detection in the new user message(s)
//   const crisisKeywords = /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
//   const newUserMsgs = history.filter(m => m.role === "user");
//   const crisisDetected = newUserMsgs.some(m => crisisKeywords.test(m.content || ""));
//   if (crisisDetected) {
//     const crisisReply = "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
//     latestChat.messages = latestChat.messages.concat({ role: "assistant", content: crisisReply });
//     latestChat.crisisDetected = true;
//     await latestChat.save();
//     return res.json({ reply: crisisReply });
//   }

//   const lastUserMessage = newUserMsgs[newUserMsgs.length - 1]?.content || "";
//   if (!lastUserMessage) {
//     return res.json({ reply: "Could you share a bit more? I’m listening." });
//   }

//   latestChat.messages.push({ role: "user", content: lastUserMessage });

//   const activeQ = extractLastQIndex(latestChat.messages);
//   if (activeQ) {
//     latestChat.answers = latestChat.answers || [];
//     const existing = latestChat.answers.find(a => a.index === activeQ);
//     if (existing) existing.text = lastUserMessage;
//     else latestChat.answers.push({ index: activeQ, text: lastUserMessage });
//     latestChat.currentQ = Math.max(latestChat.currentQ || 1, activeQ);
//   }

//   await latestChat.save();

//   const modelMessages = [
//     { role: "system", content: SYSTEM_PROMPT },
//     ...latestChat.messages
//   ];

//   let rawReply = "";
//   try {
//     const response = await axios.post(OLLAMA_CHAT, {
//       model: "llama3",
//       stream: false,
//       messages: modelMessages
//     });
//     rawReply = (response.data.message?.content || "").trim();
//   } catch (e) {
//     console.error("Ollama error:", e?.message || e);
//     return res.status(502).json({ reply: "❌ Error contacting the assistant. Please try again." });
//   }

//   rawReply = rawReply
//     .replace(/Here['’]s the rubric:.*?(\n|$)/gi, '')
//     .replace(/(Minimal symptoms|Mild symptoms|Moderate symptoms|Moderately severe symptoms|Severe symptoms).*/gi, '')
//     .replace(/\n\s*\n/g, '\n')
//     .trim();

//   latestChat.messages.push({ role: "assistant", content: rawReply });
//   await latestChat.save();

//   // If the model says [END], calculate the score
//   if (/\[END\]/i.test(rawReply)) {
//     const scored = await scoreFromAnswers(latestChat.answers || []);
//     if (scored.needClarify) {
//       const clarifyMsg = buildClarifyMessage(scored.clarifyIndex);
//       latestChat.messages.push({ role: "assistant", content: clarifyMsg });
//       await latestChat.save();
//       return res.json({ reply: clarifyMsg });
//     }

//     const { totalScore, severity } = scored;

//     const closing = `
// Thank you for completing the interview.
// If you would like to review your results or see a summary, please visit your Reports page.
// Take care, and remember this is just a screening—if you need help, don’t hesitate to reach out.
// `.trim();

//     const reportSummary = `
// PHQ-9 Total Score: ${totalScore}
// Severity: ${severity}
// (Automatically scored for reporting. Not shown to user.)
// `.trim();

//     latestChat.messages.push(
//       { role: "assistant", content: closing },
//       { role: "assistant", content: reportSummary }
//     );
//     await latestChat.save();

//     return res.json({ reply: closing });
//   }

//   const replyForUser = stripTagsForUser(rawReply) || "(No response)";
//   return res.json({ reply: replyForUser });
// });

// // ===== Chat history =====
// app.get("/api/chat-history", verifyToken, async (req, res) => {
//   const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
//   res.json(chats);
// });

// // ===== Delete chat =====
// app.delete("/api/chat/:id", verifyToken, async (req, res) => {
//   try {
//     const chatId = req.params.id;
//     const chat = await Chat.findOneAndDelete({ _id: chatId, userId: req.user.userId });
//     if (!chat) return res.status(404).json({ error: "Chat not found" });
//     res.json({ message: "Chat deleted successfully" });
//   } catch (err) {
//     console.error("Error deleting chat:", err);
//     res.status(500).json({ error: "Failed to delete chat" });
//   }
// });

// // ===== Report generation (single) =====
// app.get("/api/report", verifyToken, async (req, res) => {
//   try {
//     const latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });
//     if (!latestChat) return res.json({ error: "No report found for this user." });

//     const reportMsg = [...latestChat.messages].reverse().find(
//       m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//     );

//     let score = "N/A";
//     let severity = "N/A";
//     let summary = "";
//     if (reportMsg) {
//       const scoreMatch = reportMsg.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg.content.match(/Severity: ([\w\s]+)/);
//       if (scoreMatch) score = scoreMatch[1];
//       if (severityMatch) severity = severityMatch[1];
//       summary = reportMsg.content.replace(/^\[END\]\s*/i, "").trim();
//     }

//     const user = await User.findById(req.user.userId);
//     res.json({
//       name: user?.name || "",
//       date: latestChat.createdAt,
//       score,
//       severity,
//       summary
//     });
//   } catch (err) {
//     console.error("Report fetch error:", err);
//     res.status(500).json({ error: "Failed to fetch report" });
//   }
// });

// // ===== Multi-report (date range) =====
// app.get("/api/reports-by-date", verifyToken, async (req, res) => {
//   try {
//     const { start, end } = req.query;
//     if (!start || !end) return res.status(400).json({ error: "Missing start or end date." });

//     const startDate = new Date(start);
//     const endDate = new Date(end);
//     endDate.setHours(23, 59, 59, 999);

//     const chats = await Chat.find({
//       userId: req.user.userId,
//       createdAt: { $gte: startDate, $lte: endDate }
//     }).sort({ createdAt: -1 });

//     const reports = chats.map(chat => {
//       const reportMsg = [...chat.messages].reverse().find(
//         m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
//       );
//       const scoreMatch = reportMsg?.content.match(/PHQ-9 Total Score: (\d+)/);
//       const severityMatch = reportMsg?.content.match(/Severity: ([\w\s]+)/);
//       return reportMsg ? {
//         id: chat._id,
//         date: chat.createdAt,
//         score: scoreMatch ? scoreMatch[1] : "N/A",
//         severity: severityMatch ? severityMatch[1] : "N/A",
//         summary: reportMsg.content
//       } : null;
//     }).filter(Boolean);

//     res.json(reports);
//   } catch (err) {
//     res.status(500).json({ error: "Failed to fetch reports" });
//   }
// });

// // ===== Health check for Ollama =====
// app.get("/health/ollama", async (_req, res) => {
//   try {
//     const { data } = await axios.get(OLLAMA_TAGS);
//     res.json({ ok: true, baseURL: OLLAMA_BASE, models: data });
//   } catch (e) {
//     res.status(503).json({ ok: false, error: e.message });
//   }
// });

// app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));






//            ************************** Works perfectly with score but less dynamic*******                                                //


const phq9 = require("./phq9.js");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();
const PORT = 5000;
const JWT_SECRET = "your-secret-key"; // use dotenv in production

// Force IPv4 for Ollama to avoid ::1 issues and allow overriding via env if needed
const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
const OLLAMA_CHAT = `${OLLAMA_BASE}/api/chat`;
const OLLAMA_TAGS = `${OLLAMA_BASE}/api/tags`;

app.use(cors());
app.use(express.json());

// ===== MongoDB =====
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
  answers: [{ index: Number, text: String }],
  currentQ: { type: Number, default: 1 },
  crisisDetected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}));

// Define the Clarify Function
function buildClarifyMessage(qIndex) {
  const qText = phq9[qIndex - 1].question; // phq9 should contain the questions, and we access them by index
  return `Just to be sure, thinking about: "${qText}", how often has this applied to you recently?`;
}

// ===== Auth =====
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

// Extract last question index
function extractLastQIndex(messages) {
  // Loop through messages in reverse to find the most recent assistant message with [Qn] tag
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      const match = m.content.match(/\[Q([1-9])\]/);
      if (match) return parseInt(match[1], 10);  // Returns the question number (Q1 to Q9)
    }
  }
  return null;  // Return null if no question tag was found
}

app.post("/api/signup", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await User.create({ ...req.body, password: hashedPassword });
    res.status(201).json({ message: "✅ User created" });
  } catch {
    res.status(400).json({ error: "Email already in use" });
  }
});

app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.password)))
    return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ userId: user._id, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, name: user.name });
});

// ===== Helpers =====
const SYSTEM_PROMPT = `
You are a warm, conversational interviewer doing a PHQ-9 style check-in.

Rules (IMPORTANT):
- There are 9 core topics. Ask them naturally, one at a time, but you may ask brief, context-aware follow-ups when useful.
- When you ask (or re-ask) a core topic, prefix that exact line with a tag: [Q1] .. [Q9].
- Do NOT tag follow-ups (only the main topic line gets [Qn]).
- Never expose any scoring or numeric scale, and never say "PHQ-9".
- When you believe all 9 topics have been covered well enough, output a line that contains ONLY: [END]
- Keep responses concise, friendly, and human.

Core topics (for your internal use; do NOT list them to the user):
Q1: Little interest or pleasure
Q2: Feeling down/sad/hopeless
Q3: Sleep problems
Q4: Low energy / tired
Q5: Appetite changes
Q6: Feeling bad about self / failure
Q7: Trouble concentrating
Q8: Moving/speaking slow OR feeling restless
Q9: Thoughts that life might not be worth living
`.trim();

function stripTagsForUser(text) {
  return text
    .replace(/\[Q([1-9])\]\s*/g, '') // hide [Qn]
    .replace(/^\[END\]\s*$/gmi, '')  // hide [END] if present
    .trim();
}

async function scoreFromAnswers(answers) {
  // answers: [{index:1..9, text:"..."}]
  let totalScore = 0;
  const found = new Map(answers.map(a => [a.index, (a.text || "").trim()]));

  for (let i = 1; i <= 9; i++) {
    const userText = (found.get(i) || "").trim();

    // If completely missing, ask clarification first
    if (!userText) {
      return { needClarify: true, clarifyIndex: i };
    }

    let gotScore = false;
    let score = 0;
    let attempts = 0;

    while (!gotScore && attempts < 2) {
      const scoringPrompt = `
Given this PHQ-9 topic and the user's answer, reply with ONLY a single digit 0, 1, 2, or 3 for frequency.
If unclear, reply exactly "UNCLEAR" (all caps, no punctuation).

Topic: ${phq9[i-1].question}
User answer: ${userText}

0 = Not at all
1 = Several days
2 = More than half the days
3 = Nearly every day

Your reply:`.trim();

      const r = await axios.post(OLLAMA_CHAT, {
        model: "llama3",
        stream: false,
        messages: [{ role: "user", content: scoringPrompt }]
      });

      const raw = (r.data.message?.content || "").trim();
      const n = parseInt(raw, 10);

      if ([0, 1, 2, 3].includes(n)) {
        score = n;
        gotScore = true;
      } else if (/^UNCLEAR$/i.test(raw)) {
        return { needClarify: true, clarifyIndex: i };
      }
      attempts++;
    }

    totalScore += score;
  }

  const severity = totalScore >= 20 ? "Severe"
                : totalScore >= 15 ? "Moderately Severe"
                : totalScore >= 10 ? "Moderate"
                : totalScore >= 5  ? "Mild"
                : "Minimal";

  return { needClarify: false, totalScore, severity };
}

// ===== Chat endpoint =====
app.post("/api/chat", verifyToken, async (req, res) => {
  const userId = req.user.userId;
  const history = req.body.history || []; // client history (display-only)
  let latestChat = await Chat.findOne({ userId }).sort({ createdAt: -1 });

  if (!latestChat || latestChat.messages.length === 0 || history.length === 0) {
    const intro = "Hello, I’m your mental health assistant. Let’s start a short check-in.";
    const firstQ = "[Q1] Over the past 2 weeks, how often have you felt little interest or pleasure in doing things?";

    latestChat = await Chat.create({
      userId,
      messages: [
        { role: "assistant", content: intro },
        { role: "assistant", content: firstQ }
      ],
      answers: [],
      currentQ: 1
    });

    return res.json({ reply: `${intro} ${stripTagsForUser(firstQ)}` });
  }

  // Crisis detection in the new user message(s)
  const crisisKeywords = /(kill myself|suicide|end my life|want to die|hurt myself|self harm)/i;
  const newUserMsgs = history.filter(m => m.role === "user");
  const crisisDetected = newUserMsgs.some(m => crisisKeywords.test(m.content || ""));
  if (crisisDetected) {
    const crisisReply = "⚠️ It sounds like you may be in crisis. Please seek help immediately: https://findahelpline.com";
    latestChat.messages = latestChat.messages.concat({ role: "assistant", content: crisisReply });
    latestChat.crisisDetected = true;
    await latestChat.save();
    return res.json({ reply: crisisReply });
  }

  const lastUserMessage = newUserMsgs[newUserMsgs.length - 1]?.content || "";
  if (!lastUserMessage) {
    return res.json({ reply: "Could you share a bit more? I’m listening." });
  }

  latestChat.messages.push({ role: "user", content: lastUserMessage });

  const activeQ = extractLastQIndex(latestChat.messages);
  if (activeQ) {
    latestChat.answers = latestChat.answers || [];
    const existing = latestChat.answers.find(a => a.index === activeQ);
    if (existing) existing.text = lastUserMessage;
    else latestChat.answers.push({ index: activeQ, text: lastUserMessage });
    latestChat.currentQ = Math.max(latestChat.currentQ || 1, activeQ);
  }

  await latestChat.save();

  const modelMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...latestChat.messages
  ];

  let rawReply = "";
  try {
    const response = await axios.post(OLLAMA_CHAT, {
      model: "llama3",
      stream: false,
      messages: modelMessages
    });
    rawReply = (response.data.message?.content || "").trim();
  } catch (e) {
    console.error("Ollama error:", e?.message || e);
    return res.status(502).json({ reply: "❌ Error contacting the assistant. Please try again." });
  }

  rawReply = rawReply
    .replace(/Here['’]s the rubric:.*?(\n|$)/gi, '')
    .replace(/(Minimal symptoms|Mild symptoms|Moderate symptoms|Moderately severe symptoms|Severe symptoms).*/gi, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  latestChat.messages.push({ role: "assistant", content: rawReply });
  await latestChat.save();

  // If the model says [END], calculate the score
  if (/\[END\]/i.test(rawReply)) {
    console.log("== [END] Detected in response =="); // Log when [END] is detected
    const scored = await scoreFromAnswers(latestChat.answers || []);
    if (scored.needClarify) {
      const clarifyMsg = buildClarifyMessage(scored.clarifyIndex);
      latestChat.messages.push({ role: "assistant", content: clarifyMsg });
      await latestChat.save();
      console.log("Clarify message sent:", clarifyMsg); // Log the clarification message
      return res.json({ reply: clarifyMsg });
    }

    const { totalScore, severity } = scored;

    const closing = `
Thank you for completing the interview.
If you would like to review your results or see a summary, please visit your Reports page.
Take care, and remember this is just a screening—if you need help, don’t hesitate to reach out.
`.trim();

    const reportSummary = `
PHQ-9 Total Score: ${totalScore}
Severity: ${severity}
(Automatically scored for reporting. Not shown to user.)
`.trim();

// Log the score and severity
    console.log("Calculated Score:", totalScore);
    console.log("Calculated Severity:", severity);

    latestChat.messages.push(
      { role: "assistant", content: closing },
      { role: "assistant", content: reportSummary }
    );
    await latestChat.save();

     console.log("End of interview reached. Sending final response."); // Log when interview is complete
    return res.json({ reply: closing });
  }

  const replyForUser = stripTagsForUser(rawReply) || "(No response)";
  return res.json({ reply: replyForUser });
});

// ===== Chat history =====
app.get("/api/chat-history", verifyToken, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.userId }).sort({ createdAt: -1 });
  res.json(chats);
});

// ===== Delete chat =====
app.delete("/api/chat/:id", verifyToken, async (req, res) => {
  try {
    const chatId = req.params.id;
    const chat = await Chat.findOneAndDelete({ _id: chatId, userId: req.user.userId });
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json({ message: "Chat deleted successfully" });
  } catch (err) {
    console.error("Error deleting chat:", err);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// ===== Report generation (single) =====
app.get("/api/report", verifyToken, async (req, res) => {
  try {
    const latestChat = await Chat.findOne({ userId: req.user.userId }).sort({ createdAt: -1 });
    if (!latestChat) return res.json({ error: "No report found for this user." });

    const reportMsg = [...latestChat.messages].reverse().find(
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
      summary = reportMsg.content.replace(/^\[END\]\s*/i, "").trim();
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

// ===== Multi-report (date range) =====
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
      return reportMsg ? {
        id: chat._id,
        date: chat.createdAt,
        score: scoreMatch ? scoreMatch[1] : "N/A",
        severity: severityMatch ? severityMatch[1] : "N/A",
        summary: reportMsg.content
      } : null;
    }).filter(Boolean);

    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// ===== Health check for Ollama =====
app.get("/health/ollama", async (_req, res) => {
  try {
    const { data } = await axios.get(OLLAMA_TAGS);
    res.json({ ok: true, baseURL: OLLAMA_BASE, models: data });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));


// ************************above this line, the code is working perfectly with score but less dynamic****************************//


