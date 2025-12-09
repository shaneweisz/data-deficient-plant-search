"use client";

import { useState, useEffect } from "react";
import { CATEGORY_COLORS, CATEGORY_NAMES } from "@/config/taxa";

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

interface Props {
  onSelectTaxon: (taxonId: string) => void;
  selectedTaxon: string | null;
}

export default function TaxaSummary({ onSelectTaxon, selectedTaxon }: Props) {
  const [taxa, setTaxa] = useState<TaxonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTaxa() {
      try {
        const res = await fetch("/api/redlist/taxa");
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
  const totalAssessed = taxa.reduce((sum, t) => sum + t.totalAssessed, 0);
  const totalOutdated = taxa.reduce((sum, t) => sum + t.outdated, 0);
  const totalDescribed = taxa.reduce((sum, t) => sum + t.estimatedDescribed, 0);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          IUCN Red List Assessment Summary
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Click a row to view detailed statistics for that taxon
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
                Assessed
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                % Assessed
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Category Distribution
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                % Outdated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {taxa.map((taxon) => (
              <tr
                key={taxon.id}
                onClick={() => taxon.available && onSelectTaxon(taxon.id)}
                className={`
                  ${taxon.available ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" : "opacity-50 cursor-not-allowed"}
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
                    {!taxon.available && (
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
                      {taxon.estimatedDescribed.toLocaleString()}
                    </a>
                  ) : (
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {taxon.estimatedDescribed.toLocaleString()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.available ? taxon.totalAssessed.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.available ? `${taxon.percentAssessed.toFixed(1)}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  {taxon.available && taxon.totalAssessed > 0 ? (
                    <div className="flex h-4 rounded overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                      {taxon.byCategory
                        .filter((c) => c.count > 0)
                        .map((cat) => (
                          <div
                            key={cat.code}
                            className="h-full"
                            style={{
                              width: `${(cat.count / taxon.totalAssessed) * 100}%`,
                              backgroundColor: cat.color,
                            }}
                            title={`${CATEGORY_NAMES[cat.code] || cat.code} (${cat.code}): ${((cat.count / taxon.totalAssessed) * 100).toFixed(1)}%`}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="h-4 rounded bg-zinc-200 dark:bg-zinc-700" />
                  )}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.available ? `${taxon.percentOutdated.toFixed(1)}%` : "—"}
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
                {totalDescribed.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                {totalAssessed.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                {((totalAssessed / totalDescribed) * 100).toFixed(1)}%
              </td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                {((totalOutdated / totalAssessed) * 100).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Category legend */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-3 text-xs">
        {Object.entries(CATEGORY_COLORS).map(([code, color]) => (
          <div key={code} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-zinc-500 dark:text-zinc-400">{code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
