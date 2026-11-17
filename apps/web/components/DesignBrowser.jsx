"use client";

import { DESIGNS } from "@/lib/designs";
import { useEffect, useState } from "react";

const PICKED_EVENT = "studio:design-pick";

export default function DesignBrowser() {
  const [selectedDesign, setSelectedDesign] = useState(DESIGNS[0].id);
  const [isGridView, setIsGridView] = useState(true);

  const handleGridView = () => setIsGridView(true);
  const handleListView = () => setIsGridView(false);

  const pick = (designId) => {
    setSelectedDesign(designId);
    window.dispatchEvent(new CustomEvent(PICKED_EVENT, { detail: designId }));
  };

  useEffect(() => {
    const sync = (event) => setSelectedDesign(event.detail);
    window.addEventListener(PICKED_EVENT, sync);
    return () => window.removeEventListener(PICKED_EVENT, sync);
  }, []);

  const previewFor = (designId) => `/preview/new?design=${encodeURIComponent(designId)}`;

  return (
    <div className="studio-gallery">
      <div className="section-title">
        <div>
          <p className="eyebrow">Design gallery</p>
          <h2>Choose the look</h2>
        </div>
        <div className="view-toggle" role="group" aria-label="Gallery layout">
          <button
            type="button"
            aria-pressed={isGridView}
            onClick={handleGridView}
          >
            Grid
          </button>
          <button
            type="button"
            aria-pressed={!isGridView}
            onClick={handleListView}
          >
            List
          </button>
        </div>
      </div>

      {isGridView ? (
        <ul className="design-grid">
          {DESIGNS.map((design) => {
            const active = design.id === selectedDesign;
            return (
              <li key={design.id} className={`design-tile${active ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="tile-select"
                  aria-pressed={active}
                  onClick={() => pick(design.id)}
                  title={`Select ${design.name}`}
                >
                  <span className="design-preview" aria-hidden="true">
                    <iframe
                      src={`/designs/${design.id}.html`}
                      title={`${design.name} preview`}
                      loading="lazy"
                      tabIndex={-1}
                      scrolling="no"
                      style={{ width: 750, height: 600, border: 0, transform: "scale(0.3)", transformOrigin: "top left" }}
                    />
                  </span>
                  <span className="design-meta">
                    <span className="design-name-row">
                      <strong>{design.name}</strong>
                      {active ? <span className="selected-pill">Selected</span> : null}
                    </span>
                    <small>{design.id}</small>
                  </span>
                </button>
                <a
                  className="preview-link"
                  href={previewFor(design.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open full preview ↗
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="design-rows">
          {DESIGNS.map((design) => {
            const active = design.id === selectedDesign;
            return (
              <li key={design.id} className={`design-row${active ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="row-select"
                  aria-pressed={active}
                  onClick={() => pick(design.id)}
                  title={`Select ${design.name}`}
                >
                  <span className="design-thumb" aria-hidden="true">
                    <iframe
                      src={`/designs/${design.id}.html`}
                      title={`${design.name} thumbnail`}
                      loading="lazy"
                      tabIndex={-1}
                      scrolling="no"
                      style={{ width: 750, height: 600, border: 0, transform: "scale(0.128)", transformOrigin: "top left" }}
                    />
                  </span>
                  <span className="design-meta">
                    <span className="design-name-row">
                      <strong>{design.name}</strong>
                      {active ? <span className="selected-pill">Selected</span> : null}
                    </span>
                    <small>{design.id}</small>
                  </span>
                </button>
                <a
                  className="preview-link"
                  href={previewFor(design.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview ↗
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
