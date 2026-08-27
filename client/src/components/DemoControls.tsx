type Props = {
  simulatePdfFailure: boolean;
  onToggle: (value: boolean) => void;
  busy?: boolean;
};

export function DemoControls({ simulatePdfFailure, onToggle, busy }: Props) {
  return (
    <div className="demo-controls">
      <label className="toggle">
        <input
          type="checkbox"
          checked={simulatePdfFailure}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          Simulate PDF failure
          <small>Next purchase.paid job will fail on purpose — then use Retry PDF.</small>
        </span>
      </label>
    </div>
  );
}
