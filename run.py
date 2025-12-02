#!/usr/bin/env python3
"""
Species Candidate Location Finder

Find candidate locations for plant species using geospatial embeddings.

Methods:
  - similarity: Distance to centroid of known locations (works with 1+ samples)
  - classifier: KNN with pseudo-negatives (better with 10+ samples)
  - auto: Automatically choose based on sample size

Usage:
    uv run python run.py "Quercus robur" --region cambridge
    uv run python run.py "Rare plant" --region cambridge --method similarity
    uv run python run.py "Common plant" --bbox 0,52,1,53 --method classifier
"""

import argparse
import logging
from pathlib import Path

from finder import find_candidates
from finder.pipeline import REGIONS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

PROJECT_ROOT = Path(__file__).parent
OUTPUT_DIR = PROJECT_ROOT / "output"
CACHE_DIR = PROJECT_ROOT / "cache"


def main():
    parser = argparse.ArgumentParser(
        description="Find candidate locations for a species",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-select method based on sample size
  uv run python run.py "Quercus robur" --region cambridge

  # Use similarity method (best for rare species with few samples)
  uv run python run.py "Rare species" --region cambridge --method similarity

  # Use classifier method (better with more samples)
  uv run python run.py "Common species" --region cambridge --method classifier

  # Custom bounding box
  uv run python run.py "Species name" --bbox 0.0,52.0,1.0,53.0
        """
    )

    parser.add_argument(
        "species",
        help="Scientific name of the species"
    )
    parser.add_argument(
        "--region",
        choices=list(REGIONS.keys()),
        help="Predefined region name"
    )
    parser.add_argument(
        "--bbox",
        help="Custom bounding box: min_lon,min_lat,max_lon,max_lat"
    )
    parser.add_argument(
        "--method",
        choices=["auto", "similarity", "classifier"],
        default="auto",
        help="Prediction method (default: auto)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output directory (default: output/{species_name})"
    )

    args = parser.parse_args()

    # Get bounding box
    if args.region:
        bbox = REGIONS[args.region]["bbox"]
    elif args.bbox:
        bbox = tuple(map(float, args.bbox.split(",")))
    else:
        parser.error("Specify --region or --bbox")

    # Determine output directory
    slug = args.species.lower().replace(" ", "_")
    output_dir = Path(args.output) if args.output else OUTPUT_DIR / slug

    # Run the pipeline
    result = find_candidates(
        species_name=args.species,
        bbox=bbox,
        cache_dir=CACHE_DIR,
        method=args.method,
        output_dir=output_dir,
    )

    print(f"\nOutput saved to: {output_dir}/")
    print(f"  - probability.tif (heatmap raster)")
    print(f"  - candidates.geojson ({result.to_geojson()['metadata']['n_candidates']} points)")
    print(f"  - occurrences.geojson ({result.n_occurrences} GBIF records)")


if __name__ == "__main__":
    main()
