const express = require('express');
const cors = require('cors');
const phq9 = require('./phq9');

const app = express();
app.use(cors());
app.use(express.json());

// Serve PHQ-9 questions
app.get('/questions', (req, res) => {
  res.json(phq9);
});

// Handle scoring logic
app.post('/score', (req, res) => {
  const answers = req.body.answers;

  // Ensure all answers are numeric (0–3), ignore invalid values
  const numericAnswers = answers.map(a => {
    const val = parseInt(a);
    return isNaN(val) || val < 0 || val > 3 ? 0 : val;
  });

  // Limit to 9 answers max
  const trimmedAnswers = numericAnswers.slice(0, 9);
  const total = trimmedAnswers.reduce((sum, value) => sum + value, 0);

  // Determine PHQ-9 severity
  let result = "";
  if (total <= 4) result = "Minimal or no depression";
  else if (total <= 9) result = "Mild depression";
  else if (total <= 14) result = "Moderate depression";
  else if (total <= 19) result = "Moderately severe depression";
  else result = "Severe depression";

  res.json({ total, result });
});

// Start server
app.listen(3000, () => {
  console.log("✅ Server is running on http://localhost:3000");
});
