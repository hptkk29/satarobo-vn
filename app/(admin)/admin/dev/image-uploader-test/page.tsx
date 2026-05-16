"use client";

import { useState } from "react";
import { ImageUploader } from "@/components/admin/ImageUploader";

export default function ImageUploaderTestPage() {
  const [url, setUrl] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Test ImageUploader</h1>
      <ImageUploader
        value={url}
        onChange={setUrl}
        label="Ảnh test"
        helperText="Test drag-drop, validation, 10MB cap"
        prefix="uploads/_dev"
        aspect="square"
        required
      />
      <pre className="mt-4 bg-gray-100 p-2 rounded text-xs break-all">
        {url || "(empty)"}
      </pre>
    </div>
  );
}
