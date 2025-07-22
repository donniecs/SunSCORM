import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import { promisify } from "util";

/**
 * Universal SCORM service for ZIP handling, entry point detection, and content serving
 * Consolidates all duplicate SCORM logic into a single service
 */

interface SCORMManifest {
  version: 'scorm_1_2' | 'scorm_2004' | 'aicc';
  entryPoint: string;
  title: string;
  description?: string;
  identifier: string;
}

interface ZipCacheEntry {
  files: Map<string, Buffer>;
  manifest?: SCORMManifest;
  lastAccessed: Date;
}

// ZIP extraction cache - stores extracted files in memory for performance
const zipCache = new Map<string, ZipCacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 50; // Maximum number of ZIP files to cache

/**
 * Clean expired cache entries
 */
function cleanCache(): void {
  const now = new Date();
  for (const [key, entry] of zipCache.entries()) {
    if (now.getTime() - entry.lastAccessed.getTime() > CACHE_TTL) {
      zipCache.delete(key);
    }
  }
  
  // If cache is still too large, remove oldest entries
  if (zipCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(zipCache.entries())
      .sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());
    
    const toRemove = entries.slice(0, zipCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => zipCache.delete(key));
  }
}

/**
 * Extract all files from ZIP and cache them
 */
async function extractZipToCache(zipPath: string): Promise<ZipCacheEntry> {
  console.log(`Extracting ZIP to cache: ${zipPath}`);
  
  const openZip = promisify(yauzl.open);
  const zipFile = await openZip(zipPath, { lazyEntries: true });
  
  const files = new Map<string, Buffer>();
  let manifest: SCORMManifest | undefined;
  
  return new Promise((resolve, reject) => {
    zipFile.readEntry();
    
    zipFile.on('entry', (entry: any) => {
      if (entry.fileName.endsWith('/')) {
        // Directory entry, skip
        zipFile.readEntry();
        return;
      }
      
      zipFile.openReadStream(entry, (err: any, readStream: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        const chunks: Buffer[] = [];
        readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
        readStream.on('end', () => {
          const fileContent = Buffer.concat(chunks);
          files.set(entry.fileName, fileContent);
          
          // Parse manifest if this is the manifest file
          if (entry.fileName.toLowerCase() === 'imsmanifest.xml') {
            try {
              manifest = parseManifest(fileContent.toString('utf8'));
            } catch (error) {
              console.warn('Failed to parse manifest:', error);
            }
          }
          
          zipFile.readEntry();
        });
        readStream.on('error', reject);
      });
    });
    
    zipFile.on('end', () => {
      const cacheEntry: ZipCacheEntry = {
        files,
        manifest,
        lastAccessed: new Date()
      };
      resolve(cacheEntry);
    });
    
    zipFile.on('error', reject);
  });
}

/**
 * Parse SCORM manifest (imsmanifest.xml) to detect SCORM version and entry point
 */
function parseManifest(manifestXml: string): SCORMManifest {
  // Basic XML parsing for SCORM detection
  // This is a simplified parser - in production, consider using xml2js library
  
  const manifest: Partial<SCORMManifest> = {};
  
  // Detect SCORM version
  if (manifestXml.includes('xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"') || 
      manifestXml.includes('schemaversion="1.2"')) {
    manifest.version = 'scorm_1_2';
  } else if (manifestXml.includes('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"') ||
             manifestXml.includes('version="2004')) {
    manifest.version = 'scorm_2004';
  } else {
    manifest.version = 'scorm_1_2'; // Default fallback
  }
  
  // Extract title
  const titleMatch = manifestXml.match(/<title[^>]*>([^<]+)<\/title>/i);
  manifest.title = titleMatch ? titleMatch[1].trim() : 'SCORM Course';
  
  // Extract identifier
  const identifierMatch = manifestXml.match(/<manifest[^>]*identifier="([^"]+)"/i);
  manifest.identifier = identifierMatch ? identifierMatch[1] : 'default';
  
  // Find entry point (launch file)
  const resourceMatch = manifestXml.match(/<resource[^>]*href="([^"]+)"/i);
  if (resourceMatch) {
    manifest.entryPoint = resourceMatch[1];
  } else {
    // Fallback to common SCORM entry points
    manifest.entryPoint = 'index.html';
  }
  
  return manifest as SCORMManifest;
}

/**
 * Find SCORM entry point using multiple detection methods
 * Consolidates duplicate logic from launch and preview systems
 */
export async function findSCORMEntryPoint(zipPath: string): Promise<string> {
  const cacheKey = `${zipPath}-${fs.statSync(zipPath).mtime.getTime()}`;
  let cacheEntry = zipCache.get(cacheKey);
  
  if (!cacheEntry) {
    cleanCache();
    cacheEntry = await extractZipToCache(zipPath);
    zipCache.set(cacheKey, cacheEntry);
  } else {
    cacheEntry.lastAccessed = new Date();
  }
  
  // Use manifest entry point if available
  if (cacheEntry.manifest?.entryPoint) {
    return cacheEntry.manifest.entryPoint;
  }
  
  // Fallback to file detection
  const fileNames = Array.from(cacheEntry.files.keys()).map(f => f.toLowerCase());
  
  // Common SCORM entry points in order of preference
  const commonEntryPoints = [
    'index.html',
    'index.htm',
    'default.html',
    'default.htm',
    'start.html',
    'start.htm',
    'story.html',
    'story.htm',
    'main.html',
    'main.htm'
  ];
  
  for (const entryPoint of commonEntryPoints) {
    if (fileNames.includes(entryPoint)) {
      return entryPoint;
    }
  }
  
  // Find any HTML file as last resort
  const htmlFile = fileNames.find(name => name.endsWith('.html') || name.endsWith('.htm'));
  return htmlFile || 'index.html';
}

/**
 * Extract specific file from ZIP with caching
 * Consolidates duplicate ZIP extraction logic
 */
export async function extractFileFromZip(zipPath: string, filePath: string): Promise<Buffer> {
  const cacheKey = `${zipPath}-${fs.statSync(zipPath).mtime.getTime()}`;
  let cacheEntry = zipCache.get(cacheKey);
  
  if (!cacheEntry) {
    cleanCache();
    cacheEntry = await extractZipToCache(zipPath);
    zipCache.set(cacheKey, cacheEntry);
  } else {
    cacheEntry.lastAccessed = new Date();
  }
  
  const file = cacheEntry.files.get(filePath);
  if (!file) {
    throw new Error(`File not found in ZIP: ${filePath}`);
  }
  
  return file;
}

/**
 * Get SCORM manifest information
 */
export async function getSCORMManifest(zipPath: string): Promise<SCORMManifest | null> {
  const cacheKey = `${zipPath}-${fs.statSync(zipPath).mtime.getTime()}`;
  let cacheEntry = zipCache.get(cacheKey);
  
  if (!cacheEntry) {
    cleanCache();
    cacheEntry = await extractZipToCache(zipPath);
    zipCache.set(cacheKey, cacheEntry);
  } else {
    cacheEntry.lastAccessed = new Date();
  }
  
  return cacheEntry.manifest || null;
}

/**
 * Get content type for file extension
 */
export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.txt': 'text/plain'
  };
  
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Generate responsive SCORM launch HTML with mobile optimization
 */
export function generateSCORMLaunchHTML(options: {
  courseTitle: string;
  token: string;
  entryPoint: string;
  isPreview?: boolean;
  userEmail?: string;
  courseId?: string;
  dispatchId?: string;
}): string {
  const { courseTitle, token, entryPoint, isPreview = false, userEmail, courseId, dispatchId } = options;
  
  const badge = isPreview ? 'PREVIEW MODE' : 'LIVE COURSE';
  const badgeColor = isPreview ? '#3b82f6' : '#10b981';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src 'self';">
    <title>${courseTitle} - SCORM Course</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f8fafc;
            height: 100vh;
            overflow: hidden;
        }
        
        .course-header {
            background: #fff;
            border-bottom: 1px solid #e5e7eb;
            padding: 12px 20px;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .course-content {
            margin-top: 60px;
            height: calc(100vh - 60px);
            position: relative;
        }
        
        .scorm-frame {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
        
        .course-badge {
            background: ${badgeColor};
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .course-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
            max-width: calc(100vw - 200px);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        /* Mobile responsiveness */
        @media (max-width: 768px) {
            .course-header {
                padding: 8px 12px;
                flex-direction: column;
                gap: 8px;
                height: auto;
            }
            
            .course-content {
                margin-top: 80px;
                height: calc(100vh - 80px);
            }
            
            .course-title {
                font-size: 16px;
                max-width: 100%;
                text-align: center;
            }
            
            .course-badge {
                font-size: 11px;
                padding: 4px 8px;
            }
        }
        
        @media (max-width: 480px) {
            .course-header {
                padding: 6px 8px;
            }
            
            .course-content {
                margin-top: 90px;
                height: calc(100vh - 90px);
            }
            
            .course-title {
                font-size: 14px;
            }
        }
    </style>
</head>
<body>
    <div class="course-header">
        <h1 class="course-title">${courseTitle}</h1>
        <span class="course-badge">${badge}</span>
    </div>
    <div class="course-content">
        <iframe 
            class="scorm-frame" 
            src="${isPreview ? `/api/preview/${courseId}/assets/${entryPoint}` : `/launch/${token}/assets/${entryPoint}`}"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-top-navigation"
            title="SCORM Course Content"
            loading="lazy">
        </iframe>
    </div>
    
    <!-- Professional SCORM Runtime using scorm-again -->
    <script src="https://cdn.jsdelivr.net/npm/scorm-again@latest/dist/scorm-again.min.js"></script>
    
    <script>
        // Professional SCORM API Runtime with scorm-again
        // Replaces basic API implementation with full SCORM compliance
        
        let scormAPI = null;
        
        function initializeProfessionalSCORMAPI() {
            try {
                console.log('Initializing professional SCORM runtime...');
                
                // Determine SCORM version (this should be passed from backend)
                const scormVersion = "${dispatchId ? 'scorm_1_2' : 'scorm_1_2'}"; // Default to SCORM 1.2 for now
                
                const apiConfig = {
                    courseId: "${courseId || 'unknown'}",
                    studentId: "${userEmail || 'anonymous'}",
                    studentName: "${userEmail || 'Anonymous User'}",
                    autocommit: true,
                    enableOfflineSupport: false,
                    ${isPreview ? '' : `
                    lmsCommitUrl: '/api/xapi/statements',
                    completionThreshold: 0.8,
                    `}
                    ${isPreview ? `debug: true,` : ''}
                };
                
                if (scormVersion === 'scorm_2004') {
                    // SCORM 2004 API
                    scormAPI = new window.ScormAgain.Scorm2004API(apiConfig);
                    window.API_1484_11 = scormAPI;
                    console.log('SCORM 2004 API initialized successfully');
                } else {
                    // SCORM 1.2 API (default)
                    scormAPI = new window.ScormAgain.Scorm12API(apiConfig);
                    window.API = scormAPI;
                    console.log('SCORM 1.2 API initialized successfully');
                }
                
                // Add professional event handling and debugging
                if (scormAPI) {
                    scormAPI.on('Initialize', () => {
                        console.log('SCORM: Course initialized');
                        ${isPreview ? '' : `
                        // Send launch tracking for live courses
                        sendXAPIStatement({
                            verb: 'launched',
                            object: { id: '${courseId}', name: '${courseTitle}' },
                            actor: { name: '${userEmail}' }
                        });
                        `}
                    });
                    
                    scormAPI.on('Commit', () => {
                        console.log('SCORM: Data committed');
                    });
                    
                    scormAPI.on('Finish', () => {
                        console.log('SCORM: Course finished');
                        ${isPreview ? '' : `
                        // Send completion tracking for live courses
                        sendXAPIStatement({
                            verb: 'completed',
                            object: { id: '${courseId}', name: '${courseTitle}' },
                            actor: { name: '${userEmail}' }
                        });
                        `}
                    });
                    
                    scormAPI.on('SetValue', (cmi, value) => {
                        console.log('SCORM: SetValue:', cmi, value);
                        ${isPreview ? '' : `
                        // Track progress for live courses
                        if (cmi.includes('score') || cmi.includes('completion') || cmi.includes('success')) {
                            sendXAPIStatement({
                                verb: 'progressed',
                                object: { id: '${courseId}', name: '${courseTitle}' },
                                actor: { name: '${userEmail}' },
                                result: { [cmi]: value }
                            });
                        }
                        `}
                    });
                }
                
            } catch (error) {
                console.error('Failed to initialize professional SCORM API:', error);
                
                // Fallback to basic API if scorm-again fails
                console.log('Falling back to basic SCORM API...');
                window.API = {
                    LMSInitialize: () => 'true',
                    LMSCommit: () => 'true', 
                    LMSFinish: () => 'true',
                    LMSGetValue: () => '',
                    LMSSetValue: () => 'true',
                    LMSGetLastError: () => '0',
                    LMSGetErrorString: () => '',
                    LMSGetDiagnostic: () => ''
                };
            }
        }
        
        // Initialize SCORM API when scorm-again loads
        if (window.ScormAgain) {
            initializeProfessionalSCORMAPI();
        } else {
            window.addEventListener('load', initializeProfessionalSCORMAPI);
        }
        
        ${isPreview ? '' : `
        // xAPI Statement Sending for Live Courses
        async function sendXAPIStatement(statement) {
            try {
                const response = await fetch('/api/xapi/statements', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
                    },
                    body: JSON.stringify({
                        dispatchId: '${dispatchId}',
                        actorEmail: '${userEmail}',
                        verb: statement.verb,
                        objectId: statement.object.id,
                        result: statement.result || {},
                        context: { 
                            instructor: 'Sun-SCORM Platform',
                            course: '${courseTitle}'
                        }
                    })
                });
                
                if (response.ok) {
                    console.log('xAPI statement sent successfully:', statement.verb);
                } else {
                    console.warn('Failed to send xAPI statement:', response.status);
                }
            } catch (error) {
                console.error('Error sending xAPI statement:', error);
            }
        }
        `}
        
        // Legacy SCORM API fallback for older content
        // This ensures compatibility with both professional and basic SCORM content
        if (!window.API && !window.API_1484_11) {
            setTimeout(() => {
                if (!window.API && !window.API_1484_11) {
                    console.warn('No SCORM API detected, initializing basic fallback');
                    window.API = {
                        LMSInitialize: () => { console.log('Basic API: LMSInitialize'); return 'true'; },
                        LMSCommit: () => { console.log('Basic API: LMSCommit'); return 'true'; }, 
                        LMSFinish: () => { console.log('Basic API: LMSFinish'); return 'true'; },
                        LMSGetValue: (cmi) => { console.log('Basic API: LMSGetValue', cmi); return ''; },
                        LMSSetValue: (cmi, value) => { console.log('Basic API: LMSSetValue', cmi, value); return 'true'; },
                        LMSGetLastError: () => '0',
                        LMSGetErrorString: () => '',
                        LMSGetDiagnostic: () => ''
                    };
                }
            }, 1000);
        }
    </script>
</body>
</html>`;
}

/**
 * Generate error page HTML
 */
export function generateErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f8fafc;
            color: #374151;
            text-align: center;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .error-container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #dc2626;
            margin-bottom: 16px;
            font-size: 24px;
        }
        p {
            margin-bottom: 24px;
            line-height: 1.6;
        }
        .error-code {
            background: #fee2e2;
            color: #991b1b;
            padding: 8px 16px;
            border-radius: 6px;
            font-family: monospace;
            display: inline-block;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>${title}</h1>
        <p>${message}</p>
        <div class="error-code">Error: Course unavailable</div>
    </div>
</body>
</html>`;
}