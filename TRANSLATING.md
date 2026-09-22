# Adding a language

Every user-visible string lives in `src/i18n/<lang>.json`. `en.json` is the
source of truth; a translation is that file with the **same keys** and
translated values.

```bash
cp src/i18n/en.json src/i18n/de.json    # translate the values
npm run check:i18n                      # validates every language file
```

Then register it (two lines in `src/lib/i18n.tsx`):

```ts
import de from '@/i18n/de.json';
export const LANGS = { en, fa, de } as const;
```

The language switcher in the header and on the Settings page lists whatever is
in `LANGS`, using each file's `_meta.name`.

`npm run check:i18n` fails on missing keys, unknown keys, changed
`{placeholders}`, changed HTML tags, non-string values, a bad `_meta`, and
values left identical to English.

When you open the pull request, sign off your commits (`git commit -s`) — see
[CONTRIBUTING.md](CONTRIBUTING.md). It confirms the translation is yours to give
and lets the project stay dual-licensed.

---

## Prompt for a translation agent

Copy everything between the lines, replace the two `<...>` placeholders, and
give it to the agent together with the repository (or at least `src/i18n/en.json`).

---

You are translating the UI of **Claude Code Usage Dashboard**, an open-source
local web app that reads Claude Code's transcript files and shows what the
user's AI coding sessions cost and which tools, skills, MCP servers and
subagents consumed the tokens. The audience is software developers.

**Task:** create `src/i18n/<LOCALE>.json` — a translation of `src/i18n/en.json`
into **<LANGUAGE>**.

### Non-negotiable rules

1. **Keys never change.** Copy every key of `en.json` exactly, in the same
   order. Do not add, remove, rename or reorder keys. The file must contain all
   of them — no partial output, no `...`, no comments.
2. **`{placeholders}` are code.** `{cost}`, `{n}`, `{pct}`, `{model}`, `{list}`
   … must appear in the translated value with the identical spelling, and every
   placeholder that is in the English value must be in yours. You may move them
   inside the sentence to fit the grammar. Never translate the placeholder name.
3. **HTML stays intact.** Several long values contain markup:
   `<h3>`, `<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<code>`, `<pre>`, `<a
   href="…">`, `<span class="pill archived">`. Keep the same tags, the same
   nesting and the same attributes (URLs and class names are **not**
   translated). Translate only the text between the tags.
4. **Never translate technical tokens**, even inside `<code>`:
   - CLI commands and flags: `/clear`, `/compact`, `/context`, `/usage`,
     `/model`, `/effort`, `/rewind`, `/rename`, `/resume`, `/mcp`,
     `/usage-credits`, `/rate-limit-options`, `/loop`, `--resume`, `Shift+Tab`,
     `Esc`
   - settings keys and env vars: `cleanupPeriodDays`, `promptCacheTtl`,
     `subagentPromptCacheTtl`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `settings.json`,
     `CLAUDE.md`
   - file paths, model ids and code identifiers: `~/.claude/settings.json`,
     `src/lib/pricing.ts`, `claude-opus-5`, `model: haiku`, `tool_use_id`,
     `message.id`, `grep -E "FAIL|ERROR" | head -100`, `auth.ts`, `login()`
   - tool and product names: `Claude Code`, `Anthropic`, `Opus`, `Sonnet`,
     `Haiku`, `Bash`, `PowerShell`, `Read`, `Edit`, `Write`, `Grep`, `Glob`,
     `LSP`, `WebFetch`, `WebSearch`, `MCP`, `API`, `TTL`, `JSONL`
   - the ASCII diagram inside `help.intro`'s `<pre>` block: keep it **exactly**
     as it is, including line breaks and spacing. Only the sentence before and
     after it is translated.
5. **Numbers and units stay Latin/ASCII** — `$4,842.98`, `27.5%`, `1M`, `5m`,
   `1h`, `30`. Do not convert digits to another numeral system and do not
   change the decimal separator; the app formats live numbers itself.
6. **`_meta`**: set `{"name": "<endonym, e.g. Deutsch / 日本語 / 한국어>", "dir":
   "ltr"}` — use `"rtl"` only for Arabic, Hebrew, Persian or Urdu.
7. **`labels`, `prefixes`, `suffixes`** (at the end of the file) map strings
   that the *server* produces onto their translation. Keys are the English
   source strings and must be copied verbatim; translate only the values. Look
   at `fa.json` for a filled-in example. `prefixes` keys are exactly
   `"Skill /"`, `"MCP "`, `"Subagent "`, `"Subagent run: "`, `"Command "`;
   `suffixes` has exactly `" (hand-back into main context)"`. An empty `{}` is
   allowed if you prefer to leave these English, but translating them is better.

### Style

- Address the user directly and informally-professional, as a developer tool
  would. Prefer the plain form your language uses in technical documentation.
- Keep it **short**: these strings sit in table headers, tiles and buttons.
  A column header must stay roughly as short as the English one.
- Translate the *concepts*, not word by word. Domain terms that matter:
  - **cache read / cache write** — re-reading vs. first-writing the prompt
    cache. Use whatever your language's technical writing uses for caching.
  - **ingest / carry** — invented here: *ingest* is paying once to put
    something into the context, *carry* is paying again on every later call
    because it is still in the context. Pick two short, contrasting words and
    use them consistently everywhere.
  - **context** — the conversation window sent to the model, not "background".
  - **session**, **API call**, **prompt**, **subagent**, **skill**,
    **compaction**, **thinking tokens**, **effort level**.
- Be consistent: the same English term must get the same translation in every
  key (check `col.*`, `gloss.*`, `term.*` and `f.*` against each other).
- Words inside `<strong>` are emphasised on purpose — keep the emphasis on the
  equivalent part of your sentence.

### Output

Write the complete file to `src/i18n/<LOCALE>.json` (UTF-8, 2-space indent),
then run `npm run check:i18n` and fix everything it reports until it prints
`✓ <LOCALE>`. Finally add the two import/registration lines in
`src/lib/i18n.tsx`. Report which keys you were unsure about.

---

## Which languages are worth doing

Based on Anthropic's published usage data (share of total Claude usage, and the
per-capita AI Usage Index):

| Priority | Locale | Language | Why |
|---|---|---|---|
| — | `en` | English | done · US alone is 21–25% of usage |
| 1 | `ja` | Japanese | top-5 country, strongly prefers localised tooling |
| 2 | `ko` | Korean | top-5 country *and* top-5 per capita (3.7×) |
| 3 | `pt-BR` | Portuguese (Brazil) | Brazil is the #3 country |
| 4 | `fr` | French | #4 by web traffic, #2 by app downloads |
| 5 | `de` | German | #4 by app downloads |
| 6 | `es` | Spanish | large combined Spain + LatAm audience |
| 7 | `zh-TW` | Chinese (Traditional) | active Taiwan/HK developer communities |
| 8 | `id` | Indonesian | #5 by traffic, fast growth |
| 9 | `hi` | Hindi | India is #2 overall (most devs use English, so optional) |
| — | `fa` | Persian | done · RTL reference implementation |
| — | `he` | Hebrew | Israel leads per capita (4.9×); RTL already supported |

Sources: [Anthropic Economic Index — geography](https://www.anthropic.com/research/economic-index-geography),
[India country brief](https://www.anthropic.com/research/india-brief-economic-index).
