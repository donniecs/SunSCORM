# SCORM Export Testing Guide

## Testing SCORM Loader Template

### Quick Test
Visit the test endpoint: `/api/test/scorm-loader`

This endpoint loads the SCORM loader template with a test URL and demonstrates:
- URL injection mechanism working correctly
- Loader animation and progress indicators
- Error handling and fallback mechanisms
- Manual launch link functionality

### Manual ZIP Testing

1. **Create a Test Dispatch**
   - Log in as admin
   - Create a dispatch for any course
   - Note the dispatch ID

2. **Export SCORM Package**
   - Navigate to dispatch list
   - Click "Export SCORM Package" for your test dispatch
   - Download and extract the ZIP file

3. **Verify ZIP Contents**
   ```
   dispatch-{name}.zip
   ├── imsmanifest.xml    # SCORM 1.2 manifest
   ├── index.html         # Loader with injected launch URL
   └── dispatch.json      # Metadata and launch URL
   ```

4. **Check index.html**
   Open `index.html` and verify:
   - `const LAUNCH_URL = "https://yourapp.replit.app/launch/{token}";`
   - No instances of `__LAUNCH_URL__` placeholder remain
   - Launch URL points to deployed domain, not preview

5. **Test in External LMS**
   - Upload ZIP to TalentLMS, Moodle, or similar
   - Launch the course
   - Verify redirect to your platform works

### Expected Behavior

#### Successful Launch
1. Loader displays with progress animation
2. After 3 seconds, automatic redirect to launch URL
3. User lands on your platform's course launch page

#### Error Handling
1. If URL is invalid: Error message with manual launch link
2. If JavaScript disabled: NoScript message with direct link
3. If redirect fails: 8-second fallback shows manual option

### Troubleshooting

#### URL Shows `__LAUNCH_URL__`
- **Cause**: Template replacement failed
- **Fix**: Check server logs for template loading errors

#### URL Contains "undefined"
- **Cause**: Domain detection failed
- **Fix**: Set PUBLIC_DOMAIN environment variable

#### 503 Error in LMS
- **Cause**: Using preview domain, app not deployed
- **Fix**: Deploy app to Web Service, update PUBLIC_DOMAIN

#### JavaScript Errors
- **Cause**: Malformed URL or network issues
- **Fix**: Check browser console, verify URL format

### Development Testing Commands

```bash
# Test loader template
curl "http://localhost:5000/api/test/scorm-loader" | grep LAUNCH_URL

# Check environment variables
curl "http://localhost:5000/api/dispatches/YOUR_DISPATCH_ID/export" 
# (requires authentication, check server logs for domain detection)
```

### Production Verification

1. Deploy app to Replit Web Service
2. Set PUBLIC_DOMAIN environment variable
3. Export a test SCORM package
4. Verify launch URLs point to deployed domain
5. Test upload in real LMS platform