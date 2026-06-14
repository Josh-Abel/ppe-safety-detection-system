import { useState } from "react";
import ImageMode from "./components/ImageMode";
import LiveMode from "./components/LiveMode";
import ModeTabs from "./components/ModeTabs";
import VideoMode from "./components/VideoMode";

export default function App() {
  const [activeMode, setActiveMode] = useState("image");

  return (
    <div className="app">
      <header className="app-header">
        <h1>PPE Safety Detector</h1>
        <p className="subtitle">
          Upload images, videos, or use your webcam to detect helmets, vests, gloves,
          and pants.
        </p>
        <p className="prototype-banner">
          Prototype demo — not a real safety compliance system.
        </p>
      </header>

      <main className="app-main">
        <ModeTabs activeMode={activeMode} onModeChange={setActiveMode} />

        {activeMode === "image" ? <ImageMode /> : null}
        {activeMode === "video" ? <VideoMode /> : null}
        {activeMode === "live" ? <LiveMode /> : null}
      </main>
    </div>
  );
}
