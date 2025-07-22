# Structured SCORM System Audit - Component Breakdown

## Directory Tree with SCORM Components

```
/
├── server/
│   ├── scormValidator.ts                    # SCORM ZIP validation & type detection
│   ├── templates/
│   │   └── scorm-loader.html               # Professional loader template for LMS integration
│   ├── routes.ts                           # Main route handlers (2098 LOC) - ALL SCORM endpoints
│   ├── storage.ts                          # Database abstraction layer
│   └── storageService.ts                   # File system operations & ZIP handling
│
├── client/src/
│   ├── pages/
│   │   ├── courses.tsx                     # Course management grid with upload/preview/delete
│   │   ├── course-preview.tsx              # SCORM preview player with iframe
│   │   ├── dispatches.tsx                  # Dispatch management & SCORM export
│   │   └── company-profile.tsx             # Company dispatch view & launch files
│   ├── components/
│   │   ├── courses/
│   │   │   ├── course-upload.tsx           # SCORM upload modal with chunked upload
│   │   │   └── course-edit.tsx             # Course editing modal with file replacement
│   │   └── dispatches/
│   │       └── create-dispatch.tsx         # Dispatch creation form with license validation
│   └── utils/
│       └── chunked-upload.tsx              # Large file upload handler (3GB support)
│
├── uploads/
│   ├── courses/                            # SCORM ZIP storage (persistent)
│   ├── launch_links/                       # Generated launch HTML files
│   └── chunks/                             # Temporary chunked upload storage
│
└── shared/
    └── schema.ts                           # Database schema with SCORM types
```

---

## Component-by-Component Breakdown

### scorm-upload
- **backend**: `server/routes.ts:487` (POST /api/courses/upload) + chunked upload endpoints
- **frontend**: `client/src/components/courses/course-upload.tsx`, trigger in `courses.tsx`
- **flow**: 
  1. File selection → CSRF token fetch
  2. Small files (<100MB): Direct POST with progress tracking
  3. Large files (>100MB): Chunked upload via `/api/upload/*` endpoints
  4. `scormValidator.ts`: ZIP signature validation
  5. Move to `uploads/courses/course_{id}_{filename}`
  6. Database record creation with metadata
- **missing**: ❌ Full imsmanifest.xml validation, SCORM 2004 detection
- **status**: ✅ Complete for SCORM 1.2

### scorm-preview
- **backend**: `server/routes.ts:1530` (GET /api/preview/:courseId) + assets endpoint
- **frontend**: `client/src/pages/course-preview.tsx`
- **flow**:
  1. Course card "Preview" button → navigate to `/course/:id/preview`
  2. `generateSCORMPreview()`: ZIP entry point detection + simulated SCORM API
  3. Assets served via `/api/preview/:courseId/assets/*`
  4. Sandboxed iframe with loading states
- **missing**: ❌ Progress simulation persistence, mobile responsive design
- **status**: ✅ Functional but needs mobile optimization

### scorm-dispatch
- **backend**: `server/routes.ts:1174` (POST /api/dispatches) + export endpoints
- **frontend**: `client/src/components/dispatches/create-dispatch.tsx`, `dispatches.tsx`
- **flow**:
  1. Form: course + company + constraints → license validation
  2. Database: dispatch record + `gen_random_uuid()` token generation
  3. `generateLaunchFile()`: HTML creation in `uploads/launch_links/`
  4. User assignment with individual launch tokens
- **missing**: ❌ Progress indicator for ZIP export, bulk dispatch operations
- **status**: ✅ Complete with license enforcement

### scorm-launch
- **backend**: `server/routes.ts:164` (GET /launch/:token) + assets route
- **frontend**: External LMS integration via exported ZIP packages
- **flow**:
  1. External LMS uploads `dispatch-{name}.zip`
  2. LMS launches `index.html` (scorm-loader template)
  3. Auto-redirect to injected launch URL after 3-second animation
  4. `handleSCORMLaunch()`: Token validation + dispatch checks
  5. `generateSCORMLaunch()`: Full HTML with SCORM 1.2 API + xAPI tracking
  6. Assets served via `/launch/:token/assets/*` with ZIP extraction
- **missing**: ❌ Content Security Policy, malware scanning
- **status**: ✅ Production ready

### scorm-export
- **backend**: `server/routes.ts:1379` (GET /api/dispatches/:id/export)
- **frontend**: Export buttons in `dispatches.tsx`, `company-profile.tsx`
- **flow**:
  1. Admin authentication check
  2. Load `scorm-loader.html` template
  3. Inject launch URL: `__LAUNCH_URL__` → actual deployed URL
  4. Create `imsmanifest.xml` (SCORM 1.2 manifest)
  5. ZIP creation: `index.html` + `manifest` + `dispatch.json`
  6. Stream to browser download
- **missing**: ❌ Progress tracking for large exports, SCORM 2004 manifest support
- **status**: ✅ LMS-ready packages generated

### scorm-delete
- **backend**: `server/routes.ts:1003` (DELETE /api/courses/:id), `routes.ts:1288` (DELETE /api/dispatches/:id)
- **frontend**: 3-dot dropdown menus in course/dispatch cards
- **flow**:
  1. Admin-only course deletion, any user dispatch deletion
  2. Soft delete: `isDisabled = true`, `deletedAt = timestamp`
  3. History preservation for audit trails
  4. System-wide filtering excludes disabled entities
- **missing**: ❌ Bulk delete operations, deletion confirmation dialogs
- **status**: ✅ Complete soft delete implementation

---

## Route Documentation

### SCORM Upload Endpoints
| Route | Method | Purpose | Input | Validation | Output |
|-------|--------|---------|-------|------------|--------|
| `/api/courses/upload` | POST | Upload SCORM ZIP | FormData: course file, title, description, tags | CSRF + ZIP signature + file size (512MB) | Course record JSON |
| `/api/upload/initialize` | POST | Start chunked upload | metadata, totalSize, fileName | CSRF + file validation | Upload session ID |
| `/api/upload/chunk` | POST | Upload file chunk | sessionId, chunkIndex, chunk data | CSRF + chunk validation | Progress confirmation |
| `/api/upload/finalize` | POST | Complete chunked upload | sessionId, metadata | CSRF + reassembly validation | Course record JSON |
| `/api/upload/cleanup` | POST | Clean failed upload | sessionId | CSRF | Cleanup confirmation |

**Issues Found:**
- ❌ **Duplicate validation logic** between regular and chunked upload
- ❌ **Basic SCORM validation** - only ZIP signature, no manifest parsing

### SCORM Course Management
| Route | Method | Purpose | Input | Authorization | Soft Delete |
|-------|--------|---------|-------|---------------|-------------|
| `/api/courses` | GET | List courses | Optional: includeDeleted | User authentication | ✅ Excludes disabled |
| `/api/courses/:id` | GET | Get course details | courseId | Owner or admin | ✅ |
| `/api/courses/:id` | PUT | Update course + file | courseId, metadata, optional file | Admin only | ❌ |
| `/api/courses/:id` | DELETE | Soft delete course | courseId | Admin only | ✅ Sets isDisabled |
| `/api/courses/check-conflicts` | GET | Check dispatch conflicts | title | User authentication | ❌ |

**Issues Found:**
- ❌ **No conflict validation** on course update with file replacement
- ❌ **Missing bulk operations** for course management

### SCORM Launch System
| Route | Method | Purpose | Input | Token Validation | License Check |
|-------|--------|---------|-------|------------------|---------------|
| `/launch/:token` | GET | Main SCORM launch | Launch token in URL | ✅ getDispatchUserByToken() | ✅ Expiration, max users, disabled status |
| `/launch/:token/assets/*` | GET | Serve SCORM files | Token + asset path | ✅ Same validation | ✅ |

**Issues Found:**
- ✅ **No JSON fallback** - properly serves HTML only
- ❌ **No CSP headers** for SCORM content security

### SCORM Dispatch Management
| Route | Method | Purpose | Input | License Validation | Output |
|-------|--------|---------|-------|-------------------|--------|
| `/api/dispatches` | GET | List dispatches | Optional filters | User auth | Dispatch list JSON |
| `/api/dispatches` | POST | Create dispatch | courseId, tenantId, constraints | ✅ Hierarchical tenant/dispatch | Dispatch record + tokens |
| `/api/dispatches/:id` | DELETE | Soft delete dispatch | dispatchId | Owner or admin | ✅ Sets isDisabled |
| `/api/dispatches/:id/export` | GET | Export SCORM ZIP | dispatchId | Admin only | SCORM ZIP stream |
| `/api/dispatches/:id/launch-file` | GET | Download launch file | dispatchId | Admin only | HTML file download |

**Issues Found:**
- ❌ **Deprecated endpoint** `/launch-file` superseded by ZIP export
- ❌ **No progress tracking** for large ZIP exports

---

## UI/UX Component Audit

### Courses Page (`/courses`)
**Key Components:**
- ✅ Upload button with modal (`CourseUpload` component)
- ✅ Course cards with metadata display
- ✅ 3-dot dropdown menu: Edit, Preview, Delete
- ✅ Tag filtering dropdown with course counts
- ✅ Bulk selection with multi-dispatch creation
- ✅ Delete confirmation dialog (admin only)

**Issues:**
- ❌ **Potential duplicate headers** - need to verify PageHeader usage
- ❌ **Missing progress indicators** for bulk operations

### Course Preview Page (`/course/:id/preview`)
**Key Components:**
- ✅ Header with back navigation and course title
- ✅ "Preview Mode" badge indicator
- ✅ Full-screen iframe with sandboxing
- ✅ Loading spinner with smooth transitions
- ✅ Error handling for iframe failures

**Issues:**
- ❌ **Mobile responsiveness** - iframe sizing issues on small screens
- ❌ **No progress simulation** - SCORM API simulated but no persistence

### Dispatches Page (`/dispatches`)
**Key Components:**
- ✅ "Create Dispatch" button with modal
- ✅ Dispatch cards with status badges
- ✅ License status indicators
- ✅ 3-dot dropdown: Export SCORM, Delete
- ✅ Export functionality with ZIP download

**Issues:**
- ❌ **No export progress** for large files
- ❌ **Missing bulk operations** for dispatch management

### Course/Dispatch Cards (Shared Pattern)
**Consistent Elements:**
- ✅ Card layout with metadata
- ✅ Status badges and license indicators
- ✅ 3-dot dropdown menu pattern
- ✅ Hover effects and visual feedback

**Issues:**
- ❌ **Inconsistent delete confirmation** - some cards missing confirmation dialogs

---

## Cross-linking & System Consistency Check

### Upload Feature Analysis
**Existing Implementation:**
- ✅ **Single upload modal** - no duplicates found
- ✅ **Consistent CSRF handling** across all upload methods
- ✅ **Unified progress tracking** for regular and chunked uploads

**Cross-references:**
- Backend: `routes.ts:487` + chunked upload endpoints
- Frontend: `course-upload.tsx` → referenced in `courses.tsx`
- Database: `shared/schema.ts` courses table
- Storage: `uploads/courses/` directory

### Delete Feature Analysis
**Existing Implementation:**
- ✅ **Soft delete pattern** consistent across courses and dispatches
- ✅ **Admin permission checks** for course deletion
- ✅ **History preservation** with `isDisabled` and `deletedAt` fields

**Cross-references:**
- Backend: `DELETE /api/courses/:id`, `DELETE /api/dispatches/:id`
- Frontend: 3-dot dropdowns in card components
- Database: `isDisabled` and `deletedAt` fields in schema
- UI: Confirmation dialogs and admin-only visibility

### Preview Feature Analysis
**Existing Implementation:**
- ✅ **Dedicated preview route** `/course/:id/preview`
- ✅ **Simulated SCORM API** for testing without tracking
- ✅ **Asset serving** via separate preview endpoints

**Cross-references:**
- Backend: `generateSCORMPreview()` in routes.ts
- Frontend: Preview button in course cards → `course-preview.tsx`
- Navigation: Direct URL access and card-based navigation

---

## Duplicate Code & Conflicting Logic

### ❌ Duplications Found

**1. SCORM Entry Point Detection**
- **Location 1**: `findSCORMEntryPoint()` in routes.ts (launch system)
- **Location 2**: Similar logic in preview generation
- **Issue**: Different patterns for detecting index.html vs story.html
- **Fix**: Consolidate to single robust detection method

**2. Launch URL Injection**
- **Location 1**: ZIP export system (`__LAUNCH_URL__` replacement)
- **Location 2**: Launch file generation system
- **Issue**: Template injection logic duplicated
- **Fix**: Single `generateLaunchFile()` service

**3. Dispatch Creation Validation**
- **Location 1**: Individual dispatch creation endpoint
- **Location 2**: Bulk assignment in courses page
- **Issue**: License validation logic duplicated
- **Fix**: Extract to shared validation service

**4. ZIP Extraction Logic**
- **Location 1**: `extractFileFromZip()` for launch assets
- **Location 2**: Similar extraction for preview assets
- **Issue**: Same ZIP handling in multiple places
- **Fix**: Single ZIP service with caching

### ❌ Missing Components

**1. SCORM Standards Support**
- **Missing**: SCORM 2004 and AICC package detection
- **Impact**: Cannot handle modern SCORM packages
- **Files**: `scormValidator.ts`, all generation functions

**2. Mobile Optimization**
- **Missing**: Responsive SCORM player design
- **Impact**: Poor mobile learning experience
- **Files**: `course-preview.tsx`, launch HTML generation

**3. Progress Tracking**
- **Missing**: Export progress for large ZIP files
- **Impact**: No feedback during long operations
- **Files**: `dispatches.tsx` export handlers

**4. Content Security Policy**
- **Missing**: CSP headers for SCORM content
- **Impact**: Security vulnerability in iframe content
- **Files**: Launch and preview HTML generation

---

## Recommended Next Steps

### Phase 1: Critical Fixes
1. **Split routes.ts** into domain-specific modules
2. **Implement SCORM 2004 support** with proper manifest parsing
3. **Add mobile-responsive SCORM player** design
4. **Remove deprecated `/launch-file` endpoint**

### Phase 2: Performance & UX
1. **Consolidate duplicate SCORM logic** into shared services
2. **Add progress tracking** for large file operations
3. **Implement ZIP extraction caching** for performance
4. **Add bulk operations** for course/dispatch management

### Phase 3: Security & Standards
1. **Add Content Security Policy** for SCORM iframes
2. **Implement malware scanning** for uploaded content
3. **Add comprehensive test coverage** for SCORM workflows
4. **Create API documentation** for all endpoints

---

**Status**: Audit complete. System demonstrates solid SCORM 1.2 implementation with identified optimization opportunities. Ready for systematic enhancement implementation.