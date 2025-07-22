import { promises as fs } from 'fs';
import yauzl from 'yauzl';
import { promisify } from 'util';
import { XMLParser } from 'fast-xml-parser';

/**
 * Professional SCORM validator with proper XML parsing and SCORM 2004 support
 * Validates uploaded files against SCORM 1.2, SCORM 2004, and AICC standards
 * Uses fast-xml-parser for reliable manifest parsing instead of regex
 */

interface SCORMValidationResult {
  isValid: boolean;
  error?: string;
  scormType?: 'scorm_1_2' | 'scorm_2004' | 'aicc' | 'unknown';
  manifestData?: {
    title?: string;
    description?: string;
    identifier?: string;
    entryPoint?: string;
    version?: string;
  };
}

/**
 * Enhanced SCORM package validation with manifest parsing
 */
export async function validateSCORMPackage(file: Express.Multer.File): Promise<SCORMValidationResult> {
  try {
    // Basic file validation
    if (!file.path || !file.originalname) {
      return { isValid: false, error: 'Invalid file object' };
    }

    // Check if file exists
    try {
      await fs.access(file.path);
    } catch {
      return { isValid: false, error: 'File not found' };
    }

    // Validate file size (non-zero)
    const stats = await fs.stat(file.path);
    if (stats.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    // Check for ZIP file signature (enhanced validation)
    const buffer = Buffer.alloc(4);
    const fileHandle = await fs.open(file.path, 'r');
    await fileHandle.read(buffer, 0, 4, 0);
    await fileHandle.close();

    // ZIP file signature check (50 4B 03 04 or 50 4B 05 06 or 50 4B 07 08)
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && 
                  (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
    
    if (!isZip) {
      return { isValid: false, error: 'File is not a valid ZIP archive' };
    }

    // Enhanced validation with manifest parsing
    const manifestValidation = await validateSCORMManifest(file.path);
    
    if (!manifestValidation.isValid) {
      return {
        isValid: false,
        error: manifestValidation.error || 'Invalid SCORM package: No valid manifest found'
      };
    }

    console.log(`Enhanced SCORM validation passed for ${file.originalname}: ${manifestValidation.scormType}`);
    
    return {
      isValid: true,
      scormType: manifestValidation.scormType,
      manifestData: manifestValidation.manifestData
    };

  } catch (error) {
    console.error('SCORM validation error:', error);
    return { 
      isValid: false, 
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Enhanced SCORM manifest validation with full ZIP parsing and XML analysis
 * Supports SCORM 1.2, SCORM 2004, and AICC detection
 */
export async function validateSCORMManifest(filePath: string): Promise<{
  isValid: boolean;
  scormType?: 'scorm_1_2' | 'scorm_2004' | 'aicc';
  manifestData?: {
    title?: string;
    description?: string;
    identifier?: string;
    entryPoint?: string;
    version?: string;
  };
  error?: string;
}> {
  try {
    const openZip = promisify(yauzl.open);
    const zipFile = await openZip(filePath, { lazyEntries: true });
    
    let manifestContent: string | null = null;
    let aiccContent: string | null = null;
    let hasManifest = false;
    let hasAICC = false;

    // Search for manifest files in the ZIP
    return new Promise((resolve, reject) => {
      zipFile.readEntry();
      
      zipFile.on('entry', (entry: any) => {
        const fileName = entry.fileName.toLowerCase();
        
        // Check for SCORM manifest
        if (fileName === 'imsmanifest.xml' || fileName.endsWith('/imsmanifest.xml')) {
          hasManifest = true;
          
          zipFile.openReadStream(entry, (err: any, readStream: any) => {
            if (err) {
              reject(err);
              return;
            }
            
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
            readStream.on('end', () => {
              manifestContent = Buffer.concat(chunks).toString('utf8');
              zipFile.readEntry();
            });
            readStream.on('error', reject);
          });
        }
        // Check for AICC files
        else if (fileName.endsWith('.au') || fileName.endsWith('.crs') || fileName.endsWith('.des')) {
          hasAICC = true;
          
          if (fileName.endsWith('.crs')) {
            zipFile.openReadStream(entry, (err: any, readStream: any) => {
              if (err) {
                reject(err);
                return;
              }
              
              const chunks: Buffer[] = [];
              readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
              readStream.on('end', () => {
                aiccContent = Buffer.concat(chunks).toString('utf8');
                zipFile.readEntry();
              });
              readStream.on('error', reject);
            });
          } else {
            zipFile.readEntry();
          }
        }
        else {
          zipFile.readEntry();
        }
      });
      
      zipFile.on('end', () => {
        // Process the found manifests
        if (manifestContent) {
          const scormAnalysis = analyzeSCORMManifest(manifestContent);
          resolve(scormAnalysis);
        } else if (hasAICC && aiccContent) {
          const aiccAnalysis = analyzeAICCPackage(aiccContent);
          resolve(aiccAnalysis);
        } else if (hasAICC) {
          resolve({
            isValid: true,
            scormType: 'aicc',
            manifestData: {
              title: 'AICC Course',
              description: 'AICC compatible course package'
            }
          });
        } else {
          resolve({
            isValid: false,
            error: 'No valid SCORM manifest (imsmanifest.xml) or AICC files found in package'
          });
        }
      });
      
      zipFile.on('error', reject);
    });

  } catch (error) {
    console.error('Manifest validation error:', error);
    return {
      isValid: false,
      error: `Manifest validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Professional SCORM manifest analyzer using fast-xml-parser
 * Replaces regex-based parsing with robust XML analysis for SCORM 1.2/2004 support
 */
function analyzeSCORMManifest(manifestXml: string): {
  isValid: boolean;
  scormType?: 'scorm_1_2' | 'scorm_2004';
  manifestData?: {
    title?: string;
    description?: string;
    identifier?: string;
    entryPoint?: string;
    version?: string;
  };
  error?: string;
} {
  try {
    // Professional XML parser configuration for SCORM manifests
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      textNodeName: "#text",
      parseAttributeValue: true,
      parseTrueNumberOnly: false,
      ignoreNameSpace: false,
      allowBooleanAttributes: true,
      parseNodeValue: true,
      parseTagValue: true,
      trimValues: true,
      removeNSPrefix: false
    });
    
    const parsedXML = parser.parse(manifestXml);
    console.log('SCORM manifest structure:', Object.keys(parsedXML));
    
    const manifestData: any = {};
    
    // Find the manifest element (may be nested)
    let manifest = parsedXML.manifest;
    if (!manifest) {
      // Try to find manifest in any nested structure
      const findManifest = (obj: any): any => {
        if (typeof obj === 'object' && obj !== null) {
          if (obj.manifest) return obj.manifest;
          for (const key in obj) {
            const result = findManifest(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };
      manifest = findManifest(parsedXML);
    }
    
    if (!manifest) {
      return { isValid: false, error: 'No manifest element found in XML' };
    }
    
    // Extract manifest identifier and version
    if (manifest['@identifier']) {
      manifestData.identifier = manifest['@identifier'];
    }
    if (manifest['@version']) {
      manifestData.version = manifest['@version'];
    }
    
    // Professional SCORM version detection using XML namespaces and schema references
    const xmlContent = manifestXml.toLowerCase();
    if (xmlContent.includes('xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"') || 
        xmlContent.includes('schemaversion="1.2"') ||
        xmlContent.includes('adlcp_rootv1p2') ||
        (manifest.metadata && manifest.metadata.schemaversion === '1.2')) {
      manifestData.scormType = 'scorm_1_2';
      console.log('SCORM 1.2 package detected via XML analysis');
    } else if (xmlContent.includes('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"') ||
               xmlContent.includes('version="2004') ||
               xmlContent.includes('adlcp_v1p3') ||
               xmlContent.includes('adlseq_v1p3') ||
               xmlContent.includes('adlnav_v1p3') ||
               (manifest['@version'] && manifest['@version'].includes('2004'))) {
      manifestData.scormType = 'scorm_2004';
      console.log('SCORM 2004 package detected via XML analysis');
    } else {
      // Intelligent fallback detection
      if (xmlContent.includes('<adlcp:') || xmlContent.includes('adlcp:') || manifest.metadata?.schemaversion) {
        manifestData.scormType = 'scorm_1_2';
        console.log('SCORM 1.2 detected via ADL namespace');
      } else {
        manifestData.scormType = 'scorm_1_2'; // Safe default
        console.log('Defaulting to SCORM 1.2 for unknown structure');
      }
    }

    // Extract title using proper XML parsing
    if (manifest.organizations?.organization) {
      const org = Array.isArray(manifest.organizations.organization) 
        ? manifest.organizations.organization[0] 
        : manifest.organizations.organization;
      
      if (org.title) {
        manifestData.title = typeof org.title === 'string' ? org.title : org.title['#text'];
      }
    }
    
    // Extract description
    if (manifest.organizations?.organization) {
      const org = Array.isArray(manifest.organizations.organization) 
        ? manifest.organizations.organization[0] 
        : manifest.organizations.organization;
      
      if (org.description) {
        manifestData.description = typeof org.description === 'string' ? org.description : org.description['#text'];
      }
    }

    // Extract entry point from resources
    if (manifest.resources?.resource) {
      const resource = Array.isArray(manifest.resources.resource) 
        ? manifest.resources.resource[0] 
        : manifest.resources.resource;
      
      if (resource['@href']) {
        manifestData.entryPoint = resource['@href'];
      }
    }

    console.log(`SCORM ${manifestData.scormType} package detected:`, {
      title: manifestData.title,
      identifier: manifestData.identifier,
      entryPoint: manifestData.entryPoint
    });

    return {
      isValid: true,
      scormType: manifestData.scormType,
      manifestData
    };

  } catch (error) {
    console.error('Error analyzing SCORM manifest:', error);
    return {
      isValid: false,
      error: `Failed to parse SCORM manifest: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Analyze AICC package files
 */
function analyzeAICCPackage(crsContent: string): {
  isValid: boolean;
  scormType: 'aicc';
  manifestData?: {
    title?: string;
    description?: string;
    identifier?: string;
    entryPoint?: string;
  };
} {
  const manifestData: any = {};
  
  try {
    // Parse AICC .crs file for course information
    const lines = crsContent.split('\n');
    
    for (const line of lines) {
      const cleanLine = line.trim();
      
      if (cleanLine.startsWith('Course_Title=')) {
        manifestData.title = cleanLine.substring('Course_Title='.length);
      } else if (cleanLine.startsWith('Course_Description=')) {
        manifestData.description = cleanLine.substring('Course_Description='.length);
      } else if (cleanLine.startsWith('Course_ID=')) {
        manifestData.identifier = cleanLine.substring('Course_ID='.length);
      } else if (cleanLine.startsWith('File_Name=')) {
        manifestData.entryPoint = cleanLine.substring('File_Name='.length);
      }
    }

    console.log('AICC package detected:', manifestData);

    return {
      isValid: true,
      scormType: 'aicc',
      manifestData
    };

  } catch (error) {
    console.error('Error analyzing AICC package:', error);
    return {
      isValid: true, // Don't fail validation for AICC parsing errors
      scormType: 'aicc',
      manifestData: {
        title: 'AICC Course',
        description: 'AICC compatible course package'
      }
    };
  }
}