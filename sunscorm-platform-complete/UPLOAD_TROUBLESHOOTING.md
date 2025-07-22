# Upload Troubleshooting Guide

## Common Upload Issues on Deployed Sites

### 413 Payload Too Large Error

This error occurs when the reverse proxy or deployment platform has upload limits lower than the application server.

**NEW SOLUTION - Chunked Upload System:**

✅ **Automatic Large File Support**: Files over 100MB now use chunked upload automatically
✅ **Support for 500MB - 3GB files**: Enterprise-scale SCORM packages supported
✅ **Reliability**: 10MB chunks with retry logic and progress tracking
✅ **Production Ready**: Works on deployed sites without infrastructure changes

**How It Works:**
- Files under 100MB: Standard upload (fast)
- Files over 100MB: Automatic chunked upload with progress display
- Visual progress shows: chunks uploaded, speed, time remaining, file size

**For Replit Deployments:**
1. **Try the upload again** - chunked system should work automatically
2. **If still failing**: Check that all environment variables are set correctly
3. **Monitor progress**: The new UI shows detailed upload progress

**For Custom Deployments:**

Add to your nginx configuration:
```nginx
client_max_body_size 512M;
client_body_timeout 300s;
proxy_request_buffering off;
```

### Course Deletion Issues

**Error**: "Cannot delete course. It has active dispatches"

**Solution**: This is intentional protection. To delete a course:

1. **Go to Dispatches page**
2. **Find dispatches for this course**
3. **Click the 3-dot menu → "Disable Dispatch"**
4. **Confirm disabled status**
5. **Return to Courses page**
6. **Now you can delete the course**

This prevents accidental deletion of courses that learners are actively using.

### Course Preview Loading Issues

**Symptoms**: Continuous loading spinner, but audio plays in background

**Solution**: Fixed in latest version. The iframe loading detection now works properly.

## Testing Your Upload

1. **Start Small**: Test with a basic SCORM package under 50MB
2. **Check Browser Network Tab**: Look for specific error codes
3. **Try Different Browsers**: Sometimes browser limits apply
4. **Check Course Format**: Ensure it's a valid ZIP file

## Contact Support

If issues persist:
- Include the exact error message
- Note your file size and browser
- Specify if it's development vs deployed site