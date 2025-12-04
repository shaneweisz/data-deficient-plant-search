"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((mod) => mod.CircleMarker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);
const Rectangle = dynamic(
  () => import("react-leaflet").then((mod) => mod.Rectangle),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);

interface Point {
  lon: number;
  lat: number;
  score?: number;
}

interface Trial {
  seed: number;
  auc: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  mean_positive: number;
  mean_negative: number;
  n_test_positive: number;
  n_test_negative: number;
  train_positive: { lon: number; lat: number }[];
  train_negative: { lon: number; lat: number }[];
  test_positive: Point[];
  test_negative: Point[];
}

interface Experiment {
  n_positive: number;
  n_negative: number;
  n_trials: number;
  auc_mean: number;
  auc_std: number;
  f1_mean: number;
  f1_std: number;
  precision_mean: number;
  precision_std: number;
  recall_mean: number;
  recall_std: number;
  trials: Trial[];
}

interface SpeciesData {
  species: string;
  species_key: number;
  region: string;
  model_type?: string;
  n_occurrences: number;
  n_trials: number;
  experiments: Experiment[];
}

type ExperimentModelType = "logistic" | "mlp";

interface SpeciesNames {
  [key: string]: string | undefined; // species_key -> vernacular name
}

interface LocalPrediction {
  lon: number;
  lat: number;
  score: number;
  uncertainty?: number;
  confidence?: number;
}

interface LocalPredictionResult {
  predictions: LocalPrediction[];
  species: string;
  species_key: number;
  model_type: "logistic" | "mlp";
  has_uncertainty: boolean;
  center: { lon: number; lat: number };
  grid_size_m: number;
  n_pixels: number;
}

type ModelType = "logistic" | "mlp";

const SPECIES_FILES = [
  "quercus_robur",
  "fraxinus_excelsior",
  "urtica_dioica",
];

export default function ExperimentPage() {
  const [speciesDataByModel, setSpeciesDataByModel] = useState<Record<ExperimentModelType, Record<string, SpeciesData>>>({
    logistic: {},
    mlp: {},
  });
  const [speciesNames, setSpeciesNames] = useState<SpeciesNames>({});
  const [selectedSpecies, setSelectedSpecies] = useState<string>("quercus_robur");
  const [selectedNPositive, setSelectedNPositive] = useState<number>(10);
  const [selectedTrialIdx, setSelectedTrialIdx] = useState<number>(0);
  const [threshold, setThreshold] = useState<number>(0.5);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [experimentModelType, setExperimentModelType] = useState<ExperimentModelType>("logistic");

  // Location-based prediction state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [localPredictions, setLocalPredictions] = useState<LocalPredictionResult | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [modelType, setModelType] = useState<ModelType>("mlp");
  const [showConfidence, setShowConfidence] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load experiment data for both model types
    const loadModelData = async (modelType: ExperimentModelType) => {
      const results = await Promise.all(
        SPECIES_FILES.map(async (slug) => {
          try {
            const res = await fetch(`/experiments/${modelType}/${slug}.json`);
            if (res.ok) {
              const data = await res.json();
              return [slug, data] as [string, SpeciesData];
            }
          } catch (e) {
            console.error(`Failed to load ${modelType}/${slug}:`, e);
          }
          return null;
        })
      );
      const data: Record<string, SpeciesData> = {};
      results.forEach((r) => {
        if (r) data[r[0]] = r[1];
      });
      return data;
    };

    Promise.all([
      loadModelData("logistic"),
      loadModelData("mlp"),
    ]).then(([logisticData, mlpData]) => {
      setSpeciesDataByModel({
        logistic: logisticData,
        mlp: mlpData,
      });
      setLoading(false);

      // Fetch vernacular names for all species (use logistic data for keys)
      const speciesKeys = Object.values(logisticData).map((d) => d.species_key);
      Promise.all(
        speciesKeys.map(async (key) => {
          try {
            const res = await fetch(`/api/species/${key}`);
            if (res.ok) {
              const info = await res.json();
              return [key.toString(), info.vernacularName] as [string, string | undefined];
            }
          } catch (e) {
            console.error(`Failed to fetch species ${key}:`, e);
          }
          return [key.toString(), undefined] as [string, string | undefined];
        })
      ).then((nameResults) => {
        const names: SpeciesNames = {};
        nameResults.forEach(([key, name]) => {
          names[key] = name;
        });
        setSpeciesNames(names);
      });
    });
  }, []);

  const speciesData = speciesDataByModel[experimentModelType];
  const currentData = speciesData[selectedSpecies];
  const currentExp = currentData?.experiments.find((e) => e.n_positive === selectedNPositive);
  const availableNPositive = currentData?.experiments.map((e) => e.n_positive) || [];
  const currentTrial = currentExp?.trials[selectedTrialIdx];

  // Get comparison data from the other model
  const otherModelType: ExperimentModelType = experimentModelType === "logistic" ? "mlp" : "logistic";
  const otherModelData = speciesDataByModel[otherModelType][selectedSpecies];
  const otherModelExp = otherModelData?.experiments.find((e) => e.n_positive === selectedNPositive);

  // Ensure selectedNPositive is valid for current species
  useEffect(() => {
    if (availableNPositive.length > 0 && !availableNPositive.includes(selectedNPositive)) {
      setSelectedNPositive(availableNPositive[0]);
    }
  }, [availableNPositive, selectedNPositive]);

  // Reset trial index when n changes
  useEffect(() => {
    setSelectedTrialIdx(0);
  }, [selectedNPositive]);

  // Clear local predictions when species changes
  useEffect(() => {
    setLocalPredictions(null);
    setLocalError(null);
  }, [selectedSpecies]);

  // Get user location and fetch predictions
  const handleFindMe = async () => {
    if (!currentData) return;

    setLocalLoading(true);
    setLocalError(null);

    try {
      // Get user's location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude: lat, longitude: lon } = position.coords;
      setUserLocation({ lat, lon });

      // Fetch predictions for this location (500m x 500m grid)
      const res = await fetch(
        `/api/predict-local?lat=${lat}&lon=${lon}&speciesKey=${currentData.species_key}&gridSize=500&modelType=${modelType}`
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to get predictions");
      }

      const result = await res.json();
      setLocalPredictions(result);
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        setLocalError("Could not get your location. Please enable location access.");
      } else {
        setLocalError(err instanceof Error ? err.message : "Failed to get predictions");
      }
    } finally {
      setLocalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Loading experiment data...</div>
      </div>
    );
  }

  if (!currentData || !currentExp || !currentTrial) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">No experiment data found</div>
      </div>
    );
  }

  // Compute confusion matrix based on threshold
  const getScore = (pt: Point) => pt.score ?? 0;

  const truePositives = currentTrial.test_positive.filter(pt => getScore(pt) >= threshold);
  const falseNegatives = currentTrial.test_positive.filter(pt => getScore(pt) < threshold);
  const trueNegatives = currentTrial.test_negative.filter(pt => getScore(pt) < threshold);
  const falsePositives = currentTrial.test_negative.filter(pt => getScore(pt) >= threshold);

  const tp = truePositives.length;
  const fn = falseNegatives.length;
  const tn = trueNegatives.length;
  const fp = falsePositives.length;

  const accuracy = (tp + tn) / (tp + tn + fp + fn);
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <main className="max-w-6xl mx-auto">
        <div className="mb-6">
          <p className="text-zinc-600 dark:text-zinc-400">
            Validating classifier performance on held-out occurrences vs random background
            <span className="ml-1 text-zinc-500">({currentData.n_trials} trials per setting)</span>
          </p>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Model type selector for experiments */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Model Type
            </label>
            <div className="flex rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setExperimentModelType("logistic")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  experimentModelType === "logistic"
                    ? "bg-green-600 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
              >
                Logistic
              </button>
              <button
                onClick={() => setExperimentModelType("mlp")}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  experimentModelType === "mlp"
                    ? "bg-purple-600 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
              >
                MLP
              </button>
            </div>
          </div>

          {/* Species selector */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Species
            </label>
            <select
              value={selectedSpecies}
              onChange={(e) => setSelectedSpecies(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              {Object.entries(speciesData).map(([slug, data]) => {
                const vernacularName = speciesNames[data.species_key.toString()];
                return (
                  <option key={slug} value={slug}>
                    {data.species}
                    {vernacularName ? ` (${vernacularName})` : ""} - {data.n_occurrences} occ
                  </option>
                );
              })}
            </select>
            <a
              href={`https://www.gbif.org/species/${currentData.species_key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-green-600 hover:text-green-700 hover:underline"
            >
              View on GBIF →
            </a>
          </div>

          {/* N selector */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Positive training samples
              <span className="font-normal text-zinc-500 ml-1">(+ matching negatives)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {availableNPositive.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedNPositive(n)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    selectedNPositive === n
                      ? "bg-green-600 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Trial selector */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Trial
              <span className="font-normal text-zinc-500 ml-1">(seed: {currentTrial.seed})</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {currentExp.trials.map((trial, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedTrialIdx(idx)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    selectedTrialIdx === idx
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className={`text-2xl font-bold ${currentExp.auc_mean >= 0.7 ? "text-green-600" : currentExp.auc_mean >= 0.5 ? "text-yellow-600" : "text-red-600"}`}>
              {(currentExp.auc_mean * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-zinc-400">± {(currentExp.auc_std * 100).toFixed(1)}</div>
            <div className="text-sm text-zinc-500">AUC</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className={`text-2xl font-bold ${currentExp.f1_mean >= 0.7 ? "text-green-600" : currentExp.f1_mean >= 0.5 ? "text-yellow-600" : "text-red-600"}`}>
              {(currentExp.f1_mean * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-zinc-400">± {(currentExp.f1_std * 100).toFixed(1)}</div>
            <div className="text-sm text-zinc-500">F1 Score</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {(currentExp.precision_mean * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-zinc-400">± {(currentExp.precision_std * 100).toFixed(1)}</div>
            <div className="text-sm text-zinc-500">Precision</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {(currentExp.recall_mean * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-zinc-400">± {(currentExp.recall_std * 100).toFixed(1)}</div>
            <div className="text-sm text-zinc-500">Recall</div>
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 text-center">
            <div className="text-lg font-bold text-green-600">
              {currentTrial.mean_positive.toFixed(3)}
            </div>
            <div className="text-lg font-bold text-red-600">
              {currentTrial.mean_negative.toFixed(3)}
            </div>
            <div className="text-sm text-zinc-500">Pos/Neg Score</div>
          </div>
        </div>

        {/* Model Comparison */}
        {otherModelExp && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 mb-6">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Model Comparison (n={selectedNPositive})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-2 px-3 text-zinc-500">Model</th>
                    <th className="text-right py-2 px-3 text-zinc-500">AUC</th>
                    <th className="text-right py-2 px-3 text-zinc-500">F1</th>
                    <th className="text-right py-2 px-3 text-zinc-500">Precision</th>
                    <th className="text-right py-2 px-3 text-zinc-500">Recall</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={`border-b border-zinc-100 dark:border-zinc-800 ${experimentModelType === "logistic" ? "bg-green-50 dark:bg-green-900/10" : ""}`}>
                    <td className="py-2 px-3 font-medium">
                      <span className={experimentModelType === "logistic" ? "text-green-600" : ""}>Logistic</span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "logistic"
                        ? `${(currentExp.auc_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.auc_mean * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "logistic"
                        ? `${(currentExp.f1_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.f1_mean * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "logistic"
                        ? `${(currentExp.precision_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.precision_mean * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "logistic"
                        ? `${(currentExp.recall_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.recall_mean * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                  <tr className={experimentModelType === "mlp" ? "bg-purple-50 dark:bg-purple-900/10" : ""}>
                    <td className="py-2 px-3 font-medium">
                      <span className={experimentModelType === "mlp" ? "text-purple-600" : ""}>MLP</span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "mlp"
                        ? `${(currentExp.auc_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.auc_mean * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "mlp"
                        ? `${(currentExp.f1_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.f1_mean * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "mlp"
                        ? `${(currentExp.precision_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.precision_mean * 100).toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {experimentModelType === "mlp"
                        ? `${(currentExp.recall_mean * 100).toFixed(1)}%`
                        : `${(otherModelExp.recall_mean * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Confusion Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Threshold control */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Decision Threshold
              </h3>
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {threshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full accent-green-600"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>0</span>
              <span>0.5</span>
              <span>1</span>
            </div>
            {/* Derived metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <div className="text-center">
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {(accuracy * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500">Accuracy</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {(precision * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500">Precision</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {(recall * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-zinc-500">Recall</div>
              </div>
            </div>
          </div>

          {/* Confusion matrix */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Confusion Matrix
            </h3>
            <div className="grid grid-cols-3 gap-1 text-center text-sm">
              {/* Header row */}
              <div></div>
              <div className="text-zinc-500 font-medium py-1">Pred +</div>
              <div className="text-zinc-500 font-medium py-1">Pred −</div>
              {/* True positive row */}
              <div className="text-zinc-500 font-medium py-2">Actual +</div>
              <div className="bg-green-100 dark:bg-green-900/30 rounded p-2">
                <div className="text-xl font-bold text-green-700 dark:text-green-400">{tp}</div>
                <div className="text-xs text-green-600 dark:text-green-500">TP</div>
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 rounded p-2">
                <div className="text-xl font-bold text-red-700 dark:text-red-400">{fn}</div>
                <div className="text-xs text-red-600 dark:text-red-500">FN</div>
              </div>
              {/* True negative row */}
              <div className="text-zinc-500 font-medium py-2">Actual −</div>
              <div className="bg-red-100 dark:bg-red-900/30 rounded p-2">
                <div className="text-xl font-bold text-red-700 dark:text-red-400">{fp}</div>
                <div className="text-xs text-red-600 dark:text-red-500">FP</div>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 rounded p-2">
                <div className="text-xl font-bold text-green-700 dark:text-green-400">{tn}</div>
                <div className="text-xs text-green-600 dark:text-green-500">TN</div>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics by training size */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 mb-6">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Metrics by Training Size ({experimentModelType === "mlp" ? "MLP" : "Logistic"})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left py-2 px-3 text-zinc-500">n</th>
                  <th className="text-right py-2 px-3 text-zinc-500">AUC</th>
                  <th className="text-right py-2 px-3 text-zinc-500">F1</th>
                  <th className="text-right py-2 px-3 text-zinc-500">Precision</th>
                  <th className="text-right py-2 px-3 text-zinc-500">Recall</th>
                </tr>
              </thead>
              <tbody>
                {currentData.experiments.map((exp) => (
                  <tr
                    key={exp.n_positive}
                    className={`border-b border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                      exp.n_positive === selectedNPositive ? "bg-zinc-100 dark:bg-zinc-800" : ""
                    }`}
                    onClick={() => setSelectedNPositive(exp.n_positive)}
                  >
                    <td className="py-2 px-3 font-medium">{exp.n_positive}</td>
                    <td className={`py-2 px-3 text-right font-medium ${exp.auc_mean >= 0.7 ? "text-green-600" : exp.auc_mean >= 0.5 ? "text-yellow-600" : "text-red-600"}`}>
                      {(exp.auc_mean * 100).toFixed(1)}%
                    </td>
                    <td className={`py-2 px-3 text-right ${exp.f1_mean >= 0.7 ? "text-green-600" : exp.f1_mean >= 0.5 ? "text-yellow-600" : "text-red-600"}`}>
                      {(exp.f1_mean * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">
                      {(exp.precision_mean * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-600 dark:text-zinc-400">
                      {(exp.recall_mean * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Map */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-yellow-500 border-2 border-yellow-700" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Train + ({currentTrial.train_positive.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-purple-700" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Train − ({currentTrial.train_negative.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">TP ({tp})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-orange-700" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">FN ({fn})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">FP ({fp})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-zinc-400 border-2 border-zinc-600" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">TN ({tn})</span>
              </div>
            </div>
          </div>
          <div className="h-[500px]">
            {mounted && (
              <MapContainer
                center={[52.205, 0.1235]}
                zoom={11}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/* True Negatives (correctly classified negatives) - grey */}
                {trueNegatives.map((pt, idx) => {
                  const score = getScore(pt);
                  return (
                    <CircleMarker
                      key={`tn-${idx}`}
                      center={[pt.lat, pt.lon]}
                      radius={5}
                      pathOptions={{
                        color: "#52525b",
                        fillColor: "#a1a1aa",
                        fillOpacity: 0.6,
                        weight: 1,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-medium text-zinc-600">True Negative (TN)</div>
                          <div>Score: {score.toFixed(3)}</div>
                          <div className="text-xs text-zinc-500">Correctly rejected</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {/* False Positives (incorrectly predicted as positive) - red */}
                {falsePositives.map((pt, idx) => {
                  const score = getScore(pt);
                  return (
                    <CircleMarker
                      key={`fp-${idx}`}
                      center={[pt.lat, pt.lon]}
                      radius={6}
                      pathOptions={{
                        color: "#b91c1c",
                        fillColor: "#ef4444",
                        fillOpacity: 0.8,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-medium text-red-600">False Positive (FP)</div>
                          <div>Score: {score.toFixed(3)}</div>
                          <div className="text-xs text-zinc-500">Incorrectly predicted</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {/* False Negatives (missed real occurrences) - orange */}
                {falseNegatives.map((pt, idx) => {
                  const score = getScore(pt);
                  return (
                    <CircleMarker
                      key={`fn-${idx}`}
                      center={[pt.lat, pt.lon]}
                      radius={6}
                      pathOptions={{
                        color: "#c2410c",
                        fillColor: "#f97316",
                        fillOpacity: 0.8,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-medium text-orange-600">False Negative (FN)</div>
                          <div>Score: {score.toFixed(3)}</div>
                          <div className="text-xs text-zinc-500">Missed occurrence</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {/* True Positives (correctly identified occurrences) - green */}
                {truePositives.map((pt, idx) => {
                  const score = getScore(pt);
                  return (
                    <CircleMarker
                      key={`tp-${idx}`}
                      center={[pt.lat, pt.lon]}
                      radius={6}
                      pathOptions={{
                        color: "#15803d",
                        fillColor: "#22c55e",
                        fillOpacity: 0.8,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <div className="font-medium text-green-600">True Positive (TP)</div>
                          <div>Score: {score.toFixed(3)}</div>
                          <div className="text-xs text-zinc-500">Correctly identified</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {/* Training negative points - purple */}
                {currentTrial.train_negative.map((pt, idx) => (
                  <CircleMarker
                    key={`train-neg-${idx}`}
                    center={[pt.lat, pt.lon]}
                    radius={7}
                    pathOptions={{
                      color: "#7e22ce",
                      fillColor: "#a855f7",
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <div className="font-medium text-purple-600">Training Negative</div>
                        <div className="text-xs text-zinc-500">Background sample</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
                {/* Training positive points (on top) - yellow */}
                {currentTrial.train_positive.map((pt, idx) => (
                  <CircleMarker
                    key={`train-pos-${idx}`}
                    center={[pt.lat, pt.lon]}
                    radius={7}
                    pathOptions={{
                      color: "#a16207",
                      fillColor: "#eab308",
                      fillOpacity: 0.9,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <div className="font-medium text-yellow-600">Training Positive</div>
                        <div className="text-xs text-zinc-500">Known occurrence</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}

              </MapContainer>
            )}
          </div>
        </div>

        {/* Find Me - Local Predictions */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Predict Near Me
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Get predictions for a 500m × 500m grid at your current location
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Model Type Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Model:</span>
                <div className="flex rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <button
                    onClick={() => setModelType("logistic")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      modelType === "logistic"
                        ? "bg-green-600 text-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    }`}
                  >
                    Logistic
                  </button>
                  <button
                    onClick={() => setModelType("mlp")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      modelType === "mlp"
                        ? "bg-purple-600 text-white"
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    }`}
                  >
                    MLP + Uncertainty
                  </button>
                </div>
              </div>
              <button
                onClick={handleFindMe}
                disabled={localLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {localLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Finding...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Find Me</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {localError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm mb-4">
              {localError}
            </div>
          )}

          {localPredictions && (
            <div className="space-y-4">
              {/* Model info badge */}
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  localPredictions.model_type === "mlp"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                }`}>
                  {localPredictions.model_type === "mlp" ? "MLP + MC Dropout" : "Logistic Regression"}
                </span>
                {localPredictions.has_uncertainty && (
                  <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    Uncertainty Available
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {localPredictions.n_pixels}
                  </div>
                  <div className="text-xs text-zinc-500">Pixels analyzed</div>
                </div>
                <div className="text-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-lg font-bold text-green-600">
                    {localPredictions.predictions.filter(p => p.score >= threshold).length}
                  </div>
                  <div className="text-xs text-zinc-500">High probability</div>
                </div>
                <div className="text-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {localPredictions.predictions.length > 0
                      ? Math.max(...localPredictions.predictions.map(p => p.score)).toFixed(2)
                      : "N/A"}
                  </div>
                  <div className="text-xs text-zinc-500">Max score</div>
                </div>
                {localPredictions.has_uncertainty ? (
                  <div className="text-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <div className="text-lg font-bold text-purple-600">
                      {localPredictions.predictions.length > 0
                        ? (localPredictions.predictions.reduce((a, b) => a + (b.confidence ?? 0), 0) / localPredictions.predictions.length * 100).toFixed(0) + "%"
                        : "N/A"}
                    </div>
                    <div className="text-xs text-zinc-500">Mean confidence</div>
                  </div>
                ) : (
                  <div className="text-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {localPredictions.predictions.length > 0
                        ? (localPredictions.predictions.reduce((a, b) => a + b.score, 0) / localPredictions.predictions.length).toFixed(2)
                        : "N/A"}
                    </div>
                    <div className="text-xs text-zinc-500">Mean score</div>
                  </div>
                )}
              </div>

              {userLocation && (
                <div className="text-xs text-zinc-500 mb-2">
                  Location: {userLocation.lat.toFixed(5)}, {userLocation.lon.toFixed(5)}
                </div>
              )}

              {/* Satellite Map for Local Predictions */}
              {userLocation && (
                <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <div className="p-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {showConfidence && localPredictions.has_uncertainty ? (
                          <>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-green-500" />
                              <span className="text-zinc-600 dark:text-zinc-400">High confidence</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-yellow-500" />
                              <span className="text-zinc-600 dark:text-zinc-400">Medium</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-red-500" />
                              <span className="text-zinc-600 dark:text-zinc-400">Low confidence</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-red-500" />
                              <span className="text-zinc-600 dark:text-zinc-400">High prob</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-yellow-500" />
                              <span className="text-zinc-600 dark:text-zinc-400">Medium</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 rounded bg-blue-500" />
                              <span className="text-zinc-600 dark:text-zinc-400">Low</span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-white border-2 border-zinc-800" />
                          <span className="text-zinc-600 dark:text-zinc-400">You</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {localPredictions.has_uncertainty && (
                          <button
                            onClick={() => setShowConfidence(!showConfidence)}
                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                              showConfidence
                                ? "bg-purple-600 text-white"
                                : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            {showConfidence ? "Showing Confidence" : "Show Confidence"}
                          </button>
                        )}
                        <button
                          onClick={() => setShowHeatmap(!showHeatmap)}
                          className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                            showHeatmap
                              ? "bg-green-600 text-white"
                              : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {showHeatmap ? "Heatmap On" : "Heatmap Off"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="h-[400px]">
                    {mounted && (
                      <MapContainer
                        center={[userLocation.lat, userLocation.lon]}
                        zoom={16}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        />
                        {/* Heatmap rectangles */}
                        {showHeatmap && localPredictions.predictions.map((pt, idx) => {
                          // Determine what value to visualize
                          const useConfidenceColor = showConfidence && localPredictions.has_uncertainty;
                          const value = useConfidenceColor ? (pt.confidence ?? 0.5) : pt.score;

                          let r, g, b;
                          if (useConfidenceColor) {
                            // For confidence: green (high) -> yellow (medium) -> red (low)
                            if (value > 0.5) {
                              // Green to Yellow
                              const t = (value - 0.5) * 2;
                              r = Math.round(255 * (1 - t));
                              g = 255;
                              b = 0;
                            } else {
                              // Yellow to Red
                              const t = value * 2;
                              r = 255;
                              g = Math.round(255 * t);
                              b = 0;
                            }
                          } else {
                            // For score: blue (low) -> yellow (medium) -> red (high)
                            if (value < 0.5) {
                              // Blue to Yellow
                              const t = value * 2;
                              r = Math.round(255 * t);
                              g = Math.round(255 * t);
                              b = Math.round(255 * (1 - t));
                            } else {
                              // Yellow to Red
                              const t = (value - 0.5) * 2;
                              r = 255;
                              g = Math.round(255 * (1 - t));
                              b = 0;
                            }
                          }
                          const color = `rgb(${r},${g},${b})`;

                          // Each pixel is ~10m, convert to degrees
                          const pixelSize = 0.0001; // ~10m in degrees
                          const bounds: [[number, number], [number, number]] = [
                            [pt.lat - pixelSize / 2, pt.lon - pixelSize / 2],
                            [pt.lat + pixelSize / 2, pt.lon + pixelSize / 2],
                          ];

                          return (
                            <Rectangle
                              key={`heatmap-${idx}`}
                              bounds={bounds}
                              pathOptions={{
                                color: color,
                                fillColor: color,
                                fillOpacity: 0.7,
                                weight: 0,
                              }}
                            >
                              <Popup>
                                <div className="text-sm space-y-1">
                                  <div className="font-medium">Score: {pt.score.toFixed(3)}</div>
                                  {pt.uncertainty !== undefined && (
                                    <>
                                      <div>Uncertainty: {pt.uncertainty.toFixed(3)}</div>
                                      <div>Confidence: {((pt.confidence ?? 0) * 100).toFixed(0)}%</div>
                                    </>
                                  )}
                                </div>
                              </Popup>
                            </Rectangle>
                          );
                        })}
                        {/* User location marker */}
                        <CircleMarker
                          center={[userLocation.lat, userLocation.lon]}
                          radius={8}
                          pathOptions={{
                            color: "#1f2937",
                            fillColor: "#ffffff",
                            fillOpacity: 1,
                            weight: 3,
                          }}
                        >
                          <Popup>
                            <div className="text-sm">
                              <div className="font-medium">Your Location</div>
                            </div>
                          </Popup>
                        </CircleMarker>
                      </MapContainer>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
