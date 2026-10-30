# Ratchet architecture

Ratchet ships one plugin tree to Claude Code and Codex. `swe-loop` governs
software delivery and keeps repository diagrams on the existing Mermaid path.
`work-packages` and the `SessionStart` hook (`hooks/session-start.mjs`) provide
an always-on `.ratchet/` work-package DAG and `Unblock-with` dark-launch ledger
across multi-session and part-time work. `diagram-loop` governs explicitly
requested publication visuals and stores its run state and outputs outside the
target repository.

```mermaid
graph LR
    User(["👤 User"])
    RatchetDir[(".ratchet/work-packages.yaml")]
    RunState[("External run state")]
    Outputs[("Reviewed media")]

    subgraph plugin["Ratchet plugin"]
        Hook["SessionStart hook"]
        WP["work-packages skill"]
        Swe["swe-loop skill"]
        Mermaid["Mermaid guide"]
        Diagram["diagram-loop skill"]
        Compiler["Scene compiler"]
        Renderer["Remotion renderer"]
    end

    Hook -.->|"brief active + ready WPs"| RatchetDir
    User -.->|"multi-PR lanes"| WP
    WP -->|"maintain DAG + HD-xx"| RatchetDir
    User -.->|"software delivery"| Swe
    Swe -->|"ADR and PR diagrams"| Mermaid
    User -.->|"explicit premium request"| Diagram
    Diagram -.->|"persist phases and gates"| RunState
    Diagram -->|"validated scene"| Compiler
    Compiler -->|"compiled geometry and timing"| Renderer
    Renderer -.->|"PNG, WebM, and MP4"| Outputs

    style plugin fill:none,stroke:#5577cc,stroke-width:2px,stroke-dasharray:7 4
```

The premium renderer is private to `diagram-loop`. It does not replace or
automatically run from `swe-loop`. Both paths use fixed, reviewable inputs, but
they have separate dependency locks and output contracts.
