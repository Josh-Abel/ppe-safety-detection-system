const MODES = [
  { id: "image", label: "Image Mode" },
  { id: "video", label: "Video Mode" },
  { id: "live", label: "Live Camera Mode" },
];

export default function ModeTabs({ activeMode, onModeChange }) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Detection modes">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={activeMode === mode.id}
          className={`mode-tab ${activeMode === mode.id ? "mode-tab--active" : ""}`}
          onClick={() => onModeChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
