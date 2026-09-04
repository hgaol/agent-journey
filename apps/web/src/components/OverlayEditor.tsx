import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
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
              title="Organize this Journey"
              subtitle="Review Overlay"
              {...(!save.isPending ? { onOpenChange: requestClose } : {})}
            />
          )}
          content={(
            <LayoutContent className="agentjourney-astryx-fields" padding={4} isScrollable>
              <TextInput
                label="Display title"
                value={title}
                onChange={setTitle}
                placeholder={props.journey.interpretation.journey.title ?? "Untitled journey"}
                isDisabled={save.isPending}
                width="100%"
              />
              <TextInput
                label="Tags"
                value={tags}
                onChange={setTags}
                description="Comma-separated"
                placeholder="audit, auth, successful"
                isDisabled={save.isPending}
                width="100%"
              />
              <Selector
                label="Project"
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: "", label: "Unassigned" },
                  ...props.projects.map((project) => ({ value: project.id, label: project.name }))
                ]}
                isDisabled={save.isPending}
                width="100%"
              />
              <TextInput
                label="Or create Project"
                value={newProject}
                onChange={setNewProject}
                placeholder="Project name"
                isDisabled={save.isPending}
                width="100%"
              />
              {save.error && (
                <Banner
                  status="error"
                  title="Overlay could not be saved"
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
                  label="Save overlay"
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
