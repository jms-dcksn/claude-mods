# claude-mods

Two small mods for [Claude Code](https://claude.com/claude-code). Each mod is separate. Install only the mods that you want.

| Mod | What it does |
|---|---|
| `context-band` | Shows a coloured bar above the prompt. The bar shows how much of the context window is full. |
| `uip-auth-band` | Shows your UiPath CLI org, tenant, environment, and token expiry above the prompt. |

## Step 1: Add this repo as a marketplace

Do this one time. In a terminal, run:

```
claude plugin marketplace add jms-dcksn/claude-mods
```

## Step 2: Install a mod

Install each mod with its own command. Run only the lines for the mods that you want:

```
claude plugin install context-band@claude-mods
claude plugin install uip-auth-band@claude-mods
```

## Step 3: Restart Claude Code

Close Claude Code and open it again. The mods load when the session starts.

## Step 4: Use the mods

### context-band

1. Send one message. The band shows above the prompt after the first refresh.
2. Read the bar. Each colour is one part of the context, for example messages or tools. The number on the right is the percentage that is full.
3. Press **Details** to see more: the model, the autocompact point, MCP servers, memory files, skills, and agents. Press **Less** to close it.
4. Press **Hide** to remove the band. Type `/context-band` to show it again.

### uip-auth-band

This mod needs the UiPath CLI (`uip`).

1. Log in with `uip login`.
2. Look above the prompt. A green dot shows that you are logged in. Yellow shows that the token expires in less than 15 minutes. Red shows that you are logged out or that the token has expired.
3. Press **Refresh** to check again. The band also checks after each turn and after each `uip` command.
4. Press **Hide** to remove the band. Type `/uip-auth` to show it again.

### How to press a button

- Click it with the mouse, or
- Press `ctrl+x` and then `tab` to move into the band. Use `tab` or the arrow keys to select a button, then press `Enter`. Press `Esc` to go back to the prompt.

## Update or remove a mod

```
claude plugin marketplace update claude-mods
claude plugin update context-band@claude-mods
claude plugin uninstall context-band@claude-mods
```

## Try a mod from a local copy

```
git clone https://github.com/jms-dcksn/claude-mods.git
claude --plugin-dir ./claude-mods/context-band
```

To run the tests of a mod:

```
claude plugin test ./claude-mods/context-band
```
