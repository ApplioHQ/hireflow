# Agent router

Lets Claude Code and Hermes work on Applio one task at a time, sharing context through `agent_state/`.
Python 3.11+ standard library only.

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
