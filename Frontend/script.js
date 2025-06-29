let conversationHistory = [];
let currentQuestion = null;
let currentQuestionId = 0;
let currentUtterance = null;

// Show question and options dynamically in #question-box
function showQuestion(questionText, questionId, options) {
  questionText = questionText.replace(/^Q\d+:\s*/, '');
  
  currentQuestion = questionText;
  currentQuestionId = questionId;

  const box = document.getElementById('question-box');
  box.innerHTML = `
    <h3>Q${questionId + 1}: ${questionText}</h3>
    <div id="options">
      ${options.map((opt, i) => `
        <label>
          <input type="radio" name="option" value="${i}"/> ${opt}
        </label><br>
      `).join('')}
    </div>
  `;

  // Speak question aloud
  if (currentUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  const spokenText = questionText;
  currentUtterance = new SpeechSynthesisUtterance(spokenText);
  currentUtterance.lang = "en-US";
  window.speechSynthesis.speak(currentUtterance);

  // Clear any previous selection
  const radios = document.querySelectorAll('input[name="option"]');
  radios.forEach(radio => radio.checked = false);

  // Clear spoken text display and any previous follow-up messages
  document.getElementById('spoken-text').textContent = '';
  // Remove any existing follow-up message paragraphs
  const followUps = document.querySelectorAll('.follow-up');
  followUps.forEach(el => el.remove());
}

// Fetch next question from backend, or submit if done
async function fetchNextQuestion() {
  try {
    const res = await fetch('http://localhost:3000/next-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: conversationHistory })
    });
    const data = await res.json();

    if (data.question) {
      const phq9Options = ["Not at all", "Several days", "More than half the days", "Nearly every day"];
      showQuestion(data.question, conversationHistory.length, phq9Options);
      document.getElementById('next-btn').disabled = false;
    } else {
      // No more questions - submit all answers
      await submitAnswers();
    }
  } catch (err) {
    alert('Error fetching next question: ' + err.message);
    document.getElementById('next-btn').disabled = false;
  }
}

// Submit all answers to backend and display result
async function submitAnswers() {
  const answers = conversationHistory.map(qa => qa.answer);

  try {
    const res = await fetch('http://localhost:3000/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    const result = await res.json();

    // Clear UI elements
    document.getElementById('question-box').innerHTML = '';
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('text-answer').style.display = 'none';
    document.getElementById('send-btn').style.display = 'none';
    document.getElementById('mic-btn').style.display = 'none';
    document.getElementById('spoken-text').textContent = '';

    const score = result.total ?? 0;
    const severity = result.result ?? "Unknown";

    document.getElementById('result-box').innerHTML = `
      <hr style="margin-top:20px; margin-bottom:20px; border:1px solid #cbd5e1;">
      <h2>Your Score: ${score} / 27</h2>
      <div class="progress-bar-wrapper" style="width:100%; height:14px; background:#e5e7eb; border-radius:10px; overflow:hidden; margin:10px 0;">
        <div class="progress-bar" style="width:${(score / 27) * 100}%; height:100%; background:#3b82f6;"></div>
      </div>
      <p style="margin-top:10px; font-weight:500;">Severity Level: <strong>${severity}</strong></p>
    `;
  } catch (err) {
    alert('Error submitting answers: ' + err.message);
  }
}

// Fetch follow-up message from backend
async function getFollowUpMessage(question, answer) {
  try {
    const response = await fetch('http://localhost:3000/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer })
    });
    const data = await response.json();
    return data.message || "";
  } catch (error) {
    console.error("Follow-up fetch error:", error);
    return "";
  }
}

// NEXT button click handler with follow-up message feature
document.getElementById('next-btn').onclick = async () => {
  // Disable button to prevent double clicks
  const nextBtn = document.getElementById('next-btn');
  nextBtn.disabled = true;

  // Check for selected radio option first
  const selectedOption = document.querySelector('input[name="option"]:checked');
  // Get typed answer from fixed text input
  const typedAnswer = document.getElementById('text-answer').value.trim();

  if (!selectedOption && typedAnswer === "") {
    alert('Please select an option or type an answer.');
    nextBtn.disabled = false;
    return;
  }

  // Determine the user's answer
  const answer = selectedOption ? parseInt(selectedOption.value) : typedAnswer;

  // Save current Q&A to conversation history
  conversationHistory.push({ question: currentQuestion, answer });

  // Clear typed answer input for next question
  document.getElementById('text-answer').value = '';

  // Fetch follow-up message
  const followUpMsg = await getFollowUpMessage(currentQuestion, answer);

  if (followUpMsg) {
    const questionBox = document.getElementById('question-box');
    const p = document.createElement('p');
    p.className = 'follow-up';
    p.textContent = followUpMsg;
    questionBox.appendChild(p);

    // Wait 2 seconds before fetching the next question
    setTimeout(() => {
      fetchNextQuestion();
    }, 2000);
  } else {
    // No follow-up message, just fetch next question immediately
    fetchNextQuestion();
  }
};

// MIC button and speech recognition: fills #text-answer
document.getElementById('mic-btn').onclick = () => {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }

  if (!('webkitSpeechRecognition' in window)) {
    alert("Speech recognition not supported in this browser.");
    return;
  }

  const recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  document.getElementById('listening-dots').style.display = 'block';
  recognition.start();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('spoken-text').textContent = "You said: " + transcript;
    document.getElementById('text-answer').value = transcript;
    document.getElementById('listening-dots').style.display = 'none';
  };

  recognition.onerror = (e) => {
    document.getElementById('listening-dots').style.display = 'none';
    alert("Speech error: " + e.error);
  };

  recognition.onend = () => {
    document.getElementById('listening-dots').style.display = 'none';
  };
};

// SEND button just triggers NEXT button click
document.getElementById('send-btn').onclick = () => {
  document.getElementById('next-btn').click();
};

// ENTER key submits from text input
document.getElementById('text-answer').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('next-btn').click();
  }
});

// On page load, start by fetching the first question
fetchNextQuestion();

