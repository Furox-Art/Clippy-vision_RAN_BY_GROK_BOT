# Grok Bot Roadmap

Prioritized improvement plan for the Clippy-vision_RAN_BY_GROK_BOT experimental fork.

**Goals:**
1. Make Clippy Vision more useful (features, accuracy, reliability)
2. Make it more efficient (speed, resource usage, battery life)
3. Make it easier to adopt (onboarding, installers, docs, Linux support)

**Base:** v2.0.0 from upstream [protocorn/clippy-vision](https://github.com/protocorn/clippy-vision)

---

## Priority 1: Critical Gaps

### 1.1 Linux Support

**Problem:** Clippy Vision only runs on Windows and macOS. Linux users cannot use the app at all, despite Linux being popular among developers and privacy-conscious users.

**Rationale:** Broadens the user base significantly. Linux support would make Clippy accessible to developers, self-hosters, and users who prefer open-source operating systems. The core Python capture/summarization logic is already platform-agnostic; the main work is integrating Linux accessibility APIs and packaging.

**Effort:** Large (4-6 weeks for a human contributor, or 20-30 focused sessions for an AI agent)
- Implement X11 and Wayland screen capture (choice based on session type)
- Integrate AT-SPI (Assistive Technology Service Provider Interface) for accessibility text
- Add Linux-specific window metadata, clipboard, and keyboard capture
- Create AppImage, .deb, and .rpm packaging
- Test on Ubuntu, Fedora, Arch (popular distros)

**Components to change:**
- `core/platform_support.py` - add Linux detection and platform-specific imports
- `core/accessibility_text.py` - add AT-SPI integration
- New `core/linux_ui.py` - AT-SPI implementation (parallel to `mac_ui.py`)
- `core/screen_capture.py` - X11/Wayland screenshot selection
- `electron-ui/electron/lib/setup.js` - Linux Python/Ollama install steps
- `.github/workflows/release.yml` - add Linux build job
- `README.md`, `docs/usage.md` - Linux install instructions

**Dependencies:** python-xlib (X11), pywayland (Wayland), python-atspi (AT-SPI), packaging tools (AppImageTool, fpm)

---

### 1.2 Signed Installers

**Problem:** Unsigned installers trigger OS warnings (Windows SmartScreen, macOS Gatekeeper). Users see "Unknown publisher" and "This app could harm your computer." Many abandon the install. Right-click workarounds feel sketchy.

**Rationale:** Reduces install friction and builds trust. Code signing certificates are standard for production software. Even a self-signed cert (macOS) or EV cert (Windows) would improve UX significantly. Currently one of the top user complaints.

**Effort:** Medium (1-2 weeks for cert procurement + CI integration)
- Obtain code signing certificate:
  - Windows: EV certificate (~$300-500/year, requires hardware token)
  - macOS: Apple Developer Program ($99/year) + signing workflow
- Update `electron-builder` config in `electron-ui/package.json`
- Add signing secrets to GitHub Actions
- Update `.github/workflows/release.yml` to sign before upload
- Test signed installers on clean VMs

**Cost:** ~$400-600/year (Windows EV + macOS Apple Developer)

**Components to change:**
- `electron-ui/package.json` - `build.win.signingHashAlgorithms`, `build.mac.identity`
- `.github/workflows/release.yml` - add signing steps, secrets
- `README.md` - remove "unsigned" warnings, update install instructions

**Alternative:** Self-signed macOS cert (free, but still requires right-click), Authenticode for Windows (cheaper than EV but SmartScreen still triggers for low-reputation publishers)

---

### 1.3 Built-in Chat UI (Local Agent)

**Problem:** v2.0.0 removed in-app chat. Now requires external MCP client (Cursor, Claude Desktop, VS Code). High onboarding friction: install Clippy, install MCP client, copy JSON config, restart client. Non-technical users struggle. MCP is powerful but not beginner-friendly.

**Rationale:** Restore self-contained UX. Let users ask questions about their activity without installing a second app. Reduces adoption barrier significantly. Especially valuable for users who just want memory search, not a full IDE.

**Effort:** Medium (2-3 weeks)
- Resurrect archived in-app chat UI (`archive/in_app_chat/`)
- Update API endpoints (`/chat`, `/chat/stream` currently return MCP guidance)
- Wire to existing `agent/retrieval.py` and `agent/memory.py`
- Keep MCP tools as primary interface (chat is convenience layer)
- Add opt-in telemetry to measure chat vs MCP usage

**Components to change:**
- `electron-ui/src/index.html`, `src/js/app.js` - restore chat pane
- `archive/in_app_chat/*` - extract, modernize, re-integrate
- `api_server.py` - remove stub responses, wire to agent
- `core/app_settings.py` - add `chat_enabled` toggle (default on)
- `README.md`, `docs/usage.md` - document chat UI and MCP as complementary

**Trade-off:** Adds maintenance burden (UI code, agent logic duplication), but lowers adoption barrier. Could make chat read-only (no conversation state) to keep scope small.

---

## Priority 2: Performance & Efficiency

### 2.1 Reduce Resource Usage

**Problem:** Clippy runs continuously, polls foreground window, spawns background workers. Anecdotal reports of memory growth over days. No published CPU/memory benchmarks. Battery impact unknown.

**Rationale:** Background apps should be lightweight. High resource usage drives users to disable capture or uninstall. Profiling and optimization could double battery life on laptops and reduce RAM footprint by 30-50%.

**Effort:** Medium (2-3 weeks profiling, optimization, testing)
- Profile long-running capture process (memory_profiler, py-spy)
- Identify leaks (likely in event/screenshot buffers, LLM response caching)
- Optimize accessibility worker throttling (`core/uia_worker.py`)
- Reduce Ollama idle overhead (unload models after 10 min idle)
- Benchmark before/after: CPU%, RAM, battery drain

**Components to change:**
- `core/screen_capture.py` - tighten event loop, reduce allocations
- `core/uia_worker.py` - improve queue management, timeout tuning
- `core/screenshot_scheduler.py` - smarter idle detection (OS last-input API already used, but could tune thresholds)
- `core/model_residency.py` - add model unload logic
- `core/performance_metrics.py` - add benchmark mode

**Metrics to track:**
- Idle CPU% (target <1%)
- Active capture CPU% (target <5%)
- RAM (target <300 MB baseline, <500 MB under load)
- Battery drain (target <5% additional per hour on laptop)

---

### 2.2 Faster Summarization

**Problem:** Summarizer wakes every 60 seconds, waits for Ollama chat model. Perceived as slow when reviewing timeline or asking questions shortly after an activity. Backlog can grow during heavy typing sessions.

**Rationale:** Faster summaries = better UX. Near-instant timeline updates feel snappier. Smaller batch sizes reduce per-summary latency.

**Effort:** Small-medium (1-2 weeks)
- Tune summarizer interval (60s → 30s or adaptive based on activity)
- Batch small windows (2-5 events) separately from large ones (20+ events)
- Cache frequent LLM prompts (e.g., empty/idle screen verdicts)
- Experiment with smaller/faster models (qwen2.5:3b, gemma2:2b) for summaries
- Measure P50/P95 summary latency before/after

**Components to change:**
- `core/summarizer.py` - adaptive interval, batching logic
- `core/llm_gateway.py` - add response cache (TTL 5 min)
- `core/chat_model.py` - allow separate summary_model override
- `docs/usage.md` - document model selection trade-offs

**Trade-off:** Smaller models = faster but less accurate summaries. Cache = staleness risk. Shorter interval = more CPU. Needs experimentation.

---

### 2.3 Smarter Screenshot Scheduling

**Problem:** Screenshot scheduler is adaptive but opaque. No user control over frequency. Heavy typing sessions can capture 100+ screenshots/hour. Storage grows fast.

**Rationale:** Let users tune screenshot aggressiveness. Power users might want every window change; privacy-conscious users might want manual-only. Adaptive defaults stay, but expose knobs for advanced users.

**Effort:** Small (1 week)
- Add settings: screenshot_mode (adaptive | frequent | minimal | manual)
- Expose `min_gap_seconds`, `activity_debounce_seconds` in UI
- Add "Force screenshot now" button (already in capture, wire to UI)
- Document trade-offs (storage vs granularity)

**Components to change:**
- `core/app_settings.py` - add `screenshot_mode`, validate ranges
- `core/screenshot_scheduler.py` - read mode, adjust thresholds
- `electron-ui/src/js/app.js` - add settings pane controls
- `api_server.py` - expose mode in `/settings/capture` endpoint

---

## Priority 3: Privacy & Security

### 3.1 Improve Privacy Redaction

**Problem:** Password fields sometimes missed (heuristics fail). Private browsing only covers Chrome, Edge, Brave (not Firefox, Opera, Safari). Secret regex patterns may not catch all tokens.

**Rationale:** Privacy is a core principle. Current "best-effort" disclaimer undermines trust. Better detection = fewer accidental leaks.

**Effort:** Medium (2 weeks)
- Expand private browsing detection:
  - Firefox: `about:privatebrowsing` window title, `MOZ_CRASHREPORTER_RESTART_ARG_1` env
  - Safari: `NSPrivateBrowsing` window property (macOS)
  - Opera: similar to Chrome (private flag in command line)
- Improve password field detection:
  - Add fuzzy field name matching ("pwd", "secret", "passphrase")
  - Check `autocomplete="new-password"` attribute (web forms)
- Expand secret patterns:
  - Add OpenAI, Anthropic, GitHub, AWS key formats
  - Token entropy threshold (>128 bits)
- User-defined redaction rules (regex, keyword blacklist)

**Components to change:**
- `core/private_windows.py` - add Firefox, Safari, Opera
- `core/secret_fields.py` - improve heuristics, add fuzzy matching
- `core/secret_patterns.py` - expand regex patterns, entropy check
- `core/app_settings.py` - add `custom_redaction_rules`
- `electron-ui/src/js/app.js` - settings UI for custom rules
- Tests: `tests/test_private_windows.py`, `tests/test_secret_fields.py`

**Verification:** Create test suite with known password fields, private windows, and secrets. Measure detection rate before/after (target >95%).

---

### 3.2 Privacy Dashboard

**Problem:** Users don't know what Clippy captured or shared. No visibility into what MCP tools returned to cloud clients. "Black box" perception undermines trust.

**Rationale:** Transparency builds trust. Show users exactly what was captured, what was redacted, and what left the machine (MCP tool replies). Let them audit and delete.

**Effort:** Medium (2-3 weeks)
- Add `/privacy/audit` endpoint - recent captures, redactions, MCP replies
- Electron UI: new "Privacy Audit" tab
  - Timeline of captures with redaction overlay
  - List of MCP tool calls (timestamp, tool name, sanitized query)
  - "Delete all data before <date>" button
- Optional: export audit log as JSON

**Components to change:**
- `core/storage.py` - add `mcp_audit_log` table (timestamp, tool, query_hash, reply_size)
- `mcp_server.py` - log tool calls to audit table
- `api_server.py` - add `/privacy/audit` endpoint
- `electron-ui/src/js/app.js` - new privacy audit tab
- `README.md`, `docs/usage.md` - document privacy audit features

---

## Priority 4: Onboarding & Documentation

### 4.1 Interactive Setup Wizard Improvements

**Problem:** Current setup wizard checks Python, Ollama, RAM/VRAM, and downloads models. But errors are cryptic. Users hit "Install Python" button and nothing happens (no progress bar, no logs). Ollama model pull can take 10 min with no feedback.

**Rationale:** First-run experience is critical. Smooth setup = higher conversion. Current wizard feels broken when downloads stall.

**Effort:** Small-medium (1-2 weeks)
- Add progress bars for Python install, Ollama install, model downloads
- Stream Ollama pull progress (`ollama pull --stream`)
- Better error messages ("Python install failed: <reason>", not "Setup failed: 1")
- Pre-flight checks: disk space (8 GB free), internet connection, firewall ports
- Retry logic for transient failures (model download timeout)

**Components to change:**
- `electron-ui/electron/lib/setup.js` - add progress streaming, retry logic
- `electron-ui/src/index.html` (setup window) - progress bars, status text
- `core/model_download.py` - stream Hugging Face download progress
- `core/ollama_client.py` - parse Ollama pull progress JSON
- `docs/usage.md` - troubleshooting section for common setup failures

---

### 4.2 Video Walkthroughs & Docs

**Problem:** Text docs are dense. No video demos. Users don't understand MCP setup or what Clippy does until they've installed and used it.

**Rationale:** Video > text for onboarding. 2-minute demo shows value instantly. MCP config copy-paste is confusing; video makes it obvious.

**Effort:** Small (1 week to record, edit, upload)
- Record 3 videos:
  1. "What is Clippy Vision?" (2 min: capture, timeline, memory search)
  2. "Setup walkthrough" (5 min: install, wizard, first capture)
  3. "MCP setup" (3 min: Cursor/Claude Desktop config, first question)
- Upload to YouTube, embed in README
- Add video links to setup wizard ("Watch setup video")

**Components to change:**
- `README.md` - embed videos
- `docs/usage.md` - link videos in relevant sections
- `electron-ui/src/index.html` (setup window) - "Watch setup video" button
- Website (if created): video landing page

**Tools:** OBS Studio (screen recording), DaVinci Resolve (editing, free), YouTube (hosting)

---

### 4.3 Expand MCP Client Docs

**Problem:** README lists 10+ MCP clients (Cursor, Claude Desktop, VS Code, Devin, Cline, Roo Code, JetBrains, Kiro, LM Studio, Continue) but only links to their generic docs. No Clippy-specific instructions per client. Users copy JSON config but don't know where to paste it.

**Rationale:** Lower friction. Step-by-step per-client guides reduce support burden.

**Effort:** Small (1 week to write, test, screenshot)
- Create `docs/mcp-clients/` directory
- One guide per client: `cursor.md`, `claude-desktop.md`, `vscode.md`, etc.
- Each guide: 5-10 screenshots, 100-200 word step-by-step
- Link from README and Settings → Connect apps

**Components to change:**
- New `docs/mcp-clients/*.md` - per-client guides
- `README.md` - link to guides
- `electron-ui/src/js/app.js` (Connect apps modal) - link to relevant guide

**Testing:** Fresh install of each client, follow own guide, iterate until frictionless

---

## Priority 5: Long-term Vision

### 5.1 Audio Capture & Meeting Transcription

**Problem:** Clippy captures screen and typing but not speech. Meetings, calls, and voice notes are invisible. Users manually note "talked to X about Y" or lose context.

**Rationale:** Audio = missing 30-50% of work context. Local transcription (faster-whisper, whisper.cpp) keeps privacy promise. No cloud APIs, no meeting bots.

**Effort:** Large (4-6 weeks)
- Integrate faster-whisper or whisper.cpp (CPU-only, no GPU competition)
- Capture system audio (loopback) + microphone
  - Windows: WASAPI loopback + WaveIn
  - macOS: ScreenCaptureKit audio + AVFoundation (requires user permission)
  - Linux: PulseAudio loopback + ALSA
- Speaker attribution:
  - Phase 1: audio source (mic = user, loopback = others)
  - Phase 2: voiceprint embedding (one-time enrollment, then per-segment matching)
- Store transcripts as `audio_segment` events
- Summarizer includes audio context

**Components to change:**
- New `core/audio_capture.py` - platform-specific audio capture
- New `core/transcription.py` - faster-whisper integration
- `core/storage.py` - add `audio_segment` event type
- `core/summarizer.py` - merge audio + screen events
- `electron-ui/electron/main.js` - request audio permissions
- `requirements.txt` - add `faster-whisper` or `whisper.cpp` bindings

**Dependencies:** faster-whisper (~1 GB model download), audio libraries (sounddevice, pyaudio, or platform APIs)

**Privacy:** Audio capture is **opt-in**, separate toggle from screen capture. Transcripts stored locally, never sent to cloud. Users can exclude apps (e.g., don't transcribe Zoom if they don't want meeting memory).

---

### 5.2 Proactive Assistance (Skills System)

**Problem:** Clippy is purely reactive. Users ask questions; Clippy answers. But it could notice patterns and take action: "You watched a 2-hour tutorial. Want me to quiz you?" or "You've opened this file 10 times today. Should I summarize it?"

**Rationale:** Proactive = higher value. Transforms Clippy from search tool to assistant. Already prototyped on upstream `feat/skills-ui` branch.

**Effort:** Large (6-8 weeks to stabilize and polish)
- Port `feat/skills-ui` branch:
  - Skill 1: Reading/watching mode (quiz afterward)
  - Skill 2: Pattern triggers ("when you see X, do Y")
- Skill registry, UI for enable/disable
- Alert system (notifications, tray icon badge)
- Worker lifecycle (skills run in background, don't block capture)

**Components to change:**
- Merge `feat/skills-ui` branch (branched off main before v2.0.0)
- New `core/skills/` - skill definitions, registry, execution engine
- `core/storage.py` - add `skill_alerts` table
- `electron-ui/src/js/app.js` - new Skills settings tab, notification handler
- `README.md`, `docs/usage.md` - document skills

**Example skills:**
- **Quiz mode:** "You watched a YouTube tutorial for 90 minutes. Answer these 5 questions to check retention."
- **Pattern alert:** "You've opened `report.md` 10 times. Want me to summarize it?"
- **Habit tracking:** "You've spent 3 hours on Twitter today. Set a limit?"

**Trade-off:** Skills add complexity. Start with 2-3 high-value skills, iterate based on feedback.

---

### 5.3 Cloud Model Providers (Opt-in)

**Problem:** Local Ollama models are slow (~2-5 sec per summary). Power users with fast hardware are fine; budget laptops struggle. Users who trust cloud providers (OpenAI, Anthropic, Google) have no way to opt in.

**Rationale:** Speed matters. Cloud APIs = 10-50x faster summaries. User choice: privacy (local) or speed (cloud). Clear warnings about what leaves the machine.

**Effort:** Medium-large (3-4 weeks)
- Add opt-in cloud provider settings:
  - OpenAI (GPT-4o, GPT-4o-mini)
  - Anthropic (Claude Sonnet, Haiku)
  - Google (Gemini)
  - OpenRouter (any model)
- API key management (stored in system keychain, not plaintext)
- Route summarization, classification, distillation to cloud model if enabled
- Privacy audit: log what data was sent to which provider
- Big warning modal: "Cloud models see screen text, clipboard, window titles. Keep local if unsure."

**Components to change:**
- New `core/cloud_models.py` - API clients for OpenAI, Anthropic, Google
- `core/app_settings.py` - add `cloud_provider`, `cloud_model`, `cloud_api_key`
- `core/llm_gateway.py` - route to cloud or local based on settings
- `electron-ui/src/js/app.js` - settings UI with warning modal
- `README.md`, `docs/usage.md` - document cloud provider setup

**Privacy implications:** Screen text, clipboard, window titles sent to cloud. User must consent. MCP tools always scrubbed regardless (existing `cloud_egress.py` logic).

---

## Candidate GitHub Issues

Below are 6-10 concrete issues that could be opened to track the roadmap. Mark **good first issue** for newcomer-friendly tasks.

---

### Issue 1: Add Linux support (AT-SPI, X11/Wayland)

**Title:** Add Linux support for screen capture and accessibility text

**Labels:** `enhancement`, `platform`, `help wanted`

**Body:**
Clippy Vision currently only supports Windows and macOS. Linux users cannot run the app.

**Task:** Implement Linux screen capture (X11/Wayland), accessibility text (AT-SPI), and packaging (AppImage, .deb, .rpm).

**Subtasks:**
- [ ] Add X11 screenshot capture (`python-xlib`)
- [ ] Add Wayland screenshot capture (`pywayland`)
- [ ] Integrate AT-SPI for accessibility text (`python-atspi`)
- [ ] Update `core/platform_support.py` to detect Linux
- [ ] Add Linux-specific clipboard and keyboard capture
- [ ] Create AppImage, .deb, .rpm builds
- [ ] Test on Ubuntu 22.04, Fedora 39, Arch

**Acceptance criteria:**
- Capture process runs on Linux and stores events
- Accessibility text extracted from foreground windows
- Installer builds and installs on Ubuntu, Fedora, Arch
- README updated with Linux install instructions

**Difficulty:** Large, 4-6 weeks, requires Linux system APIs knowledge

---

### Issue 2: Sign installers to remove OS warnings 🟢 **good first issue** (CI/config only)

**Title:** Sign Windows and macOS installers to eliminate security warnings

**Labels:** `enhancement`, `distribution`, `good first issue`

**Body:**
Unsigned installers trigger Windows SmartScreen and macOS Gatekeeper warnings. Users see "Unknown publisher" and must right-click to bypass. This reduces trust and conversion.

**Task:** Obtain code signing certificates and integrate signing into CI.

**Subtasks:**
- [ ] Obtain Windows EV code signing certificate (~$300-500/year)
- [ ] Enroll in Apple Developer Program ($99/year)
- [ ] Update `electron-ui/package.json` with signing config
- [ ] Add signing secrets to GitHub Actions
- [ ] Update `.github/workflows/release.yml` to sign before upload
- [ ] Test signed installers on clean VMs (Windows 10/11, macOS 12+)

**Acceptance criteria:**
- Windows installer signed with EV cert (no SmartScreen warning)
- macOS installer signed and notarized (no Gatekeeper warning)
- README removes "unsigned" warnings
- CI signs on every release

**Difficulty:** Medium, 1-2 weeks, mostly procurement + CI config (no coding)

---

### Issue 3: Restore built-in chat UI for users without MCP clients

**Title:** Add built-in chat UI so Clippy works standalone

**Labels:** `enhancement`, `ui`, `help wanted`

**Body:**
v2.0.0 removed in-app chat. Now requires external MCP client (Cursor, Claude Desktop, VS Code). High onboarding friction. Users who just want memory search must install a second app.

**Task:** Restore in-app chat UI as a convenience layer. Keep MCP tools as primary interface.

**Subtasks:**
- [ ] Extract `archive/in_app_chat/` and modernize HTML/CSS
- [ ] Wire chat to `agent/retrieval.py` and `agent/memory.py`
- [ ] Update `api_server.py` to remove stub `/chat` responses
- [ ] Add settings toggle `chat_enabled` (default on)
- [ ] Update README and docs to show chat UI

**Acceptance criteria:**
- In-app chat pane renders in main window
- User can ask questions and get memory retrieval results
- MCP tools still work (chat is parallel interface, not replacement)
- Docs explain when to use chat vs MCP

**Difficulty:** Medium, 2-3 weeks, requires Electron + Python wiring

---

### Issue 4: Profile and reduce memory/CPU usage 🟢 **good first issue** (profiling)

**Title:** Profile long-running capture process and reduce resource usage

**Labels:** `performance`, `good first issue`

**Body:**
Clippy runs continuously. Anecdotal reports of memory growth over days. No published benchmarks. Users disable capture due to battery drain.

**Task:** Profile capture process, identify leaks, optimize hot paths.

**Subtasks:**
- [ ] Profile with `memory_profiler` and `py-spy` (10 min, 1 hour, 24 hours)
- [ ] Identify memory leaks (likely in event buffers, screenshot caching)
- [ ] Optimize accessibility worker throttling (`core/uia_worker.py`)
- [ ] Measure idle CPU% and RAM baseline
- [ ] Document findings in `docs/performance.md`

**Acceptance criteria:**
- Profiling report with before/after metrics (CPU%, RAM)
- At least one leak fixed or memory usage reduced by 20%+
- Benchmarks published in `docs/performance.md`

**Difficulty:** Medium, 2 weeks, good first issue for **profiling phase** (1 week), then optimization (1 week)

---

### Issue 5: Add Firefox and Safari private browsing detection

**Title:** Expand private browsing redaction to Firefox and Safari

**Labels:** `privacy`, `enhancement`, `good first issue`

**Body:**
Private browsing redaction currently covers Chrome, Edge, and Brave. Firefox, Opera, and Safari private windows are captured normally, which violates user expectations.

**Task:** Detect and black out Firefox and Safari private windows.

**Subtasks:**
- [ ] Firefox: detect `about:privatebrowsing` window title or `MOZ_CRASHREPORTER_RESTART_ARG_1` env var
- [ ] Safari: detect `NSPrivateBrowsing` window property (macOS only)
- [ ] Opera: detect similar to Chrome (private flag in command line)
- [ ] Update `core/private_windows.py` with new detections
- [ ] Add tests to `tests/test_private_windows.py`

**Acceptance criteria:**
- Firefox, Safari, Opera private windows blacked out before storage
- Tests verify detection on Windows (Firefox, Opera) and macOS (Firefox, Safari, Opera)
- Docs updated to list all supported browsers

**Difficulty:** Small-medium, 1 week, **good first issue** (clear scope, test-driven)

---

### Issue 6: Add progress bars to setup wizard

**Title:** Show progress for Python/Ollama installs and model downloads

**Labels:** `ui`, `onboarding`, `good first issue`

**Body:**
Setup wizard downloads Python, Ollama, and models (~5 GB). But no progress bars. Users think it's frozen. Ollama pull can take 10 minutes with no feedback.

**Task:** Add progress bars and status text for all downloads.

**Subtasks:**
- [ ] Stream Python installer progress (if possible, or show spinner)
- [ ] Stream Ollama installer progress (Windows: NSIS progress, macOS: dmg copy)
- [ ] Parse Ollama `pull --stream` JSON and show model download progress
- [ ] Update setup wizard HTML with progress bars (Bootstrap or native)
- [ ] Update `electron-ui/electron/lib/setup.js` to send progress to renderer

**Acceptance criteria:**
- Setup wizard shows real-time progress for Ollama model pull
- Users see % complete and estimated time
- Progress bars render correctly on Windows and macOS
- Errors show specific failure reason, not generic "Setup failed"

**Difficulty:** Small-medium, 1-2 weeks, **good first issue** (mostly UI wiring)

---

### Issue 7: Create per-client MCP setup guides with screenshots

**Title:** Write step-by-step MCP setup guides for Cursor, Claude Desktop, VS Code, etc.

**Labels:** `documentation`, `good first issue`

**Body:**
README lists 10+ MCP clients but only links to generic docs. Users copy JSON config but don't know where to paste it. Need per-client guides.

**Task:** Create `docs/mcp-clients/*.md` with 5-10 screenshots per client.

**Subtasks:**
- [ ] Write `docs/mcp-clients/cursor.md` (Cursor settings → MCP → paste JSON)
- [ ] Write `docs/mcp-clients/claude-desktop.md` (Claude Desktop config file path)
- [ ] Write `docs/mcp-clients/vscode.md` (VS Code MCP extension config)
- [ ] Write guides for Devin, Cline, Roo Code, JetBrains, Kiro, LM Studio, Continue
- [ ] Link from README and Settings → Connect apps

**Acceptance criteria:**
- One guide per major client (8+ guides total)
- Each guide: 100-200 words, 5-10 screenshots, step-by-step
- Guides tested by following on fresh client installs
- README links to guides

**Difficulty:** Small, 1 week, **good first issue** (no coding, great for non-coders or docs-focused contributors)

---

### Issue 8: Add custom redaction rules (user-defined keywords)

**Title:** Let users define custom redaction keywords and regex patterns

**Labels:** `privacy`, `enhancement`

**Body:**
Current redaction is hardcoded: password fields, private windows, secret patterns. Users cannot add custom rules like "redact windows with 'HR' in title" or "strip email addresses."

**Task:** Add user-defined redaction rules in Settings.

**Subtasks:**
- [ ] Add `custom_redaction_rules` to `core/app_settings.py` (JSON array of `{type: "keyword" | "regex", pattern: "..."}`)
- [ ] Update `core/cloud_egress.py` to apply custom rules
- [ ] Add Settings UI for managing rules (add, edit, delete)
- [ ] Show preview: "This text would be redacted: ████"
- [ ] Document in `docs/usage.md`

**Acceptance criteria:**
- Users can add keyword and regex redaction rules
- Rules applied to all screen text, clipboard, window titles
- Settings UI shows rule list with add/edit/delete buttons
- Preview shows before/after redaction

**Difficulty:** Medium, 2 weeks

---

### Issue 9: Add audio capture and meeting transcription (faster-whisper)

**Title:** Capture and transcribe audio (meetings, calls, voice notes)

**Labels:** `enhancement`, `audio`, `privacy`, `help wanted`

**Body:**
Clippy captures screen and typing but not speech. Meetings, calls, and voice notes are invisible. Users lose context or manually note "talked to X about Y."

**Task:** Add local audio capture and transcription (faster-whisper, no cloud APIs).

**Subtasks:**
- [ ] Integrate faster-whisper (CPU-only, ~1 GB model)
- [ ] Capture system audio (loopback) + microphone
  - Windows: WASAPI loopback + WaveIn
  - macOS: ScreenCaptureKit audio + AVFoundation
  - Linux: PulseAudio loopback + ALSA
- [ ] Store transcripts as `audio_segment` events
- [ ] Speaker attribution: Phase 1 (audio source), Phase 2 (voiceprint optional)
- [ ] Summarizer merges audio + screen context
- [ ] Add Settings toggle: audio capture (opt-in, separate from screen)

**Acceptance criteria:**
- Audio captured from system output and microphone
- Transcripts stored in `events` table with timestamps
- Summarizer includes audio context in session summaries
- User can exclude apps (e.g., don't transcribe Zoom)
- Docs explain privacy implications

**Difficulty:** Large, 4-6 weeks, requires audio API knowledge

---

### Issue 10: Record setup walkthrough and MCP config videos

**Title:** Create video tutorials for first-time users

**Labels:** `documentation`, `onboarding`, `good first issue`

**Body:**
Text docs are dense. No video demos. Users don't understand what Clippy does or how to set up MCP until they've already installed and struggled.

**Task:** Record and upload 3 video tutorials.

**Videos:**
1. "What is Clippy Vision?" (2 min: capture, timeline, memory search)
2. "Setup walkthrough" (5 min: install, wizard, first capture)
3. "MCP setup" (3 min: Cursor/Claude Desktop config, first question)

**Subtasks:**
- [ ] Record with OBS Studio (screen + voiceover)
- [ ] Edit with DaVinci Resolve (trim, add captions)
- [ ] Upload to YouTube (or self-host)
- [ ] Embed in README (thumbnail + link)
- [ ] Link from setup wizard ("Watch setup video" button)

**Acceptance criteria:**
- 3 videos published (2-5 min each)
- Videos embedded in README
- Setup wizard links to videos

**Difficulty:** Small, 1 week, **good first issue** (no coding, good for non-coders with video editing skills)

---

## Summary

**Top 5 roadmap items:**
1. **Linux support** - Broadens user base, requires X11/Wayland + AT-SPI integration
2. **Signed installers** - Removes OS warnings, builds trust, low code effort but requires certs
3. **Built-in chat UI** - Lowers onboarding friction, makes Clippy self-contained
4. **Performance optimization** - Reduces CPU/memory, improves battery life
5. **Privacy redaction improvements** - Expands browser coverage, custom rules, transparency dashboard

**Next steps:**
- Open issues for Priority 1 items (Linux, signed installers, chat UI)
- Profile resource usage (Issue 4) - low-hanging fruit
- Create video walkthroughs (Issue 10) - high impact, no coding

---

**Last updated:** 2026-10-10
