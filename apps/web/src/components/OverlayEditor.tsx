import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { JourneyDetailDocument, ProjectDocument } from "@agentjourney/contracts";
import { api } from "../api.js";

export function OverlayEditor(props: {
  journey: JourneyDetailDocument;
  projects: ProjectDocument[];
  onClose: () => void;
}): React.ReactNode {
  const client = useQueryClient();
  const [title, setTitle] = useState(props.journey.overlay.displayTitle ?? "");
  const [tags, setTags] = useState(props.journey.overlay.tags.join(", "));
  const [projectId, setProjectId] = useState(props.journey.overlay.projectId ?? "");
  const [newProject, setNewProject] = useState("");

  useEffect(() => {
    setTitle(props.journey.overlay.displayTitle ?? "");
    setTags(props.journey.overlay.tags.join(", "));
    setProjectId(props.journey.overlay.projectId ?? "");
  }, [props.journey]);

  const save = useMutation({
    mutationFn: async () => {
      let resolvedProjectId = projectId || null;
      if (newProject.trim()) resolvedProjectId = (await api.createProject(newProject.trim())).id;
      return api.updateOverlay(props.journey.summary.id, {
        displayTitle: title.trim() || null,
        projectId: resolvedProjectId,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["journey", props.journey.summary.id] }),
        client.invalidateQueries({ queryKey: ["journeys"] }),
        client.invalidateQueries({ queryKey: ["projects"] })
      ]);
      props.onClose();
    }
  });

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="small-dialog" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <header><div><p className="eyebrow">Review Overlay</p><h2>Organize this Journey</h2></div><button type="button" className="icon-button" onClick={props.onClose}>×</button></header>
        <label>Display title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={props.journey.interpretation.journey.title ?? "Untitled journey"} /></label>
        <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="audit, auth, successful" /><small>Comma-separated</small></label>
        <label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Unassigned</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Or create Project<input value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="Project name" /></label>
        {save.error && <div className="error-banner">{save.error.message}</div>}
        <footer><button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button><button className="primary-button" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save overlay"}</button></footer>
      </form>
    </div>
  );
}
