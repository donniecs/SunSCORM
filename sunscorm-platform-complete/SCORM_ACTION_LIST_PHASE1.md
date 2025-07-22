# SCORM Pipeline Action List - Phase 1 Audit Results

## 🚨 CRITICAL ACTIONS (Must Fix First)

### 1. **server/scormValidator.ts** → **Replace with node-sco-parser**
```bash
# Install dependency
npm install node-sco-parser

# Action: Complete rewrite of validation system
# Replace: validateSCORMPackage(), validateSCORMManifest(), analyzeSCORMManifest()
# With: Proper imsmanifest.xml root validation + SCORM 2004 manifest rules
```

### 2. **server/services/scormService.ts** → **Consolidate and enhance**
```bash
# Install dependency  
npm install scorm-again

# Action: Merge with validator, add package rebuilding
# Replace: parseManifest() duplication
# Add: scorm-again.js injection for ZIP rebuilding
```

### 3. **server/templates/scorm-loader.html** → **Add SCORM runtime**
```html
<!-- Add this to loader template -->
<script src="scorm-again.js"></script>
<script>
  // Setup window.API or window.API_1484_11
  // Configure lmsCommitUrl, autocommit, sequencing
</script>
```

### 4. **server/routes/launch.ts** → **Implement SCORM Cloud frameset**
```javascript
// Replace JSON response with proper SCORM frameset
// Add: scorm-again runtime adapter
// Implement: SCORM Cloud-style approach with fallback
```

---

## 📋 SYSTEMATIC REFACTOR ACTIONS

### **Backend Infrastructure**

#### **Upload & Validation**
- **File**: `server/routes/courses.ts` (Lines 104-169)
  - **Action**: Replace `validateSCORMPackage()` with node-sco-parser
  - **Add**: imsmanifest.xml root validation
  - **Fix**: Ensure SCORM 2004 manifest→metadata→organizations→resources rules

#### **Package Builder (NEW)**
- **File**: `server/services/packageBuilder.ts` (Create new)
  - **Action**: Create unified package rebuilder
  - **Add**: scorm-again.js injection
  - **Add**: window.API setup for different SCORM versions
  - **Replace**: Scattered ZIP building logic in dispatches

#### **Launch System**
- **File**: `server/routes/launch.ts`
  - **Action**: Replace basic file serving with SCORM runtime
  - **Add**: scorm-again adapter integration
  - **Implement**: Proper SCORM API setup

- **File**: `server/services/launchService.ts`
  - **Action**: Enhance handleSCORMLaunch() with runtime
  - **Add**: SCORM API context to asset serving
  - **Fix**: Integration with package builder

#### **Route Modularization**
- **Create**: `server/routes/preview.ts` (Extract from main routes)
- **Create**: `server/middleware/scorm-validator.middleware.ts`
- **Create**: `server/middleware/error-handler.middleware.ts`
- **Remove**: `server/routes-old.ts` (Legacy cleanup)

### **Frontend Components**

#### **Enhanced Upload UI**
- **File**: `client/src/components/courses/course-upload.tsx`
  - **Action**: Add SCORM type detection feedback
  - **Add**: Enhanced validation feedback with manifest analysis
  - **Fix**: Integration with new validation system

#### **Preview Enhancement**
- **File**: `client/src/pages/course-preview.tsx`
  - **Action**: Add SCORM API simulation
  - **Add**: Progress persistence testing UI
  - **Create**: Mock SCORM API for testing

#### **New Components (Create)**
- **File**: `client/src/components/scorm/SCORMPlayer.tsx`
  - **Action**: Unified SCORM player component
  - **Add**: Runtime API integration
  - **Add**: Error boundaries for SCORM failures

### **Error Handling & Edge Cases**

#### **Error Templates (Create)**
```
server/templates/error-missing-manifest.html
server/templates/error-invalid-token.html  
server/templates/error-extraction-failed.html
server/templates/error-oversized-upload.html
```

#### **React Error Boundaries (Create)**
```
client/src/components/error/SCORMErrorBoundary.tsx
```

---

## 🎯 FILE-BY-FILE ACTION MAPPING

| File | Current State | Action Required | Priority |
|------|---------------|-----------------|----------|
| `server/scormValidator.ts` | Regex-based validation | **REPLACE** with node-sco-parser | 🔴 HIGH |
| `server/services/scormService.ts` | Duplicate parsing | **CONSOLIDATE** with validator | 🔴 HIGH |
| `server/templates/scorm-loader.html` | Basic redirect | **ADD** scorm-again.js runtime | 🔴 HIGH |
| `server/routes/launch.ts` | JSON response | **IMPLEMENT** SCORM frameset | 🔴 HIGH |
| `server/routes/dispatches.ts` | Hardcoded manifest | **ADD** package builder | 🔴 HIGH |
| `server/routes/courses.ts` | Basic upload | **ENHANCE** validation | 🟡 MEDIUM |
| `server/routes/upload.ts` | Working chunked upload | **INTEGRATE** new validation | 🟡 MEDIUM |
| `client/src/pages/course-preview.tsx` | Basic iframe | **ADD** SCORM API simulation | 🟡 MEDIUM |
| `server/routes-old.ts` | Legacy code | **REMOVE** completely | 🟢 LOW |

---

## 🛠 DEPENDENCY INSTALLATION PLAN

```bash
# Phase 1 Dependencies
npm install node-sco-parser      # Professional SCORM validation
npm install scorm-again          # SCORM runtime adapter  
npm install xml2js               # Enhanced XML parsing
npm install fast-xml-parser     # Alternative XML parser

# Phase 2 Testing Dependencies  
npm install --save-dev jest      # Unit testing
npm install --save-dev supertest # API testing
```

---

## 🧪 TESTING STRATEGY

### **Unit Tests (Create)**
```
tests/scorm-validator.test.js    # Manifest validation
tests/package-builder.test.js    # ZIP rebuilding  
tests/launch-system.test.js      # Launch/assets serving
tests/scorm-compliance.test.js   # SCORM standards
```

### **Integration Tests**
- **SCOverseer integration** for SCORM Cloud compatibility
- **External LMS testing** (TalentLMS, Moodle)
- **Large file upload testing** (3GB+ SCORM packages)

---

## 🎯 DUPLICATION ELIMINATION

### **Current Duplications Identified**
1. **Manifest Parsing**: 2 implementations in validator + service
2. **Entry Point Detection**: Different logic in routes vs service  
3. **ZIP Handling**: 3 different yauzl implementations
4. **Launch File Generation**: Template injection in multiple places

### **Consolidation Actions**
1. **Create**: `server/services/scormParser.ts` (Single source of truth)
2. **Create**: `server/services/zipHandler.ts` (Unified ZIP operations)
3. **Remove**: Duplicate functions from existing files
4. **Standardize**: Entry point detection across all components

---

## 📊 ESTIMATED EFFORT BREAKDOWN

| Category | Total Effort | Priority Distribution |
|----------|--------------|----------------------|
| **High Priority** | 89 hours | 60% of total effort |
| **Medium Priority** | 76 hours | 30% of total effort |
| **Low Priority** | 35 hours | 10% of total effort |
| **TOTAL EFFORT** | **200 hours** | **~5 weeks** |

### **Critical Path Dependencies**
1. node-sco-parser integration (blocks validation improvements)
2. scorm-again integration (blocks runtime enhancements)  
3. Package builder creation (blocks dispatch improvements)
4. Route modularization (blocks maintenance improvements)

---

## ⚠️ RISK MITIGATION

### **High-Risk Changes**
- **Validation System Replacement**: Complete rewrite of core validation
- **Launch System Overhaul**: May break existing LMS integrations
- **Template Modifications**: Could affect existing dispatches

### **Mitigation Strategies**
1. **Feature Flags**: Enable/disable new validation during transition
2. **Backward Compatibility**: Maintain old endpoints during migration
3. **Comprehensive Testing**: Full regression testing before deployment
4. **Staged Rollout**: Deploy in phases with monitoring

---

This action list provides the granular, file-by-file mapping you requested. Each file has specific actions, priorities, and effort estimates. The systematic approach ensures no SCORM functionality is missed during the refactor.