"use client";

import { useState, useEffect, useCallback } from "react";
import MovieCard from "@/components/MovieCard";
import SearchBar from "@/components/SearchBar";
import { searchMovies, getRandomMovies } from "@/services/omdbApi";
import { Movie } from "@/types/movie";

type OmdbResult = Awaited<ReturnType<typeof searchMovies>>[number];

function mapResultsToMovies(results: OmdbResult[]): Movie[] {
  return results.map((result) => ({
    id: result.imdbID,
    title: result.Title,
    iframeSrc:
      result.Type === "series"
        ? `https://vidsrc-embed.ru/embed/tv?imdb=${result.imdbID}`
        : `https://vidsrc-embed.ru/embed/movie?imdb=${result.imdbID}`,
    thumbnail: result.Poster !== "N/A" ? result.Poster : undefined,
    type: result.Type,
  }));
}

export default function Home() {
  const [displayMovies, setDisplayMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadInitialMovies = async () => {
      const results = await getRandomMovies(12);
      if (cancelled) {
        return;
      }

      if (results.length > 0) {
        setDisplayMovies(mapResultsToMovies(results));
        setSearchError(null);
      } else {
        setSearchError("Failed to load movies. Please try refreshing the page.");
        setDisplayMovies([]);
      }

      setIsLoading(false);
      setIsSearchMode(false);
    };

    void loadInitialMovies();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadRandomMovies = useCallback(async () => {
    setIsLoading(true);
    setSearchError(null);
    setIsSearchMode(false);

    const results = await getRandomMovies(12);

    if (results.length > 0) {
      setDisplayMovies(mapResultsToMovies(results));
    } else {
      setSearchError("Failed to load movies. Please try refreshing the page.");
      setDisplayMovies([]);
    }

    setIsLoading(false);
  }, []);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setSearchError(null);
    setIsSearchMode(true);

    const results = await searchMovies(query);

    if (results.length > 0) {
      const seenIds = new Set<string>();
      const uniqueResults = results.filter((result) => {
        if (seenIds.has(result.imdbID)) {
          return false;
        }
        if (result.Type !== "movie" && result.Type !== "series") {
          return false;
        }
        seenIds.add(result.imdbID);
        return true;
      });

      setDisplayMovies(mapResultsToMovies(uniqueResults));
    } else {
      setSearchError("No movies found. Please try a different search.");
      setDisplayMovies([]);
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-black">
      <header className="safe-top sticky top-0 z-40 border-b border-white/5 bg-black/85 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-col items-center">
            <h1 className="mb-4 text-2xl font-light tracking-tight text-white sm:mb-2 sm:text-3xl">
              Movies
            </h1>
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
            {isSearchMode && (
              <button
                type="button"
                onClick={loadRandomMovies}
                className="mt-3 min-h-10 px-3 text-xs font-light text-white/50 transition-colors hover:text-white/80 active:text-white"
              >
                Clear search
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-12">
        {searchError && (
          <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {searchError}
          </div>
        )}
        {isLoading && (
          <div className="flex justify-center py-16 sm:py-20">
            <div className="h-1 w-32 animate-pulse rounded-full bg-white/10" />
          </div>
        )}
        {displayMovies.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {displayMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
        {displayMovies.length === 0 && !isLoading && !searchError && (
          <div className="flex justify-center py-16 sm:py-20">
            <p className="text-sm text-white/40">No results found</p>
          </div>
        )}
      </main>
    </div>
  );
}
