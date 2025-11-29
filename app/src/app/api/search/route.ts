import { NextRequest, NextResponse } from "next/server";

interface GBIFSpeciesResult {
  key: number;
  scientificName: string;
  canonicalName: string;
  vernacularName?: string;
  kingdom: string;
  family: string;
  genus: string;
  rank: string;
  numOccurrences?: number;
}

interface GBIFMedia {
  type?: string;
  identifier?: string;
}

interface GBIFOccurrence {
  media?: GBIFMedia[];
}

// Search for plant species in GBIF
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Search GBIF species API for plants (kingdom key 6 = Plantae)
    const searchResponse = await fetch(
      `https://api.gbif.org/v1/species/search?q=${encodeURIComponent(query)}&rank=SPECIES&highertaxonKey=6&limit=10`
    );

    if (!searchResponse.ok) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }

    const searchData = await searchResponse.json();
    const species: GBIFSpeciesResult[] = searchData.results || [];

    // Fetch images and vernacular names for each species in parallel
    const enrichedResults = await Promise.all(
      species.map(async (s) => {
        const [vernacularResponse, imageResponse, occurrenceCountResponse] = await Promise.all([
          fetch(`https://api.gbif.org/v1/species/${s.key}/vernacularNames?limit=50`),
          fetch(`https://api.gbif.org/v1/occurrence/search?taxonKey=${s.key}&mediaType=StillImage&datasetKey=50c9509d-22c7-4a22-a47d-8c48425ef4a7&limit=1`),
          fetch(`https://api.gbif.org/v1/occurrence/count?taxonKey=${s.key}`),
        ]);

        let vernacularName: string | undefined;
        if (vernacularResponse.ok) {
          const vernacularData = await vernacularResponse.json();
          if (vernacularData.results?.length > 0) {
            // Prefer English names
            const englishName = vernacularData.results.find(
              (v: { language?: string; vernacularName: string }) => v.language === "eng"
            );
            vernacularName = englishName?.vernacularName || s.vernacularName;
          }
        }
        if (!vernacularName) {
          vernacularName = s.vernacularName;
        }

        let imageUrl: string | undefined;
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          if (imageData.results?.length > 0) {
            const occurrence: GBIFOccurrence = imageData.results[0];
            const stillImage = occurrence.media?.find(
              (m: GBIFMedia) => m.type === "StillImage" && m.identifier
            );
            if (stillImage) {
              imageUrl = stillImage.identifier;
            }
          }
        }

        let occurrenceCount: number | undefined;
        if (occurrenceCountResponse.ok) {
          const countText = await occurrenceCountResponse.text();
          occurrenceCount = parseInt(countText, 10);
        }

        return {
          key: s.key,
          scientificName: s.scientificName,
          canonicalName: s.canonicalName,
          vernacularName,
          kingdom: s.kingdom,
          family: s.family,
          genus: s.genus,
          gbifUrl: `https://www.gbif.org/species/${s.key}`,
          imageUrl,
          occurrenceCount,
        };
      })
    );

    return NextResponse.json({ results: enrichedResults });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
