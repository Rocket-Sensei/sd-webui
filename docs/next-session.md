# Next Session Plan: Model Switch System Testing

## Overview

The model switch system has been implemented but cannot be fully tested on the current machine since stable-diffusion.cpp (sdcpp) is not installed here. This session plan outlines the steps needed to test and fix any issues on a machine with sdcpp installed.

## Prerequisites for Testing

1. Install stable-diffusion.cpp: https://github.com/leejet/stable-diffusion.cpp
2. Build or download sdcpp with server mode support
3. Have at least one model file (e.g., sd-v1-5.ckpt or a GGUF model)
4. Node.js 18+ and npm installed

## Testing Environment Setup

### 1. Install sdcpp

```bash
git clone https://github.com/leejet/stable-diffusion.cpp.git
cd stable-diffusion.cpp
cmake -B build
cmake --build build -j
```

### 2. Download a Model

Example: SD 1.5 base model
```bash
# Using HuggingFace CLI or manual download
# Place in: stable-diffusion.cpp/models/v1-5-pruned-emaonly.ckpt
```

### 3. Configure models.yml

Edit `backend/config/models.yml` to match your actual setup:

```yaml
default: sd15-base

models:
  sd15-base:
    name: "SD 1.5 Base"
    description: "Stable Diffusion 1.5 base model"
    command: "./stable-diffusion.cpp/build/bin/sd-server"
    args:
      - "-l"
      - "0.0.0.0"
      - "--models-path"
      - "./stable-diffusion.cpp/models"
      - "--model"
      - "v1-5-pruned-emaonly.ckpt"
      - "--port"
      - "1234"
    api: "http://localhost:1234/v1"
    mode: "on_demand"
    exec_mode: "server"
    port: 1234
```

## Testing Checklist

### Phase 1: Basic Setup Verification

- [ ] Start the backend server: `npm run dev:backend`
- [ ] Verify no import errors or missing dependencies
- [ ] Check that models.yml is loaded successfully
- [ ] Verify frontend build works: `npm run build`
- [ ] Start the full app: `npm run dev`

### Phase 2: Model Manager API Testing

Test each API endpoint using curl or a REST client:

```bash
# List all models
GET /api/models

# Get model details
GET /api/models/sd15-base

# Get model status (should show stopped)
GET /api/models/sd15-base/status

# Start model
POST /api/models/sd15-base/start

# Wait 5-10 seconds, then check status
GET /api/models/sd15-base/status
# Should show: { status: "running", pid: ..., port: 1234 }

# Get running models
GET /api/models/running

# Stop model
POST /api/models/sd15-base/stop

# Verify stopped
GET /api/models/sd15-base/status
```

### Phase 3: Queue Integration Testing

```bash
# Add a job to queue (should auto-start the model)
POST /api/queue/generate
{
  "prompt": "a lovely cat",
  "size": "512x512",
  "n": 1
}

# Check queue status
GET /api/queue

# Wait for completion, then check history
GET /api/generations

# View the generated image
GET /api/images/{imageId}
```

### Phase 4: Frontend UI Testing

1. **Model Selector (Header)**
   - [ ] Click dropdown to see available models
   - [ ] See model status indicator (green for running, gray for stopped)
   - [ ] Click start button - model starts
   - [ ] Wait for status to change to "running"
   - [ ] Click stop button - model stops

2. **Models Tab**
   - [ ] Navigate to Models tab
   - [ ] See table of all models
   - [ ] See status badges (On Demand/Preload, Server/CLI)
   - [ ] Click "View Details" to see full model configuration
   - [ ] Start/Stop buttons work correctly
   - [ ] Port displays for running models

3. **Queue Tab**
   - [ ] Submit a generation job
   - [ ] See job in queue with model name
   - [ ] See "Waiting for model to start..." message
   - [ ] See progress bar during generation
   - [ ] Job completes and shows in History

4. **Text to Image Tab**
   - [ ] Select different model from dropdown
   - [ ] Submit generation
   - [ ] Verify correct model was used

### Phase 5: CLI Mode Testing (if supported)

1. Update models.yml to add a CLI mode model
2. Test generation using CLI mode
3. Verify images are saved correctly

### Phase 6: Model Download Testing

1. Test HuggingFace model download
2. Verify download progress tracking
3. Verify pause/resume functionality
4. Verify downloaded files are correct

## Known Issues to Watch For

### 1. Path Issues

The `command` in models.yml may need full paths or relative paths from the backend directory. Adjust as needed.

### 2. Port Conflicts

If port 1234 is already in use, either:
- Stop the conflicting service
- Change the port in models.yml

### 3. Model File Paths

Ensure the model paths in the command args match where you actually placed the model files.

### 4. Permissions

The backend needs permission to:
- Execute the sd-server command
- Write to the output directory
- Create the database

### 5. CLI Mode Limitations

CLI mode may have limitations compared to server mode:
- No concurrent requests
- May need different arguments
- Output format may differ

## Debugging Tips

### Enable Debug Logging

Add to backend/server.js before `app.listen()`:
```javascript
if (process.env.DEBUG === '1') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}
```

Run with: `DEBUG=1 npm run dev:backend`

### Check sdcpp Logs

The server mode of sdcpp logs to stdout/stderr. These are captured by the modelManager.

### Check Process Status

```bash
# See if sdcpp process is running
ps aux | grep sd-server

# Check if port is in use
lsof -i :1234
```

### Test sdcpp Directly

```bash
# Test server mode directly
cd stable-diffusion.cpp
./build/bin/sd-server -l 0.0.0.0 --model models/v1-5-pruned-emaonly.ckpt --port 1234

# In another terminal, test generation
curl -X POST http://localhost:1234/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat", "n": 1, "size": "512x512"}'
```

## Files Modified This Session

### Backend
- `backend/services/modelManager.js` - NEW
- `backend/services/processTracker.js` - NEW
- `backend/services/cliHandler.js` - NEW
- `backend/services/modelDownloader.js` - NEW
- `backend/services/queueProcessor.js` - UPDATED for model support
- `backend/db/database.js` - UPDATED with model tables
- `backend/db/modelDownloadQueries.js` - NEW
- `backend/config/models.yml` - NEW (sample config)

### Frontend
- `frontend/src/components/ModelSelector.jsx` - NEW
- `frontend/src/components/ModelManager.jsx` - NEW
- `frontend/src/components/ModelDownload.jsx` - NEW
- `frontend/src/components/Queue.jsx` - UPDATED for model display
- `frontend/src/App.jsx` - UPDATED with Models tab and ModelSelector

### Tests
- `tests/processTracker.test.js` - NEW (28 tests, all passing)

### Documentation
- `docs/rest-api.md` - NEW
- `docs/app-structure.md` - NEW
- `docs/plan-model-switch.md` - NEW
- `docs/next-session.md` - NEW (this file)

## Success Criteria

The model switch system is working when:

1. Models can be started and stopped via API
2. Queue jobs automatically start required models
3. Images generate successfully with the correct model
4. UI shows correct model status
5. Both server and CLI modes work (if supported by model)

## Post-Session Tasks

After successful testing:

1. Update this document with actual working configuration
2. Add more example models to models.yml
3. Document any issues found and how they were resolved
4. Consider adding:
   - Model preset management
   - Model comparison feature
   - Auto-download of popular models
   - Model performance metrics

## Contact

For issues or questions, refer to the main project README or open an issue on GitHub.
