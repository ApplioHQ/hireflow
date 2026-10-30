# Agent router

Lets Claude Code and Hermes work on Applio one task at a time, sharing context through `agent_state/`.
Python 3.11+ standard library only.

## App

```
npm run app
```

Opens http://localhost:4747: tasks on the left, one thread per task on the right. Pick Claude or Hermes,
describe a task, and watch it work. When it finishes, reply in the thread to follow up: the same agent
continues its own session (Claude Code and Hermes both support resuming), and the router checks every
turn again. Tasks started while one is running wait in a queue. Stop, Run again, Reset, the latest
handoff, the decisions log and the uncommitted diff are all one click away.

**Auto (default):** Hermes reads your message first. Questions, explanations and plans it answers
itself without changing files (no check, handoff.md untouched). Anything that needs files changed it
hands to Claude, which runs the normal coding flow. Follow-ups go through Hermes again, and each agent
resumes its own session. Answers run in a separate lane, so you can ask questions while Claude codes.
Set the two agents in `[auto]` in config.toml.

**Both (relay mode):** pick Both to have the agents work on one task together. The first agent builds;
the second reviews the diff, the check result and the handoff, then either approves (changing nothing)
or fixes problems and hands back. They alternate until one approves a passing result, up to
`relay_max_turns` in config.toml (default 4); otherwise the task is marked blocked for you. The owner
menu can swap who builds and who reviews.

To install it like a normal app, open it in Chrome and use the Install button in the sidebar (or the
install icon in the address bar). The server has to be running for the app to work; if it isn't, the
app shows how to start it. Threads are saved in `agent_state/threads/`.

The server only listens on 127.0.0.1 and only accepts requests from its own page.

## Interactive CLI

```
npm run agents
```

A terminal interface in the style of Claude Code: a bordered input box at the bottom, output streaming
above it, a spinner while agents work ("Claude working... 12s, esc to interrupt"), and a status line
showing who handles your messages.

- **Just type.** On Auto, Hermes answers questions and hands code changes to Claude. You stay in a task
  after it runs, so the next message follows up; `/new` starts another. Messages typed while an agent is
  working queue up and send when it finishes.
- **`/`** opens a command menu that filters as you type (`/resume` and `/model` open pickers).
- **`@`** attaches repo files (fuzzy search) or picks an agent: `@claude`, `@hermes`, `@both`, `@auto`.
- **Files and screenshots:** drag a file in (shows as `[Image #1]`), `ctrl+v` pastes a clipboard
  screenshot, `/attach <path>`. Big pastes collapse to `[Pasted text #1 +40 lines]`.
- **`!command`** runs a shell command in the repo. **`#note`** saves a note to `agent_state/context.md`.
- **Keys:** shift+tab switches Auto / Claude / Hermes / Both, esc stops the agent, up/down history,
  ctrl+r searches history, `\`+enter or option+enter for a new line, ctrl+c clears (twice exits),
  `?` shows all shortcuts.
- **More commands:** `/status` (logins, agents, what's running), `/cost` (estimated usage), `/review`
  (review the uncommitted diff), `/export` (save a conversation), `/diff`, `/handoff`, `/log`.

When input or output is piped (or with `--plain`) it falls back to a simple line-by-line mode with the
same commands. The CLI and the app share the same engine, threads and task list.

## One-shot commands

```
python3 agent_router/router.py --dry-run          # show the next task's prompt, change nothing
python3 agent_router/router.py                    # run the next pending task that has an owner
python3 agent_router/router.py --task T2          # run one task
python3 agent_router/router.py --task "Fix X" --agent hermes   # add a task and run it
python3 -m unittest agent_router/test_router.py   # tests (fake agents, temp repo)
```

## What one run does

1. Picks a task from `agent_state/tasks.md` (Owner must be `claude` or `hermes`, or pass `--agent`). Refuses to start if any task is `in_progress`.
2. Marks it `in_progress` and builds the prompt: shared instructions, the task, then `context.md`, `handoff.md` and `tasks.md`.
3. Runs the agent CLI from the repo root (commands in `config.toml`).
4. Runs `check_command` (syntax check of all `.js` files).
5. Pass: marks the task `done`, keeps the agent's `handoff.md` (or writes one from its output if it skipped that step).
   Fail: marks it `blocked`, writes the error into `handoff.md`, stops. No retries.
6. Writes `agent_state/log/<date>-<id>.md` with the result, files changed, output and the exact prompt sent.

Agents are told not to commit or push. Review the diff yourself, then commit.
To retry a blocked task, fix or revert its changes and set its Status back to `pending`.
