interface OmdbSearchResult {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
}

interface OmdbTitleResponse {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
  Response: string;
  Error?: string;
}

interface OmdbEpisodeResponse {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
  Season?: string;
  Episode?: string;
  seriesID?: string;
  Response: string;
  Error?: string;
}

interface OmdbSeriesResponse {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
  totalSeasons?: string;
  Response: string;
  Error?: string;
}

interface OmdbSearchResponse {
  Search?: OmdbSearchResult[];
  totalResults?: string;
  Response: string;
  Error?: string;
}

async function searchByTitle(query: string): Promise<OmdbSearchResult | null> {
  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const response = await fetch(
      `https://www.omdbapi.com/?apikey=8b7e37e7&t=${encodedQuery}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data: OmdbTitleResponse = await response.json();
    
    if (data.Response === "False" || data.Error) {
      return null;
    }
    
    if (data.Type !== "movie" && data.Type !== "series") {
      return null;
    }
    
    return {
      Title: data.Title,
      Year: data.Year,
      imdbID: data.imdbID,
      Type: data.Type,
      Poster: data.Poster,
    };
  } catch (error) {
    return null;
  }
}

export async function searchMovies(query: string): Promise<OmdbSearchResult[]> {
  try {
    if (!query || query.trim().length < 1) {
      return [];
    }
    
    const trimmedQuery = query.trim();
    const encodedQuery = encodeURIComponent(trimmedQuery);
    
    const searchResponse = await fetch(
      `https://www.omdbapi.com/?apikey=8b7e37e7&s=${encodedQuery}`
    );
    
    if (!searchResponse.ok) {
      if (trimmedQuery.length <= 3) {
        const exactResult = await searchByTitle(trimmedQuery);
        return exactResult ? [exactResult] : [];
      }
      return [];
    }
    
    const data: OmdbSearchResponse = await searchResponse.json();
    
    if (data.Response === "False") {
      if (trimmedQuery.length <= 3) {
        const exactResult = await searchByTitle(trimmedQuery);
        return exactResult ? [exactResult] : [];
      }
      return [];
    }
    
    if (!data.Search || data.Search.length === 0) {
      if (trimmedQuery.length <= 3) {
        const exactResult = await searchByTitle(trimmedQuery);
        return exactResult ? [exactResult] : [];
      }
      return [];
    }
    
    const results = data.Search.filter((result) => result.Type === "movie" || result.Type === "series");
    
    if (results.length === 0 && trimmedQuery.length <= 3) {
      const exactResult = await searchByTitle(trimmedQuery);
      return exactResult ? [exactResult] : [];
    }
    
    return results;
  } catch (error) {
    console.error("OMDB API error:", error);
    return [];
  }
}

const popularSearchTerms = [
  "family", "animation", "comedy", "musical", "adventure", 
  "fantasy", "superhero", "disney", "pixar", "kids", 
  "children", "cartoon", "comedy family"
];

export async function getSeriesByImdbID(imdbID: string): Promise<OmdbSeriesResponse | null> {
  try {
    const response = await fetch(
      `https://www.omdbapi.com/?apikey=8b7e37e7&i=${imdbID}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data: OmdbSeriesResponse = await response.json();
    
    if (data.Response === "False" || data.Error || data.Type !== "series") {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error("OMDB Series API error:", error);
    return null;
  }
}

export async function searchEpisode(
  seriesTitleOrID: string,
  season: number,
  episode: number
): Promise<{ episode: OmdbSearchResult; seriesImdbID: string; seasonNum: number; episodeNum: number } | null> {
  try {
    const encodedTitle = encodeURIComponent(seriesTitleOrID.trim());
    
    let seriesImdbID: string | null = null;
    
    if (seriesTitleOrID.startsWith("tt")) {
      seriesImdbID = seriesTitleOrID;
    } else {
      const seriesResponse = await fetch(
        `https://www.omdbapi.com/?apikey=8b7e37e7&t=${encodedTitle}&type=series`
      );
      
      if (seriesResponse.ok) {
        const seriesData: OmdbSeriesResponse = await seriesResponse.json();
        if (seriesData.Response === "True" && seriesData.imdbID) {
          seriesImdbID = seriesData.imdbID;
        }
      }
    }
    
    if (!seriesImdbID) {
      return null;
    }
    
    const episodeResponse = await fetch(
      `https://www.omdbapi.com/?apikey=8b7e37e7&i=${seriesImdbID}&Season=${season}&Episode=${episode}`
    );
    
    if (!episodeResponse.ok) {
      return null;
    }
    
    const episodeData: OmdbEpisodeResponse = await episodeResponse.json();
    
    if (episodeData.Response === "False" || episodeData.Error) {
      return null;
    }
    
    return {
      episode: {
        Title: episodeData.Title,
        Year: episodeData.Year,
        imdbID: episodeData.imdbID,
        Type: "episode",
        Poster: episodeData.Poster,
      },
      seriesImdbID: seriesImdbID,
      seasonNum: season,
      episodeNum: episode,
    };
  } catch (error) {
    console.error("OMDB Episode API error:", error);
    return null;
  }
}

export async function getRandomMovies(count: number = 12): Promise<OmdbSearchResult[]> {
  try {
    const randomTerms = popularSearchTerms
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    
    const allResults: OmdbSearchResult[] = [];
    
    for (const term of randomTerms) {
      const results = await searchMovies(term);
      allResults.push(...results);
    }
    
    const seenIds = new Set<string>();
    const uniqueResults = allResults.filter((result) => {
      if (seenIds.has(result.imdbID)) {
        return false;
      }
      if (result.Type !== "movie" && result.Type !== "series") {
        return false;
      }
      seenIds.add(result.imdbID);
      return true;
    });
    
    const shuffled = uniqueResults.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (error) {
    console.error("Error fetching random movies:", error);
    return [];
  }
}

