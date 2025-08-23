# Mental-Health-Interview-Agent
This project is an AI-powered mental health screening tool using the PHQ-9 questionnaire. It uses a conversational interface to guide users through the screening, calculates the total score and severity, and generates a downloadable PDF report.

MindCare is designed with privacy in mind, running the language model locally via Ollama (LLaMA 3). All user data and conversation history are securely stored in MongoDB Atlas.

Features:
1. Secure Login/Signup with JWT-based authentication.
2. AI-Powered Conversation using the LLaMA 3 model hosted via Ollama.
3. Crisis Detection that halts conversations if emotional distress is detected and provides helpline information.
4. PDF Report Generation summarizing the conversation and PHQ-9 score.
5. Secure Data Handling using MongoDB Atlas.

Prerequisites:
Before you start, make sure you have the following installed:

1.Node.js: The project uses Node.js for the backend.
           ---->install Node.js

2.Ollama: The project uses the LLaMA 3 model locally via Ollama for natural language processing.
           ---->Download and install Ollama from Ollama’s official website

3.MongoDB Atlas: This project uses MongoDB Atlas to store user data and chat history.
          ---->You will need an account on MongoDB Atlas
          and a connection string to set up the database.
4.Google Chrome or any modern browser: For running the web interface.




Installation Setup step by step:
1.Open your terminal (or VS Code's terminal) and run the following command to clone the repository:
 git clone https://github.com/yourusername/mental-health-interview-agent.git
 cd mental-health-interview-agent

2.Install Node.js Dependencies
Make sure you have Node.js installed. In the project directory, run: 
         npm install
This will install all the required dependencies for the backend (Node.js, Express.js, etc.) as listed in package.json.
3. Install MongoDB Dependencies
  Create a free account on MongoDB Atlas
  and create a cluster to store your user data and conversation history. Once the cluster is set up, create a database user and save your connection string.

  You can replace the mongodb+srv:// string in the server.js file with your MongoDB Atlas connection string .
  example:
mongoose.connect("mongodb+srv://<username>:<password>@cluster0.mongodb.net/mydatabase?retryWrites=true&w=majority");

4. Install Ollama and Set Up LLaMA 3
To use the LLaMA 3 model locally, you need to download and run Ollama. Follow these steps:
Visit the Ollama website and download the app for your operating system.Once installed, open a terminal and run the following command to download the LLaMA 3 model:
quit ollama app first then step by step follow.

cmd1:
set OLLAMA_HOST=127.0.0.1
ollama serve

cmd2:
ollama pull llama3
ollama run llama3

5. Set Up Environment Variables
 Create a .env file in the root directory of your project. In this file, add the following environment variables:
   JWT_SECRET=your-secret-key
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/mydatabase?retryWrites=true&w=majority
   
  Replace <username>, <password>, and mydatabase with your MongoDB Atlas credentials and database name.

6. Start the Application
 Vs code/any IDE terminal:
 cd Backend
 node server.js

 **in another terminal of vs code(click  + for new terminal )bot health check:
 curl http://localhost:5000/health/ollama

 -->if output of this look like
    StatusCode        : 200                                                                                                                                      
    StatusDescription : OK 
 -->then the server will response perfectly.

7.Final step
welcome.html, open it as a live server

 

