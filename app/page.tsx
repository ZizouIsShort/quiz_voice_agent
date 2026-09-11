"use client"

import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const FileUploadForm = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedFile(e.target.files?.[0] ?? null);
    };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedFile) {
      alert("Please select a file");
      return;
    }

    const arrayBuffer = await selectedFile.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
    }).promise;

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

    console.log("PDF CONTENT:");
    console.log(fullText);
    const response = await fetch('/api/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: fullText }),
    });
    const data = await response.json();
    console.log(data);
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 border rounded-xl shadow-md bg-white">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">
        File Upload
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="file"
          onChange={handleFileChange}
          className="w-full border border-gray-300 rounded-lg p-2 file:mr-4 file:py-2 file:px-4 file:border-0 file:rounded-md file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700"
        />

        <button
          type="submit"
          className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Upload
        </button>
      </form>
    </div>
  );
};

export default FileUploadForm;
