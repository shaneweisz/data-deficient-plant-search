"""Generate distribution plots for plant species occurrence data."""

import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("../app/public/plant_species_counts.csv")
counts = df["occurrence_count"]

fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 1. Log histogram of all species
ax1 = axes[0, 0]
ax1.hist(counts, bins=100, log=True, edgecolor="black", alpha=0.7)
ax1.set_xlabel("Occurrence Count")
ax1.set_ylabel("Number of Species (log scale)")
ax1.set_title("Distribution of Occurrence Counts (All Species)")
ax1.set_xscale("log")

# 2. Cumulative distribution
ax2 = axes[0, 1]
sorted_counts = counts.sort_values().values
cumulative = range(1, len(sorted_counts) + 1)
ax2.plot(sorted_counts, cumulative)
ax2.set_xlabel("Occurrence Count")
ax2.set_ylabel("Cumulative Number of Species")
ax2.set_title("Cumulative Distribution")
ax2.set_xscale("log")
ax2.grid(True, alpha=0.3)

# 3. Focus on data-deficient species (<=100 occurrences)
ax3 = axes[1, 0]
data_deficient = counts[counts <= 100]
ax3.hist(data_deficient, bins=50, edgecolor="black", alpha=0.7, color="orange")
ax3.set_xlabel("Occurrence Count")
ax3.set_ylabel("Number of Species")
ax3.set_title(f"Data-Deficient Species (≤100 occurrences, n={len(data_deficient):,})")

# 4. Pie chart of data categories
ax4 = axes[1, 1]
categories = [
    ("1 occurrence", (counts == 1).sum()),
    ("2-10 occurrences", ((counts > 1) & (counts <= 10)).sum()),
    ("11-100 occurrences", ((counts > 10) & (counts <= 100)).sum()),
    ("101-1000 occurrences", ((counts > 100) & (counts <= 1000)).sum()),
    (">1000 occurrences", (counts > 1000).sum()),
]
labels, sizes = zip(*categories)
colors = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7"]
ax4.pie(sizes, labels=labels, autopct="%1.1f%%", colors=colors, startangle=90)
ax4.set_title("Species by Occurrence Count Category")

plt.tight_layout()
plt.savefig("plant_species_distribution_plots.png", dpi=150, bbox_inches="tight")
print("Saved plant_species_distribution_plots.png")
