"use client";

import { useState, useEffect, useCallback } from "react";
import DistributionCharts from "@/components/DistributionCharts";

interface SpeciesRecord {
  species_key: number;
  occurrence_count: number;
}

interface SpeciesDetails {
  key: number;
  scientificName: string;
  canonicalName: string;
  vernacularName?: string;
  kingdom: string;
  family: string;
  genus: string;
  gbifUrl: string;
  imageUrl?: string;
  occurrenceCount?: number;
}

interface Stats {
  total: number;
  filtered: number;
  totalOccurrences: number;
  median: number;
  distribution: {
    one: number;
    lte5: number;
    lte10: number;
    lte50: number;
    lte100: number;
    lte1000: number;
  };
}

interface ApiResponse {
  data: SpeciesRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: Stats;
}

type FilterPreset = "all" | "dataDeficient" | "veryRare" | "singletons";

const FILTER_PRESETS: Record<FilterPreset, { minCount: number; maxCount: number; label: string }> = {
  all: { minCount: 0, maxCount: 999999999, label: "All Species" },
  dataDeficient: { minCount: 0, maxCount: 100, label: "Data-Deficient (≤100)" },
  veryRare: { minCount: 0, maxCount: 10, label: "Very Rare (≤10)" },
  singletons: { minCount: 1, maxCount: 1, label: "Singletons (=1)" },
};

export default function Home() {
  const [data, setData] = useState<SpeciesRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterPreset, setFilterPreset] = useState<FilterPreset>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesDetails | null>(null);
  const [speciesCache, setSpeciesCache] = useState<Record<number, SpeciesDetails>>({});
  const [loadingSpecies, setLoadingSpecies] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpeciesDetails[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { minCount, maxCount } = FILTER_PRESETS[filterPreset];
    const params = new URLSearchParams({
      page: pagination.page.toString(),
      limit: pagination.limit.toString(),
      minCount: minCount.toString(),
      maxCount: maxCount.toString(),
      sort: sortOrder,
    });

    const response = await fetch(`/api/species?${params}`);
    const result: ApiResponse = await response.json();

    setData(result.data);
    setStats(result.stats);
    setPagination(result.pagination);
    setLoading(false);
  }, [pagination.page, pagination.limit, filterPreset, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-preload species details for all visible rows
  useEffect(() => {
    const preloadSpeciesDetails = async () => {
      const keysToLoad = data
        .map((record) => record.species_key)
        .filter((key) => !speciesCache[key] && !loadingSpecies.has(key));

      if (keysToLoad.length === 0) return;

      // Mark all as loading
      setLoadingSpecies((prev) => new Set([...prev, ...keysToLoad]));

      // Fetch all in parallel (with some concurrency limit)
      const batchSize = 10;
      for (let i = 0; i < keysToLoad.length; i += batchSize) {
        const batch = keysToLoad.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (speciesKey) => {
            try {
              const response = await fetch(`/api/species/${speciesKey}`);
              if (response.ok) {
                return await response.json();
              }
            } catch (error) {
              console.error(`Failed to fetch species ${speciesKey}:`, error);
            }
            return null;
          })
        );

        // Update cache with results
        const newCache: Record<number, SpeciesDetails> = {};
        results.forEach((details) => {
          if (details) {
            newCache[details.key] = details;
          }
        });

        setSpeciesCache((prev) => ({ ...prev, ...newCache }));
      }

      // Clear loading state
      setLoadingSpecies((prev) => {
        const next = new Set(prev);
        keysToLoad.forEach((key) => next.delete(key));
        return next;
      });
    };

    preloadSpeciesDetails();
  }, [data, speciesCache, loadingSpecies]);

  const fetchSpeciesDetails = async (speciesKey: number) => {
    if (speciesCache[speciesKey]) {
      setSelectedSpecies(speciesCache[speciesKey]);
      return;
    }

    setLoadingSpecies((prev) => new Set([...prev, speciesKey]));
    try {
      const response = await fetch(`/api/species/${speciesKey}`);
      const details: SpeciesDetails = await response.json();
      setSpeciesCache((prev) => ({ ...prev, [speciesKey]: details }));
      setSelectedSpecies(details);
    } catch (error) {
      console.error("Failed to fetch species details:", error);
    }
    setLoadingSpecies((prev) => {
      const next = new Set(prev);
      next.delete(speciesKey);
      return next;
    });
  };

  const handleFilterChange = (preset: FilterPreset) => {
    setFilterPreset(preset);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
    }
    setSearching(false);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  const handleRefreshFromGBIF = async () => {
    if (refreshing) return;

    const confirmed = window.confirm(
      "This will fetch fresh data from GBIF. This may take several minutes. Continue?"
    );
    if (!confirmed) return;

    setRefreshing(true);
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const result = await response.json();

      if (result.success) {
        alert("Data refresh completed! Reloading...");
        fetchData();
      } else {
        alert(`Refresh failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Refresh failed: ${error}`);
    }
    setRefreshing(false);
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const getPercentage = (count: number, total: number) => ((count / total) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <main className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              Plant Species Data Explorer
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Explore GBIF occurrence data for {stats ? formatNumber(stats.total) : "..."} plant species
            </p>
          </div>
          <button
            onClick={handleRefreshFromGBIF}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700 flex items-center gap-2"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {refreshing ? "Fetching from GBIF..." : "Refresh from GBIF"}
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatNumber(stats.total)}
              </div>
              <div className="text-sm text-zinc-500">Total Species</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatNumber(stats.totalOccurrences)}
              </div>
              <div className="text-sm text-zinc-500">Total Occurrences</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatNumber(stats.median)}
              </div>
              <div className="text-sm text-zinc-500">Median Occurrences</div>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {formatNumber(Math.round(stats.totalOccurrences / stats.total))}
              </div>
              <div className="text-sm text-zinc-500">Mean Occurrences</div>
            </div>
          </div>
        )}

        {/* Distribution Breakdown */}
        {stats && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-sm border border-zinc-200 dark:border-zinc-800 mb-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Distribution Breakdown
            </h2>
            <div className="space-y-3">
              {[
                { label: "= 1 occurrence (singletons)", count: stats.distribution.one },
                { label: "≤ 5 occurrences", count: stats.distribution.lte5 },
                { label: "≤ 10 occurrences", count: stats.distribution.lte10 },
                { label: "≤ 50 occurrences", count: stats.distribution.lte50 },
                { label: "≤ 100 occurrences", count: stats.distribution.lte100 },
                { label: "≤ 1000 occurrences", count: stats.distribution.lte1000 },
              ].map(({ label, count }) => (
                <div key={label} className="flex items-center gap-4">
                  <div className="w-48 text-sm text-zinc-600 dark:text-zinc-400">{label}</div>
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-orange-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${(count / stats.total) * 100}%` }}
                    />
                  </div>
                  <div className="w-32 text-sm text-right text-zinc-600 dark:text-zinc-400">
                    {formatNumber(count)} ({getPercentage(count, stats.total)}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Distribution Charts */}
        <DistributionCharts />

        {/* Search */}
        <div className="mb-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a plant species..."
                className="w-full px-4 py-2 pl-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? "Searching..." : "Search"}
            </button>
            {searchResults !== null && (
              <button
                type="button"
                onClick={clearSearch}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Filters and Controls - hidden during search */}
        {searchResults === null && (
          <>
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex gap-2">
                {(Object.keys(FILTER_PRESETS) as FilterPreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleFilterChange(preset)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filterPreset === preset
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {FILTER_PRESETS[preset].label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700"
              >
                Sort: {sortOrder === "desc" ? "Most → Least" : "Least → Most"}
              </button>
            </div>
          </>
        )}

        {/* Results count */}
        <div className="text-sm text-zinc-500 mb-4">
          {searchResults !== null
            ? searchResults.length === 0
              ? "No species found"
              : `Found ${searchResults.length} species matching "${searchQuery}"`
            : `Showing ${formatNumber(pagination.total)} species${filterPreset !== "all" ? ` (filtered: ${FILTER_PRESETS[filterPreset].label})` : ""}`}
        </div>

        {/* Data Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  {searchResults === null && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-20">
                      Rank
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-20">
                    Image
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Common Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Species Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider w-32">
                    Occurrences
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading && searchResults === null ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : searching ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      Searching...
                    </td>
                  </tr>
                ) : searchResults !== null ? (
                  searchResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        No species found matching &quot;{searchQuery}&quot;
                      </td>
                    </tr>
                  ) : (
                    searchResults.map((species) => (
                      <tr
                        key={species.key}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        onClick={() => setSelectedSpecies(species)}
                      >
                        <td className="px-4 py-2">
                          {species.imageUrl ? (
                            <img
                              src={species.imageUrl}
                              alt={species.canonicalName}
                              className="w-16 h-16 object-cover rounded bg-zinc-100 dark:bg-zinc-800"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded flex items-center justify-center">
                              <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {species.vernacularName || <span className="text-zinc-400">—</span>}
                        </td>
                        <td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 italic">
                          {species.canonicalName}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-zinc-900 dark:text-zinc-100">
                          {species.occurrenceCount !== undefined ? formatNumber(species.occurrenceCount) : "—"}
                        </td>
                      </tr>
                    ))
                  )
                ) : (
                  data.map((record, index) => {
                    const rank = sortOrder === "desc"
                      ? (pagination.page - 1) * pagination.limit + index + 1
                      : pagination.total - ((pagination.page - 1) * pagination.limit + index);
                    const cached = speciesCache[record.species_key];
                    const isLoading = loadingSpecies.has(record.species_key);
                    return (
                      <tr
                        key={record.species_key}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        onClick={() => {
                          if (cached) setSelectedSpecies(cached);
                          else fetchSpeciesDetails(record.species_key);
                        }}
                      >
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-zinc-500">
                          #{formatNumber(rank)}
                        </td>
                        <td className="px-4 py-2">
                          {isLoading ? (
                            <div className="w-16 h-16 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                          ) : cached?.imageUrl ? (
                            <img
                              src={cached.imageUrl}
                              alt={cached.canonicalName}
                              className="w-16 h-16 object-cover rounded bg-zinc-100 dark:bg-zinc-800"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded flex items-center justify-center">
                              <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {isLoading ? (
                            <span className="text-zinc-400 animate-pulse">...</span>
                          ) : cached?.vernacularName ? (
                            cached.vernacularName
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 italic">
                          {isLoading ? (
                            <span className="text-zinc-400 animate-pulse">Loading...</span>
                          ) : cached ? (
                            cached.canonicalName
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-zinc-900 dark:text-zinc-100">
                          {formatNumber(record.occurrence_count)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination - hidden when search results are shown */}
        {searchResults === null && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">
            Page {pagination.page} of {formatNumber(pagination.totalPages)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page <= 1}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
            >
              Next
            </button>
          </div>
        </div>
        )}

        {/* Species Detail Modal */}
        {selectedSpecies && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedSpecies(null)}
          >
            <div
              className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-lg w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 italic">
                    {selectedSpecies.canonicalName}
                  </h2>
                  {selectedSpecies.vernacularName && (
                    <p className="text-zinc-500">{selectedSpecies.vernacularName}</p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedSpecies(null)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {selectedSpecies.imageUrl && (
                <div className="mb-4">
                  <img
                    src={selectedSpecies.imageUrl}
                    alt={selectedSpecies.canonicalName}
                    className="w-full h-48 object-cover rounded-lg bg-zinc-100 dark:bg-zinc-800"
                  />
                </div>
              )}
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-zinc-500">Kingdom</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">{selectedSpecies.kingdom}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Family</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">{selectedSpecies.family}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Genus</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">{selectedSpecies.genus}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">GBIF Key</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">{selectedSpecies.key}</dd>
                </div>
              </dl>
              <div className="mt-6">
                <a
                  href={selectedSpecies.gbifUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  View on GBIF
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
