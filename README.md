# Voice Calendar Assistant

An AI-powered, voice-enabled Google Calendar assistant. Give it natural commands to create, update, delete, list, and add reminders to events.

## What is new

- Optional AI parsing through **Gemini** or **OpenAI**
- Create, update, delete, and list calendar events
- Automatic event lookup for update/delete commands
- Popup or email reminder overrides
- Browser speech recognition for voice input
- Browser text-to-speech confirmations
- Built-in parser fallback when no AI key is configured

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000` and connect Google Calendar.

## Google setup

In Google Cloud Console, enable Google Calendar API, create OAuth credentials, and add this redirect URI:

`http://localhost:3000/oauth2callback`

Put the client ID and secret in `.env`. Keep `.env` and `tokens.json` private.

## AI setup

Choose one provider in `.env`:

### Gemini

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.0-flash
```

### OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
```

If the selected provider is unavailable, the app automatically uses its local parser.

## Example commands

- `Schedule a project review tomorrow at 3 PM for 45 minutes`
- `Remind me about the dentist appointment 30 minutes before`
- `Move my dentist appointment to Friday at 4 PM`
- `Delete my team meeting`
- `What's on my calendar this week?`

Voice recognition is supported by Chromium-based browsers such as Chrome and Edge. AI keys are optional, but recommended for the most natural command understanding.
