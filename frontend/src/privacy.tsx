import { useEffect, useState } from "react";
import { core, native, errorText } from "./api";
import { Button } from "./components";
import type { AIState } from "./ai-types";
export function PrivacyPanel() {
  const [data, setData] = useState<Record<string, string | number>>(),
    [error, setError] = useState("");
  const load = () => core<Record<string, string | number>>("ai.dataSummary").then(setData);
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, []);
  return (
    <section className="card">
      <h2>Privacy & Data</h2>
      <p>
        Profiles, indexed knowledge, memory and conversations stay in local SQLite storage. Relevant passages and
        enabled memory are sent with questions to the selected brain.
      </p>
      {data && (
        <dl>
          {Object.entries(data).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="muted">
        Manage deletion in My AIs. Removing knowledge copies never deletes original files. Exporting an AI package
        excludes credentials and private memory.
      </p>
      <div className="actions">
        <Button
          onClick={() => {
            if (
              confirm(
                "Permanently forget all private memories for this AI? Shared memory and conversation history remain separate.",
              )
            )
              void core("ai.memoryClear", { confirmed: true })
                .then(load)
                .catch((e) => setError(errorText(e)));
          }}
        >
          Clear current AI memories
        </Button>
        <Button
          onClick={() => {
            if (confirm("Clear conversation history for the current AI?"))
              void core("ai.clearConversations")
                .then(load)
                .catch((e) => setError(errorText(e)));
          }}
        >
          Clear current AI conversations
        </Button>
        <Button
          onClick={() =>
            void core<AIState>("ai.state")
              .then((s) => native("export_ai", { id: s.selected, includeKnowledge: true, includeData: true }))
              .catch((e) => setError(errorText(e)))
          }
        >
          Export current AI data
        </Button>
      </div>
      <p className="muted">
        Data export includes private memory and conversation text. Choose a location you trust. API keys are excluded.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
