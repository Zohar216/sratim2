"use client";

import { useState, FormEvent } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="relative flex items-center gap-2">
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies and series..."
          className="w-full rounded-full border border-white/10 bg-white/5 py-3.5 pl-5 pr-24 text-base text-white placeholder:text-white/40 backdrop-blur-sm transition-all duration-200 focus:border-white/20 focus:bg-white/10 focus:outline-none disabled:opacity-50 sm:text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20 active:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isLoading ? "..." : "Search"}
        </button>
      </div>
    </form>
  );
}
