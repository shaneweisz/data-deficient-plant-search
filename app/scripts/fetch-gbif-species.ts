/**
 * Pre-compute script to fetch GBIF species occurrence counts for any taxon
 * and save to a CSV file for fast serving.
 *
 * This uses the GBIF occurrence facet API to get species keys and their counts.
 * The facet API has a limit, so we fetch in chunks using occurrence count ranges.
 *
 * Usage:
 *   npx tsx scripts/fetch-gbif-species.ts <taxon>
 *
 * Taxa (from src/config/taxa.ts):
 *   plantae, fungi, mammalia, aves, reptilia, amphibia, actinopterygii,
 *   chondrichthyes, insecta, arachnida, malacostraca, gastropoda,
 *   bivalvia, anthozoa
 *
 * Examples:
 *   npx tsx scripts/fetch-gbif-species.ts mammalia
 *   npx tsx scripts/fetch-gbif-species.ts aves
 */

import * as fs from "fs";
import * as path from "path";

// Taxa configuration (inline to avoid import issues with tsx)
interface TaxonConfig {
  id: string;
  name: string;
  gbifDataFile: string;
  gbifKingdomKey: number;
  gbifClassKey?: number;
  gbifClassKeys?: number[]; // Multiple class keys (e.g., reptiles split into Squamata, Crocodylia, Testudines)
  gbifOrderKeys?: number[]; // Multiple order keys (e.g., fish have no class in GBIF)
}

const FISH_ORDER_KEYS = [389,391,427,428,446,494,495,496,497,498,499,537,538,547,548,549,550,587,588,589,590,696,708,742,752,753,772,773,774,781,836,848,857,860,861,888,889,890,898,929,975,976,1067,1153,1313];

const TAXA_CONFIG: Record<string, TaxonConfig> = {
  plantae: { id: "plantae", name: "Plants", gbifDataFile: "gbif-plantae.csv", gbifKingdomKey: 6 },
  fungi: { id: "fungi", name: "Fungi", gbifDataFile: "gbif-fungi.csv", gbifKingdomKey: 5 },
  mammalia: { id: "mammalia", name: "Mammals", gbifDataFile: "gbif-mammalia.csv", gbifKingdomKey: 1, gbifClassKey: 359 },
  aves: { id: "aves", name: "Birds", gbifDataFile: "gbif-aves.csv", gbifKingdomKey: 1, gbifClassKey: 212 },
  reptilia: { id: "reptilia", name: "Reptiles", gbifDataFile: "gbif-reptilia.csv", gbifKingdomKey: 1, gbifClassKeys: [11592253, 11493978, 11418114] },
  amphibia: { id: "amphibia", name: "Amphibians", gbifDataFile: "gbif-amphibia.csv", gbifKingdomKey: 1, gbifClassKey: 131 },
  actinopterygii: { id: "actinopterygii", name: "Ray-finned Fishes", gbifDataFile: "gbif-actinopterygii.csv", gbifKingdomKey: 1, gbifOrderKeys: FISH_ORDER_KEYS },
  insecta: { id: "insecta", name: "Insects", gbifDataFile: "gbif-insecta.csv", gbifKingdomKey: 1, gbifClassKey: 216 },
};

const FACET_LIMIT = 100000; // Max facet results per request
const REQUEST_DELAY = 500; // ms between requests

interface SpeciesCount {
  speciesKey: number;
  count: number;
}

interface FacetResponse {
  count: number;
  facets: Array<{
    field: string;
    counts: Array<{
      name: string;
      count: number;
    }>;
  }>;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGbifUrl(taxon: TaxonConfig, minCount?: number, maxCount?: number): string {
  const params = new URLSearchParams({
    hasCoordinate: "true",
    hasGeospatialIssue: "false",
    facet: "speciesKey",
    facetLimit: FACET_LIMIT.toString(),
    limit: "0",
  });

  // Add taxonomy filter
  if (taxon.gbifClassKey) {
    params.set("classKey", taxon.gbifClassKey.toString());
  } else {
    params.set("kingdomKey", taxon.gbifKingdomKey.toString());
  }

  // Add occurrence count range if specified
  if (minCount !== undefined || maxCount !== undefined) {
    // GBIF doesn't directly support filtering facets by count
    // We'll need to use a different approach - download facets and filter locally
  }

  return `https://api.gbif.org/v1/occurrence/search?${params}`;
}

async function fetchSpeciesCounts(taxon: TaxonConfig): Promise<SpeciesCount[]> {
  const url = buildGbifUrl(taxon);
  console.log(`Fetching from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GBIF API error: ${response.statusText}`);
  }

  const data: FacetResponse = await response.json();
  const speciesFacet = data.facets.find((f) => f.field === "SPECIES_KEY");

  if (!speciesFacet) {
    return [];
  }

  const results: SpeciesCount[] = speciesFacet.counts.map((c) => ({
    speciesKey: parseInt(c.name, 10),
    count: c.count,
  }));

  // Sort by count descending
  results.sort((a, b) => b.count - a.count);

  return results;
}

function deduplicateAndSort(allResults: SpeciesCount[]): SpeciesCount[] {
  const seen = new Map<number, SpeciesCount>();
  for (const r of allResults) {
    if (!seen.has(r.speciesKey) || seen.get(r.speciesKey)!.count < r.count) {
      seen.set(r.speciesKey, r);
    }
  }
  const deduped = Array.from(seen.values());
  deduped.sort((a, b) => b.count - a.count);
  return deduped;
}

async function fetchForTaxonKey(keyType: "classKey" | "orderKey", keyValue: number, label: string): Promise<SpeciesCount[]> {
  const allResults: SpeciesCount[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
      facet: "speciesKey",
      facetLimit: FACET_LIMIT.toString(),
      facetOffset: offset.toString(),
      limit: "0",
      [keyType]: keyValue.toString(),
    });

    const url = `https://api.gbif.org/v1/occurrence/search?${params}`;
    console.log(`Fetching ${label} offset ${offset}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GBIF API error: ${response.statusText}`);
    }

    const data: FacetResponse = await response.json();
    const speciesFacet = data.facets.find((f) => f.field === "SPECIES_KEY");

    if (!speciesFacet || speciesFacet.counts.length === 0) {
      hasMore = false;
      break;
    }

    const results = speciesFacet.counts.map((c) => ({
      speciesKey: parseInt(c.name, 10),
      count: c.count,
    }));

    allResults.push(...results);
    console.log(`  -> Got ${results.length} species (total: ${allResults.length})`);

    if (results.length < FACET_LIMIT) {
      hasMore = false;
    } else {
      offset += FACET_LIMIT;
      await delay(REQUEST_DELAY);
    }
  }

  return allResults;
}

async function fetchForClassKey(classKey: number, label: string): Promise<SpeciesCount[]> {
  const allResults: SpeciesCount[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
      facet: "speciesKey",
      facetLimit: FACET_LIMIT.toString(),
      facetOffset: offset.toString(),
      limit: "0",
      classKey: classKey.toString(),
    });

    const url = `https://api.gbif.org/v1/occurrence/search?${params}`;
    console.log(`Fetching ${label} offset ${offset}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GBIF API error: ${response.statusText}`);
    }

    const data: FacetResponse = await response.json();
    const speciesFacet = data.facets.find((f) => f.field === "SPECIES_KEY");

    if (!speciesFacet || speciesFacet.counts.length === 0) {
      hasMore = false;
      break;
    }

    const results = speciesFacet.counts.map((c) => ({
      speciesKey: parseInt(c.name, 10),
      count: c.count,
    }));

    allResults.push(...results);
    console.log(`  -> Got ${results.length} species (total: ${allResults.length})`);

    if (results.length < FACET_LIMIT) {
      hasMore = false;
    } else {
      offset += FACET_LIMIT;
      await delay(REQUEST_DELAY);
    }
  }

  return allResults;
}

async function fetchAllSpeciesCounts(taxon: TaxonConfig): Promise<SpeciesCount[]> {
  // Handle multiple class keys (e.g., reptiles split into Squamata, Crocodylia, Testudines)
  if (taxon.gbifClassKeys && taxon.gbifClassKeys.length > 0) {
    const allResults: SpeciesCount[] = [];
    for (const classKey of taxon.gbifClassKeys) {
      console.log(`\nFetching classKey ${classKey}...`);
      const results = await fetchForTaxonKey("classKey", classKey, `class ${classKey}`);
      allResults.push(...results);
      await delay(REQUEST_DELAY);
    }
    return deduplicateAndSort(allResults);
  }

  // Handle multiple order keys (e.g., fish have no class in GBIF)
  if (taxon.gbifOrderKeys && taxon.gbifOrderKeys.length > 0) {
    const allResults: SpeciesCount[] = [];
    let orderIndex = 0;
    for (const orderKey of taxon.gbifOrderKeys) {
      orderIndex++;
      console.log(`\nFetching orderKey ${orderKey} (${orderIndex}/${taxon.gbifOrderKeys.length})...`);
      const results = await fetchForTaxonKey("orderKey", orderKey, `order ${orderKey}`);
      allResults.push(...results);
      await delay(REQUEST_DELAY);
    }
    return deduplicateAndSort(allResults);
  }

  // Single class key or kingdom key
  const allResults: SpeciesCount[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
      facet: "speciesKey",
      facetLimit: FACET_LIMIT.toString(),
      facetOffset: offset.toString(),
      limit: "0",
    });

    if (taxon.gbifClassKey) {
      params.set("classKey", taxon.gbifClassKey.toString());
    } else {
      params.set("kingdomKey", taxon.gbifKingdomKey.toString());
    }

    const url = `https://api.gbif.org/v1/occurrence/search?${params}`;
    console.log(`Fetching offset ${offset}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`GBIF API error: ${response.statusText}`);
    }

    const data: FacetResponse = await response.json();
    const speciesFacet = data.facets.find((f) => f.field === "SPECIES_KEY");

    if (!speciesFacet || speciesFacet.counts.length === 0) {
      hasMore = false;
      break;
    }

    const results = speciesFacet.counts.map((c) => ({
      speciesKey: parseInt(c.name, 10),
      count: c.count,
    }));

    allResults.push(...results);
    console.log(`  -> Got ${results.length} species (total: ${allResults.length})`);

    if (results.length < FACET_LIMIT) {
      hasMore = false;
    } else {
      offset += FACET_LIMIT;
      await delay(REQUEST_DELAY);
    }
  }

  allResults.sort((a, b) => b.count - a.count);
  return allResults;
}

function saveToCsv(results: SpeciesCount[], outputFile: string): void {
  const header = "species_key,occurrence_count";
  const rows = results.map((r) => `${r.speciesKey},${r.count}`);
  const content = [header, ...rows].join("\n");
  fs.writeFileSync(outputFile, content);
}

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const taxonId = args[0]?.toLowerCase();

  // Validate taxon
  if (!taxonId) {
    console.error("Usage: npx tsx scripts/fetch-gbif-species.ts <taxon>");
    console.error("\nAvailable taxa:");
    Object.entries(TAXA_CONFIG).forEach(([id, config]) => {
      console.error(`  ${id.padEnd(18)} - ${config.name}`);
    });
    process.exit(1);
  }

  const taxonConfig = TAXA_CONFIG[taxonId];
  if (!taxonConfig) {
    console.error(`Unknown taxon: ${taxonId}`);
    console.error("\nAvailable taxa:");
    Object.keys(TAXA_CONFIG).forEach((id) => console.error(`  ${id}`));
    process.exit(1);
  }

  const OUTPUT_FILE = path.join(process.cwd(), "public", taxonConfig.gbifDataFile);

  console.log(`GBIF Species Count Fetcher - ${taxonConfig.name}`);
  console.log("=".repeat(50));
  console.log(`Taxon: ${taxonConfig.name} (${taxonId})`);
  console.log(`Kingdom Key: ${taxonConfig.gbifKingdomKey}`);
  if (taxonConfig.gbifClassKey) {
    console.log(`Class Key: ${taxonConfig.gbifClassKey}`);
  }
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log("");

  try {
    console.log("Fetching species occurrence counts from GBIF...");
    const results = await fetchAllSpeciesCounts(taxonConfig);

    console.log(`\nTotal species found: ${results.length}`);

    if (results.length > 0) {
      console.log(`Top 5 by occurrence count:`);
      results.slice(0, 5).forEach((r, i) => {
        console.log(`  ${i + 1}. Species ${r.speciesKey}: ${r.count.toLocaleString()} occurrences`);
      });

      const totalOccurrences = results.reduce((sum, r) => sum + r.count, 0);
      console.log(`\nTotal occurrences: ${totalOccurrences.toLocaleString()}`);
    }

    console.log(`\nSaving to ${OUTPUT_FILE}...`);
    saveToCsv(results, OUTPUT_FILE);

    const stats = fs.statSync(OUTPUT_FILE);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Done! File size: ${sizeMB} MB`);

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
