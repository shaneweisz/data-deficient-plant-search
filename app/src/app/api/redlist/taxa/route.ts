import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { TAXA, CATEGORY_COLORS, TaxonConfig } from "@/config/taxa";

interface SpeciesRecord {
  sis_taxon_id: number;
  category: string;
  assessment_date?: string;
}

interface PrecomputedData {
  species: SpeciesRecord[];
  metadata: {
    totalSpecies: number;
    fetchedAt: string;
    byCategory: Record<string, number>;
  };
}

interface TaxonSummary {
  id: string;
  name: string;
  color: string;
  estimatedDescribed: number;
  estimatedSource: string;
  estimatedSourceUrl?: string;
  available: boolean;
  totalAssessed: number;
  percentAssessed: number;
  byCategory: {
    code: string;
    count: number;
    color: string;
  }[];
  outdated: number;
  percentOutdated: number;
  lastUpdated: string | null;
}

// In-memory cache for summary data
let cachedSummary: TaxonSummary[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function loadSingleDataFile(dataFile: string): PrecomputedData | null {
  const dataPath = path.join(process.cwd(), "data", dataFile);

  try {
    if (!fs.existsSync(dataPath)) {
      return null;
    }
    const content = fs.readFileSync(dataPath, "utf-8");
    return JSON.parse(content) as PrecomputedData;
  } catch {
    return null;
  }
}

function loadTaxonData(taxon: TaxonConfig): PrecomputedData | null {
  // If taxon has multiple data files (combined taxa like Fishes, Invertebrates)
  if (taxon.dataFiles && taxon.dataFiles.length > 0) {
    const allData: PrecomputedData[] = [];

    for (const dataFile of taxon.dataFiles) {
      const data = loadSingleDataFile(dataFile);
      if (data) {
        allData.push(data);
      }
    }

    if (allData.length === 0) {
      return null;
    }

    // Merge all data files
    const mergedSpecies = allData.flatMap(d => d.species);
    const mergedByCategory: Record<string, number> = {};

    for (const data of allData) {
      for (const [cat, count] of Object.entries(data.metadata.byCategory)) {
        mergedByCategory[cat] = (mergedByCategory[cat] || 0) + count;
      }
    }

    // Use the most recent fetchedAt
    const latestFetchedAt = allData
      .map(d => d.metadata.fetchedAt)
      .sort()
      .pop() || allData[0].metadata.fetchedAt;

    return {
      species: mergedSpecies,
      metadata: {
        totalSpecies: mergedSpecies.length,
        fetchedAt: latestFetchedAt,
        byCategory: mergedByCategory,
      },
    };
  }

  // Single data file
  return loadSingleDataFile(taxon.dataFile);
}

function buildSummary(): TaxonSummary[] {
  return TAXA.map((taxon) => {
    const data = loadTaxonData(taxon);

    if (!data) {
      return {
        id: taxon.id,
        name: taxon.name,
        color: taxon.color,
        estimatedDescribed: taxon.estimatedDescribed,
        estimatedSource: taxon.estimatedSource,
        estimatedSourceUrl: taxon.estimatedSourceUrl,
        available: false,
        totalAssessed: 0,
        percentAssessed: 0,
        byCategory: [],
        outdated: 0,
        percentOutdated: 0,
        lastUpdated: null,
      };
    }

    const byCategory = ["EX", "EW", "CR", "EN", "VU", "NT", "LC", "DD"].map((code) => ({
      code,
      count: data.metadata.byCategory[code] || 0,
      color: CATEGORY_COLORS[code],
    }));

    // Calculate outdated assessments (>10 years old based on assessment_date)
    const currentYear = new Date().getFullYear();
    const outdated = data.species.filter((s) => {
      if (!s.assessment_date) return false;
      const assessmentYear = new Date(s.assessment_date).getFullYear();
      return currentYear - assessmentYear > 10;
    }).length;

    const percentAssessed =
      taxon.estimatedDescribed > 0
        ? (data.metadata.totalSpecies / taxon.estimatedDescribed) * 100
        : 0;

    const percentOutdated =
      data.metadata.totalSpecies > 0
        ? (outdated / data.metadata.totalSpecies) * 100
        : 0;

    return {
      id: taxon.id,
      name: taxon.name,
      color: taxon.color,
      estimatedDescribed: taxon.estimatedDescribed,
      estimatedSource: taxon.estimatedSource,
      estimatedSourceUrl: taxon.estimatedSourceUrl,
      available: true,
      totalAssessed: data.metadata.totalSpecies,
      percentAssessed: Math.round(percentAssessed * 10) / 10,
      byCategory,
      outdated,
      percentOutdated: Math.round(percentOutdated * 10) / 10,
      lastUpdated: data.metadata.fetchedAt,
    };
  });
}

export async function GET() {
  // Check cache
  if (cachedSummary && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ taxa: cachedSummary, cached: true });
  }

  // Build fresh summary
  cachedSummary = buildSummary();
  cacheTime = Date.now();

  return NextResponse.json({ taxa: cachedSummary, cached: false });
}
