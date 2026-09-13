"use client"

import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import Vapi from '@vapi-ai/web';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const QUIZ_SYSTEM_PROMPT = `You are a quiz host. You will be given quiz data containing questions and ideal answers.

Instructions:
- Ask the user one question at a time, in order.
- After they answer, compare their spoken answer to the ideal answer. If it's correct or close enough, confirm and give brief positive feedback. If it's wrong or incomplete, gently correct them and give the right answer.
- Keep a running score and mention it after each answer (e.g. "That's 3 out of 4 so far").
- If the user says "skip" or "I don't know," move to the next question without penalizing harshly.
- After the last question, announce the final score and give a short closing remark.
- Keep your responses conversational and brief — this is a spoken conversation, not a written one.`;

const FileUploadForm = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    vapiRef.current = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
    vapiRef.current.on('call-start', () => setIsCallActive(true));
    vapiRef.current.on('call-end', () => setIsCallActive(false));

    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedFile) {
      alert("Please select a file");
      return;
    }

    setLoading(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
          .filter((item): item is TextItem => 'str' in item)
          .map((item) => item.str)
          .join(" ");

        fullText += pageText + "\n";
      }

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate quiz");
      }

      const data = await response.json();

      if (!data.questions || data.questions.length === 0) {
        throw new Error("No questions returned");
      }

      const quizDataText = data.questions
        .map((q: { question: string; answer: string }, i: number) =>
          `Q${i + 1}: ${q.question}\nIdeal answer: ${q.answer}`
        )
        .join('\n\n');

      console.log('=== QUIZ DATA BEING SENT ===');
      console.log(quizDataText);

      // Bypasses the dashboard {{quizData}} template entirely — the full
      // system prompt (with quiz content baked in) is sent directly on
      // every call, so there's nothing relying on dashboard-side substitution.
      const assistantOverrides = {
        model: {
          provider: "openai" as const,
          model: "gpt-4.1",
          messages: [
            {
              role: "system" as const,
              content: `${QUIZ_SYSTEM_PROMPT}\n\nQuiz data:\n${quizDataText}`,
            },
          ],
        },
      };

      console.log('=== ASSISTANT OVERRIDES ===', assistantOverrides);

      await vapiRef.current?.start(
        process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!,
        assistantOverrides
      );

    } catch (err) {
      console.error(err);
      alert("Something went wrong generating or starting the quiz.");
    } finally {
      setLoading(false);
    }
  };

  const stopQuiz = () => {
    vapiRef.current?.stop();
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 border rounded-xl shadow-md bg-white">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">
        PDF Voice Quiz
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={isCallActive || loading}
          className="w-full border border-gray-300 rounded-lg p-2 file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded-md file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700"
        />

        <button
          type="submit"
          disabled={isCallActive || loading}
          className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Generating quiz..." : "Upload & Start Quiz"}
        </button>

        {isCallActive && (
          <button
            type="button"
            onClick={stopQuiz}
            className="bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Stop Quiz
          </button>
        )}
      </form>
    </div>
  );
};

export default FileUploadForm;
