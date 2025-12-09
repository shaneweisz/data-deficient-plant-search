"use client";

import { useState, useEffect } from "react";

interface TaxonSummary {
  id: string;
  name: string;
  color: string;
  estimatedDescribed: number;
  estimatedSource: string;
  estimatedSourceUrl?: string;
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

interface Props {
  onSelectTaxon: (taxonId: string) => void;
  selectedTaxon: string | null;
}

const formatNumber = (num: number) => num.toLocaleString();

export default function GBIFTaxaSummary({ onSelectTaxon, selectedTaxon }: Props) {
  const [taxa, setTaxa] = useState<TaxonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTaxa() {
      try {
        const res = await fetch("/api/gbif/taxa");
        if (!res.ok) throw new Error("Failed to load taxa");
        const data = await res.json();
        setTaxa(data.taxa);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load taxa");
      } finally {
        setLoading(false);
      }
    }
    fetchTaxa();
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4"></div>
          <div className="h-32 bg-zinc-200 dark:bg-zinc-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  // Calculate totals
  const totalSpecies = taxa.reduce((sum, t) => sum + t.gbifSpeciesCount, 0);
  const totalOccurrences = taxa.reduce((sum, t) => sum + t.gbifTotalOccurrences, 0);
  const totalDescribed = taxa.reduce((sum, t) => sum + t.estimatedDescribed, 0);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          GBIF Occurrence Data Summary
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Click a row to view detailed species data for that taxon
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Taxon
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Est. Described
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                GBIF Species
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Total Occurrences
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Median
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Data Distribution
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {taxa.map((taxon) => (
              <tr
                key={taxon.id}
                onClick={() => taxon.gbifDataAvailable && onSelectTaxon(taxon.id)}
                className={`
                  ${taxon.gbifDataAvailable ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" : "opacity-50 cursor-not-allowed"}
                  ${selectedTaxon === taxon.id ? "bg-zinc-100 dark:bg-zinc-800" : ""}
                `}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: taxon.color }}
                    />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {taxon.name}
                    </span>
                    {!taxon.gbifDataAvailable && (
                      <span className="text-xs text-zinc-400">(no data)</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {taxon.estimatedSourceUrl ? (
                    <a
                      href={taxon.estimatedSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                      title={`Source: ${taxon.estimatedSource}`}
                    >
                      {formatNumber(taxon.estimatedDescribed)}
                    </a>
                  ) : (
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {formatNumber(taxon.estimatedDescribed)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.gbifDataAvailable ? formatNumber(taxon.gbifSpeciesCount) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.gbifDataAvailable ? formatNumber(taxon.gbifTotalOccurrences) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.gbifDataAvailable ? formatNumber(taxon.gbifMedian) : "—"}
                </td>
                <td className="px-4 py-3">
                  {taxon.gbifDataAvailable && taxon.distribution && taxon.gbifSpeciesCount > 0 ? (
                    <div className="flex h-4 rounded overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                      {/* Data deficient (<=10 occurrences) - red */}
                      <div
                        className="h-full bg-red-500"
                        style={{
                          width: `${(taxon.distribution.lte10 / taxon.gbifSpeciesCount) * 100}%`,
                        }}
                        title={`≤10: ${formatNumber(taxon.distribution.lte10)}`}
                      />
                      {/* Low data (11-100) - orange */}
                      <div
                        className="h-full bg-amber-500"
                        style={{
                          width: `${((taxon.distribution.lte100 - taxon.distribution.lte10) / taxon.gbifSpeciesCount) * 100}%`,
                        }}
                        title={`11-100: ${formatNumber(taxon.distribution.lte100 - taxon.distribution.lte10)}`}
                      />
                      {/* Moderate data (101-1000) - yellow */}
                      <div
                        className="h-full bg-yellow-400"
                        style={{
                          width: `${((taxon.distribution.lte1000 - taxon.distribution.lte100) / taxon.gbifSpeciesCount) * 100}%`,
                        }}
                        title={`101-1K: ${formatNumber(taxon.distribution.lte1000 - taxon.distribution.lte100)}`}
                      />
                      {/* Good data (>1000) - green */}
                      <div
                        className="h-full bg-green-500"
                        style={{
                          width: `${((taxon.gbifSpeciesCount - taxon.distribution.lte1000) / taxon.gbifSpeciesCount) * 100}%`,
                        }}
                        title={`>1K: ${formatNumber(taxon.gbifSpeciesCount - taxon.distribution.lte1000)}`}
                      />
                    </div>
                  ) : (
                    <div className="h-4 rounded bg-zinc-200 dark:bg-zinc-700" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-zinc-50 dark:bg-zinc-800 font-medium">
            <tr>
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                Total
              </td>
              <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                {formatNumber(totalDescribed)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                {formatNumber(totalSpecies)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                {formatNumber(totalOccurrences)}
              </td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Distribution legend */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span className="text-zinc-500 dark:text-zinc-400">≤10 occurrences</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-amber-500" />
          <span className="text-zinc-500 dark:text-zinc-400">11-100</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-yellow-400" />
          <span className="text-zinc-500 dark:text-zinc-400">101-1K</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-zinc-500 dark:text-zinc-400">&gt;1K</span>
        </div>
      </div>
    </div>
  );
}
