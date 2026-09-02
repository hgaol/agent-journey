import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ActivityDocument, JourneyDetailDocument } from "@agentjourney/contracts";
import { api } from "../api.js";

export function AnnotationDialog(props: {
  journey: JourneyDetailDocument;
  activity: ActivityDocument;
  onClose: () => void;
}): React.ReactNode {
  const client = useQueryClient();
  const existing = props.journey.overlay.annotations.find(({ evidenceAnchor }) => evidenceAnchor === props.activity.evidenceAnchor);
  const [bookmarked, setBookmarked] = useState(existing?.bookmarked ?? true);
  const [note, setNote] = useState(existing?.note ?? "");
  const save = useMutation({
    mutationFn: () => api.updateAnnotation(props.journey.summary.id, props.activity.evidenceAnchor, bookmarked, note.trim() || null),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["journey", props.journey.summary.id] });
      props.onClose();
    }
  });

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="small-dialog" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <header><div><p className="eyebrow">Evidence-anchored</p><h2>Review annotation</h2></div><button type="button" className="icon-button" onClick={props.onClose}>×</button></header>
        <div className="annotation-activity"><span>{props.activity.kind}</span><p>{props.activity.text?.slice(0, 240) ?? props.activity.nativeName ?? props.activity.evidenceAnchor}</p></div>
        <label className="checkbox-label"><input type="checkbox" checked={bookmarked} onChange={(event) => setBookmarked(event.target.checked)} /> Bookmark this Activity</label>
        <label>Reviewer note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={6} placeholder="What matters here?" /></label>
        {save.error && <div className="error-banner">{save.error.message}</div>}
        <footer><button type="button" className="secondary-button" onClick={props.onClose}>Cancel</button><button className="primary-button" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save annotation"}</button></footer>
      </form>
    </div>
  );
}
