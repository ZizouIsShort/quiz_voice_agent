"use client";

import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import Vapi from "@vapi-ai/web";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const QUIZ_SYSTEM_PROMPT = `You are a quiz host. You will be given quiz data containing multiple-choice questions with options and the correct answer.

Instructions:
- Ask the user one question at a time, in order.
- Read the question and all 4 options (A, B, C, D) to the user.
- After they answer, tell them if they got it right or wrong and reveal the correct answer.
- Keep a running score and mention it after each answer.
- If the user says "skip" or "I don't know," reveal the correct answer and move on without penalizing harshly.
- After the last question, announce the final score and give a short closing remark.
- Keep your responses conversational and brief.
- Do not ask multiple questions at once.
- Start with Question 1 and proceed in order.`;

type Question = {
  question: string;
  options: string[];
  correctAnswer: string;
  difficulty?: "easy" | "medium" | "hard";
};

const FileUploadForm = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState("");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  const vapiRef = useRef<Vapi | null>(null);
  const pendingQuizData = useRef<string | null>(null);

  useEffect(() => {
    const vapi = new Vapi(
      process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!
    );

    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setIsCallActive(true);

      if (pendingQuizData.current && vapiRef.current) {
        vapiRef.current.send({
          type: "add-message",
          message: {
            role: "system",
            content: pendingQuizData.current,
          },
        });
        pendingQuizData.current = null;
      }
    });

    vapi.on("call-end", () => {
      setIsCallActive(false);
    });

    vapi.on("error", (error) => {
      console.error("Vapi error:", error);
      setError("Something went wrong with the voice quiz.");
      setIsCallActive(false);
    });

    return () => {
      vapi.stop();
      vapiRef.current = null;
    };
  }, []);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0] ?? null;

    setSelectedFile(file);
    setQuestions([]);
    setError("");
  };

  const generateQuiz = async () => {
    if (!selectedFile) {
      setError("Please select a PDF first.");
      return;
    }

    setLoading(true);
    setError("");
    setQuestions([]);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();

      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
      }).promise;

      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
          .filter(
            (item): item is TextItem =>
              "str" in item
          )
          .map((item) => item.str)
          .join(" ");

        fullText += pageText + "\n";
      }

      if (!fullText.trim()) {
        throw new Error(
          "No text could be extracted from the PDF."
        );
      }

      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: fullText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(
          errorData.error ||
            "Failed to generate quiz."
        );
      }

      const data = await response.json();

      if (
        !data.questions ||
        data.questions.length === 0
      ) {
        throw new Error(
          "No questions were generated."
        );
      }

      setQuestions(data.questions);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while generating the quiz."
      );
    } finally {
      setLoading(false);
    }
  };

  const startVoiceQuiz = async () => {
    if (
      !questions.length ||
      !vapiRef.current
    ) {
      return;
    }

    setError("");

    const quizDataText = questions
      .map(
        (q, i) =>
          `Question ${i + 1}: ${q.question}\nCorrect answer: ${q.correctAnswer}\nOptions: ${q.options.join(", ")}`
      )
      .join("\n\n");

    try {
      pendingQuizData.current = `${QUIZ_SYSTEM_PROMPT}

The user has generated the following quiz from their study material.

${quizDataText}

You must use ONLY these questions for this quiz.

Begin with Question 1 when the user is ready.`;

      await vapiRef.current.start(
        process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!
      );
    } catch (err) {
      console.error(err);
      setError("Failed to start the voice quiz.");
      pendingQuizData.current = null;
    }
  };

  const stopQuiz = () => {
    vapiRef.current?.stop();
  };

  return (
    <main className="min-h-screen bg-white px-4 py-20 text-neutral-900">
      <div className="mx-auto max-w-2xl">

        <h1 className="mb-2 text-3xl font-semibold tracking-tight">
          Quiz Generator
        </h1>

        <p className="mb-12 text-sm text-neutral-500">
          Drop a PDF, get a quiz.
        </p>

        <div>
          <label
            className={`flex cursor-pointer items-center justify-center border p-8 text-sm transition ${
              selectedFile
                ? "border-neutral-900 bg-neutral-50"
                : "border-neutral-300 hover:border-neutral-500"
            }`}
          >
            {selectedFile ? (
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  {selectedFile.name}
                </span>
                <span className="text-neutral-400">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            ) : (
              <span className="text-neutral-400">
                Select a PDF
              </span>
            )}

            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={loading || isCallActive}
              className="hidden"
            />
          </label>

          <button
            onClick={generateQuiz}
            disabled={
              !selectedFile ||
              loading ||
              isCallActive
            }
            suppressHydrationWarning
            className="mt-3 w-full border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {loading ? "Generating..." : "Generate"}
          </button>

          {error && (
            <p className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        {questions.length > 0 && (
          <section className="mt-16">

            <div className="mb-8 flex items-baseline justify-between">
              <h2 className="text-lg font-medium">
                {questions.length} questions
              </h2>
              <button
                onClick={isCallActive ? stopQuiz : startVoiceQuiz}
                className="text-sm font-medium text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                {isCallActive ? "End session" : "Voice quiz"}
              </button>
            </div>

            <div className="space-y-1">
              {questions.map(
                (question, index) => {
                  const isRevealed = revealedAnswers[index];
                  const selected = selectedAnswers[index];

                  return (
                    <div
                      key={index}
                      className="border-b border-neutral-200 py-5"
                    >
                      <div className="flex gap-3">
                        <span className="shrink-0 pt-0.5 text-xs text-neutral-400">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <div className="flex-1">
                          <h3 className="text-sm font-medium leading-relaxed">
                            {question.question}
                          </h3>

                          <div className="mt-3 space-y-1.5">
                            {question.options.map(
                              (option, optIndex) => {
                                const letter = String.fromCharCode(
                                  65 + optIndex
                                );
                                const isCorrect =
                                  option ===
                                  question.correctAnswer;
                                const isSelected =
                                  selected === option;

                                let btnClass =
                                  "text-left text-sm px-3 py-1.5 border transition";

                                if (!isRevealed) {
                                  btnClass +=
                                    " border-transparent hover:border-neutral-300";
                                } else if (isCorrect) {
                                  btnClass +=
                                    " border-neutral-900 bg-neutral-900 text-white";
                                } else if (
                                  isSelected &&
                                  !isCorrect
                                ) {
                                  btnClass +=
                                    " border-red-300 bg-red-50 text-red-700 line-through";
                                } else {
                                  btnClass +=
                                    " border-transparent text-neutral-300";
                                }

                                return (
                                  <button
                                    key={optIndex}
                                    onClick={() => {
                                      if (isRevealed) return;
                                      setSelectedAnswers(
                                        (prev) => ({
                                          ...prev,
                                          [index]: option,
                                        })
                                      );
                                      setRevealedAnswers(
                                        (prev) => ({
                                          ...prev,
                                          [index]: true,
                                        })
                                      );
                                    }}
                                    className={btnClass}
                                  >
                                    <span className="mr-2 text-xs text-neutral-400">
                                      {letter}.
                                    </span>
                                    {option}
                                  </button>
                                );
                              }
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

          </section>
        )}
      </div>
    </main>
  );
};

export default FileUploadForm;
