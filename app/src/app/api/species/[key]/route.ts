import { NextRequest, NextResponse } from "next/server";

interface GBIFMedia {
  type?: string;
  identifier?: string;
}

interface GBIFOccurrence {
  media?: GBIFMedia[];
}

// Fetch species details from GBIF API
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const speciesKey = parseInt(key, 10);

  if (isNaN(speciesKey)) {
    return NextResponse.json({ error: "Invalid species key" }, { status: 400 });
  }

  try {
    // Fetch species info, vernacular names, and an occurrence with image in parallel
    // Use iNaturalist dataset (50c9509d-22c7-4a22-a47d-8c48425ef4a7) for reliable image URLs
    const [speciesResponse, vernacularResponse, imageResponse] = await Promise.all([
      fetch(`https://api.gbif.org/v1/species/${speciesKey}`),
      fetch(`https://api.gbif.org/v1/species/${speciesKey}/vernacularNames?limit=50`),
      fetch(`https://api.gbif.org/v1/occurrence/search?taxonKey=${speciesKey}&mediaType=StillImage&datasetKey=50c9509d-22c7-4a22-a47d-8c48425ef4a7&limit=1`),
    ]);

    if (!speciesResponse.ok) {
      return NextResponse.json(
        { error: "Species not found in GBIF" },
        { status: 404 }
      );
    }

    const gbifData = await speciesResponse.json();

    // Extract English vernacular name (prefer English over other languages)
    let vernacularName: string | undefined;
    if (vernacularResponse.ok) {
      const vernacularData = await vernacularResponse.json();
      if (vernacularData.results && vernacularData.results.length > 0) {
        // Prefer English names
        const englishName = vernacularData.results.find(
          (v: { language?: string; vernacularName: string }) => v.language === "eng"
        );
        vernacularName = englishName?.vernacularName;
      }
    }
    // Fall back to GBIF's default vernacular name if no English name found
    if (!vernacularName) {
      vernacularName = gbifData.vernacularName;
    }

    // Extract image URL from occurrence search
    let imageUrl: string | undefined;

    if (imageResponse.ok) {
      const imageData = await imageResponse.json();
      if (imageData.results && imageData.results.length > 0) {
        const occurrence: GBIFOccurrence = imageData.results[0];
        if (occurrence.media && occurrence.media.length > 0) {
          const stillImage = occurrence.media.find(
            (m: GBIFMedia) => m.type === "StillImage" && m.identifier
          );
          if (stillImage) {
            imageUrl = stillImage.identifier;
          }
        }
      }
    }

    return NextResponse.json({
      key: gbifData.key,
      scientificName: gbifData.scientificName,
      canonicalName: gbifData.canonicalName,
      vernacularName,
      kingdom: gbifData.kingdom,
      phylum: gbifData.phylum,
      class: gbifData.class,
      order: gbifData.order,
      family: gbifData.family,
      genus: gbifData.genus,
      species: gbifData.species,
      taxonomicStatus: gbifData.taxonomicStatus,
      gbifUrl: `https://www.gbif.org/species/${speciesKey}`,
      imageUrl,
    });
  } catch (error) {
    console.error("Error fetching from GBIF:", error);
    return NextResponse.json(
      { error: "Failed to fetch species data" },
      { status: 500 }
    );
  }
}
