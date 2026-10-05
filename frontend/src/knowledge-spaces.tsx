import { useEffect, useState } from "react";
import { core, errorText } from "./api";
import { Button, Modal } from "./components";

export type Space = {
  id: string;
  name: string;
  owner: string;
  project: string;
  files: number;
  chunks: number;
  access: string[];
};
export function SpaceManager({
  profileId,
  spaces,
  selected,
  onSelected,
  onChanged,
}: {
  profileId: string;
  spaces: Space[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [project, setProject] = useState(""),
    [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([]),
    [error, setError] = useState(""),
    [remove, setRemove] = useState<Space>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void core<{ profiles: typeof profiles }>("ai.state")
      .then((s) => setProfiles(s.profiles))
      .catch((e) => setError(errorText(e)));
  }, [profileId]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Knowledge Spaces">
      <h3>Spaces</h3>
      <p className="muted">
        Choose spaces for new files and notes. With none selected, new documents stay private to this AI.
      </p>
      <div className="builder-grid">
        {spaces.map((space) => (
          <article className="card" key={space.id}>
            <label>
              <input
                type="checkbox"
                disabled={busy || space.owner !== profileId}
                checked={selected.includes(space.id)}
                onChange={(e) =>
                  onSelected(e.target.checked ? [...selected, space.id] : selected.filter((id) => id !== space.id))
                }
              />
              {space.name}
            </label>
            <p className="muted">
              {space.files} files · {space.chunks} passages{space.project ? " · Project: " + space.project : ""}
            </p>
            <p>
              AIs with access:{" "}
              {space.access.map((id) => profiles.find((p) => p.id === id)?.name ?? "Deleted AI").join(", ")}
            </p>
            {space.owner === profileId && (
              <details>
                <summary>Manage access</summary>
                {profiles.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={space.access.includes(p.id)}
                      disabled={busy || p.id === profileId}
                      onChange={(e) =>
                        void run(() =>
                          core("ai.knowledgeSpaceAccess", {
                            profileId,
                            id: space.id,
                            profiles: e.target.checked
                              ? [...space.access, p.id]
                              : space.access.filter((id) => id !== p.id),
                          }),
                        )
                      }
                    />
                    {p.name}
                  </label>
                ))}
                <Button disabled={busy} onClick={() => setRemove(space)}>
                  Delete space
                </Button>
              </details>
            )}
          </article>
        ))}
      </div>
      <details>
        <summary>Create a space</summary>
        <label>
          Name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Project path (optional)
          <input value={project} onChange={(e) => setProject(e.target.value)} />
        </label>
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            void run(async () => {
              const created = await core<{ id: string }>("ai.knowledgeSpaceCreate", { profileId, name, project });
              onSelected([...selected, created.id]);
              setName("");
            })
          }
        >
          Create space
        </Button>
      </details>
      {error && <p role="alert">{error}</p>}
      {remove && (
        <Modal title="Delete Knowledge Space?">
          <p>
            The Knowledge index for {remove.name} will be removed. Documents still in another space remain indexed.
            Original files remain untouched.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await core("ai.knowledgeSpaceRemove", { profileId, id: remove.id, confirmed: true });
                onSelected(selected.filter((id) => id !== remove.id));
                setRemove(undefined);
              })
            }
          >
            Delete index
          </Button>
          <Button onClick={() => setRemove(undefined)}>Cancel</Button>
        </Modal>
      )}
    </section>
  );
}
