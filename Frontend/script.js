let questions = [];
let current = 0;
let answers = [];
let currentUtterance = null; // For TTS reference

// Step 1: Fetch questions
fetch('http://localhost:3000/questions')
  .then(res => res.json())
  .then(data => {
    questions = data;
    showQuestion();
  });

// Step 2: Show current question
function showQuestion() {
  const box = document.getElementById('question-box');
  const q = questions[current];

  // Clear spoken text and input field
  document.getElementById('spoken-text').textContent = '';
  document.getElementById('text-answer').value = '';

  // Clear any selected radio buttons on new question
  const radios = document.querySelectorAll('input[name="option"]');
  radios.forEach(radio => radio.checked = false);

  box.innerHTML = `
    <h3>Q${q.id}: ${q.question}</h3>
    ${q.options.map((opt, i) => `
      <label><input type="radio" name="option" value="${i}"/> ${opt}</label>
    `).join('')}
  `;

  // Speak the question aloud
  if (currentUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = new SpeechSynthesisUtterance(q.question);
  currentUtterance.lang = "en-US";
  window.speechSynthesis.speak(currentUtterance);
}

// Step 3: Handle NEXT button
document.getElementById('next-btn').onclick = () => {
  const selected = document.querySelector('input[name="option"]:checked');
  const textAnswer = document.getElementById('text-answer').value.trim();

  if (selected) {
    // If user selected an option, push the numeric value as string (for compatibility)
    answers.push(selected.value);
  } else if (textAnswer !== "") {
    // If user typed free text, push as is
    answers.push(textAnswer);
  } else {
    alert("Please select or type an answer.");
    return;
  }

  current++;

  if (current < questions.length) {
    showQuestion();
  } else {
    // Step 4: Submit all answers (mixed numeric & free-text) to backend for LLM analysis
    fetch('http://localhost:3000/score', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    })
    .then(res => res.json())
    .then(result => {
      document.getElementById('question-box').innerHTML = "";
      document.getElementById('next-btn').style.display = "none";
      document.getElementById('spoken-text').textContent = '';
      document.getElementById('text-answer').style.display = "none";
      document.getElementById('send-btn').style.display = "none";
      document.getElementById('mic-btn').style.display = "none";

      const score = result.total;
      const severity = result.result;

      document.getElementById('result-box').innerHTML = `
        <hr style="margin-top: 20px; margin-bottom: 20px; border: 1px solid #cbd5e1;">
        <h2>Your Score: ${score} / 27</h2>
        <div class="progress-bar-wrapper" style="width: 100%; height: 14px; background: #e5e7eb; border-radius: 10px; overflow: hidden; margin: 10px 0;">
          <div class="progress-bar" style="width: ${(score / 27) * 100}%; height: 100%; background: #3b82f6;"></div>
        </div>
        <p style="margin-top: 10px; font-weight: 500;">Severity Level: <strong>${severity}</strong></p>
      `;
    })
    .catch(e => {
      alert("Error processing your answers: " + e.message);
    });
  }
};

// Step 5: Handle MIC input with listening dots
const micDots = document.getElementById('listening-dots');

document.getElementById('mic-btn').onclick = () => {
  // Stop TTS if speaking
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

  micDots.style.display = 'block'; // Show dots when listening
  recognition.start();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;

    // Show transcript and fill input field for free text input
    document.getElementById('spoken-text').textContent = "You said: " + transcript;
    document.getElementById('text-answer').value = transcript;

    micDots.style.display = 'none'; // Hide dots after result
  };

  recognition.onerror = (e) => {
    micDots.style.display = 'none'; // Hide dots on error
    alert("Speech error: " + e.error);
  };

  recognition.onend = () => {
    micDots.style.display = 'none'; // Hide dots when recognition ends
  };
};

// Step 6: Handle SEND button (text)
document.getElementById('send-btn').onclick = () => {
  document.getElementById('next-btn').click(); // Trigger next question
};

// Handle ENTER key for input field
document.getElementById('text-answer').addEventListener('keydown', (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById('next-btn').click();
  }
});
