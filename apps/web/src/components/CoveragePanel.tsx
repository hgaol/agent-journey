import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import type { JourneyDetailDocument } from "@agentjourney/contracts";

export function CoveragePanel(props: {
  journey: JourneyDetailDocument;
  onClose: () => void;
  onOpenEvidence: (evidenceAnchor: string, activityId?: string) => void;
}): React.ReactNode {
  const counts = Object.entries(
    props.journey.interpretation.coverage.dispositions.reduce<Record<string, number>>((result, item) => {
      result[item.disposition] = (result[item.disposition] ?? 0) + 1;
      return result;
    }, {})
  );
  return (
    <Dialog
      className="agentjourney-astryx-dialog agentjourney-coverage-dialog"
      isOpen
      onOpenChange={(isOpen) => { if (!isOpen) props.onClose(); }}
      purpose="info"
      width={760}
      maxHeight="92dvh"
      padding={0}
    >
      <Layout
        height="auto"
        header={(
          <DialogHeader
            title="Coverage & fidelity"
            subtitle="Interpretation provenance"
            onOpenChange={(isOpen) => { if (!isOpen) props.onClose(); }}
          />
        )}
        content={(
          <LayoutContent className="coverage-dialog-body" padding={0} isScrollable>
            <div className="coverage-meta">
              <div><span>Adapter</span><strong>{props.journey.interpretation.adapter.id}</strong><code>{props.journey.interpretation.adapter.version}</code></div>
              <div><span>Schema</span><strong>{props.journey.interpretation.schemaVersion}</strong><code>{props.journey.interpretations.find(({ id }) => id === props.journey.interpretationId)?.provenance ?? "local"}</code></div>
            </div>
            <h3>Evidence dispositions</h3>
            <div className="disposition-grid">{counts.map(([name, count]) => <div key={name}><strong>{count}</strong><span>{name}</span></div>)}</div>
            <h3>Fidelity manifest</h3>
            <dl className="manifest-list">
              <div><dt>Content kinds</dt><dd>{props.journey.stage.fidelity.contentKinds.join(", ") || "none"}</dd></div>
              <div><dt>Timed kinds</dt><dd>{props.journey.stage.fidelity.timedKinds.join(", ") || "none"}</dd></div>
              <div><dt>Delivery Traces</dt><dd>{props.journey.stage.fidelity.deliveryTraces ? "available" : "not evidenced"}</dd></div>
              <div><dt>Agent Threads</dt><dd>{props.journey.stage.fidelity.agentThreads ? "available" : "not evidenced"}</dd></div>
              <div><dt>Causal links</dt><dd>{props.journey.stage.fidelity.causalLinks ? "available" : "not evidenced"}</dd></div>
              <div><dt>Terminal stream</dt><dd>{props.journey.stage.fidelity.terminalStream ? "available" : "not evidenced"}</dd></div>
            </dl>
            {props.journey.sensitiveFindings.length > 0 && (
              <>
                <h3>Sensitive Findings (masked in presentation)</h3>
                <div className="disposition-grid">
                  {Object.entries(props.journey.sensitiveFindings.reduce<Record<string, number>>((result, finding) => {
                    result[finding.kind] = (result[finding.kind] ?? 0) + 1;
                    return result;
                  }, {})).map(([kind, count]) => <div key={kind}><strong>{count}</strong><span>{kind}</span></div>)}
                </div>
              </>
            )}
            {props.journey.interpretation.coverage.dispositions.some(({ disposition }) => disposition === "unclassified" || disposition === "malformed") && (
              <>
                <h3>Evidence requiring attention</h3>
                <div className="coverage-evidence-list">
                  {props.journey.interpretation.coverage.dispositions
                    .filter(({ disposition }) => disposition === "unclassified" || disposition === "malformed")
                    .slice(0, 50)
                    .map((item) => (
                      <button
                        key={item.evidenceAnchor}
                        onClick={() => props.onOpenEvidence(item.evidenceAnchor, item.activityIds?.[0])}
                      >
                        <span>{item.disposition}</span><code>{item.evidenceAnchor}</code><small>{item.detail}</small>
                      </button>
                    ))}
                </div>
              </>
            )}
            {props.journey.overlay.annotations.some(({ resolved }) => resolved === false) && (
              <>
                <h3>Orphaned Review Overlays</h3>
                <ul className="gap-list"><li>{props.journey.overlay.annotations.filter(({ resolved }) => resolved === false).length} annotation(s) no longer resolve to Canonical Activity. They remain anchored to Source Evidence and were not guessed.</li></ul>
              </>
            )}
            {props.journey.stage.fidelity.knownGaps.length > 0 && (
              <><h3>Known gaps</h3><ul className="gap-list">{props.journey.stage.fidelity.knownGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></>
            )}
            {props.journey.interpretation.coverage.missing.length > 0 && (
              <><h3>Missing relationships or timing</h3><ul className="gap-list">{props.journey.interpretation.coverage.missing.map((gap) => <li key={gap}>{gap}</li>)}</ul></>
            )}
          </LayoutContent>
        )}
      />
    </Dialog>
  );
}
