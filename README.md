# Data-Deficient Plant Search

Identify candidate locations for collecting samples for plant species using embeddings from geospatial foundation models.

## Why This Matters

GBIF has occurrence data for 354,357 plant species, but:
- **72.6%** have 100 or fewer occurrences
- **36.6%** have 10 or fewer occurrences
- **9.3%** have just 1 occurrence

This tool helps find where to look for rare/data-deficient plants by learning habitat signatures from known locations.

## Methods

### Similarity (recommended for rare species)
Computes the centroid of known occurrence embeddings and scores each pixel by cosine similarity. Works with 1+ samples.

### Classifier (better with more data)
Trains a KNN classifier to distinguish occurrence locations from random background. Works better with 10+ samples.

## Quick Start

```bash
# Auto-select method based on sample size
uv run python run.py "Quercus robur" --region cambridge

# Force similarity method (best for rare species)
uv run python run.py "Rare species" --region cambridge --method similarity

# Force classifier method
uv run python run.py "Common species" --region cambridge --method classifier

# Custom bounding box (min_lon,min_lat,max_lon,max_lat)
uv run python run.py "Species name" --bbox 0.0,52.0,1.0,53.0
```

## Requirements

**Tessera embeddings**: Pre-downloaded Tessera embeddings in `cache/2024/` (0.1° tiles of 128-dimensional vectors).

## Output

Results saved to `output/{species_name}/`:
- `probability.tif` - GeoTIFF heatmap
- `candidates.geojson` - High-scoring locations
- `occurrences.geojson` - GBIF occurrences used

## Web App

```bash
cd app && npm install && npm run dev
```

Browse species data at http://localhost:3000. Species with predictions show an "AI" badge and display the heatmap overlay when expanded.

## Project Structure

```
├── run.py              # CLI entry point
├── finder/             # Core library
│   ├── gbif.py         # GBIF API
│   ├── embeddings.py   # Tessera mosaic loading
│   ├── methods.py      # Similarity + Classifier methods
│   └── pipeline.py     # Main pipeline
├── app/                # Next.js visualization
├── cache/              # Tessera embeddings (gitignored)
└── output/             # Results (gitignored)
```
