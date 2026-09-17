import { type NextRequest } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

const SYSTEM_PROMPT = `You are a quiz generation assistant. Given a passage of text, generate multiple-choice quiz questions that test understanding of the material.

Rules:
- Generate between 5 and 8 questions.
- Questions must be answerable using only the provided text.
- Spread questions evenly across the beginning, middle, and end of the text.
- Each question must have exactly 4 options (A, B, C, D). One option must be correct, the other three must be plausible but wrong.
- The correct answer must be a short, concise phrase (1-4 words).
- Distractors should be believable but clearly incorrect based on the text.
- Assign difficulty as easy, medium, or hard.
- Do not generate duplicate or near-duplicate questions.
- Do not include question numbers or prefixes inside question or answer text.`;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const models = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
];

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return Response.json(
        {
          error: "No text provided",
        },
        {
          status: 400,
        }
      );
    }

    let response = null;
    let lastError = null;

    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(
            `Trying ${model}, attempt ${attempt}`
          );

          response = await ai.models.generateContent({
            model,
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
                        question: {
                          type: Type.STRING,
                        },
                        options: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.STRING,
                          },
                        },
                        correctAnswer: {
                          type: Type.STRING,
                        },
                        difficulty: {
                          type: Type.STRING,
                          enum: [
                            "easy",
                            "medium",
                            "hard",
                          ],
                        },
                      },
                      required: [
                        "question",
                        "options",
                        "correctAnswer",
                        "difficulty",
                      ],
                    },
                  },
                },
                required: ["questions"],
              },
            },
          });

          console.log(
            `Successfully generated quiz using ${model}`
          );

          break;
        } catch (error: any) {
          lastError = error;

          const status = error?.status;

          if (
            status !== 503 &&
            status !== 429
          ) {
            throw error;
          }

          console.log(
            `${model} unavailable.`
          );

          if (attempt < 3) {
            const delay =
              Math.pow(2, attempt) * 1000;

            console.log(
              `Retrying ${model} in ${delay}ms`
            );

            await sleep(delay);
          }
        }
      }

      if (response) {
        break;
      }

      console.log(
        `Moving to next Gemini model...`
      );
    }

    if (!response) {
      console.error(
        "All Gemini models failed:",
        lastError
      );

      return Response.json(
        {
          error:
            "Gemini is currently overloaded. Please try again in a few seconds.",
        },
        {
          status: 503,
        }
      );
    }

    const responseText = response.text;

    if (!responseText) {
      return Response.json(
        {
          error: "No response from Gemini",
        },
        {
          status: 500,
        }
      );
    }

    const quiz = JSON.parse(responseText);

    return Response.json(quiz);
  } catch (error: any) {
    console.error(
      "Quiz generation error:",
      error
    );

    return Response.json(
      {
        error:
          error?.message ||
          "Failed to generate quiz.",
      },
      {
        status: 500,
      }
    );
  }
}
