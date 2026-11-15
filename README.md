# 🌍 FIELD SHIFT — Earth Intelligence for Resilient Farming

<p align="center">

**Turning Earth's Data into Smarter Farming Decisions**

A NASA Earth-observation-powered agricultural decision-support platform for climate-resilient farming, intelligent crop rotation and sustainable agriculture.

</p>

---

## 🚀 Project Overview

**FIELD SHIFT** is an intelligent agricultural decision-support platform that integrates NASA Earth observation datasets, satellite imagery, geospatial technologies, climate analysis and Artificial Intelligence to help farmers make informed agricultural decisions.

Agriculture is increasingly affected by unpredictable rainfall, rising temperatures, water scarcity, soil degradation and changing climatic conditions.

FIELD SHIFT addresses these challenges by transforming complex environmental and satellite data into understandable, farm-level insights.

The platform enables farmers to explore their farmland, monitor vegetation conditions, understand regional soil-moisture and rainfall patterns, compare crop rotation strategies and investigate potential climate scenarios.

Our goal is to bridge the gap between **Earth observation technology and practical agricultural decision-making.**

## 🎯 Problem Statement

Farmers face several challenges when planning agricultural activities:

- Unpredictable rainfall and changing monsoon patterns.
- Increasing water scarcity and irrigation requirements.
- Soil degradation due to unsustainable cultivation practices.
- Difficulty interpreting satellite and environmental datasets.
- Limited access to location-specific agricultural intelligence.
- Uncertainty when selecting suitable crop rotation strategies.

Traditional farming decisions often depend on historical experience and available local information. However, changing environmental conditions require more data-informed approaches.

## 💡 Our Solution

FIELD SHIFT combines multiple Earth-observation datasets and agricultural analysis tools into one integrated platform.

It provides:

- Interactive 2D and 3D Earth exploration.
- Satellite imagery and environmental data visualization.
- Farm boundary drawing and zone management.
- Vegetation health monitoring using NDVI.
- Soil-moisture and rainfall intelligence.
- AI-assisted crop rotation comparison.
- Climate scenario simulation.
- 3D agricultural digital twin visualization.
- AI-powered agricultural assistance.
- Farm analytics and report generation.

## 🛰️ NASA and Earth Observation Data Sources

FIELD SHIFT integrates multiple environmental datasets to understand agricultural conditions.

| Dataset | Information | Agricultural application |
|---|---|---|
| NASA POWER | Meteorological and solar data | Weather and climate analysis |
| NASA SMAP | Soil-moisture products | Regional soil-water assessment |
| NASA GPM | Precipitation estimates | Rainfall monitoring |
| NASA MODIS | Vegetation and surface-reflectance products | Vegetation monitoring |
| Copernicus Sentinel-2 | Multispectral satellite imagery | Vegetation analysis and NDVI |
| Esri World Imagery | Satellite basemap | Farm visualization and mapping |
| Elevation services | Terrain and elevation information | 3D terrain visualization |

### Why these datasets?

Different datasets provide different environmental information.

Combining them helps FIELD SHIFT build a broader understanding of the conditions that influence agricultural decisions.

**Data transparency:** Every dataset should be interpreted according to its spatial resolution, observation date, units and limitations. Regional satellite products should not be presented as precise measurements of every individual farm.

## ⚙️ Key Features

### 1. 🌎 Interactive Earth Explorer

An interactive geospatial environment that allows users to explore farmland and environmental conditions.

Features:
- Interactive 2D mapping.
- 3D Earth visualization.
- Satellite imagery.
- Scientific data layers.
- Geographic coordinate inspection.
- Farm location selection.
- Terrain visualization.

**Technology:** MapLibre GL JS and CesiumJS.

### 2. 🗺️ Farm Boundary and Zone Management

Users can identify agricultural land by drawing or selecting farm boundaries on the map.

Features:
- Create and manage farm parcels.
- Draw and edit polygon boundaries.
- Add and remove polygon vertices.
- Calculate farm area and perimeter.
- Identify geographic coordinates and centroids.
- Divide farms into individual management zones.
- Manage multiple farms.

**Technology:** GeoJSON and geospatial processing.

**Benefit:** Helps farmers organize their agricultural land and manage different field zones independently.

### 3. 🌱 NDVI Vegetation Health Monitoring

FIELD SHIFT uses satellite imagery to derive vegetation indicators.

NDVI stands for Normalized Difference Vegetation Index.

Formula:

`NDVI = (NIR - RED) / (NIR + RED)`

Where:
- NIR = Near Infrared reflectance.
- RED = Red-band reflectance.

NDVI helps identify differences in vegetation greenness and monitor changes over time.

**Benefit:** Helps farmers identify areas that may require closer field inspection.

### 4. 💧 Soil Moisture and Rainfall Intelligence

Integrates available SMAP and GPM products with meteorological information.

Capabilities:
- Regional soil-moisture assessment.
- Rainfall monitoring.
- Precipitation trend analysis.
- Water availability context.
- Potential water-stress assessment.

**Benefit:** Supports more informed irrigation and crop-planning decisions.

### 5. 🌾 AI Crop Rotation Intelligence

One of the central capabilities of FIELD SHIFT.

The crop rotation engine compares different agricultural strategies.

It considers available information such as:
- Crop characteristics.
- Soil properties.
- Water requirements.
- Weather conditions.
- Nitrogen-related crop properties.
- Farmer priorities.

It can compare:

1. Current crop rotation.
2. Alternative crop rotation.
3. Climate-resilient crop rotation.

Comparison parameters include:
- Water demand.
- Nitrogen balance.
- Soil carbon estimates.
- Crop diversity.
- Planting windows.
- Potential agricultural risks.
- Uncertainty.

**Benefit:** Helps farmers explore alternative crop sequences and understand their possible environmental and agricultural trade-offs.

### 6. 🌦️ Climate Future Simulator

Allows users to explore hypothetical environmental scenarios.

Scenarios may include:
- Increased temperatures.
- Reduced rainfall.
- Delayed monsoon.
- Longer dry spells.
- Increased irrigation demand.

**Benefit:** Helps farmers investigate how alternative environmental conditions could influence agricultural resilience.

*Scenario outputs are simulations, not exact future weather predictions.*

### 7. 🌳 3D Agricultural Digital Twin

Provides a three-dimensional representation of agricultural land.

Visualization capabilities include:
- Geographic terrain.
- Farm boundaries.
- Individual management zones.
- Crop canopy representations.
- Environmental indicators.
- Agricultural visualization layers.

**Technology:** CesiumJS and Three.js.

**Benefit:** Makes spatial agricultural information easier to explore and understand.

### 8. 🤖 AI Agronomist

An AI-assisted agricultural information system powered by the Gemini API.

Users can ask questions about:
- Crop rotation strategies.
- Vegetation indicators.
- Rainfall patterns.
- Environmental conditions.
- Agricultural risks.
- Available farm information.

The system uses available farm context to generate explanations and agricultural insights.

**Benefit:** Helps translate complex environmental information into understandable language.

AI-generated recommendations require validation using local field measurements and agricultural expertise.

### 9. 📊 Farmer Command Center

A centralized farm-management and decision-support interface.

Potential capabilities include:
- Farm overview.
- Crop calendar.
- Farm health indicators.
- Irrigation insights.
- Soil sampling planner.
- Crop rotation schedules.
- Agricultural reports.

### 10. 📄 Reports and Data Export

Provides ways to preserve and share agricultural analysis.

Supported or planned output formats include:
- PDF.
- CSV.
- JSON.

Reports can summarize available farm properties, environmental indicators, crop rotation comparisons and climate scenarios.

---

## 🔄 How FIELD SHIFT Works

The platform follows a farm-level data-processing workflow.

```text
       FARM SELECTION
             |
             v
      DRAW FARM BOUNDARY
             |
             v
    GEOSPATIAL PROCESSING
             |
             v
     SATELLITE DATA ACCESS
             |
             v
     ENVIRONMENTAL ANALYSIS
             |
             v
      CROP ROTATION ENGINE
             |
             v
      CLIMATE SIMULATION
             |
             v
       AI AGRONOMIST
             |
             v
    FARM DECISION SUPPORT
             |
             v
      REPORT GENERATION
```

### Workflow explanation

1. **Farm identification:** The user selects a geographic location or draws a farm boundary.
2. **Geospatial processing:** The application calculates the farm's geographic properties.
3. **Data retrieval:** Available satellite and environmental datasets are accessed using the selected farm's location.
4. **Environmental analysis:** The platform processes available vegetation, rainfall and weather information.
5. **Crop rotation analysis:** Alternative crop sequences are compared using available agricultural parameters.
6. **Climate simulation:** Users explore hypothetical environmental scenarios.
7. **AI assistance:** The AI Agronomist explains available farm information and possible decisions.
8. **Decision support:** The farmer reviews the analysis and can share or export results.

---

## 🧑‍💻 Technology Stack

FIELD SHIFT is developed using modern frontend, backend, geospatial and AI technologies.

### Programming Languages

| Language | Purpose |
|---|---|
| TypeScript | Main application logic and type-safe frontend development |
| JavaScript | Interactive application functionality |
| HTML5 | Web application structure |
| CSS | Styling and responsive design |
| SQL | Relational data storage, where configured |

### Frameworks and Libraries

| Technology | Purpose |
|---|---|
| React | Component-based user interface |
| Vite | Frontend development and build tooling |
| Tailwind CSS | Responsive styling |
| Node.js | Backend runtime |
| Express.js | HTTP API services, if configured |
| MapLibre GL JS | Interactive 2D geospatial maps |
| CesiumJS | 3D Earth and geographic visualization |
| Three.js | 3D agricultural visualizations |
| GeoJSON | Geographic data representation |
| Gemini API | AI-powered agricultural assistance |
| PostgreSQL / PostGIS | Relational and spatial database, if configured |

### External Data Services

- NASA POWER.
- NASA GIBS / Earth-observation services.
- NASA SMAP.
- NASA GPM.
- NASA MODIS.
- Copernicus Sentinel-2 data services.
- Esri World Imagery.
- Elevation and terrain services.

---

## 🏗️ System Architecture

FIELD SHIFT follows a full-stack application architecture.

```text
+--------------------------------------+
|             USER INTERFACE           |
|                                      |
| React + TypeScript + Tailwind CSS    |
| Dashboard | Maps | Analytics | AI    |
+------------------+-------------------+
                   |
                   v
+--------------------------------------+
|             BACKEND LAYER            |
|                                      |
| Node.js | API Services | Processing  |
+------------------+-------------------+
                   |
          +--------+---------+
          |                  |
          v                  v
+-------------------+  +------------------+
| EARTH DATA SERVICES|  | AI SERVICES      |
|                   |  |                  |
| NASA POWER        |  | Gemini API       |
| SMAP              |  | Farm Context     |
| GPM               |  | AI Advisory      |
| MODIS             |  |                  |
| Sentinel-2        |  +------------------+
+-------------------+
          |
          v
+--------------------------------------+
|       AGRICULTURAL INTELLIGENCE      |
|                                      |
| NDVI | Crop Rotation | Climate       |
| Geospatial Analysis | Reports        |
+--------------------------------------+
```

---

## 🌍 Expected Impact on Farmers

| Agricultural challenge | FIELD SHIFT capability | Expected benefit |
|---|---|---|
| Uncertain crop conditions | Satellite vegetation monitoring | Identify areas requiring inspection |
| Water scarcity | Rainfall and soil-moisture intelligence | Better-informed water planning |
| Repeated crop cultivation | Crop rotation comparison | Explore diversified crop sequences |
| Changing climate | Climate scenario simulator | Understand potential climate risks |
| Complex environmental data | AI Agronomist | Easier interpretation |
| Large agricultural properties | Farm zone management | Better farm organization |

FIELD SHIFT aims to support sustainable farming, improve environmental awareness and encourage climate-resilient agricultural planning.

---

## 🔬 Scientific Considerations and Limitations

FIELD SHIFT is a decision-support platform, not a replacement for direct field measurements or professional agronomic advice.

Important considerations:

- Satellite datasets have different spatial resolutions and update frequencies.
- SMAP and GPM products may be too coarse for precise analysis of small farm parcels.
- NDVI indicates vegetation greenness but does not independently diagnose crop diseases.
- Satellite data does not directly provide complete soil nutrient measurements.
- Soil carbon and nitrogen outputs may be model-based estimates.
- Climate simulator outputs represent hypothetical scenarios.
- Crop rotation recommendations require local agricultural validation.

Future development should incorporate laboratory soil measurements, local crop-yield records and field-trial data.

---

## 🚀 Future Scope

Planned improvements include:

- More localized agricultural datasets for Indian states.
- Integration of laboratory soil-test results.
- Crop-specific and region-specific models.
- Improved farm-level water-demand estimation.
- Regional climate projection integration.
- Ground-based sensor integration.
- Historical crop-yield analysis.
- Mobile-friendly farmer experience.
- Kannada and other regional-language support.
- Validation with agricultural experts and field trials.

---

## 🎯 Project Objective

Our mission is to make Earth-observation intelligence accessible and useful for agriculture.

By combining NASA datasets, geospatial technologies, climate analysis and Artificial Intelligence, FIELD SHIFT aims to help farmers understand environmental changes and explore more resilient agricultural strategies.

**FIELD SHIFT — Turning Earth's Data into Smarter Farming Decisions.**

---

## 👥 Project Information

**Project:** FIELD SHIFT — Earth Intelligence for Resilient Farming

**Challenge:** NASA Space Apps Challenge 2026

**Domain:** Agriculture | Earth Science | Remote Sensing | Artificial Intelligence | Climate Resilience

**Application Type:** Full-stack geospatial web application

**Developed for:** Climate-aware agricultural decision support

---

## 📚 Data and Technology References

- [NASA POWER](https://power.larc.nasa.gov/)
- [NASA Earthdata](https://www.earthdata.nasa.gov/)
- [NASA GIBS](https://www.earthdata.nasa.gov/data/tools/gibs)
- [NASA SMAP](https://smap.jpl.nasa.gov/)
- [NASA Global Precipitation Measurement](https://gpm.nasa.gov/)
- [Copernicus Sentinel-2](https://dataspace.copernicus.eu/)
- [MapLibre](https://maplibre.org/)
- [CesiumJS](https://cesium.com/platform/cesiumjs/)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)

---

<p align="center">

**FIELD SHIFT**

*Explore our planet. Understand changing conditions. Build more resilient farms.*

</p>
