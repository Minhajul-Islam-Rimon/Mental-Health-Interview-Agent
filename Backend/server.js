const express = require('express');
const cors = require('cors');
const axios = require('axios');
const phq9 = require('./phq9');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// Helper: Query Ollama LLM
async function queryOllama(question, answer) {
  const prompt = `
You are a medical assistant scoring answers based on the PHQ-9 depression questionnaire.

Question: "${question}"
User answer: "${answer}"

Respond ONLY with one of the following numbers: 0, 1, 2, or 3.
Do not include any other text. Just reply with a number.
  `.trim();

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'neural-chat',
      stream: false,
      messages: [{ role: 'user', content: prompt }]
    });

    console.log("🧠 Full Ollama API response:", response.data);

    const raw = response.data.message?.content?.trim() || '';

    console.log("LLM raw response:", raw);

    const score = parseInt(raw);
    if ([0, 1, 2, 3].includes(score)) return score;

    const match = raw.match(/[0-3]/);
    if (match) return parseInt(match[0]);

    console.warn("❗ Unexpected LLM score:", raw);
    return 0;
  } catch (err) {
    console.error("❌ Ollama error:", err.message);
    return 0;
  }
}

// Endpoint: Get all PHQ-9 questions (optional, for reference)
app.get('/questions', (req, res) => {
  res.json(phq9);
});

// Endpoint: Provide next question based on conversation history
app.post('/next-question', async (req, res) => {
  const history = req.body.history;
  if (!Array.isArray(history)) return res.status(400).json({ error: "Invalid history format" });

  if (history.length === 0) {
    return res.json({ question: phq9[0].question });
  }

  if (history.length >= phq9.length) {
    return res.json({ question: null });
  }

  // Prepare conversation text for prompt
  const conversationText = history.map((qa, i) =>
    `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`
  ).join('\n');

  const prompt = `
You are a medical assistant conducting a PHQ-9 depression interview.

Here is the conversation so far:
${conversationText}

Based on the answers, suggest the next PHQ-9 style question to ask the user.

Only output the question text. No explanations or extra text.
  `.trim();

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'neural-chat',
      stream: false,
      messages: [{ role: 'user', content: prompt }]
    });

    const nextQuestionRaw = response.data.message?.content?.trim() || '';

    // Validate next question text length
    if (!nextQuestionRaw || nextQuestionRaw.length < 5) {
      // fallback: return next question from static list
      return res.json({ question: phq9[history.length].question });
    }

    return res.json({ question: nextQuestionRaw });
  } catch (err) {
    console.error("❌ Ollama error on next-question:", err.message);
    // fallback
    return res.json({ question: phq9[history.length].question });
  }
});

// Endpoint: Score all answers and provide result
app.post('/score', async (req, res) => {
  const answers = req.body.answers;
  if (!Array.isArray(answers) || answers.length !== phq9.length) {
    return res.status(400).json({ error: "Invalid or incomplete answers array" });
  }

  let totalScore = 0;
  for (let i = 0; i < phq9.length; i++) {
    let ans = answers[i];
    let score = 0;

    if (typeof ans === 'number' && [0,1,2,3].includes(ans)) {
      score = ans;
    } else if (typeof ans === 'string') {
      // Try to parse string as number
      const parsed = parseInt(ans);
      if ([0,1,2,3].includes(parsed)) {
        score = parsed;
      } else {
        // Query LLM to score free-text answer
        score = await queryOllama(phq9[i].question, ans);
      }
    }

    totalScore += score;
  }

  // Determine severity level
  let severity = "Unknown";
  if (totalScore >= 20) severity = "Severe";
  else if (totalScore >= 15) severity = "Moderately Severe";
  else if (totalScore >= 10) severity = "Moderate";
  else if (totalScore >= 5) severity = "Mild";
  else severity = "Minimal";

  return res.json({ total: totalScore, result: severity });
});

// Endpoint: Provide contextual follow-up question
app.post('/follow-up', async (req, res) => {
  const { history, lastAnswer } = req.body;

  if (!Array.isArray(history) || typeof lastAnswer !== 'string') {
    return res.status(400).json({ error: "Invalid request data" });
  }

  const conversationText = history.map((qa, i) =>
    `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer}`
  ).join('\n');

  const prompt = `
You are a compassionate medical assistant conducting a PHQ-9 depression interview.

Conversation so far:
${conversationText}

Last user answer:
${lastAnswer}

Provide a gentle, empathetic follow-up question related to the previous discussion.
Respond ONLY with the follow-up question text, no explanations.
  `.trim();

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'neural-chat',
      stream: false,
      messages: [{ role: 'user', content: prompt }]
    });

    const followUpRaw = response.data.message?.content?.trim() || '';

    if (!followUpRaw || followUpRaw.length < 5) {
      return res.json({ followUpQuestion: null });
    }

    return res.json({ followUpQuestion: followUpRaw });
  } catch (err) {
    console.error("❌ Ollama error on follow-up:", err.message);
    return res.json({ followUpQuestion: null });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
