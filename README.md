# Revival Guild

> **TL;DR (EN):** A browser-game prototype about running a mercenary guild and recording what happens to individual characters over time.
> What worked: hiring, dispatch, weekly results, resources, and chronicle-style records could be implemented quickly.
> What still needs human judgment: visual storytelling, character attachment, event variety, and the difference between stored records and felt narrative. (as of 2026-04, using Codex)

`Revival Guild` is an AI-assisted browser-game concept experiment, not a finished management game.

## What This Tested

Many games treat low-rarity characters as disposable parts. This project tested the opposite idea:

> Can even weak or low-grade mercenaries gain meaning through the history of a guild?

The player is closer to a guildmaster than an action hero. Mercenaries are hired, sent on contracts, injured, remembered, and ideally become part of the guild's accumulated time.

## What Worked

- Mercenary hiring
- Party/assignment flow
- Contract dispatch
- Weekly progress
- Result text
- Gold/renown/resource changes
- Chronicle and save structure
- Browser-local playable loop

This confirmed that an AI coding agent can build the rules and record structure for a small management game quickly.

## What Did Not Work Yet

(2026-04, Codex 기준) records existed, but records alone did not become story.

The prototype needed stronger visual cues, character faces, equipment/state changes, regional differences, events, and a clearer feeling that time had passed. Without those, the game still felt close to a text web game even when the data model had the right direction.

## Main Lesson

Accumulated data is not automatically narrative.

If the goal is attachment, the system needs visible characters, meaningful events, and interfaces that make the player feel the cost of choosing efficiency over memory.

## Related Collection

This project is part of:

[AI Game Prototyping Experiments](https://github.com/rep87/ai-game-prototyping-experiments)

## Run Locally

```powershell
python -m http.server 4176
```

Then open:

```text
http://127.0.0.1:4176/index.html
```

## Status

- Prototype / concept experiment
- Not a finished game
- Code sync is not being changed in this README-only update
