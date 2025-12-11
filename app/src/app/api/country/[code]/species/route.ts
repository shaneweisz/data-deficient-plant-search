import { NextRequest, NextResponse } from "next/server";
import { getTaxonConfig } from "@/config/taxa";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const countryCode = code.toUpperCase();

  const searchParams = request.nextUrl.searchParams;
  const taxonId = searchParams.get("taxon") || "plantae";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const minCount = parseInt(searchParams.get("minCount") || "0");
  const maxCount = parseInt(searchParams.get("maxCount") || "999999999");
  const sort = searchParams.get("sort") || "desc";

  const taxon = getTaxonConfig(taxonId);

  try {
    // Use GBIF occurrence search with facets to get species counts for the country
    const gbifParams = new URLSearchParams({
      country: countryCode,
      facet: "speciesKey",
      facetLimit: "100000",
      limit: "0", // We only want facets, not actual occurrences
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
    });

    // Add taxon filter - use classKey(s) if available, otherwise kingdomKey
    if (taxon.gbifClassKey) {
      gbifParams.set("classKey", taxon.gbifClassKey.toString());
    } else if (taxon.gbifClassKeys && taxon.gbifClassKeys.length > 0) {
      // Multiple class keys - add each as a separate param
      taxon.gbifClassKeys.forEach(key => {
        gbifParams.append("classKey", key.toString());
      });
    } else if (taxon.gbifOrderKeys && taxon.gbifOrderKeys.length > 0) {
      // Multiple order keys (e.g., fishes)
      taxon.gbifOrderKeys.forEach(key => {
        gbifParams.append("orderKey", key.toString());
      });
    } else if (taxon.gbifKingdomKey) {
      gbifParams.set("kingdomKey", taxon.gbifKingdomKey.toString());
    }

    const response = await fetch(
      `https://api.gbif.org/v1/occurrence/search?${gbifParams}`
    );

    if (!response.ok) {
      throw new Error(`GBIF API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract species facets
    const speciesFacets = data.facets?.find(
      (f: { field: string }) => f.field === "SPECIES_KEY"
    );

    if (!speciesFacets?.counts) {
      return NextResponse.json({
        data: [],
        pagination: { page: 1, limit, total: 0, totalPages: 0 },
        stats: {
          total: 0,
          filtered: 0,
          totalOccurrences: 0,
          median: 0,
          distribution: { eq1: 0, gt1_lte10: 0, gt10_lte100: 0, gt100_lte1000: 0, gt1000_lte10000: 0, gt10000: 0 },
        },
        country: countryCode,
      });
    }

    // Convert facets to species records with counts
    const allSpecies: { speciesKey: number; count: number }[] = speciesFacets.counts.map(
      (facet: { name: string; count: number }) => ({
        speciesKey: parseInt(facet.name),
        count: facet.count,
      })
    );

    // Calculate stats from all species
    const totalOccurrences = allSpecies.reduce((sum, s) => sum + s.count, 0);
    const counts = allSpecies.map(s => s.count).sort((a, b) => a - b);
    const median = counts.length > 0 ? counts[Math.floor(counts.length / 2)] : 0;

    const distribution = {
      // Histogram buckets (non-cumulative)
      eq1: allSpecies.filter(s => s.count === 1).length,
      gt1_lte10: allSpecies.filter(s => s.count > 1 && s.count <= 10).length,
      gt10_lte100: allSpecies.filter(s => s.count > 10 && s.count <= 100).length,
      gt100_lte1000: allSpecies.filter(s => s.count > 100 && s.count <= 1000).length,
      gt1000_lte10000: allSpecies.filter(s => s.count > 1000 && s.count <= 10000).length,
      gt10000: allSpecies.filter(s => s.count > 10000).length,
    };

    // Filter by count range
    let filteredSpecies = allSpecies.filter(
      s => s.count >= minCount && s.count <= maxCount
    );

    // Sort
    if (sort === "asc") {
      filteredSpecies.sort((a, b) => a.count - b.count);
    } else {
      filteredSpecies.sort((a, b) => b.count - a.count);
    }

    // Paginate
    const total = filteredSpecies.length;
    const totalPages = Math.ceil(total / limit);
    const startIdx = (page - 1) * limit;
    const pageSpecies = filteredSpecies.slice(startIdx, startIdx + limit);

    // Fetch species names for the page
    const speciesWithNames = await Promise.all(
      pageSpecies.map(async (sp) => {
        try {
          const speciesResponse = await fetch(
            `https://api.gbif.org/v1/species/${sp.speciesKey}`
          );
          const speciesData = await speciesResponse.json();
          return {
            species_key: sp.speciesKey,
            occurrence_count: sp.count,
            canonicalName: speciesData.canonicalName || speciesData.scientificName,
            vernacularName: speciesData.vernacularName,
          };
        } catch {
          return {
            species_key: sp.speciesKey,
            occurrence_count: sp.count,
            canonicalName: `Species ${sp.speciesKey}`,
          };
        }
      })
    );

    return NextResponse.json({
      data: speciesWithNames,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats: {
        total: allSpecies.length,
        filtered: total,
        totalOccurrences,
        median,
        distribution,
      },
      country: countryCode,
    });
  } catch (error) {
    console.error("Error fetching country species:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
