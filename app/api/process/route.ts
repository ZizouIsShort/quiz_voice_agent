import { type NextRequest } from 'next/server'
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

export async function POST(request: NextRequest) {
  const { text } = await request.json();
  console.log(text);
  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    input: "You are an AI assistant that helps with making quizzes. Your task is to create a quiz based on the following text amd return a structured question answer format output " + text,
  });

  console.log(interaction.output_text);
  return new Response(JSON.stringify({ message: 'success' }), { status: 200 });

}
