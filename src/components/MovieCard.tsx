"use client";

import { useState } from "react";
import { Movie } from "@/types/movie";
import MoviePlayerModal from "@/components/MoviePlayerModal";

interface MovieCardProps {
  movie: Movie;
}

export default function MovieCard({ movie }: MovieCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canPlay = Boolean(movie.iframeSrc);

  const handleOpen = () => {
    if (canPlay) {
      setIsExpanded(true);
    }
  };

  return (
    <>
      <article className="group relative overflow-hidden rounded-xl bg-white/5 transition-transform duration-300 active:scale-[0.98] sm:hover:scale-[1.02] sm:hover:bg-white/10">
        <button
          type="button"
          onClick={handleOpen}
          disabled={!canPlay}
          className="relative aspect-[2/3] w-full overflow-hidden text-left disabled:cursor-default"
          aria-label={canPlay ? `Play ${movie.title}` : movie.title}
        >
          {movie.thumbnail ? (
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 sm:group-hover:scale-105"
              style={{ backgroundImage: `url(${movie.thumbnail})` }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-white/5">
              <div className="text-center px-2">
                <div className="mb-2 text-3xl opacity-30">🎬</div>
                <p className="text-xs text-white/40 line-clamp-3">{movie.title}</p>
              </div>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

          {canPlay && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-sm transition-all duration-300 sm:h-11 sm:w-11 sm:opacity-0 sm:group-hover:opacity-100">
                <svg
                  viewBox="0 0 24 24"
                  className="ml-0.5 h-5 w-5 fill-current"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3 sm:opacity-0 sm:transition-opacity sm:duration-300 sm:group-hover:opacity-100">
            <h3 className="text-[11px] font-light leading-snug text-white line-clamp-2 sm:text-xs">
              {movie.title}
            </h3>
            {canPlay && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-light text-white/70 sm:hidden">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                </svg>
                Expand
              </span>
            )}
          </div>
        </button>
      </article>

      {isExpanded && (
        <MoviePlayerModal
          key={movie.id}
          movie={movie}
          onClose={() => setIsExpanded(false)}
        />
      )}
    </>
  );
}
