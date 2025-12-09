import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { TAXA, TaxonConfig } from "@/config/taxa";

interface TaxonSummary {
  id: string;
  name: string;
  color: string;
  estimatedDescribed: number;
  estimatedSource: string;
  gbifSpeciesCount: number;
  gbifTotalOccurrences: number;
  gbifMedian: number;
  gbifDataAvailable: boolean;
  distribution?: {
    lte1: number;
    lte10: number;
    lte100: number;
    lte1000: number;
    lte10000: number;
  };
}

interface SpeciesRecord {
  species_key: number;
  occurrence_count: number;
}

async function loadTaxonData(taxon: TaxonConfig): Promise<SpeciesRecord[]> {
  const filePath = path.join(process.cwd(), "public", taxon.gbifDataFile);

  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const lines = fileContent.trim().split("\n");

    return lines.slice(1).map((line) => {
      const [species_key, occurrence_count] = line.split(",");
      return {
        species_key: parseInt(species_key, 10),
        occurrence_count: parseInt(occurrence_count, 10),
      };
    });
  } catch {
    return [];
  }
}

function computeStats(data: SpeciesRecord[]) {
  if (data.length === 0) {
    return {
      speciesCount: 0,
      totalOccurrences: 0,
      median: 0,
      distribution: { lte1: 0, lte10: 0, lte100: 0, lte1000: 0, lte10000: 0 },
    };
  }

  const sorted = [...data].sort((a, b) => a.occurrence_count - b.occurrence_count);
  const totalOccurrences = data.reduce((sum, d) => sum + d.occurrence_count, 0);
  const median = sorted[Math.floor(sorted.length / 2)]?.occurrence_count || 0;

  return {
    speciesCount: data.length,
    totalOccurrences,
    median,
    distribution: {
      lte1: data.filter((d) => d.occurrence_count <= 1).length,
      lte10: data.filter((d) => d.occurrence_count <= 10).length,
      lte100: data.filter((d) => d.occurrence_count <= 100).length,
      lte1000: data.filter((d) => d.occurrence_count <= 1000).length,
      lte10000: data.filter((d) => d.occurrence_count <= 10000).length,
    },
  };
}

export async function GET() {
  const summaries: TaxonSummary[] = await Promise.all(
    TAXA.map(async (taxon) => {
      const data = await loadTaxonData(taxon);
      const stats = computeStats(data);

      return {
        id: taxon.id,
        name: taxon.name,
        color: taxon.color,
        estimatedDescribed: taxon.estimatedDescribed,
        estimatedSource: taxon.estimatedSource,
        gbifSpeciesCount: stats.speciesCount,
        gbifTotalOccurrences: stats.totalOccurrences,
        gbifMedian: stats.median,
        gbifDataAvailable: data.length > 0,
        distribution: stats.distribution,
      };
    })
  );

  // Sort by species count descending, with available data first
  summaries.sort((a, b) => {
    if (a.gbifDataAvailable !== b.gbifDataAvailable) {
      return a.gbifDataAvailable ? -1 : 1;
    }
    return b.gbifSpeciesCount - a.gbifSpeciesCount;
  });

  return NextResponse.json({
    taxa: summaries,
    totalTaxa: summaries.length,
    availableTaxa: summaries.filter((t) => t.gbifDataAvailable).length,
  });
}
