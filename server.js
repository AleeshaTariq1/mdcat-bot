const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenerativeAI(process.env.MDCAT_Bot);

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const subject = req.body.subject || "All";
    const mode = req.body.mode || "chat";
    const language = req.body.language || "english";
    const year = req.body.year || "any";

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const languageInstruction = language === "roman_urdu"
      ? "Roman Urdu mein jawab do (Urdu words ko Roman script mein likho) — simple aur clear. Scientific/technical terms English mein rakho."
      : "Answer in clear, simple English. Keep all scientific and technical terms in English.";

    let subjectInstruction = "Biology, Chemistry, Physics, English, and Logical Reasoning";
    if (subject === "Biology")           subjectInstruction = "Biology only";
    if (subject === "Chemistry")         subjectInstruction = "Chemistry only";
    if (subject === "Physics")           subjectInstruction = "Physics only";
    if (subject === "English")           subjectInstruction = "English only";
    if (subject === "Logical Reasoning") subjectInstruction = "Logical Reasoning only";

    const yearInstruction = year !== "any"
      ? `Create the question in MDCAT ${year} past paper style.`
      : "Create an MDCAT style question.";

    let prompt;

    if (mode === "mcq") {
      prompt = `You are an MDCAT preparation assistant for Pakistani medical students.
Create ONE MDCAT-style MCQ from: ${subjectInstruction}.
${yearInstruction}

STRICTLY follow this exact format — no extra text before or after:

Question: [write the question here]

A) [option A]
B) [option B]
C) [option C]
D) [option D]

IMPORTANT RULES:
- Only provide the question and exactly 4 options (A, B, C, D)
- Do NOT reveal the answer
- Do NOT add any explanation
- Do NOT add option E or any other option
- ${languageInstruction}`;

    } else if (mode === "mcq_answer") {
      prompt = `You are an MDCAT preparation assistant.
The question was: ${req.body.previousQuestion}
Student's answer: ${userMessage}

Tell if the answer is correct or wrong.
Then:
1. Explain the correct answer (A, B, C, or D only)
2. Briefly explain why each wrong option is incorrect
3. If Biology — describe any relevant diagram or structure in text if helpful

${languageInstruction}`;

    } else if (mode === "diagram") {
      prompt = `You are an MDCAT Biology expert.
The student wants a diagram/structure for: ${userMessage}

Create a clear labeled diagram using a structured list.
Then explain the function of each part.

Format:
[Structure Name]
- Part 1: function
- Part 2: function
- Part 3: function

${languageInstruction}`;

    } else if (mode === "weightage") {
      prompt = `You are an MDCAT expert.
Show topic-wise weightage for: ${subjectInstruction} in MDCAT.

Format as a table:
Topic | Approximate % | Important Subtopics

Then highlight the top 3 most important topics.
${languageInstruction}`;

    } else {
      prompt = `You are an MDCAT preparation assistant for Pakistani medical students.
Only answer MDCAT-related questions about: ${subjectInstruction}.
${languageInstruction}
If a Biology question benefits from a diagram, provide a simple labeled text structure.
If the student asks about past papers, suggest using MCQ Practice mode.
Student's question: ${userMessage}`;
    }

    const result = await model.generateContent(prompt);
    const reply = result.response.text();
    res.json({ reply });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ reply: "Server busy — please try again in a moment! 🙏" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MDCAT Bot running on port ${PORT}`);
});
