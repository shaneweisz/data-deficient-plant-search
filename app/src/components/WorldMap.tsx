"use client";

import React, { useState, memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

// Using the recommended TopoJSON from react-simple-maps
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Country name (from TopoJSON) to ISO 3166-1 alpha-2 mapping for GBIF
const NAME_TO_ALPHA2: Record<string, string> = {
  "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Angola": "AO", "Argentina": "AR",
  "Armenia": "AM", "Australia": "AU", "Austria": "AT", "Azerbaijan": "AZ", "Bangladesh": "BD",
  "Belarus": "BY", "Belgium": "BE", "Benin": "BJ", "Bhutan": "BT", "Bolivia": "BO",
  "Bosnia and Herz.": "BA", "Botswana": "BW", "Brazil": "BR", "Brunei": "BN", "Bulgaria": "BG",
  "Burkina Faso": "BF", "Burundi": "BI", "Cambodia": "KH", "Cameroon": "CM", "Canada": "CA",
  "Central African Rep.": "CF", "Chad": "TD", "Chile": "CL", "China": "CN", "Colombia": "CO",
  "Congo": "CG", "Dem. Rep. Congo": "CD", "Costa Rica": "CR", "Côte d'Ivoire": "CI",
  "Croatia": "HR", "Cuba": "CU", "Cyprus": "CY", "Czechia": "CZ", "Denmark": "DK",
  "Djibouti": "DJ", "Dominican Rep.": "DO", "Ecuador": "EC", "Egypt": "EG", "El Salvador": "SV",
  "Eq. Guinea": "GQ", "Eritrea": "ER", "Estonia": "EE", "eSwatini": "SZ", "Ethiopia": "ET",
  "Fiji": "FJ", "Finland": "FI", "France": "FR", "Gabon": "GA", "Gambia": "GM", "Georgia": "GE",
  "Germany": "DE", "Ghana": "GH", "Greece": "GR", "Greenland": "GL", "Guatemala": "GT",
  "Guinea": "GN", "Guinea-Bissau": "GW", "Guyana": "GY", "Haiti": "HT", "Honduras": "HN",
  "Hungary": "HU", "Iceland": "IS", "India": "IN", "Indonesia": "ID", "Iran": "IR", "Iraq": "IQ",
  "Ireland": "IE", "Israel": "IL", "Italy": "IT", "Jamaica": "JM", "Japan": "JP", "Jordan": "JO",
  "Kazakhstan": "KZ", "Kenya": "KE", "North Korea": "KP", "South Korea": "KR", "Kuwait": "KW",
  "Kyrgyzstan": "KG", "Laos": "LA", "Latvia": "LV", "Lebanon": "LB", "Lesotho": "LS",
  "Liberia": "LR", "Libya": "LY", "Lithuania": "LT", "Luxembourg": "LU", "Madagascar": "MG",
  "Malawi": "MW", "Malaysia": "MY", "Mali": "ML", "Mauritania": "MR", "Mexico": "MX",
  "Moldova": "MD", "Mongolia": "MN", "Montenegro": "ME", "Morocco": "MA", "Mozambique": "MZ",
  "Myanmar": "MM", "Namibia": "NA", "Nepal": "NP", "Netherlands": "NL", "New Zealand": "NZ",
  "Nicaragua": "NI", "Niger": "NE", "Nigeria": "NG", "Norway": "NO", "Oman": "OM",
  "Pakistan": "PK", "Panama": "PA", "Papua New Guinea": "PG", "Paraguay": "PY", "Peru": "PE",
  "Philippines": "PH", "Poland": "PL", "Portugal": "PT", "Puerto Rico": "PR", "Qatar": "QA",
  "Romania": "RO", "Russia": "RU", "Rwanda": "RW", "Saudi Arabia": "SA", "Senegal": "SN",
  "Serbia": "RS", "Sierra Leone": "SL", "Singapore": "SG", "Slovakia": "SK", "Slovenia": "SI",
  "Solomon Is.": "SB", "Somalia": "SO", "South Africa": "ZA", "S. Sudan": "SS", "Spain": "ES",
  "Sri Lanka": "LK", "Sudan": "SD", "Suriname": "SR", "Sweden": "SE", "Switzerland": "CH",
  "Syria": "SY", "Taiwan": "TW", "Tajikistan": "TJ", "Tanzania": "TZ", "Thailand": "TH",
  "Timor-Leste": "TL", "Togo": "TG", "Trinidad and Tobago": "TT", "Tunisia": "TN",
  "Turkey": "TR", "Turkmenistan": "TM", "Uganda": "UG", "Ukraine": "UA",
  "United Arab Emirates": "AE", "United Kingdom": "GB", "United States of America": "US",
  "Uruguay": "UY", "Uzbekistan": "UZ", "Vanuatu": "VU", "Venezuela": "VE", "Vietnam": "VN",
  "Yemen": "YE", "Zambia": "ZM", "Zimbabwe": "ZW", "Palestine": "PS", "Kosovo": "XK",
  "North Macedonia": "MK", "New Caledonia": "NC", "W. Sahara": "EH", "Fr. S. Antarctic Lands": "TF",
  "Falkland Is.": "FK",
};

// Reverse mapping: alpha-2 to country name for display
const ALPHA2_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_ALPHA2).map(([name, code]) => [code, name])
);

interface WorldMapProps {
  selectedCountry: string | null;
  onCountrySelect: (countryCode: string, countryName: string) => void;
  onClearSelection: () => void;
}

function WorldMap({ selectedCountry, onCountrySelect, onClearSelection }: WorldMapProps) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  return (
    <div className="relative">
      {/* Header with clear button */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Explore by Country
          </h2>
          <p className="text-sm text-zinc-500">
            {selectedCountry
              ? `Viewing: ${ALPHA2_TO_NAME[selectedCountry] || selectedCountry} · Click again to return to global`
              : "Click a country to filter by region"}
          </p>
        </div>
        {selectedCountry && (
          <button
            onClick={onClearSelection}
            className="px-3 py-1 text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Back to Global
          </button>
        )}
      </div>

      {/* Hover tooltip */}
      {hoveredCountry && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-zinc-800 px-3 py-1 rounded shadow-lg text-sm text-zinc-700 dark:text-zinc-300 pointer-events-none">
          {hoveredCountry}
        </div>
      )}

      {/* Map */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <ComposableMap
          projectionConfig={{
            scale: 120,
            center: [0, 20],
          }}
          height={300}
          style={{ width: "100%", height: "auto", maxHeight: "300px" }}
        >
          <ZoomableGroup>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const countryName = geo.properties.name;
                  const alpha2 = NAME_TO_ALPHA2[countryName];
                  const isSelected = selectedCountry === alpha2;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => setHoveredCountry(countryName)}
                      onMouseLeave={() => setHoveredCountry(null)}
                      onClick={() => {
                        if (alpha2) {
                          onCountrySelect(alpha2, countryName);
                        }
                      }}
                      style={{
                        default: {
                          fill: isSelected
                            ? "#22c55e"
                            : alpha2 ? "#e4e4e7" : "#f4f4f5",
                          stroke: "#a1a1aa",
                          strokeWidth: 0.5,
                          outline: "none",
                          cursor: alpha2 ? "pointer" : "default",
                        },
                        hover: {
                          fill: isSelected ? "#16a34a" : alpha2 ? "#a3e635" : "#f4f4f5",
                          stroke: "#71717a",
                          strokeWidth: 0.75,
                          outline: "none",
                          cursor: alpha2 ? "pointer" : "default",
                        },
                        pressed: {
                          fill: "#16a34a",
                          stroke: "#52525b",
                          strokeWidth: 1,
                          outline: "none",
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>
    </div>
  );
}

export default memo(WorldMap);
