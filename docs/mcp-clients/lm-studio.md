# Connect Clippy Vision to LM Studio (fully local)

Clippy Vision captures, summarizes, and remembers everything on this computer. Connect it to a cloud MCP client and the model reading those replies sits on someone else's server. Connect it to LM Studio instead and the whole pipeline — capture, memory, and the model that answers — stays on your machine.

This page walks through that setup. You only need LM Studio installed and running; no Python knowledge required.

More background on connecting clients: [mcp.md](../mcp.md).

---

## 1. Pick a model that can call tools

Not every local model handles tool calls reliably. In LM Studio, load one of these in the **Chat** tab:

| Model | Notes |
|-------|-------|
| `qwen3:8b` | Strong tool calling, good first choice — the same model Clippy's setup wizard offers |
| `qwen3:14b` or `qwen3:32b` | Better answers if you have the RAM and VRAM |
| `llama-3.3-70b-instruct` | Good tool calling, but heavy — needs a lot of memory |

If the model ignores the Clippy tools, this is usually the reason. Download the model first if you have not already.

Two settings matter for tool calling to behave:

- **Context length**: at least 4096. Clippy's tool replies can be long.
- **Temperature**: low (around 0.1–0.2). Higher values produce malformed tool-call JSON.

---

## 2. Add Clippy Vision as an MCP server

In LM Studio, switch to the **Program** tab in the right sidebar → **Install** → **Edit mcp.json**. This opens LM Studio's `mcp.json` in its own editor.

| Platform | Path |
|----------|------|
| Windows | `%USERPROFILE%\.lmstudio\mcp.json` |
| macOS / Linux | `~/.lmstudio/mcp.json` |

Add the `clippy-vision` entry under `mcpServers`, keeping any servers already there:

```json
{
  "mcpServers": {
    "clippy-vision": {
      "command": "C:\\Users\\YOU\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
      "args": [
        "C:\\Users\\YOU\\AppData\\Local\\Programs\\Clippy Vision\\resources\\clippy\\mcp_server.py"
      ],
      "env": {
        "CLIPPY_DATA_DIR": "C:\\Users\\YOU\\AppData\\Roaming\\Clippy Vision\\data",
        "PYTHONPATH": "C:\\Users\\YOU\\AppData\\Local\\Programs\\Clippy Vision\\resources\\clippy",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1"
      }
    }
  }
}
```

Those paths are placeholders. The real ones depend on where Python and Clippy Vision are installed on your machine, and LM Studio needs absolute paths — a bare `python` on PATH is not enough. Get yours from Clippy Vision: **Settings → Connect apps → Copy JSON** produces exactly this block, built from your installation. Paste it in.

On macOS the entry uses forward slashes:

```json
{
  "mcpServers": {
    "clippy-vision": {
      "command": "/usr/bin/python3",
      "args": ["/Applications/Clippy Vision.app/Contents/Resources/clippy/mcp_server.py"],
      "env": {
        "CLIPPY_DATA_DIR": "/Users/YOU/Library/Application Support/Clippy Vision/data",
        "PYTHONPATH": "/Applications/Clippy Vision.app/Contents/Resources/clippy",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1"
      }
    }
  }
}
```

Save the file. LM Studio reloads `mcp.json` automatically and spawns the server as a separate process. When adding servers manually, copy only the contents inside `mcpServers` — do not paste the outer config Clippy shows you.

If the server fails to load, check the two paths first: the `command` must point at a Python that exists on this machine, and `args` at the `mcp_server.py` inside your Clippy Vision install.

---

## 3. Test it

Go back to the **Chat** tab with your tool-calling model loaded, and ask:

> What did I work on yesterday afternoon?

LM Studio shows a confirmation dialog the first time a model calls a tool — approve it (you can choose to always allow for this server).

A good answer names what you actually did, roughly when, and which apps were involved. Something like "you spent about two hours in VS Code working on the capture module, then about forty minutes in Chrome looking at documentation." That means the model called `search_sessions_tool` and read the reply.

If the model answers from general knowledge instead of calling a tool, it is not seeing the server — confirm `clippy-vision` appears in the **Program** tab's server list, and that the model you loaded supports tool calling.

If the tool returns nothing, check Clippy Vision's timeline: capture may have been paused, or the data may have aged past retention. The privacy redactor also withholds anything it cannot scrub — see the note below.

---

## What stays on your machine

With LM Studio, both halves of the pipeline are local:

- Capture, summarization, OCR, and the activity database run inside Clippy Vision on this computer.
- The model that answers your questions runs in LM Studio on this computer.

No tool reply leaves the machine, because there is no cloud client to send it to. Nothing needs an account, and nothing is uploaded for the setup to work.

Two things that do still happen locally worth knowing:

- The privacy redactor runs before storage **and again** on every tool reply. If it cannot finish scrubbing, the tool returns nothing rather than raw data. Screenshot file paths are never returned.
- LM Studio itself may download model weights the first time you load a model. That is a one-time fetch from the model's host, not a stream of your activity.

Connecting to a cloud client instead would send those same tool replies off the machine — that is the difference this setup removes. Full privacy behavior: [usage.md — Privacy settings](../usage.md#privacy-settings).

---

## When you are done

To disconnect, remove the `clippy-vision` block from LM Studio's `mcp.json` and save — the server unloads automatically. Clippy Vision keeps capturing; closing or disconnecting the client only stops the reading side.

More on which tools exist and what they return: [mcp.md — Tool reference](../mcp.md#tool-reference).
