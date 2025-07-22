import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { generateSCORMLaunchHTML, generateErrorPage } from "./scormService";

/**
 * Universal launch file generation service
 * Consolidates all launch file creation logic
 */

/**
 * Generate launch.html file for external LMS upload
 * Replaces duplicate template injection logic
 */
export async function generateLaunchFile(dispatchId: string, launchToken: string): Promise<void> {
  // Enhanced domain detection with better fallbacks for production
  let publicDomain = process.env.PUBLIC_DOMAIN;
  
  if (!publicDomain) {
    // Try to construct from REPLIT_DOMAINS if available
    if (process.env.REPLIT_DOMAINS) {
      const domains = process.env.REPLIT_DOMAINS.split(',');
      publicDomain = `https://${domains[0].trim()}`;
    } else {
      // Final fallback - this should be set in production
      publicDomain = 'https://yourscormplatform.replit.app';
      console.warn('Warning: PUBLIC_DOMAIN not set, using fallback domain. This may cause SCORM launch issues in production.');
    }
  }
  
  console.log(`Generating launch file for dispatch ${dispatchId} with domain: ${publicDomain}`);
  
  // Load the professional SCORM loader template
  const loaderTemplatePath = path.join(process.cwd(), 'server', 'templates', 'scorm-loader.html');
  let launchHtml: string;
  
  try {
    const loaderTemplate = fs.readFileSync(loaderTemplatePath, 'utf8');
    // Inject the actual launch URL into the template
    launchHtml = loaderTemplate.replace(/__LAUNCH_URL__/g, `${publicDomain}/launch/${launchToken}`);
  } catch (error) {
    console.error('Failed to load SCORM loader template, using fallback:', error);
    // Fallback to simple redirect
    launchHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url=${publicDomain}/launch/${launchToken}" />
    <title>Loading Course...</title>
  </head>
  <body>
    <p>If you are not redirected, <a href="${publicDomain}/launch/${launchToken}">click here</a>.</p>
  </body>
</html>`;
  }

  const launchLinksDir = path.join(process.cwd(), 'uploads', 'launch_links');
  
  // Ensure directory exists
  if (!fs.existsSync(launchLinksDir)) {
    fs.mkdirSync(launchLinksDir, { recursive: true });
  }
  
  const filePath = path.join(launchLinksDir, `dispatch-${dispatchId}.html`);
  fs.writeFileSync(filePath, launchHtml, 'utf8');
}

/**
 * Handle SCORM launch request - serves actual SCORM content
 * Consolidates all permission and validation checks
 */
export async function handleSCORMLaunch(token: string, req: any, res: any): Promise<void> {
  try {
    // STEP 1: Token Lookup and validation
    console.log(`Launch request for token: ${token}`);
    
    const dispatchUser = await storage.getDispatchUserByToken(token);
    if (!dispatchUser) {
      console.log("Token not found in dispatch users");
      return res.status(404).send(generateErrorPage("Invalid Launch Token", "The launch link you used is not valid or has expired."));
    }

    // Get the associated dispatch
    const dispatch = await storage.getDispatch(dispatchUser.dispatchId);
    if (!dispatch) {
      console.log("Associated dispatch not found");
      return res.status(404).send(generateErrorPage("Invalid Dispatch", "The course dispatch could not be found."));
    }

    // STEP 1.5: Check if dispatch is disabled (SOFT DELETE ENFORCEMENT)
    if (dispatch.isDisabled) {
      console.log("Dispatch is disabled");
      return res.status(403).send(generateErrorPage("Course Unavailable", "This course is no longer available."));
    }

    // STEP 2: Expiration Check
    if (dispatch.expiresAt && dispatch.expiresAt < new Date()) {
      console.log("Dispatch has expired");
      return res.status(403).send(generateErrorPage("Course Expired", "This course has expired and is no longer accessible."));
    }

    // STEP 3: Max User Check
    if (dispatch.maxUsers) {
      const existingUsers = await storage.getDispatchUsers(dispatch.id);
      const uniqueUserCount = new Set(existingUsers.map(u => u.email).filter(Boolean)).size;
      
      if (uniqueUserCount >= dispatch.maxUsers) {
        console.log("Max users reached for dispatch");
        return res.status(403).send(generateErrorPage("Maximum Users Reached", "This course has reached its maximum number of users."));
      }
    }

    // Get course and check if it's disabled (SOFT DELETE ENFORCEMENT)
    const course = await storage.getCourse(dispatch.courseId);
    if (!course) {
      console.log("Associated course not found");
      return res.status(404).send(generateErrorPage("Course Not Found", "The course content could not be found."));
    }
    
    if (course.isDisabled) {
      console.log("Course is disabled");
      return res.status(403).send(generateErrorPage("Course Unavailable", "This course is no longer available."));
    }

    // STEP 4: Update launch tracking
    if (!dispatchUser.launchedAt) {
      await storage.updateDispatchUser(dispatchUser.id, {
        launchedAt: new Date(),
        lastAccessedAt: new Date()
      });
      console.log("User launch tracked successfully");
    } else {
      await storage.updateDispatchUser(dispatchUser.id, {
        lastAccessedAt: new Date()
      });
      console.log("User access time updated");
    }

    // STEP 5: Generate and serve SCORM launch page using consolidated service
    console.log("Generating SCORM launch page for course:", course.title);
    
    const entryPoint = await import('./scormService').then(service => 
      service.findSCORMEntryPoint(course.storagePath)
    );
    
    const launchHtml = generateSCORMLaunchHTML({
      courseTitle: course.title,
      token,
      entryPoint,
      isPreview: false,
      userEmail: dispatchUser.email,
      courseId: course.id,
      dispatchId: dispatch.id
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(launchHtml);

  } catch (error) {
    console.error("Error in handleSCORMLaunch:", error);
    res.status(500).send(generateErrorPage("Launch Error", "An unexpected error occurred while launching the course."));
  }
}

/**
 * Handle SCORM launch assets - serves individual files from course ZIP
 * Uses consolidated ZIP extraction with caching
 */
export async function handleLaunchAssets(token: string, assetPath: string, req: any, res: any): Promise<void> {
  try {
    console.log(`Launch asset request - Token: ${token}, Asset: ${assetPath}`);
    
    // Validate token and get course
    const dispatchUser = await storage.getDispatchUserByToken(token);
    if (!dispatchUser) {
      return res.status(404).send("Invalid token");
    }

    const dispatch = await storage.getDispatch(dispatchUser.dispatchId);
    if (!dispatch || dispatch.isDisabled) {
      return res.status(403).send("Course unavailable");
    }

    const course = await storage.getCourse(dispatch.courseId);
    if (!course || course.isDisabled) {
      return res.status(404).send("Course not found");
    }

    // Extract and serve the specific file from ZIP using consolidated service
    const scormService = await import('./scormService');
    const fileContent = await scormService.extractFileFromZip(course.storagePath, assetPath);
    
    // Determine content type
    const contentType = scormService.getContentType(assetPath);
    res.setHeader('Content-Type', contentType);
    res.send(fileContent);
  } catch (error) {
    console.error("Error serving launch asset:", error);
    res.status(404).send("Asset not found");
  }
}