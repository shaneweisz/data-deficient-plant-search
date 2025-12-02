"""
Prediction methods for finding candidate locations.

Two approaches:
1. SimilarityMethod: Pure distance-based, works with any number of samples
2. ClassifierMethod: KNN classifier with pseudo-negatives, better with more samples
"""

from abc import ABC, abstractmethod
from typing import Optional

import numpy as np
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from tqdm import tqdm


class PredictionMethod(ABC):
    """Base class for prediction methods."""

    name: str = "base"

    @abstractmethod
    def fit(self, positive_embeddings: np.ndarray) -> None:
        """Fit the method to positive (occurrence) embeddings."""
        pass

    @abstractmethod
    def predict(
        self,
        all_embeddings: np.ndarray,
        batch_size: int = 15000
    ) -> np.ndarray:
        """
        Predict scores for all embeddings.

        Args:
            all_embeddings: Array of shape (N, D) with all pixel embeddings
            batch_size: Process in batches for memory efficiency

        Returns:
            Array of shape (N,) with scores in [0, 1]
        """
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of the method."""
        pass


class SimilarityMethod(PredictionMethod):
    """
    Pure similarity-based approach using distance to centroid.

    Computes the centroid of positive embeddings and scores each pixel
    by its cosine similarity to the centroid. Works with any number of
    samples, including just 1.

    This is the recommended method for data-deficient species.
    """

    name = "similarity"

    def __init__(self, metric: str = "cosine"):
        """
        Initialize similarity method.

        Args:
            metric: Distance metric ("cosine" or "euclidean")
        """
        self.metric = metric
        self._centroid: Optional[np.ndarray] = None
        self._scaler: Optional[StandardScaler] = None

    def fit(self, positive_embeddings: np.ndarray) -> None:
        """Compute centroid of positive embeddings."""
        if len(positive_embeddings) == 0:
            raise ValueError("Need at least 1 positive sample")

        # Normalize embeddings for cosine similarity
        self._scaler = StandardScaler()
        normalized = self._scaler.fit_transform(positive_embeddings)

        # Compute centroid
        self._centroid = normalized.mean(axis=0)

        # Normalize centroid for cosine similarity
        if self.metric == "cosine":
            self._centroid = self._centroid / np.linalg.norm(self._centroid)

    def predict(
        self,
        all_embeddings: np.ndarray,
        batch_size: int = 15000
    ) -> np.ndarray:
        """Compute similarity scores for all embeddings."""
        if self._centroid is None:
            raise ValueError("Must call fit() first")

        n_samples = len(all_embeddings)
        scores = np.zeros(n_samples, dtype=np.float32)

        for i in tqdm(range(0, n_samples, batch_size), desc="Computing similarity"):
            end = min(i + batch_size, n_samples)
            batch = all_embeddings[i:end]

            # Normalize batch
            batch_normalized = self._scaler.transform(batch)

            if self.metric == "cosine":
                # Normalize for cosine similarity
                norms = np.linalg.norm(batch_normalized, axis=1, keepdims=True)
                norms[norms == 0] = 1  # Avoid division by zero
                batch_normalized = batch_normalized / norms

                # Cosine similarity (dot product of normalized vectors)
                similarities = batch_normalized @ self._centroid

                # Convert from [-1, 1] to [0, 1]
                scores[i:end] = (similarities + 1) / 2
            else:
                # Euclidean distance, inverted and normalized
                distances = np.linalg.norm(batch_normalized - self._centroid, axis=1)
                # Convert to similarity (closer = higher score)
                max_dist = distances.max() if distances.max() > 0 else 1
                scores[i:end] = 1 - (distances / max_dist)

        return scores

    @property
    def description(self) -> str:
        return f"Similarity to centroid ({self.metric})"


class ClassifierMethod(PredictionMethod):
    """
    KNN classifier with pseudo-negative sampling.

    Generates random background points as negatives and trains a KNN
    classifier to distinguish occurrences from background. Better with
    more samples (10+), but requires careful interpretation since
    negatives are arbitrary.
    """

    name = "classifier"

    def __init__(
        self,
        n_neighbors: int = 10,
        negative_ratio: int = 5,
        min_negative_distance: float = 0.005,
        seed: int = 42,
    ):
        """
        Initialize classifier method.

        Args:
            n_neighbors: Number of neighbors for KNN
            negative_ratio: Ratio of negatives to positives
            min_negative_distance: Minimum distance from positives for negatives
            seed: Random seed for reproducibility
        """
        self.n_neighbors = n_neighbors
        self.negative_ratio = negative_ratio
        self.min_negative_distance = min_negative_distance
        self.seed = seed

        self._model: Optional[Pipeline] = None
        self._positive_coords: Optional[list] = None
        self._bbox: Optional[tuple] = None

    def set_spatial_context(
        self,
        positive_coords: list[tuple[float, float]],
        bbox: tuple[float, float, float, float]
    ) -> None:
        """
        Set spatial context for negative generation.

        Args:
            positive_coords: List of (lon, lat) for positive samples
            bbox: Bounding box for negative generation
        """
        self._positive_coords = positive_coords
        self._bbox = bbox

    def _generate_negatives(self, n_samples: int) -> list[tuple[float, float]]:
        """Generate random negative coordinates avoiding positives."""
        if self._positive_coords is None or self._bbox is None:
            raise ValueError("Must call set_spatial_context() first")

        np.random.seed(self.seed)
        min_lon, min_lat, max_lon, max_lat = self._bbox
        pos_arr = np.array(self._positive_coords)
        negatives = []

        for _ in range(n_samples * 100):
            if len(negatives) >= n_samples:
                break
            lon = np.random.uniform(min_lon, max_lon)
            lat = np.random.uniform(min_lat, max_lat)
            dists = np.sqrt((pos_arr[:, 0] - lon)**2 + (pos_arr[:, 1] - lat)**2)
            if dists.min() > self.min_negative_distance:
                negatives.append((lon, lat))

        return negatives

    def fit(
        self,
        positive_embeddings: np.ndarray,
        negative_embeddings: Optional[np.ndarray] = None
    ) -> None:
        """
        Fit classifier on positive and negative embeddings.

        If negative_embeddings is None, they must be generated externally
        using get_negative_coords() and sampled from the mosaic.
        """
        if len(positive_embeddings) < 2:
            raise ValueError("Classifier method needs at least 2 positive samples")

        if negative_embeddings is None:
            raise ValueError(
                "Must provide negative_embeddings. Use get_negative_coords() "
                "to generate coordinates, then sample from mosaic."
            )

        # Combine positives and negatives
        X = np.vstack([positive_embeddings, negative_embeddings])
        y = np.array([1] * len(positive_embeddings) + [0] * len(negative_embeddings))

        # Adjust k based on sample size
        k = min(self.n_neighbors, len(X) // 2)
        k = max(1, k)

        # Build pipeline with scaling
        self._model = Pipeline([
            ("scaler", StandardScaler()),
            ("knn", KNeighborsClassifier(n_neighbors=k, weights="distance"))
        ])
        self._model.fit(X, y)

    def get_negative_coords(self) -> list[tuple[float, float]]:
        """Generate negative coordinates based on spatial context."""
        if self._positive_coords is None:
            raise ValueError("Must call set_spatial_context() first")
        n_negatives = len(self._positive_coords) * self.negative_ratio
        return self._generate_negatives(n_negatives)

    def predict(
        self,
        all_embeddings: np.ndarray,
        batch_size: int = 15000
    ) -> np.ndarray:
        """Predict probability of positive class for all embeddings."""
        if self._model is None:
            raise ValueError("Must call fit() first")

        n_samples = len(all_embeddings)
        probabilities = np.zeros(n_samples, dtype=np.float32)

        for i in tqdm(range(0, n_samples, batch_size), desc="Classifying"):
            end = min(i + batch_size, n_samples)
            batch = all_embeddings[i:end]
            probs = self._model.predict_proba(batch)
            probabilities[i:end] = probs[:, 1]  # Probability of positive class

        return probabilities

    @property
    def description(self) -> str:
        return f"KNN classifier (k={self.n_neighbors}, {self.negative_ratio}x negatives)"


def get_method(name: str, **kwargs) -> PredictionMethod:
    """Factory function to get a prediction method by name."""
    methods = {
        "similarity": SimilarityMethod,
        "classifier": ClassifierMethod,
    }
    if name not in methods:
        raise ValueError(f"Unknown method: {name}. Available: {list(methods.keys())}")
    return methods[name](**kwargs)
