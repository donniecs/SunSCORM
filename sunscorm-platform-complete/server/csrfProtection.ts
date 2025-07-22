import crypto from 'crypto';
import type { RequestHandler, Request, Response } from 'express';

/**
 * Generate a secure CSRF token
 */
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate CSRF token from request
 */
function validateCSRFToken(req: Request, sessionToken: string): boolean {
  const token = req.body._csrf || 
                req.query._csrf || 
                req.headers['x-csrf-token'] ||
                req.headers['x-xsrf-token'] ||
                req.get('X-CSRF-Token'); // Handle custom header case
  
  console.log('[CSRF Debug]:', {
    sessionToken: sessionToken ? sessionToken.substring(0, 8) + '...' : 'none',
    bodyToken: req.body._csrf ? req.body._csrf.substring(0, 8) + '...' : 'none',
    headerToken: req.get('X-CSRF-Token') ? req.get('X-CSRF-Token').substring(0, 8) + '...' : 'none',
    foundToken: token ? token.substring(0, 8) + '...' : 'none'
  });
  
  return token && token === sessionToken;
}

/**
 * Custom CSRF Protection middleware
 * Generates and validates CSRF tokens for state-changing operations
 */
export const csrfProtection: RequestHandler = (req: any, res: Response, next) => {
  // Skip GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for xAPI statements (external access)
  if (req.path === '/api/xapi/statements') {
    return next();
  }

  // Generate token if not exists in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }

  // Validate token for state-changing requests
  if (!validateCSRFToken(req, req.session.csrfToken)) {
    return res.status(403).json({ 
      message: 'Invalid CSRF token',
      error: 'CSRF_TOKEN_MISMATCH'
    });
  }

  next();
};

/**
 * Endpoint to get CSRF token for frontend
 */
export const getCSRFToken: RequestHandler = (req: any, res: Response) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }
  
  res.json({ 
    csrfToken: req.session.csrfToken 
  });
};