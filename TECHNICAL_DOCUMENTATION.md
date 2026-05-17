# Tree Inventory & Carbon Dashboard — Technical Documentation

## System Overview

The Tree Inventory & Carbon Dashboard is a web-based Decision Support System (DSS) developed for the Municipal Environment and Natural Resources Office (MENRO) of Santa Cruz, Laguna. It provides real-time spatial visualization, task management, biodiversity analytics, and regulatory document generation for urban tree inventory management.

The system operates as a companion platform to a mobile field application used by arborists, forming a complete end-to-end workflow from field data capture to administrative decision-making.

---

## Technology Stack

### Frontend (Web Application)

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI component library |
| Vite | 5.4.8 | Build tool and development server |
| React Router DOM | 6.26.2 | Client-side routing and navigation |
| Tailwind CSS | 3.4.13 | Utility-first CSS framework |
| Leaflet | 1.9.4 | Interactive map rendering engine |
| React-Leaflet | 4.2.1 | React bindings for Leaflet |
| Recharts | (latest) | Data visualization (pie charts, bar charts) |
| ExcelJS | (latest) | Excel workbook generation |
| File-Saver | (latest) | Client-side file download trigger |
| qrcode.react | 4.2.0 | QR code SVG generation |
| Lucide React | 0.445.0 | Icon library |
| PropTypes | 15.8.1 | Runtime type checking |

### Backend-as-a-Service

| Service | Purpose |
|---|---|
| Supabase (PostgreSQL) | Database, authentication, real-time subscriptions |
| Cloudinary | Image hosting and delivery (tree photos, documents) |

### Testing Framework

| Technology | Purpose |
|---|---|
| Vitest | 2.1.2 | Test runner |
| React Testing Library | 16.0.1 | Component testing |
| fast-check | 4.7.0 | Property-based testing |
| jsdom | 25.0.1 | Browser environment simulation |

---

## Database Architecture (Supabase)

### Table: `trees`

The primary data table storing all inventoried tree records.

| Column | Type | Description |
|---|---|---|
| id | text (PK) | Unique identifier (UUID) |
| created_at | timestamptz | Record creation timestamp |
| dateCaptured | text | ISO-8601 capture timestamp from mobile |
| latitude | float8 | GPS latitude coordinate |
| longitude | float8 | GPS longitude coordinate |
| species | text | Common name of the tree species |
| scientific_name | text | Latin binomial nomenclature |
| dbh | text | Diameter at Breast Height (cm) |
| heightClass | text | Height classification (Short/Medium/Tall) |
| isLeaning | boolean | Hazard flag: tree is leaning |
| hasPowerlineConflict | boolean | Hazard flag: powerline interference |
| isDecayed | boolean | Hazard flag: visible decay |
| isRootProblem | boolean | Hazard flag: root system issues |
| assigned_to | text | Email of assigned arborist (null = unassigned) |
| has_cutting_permit | boolean | Whether a cutting permit has been issued |
| task_status | text | Workflow status (Pending/Acknowledged/Executed/Cancelled/Cut) |
| photo_url | text | Main tree photo URL (Cloudinary) |
| leaves_url | text | Leaves photo URL |
| bark_url | text | Bark photo URL |
| fruits_url | text | Fruits/seeds photo URL |
| imageUrl | text | Alternative image URL field |
| leaning_photos | jsonb | Array of hazard evidence photos (leaning) |
| powerline_photos | jsonb | Array of hazard evidence photos (powerline) |
| decayed_photos | jsonb | Array of hazard evidence photos (decay) |
| root_photos | jsonb | Array of hazard evidence photos (root) |
| tree_id | text | Human-readable tag ID (bound to QR code) |
| tree_category | text | Classification (Fruit Trees/Timber Trees/Ornamental Trees) |
| biodiversity_status | text | Endemic or Invasive |
| stem_quality | text | Code 1, 2, or 3 |
| merchantable_height | text | Merchantable height in meters |
| total_height | text | Total height in meters |
| barangay | text | Barangay location |
| is_tagged | boolean | Whether the tree has been physically tagged |
| sync_status | boolean | Mobile-to-cloud sync status |

### Table: `arborists`

Field team personnel who can be assigned tasks.

| Column | Type | Description |
|---|---|---|
| id | int8 (PK) | Auto-increment identifier |
| created_at | timestamptz | Record creation timestamp |
| name | text | Full name of the arborist |
| email | text | Email address (used for task assignment) |
| contact_number | int8 | Contact phone number |
| status | text | Account status (Active/Offline/Revoked) |

### Table: `profiles`

Mirrors `auth.users` for registered system users (web dashboard users).

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | References auth.users(id) |
| email | text | User email |
| full_name | text | Display name |
| created_at | timestamptz | Registration timestamp |

### Table: `permits`

Cutting permit records (both system-generated and walk-in).

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated identifier |
| tree_id | text | Reference to trees.id (null for walk-ins) |
| client_name | text | Permit applicant name |
| contact_info | text | Applicant contact details |
| reason | text | Reason for cutting request |
| requirements_urls | jsonb | Array of uploaded document URLs |
| species | text | Tree species (for walk-in permits) |
| number_of_trees | integer | Quantity of trees (DENR requirement) |
| address | text | Location address |
| latitude | float8 | GPS latitude |
| longitude | float8 | GPS longitude |
| status | text | Permit status (Pending/Cut) |
| created_at | timestamptz | Issuance timestamp |

### Table: `walkin_requests`

Public walk-in service requests.

| Column | Type | Description |
|---|---|---|
| id | int8 (PK) | Auto-increment identifier |
| client_name | text | Requestor name |
| contact_info | text | Contact details |
| reason | text | Purpose of request |
| latitude | text | Location latitude |
| longitude | text | Location longitude |

### Database Trigger: `on_auth_user_created`

Automatically inserts a row into `public.profiles` when a new user signs up via Supabase Auth, capturing their email and full name from user metadata.

---

## Cloudinary Integration

| Configuration | Value |
|---|---|
| Upload Preset | `tree_inventory_mobile` (unsigned) |
| API Endpoint | `https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload` |
| Usage | Tree photos, hazard evidence, permit requirement documents |

Images are uploaded from both the mobile application (field captures) and the web dashboard (permit requirements). URLs are stored in the respective Supabase columns.

---

## Authentication System

- **Provider**: Supabase Auth (email + password)
- **Login**: Email and password authentication
- **Sign-up**: Email + password with email confirmation (OTP verification)
- **Password Reset**: Email-based reset link via `supabase.auth.resetPasswordForEmail`
- **Session Management**: `supabase.auth.onAuthStateChange` listener
- **Route Protection**: All dashboard routes require active session; unauthenticated users redirect to `/login`
- **Arborist Onboarding**: Web admin creates auth accounts for field arborists via `supabase.auth.signUp`

---

## Real-Time Communication

### WebSocket Subscription (Supabase Realtime)

The Command Center map subscribes to live database changes:

```javascript
supabase.channel('custom-all-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, callback)
  .subscribe()
```

- **UPDATE events**: Replace the matching tree in local state (instant pin color change)
- **INSERT events**: Append new trees to the map
- **Cleanup**: `supabase.removeChannel(channel)` on component unmount

This enables real-time synchronization between the mobile app and web dashboard without page refresh.

---

## Feature Modules

### 1. Command Center (Main Dashboard / Map View)

- Interactive OpenStreetMap with color-coded tree pins
- Pin color classification (strict precedence):
  - 🔴 Red: Hazard detected, unassigned (Action Required)
  - 🟠 Orange: Hazard detected, arborist assigned (Dispatched)
  - 🟡 Yellow: No hazard, cutting permit issued
  - 🟢 Green: Healthy tree (default)
- GeoJSON boundary mask (inverted polygon) highlighting Santa Cruz municipality
- Multiple tile layers: Street Map, Satellite Imagery, Topographic Terrain
- Urban Heat Island (UHI) visualization: DBH-proportional cooling shade circles
- Biodiversity Map mode: Category-colored pins with Endemic/Invasive indicators
- Flyby navigation (smooth animated return to center)
- Tree popup with image carousel, details, dispatch, and permit actions
- Dispatch Modal: Lists arborists with pending task counts
- Real-time stat cards: Total Trees Tagged, Estimated Carbon, Critical Hazards
- "View on Map" integration from Inventory/Action Board (auto-fly + popup open)

### 2. Action Board

Three sub-tabs:

**Hazard Management & Permits**
- Card-based grid of hazardous trees
- Dispatch/Re-assign buttons opening arborist selection modal
- Issue Permit button opening the full permit modal
- Photo carousel thumbnails (main + hazard evidence photos)
- "View on Map" navigation per card

**Public Walk-in Requests**
- Two-column form: Tree/Location details + Client/Upload details
- Species dropdown (Top 10 Laguna trees with scientific names)
- Interactive mini-map for coordinate pinning (click-to-drop marker)
- Cloudinary file upload dropzone
- Certificate of No Objection auto-generation and print

**Permit Logs**
- Searchable, filterable, paginated data table (50 records/page)
- Date range filtering, address/barangay filtering
- Requirement document thumbnails with lightbox
- Certificate reprint functionality
- Excel export

### 3. Biodiversity Hub (formerly Inventory)

Two sub-tabs:

**Inventory**
- Master data table: Photo, Tree ID, Species, DBH, MH, TH, Coordinates, Category, Stem Quality, Date
- Search, sortable columns, photo lightbox
- Hazard indicator pills with evidence photo links
- Row click → "View on Map" prompt
- Blank QR Tag batch generator (credit-card sized, print-ready)

**Carbon Sink & Biodiversity (Analytics)**
- Pie Chart: Endemic vs. Invasive species count
- Pie Chart: Tree Category breakdown (Fruit/Timber/Ornamental)
- Bar Chart: Sequestration Potential (kg) by Barangay (dual Y-axis with tree count)
- All 26 Santa Cruz barangays represented

**Export Engine**
- Dual-sheet MENRO Excel template (.xlsx):
  - Sheet 1: "Tree Inventory Sheet" — official DENR format with officer name, date, stem quality guide
  - Sheet 2: "Biodiversity and Sink" — Endemic/Invasive totals, category totals, barangay summary with sequestration data

### 4. Arborists Management

- Create Arborist Account (creates both Supabase Auth account + arborists table entry)
- Field Team table: Name, Email, Contact, Tasks Assigned count, Declined count, Status
- Delete with cascade (unassigns all trees, reverts to Pending)
- Registered System Users table (from profiles/auth.users)

### 5. Issue Permit Modal

- Two-column layout: Tree Identity card (read-only) + Citizen Input Form
- Cloudinary file upload dropzone for requirements
- Full pipeline: Upload → permits INSERT → trees UPDATE → Certificate print
- Form validation (all fields required)

### 6. Certificate of No Objection (Print Engine)

- Print-only component (hidden on screen, visible during `window.print()`)
- Official DENR template format:
  - Republic of the Philippines header with LGU logo placeholders
  - "CERTIFICATE OF NO OBJECTION" title
  - Legal body text with dynamic tree data interpolation
  - Municipal Mayor signature line
- Supports both existing tree permits and walk-in requests
- Dynamic tree count text ("single standing" vs. "N standing")

### 7. QR Tag Batch Generator

- Generates N random 8-character alphanumeric IDs
- Print-ready credit-card sized stickers (85.6mm × 53.98mm)
- Dashed cut guides for A4 sticker paper
- QR code + MENRO branding per tag
- IDs designed to be bound to trees in the field via mobile app

---

## Spatial Data & GIS Features

- **Base Map**: OpenStreetMap tiles (default), Esri Satellite, OpenTopoMap
- **Boundary Mask**: GeoJSON-based inverted polygon (Santa Cruz municipality boundary)
- **Coordinate System**: WGS84 (EPSG:4326) — latitude/longitude decimal degrees
- **Map Center**: LSPU Santa Cruz Main Campus (14.2623, 121.3976)
- **Default Zoom**: Level 17 (street-level detail)
- **Pin Rendering**: Leaflet DivIcon with CSS-styled circular markers (26px diameter)
- **UHI Visualization**: Rectangle heat base + per-tree Circle cooling nodes (radius proportional to DBH)

---

## Security & Access Control

- Row Level Security (RLS): Currently disabled on trees/arborists tables for development
- Authentication required for all dashboard routes
- Service role key NOT exposed client-side (arborist creation uses client-side signUp with email confirmation)
- Environment variables for sensitive configuration (Supabase URL, keys, Cloudinary cloud name)

---

## Deployment & Build

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server (Vite) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run test` | Run test suite (Vitest) |

### Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
```

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Dashboard (React)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │Command   │ │Action    │ │Biodiver- │ │Arborists     │   │
│  │Center    │ │Board     │ │sity Hub  │ │Management    │   │
│  │(Map)     │ │          │ │          │ │              │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       │             │            │               │           │
│       └─────────────┴────────────┴───────────────┘           │
│                          │                                    │
└──────────────────────────┼────────────────────────────────────┘
                           │ HTTPS / WebSocket
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Supabase (BaaS)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │PostgreSQL│ │Auth      │ │Realtime  │ │Storage       │   │
│  │Database  │ │(JWT)     │ │(WebSocket│ │(Optional)    │   │
│  │          │ │          │ │Channels) │ │              │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Cloudinary (CDN)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Image Upload & Delivery (tree photos, documents)      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Mobile Application (Companion)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │Tree      │ │Photo     │ │QR Tag    │ │Task          │   │
│  │Capture   │ │Upload    │ │Binding   │ │Management    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Algorithms

### Pin Color Classification (Strict Precedence)

```javascript
const isHazard = tree.isLeaning || tree.hasPowerlineConflict || 
                 tree.isDecayed || tree.isRootProblem;

if (isHazard && !tree.assigned_to) return 'Red';      // Action Required
else if (isHazard && tree.assigned_to) return 'Orange'; // Dispatched
else if (tree.has_cutting_permit) return 'Yellow';      // Permit Issued
else return 'Green';                                    // Healthy
```

### Carbon Sequestration Estimate

```javascript
// Simplified model: 62.47 kg CO₂ per tree (average)
const sequestration = numberOfTrees * 62.47;
```

### UHI Cooling Shade Radius (DBH-proportional)

```javascript
// DBH in cm → canopy radius in meters
const canopyRadius = Math.min(Math.max(dbhValue * 0.8, 15), 80);
```

### Tree Volume Calculation

```javascript
// Cylindrical approximation: π/4 × (DBH/100)² × MH
const volume = (Math.PI / 4) * Math.pow(dbh / 100, 2) * merchantableHeight;
```

---

## Outputs & Deliverables

1. **Interactive GIS Map** — Real-time spatial visualization of tree inventory
2. **Hazard Dispatch System** — Task assignment with WebSocket notifications
3. **Certificate of No Objection** — Auto-generated official document (print-ready)
4. **MENRO Excel Report** — Dual-sheet DENR-compliant inventory and biodiversity report
5. **Permit Logbook** — Searchable, exportable record of all cutting permits
6. **QR Tag Batch Printer** — Physical tag generation for field deployment
7. **Biodiversity Analytics** — Pie charts and bar charts for species distribution and carbon sink data
8. **Urban Heat Island Map** — DBH-proportional cooling shade visualization

---

## Target Users

| Role | Access | Functions |
|---|---|---|
| MENRO Admin | Web Dashboard | Full system access, dispatch, permits, analytics |
| Field Arborist | Mobile Application | Tree capture, photo upload, task execution |
| Public Citizen | Walk-in counter | Permit application (via MENRO staff) |

---

## Geographic Scope

- **Municipality**: Santa Cruz (Capital), Laguna, Philippines
- **Province**: Laguna
- **Region**: Region IV-A (CALABARZON)
- **Reference Barangays**: 26 barangays (Alipit through Santo Angel Sur)
- **Primary Site**: Laguna State Polytechnic University — Santa Cruz Main Campus

---

*Document generated from the Tree Inventory & Carbon Dashboard v1.0 Release Candidate.*
*System developed using AI-assisted development with Kiro IDE.*
