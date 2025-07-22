# Production Deployment Guide

## Required Environment Variables

Before deploying to production, ensure the following environment variables are configured:

### Critical (Required for Deployment)
- `PORT=5000` - Required by Replit Deployments autoscale service
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secure random string for session encryption
- `REPLIT_DOMAINS` - Your deployed domain(s), comma-separated
- `PUBLIC_DOMAIN` - Your app's public URL for SCORM functionality

### Optional
- `NODE_ENV=production` - Enables production mode
- `ISSUER_URL=https://replit.com/oidc` - Auth provider (default)

## Environment Variable Setup Examples

```bash
# Required for deployment
PORT=5000
DATABASE_URL=postgresql://user:pass@host:port/database
SESSION_SECRET=your-secure-random-string-here
REPLIT_DOMAINS=yourapp.replit.app
PUBLIC_DOMAIN=https://yourapp.replit.app
NODE_ENV=production
```

## Pre-Deployment Checklist

1. ✅ Set all required environment variables
2. ✅ Verify database connection with `DATABASE_URL`
3. ✅ Generate secure `SESSION_SECRET` (use `openssl rand -base64 32`)
4. ✅ Set `REPLIT_DOMAINS` to your actual deployed domain
5. ✅ Set `PUBLIC_DOMAIN` to match your deployed URL
6. ✅ Test the application in development mode first

## Common Deployment Issues & Solutions

### Issue: "Missing PORT environment variable"
**Solution**: Set `PORT=5000` in your deployment environment variables

### Issue: "REPLIT_DOMAINS not provided"
**Solution**: Set `REPLIT_DOMAINS` to your deployed domain (e.g., `yourapp.replit.app`)

### Issue: "Authentication strategy configuration failing"
**Solution**: Ensure both `REPLIT_DOMAINS` and `SESSION_SECRET` are properly set

### Issue: "SCORM packages not working in external LMS"
**Solution**: Verify `PUBLIC_DOMAIN` matches your actual deployed URL

## Deployment Steps

1. **Configure Environment Variables**
   - Go to your Replit project settings
   - Add all required environment variables listed above

2. **Deploy via Replit Deployments**
   - Click the "Deploy" button in your Replit project
   - Choose "Web Service" deployment type
   - The application will automatically use the configured environment variables

3. **Post-Deployment Verification**
   - Visit your deployed URL
   - Test authentication login
   - Upload a test SCORM package
   - Verify SCORM launch works in external LMS

## Error Handling

The application now includes comprehensive error handling for missing environment variables:

- **Development Mode**: Warnings are logged, fallbacks are used
- **Production Mode**: Missing critical variables will prevent startup
- **Graceful Degradation**: Auth is disabled if `REPLIT_DOMAINS` is missing

## Monitoring

The application logs environment validation status on startup:
- Environment mode (development/production)
- Port configuration
- Database connectivity status
- Authentication configuration status
- SCORM domain configuration status