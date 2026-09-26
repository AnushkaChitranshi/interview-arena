# Interview Arena

A real-time 2–8 player interview-preparation party game.

## Included in this prototype

- Room creation with 5-character room codes
- 2–8 players on separate devices
- Host-controlled game start
- 5/10/15-round games
- Mixed HR, behavioral, technical, situational, case, communication and guesstimate questions
- Synchronized 90-second flexible answer phase
- AI evaluation across six interview dimensions
- Player challenge phase with up to two challenges per player
- Streaks and scoring
- Round results and final leaderboard
- Heuristic fallback if no OpenAI API key is configured

## Run locally

Requires Node.js 18+.

```bash
npm install
cp .env.example .env
# Put your OpenAI API key in .env for live AI evaluation
npm start
```

Open `http://localhost:3000`.

For multiple devices on the same Wi-Fi, open the host computer's LAN address, for example:

`http://192.168.1.20:3000`

Make sure the firewall permits the port.

## AI evaluation

The server uses the OpenAI Responses API when `OPENAI_API_KEY` is available. Set `OPENAI_MODEL` if you want another compatible model. Without a key, the game still runs using a deterministic fallback evaluator.

## Important production upgrades

This is a playable prototype, not a production deployment. Before public use, add:
- persistent room/session storage
- rate limiting and input validation
- reconnect/resume support
- stronger moderation and prompt-injection defenses
- server-side anti-cheat controls
- authenticated player profiles
- richer question bank and difficulty calibration
- voice answers + transcription
- polished special-card mechanics
- HTTPS and deployment configuration
