# OrderPulse Logo Design Concept & SVG Prompts

The OrderPulse logo is designed to reflect active purchase order signals, supplier feedback rhythm, and buyer priority follow-ups.

## 1. Visual Metaphor
- **Folder / Document Shape**: Represents Purchase Orders, shipping forms, and supplier contracts.
- **Wave / Pulse Line**: Represents the status updates, signal pulses, and buyer/planner operational heartbeat.
- **Vibrant Accent Node**: Represents active notifications, prioritized exceptions, and solved discrepancies.

## 2. Horizontal Logo Construction (SVG Code)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 32" width="160" height="32">
  <defs>
    <linearGradient id="opGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
    <style>
      .wordmark {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: -0.02em;
        fill: #f8fafc;
      }
      .tagline {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 6.5px;
        font-weight: 600;
        letter-spacing: 0.04em;
        fill: #94a3b8;
      }
    </style>
  </defs>
  <g transform="translate(6, 4)">
    <path d="M2 0h12l6 6v16c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2C0 .9.9 0 2 0z" fill="url(#opGradient)" opacity="0.15" />
    <path d="M2 0h12l6 6v16c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2C0 .9.9 0 2 0z" fill="none" stroke="url(#opGradient)" stroke-width="1.5" />
    <path d="M14 0v6h6" fill="none" stroke="url(#opGradient)" stroke-width="1.5" />
    <path d="M4 14h3l2-4l3 8l2-5.5l1.5 1.5H18" fill="none" stroke="#60a5fa" stroke-width="1.5" />
    <circle cx="17.5" cy="14" r="1.5" fill="#3b82f6" />
  </g>
  <text x="36" y="16" class="wordmark">OrderPulse</text>
  <text x="36" y="24" class="tagline">ACTION WORKBENCH</text>
</svg>
```
