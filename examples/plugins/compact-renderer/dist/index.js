globalThis.agentJourneyRenderer = {
  render(stage) {
    return {
      root: {
        tag: "main",
        className: "compact-custom",
        children: [
          {
            tag: "h1",
            text: `Custom Journey Stage · ${stage.title || "Untitled"}`
          },
          ...stage.activities.map((activity) => ({
            tag: "article",
            text: `[${activity.kind}] ${activity.text || activity.nativeName || ""}`,
            intent: { type: "open-evidence", activityId: activity.id }
          }))
        ]
      }
    };
  }
};
