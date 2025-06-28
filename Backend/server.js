const express = require('express');
const cors = require('cors');
const axios = require('axios');
const phq9 = require('./phq9');

const app = express();
app.use(cors());
app.use(express.json());

// Helper: Query Ollama's neural-chat model for a single free-text answer
async function queryOllama(question, answer) {
  // Construct a prompt to ask neural-chat to score answer 0-3 based on PHQ-9 scale
  const prompt = `
You are a medical assistant scoring answers based on the PHQ-9 depression questionnaire.

Question: "${question}"
User answer: "${answer}"

Please respond ONLY with a number 0, 1, 2, or 3 representing the severity score according to PHQ-9.

No explanations or extra text.
`;

  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'neural-chat',
      messages: [{ role: 'user', content: prompt }]
    });

    // The API returns an array of choices with message content
    const text = response.data.choices?.[0]?.message?.content.trim();

    // Extract just the score (0 to 3)
    const score = parseInt(text);
    if ([0,1,2,3].includes(score)) {
      return score;
    } else {
      console.warn("Invalid score from LLM:", text);
      return 0; // fallback minimal score
    }
  } catch (error) {
    console.error("Error querying Ollama:", error.message);
    return 0; // fallback minimal score on error
  }
}

// Serve PHQ-9 questions
app.get('/questions', (req, res) => {
  res.json(phq9);
});

// Handle scoring logic with LLM for free-text answers
app.post('/score', async (req, res) => {
  const answers = req.body.answers;

  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: "Invalid answers array" });
  }

  if (answers.length !== phq9.length) {
    return res.status(400).json({ error: `Answers must be length ${phq9.length}` });
  }

  let totalScore = 0;

  // Process each answer
  for (let i = 0; i < answers.length; i++) {
    const ans = answers[i];
    let score = 0;

    if (typeof ans === 'string') {
      // If answer is numeric string like "0","1","2","3" just parse it
      const parsed = parseInt(ans);
      if ([0,1,2,3].includes(parsed)) {
        score = parsed;
      } else {
        // Otherwise, treat as free-text and ask LLM
        score = await queryOllama(phq9[i].question, ans);
      }
    } else if (typeof ans === 'number') {
      score = [0,1,2,3].includes(ans) ? ans : 0;
    } else {
      score = 0;
    }

    totalScore += score;
  }

  // Determine severity level
  let severity = "";
  if (totalScore <= 4) severity = "Minimal or no depression";
  else if (totalScore <= 9) severity = "Mild depression";
  else if (totalScore <= 14) severity = "Moderate depression";
  else if (totalScore <= 19) severity = "Moderately severe depression";
  else severity = "Severe depression";

  res.json({ total: totalScore, result: severity });
});

// Start server
app.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});
