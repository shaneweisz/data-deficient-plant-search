"use client";

import { useState, useEffect } from "react";
import TaxaIcon from "@/components/TaxaIcon";

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
  onSelectTaxon: (taxonId: string | null) => void;
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Taxon
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                # Described Species
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                # Assessed Species
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                % Assessed
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                <div># Outdated Assessments</div>
                <div className="font-normal normal-case tracking-normal">(10+ years)</div>
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                <div>% Outdated</div>
                <div className="font-normal normal-case tracking-normal">(10+ years)</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {taxa
              .filter((taxon) => !selectedTaxon || taxon.id === selectedTaxon)
              .map((taxon) => (
              <tr
                key={taxon.id}
                onClick={() => {
                  if (!taxon.available) return;
                  // Toggle: if already selected, deselect; otherwise select
                  onSelectTaxon(selectedTaxon === taxon.id ? null : taxon.id);
                }}
                className={`
                  ${taxon.available ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" : "opacity-50 cursor-not-allowed"}
                  ${selectedTaxon === taxon.id ? "bg-zinc-100 dark:bg-zinc-800" : ""}
                `}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TaxaIcon
                      taxonId={taxon.id}
                      size={18}
                      className="flex-shrink-0"
                      style={{ color: taxon.color }}
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
                <td className="px-4 py-3 text-right tabular-nums">
                  {taxon.available ? (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: taxon.percentAssessed >= 50 ? "rgba(34, 197, 94, 0.15)" : taxon.percentAssessed >= 20 ? "rgba(234, 179, 8, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: taxon.percentAssessed >= 50 ? "#16a34a" : taxon.percentAssessed >= 20 ? "#ca8a04" : "#dc2626",
                      }}
                    >
                      {taxon.percentAssessed.toFixed(1)}%
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {taxon.available ? taxon.outdated.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {taxon.available ? (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: taxon.percentOutdated < 20 ? "rgba(34, 197, 94, 0.15)" : taxon.percentOutdated < 40 ? "rgba(234, 179, 8, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: taxon.percentOutdated < 20 ? "#16a34a" : taxon.percentOutdated < 40 ? "#ca8a04" : "#dc2626",
                      }}
                    >
                      {taxon.percentOutdated.toFixed(1)}%
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          {!selectedTaxon && (
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
                <td className="px-4 py-3 text-right tabular-nums">
                  {(() => {
                    const percent = (totalAssessed / totalDescribed) * 100;
                    return (
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: percent >= 50 ? "rgba(34, 197, 94, 0.15)" : percent >= 20 ? "rgba(234, 179, 8, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: percent >= 50 ? "#16a34a" : percent >= 20 ? "#ca8a04" : "#dc2626",
                        }}
                      >
                        {percent.toFixed(1)}%
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {totalOutdated.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {(() => {
                    const percent = (totalOutdated / totalAssessed) * 100;
                    return (
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: percent < 20 ? "rgba(34, 197, 94, 0.15)" : percent < 40 ? "rgba(234, 179, 8, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: percent < 20 ? "#16a34a" : percent < 40 ? "#ca8a04" : "#dc2626",
                        }}
                      >
                        {percent.toFixed(1)}%
                      </span>
                    );
                  })()}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

    </div>
  );
}
