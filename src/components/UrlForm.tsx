"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function UrlForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onSubmit(url.trim());
      }}
    >
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://youtube.com/watch?v=..."
        aria-label="YouTube URL"
        disabled={disabled}
        className="flex-1"
      />
      <Button type="submit" size="lg" disabled={disabled || !url.trim()}>
        {disabled ? "Analyzing…" : "Analyze Video"}
      </Button>
    </form>
  );
}
