// Turning a GitHub release body into readable "what's new" lines.
//
// Our release bodies are a mix of a fixed download table, the auto-generated
// "## What's Changed" list, and boilerplate ("Automated TVio build", the Pages
// note). Only the change lines are useful to a viewer, so everything else is
// stripped and the git/GitHub cruft ("by @user in <link>", commit hashes) is
// cleaned off what's left.

const BOILERPLATE = /automated tvio build|tvio lite|github pages|deployed automatically|full changelog|what's changed|^download\b|^for\b/i;

/** A commit-message prefix like "fix:" or "player:" — drop it for readability. */
const CONVENTIONAL_PREFIX = /^(feat|fix|chore|ci|docs|refactor|perf|style|test|build|tv|android|desktop|mobile|player|catalog|sources|now tv)(\([^)]*\))?:\s*/i;

export function cleanReleaseNotes(body: string, max = 6): string[] {
  if (!body) return [];
  return body
    .split("\n")
    .map((line) =>
      line
        // markdown bullet / quote markers
        .replace(/^[\s>*\-+]+/, "")
        // "by @user in https://…"
        .replace(/\s+by\s+@[\w-]+\s+in\s+\S+/i, "")
        // bare trailing commit/PR links
        .replace(/\(?https?:\/\/\S+\)?/g, "")
        // markdown links → their text
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(CONVENTIONAL_PREFIX, "")
        .trim()
    )
    .filter((line) => line && !line.startsWith("|") && !line.startsWith("#") && !BOILERPLATE.test(line))
    // Sentence-case the first letter so "two-stage Back" reads as a heading.
    .map((line) => line.charAt(0).toUpperCase() + line.slice(1))
    .slice(0, max);
}
