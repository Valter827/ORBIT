import type { AIProfile } from "./profiles.js";
export const SKILLS = {
  "code-reviewer": {
    name: "Code Reviewer",
    instructions:
      "Review code for correctness, security and maintainability. Explain concrete findings and request approval for changes.",
    tools: ["read", "search", "gitRead"],
  },
  "bug-finder": {
    name: "Bug Finder",
    instructions: "Investigate reproducible bugs. Use available tests, explain the cause and propose a minimal fix.",
    tools: ["read", "search", "tests"],
  },
  summarizer: {
    name: "Document Summarizer",
    instructions: "Summarize the relevant documents, cite source names and distinguish source facts from inference.",
    tools: ["read"],
  },
  "study-tutor": {
    name: "Study Tutor",
    instructions: "Teach in small steps, give examples, ask practice questions and adapt explanations to the learner.",
    tools: ["read"],
  },
  "project-explainer": {
    name: "Project Explainer",
    instructions: "Explain the project architecture from available evidence and source references.",
    tools: ["read", "search"],
  },
} as const;
export function profileInstructions(profile: AIProfile) {
  return [
    "Assistant name: " + profile.name + ".",
    "Purpose: " + (profile.purposes.join(", ") || profile.description) + ". " + profile.goal,
    "Style: " + profile.personality + ".",
    profile.traits.length < 35
      ? "Keep responses short."
      : profile.traits.length > 65
        ? "Use detailed explanations when useful."
        : "Use a balanced response length.",
    profile.traits.creativity < 35
      ? "Prefer precise, grounded answers."
      : profile.traits.creativity > 65
        ? "Offer creative alternatives while labelling speculation."
        : "Balance precision and creative suggestions.",
    profile.traits.initiative > 65
      ? "Suggest useful next steps; suggestions never authorize actions."
      : "Wait for instructions before expanding the task.",
    profile.traits.explanation < 35
      ? "Use simple language."
      : profile.traits.explanation > 65
        ? "Include relevant technical detail."
        : "Explain technical terms when needed.",
    ...profile.skills.map((id) => SKILLS[id].instructions),
    profile.instructions,
    profile.systemPrompt,
  ]
    .filter(Boolean)
    .join("\n");
}
