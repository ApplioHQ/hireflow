# Agents

Chat with your coding agents across project folders. Hermes orchestrates; Claude and ChatGPT write the code.
Python 3.11+ standard library only.

```
npm run agents     # terminal interface
npm run app        # web app at http://localhost:4747 (installable from Chrome)
```

## How it works

- **Projects** are folders on your Mac, e.g. Applio (`~/Projects/hireflow-main`) and Stockbot (`~/stockbot`).
  Each one has a default coder and a check command. Add more with `/project add <folder>` or "Add project
  folder" in the app.
- **Chats** belong to a project. Every message goes to **Hermes** first:
  - questions, explanations and plans: Hermes answers itself
  - anything that needs file changes: Hermes writes a brief and hands it to the project's coder
- **Coders** (Claude, ChatGPT) work in the real project folder. Then the project's check runs; if it fails the
  coder gets one chance to fix it. For large or risky changes Hermes can ask the other coder to review.
  Hermes then reports back in the chat.
- **Fallback:** if a coder hits a usage limit or crashes, the other coder takes over.
- **Hermes never edits your project.** It works in its own copy (an instant APFS clone, refreshed before every
  turn). If it edits that copy instead of delegating, the edits are thrown away and the request goes to a coder.
- **Memory:** coders' `DECISION:` lines and your `#notes` go to the project's memory, which every agent sees.
- Follow-ups in a chat resume each agent's own session.

Projects, chats, logs, attachments and memory live in `~/.applio-agents/` (set `APPLIO_AGENTS_HOME` to move
it). Agent commands and the orchestrator setup are in `config.toml`.

Stockbot has a standing rule: never run the bot or anything that places orders, and never open `.env`. Its
check only compiles the Python files.

## Terminal interface

A Claude Code style interface: bordered input box, output streaming above it, a spinner while agents work.

- **Just type.** Your chat stays open; `/new` starts another.
- **ctrl+p** switches project. **shift+tab** cycles Hermes / Claude / ChatGPT (a coder skips Hermes).
- **`@claude` / `@chatgpt`** sends one message straight to a coder; **`@path`** attaches a repo file.
- **Files and screenshots:** drag a file in, ctrl+v pastes a clipboard screenshot, `/attach <path>`.
- **`!command`** runs a shell command in the project folder. **`#note`** saves to the project's memory.
- **`/`** opens the command menu: `/resume`, `/chats`, `/project`, `/model`, `/doctor`, `/diff`, `/memory`,
  `/review`, `/search`, `/rename`, `/pin`, `/archive`, `/export`, `/cost`.
- esc stops the agent, up/down history, ctrl+r searches history, `?` shows all shortcuts.

When input or output is piped (or with `--plain`) it uses a simple line-by-line mode with the same commands.

## Web app

Projects in the sidebar with their chats underneath, search (cmd+k), and per-project settings (default coder,
check command). Each chat shows Hermes's decision, the brief it handed over, the coder's work, check results and
Hermes's report. Panels for uncommitted changes, project memory, and agent health (logins, limits, models).

The server only listens on 127.0.0.1 and only accepts requests from its own page.

## Tests

```
python3 -m unittest agent_router/test_router.py agent_router/test_engine.py agent_router/test_server.py agent_router/test_tui.py
```

The tests use scripted fake agents and temporary folders, so they never call a real agent.
