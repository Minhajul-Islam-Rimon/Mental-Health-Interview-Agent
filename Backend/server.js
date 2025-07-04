const express = require('express');
const cors = require('cors');
const axios = require('axios');
const phq9 = require('./phq9');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Query Ollama to score an answer
async function queryOllama(question, answer) {
  const prompt = `
You are an expert evaluator scoring answers to PHQ-9 depression questionnaire items.

Given the question:
"${question}"

And the user's answer:
"${answer}"

Please respond ONLY with a single digit from 0 to 3 indicating the severity, where:
0 = Not at all
1 = Several days
2 = More than half the days
3 = Nearly every day

Do not add any explanations or other text. Just respond with the digit.
  `.trim();

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'llama3',
      stream: false,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = response.data.message?.content?.trim() || '';
    console.log("🔎 LLM raw score response:", raw);

    const score = parseInt(raw);
    if ([0, 1, 2, 3].includes(score)) return score;

    const match = raw.match(/[0-3]/);
    if (match) return parseInt(match[0]);

    console.warn("⚠️ Unexpected LLM response:", raw);
    return 0;
  } catch (err) {
    console.error("❌ Ollama error:", err.message);
    return 0;
  }
}

// Chat-style conversational endpoint
app.post('/chat', async (req, res) => {
  const history = req.body.history;
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: "Invalid history format" });
  }

  // Compassionate system message for empathy/tone moderation
  const systemMessage = {
    role: 'system',
    content: `
You are a compassionate mental health interviewer conducting a PHQ-9 style depression interview.

- Ask ONE question at a time based on the user's last answer.
- Use empathetic, warm, and supportive language.
- Acknowledge the user's feelings respectfully before proceeding.
- Avoid giving advice, summaries, or commentary.
- Do NOT simulate or invent user responses.
- If unsure what to ask next or the interview is complete, respond with "END".
- If user responses indicate crisis or severe distress, gently suggest seeking immediate professional help and provide support resources.
- DO NOT include “System:” or “User:” in your message.

Your reply should be ONLY the next question (or "END").
    `.trim()
  };

  try {
    const messages = [systemMessage, ...history];
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'llama3',
      stream: false,
      messages
    });

    const reply = response.data.message?.content?.trim() || "(No response)";
    return res.json({ reply });
  } catch (err) {
    console.error("❌ Ollama error on chat:", err.message);
    return res.status(500).json({ error: "LLM request failed" });
  }
});

// Clarification endpoint (moved outside /chat)
app.post('/clarify', async (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: "Missing question or answer" });
  }

  const prompt = `
You are a PHQ-9 interviewer assistant.

You just asked this question:
"${question}"

The user responded:
"${answer}"

Determine if the user's answer is vague, unclear, or needs clarification. If yes, respond with a polite clarifying question like "Could you clarify what you mean?" or something specific to the context.

If the answer is already clear, respond ONLY with "OK".
  `.trim();

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'llama3',
      stream: false,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.data.message?.content?.trim();
    if (content === "OK") return res.json({ clarification: null });

    return res.json({ clarification: content });
  } catch (err) {
    console.error("❌ Clarify error:", err.message);
    return res.status(500).json({ error: "Clarification LLM failed" });
  }
});

// Traditional PHQ-9 scoring route
app.post('/score', async (req, res) => {
  const answers = req.body.answers;

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "Invalid or empty answers array" });
  }

  let totalScore = 0;
  let answerCount = Math.min(answers.length, phq9.length);

  console.log(`📋 Starting PHQ-9 scoring with ${answerCount} answers`);

  for (let i = 0; i < answerCount; i++) {
    let question = phq9[i]?.question || `Question ${i + 1}`;
    let ans = answers[i];
    let score = 0;

    if (!ans || typeof ans !== 'string' || ans.trim() === "") {
      console.warn(`⚠️ Empty or missing answer for Q${i + 1}, assigning score 0`);
      score = 0;
    } else {
      const parsed = parseInt(ans.trim());
      if ([0, 1, 2, 3].includes(parsed)) {
        score = parsed;
      } else {
        // Use LLM to score free text
        score = await queryOllama(question, ans.trim());

        if (![0, 1, 2, 3].includes(score)) {
          console.warn(`❗ LLM returned invalid score for Q${i + 1}: "${score}". Using 0 as fallback.`);
          score = 0;
        }
      }
    }

    console.log(`✅ Q${i + 1}: "${ans}" → Score: ${score}`);
    totalScore += score;
  }

  let severity = "Unknown";
  if (totalScore >= 20) severity = "Severe";
  else if (totalScore >= 15) severity = "Moderately Severe";
  else if (totalScore >= 10) severity = "Moderate";
  else if (totalScore >= 5) severity = "Mild";
  else severity = "Minimal";

  console.log(`🎯 Final Score: ${totalScore} → Severity: ${severity}`);

  return res.json({ total: totalScore, result: severity });
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
