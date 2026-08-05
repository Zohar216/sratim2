"use client";

import { useEffect, useRef, useState } from "react";
import { Movie } from "@/types/movie";

interface MoviePlayerModalProps {
  movie: Movie;
  onClose: () => void;
}

export default function MoviePlayerModal({ movie, onClose }: MoviePlayerModalProps) {
  const [isUnavailable, setIsUnavailable] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!movie.iframeSrc) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      setIsUnavailable(true);
    }, 8000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [movie.iframeSrc]);

  const handleIframeLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsUnavailable(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={movie.title}
    >
      <div className="safe-top flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/90 px-3 py-3 sm:px-5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-light text-white sm:text-base">
          {movie.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors active:bg-white/20"
          aria-label="Close player"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        {movie.iframeSrc && !isUnavailable ? (
          <iframe
            src={movie.iframeSrc}
            className="absolute inset-0 h-full w-full border-0"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
            title={movie.title}
            onLoad={handleIframeLoad}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            {movie.thumbnail && (
              <div
                className="h-48 w-32 rounded-lg bg-cover bg-center opacity-40 sm:h-64 sm:w-44"
                style={{ backgroundImage: `url(${movie.thumbnail})` }}
              />
            )}
            <p className="text-center text-sm font-light text-white/60">
              {isUnavailable ? "Unavailable" : "No player source"}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-light text-white/80 transition-colors active:bg-white/15"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
