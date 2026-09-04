import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextArea } from "@astryxdesign/core/TextArea";
import type { ActivityDocument, JourneyDetailDocument } from "@agentjourney/contracts";
import { api } from "../api.js";
import "./AnnotationDialog.css";

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
  const requestClose = (isOpen: boolean): void => {
    if (!isOpen && !save.isPending) props.onClose();
  };

  return (
      <Dialog
        className="agentjourney-astryx-dialog"
        isOpen
        onOpenChange={requestClose}
        purpose="form"
        width={520}
        maxHeight="92dvh"
        padding={0}
      >
        <form
          className="agentjourney-astryx-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Layout
            height="auto"
            header={(
              <DialogHeader
                title="Review annotation"
                subtitle="Evidence-anchored"
                {...(!save.isPending ? { onOpenChange: requestClose } : {})}
              />
            )}
            content={(
              <LayoutContent
                className="agentjourney-astryx-annotation-content"
                padding={4}
                isScrollable
              >
                <div className="agentjourney-astryx-annotation-activity">
                  <span>{props.activity.kind}</span>
                  <p>{props.activity.text?.slice(0, 240) ?? props.activity.nativeName ?? props.activity.evidenceAnchor}</p>
                </div>
                <CheckboxInput
                  label="Bookmark this Activity"
                  value={bookmarked}
                  onChange={setBookmarked}
                  isDisabled={save.isPending}
                  size="sm"
                  width="100%"
                />
                <TextArea
                  label="Reviewer note"
                  value={note}
                  onChange={setNote}
                  rows={6}
                  placeholder="What matters here?"
                  isDisabled={save.isPending}
                  size="sm"
                  width="100%"
                />
                {save.error && (
                  <Banner
                    status="error"
                    title="Annotation could not be saved"
                    description={save.error.message}
                    collapsible={false}
                  />
                )}
              </LayoutContent>
            )}
            footer={(
              <LayoutFooter hasDivider>
                <div className="agentjourney-astryx-actions">
                  <Button
                    label="Cancel"
                    variant="secondary"
                    size="sm"
                    onClick={() => requestClose(false)}
                    isDisabled={save.isPending}
                  />
                  <Button
                    label="Save annotation"
                    variant="primary"
                    size="sm"
                    type="submit"
                    isLoading={save.isPending}
                    isDisabled={save.isPending}
                  />
                </div>
              </LayoutFooter>
            )}
          />
        </form>
      </Dialog>
  );
}
