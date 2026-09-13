import { type NextRequest } from 'next/server'
import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are a quiz generation assistant. Given a passage of text, generate quiz questions that test understanding of the material.

Rules:
- Generate between 5 and 8 questions.
- Questions must be answerable using only the provided text — do not require outside knowledge.
- Spread questions evenly across the beginning, middle, and end of the text, not just the first section.
- Vary question types: include factual recall, "why/how" reasoning, and a couple of application-style questions if the content allows it.
- Each answer should be a concise, complete sentence (not just a single word) that could reasonably be graded against a spoken response.
- Assign a difficulty of "easy", "medium", or "hard" to each question based on how directly it's stated in the text vs. how much inference it requires.
- Do not generate duplicate or near-duplicate questions.
- Do not include question numbers, prefixes, or extra formatting inside the question or answer text itself.`;

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: text,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                difficulty: { type: Type.STRING },
              },
              required: ["question", "answer"],
            },
          },
        },
        required: ["questions"],
      },
    },
  });
  const responseText = response.text;
  
  if (!responseText) {
    return new Response(JSON.stringify({ error: "No response from model" }), { status: 500 });
  }
  
  const quiz = JSON.parse(responseText);
  
  return new Response(JSON.stringify(quiz), { status: 200 });
}